"""Music (synthesised, ~120 bpm, warm/feel-good), sound effects synced to the picture, voice mix, -14 LUFS master."""
import json
import math
import os
import subprocess
import sys
import wave

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import timeline as TL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
RNG = np.random.default_rng(42)


def n_(sec):
    return int(round(sec * SR))


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def sos_f(kind, f, order=2, q=None):
    if kind == 'bp':
        return signal.butter(order, [max(20, f[0]), min(SR / 2 - 100, f[1])], 'bandpass', fs=SR, output='sos')
    return signal.butter(order, min(SR / 2 - 100, max(20, f)), kind, fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos_f(kind, f, order), x)


def expdec(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


class Bus:
    def __init__(self, dur):
        self.L = np.zeros(n_(dur) + SR)
        self.R = np.zeros(n_(dur) + SR)

    def add(self, t, x, gain=1.0, pan=0.0):
        """x mono or (2, n). pan -1..1 (equal power)."""
        i = n_(t)
        if i < 0:
            if x.ndim == 1:
                x = x[-i:]
            else:
                x = x[:, -i:]
            i = 0
        if x.ndim == 1:
            a = (pan + 1) * math.pi / 4
            l, r = x * math.cos(a), x * math.sin(a)
        else:
            l, r = x[0], x[1]
        m = min(len(l), len(self.L) - i)
        if m <= 0:
            return
        self.L[i:i + m] += l[:m] * gain
        self.R[i:i + m] += r[:m] * gain

    def stereo(self):
        return np.vstack([self.L, self.R])


# ---------------------------------------------------------------- instruments
def kick(amp=1.0):
    n = n_(0.42)
    t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.18)
    click = filt(RNG.standard_normal(n) * np.exp(-t / 0.004), 'hp', 1500) * 0.35
    return np.tanh((body + click) * 1.6) * amp * 0.9


def clap(amp=1.0):
    n = n_(0.35)
    t = np.arange(n) / SR
    nz = RNG.standard_normal(n)
    env = np.zeros(n)
    for d in (0.0, 0.011, 0.022):
        k = n_(d)
        env[k:] += np.exp(-(t[:n - k]) / 0.012)
    env += 0.5 * np.exp(-t / 0.09) * (t > 0.03)
    x = filt(nz * env, 'bp', (900, 5200))
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.4
    return (x * 0.8 + body) * amp


def hat(open_=False, amp=1.0):
    n = n_(0.28 if open_ else 0.06)
    t = np.arange(n) / SR
    x = filt(RNG.standard_normal(n), 'hp', 7000, 4) * np.exp(-t / (0.09 if open_ else 0.014))
    return x * amp * 0.6


def shaker(amp=1.0):
    n = n_(0.07)
    t = np.arange(n) / SR
    env = (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.025)
    return filt(RNG.standard_normal(n), 'bp', (4500, 11000)) * env * amp * 0.45


def crash(amp=1.0, dur=1.8):
    n = n_(dur)
    t = np.arange(n) / SR
    x = filt(RNG.standard_normal(n), 'hp', 4200, 2) * np.exp(-t / 0.6)
    x += filt(RNG.standard_normal(n), 'bp', (2500, 6000)) * np.exp(-t / 0.25) * 0.5
    return x * amp * 0.5


def bass(freq, dur, amp=1.0):
    n = n_(dur + 0.08)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.005) * np.exp(-t / 0.35) * (t < dur) + (t >= dur) * np.exp(-(t - dur) / 0.02) * np.exp(-dur / 0.35)
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t) + 0.12 * np.sin(2 * np.pi * 3 * freq * t)
    x = np.tanh(x * 1.4) * env
    return filt(x, 'lp', 900) * amp * 0.7


