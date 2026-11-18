"""Pre-delivery checks: format, duration, loudness, frames per scene, spinning wheel, still end card, flyer comparison, QR."""
import io
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import font
import timeline as TL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHK = os.path.join(ROOT, 'out', 'verification')
os.makedirs(CHK, exist_ok=True)
VIDEO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'out', 'ARICI_Application_Reels.mp4')
FLYER = os.path.join(ROOT, 'ref', 'Affiche-ARICI-application-apercu.png')


def frame(t=None, n=None):
    sel = ['-ss', f'{t:.3f}'] if t is not None else []
    vf = ['-vf', f'select=eq(n\\,{n})'] if n is not None else []
    p = subprocess.run(['ffmpeg', '-v', 'error'] + sel + ['-i', VIDEO] + vf + ['-frames:v', '1', '-f', 'image2pipe',
                        '-vcodec', 'png', '-'], capture_output=True)
    return Image.open(io.BytesIO(p.stdout)).convert('RGB')


def probe():
    p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                        'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels,bit_rate,pix_fmt,profile',
                        '-show_entries', 'format=duration,size,bit_rate', '-of', 'json', VIDEO], capture_output=True, text=True)
    return json.loads(p.stdout)


def loudness():
    p = subprocess.run(['ffmpeg', '-hide_banner', '-i', VIDEO, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    s = p.stderr[p.stderr.rfind('Summary:'):]
    def grab(key):
        for line in s.splitlines():
            if line.strip().startswith(key):
                return float(line.split(':')[1].split()[0])
    return dict(I=grab('I:'), LRA=grab('LRA:'), true_peak=grab('Peak:'))


def label(im, txt):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, im.width, 34), fill=(0, 0, 0))
    d.text((8, 6), txt, fill=(255, 255, 255), font=font('inter', 20, 600))
    return im


def safe_overlay(im):
    im = im.copy()
    o = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(o)
    d.rectangle((0, 0, im.width, 250), fill=(255, 0, 0, 60))
    d.rectangle((0, im.height - 350, im.width, im.height), fill=(255, 0, 0, 60))
    d.rectangle((im.width - 120, 0, im.width, im.height), fill=(255, 0, 0, 60))
    return Image.alpha_composite(im.convert('RGBA'), o).convert('RGB')


