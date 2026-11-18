"""Voice-over generation.

Primary: ElevenLabs (eleven_v4, fallback eleven_v3), deep warm French male voice picked from the voice library.
Fallback (only if ElevenLabs is unreachable): local Piper TTS, clearly flagged as provisional.

Writes build/voice/v1..v6.wav (48 kHz mono, trimmed) and build/voice/meta.json.
The API key is never read or printed here: requests carry a placeholder header that the network proxy
replaces (on the user's server, set ELEVENLABS_API_KEY in the environment instead).
"""
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'build', 'voice')
API = 'https://api.elevenlabs.io'

LINES = [
    ('v1', 'ARICI, dans votre poche.'),
    ('v2', 'Retrouvez tous nos produits…'),
    ('v3', 'tentez votre chance à la roue du jour…'),
    ('v4', 'gagnez des points…'),
    ('v5', 'et profitez-en !'),
    ('v6', "L'application ARICI : téléchargez-la dès maintenant."),
]
FULL_TEXT = ' '.join(t for _, t in LINES)


def _key():
    return os.environ.get('ELEVENLABS_API_KEY', 'proxy-injected')


def _req(method, path, body=None, accept='application/json'):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={'xi-api-key': _key(), 'Content-Type': 'application/json', 'Accept': accept})
    with urllib.request.urlopen(r, timeout=120) as resp:
        return resp.read()


def eleven_available():
    try:
        _req('GET', '/v1/user')
        return True, ''
    except urllib.error.HTTPError as e:
        return False, e.read().decode('utf-8', 'replace')[:300]
    except Exception as e:  # network
        return False, str(e)


def find_voices(n=3):
    """Deep, warm, middle-aged French male voices from the shared library."""
    found = []
    queries = [
        dict(language='fr', gender='male', age='middle_aged', use_cases='advertisement', page_size=40),
        dict(language='fr', gender='male', age='middle_aged', page_size=40),
        dict(language='fr', gender='male', page_size=60, search='grave'),
        dict(language='fr', gender='male', page_size=60, search='deep'),
    ]
    seen = set()
    for q in queries:
        try:
            d = json.loads(_req('GET', '/v1/shared-voices?' + urllib.parse.urlencode(q)))
        except Exception:
            continue
        for v in d.get('voices', []):
            if v['voice_id'] in seen:
                continue
            seen.add(v['voice_id'])
            desc = ' '.join(str(v.get(k, '')) for k in ('name', 'description', 'descriptive', 'accent', 'use_case')).lower()
            score = 0
            for w, s in (('deep', 3), ('grave', 3), ('warm', 2), ('chaleureu', 2), ('posé', 1), ('calm', 1),
                         ('advert', 2), ('pub', 1), ('narrat', 1), ('mature', 2), ('middle', 1), ('parisian', 1),
                         ('standard', 1), ('confident', 1), ('energetic', 1)):
                if w in desc:
                    score += s
            for w in ('accent québécois', 'canadian', 'african', 'belgian', 'swiss', 'old', 'young', 'whisper', 'asmr'):
                if w in desc:
                    score -= 3
            if (v.get('accent') or '').lower() not in ('', 'standard', 'parisian', 'french', 'neutral'):
                score -= 2
            score += min(3, (v.get('cloned_by_count') or 0) / 2000)
            found.append((score, v))
    found.sort(key=lambda x: -x[0])
    return [v for _, v in found[:n]]


def add_voice(v):
    try:
        d = json.loads(_req('POST', f"/v1/voices/add/{v['public_owner_id']}/{v['voice_id']}", {'new_name': 'ARICI pub - ' + v['name'][:40]}))
        return d.get('voice_id', v['voice_id'])
    except urllib.error.HTTPError:
        return v['voice_id']


def tts(voice_id, text, model, stability=0.35):
    body = {'text': text, 'model_id': model, 'language_code': 'fr',
            'voice_settings': {'stability': stability, 'similarity_boost': 0.8, 'style': 0.25, 'use_speaker_boost': True}}
    try:
        raw = _req('POST', f'/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_192', body)
    except urllib.error.HTTPError as e:
        msg = e.read().decode('utf-8', 'replace')
        if 'stability' in msg and stability not in (0.0, 0.5, 1.0):
            return tts(voice_id, text, model, 0.5)   # v3 only accepts 0 / 0.5 / 1
        raise RuntimeError(msg[:300])
    d = json.loads(raw)
    import base64
    return base64.b64decode(d['audio_base64']), d.get('alignment')


def mp3_to_array(mp3):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', '-', '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'],
                       input=mp3, capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).copy()


def trim(x, sr=48000, thr_db=-42, pad=0.03):
    env = np.sqrt(np.convolve(x * x, np.ones(480) / 480, 'same'))
    thr = 10 ** (thr_db / 20) * max(1e-6, np.abs(x).max())
    idx = np.where(env > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * sr)); b = min(len(x), idx[-1] + int(pad * sr))
    y = x[a:b].copy()
    f = int(0.008 * sr)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y