def epiano(freqs, dur, amp=1.0):
    n = n_(dur + 0.6)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        idx = 1.6 * np.exp(-t / 0.25) + 0.15
        mod = np.sin(2 * np.pi * f * t)
        car = np.sin(2 * np.pi * f * t + idx * mod)
        tine = np.sin(2 * np.pi * f * 7.0 * t) * np.exp(-t / 0.02) * 0.15
        env = np.minimum(1, t / 0.003) * np.exp(-t / 0.9)
        rel = np.where(t > dur, np.exp(-(t - dur) / 0.08), 1.0)
        out += (car + tine) * env * rel
    trem = 1 + 0.08 * np.sin(2 * np.pi * 5 * t)
    return out * trem * amp * 0.16


def pluck(freq, dur=0.3, amp=1.0):
    n = n_(dur + 0.5)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.28)
    x += 0.4 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t / 0.03)
    x += 0.2 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.12)
    att = filt(RNG.standard_normal(n) * np.exp(-t / 0.002), 'bp', (2000, 8000)) * 0.15
    return (x + att) * np.minimum(1, t / 0.002) * amp * 0.28


def pad(freqs, dur, amp=1.0, cutoff=1400, attack=0.25):
    n = n_(dur + 0.5)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            ph = (ff * t + RNG.random()) % 1.0
            out += (2 * ph - 1)
    out = filt(out, 'lp', cutoff, 2)
    env = np.minimum(1, t / attack) * np.where(t > dur, np.exp(-(t - dur) / 0.25), 1.0)
    return out * env * amp * 0.035


def riser(dur, amp=1.0, f0=300, f1=6000):
    n = n_(dur)
    t = np.arange(n) / SR
    x = RNG.standard_normal(n)
    out = np.zeros(n)
    seg = n_(0.02)
    for i in range(0, n, seg):
        u = i / n
        fc = f0 * (f1 / f0) ** u
        sos = sos_f('bp', (fc * 0.7, fc * 1.4))
        out[i:i + seg] = signal.sosfilt(sos, x[max(0, i - 2048):i + seg])[-len(out[i:i + seg]):]
    env = (t / dur) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(200 * (4 ** (t / dur))) / SR) * 0.15
    return (out + tone) * env * amp * 0.5


def reverb_ir(dur=1.4, damp=4500):
    n = n_(dur)
    t = np.arange(n) / SR
    l = filt(RNG.standard_normal(n), 'lp', damp) * np.exp(-t / (dur / 4.5))
    r = filt(RNG.standard_normal(n), 'lp', damp) * np.exp(-t / (dur / 4.5))
    return l / np.abs(l).sum() * 40, r / np.abs(r).sum() * 40


# ---------------------------------------------------------------- music
CH = {  # bass midi, chord midis
    'D': (38, [66, 69, 74]), 'Bm': (35, [66, 71, 74]), 'G': (43, [67, 71, 74]), 'A': (45, [64, 69, 73]),
}
BEAT = 0.5
BAR0 = 0.75       # first downbeat = logo landing