def main():
    rep = {}
    rep['probe'] = probe()
    rep['loudness'] = loudness()
    dur = float(rep['probe']['format']['duration'])
    rep['duration_s'] = dur
    # one frame per scene + last frame
    scenes = [('1 accroche', 1.9), ('2 produits', 4.95), ('3 roulette', 8.0), ('3b gain', 9.6), ('4 points', 11.9),
              ('5 recompense', 13.85), ('5b QR en caisse', 15.12), ('6 derniere image', dur - 0.04)]
    ims = []
    for name, t in scenes:
        im = frame(t)
        im.save(os.path.join(CHK, f'scene_{name.split()[0]}_{t:.2f}s.png'))
        ims.append(label(safe_overlay(im).resize((360, 640), Image.LANCZOS), f'{name}  {t:.2f}s'))
    sheet = Image.new('RGB', (4 * 368, 2 * 648), (30, 30, 30))
    for i, im in enumerate(ims):
        sheet.paste(im, ((i % 4) * 368, (i // 4) * 648))
    sheet.save(os.path.join(CHK, 'scenes_safezones.png'))
    # spinning wheel: consecutive frames
    fr = list(range(int(TL.SPIN0 * 30) + 2, int(TL.SPIN_SETTLE * 30) + 3, 4))
    sp = []
    for n in fr:
        im = frame(n=n).crop((90, 560, 930, 1460)).resize((240, 257), Image.LANCZOS)
        sp.append(label(im, f'f{n} {n / 30:.2f}s'))
    cols = 6
    rows = (len(sp) + cols - 1) // cols
    s2 = Image.new('RGB', (cols * 244, rows * 261), (30, 30, 30))
    for i, im in enumerate(sp):
        s2.paste(im, ((i % cols) * 244, (i // cols) * 261))
    s2.save(os.path.join(CHK, 'wheel_spin_frames.png'))
    rep['wheel'] = dict(turns=TL.TURNS, peak_deg_per_s=round(TL.WHEEL_PEAK_DPS), stop_s=TL.SPIN1,
                        clicks=len(TL.wheel_click_times()), result='50 points')
    # end card stillness: compare frames from HOLD_START to the end
    nf = int(round(dur * 30))
    a = np.asarray(frame(n=int(np.ceil(TL.HOLD_START * 30)) + 1)).astype(int)
    b = np.asarray(frame(n=nf - 1)).astype(int)
    rep['end_card_still'] = dict(from_s=round(TL.HOLD_START, 2), hold_s=round(dur - TL.HOLD_START, 2),
                                 max_pixel_diff=int(np.abs(a - b).max()), mean_diff=round(float(np.abs(a - b).mean()), 3))
    # final vs flyer side by side
    last = frame(n=nf - 1)
    fl = Image.open(FLYER).convert('RGB')
    h = 1200
    fl2 = fl.resize((int(fl.width * h / fl.height), h), Image.LANCZOS)
    la = last.resize((int(1080 * h / 1920), h), Image.LANCZOS)
    cmp_ = Image.new('RGB', (fl2.width + la.width + 30, h + 40), (40, 40, 40))
    cmp_.paste(fl2, (0, 40)); cmp_.paste(la, (fl2.width + 30, 40))
    d = ImageDraw.Draw(cmp_)
    d.text((10, 8), 'Flyer', fill=(255, 255, 255), font=font('inter', 22, 600))
    d.text((fl2.width + 40, 8), 'Derniere image de la video', fill=(255, 255, 255), font=font('inter', 22, 600))
    cmp_.save(os.path.join(CHK, 'final_vs_flyer.png'))
    last.save(os.path.join(CHK, 'last_frame.png'))
    # QR on the end card must scan
    try:
        import cv2
        arr = cv2.cvtColor(np.asarray(last), cv2.COLOR_RGB2BGR)
        det = cv2.QRCodeDetector()
        val, pts, _ = det.detectAndDecode(arr[700:1500, 0:560])
        rep['end_card_qr'] = val or 'NOT DECODED'
    except Exception as e:
        rep['end_card_qr'] = f'check skipped: {e}'
    # voice timing vs scenes
    mi = json.load(open(os.path.join(ROOT, 'build', 'mix_info.json')))
    win = {'v1': (0, 2.5, 'accroche'), 'v2': (2.5, 6.0, 'produits'), 'v3': (6.0, 10.0, 'roulette'),
           'v4': (10.0, 13.0, 'points'), 'v5': (13.0, 15.5, 'profitez'), 'v6': (14.9, dur, 'derniere image')}
    vt = {}
    for k, (a0, a1, nm) in win.items():
        s0 = mi['voice_slots'][k]; s1 = s0 + mi['voice_durations'][k]
        vt[k] = dict(scene=nm, start=round(s0, 2), end=round(s1, 2), inside_scene=bool(a0 <= s0 and s1 <= a1 + 0.01))
    rep['voice'] = dict(provider=mi['voice'].get('provider'), voice=mi['voice'].get('voice'), model=mi['voice'].get('model'), lines=vt)
    json.dump(rep, open(os.path.join(CHK, 'report.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in rep.items() if k != 'probe'}, indent=1, ensure_ascii=False))
    v = [s for s in rep['probe']['streams'] if s['codec_type'] == 'video'][0]
    au = [s for s in rep['probe']['streams'] if s['codec_type'] == 'audio'][0]
    print('video', v['codec_name'], v.get('profile'), v['width'], 'x', v['height'], v['r_frame_rate'], v['pix_fmt'], v.get('nb_frames'),
          '| audio', au['codec_name'], au['sample_rate'], au['channels'], '| size', rep['probe']['format']['size'])


if __name__ == '__main__':
    main()