def write_wav(path, x, sr=48000):
    import wave
    x16 = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(x16.tobytes())


def f0_median(x, sr=48000):
    hop, win = int(sr * 0.01), int(sr * 0.04)
    out = []
    for i in range(0, len(x) - win, hop):
        s = x[i:i + win] * np.hanning(win)
        if np.sqrt((s ** 2).mean()) < 0.02:
            continue
        ac = np.correlate(s, s, 'full')[win - 1:]
        lo, hi = int(sr / 300), int(sr / 60)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.4 * ac[0]:
            out.append(sr / k)
    return float(np.median(out)) if out else 0.0


def split_by_alignment(audio, alignment, sr=48000):
    """Cut the single natural take into the 6 lines using character timestamps."""
    chars = alignment['characters']
    starts = alignment['character_start_times_seconds']
    ends = alignment['character_end_times_seconds']
    text = ''.join(chars)
    segs = {}
    pos = 0
    for key, line in LINES:
        i = text.find(line[:12], pos)
        if i < 0:
            i = pos
        j = i + len(line)
        t0 = starts[i]
        t1 = ends[min(j, len(ends)) - 1]
        segs[key] = trim(audio[int(max(0, t0 - 0.06) * sr):int((t1 + 0.12) * sr)])
        pos = j
    return segs


def run_elevenlabs():
    models = []
    try:
        ms = json.loads(_req('GET', '/v1/models'))
        ids = [m['model_id'] for m in ms]
        models = [m for m in ('eleven_v4', 'eleven_v3') if m in ids] or ['eleven_v3']
    except Exception:
        models = ['eleven_v4', 'eleven_v3']
    cands = find_voices(3)
    trials = []
    for v in cands:
        vid = add_voice(v)
        for model in models:
            try:
                mp3, al = tts(vid, FULL_TEXT, model, 0.35)
            except Exception as e:
                print('tts failed', v['name'], model, e)
                continue
            a = mp3_to_array(mp3)
            trials.append(dict(name=v['name'], voice_id=vid, model=model, audio=a, alignment=al,
                               f0=f0_median(a), dur=len(a) / 48000, desc=v.get('description', '')))
            print('trial', v['name'], model, 'f0=%.0f' % trials[-1]['f0'], 'dur=%.2f' % trials[-1]['dur'])
            break
    if not trials:
        raise RuntimeError('no ElevenLabs trial succeeded')
    # keep the deepest voice whose read fits the 15-16 s script comfortably
    trials.sort(key=lambda d: (d['dur'] > 15.5, d['f0']))
    best = trials[0]
    os.makedirs(OUT, exist_ok=True)
    for tr in trials:
        write_wav(os.path.join(OUT, 'trial_%s.wav' % ''.join(ch for ch in tr['name'] if ch.isalnum())[:20]), tr['audio'])
    segs = split_by_alignment(best['audio'], best['alignment'])
    meta = dict(provider='elevenlabs', model=best['model'], voice=best['name'], voice_id=best['voice_id'],
                f0=best['f0'], trials=[{k: d[k] for k in ('name', 'model', 'f0', 'dur', 'desc')} for d in trials])
    return segs, meta


def run_piper():
    model = os.path.join(ROOT, 'voices_fallback', 'fr_FR-tom-medium.onnx')
    segs = {}
    for key, line in LINES:
        txt = (line[0].upper() + line[1:]).replace(' :', ',')
        tmp = os.path.join(OUT, f'_{key}.wav')
        subprocess.run([sys.executable, '-m', 'piper', '-m', model, '-f', tmp, '--length-scale', '0.92',
                        '--noise-scale', '0.6', '--noise-w-scale', '0.7'], input=txt.encode(), check=True,
                       capture_output=True)
        # a little deeper and warmer, formants preserved
        p = subprocess.run(['ffmpeg', '-v', 'error', '-i', tmp, '-af',
                            'rubberband=pitch=0.9:formant=preserved,aresample=48000', '-f', 'f32le', '-ac', '1', '-'],
                           capture_output=True, check=True)
        segs[key] = trim(np.frombuffer(p.stdout, np.float32).copy())
        os.remove(tmp)
    return segs, dict(provider='piper (provisional)', model='fr_FR-tom-medium', voice='Piper tom (fallback)')


def main(force=None):
    os.makedirs(OUT, exist_ok=True)
    ok, why = eleven_available()
    if force == 'piper' or not ok:
        print('ElevenLabs unavailable:', why[:160])
        segs, meta = run_piper()
    else:
        segs, meta = run_elevenlabs()
    for k, x in segs.items():
        write_wav(os.path.join(OUT, k + '.wav'), x)
    meta['durations'] = {k: round(len(x) / 48000, 3) for k, x in segs.items()}
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=2, ensure_ascii=False)
    print(json.dumps(meta, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else None)