def music(dur):
    B = Bus(dur)
    rev = Bus(dur)
    # chord timeline
    ct = [(0.75, 'D'), (2.75, 'Bm'), (3.75, 'G'), (4.75, 'D'), (5.75, 'A'), (6.75, 'A'), (TL.SPIN1 - 0.05, 'D'),
          (10.75, 'Bm'), (11.75, 'G'), (12.75, 'A'), (13.25, 'D'), (14.25, 'Bm'), (14.75, 'G'), (15.25, 'A'),
          (15.98, 'D')]

    def chord_at(t):
        c = ct[0][1]
        for s, ch in ct:
            if t + 1e-6 >= s:
                c = ch
        return c

    groove = lambda t: (0.75 <= t < 6.0) or (10.75 <= t < 12.75) or (13.25 <= t < 15.3)
    light = lambda t: (6.0 <= t < 6.75) or (TL.SPIN1 <= t < 10.75) or (t >= 16.0)
    # intro riser into the logo landing
    B.add(0.0, riser(0.74, 0.8, 200, 5000), 0.6)
    rc = crash(1.0)[::-1][-n_(0.7):]
    B.add(0.04, rc * np.linspace(0, 1, len(rc)) ** 2, 0.5)
    # 16th grid
    t = 0.75
    step = 0
    while t < dur - 0.3:
        beat_pos = step % 4          # 16th index inside the beat
        beat_num = (step // 4) % 4
        ch = chord_at(t)
        bn, notes = CH[ch]
        g = groove(t)
        li = light(t)
        sw = 0.018 if beat_pos % 2 == 1 else 0.0
        if beat_pos == 0 and (g or li or (6.75 <= t < TL.SPIN1)):
            B.add(t, kick(1.0 if g else 0.8), 0.95)
        if g and beat_pos == 0 and beat_num in (1, 3):
            B.add(t, clap(0.8), 0.6, 0.05)
            rev.add(t, clap(0.8), 0.25)
        if (g or li) and beat_pos == 2:
            B.add(t + sw, hat(True, 0.7), 0.3, 0.25)
        if g and beat_pos in (1, 3):
            B.add(t + sw, hat(False, 0.5), 0.22, -0.3)
        if (g or li or 6.75 <= t < TL.SPIN1):
            B.add(t + sw, shaker(0.9 if beat_pos % 2 else 0.6), 0.26, 0.35)
        # bass pattern (8ths)
        if beat_pos % 2 == 0:
            e8 = (step // 2) % 8
            if g:
                pat = {0: 0, 2: 12, 3: 0, 5: 7, 6: 12}
                if e8 in pat:
                    B.add(t, bass(mtof(bn + pat[e8]), 0.2, 1.0), 0.75)
            elif 6.75 <= t < TL.SPIN1:
                B.add(t, bass(mtof(45 if e8 % 2 == 0 else 57), 0.18, 0.9), 0.6)
            elif li and e8 == 0:
                B.add(t, bass(mtof(bn), 0.9, 1.0), 0.6)
        # e-piano stabs
        if g and beat_pos == 2 and beat_num in (0, 1, 3):
            st = epiano([mtof(m) for m in notes], 0.16, 1.0)
            B.add(t + sw, st, 0.85, -0.15)
            rev.add(t + sw, st, 0.35)
        # hook melody (pluck) in the busy sections
        if g and beat_pos % 2 == 0 and (2.75 <= t < 5.75 or 10.75 <= t < 12.6 or 13.25 <= t < 15.2):
            e8 = (step // 2) % 16
            motif = {0: 2, 2: 4, 3: 2, 4: 1, 6: 0, 8: 2, 10: 4, 11: 5, 12: 4, 14: 2}
            scale = [62, 64, 66, 69, 71, 74, 76, 78, 81]
            if e8 in motif:
                deg = motif[e8] + (2 if ch in ('G', 'A') else 0)
                p = pluck(mtof(scale[deg] + 12), 0.25, 0.9)
                B.add(t + sw, p, 0.7, 0.3)
                rev.add(t + sw, p, 0.4)
        t += BEAT / 4
        step += 1
    # pads per chord span
    for i, (s, ch) in enumerate(ct):
        e = ct[i + 1][0] if i + 1 < len(ct) else dur
        bn, notes = CH[ch]
        cut = 900 if 6.0 <= s < TL.SPIN1 else 1500
        B.add(s, pad([mtof(m - 12) for m in notes], e - s, 1.0, cut, 0.15), 1.2)
    # spin build: snare roll accelerating + riser, into the win hit
    tt = TL.SPIN0
    while tt < TL.SPIN1 - 0.02:
        u = (tt - TL.SPIN0) / (TL.SPIN1 - TL.SPIN0)
        stp = 0.25 if u < 0.35 else 0.125 if u < 0.75 else 0.0625
        B.add(tt, clap(0.35 + 0.5 * u), 0.35 + 0.35 * u, 0.1)
        tt += stp
    B.add(TL.SPIN1 - 1.6, riser(1.6, 0.9, 300, 7000), 0.7)
    # big hits
    for ht, a in ((0.75, 1.0), (2.75, 0.7), (TL.SPIN1 - 0.05, 1.0), (10.75, 0.6), (13.25, 0.8), (15.98, 1.0)):
        B.add(ht, crash(1.0), 0.55 * a, 0.2)
        B.add(ht, kick(1.0), 0.6 * a)
        bn, notes = CH[chord_at(ht + 0.01)]
        hit = epiano([mtof(m) for m in notes] + [mtof(notes[0] - 12)], 0.6, 1.0)
        B.add(ht, hit, 0.7 * a)
        rev.add(ht, hit, 0.5 * a)
    # break before the gift + riser into the end card
    B.add(15.3, riser(0.68, 0.9, 400, 8000), 0.8)
    tt = 15.5
    while tt < 15.95:
        B.add(tt, clap(0.6), 0.45, -0.1)
        tt += 0.0625
    # end: last chord rings
    bn, notes = CH['D']
    B.add(15.98, pad([mtof(m) for m in notes] + [mtof(bn + 12)], dur - 15.98, 1.4, 2200, 0.05), 0.9)
    # reverb
    irl, irr = reverb_ir()
    wet = np.vstack([signal.fftconvolve(rev.L, irl)[:len(rev.L)], signal.fftconvolve(rev.R, irr)[:len(rev.R)]])
    out = B.stereo() + wet * 0.5
    out = signal.sosfilt(sos_f('lp', 9000, 2), out, axis=1)
    # gap before the gift lands: duck everything a bit
    return out


# ---------------------------------------------------------------- sound effects
def whoosh(dur, amp=1.0, f0=400, f1=3500, rise=0.6, pan=(-0.6, 0.6)):
    n = n_(dur)
    t = np.arange(n) / SR
    x = RNG.standard_normal(n)
    out = np.zeros(n)
    seg = n_(0.01)
    for i in range(0, n, seg):
        u = i / n
        fc = f0 * (f1 / f0) ** min(1, u / rise) if u < rise else f1 * (f0 / f1) ** ((u - rise) / (1 - rise)) * 1.0
        sos = sos_f('bp', (fc * 0.6, fc * 1.6))
        out[i:i + seg] = signal.sosfilt(sos, x[max(0, i - 1500):i + seg])[-len(out[i:i + seg]):]
    env = np.where(t < rise * dur, (t / (rise * dur)) ** 1.6, np.exp(-(t - rise * dur) / (0.25 * dur)))
    out = out * env * amp
    p = np.linspace(pan[0], pan[1], n)
    a = (p + 1) * np.pi / 4
    return np.vstack([out * np.cos(a), out * np.sin(a)]) * 1.4


def boom(amp=1.0):
    n = n_(0.9)
    t = np.arange(n) / SR
    f = 38 + 60 * np.exp(-t / 0.08)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.35)
    x += filt(RNG.standard_normal(n), 'lp', 600) * np.exp(-t / 0.08) * 0.4
    return np.tanh(x * 1.5) * amp


def thud(amp=1.0, f=85):
    n = n_(0.35)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * np.cumsum(f + 40 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.09)
    x += filt(RNG.standard_normal(n), 'bp', (200, 1500)) * np.exp(-t / 0.025) * 0.5
    return x * amp


def clack(amp=1.0):
    n = n_(0.25)
    t = np.arange(n) / SR
    x = thud(1.0, 110)[:n] * 0.8
    x += filt(RNG.standard_normal(n), 'bp', (2200, 6500)) * np.exp(-t / 0.006) * 0.9
    x += np.sin(2 * np.pi * 2900 * t) * np.exp(-t / 0.012) * 0.25
    return x * amp


def tick(freq=2600, amp=1.0, dec=0.012):
    n = n_(0.06)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t / dec)
    x += filt(RNG.standard_normal(n), 'bp', (1500, 7000)) * np.exp(-t / 0.002) * 0.6
    return x * amp


def pop(amp=1.0, f0=900, f1=250):
    n = n_(0.12)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.02)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035)
    return x * amp


def bell(freq, amp=1.0, dur=1.6):
    n = n_(dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, a, tau in ((1, 1.0, 0.7), (2.0, 0.5, 0.35), (2.76, 0.35, 0.25), (5.4, 0.2, 0.08), (8.9, 0.1, 0.04)):
        out += a * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / tau)
    return out * np.minimum(1, t / 0.001) * amp * 0.4


def sparkle(dur=0.8, amp=1.0, seed=0):
    rnd = np.random.default_rng(seed)
    n = n_(dur)
    out = np.zeros(n)
    for i in range(26):
        st = int(rnd.uniform(0, 0.7) * n)
        f = rnd.uniform(3000, 9000)
        m = n_(0.08)
        t = np.arange(m) / SR
        g = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.02) * rnd.uniform(0.3, 1)
        out[st:st + m] += g[:len(out[st:st + m])]
    return out * amp * 0.25


def beep(freq=1850, dur=0.13, amp=1.0):
    n = n_(dur + 0.02)
    t = np.arange(n) / SR
    x = np.sign(np.sin(2 * np.pi * freq * t)) * 0.5 + np.sin(2 * np.pi * freq * t) * 0.5
    x = filt(x, 'lp', 5000)
    env = np.minimum(1, t / 0.004) * np.where(t > dur, np.exp(-(t - dur) / 0.006), 1.0)
    return x * env * amp * 0.5


def whistle_drop(dur, amp=1.0):
    n = n_(dur)
    t = np.arange(n) / SR
    f = 1800 * (0.35 ** (t / dur))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t / 0.05)
    return x * amp * 0.18


def scan_sweep(dur, amp=1.0):
    n = n_(dur)
    t = np.arange(n) / SR
    f = 900 + 500 * np.sin(np.pi * t / dur)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3 + filt(RNG.standard_normal(n), 'bp', (3000, 6000)) * 0.15
    return x * np.sin(np.pi * t / dur) * amp * 0.35


def sfx(dur):
    S = Bus(dur)
    # opening: logo spins in, corners slide in, impact
    S.add(0.0, whoosh(0.74, 0.9, 250, 4200, 0.92, (-0.3, 0.3)), 0.55)
    S.add(TL.S1 + 0.72, boom(1.0), 0.5)
    S.add(0.72, clack(0.6), 0.25)
    # caption words
    for tw in (0.76, 0.84, 0.92, 1.18, 1.26, 1.34):
        S.add(tw, pop(0.25, 1200, 500), 0.3, 0.1)
    # whip to products + phone landing
    S.add(2.18, whoosh(0.45, 1.0, 300, 5000, 0.55, (0.5, -0.5)), 0.95)
    S.add(2.8, thud(1.0, 80), 0.7)
    S.add(2.8, clack(0.5), 0.35)
    # scrolling swish
    S.add(2.95, whoosh(1.25, 0.45, 1200, 6000, 0.45, (-0.2, 0.2)), 0.55)
    S.add(4.18, tick(1800, 0.5), 0.4)
    # product cards jump out
    for i, t0 in enumerate(TL.FLY_OUT):
        S.add(t0, pop(1.0, 1100 + 200 * i, 300), 0.6, [0.3, 0.2, -0.3][i])
        S.add(t0, whoosh(0.35, 0.6, 600, 4000, 0.5), 0.5)
    # cards into the camera
    S.add(5.42, whoosh(0.62, 1.1, 200, 6000, 0.72, (-0.8, 0.8)), 1.0)
    # card expands to full screen
    S.add(6.0, whoosh(0.5, 0.8, 150, 2200, 0.7, (0.3, -0.3)), 0.8)
    S.add(6.45, pop(0.8, 700, 200), 0.5)
    # finger tap
    S.add(TL.T_TAP, tick(3200, 1.0, 0.006), 0.6)
    S.add(TL.T_TAP, thud(0.5, 140), 0.4)
    # wheel ratchet: one click per segment edge passing the pointer
    clicks = TL.wheel_click_times()
    last = -1
    for i, tc in enumerate(clicks):
        sp = TL.wheel_speed(tc)
        g = 0.55 if sp < 600 else 0.4 if sp < 1500 else 0.28
        S.add(tc, tick(2300 + (i % 3) * 180, 1.0, 0.008), g, 0.15 * math.sin(i))
        last = tc
    S.add(TL.SPIN0, whoosh(0.5, 0.5, 300, 2500, 0.3), 0.5)
    # win
    S.add(TL.SPIN1, bell(mtof(86), 1.0), 0.75)
    S.add(TL.SPIN1 + 0.09, bell(mtof(93), 0.9), 0.6)
    S.add(TL.SPIN1, pop(1.0, 500, 120), 0.6)
    S.add(TL.SPIN1, sparkle(1.0, 1.0, 1), 0.8)
    # roulette shrinks into the points card, +50 flies in
    S.add(9.95, whoosh(0.42, 0.8, 300, 3000, 0.6, (0.4, -0.4)), 0.75)
    S.add(10.04, whoosh(0.46, 0.5, 900, 6000, 0.85, (0.0, -0.4)), 0.5)
    S.add(10.5, bell(mtof(98), 0.6, 0.6), 0.45)
    S.add(10.5, thud(0.5, 120), 0.35)
    # counter
    for (tc, v) in TL.counter_tick_times():
        fr = 1700 + (v - TL.P_FROM) * 22
        S.add(tc, tick(fr, 1.0, 0.01), 0.42, 0.1)
    S.add(TL.T_GOAL, bell(mtof(93), 0.7, 0.8), 0.5)
    # level up at the end of the count
    for i, m in enumerate((74, 78, 81, 86)):
        S.add(TL.COUNT1 + i * 0.05, bell(mtof(m + 12), 0.6, 0.9), 0.4, -0.3 + 0.2 * i)
    S.add(TL.COUNT1, boom(0.6), 0.45)
    S.add(TL.COUNT1, sparkle(0.9, 1.0, 2), 0.8)
    # card flips away, gift drops
    S.add(12.8, whoosh(0.3, 0.7, 500, 4000, 0.5, (-0.4, 0.4)), 0.6)
    S.add(12.9, whistle_drop(0.36, 1.0), 0.6)
    S.add(TL.GIFT_LAND, thud(1.0, 70), 0.85)
    S.add(TL.GIFT_LAND, boom(0.4), 0.4)
    for i in range(5):
        S.add(13.36 + i * 0.03, tick(900 + 120 * i, 0.4, 0.015), 0.25)
    S.add(TL.LID_POP, pop(1.0, 1400, 300), 0.8)
    S.add(TL.LID_POP, sparkle(0.9, 1.0, 3), 0.8)
    S.add(TL.LID_POP, whoosh(0.4, 0.5, 800, 5000, 0.3), 0.4)
    # reward out, QR phone turns in
    S.add(13.98, whoosh(0.3, 0.7, 400, 4000, 0.5, (0.2, -0.8)), 0.6)
    S.add(14.0, whoosh(0.5, 0.8, 250, 3000, 0.6, (0.8, 0.0)), 0.6)
    S.add(14.46, clack(0.5), 0.3)
    # scanned at the till
    S.add(TL.SCAN[0], scan_sweep(TL.SCAN[1] - TL.SCAN[0]), 0.6)
    S.add(TL.SCAN[1], beep(1850, 0.12), 0.65)
    S.add(TL.SCAN[1] + 0.05, pop(0.8, 1000, 400), 0.4)
    # end card
    S.add(15.26, whoosh(0.3, 0.8, 400, 4000, 0.5, (0.0, -0.8)), 0.6)
    S.add(15.3, whoosh(0.68, 1.0, 200, 3500, 0.7, (0.8, 0.1)), 0.85)
    S.add(TL.PHONE_LAND, clack(1.0), 0.75)
    S.add(TL.PHONE_LAND, boom(0.5), 0.5)
    for i, tp in enumerate((15.45, 15.52, 15.6, 15.7, 15.76, 15.82, 15.86)):
        S.add(tp, pop(0.4, 1300 + 60 * i, 500), 0.4, -0.3 + 0.1 * i)
    S.add(15.98, sparkle(1.2, 0.8, 4), 0.6)
    return S.stereo()


# ---------------------------------------------------------------- voice + mix
def read_wav(p):
    with wave.open(p) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2).mean(1)
    assert sr == SR, sr
    return x


def stretch(x, ratio):
    """Tempo change (formants preserved) via ffmpeg rubberband. ratio>1 = faster."""
    p = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f64le', '-ar', str(SR), '-ac', '1', '-i', '-', '-af',
                        f'rubberband=tempo={ratio:.4f}:formant=preserved', '-f', 'f64le', '-'],
                       input=x.astype(np.float64).tobytes(), capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float64).copy()


VOICE_EQ = [(220, 3.0, 0.7), (6500, -4.5, 0.7), (3000, -1.5, 1.0)]


def voice_track(dur_hint):
    vdir = os.path.join(ROOT, 'build', 'voice')
    segs = {k: read_wav(os.path.join(vdir, k + '.wav')) for k in ('v1', 'v2', 'v3', 'v4', 'v5', 'v6')}
    slots = dict(TL.VOICE_SLOTS)
    limits = {'v1': 2.42, 'v2': 5.9, 'v3': 9.9, 'v4': 12.9, 'v5': 15.0}
    for k, lim in limits.items():
        d = len(segs[k]) / SR
        room = lim - slots[k]
        if d > room:
            segs[k] = stretch(segs[k], min(1.15, d / room))
    # last line: finish by 17.75 at most (total <= 18 s), never start before 14.95
    d6 = len(segs['v6']) / SR
    if d6 > 2.8:
        segs['v6'] = stretch(segs['v6'], min(1.15, d6 / 2.8))
        d6 = len(segs['v6']) / SR
    slots['v6'] = max(14.95, min(15.42, 17.72 - d6))
    end = slots['v6'] + d6
    total = round(min(18.0, max(17.6, end + 0.3)), 2)
    V = np.zeros(n_(total) + SR)
    for k, x in segs.items():
        i = n_(slots[k])
        V[i:i + len(x)] += x
    # voice chain: HPF, presence, gentle compression
    V = filt(V, 'hp', 85, 2)
    for f0, g, q in VOICE_EQ:
        b, a = _peaking(f0, g, q)
        V = signal.lfilter(b, a, V)
    V = _compress(V, -20, 3.0)
    V /= max(1e-6, np.abs(V).max())
    return V, slots, {k: round(len(x) / SR, 3) for k, x in segs.items()}, total


def _peaking(f0, gain_db, q):
    A_ = 10 ** (gain_db / 40)
    w0 = 2 * math.pi * f0 / SR
    al = math.sin(w0) / (2 * q)
    b = [1 + al * A_, -2 * math.cos(w0), 1 - al * A_]
    a = [1 + al / A_, -2 * math.cos(w0), 1 - al / A_]
    return np.array(b) / a[0], np.array(a) / a[0]


def _envelope(x, att=0.005, rel=0.12):
    e = np.abs(x)
    a1, r1 = math.exp(-1 / (att * SR)), math.exp(-1 / (rel * SR))
    # vectorised approximation: smooth with asymmetric filters
    up = signal.lfilter([1 - a1], [1, -a1], e)
    return signal.lfilter([1 - r1], [1, -r1], np.maximum(up, e * 0))


def _compress(x, thr_db, ratio):
    env = _envelope(x, 0.004, 0.15) + 1e-9
    lvl = 20 * np.log10(env)
    over = np.maximum(0, lvl - thr_db)
    gain = 10 ** (-(over - over / ratio) / 20)
    return x * gain


def build_mix():
    vpath = os.path.join(ROOT, 'build', 'voice', 'meta.json')
    meta = json.load(open(vpath))
    V, slots, vdur, total = voice_track(18.0)
    M = music(total)[:, :n_(total)]
    S = sfx(total)[:, :n_(total)]
    V = V[:n_(total)]
    # duck music under the voice (about -8 dB)
    env = _envelope(V, 0.01, 0.3)
    env = np.clip(env / (np.percentile(env[env > 1e-4], 90) + 1e-9), 0, 1) if np.any(env > 1e-4) else env
    duck = 1 - 0.72 * env
    M = M / max(1e-6, np.abs(M).max())
    S = S / max(1e-6, np.abs(S).max())
    duck_s = 1 - 0.4 * env
    mix = M * 0.30 * duck + S * 0.42 * duck_s + np.vstack([V, V]) * 1.0
    # fade the very end
    f = n_(0.35)
    mix[:, -f:] *= np.linspace(1, 0, f) ** 1.5
    mix /= np.abs(mix).max() / 0.9
    raw = os.path.join(ROOT, 'build', 'mix_raw.wav')
    _write_stereo(raw, mix)
    final = os.path.join(ROOT, 'build', 'mix.wav')
    loudnorm(raw, final, -14.0, -1.0)
    # stems for checking
    k = 1 / (np.abs(M * 0.30 * duck + S * 0.42 * duck_s + np.vstack([V, V])).max() / 0.9)
    _write_stereo(os.path.join(ROOT, 'build', 'stem_voice.wav'), np.vstack([V, V]) * k)
    _write_stereo(os.path.join(ROOT, 'build', 'stem_bed.wav'), (M * 0.30 * duck + S * 0.42 * duck_s) * k)
    info = dict(total=total, voice_slots=slots, voice_durations=vdur, voice=meta)
    json.dump(dict(total=total, voice_slots=slots), open(os.path.join(ROOT, 'build', 'timing.json'), 'w'), indent=1)
    json.dump(info, open(os.path.join(ROOT, 'build', 'mix_info.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps(info, indent=1, ensure_ascii=False))
    return final, total


def _write_stereo(path, x):
    x16 = (np.clip(x.T, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x16.tobytes())


def _measure(src, I=-14.0, TP=-1.0):
    p = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', f'loudnorm=I={I}:TP={TP}:LRA=11:print_format=json',
                        '-f', 'null', '-'], capture_output=True, text=True)
    return json.loads(p.stderr[p.stderr.rfind('{'):p.stderr.rfind('}') + 1])


def loudnorm(src, dst, I=-14.0, TP=-1.0):
    """Linear loudness normalisation to I LUFS with a true-peak ceiling: pre-limit if the gain would clip."""
    m = _measure(src, I, TP)
    gain = I - float(m['input_i'])
    peak_after = float(m['input_tp']) + gain
    work = src
    if peak_after > TP - 0.3:
        lim_db = TP - 0.6 - gain
        work = src.replace('.wav', '_lim.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af',
                        f'aresample=192000,alimiter=limit={10 ** (lim_db / 20):.5f}:attack=1:release=60:level=disabled,aresample=48000',
                        '-c:a', 'pcm_s24le', work], check=True)
        m = _measure(work, I, TP)
    af = (f"loudnorm=I={I}:TP={TP}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,"
          f"aresample=48000")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', work, '-af', af, '-ar', '48000', '-c:a', 'pcm_s24le', dst], check=True)


if __name__ == '__main__':
    build_mix()
