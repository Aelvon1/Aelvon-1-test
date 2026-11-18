"""Frame composition for the ARICI app Reels ad. render(t) -> RGB PIL image (1080x1920)."""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from common import *
import ui
import deco
import timeline as TL

K = 2                      # phone screen render scale (px per pt)
DECO_SCALE = 1.28          # corner decorations a bit larger in 9:16

# ---------------------------------------------------------------- flyer -> video mapping for the last frame
FX0, FY0, FS = 40.0, 292.0, 0.92


def fmap(x, y):
    return FX0 + FS * x, FY0 + FS * (y - 14)


A = {}   # assets (built once per process)


def _fit_font(text, family, weight, max_w, size0):
    s = size0
    while font(family, s, weight).getlength(text) > max_w and s > 10:
        s -= 1
    return font(family, s, weight)


class Caption:
    """Kinetic caption: words pop in (rise + overshoot), leave upward."""

    def __init__(self, lines, x=70, top=280, maxw=870, center=None, line_gap=1.08):
        self.words = []
        y = top
        for li, (txt, size, weight, color, fam) in enumerate(lines):
            f = _fit_font(txt, fam, weight, maxw, size)
            asc, desc = f.getmetrics()
            bb = f.getbbox(txt, anchor='ls')
            base = y - bb[1]
            total = f.getlength(txt)
            if center is not None:
                xx = center - total / 2
            else:
                xx = x
            parts = txt.split(' ')
            for wi, wd in enumerate(parts):
                spr, b = text_sprite(wd, f, color, pad=8)
                self.words.append((spr, xx - 8, base - b, li, wi))
                xx += f.getlength(wd + ' ')
            y = base + (f.size * 0.30) + f.size * (line_gap - 1) + 8
        self.bottom = y

    def draw(self, c, t, t_in, t_out=None, cam=None, oy=0.0, stagger=0.07, line_delay=0.16, dur=0.36, rise=80):
        for spr, x, y, li, wi in self.words:
            d = t_in + li * line_delay + wi * stagger
            p = prog(t, d, d + dur)
            if p <= 0:
                continue
            a = clamp(p * 2.5)
            ob = e_out_back(p, 2.0)
            yy = y + (1 - ob) * rise
            sc = 0.82 + 0.18 * e_out_back(p, 2.4)
            rot = (1 - e_out_cubic(p)) * (6 if wi % 2 == 0 else -6)
            if t_out is not None:
                q = prog(t, t_out + wi * 0.02, t_out + wi * 0.02 + 0.2)
                yy -= e_in_cubic(q) * 160
                a *= 1 - q
            place(c, spr, x + spr.width / 2, yy + spr.height / 2 + oy, scale=sc, rot=rot, alpha=a, cam=cam)


# ---------------------------------------------------------------- shake
IMPACTS = [  # time, amplitude px, decay /s
    (0.72, 12, 9), (2.80, 7, 11), (4.42, 4, 12), (4.6, 4, 12), (4.78, 4, 12), (TL.T_TAP, 5, 14),
    (TL.SPIN1, 12, 8), (TL.T_GOAL, 5, 12), (TL.COUNT1, 11, 8), (TL.GIFT_LAND, 14, 9), (TL.LID_POP, 7, 10),
    (TL.SCAN[1] + 0.02, 5, 12), (TL.PHONE_LAND, 7, 55),
]


def shake(t):
    if t >= TL.HOLD_START - 0.02:
        return 0.0, 0.0, 0.0
    ox = oy = rr = 0.0
    for ti, amp, dec in IMPACTS:
        u = t - ti
        if 0 <= u < 1.0:
            e = amp * math.exp(-dec * u)
            ox += e * math.sin(2 * math.pi * 13 * u + ti)
            oy += e * math.cos(2 * math.pi * 11 * u + ti * 2)
            rr += e * 0.06 * math.sin(2 * math.pi * 9 * u)
    return ox, oy, rr


# ---------------------------------------------------------------- particles
def make_confetti(n, seed, x0, y0, speed=(900, 2300), up=700):
    rnd = random.Random(seed)
    cols = [CARAMEL, GOLD, (247, 236, 220), (60, 36, 20), (255, 255, 255), (222, 150, 76)]
    parts = []
    for i in range(n):
        ang = rnd.uniform(0, 2 * math.pi)
        sp = rnd.uniform(*speed)
        vx, vy = math.cos(ang) * sp, math.sin(ang) * sp - up
        col = cols[i % len(cols)]
        w, h = rnd.uniform(16, 28), rnd.uniform(9, 14)
        spr = rrect(w, h, 3, col + (255,), ss=2)
        parts.append(dict(x=x0 + rnd.uniform(-20, 20), y=y0 + rnd.uniform(-20, 20), vx=vx, vy=vy,
                          rot0=rnd.uniform(0, 360), w=rnd.uniform(-700, 700), fl=rnd.uniform(4, 11), spr=spr,
                          ph=rnd.uniform(0, 6.28)))
    return parts


def draw_confetti(c, parts, t, t0, cam=None, g=2600.0, k=2.4, life=1.6):
    u = t - t0
    if u <= 0 or u > life:
        return
    fade = 1 - prog(u, life - 0.35, life)
    em = (1 - math.exp(-k * u)) / k
    for p in parts:
        x = p['x'] + p['vx'] * em
        y = p['y'] + (p['vy'] + g / k) * em - g * u / k
        sx = abs(math.cos(p['fl'] * u + p['ph'])) * 0.85 + 0.15
        place(c, p['spr'], x, y, rot=p['rot0'] + p['w'] * u, alpha=fade, sx=sx, cam=cam)


def make_sparkles(n, seed, cx, cy, rx, ry):
    rnd = random.Random(seed)
    return [dict(x=cx + rnd.uniform(-rx, rx), y=cy + rnd.uniform(-ry, ry), d=rnd.uniform(0, 0.35),
                 s=rnd.uniform(0.35, 1.0), r=rnd.uniform(0, 45)) for _ in range(n)]


def star_sprite(D=90, color=(255, 226, 160)):
    ss = 4
    big = Image.new('RGBA', (D * ss, D * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    c = D * ss / 2
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i - math.pi / 2
        r = c if i % 2 == 0 else c * 0.22
        pts.append((c + math.cos(ang) * r, c + math.sin(ang) * r))
    d.polygon(pts, fill=tuple(color) + (255,))
    im = big.resize((D, D), Image.LANCZOS)
    gl = ui.glow(D, color, 0.7)
    gl.alpha_composite(im)
    return gl


def draw_sparkles(c, sp, t, t0, dur=0.8, cam=None, scale=1.0):
    for s in sp:
        u = (t - t0 - s['d']) / dur
        if 0 < u < 1:
            k = math.sin(math.pi * u)
            place(c, A['star'], s['x'], s['y'], scale=s['s'] * k * scale, rot=s['r'] + 90 * u, alpha=min(1, k * 1.5), cam=cam)


# ---------------------------------------------------------------- asset building
def build_assets():
    if A:
        return A
    A['bg'] = _cream_bg()
    A['dark'] = _dark_bg()
    A['phone'] = ph = ui.Phone(ui.PW * K, ui.PH * K)
    A['home_screen'] = ui.screen_home(K)
    A['phone_home'] = ph.compose(A['home_screen'])
    A['prod_content'], A['prod_pos'] = ui.products_content(K)
    A['prod_header'] = ui.screen_products_header(K)
    A['prod_tabs'] = ui.tab_bar(K)
    A['phone_qr'] = ph.compose(ui.screen_qr(K, TL.P_TO))
    A['logo'] = ui.logo_round()
    A['decor'] = deco.build(1080)
    _bt = A['decor']['bottom'][0]
    A['deco_bl'] = _bt.crop((0, 0, 270, _bt.height))
    A['deco_br'] = _bt.crop((690, 0, _bt.width, _bt.height))
    # flying product cards (k=3.2)
    A['fly'] = {i: ui.product_card(3.2, i) for i in (0, 1, 2)}
    # wheel
    WD = 760
    A['WD'] = WD
    A['wheel'] = ui.wheel_disc(WD, ss=3)
    A['hub'] = ui.wheel_hub(WD)
    A['pointer'], A['pointer_pad'] = ui.wheel_pointer(WD)
    A['dot_c'] = circle(26, (247, 236, 220))
    A['dot_k'] = circle(26, (200, 130, 60))
    A['dot_g'] = ui.glow(70, (255, 210, 130), 1.0)
    A['win_wedge'] = _wedge(WD)
    A['rays'] = ui.burst_rays(1500)
    A['glow'] = ui.glow(900, (255, 196, 110), 1.0)
    A['glow_dark'] = ui.glow(1100, (150, 84, 30), 0.9)
    A['star'] = star_sprite()
    A['ring'] = _ring(700, 10, (200, 120, 47))
    A['ring_w'] = _ring(300, 8, (255, 255, 255))
    A['hand'], A['hand_tip'] = ui.hand_sprite(1.0)
    A['gift_body'], A['gift_lid'] = ui.gift_box(520)
    A['reward'], _ = ui.reward_card(600)
    A['check'] = _check_badge(130)
    A['scan'] = _scan_line(520)
    A['plus50'] = _plus50()
    A['jouer'] = _jouer_btn()
    # captions
    A['cap1'] = Caption([("Tout l’univers ARICI…", 84, 800, INK, 'mont'),
                         ('dans votre poche.', 110, 800, TITLE_BROWN, 'mont')], top=1110, center=500, maxw=860)
    A['cap2'] = Caption([('Retrouvez', 84, 800, INK, 'mont'),
                         ('tous nos produits', 96, 800, TITLE_BROWN, 'mont')], top=286)
    A['cap3'] = Caption([('Tentez votre chance', 84, 800, WHITE, 'mont'),
                         ('chaque jour', 100, 800, (226, 156, 80), 'mont')], top=286)
    A['cap4'] = Caption([('Gagnez', 96, 800, INK, 'mont'),
                         ('des points', 108, 800, TITLE_BROWN, 'mont')], top=286)
    A['cap5'] = Caption([('… et profitez-en !', 100, 800, TITLE_BROWN, 'mont')], top=330)
    _build_final()
    A['confetti'] = make_confetti(150, 7, 510, 1010)
    A['confetti2'] = make_confetti(70, 11, 505, 1180, speed=(700, 1700), up=900)
    A['spark4'] = make_sparkles(26, 3, 482, 1020, 480, 300)
    A['spark5'] = make_sparkles(22, 5, 505, 1000, 380, 380)
    A['clicks'] = TL.wheel_click_times()
    persist(A)
    A['pc_cache'] = {}
    return A


def _cream_bg():
    g = radial(W, H, W * 0.5, H * 0.46, H * 0.95, [(0, CREAM_LIGHT), (0.35, (251, 247, 241)), (0.7, (249, 244, 236)), (1, CREAM)])
    rnd = np.random.default_rng(1).normal(0, 1.1, (H, W, 1)).astype(np.float32)
    return Image.fromarray(np.clip(g + rnd, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def _dark_bg():
    g = radial(W, H, 510, 1010, 1100, [(0, (52, 32, 17)), (0.55, (22, 17, 13)), (1, (11, 10, 9))])
    rnd = np.random.default_rng(2).normal(0, 1.2, (H, W, 1)).astype(np.float32)
    return Image.fromarray(np.clip(g + rnd, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


def _wedge(D):
    ss = 2
    big = Image.new('RGBA', (D * ss, D * ss), (0, 0, 0, 0))
    dr = ImageDraw.Draw(big)
    dr.pieslice((0, 0, D * ss - 1, D * ss - 1), -90 - 22.5, -90 + 22.5, fill=(255, 196, 96, 70))
    dr.pieslice((0, 0, D * ss - 1, D * ss - 1), -90 - 22.5, -90 + 22.5, outline=(255, 206, 120, 255), width=9 * ss)
    w = big.resize((D, D), Image.LANCZOS)
    g = w.getchannel('A').filter(ImageFilter.GaussianBlur(10))
    halo = Image.new('RGBA', w.size, (255, 190, 90, 0)); halo.putalpha(g)
    halo.alpha_composite(w)
    return halo


def _ring(D, w, col):
    ss = 3
    big = Image.new('RGBA', (D * ss, D * ss), (0, 0, 0, 0))
    ImageDraw.Draw(big).ellipse((w * ss, w * ss, D * ss - w * ss, D * ss - w * ss), outline=tuple(col) + (255,), width=w * ss)
    return big.resize((D, D), Image.LANCZOS)


def _check_badge(D):
    c = circle(D, (200, 120, 47))
    ic = ui.icon('check', int(D * 0.6), WHITE, width=D * 0.075)
    c.alpha_composite(ic, ((D - ic.width) // 2, (D - ic.height) // 2))
    out, pad = drop_shadow(c, blur=12, offset=(0, 6), opacity=0.35)
    return out


def _scan_line(w):
    h = 70
    arr = np.zeros((h, w, 4), np.float32)
    ys = np.arange(h)[:, None].astype(np.float32)
    xs = np.arange(w)[None, :].astype(np.float32)
    core = np.exp(-((ys - h / 2) / 3.2) ** 2)
    halo = np.exp(-((ys - h / 2) / 16) ** 2) * 0.45
    edge = np.clip(np.minimum(xs, w - xs) / 30, 0, 1)
    a = np.clip(core + halo, 0, 1) * edge
    arr[..., 0] = 255; arr[..., 1] = 150 + 90 * core; arr[..., 2] = 60 + 150 * core
    arr[..., 3] = a * 255
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def _plus50():
    f = font('mont', 150, 900)
    spr, b = text_sprite('+50', f, (255, 214, 130), pad=30)
    f2 = font('mont', 66, 800)
    spr2, b2 = text_sprite('pts', f2, (255, 214, 130), pad=20)
    w = spr.width + spr2.width - 30
    out = new(w, spr.height)
    out.alpha_composite(spr, (0, 0))
    out.alpha_composite(spr2, (spr.width - 40, b - b2))
    # dark outline/shadow for legibility on the wheel
    a = out.getchannel('A').filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.GaussianBlur(6))
    sh = Image.new('RGBA', out.size, (20, 12, 6, 0))
    sh.putalpha(a.point(lambda v: int(v * 0.85)))
    sh.alpha_composite(out)
    return sh


def _jouer_btn():
    w, h = 400, 108
    g = gradient(w, h, [(0, (232, 160, 86)), (1, (206, 128, 52))], 90)
    b = arr_to_rgba(g, rrect_mask(w, h, h / 2))
    draw_text(b, (w / 2, h / 2 + 2), 'Jouer', font('mont', 50, 800), (24, 16, 10), anchor='mm')
    out, pad = drop_shadow(b, blur=18, offset=(0, 10), opacity=0.5, color=(0, 0, 0))
    return out


def _build_final():
    F = {}
    # texts from the flyer, re-typeset in Montserrat at full resolution
    F['decouvrez'] = _text_box("Découvrez notre", 'mont', 800, TITLE_BROWN, fmap(23, 356), FS * 441, tracking_em=-0.03)
    F['application'] = _text_box('Application', 'mont', 700, INK, fmap(21, 419), FS * 459, tracking_em=-0.03)
    F['tag1'] = _text_box("Tout l’univers ARICI", 'monti', 300, (16, 16, 16), fmap(46, 556), FS * 304)
    F['tag2'] = _text_box('dans votre poche.', 'monti', 300, (16, 16, 16), fmap(46, 596), FS * 280, size_from=F['tag1'][3])
    F['scannez'] = _text_box('Scannez pour télécharger', 'mont', 600, COPPER, fmap(134, 654), FS * 256)
    ul = ui.layer(3)
    F['underline'] = (ul.resize((int(FS * 158), int(FS * 20)), Image.LANCZOS), fmap(35, 522))
    grid = ui.qr_modules_from_svg(os.path.join(ROOT, 'ref', 'QR-ARICI-application.svg'))
    q = ui.qr_image(grid, 6, quiet=0)
    pad = 16
    card = rrect(q.width + 2 * pad, q.height + 2 * pad, 18, (255, 255, 255, 255))
    card.alpha_composite(q, (pad, pad))
    F['qr'], _ = drop_shadow(card, blur=14, offset=(0, 6), opacity=0.14)
    F['qr_c'] = fmap((162 + 363) / 2, (713 + 915) / 2)
    F['badge_a'] = drop_shadow(ui.store_badge('apple', int(FS * 342)), blur=10, offset=(0, 5), opacity=0.25)[0]
    F['badge_g'] = drop_shadow(ui.store_badge('google', int(FS * 342)), blur=10, offset=(0, 5), opacity=0.25)[0]
    F['badge_a_c'] = fmap(263, 1046)
    F['badge_g_c'] = fmap(263, 1169)
    F['logo_c'] = fmap(490.5, 166.5)
    F['logo_s'] = FS * 305 / 502
    F['phone_c'] = fmap(754.5, 756)
    F['phone_s'] = FS * 491 / A['phone'].w
    # call to action under the flyer block
    f = _fit_font('Installez-la dès maintenant', 'mont', 800, 860, 64)
    s1, b1 = text_sprite('Installez-la ', f, INK)
    s2, b2 = text_sprite('dès maintenant', f, TITLE_BROWN)
    cta = new(s1.width + s2.width, max(s1.height, s2.height))
    cta.alpha_composite(s1, (0, 0)); cta.alpha_composite(s2, (s1.width - 12, 0))
    F['cta'] = cta
    F['cta_c'] = (500, 1492)
    A['final'] = F


def _text_box(txt, fam, weight, color, topleft, max_w, size_from=None, tracking=0.0, tracking_em=0.0):
    """Text sized to width max_w with glyph top at topleft. Returns (sprite, x, y, size)."""
    if size_from:
        f = font(fam, size_from, weight)
    else:
        s = 200
        while (font(fam, s, weight).getlength(txt) + (tracking + tracking_em * s) * (len(txt) - 1)) > max_w:
            s -= 1
        f = font(fam, s, weight)
    tracking = tracking + tracking_em * f.size
    spr, base = text_sprite(txt, f, color, tracking=tracking, pad=8)
    bb = f.getbbox(txt, anchor='ls')
    x = topleft[0] - 8 - bb[0]
    y = topleft[1] - (base + bb[1])
    return (spr, x, y, f.size)


# ---------------------------------------------------------------- exact rotational motion blur
_POLAR = {}


def _polar(spr):
    from scipy import ndimage
    key = id(spr)
    if key in _POLAR:
        return _POLAR[key]
    D = max(spr.size)
    c = (spr.width - 1) / 2, (spr.height - 1) / 2
    arr = np.asarray(spr.convert('RGBa')).astype(np.float32)
    NT = 3600
    NR = int(math.ceil(math.hypot(spr.width, spr.height) / 2)) + 3
    th = np.arange(NT, dtype=np.float32) / NT * 2 * np.pi
    r = np.arange(NR, dtype=np.float32)
    rr, tt = np.meshgrid(r, th, indexing='ij')
    xs = c[0] + rr * np.sin(tt)
    ys = c[1] - rr * np.cos(tt)
    P = np.stack([ndimage.map_coordinates(arr[..., ch], [ys, xs], order=1, mode='constant', cval=0.0)
                  for ch in range(4)], -1)
    yy, xx = np.mgrid[0:spr.height, 0:spr.width].astype(np.float32)
    dx, dy = xx - c[0], yy - c[1]
    Rg = np.sqrt(dx * dx + dy * dy)
    Tg = (np.degrees(np.arctan2(dx, -dy)) % 360.0) / 360.0 * NT
    _POLAR[key] = (P, Rg, Tg, NT)
    return _POLAR[key]


def rot_blurred(spr, angle, blur_deg):
    """Sprite rotated clockwise by `angle` with an exact rotational motion blur of `blur_deg` (centred)."""
    from scipy import ndimage
    P, Rg, Tg, NT = _polar(spr)
    w = max(1, int(round(blur_deg / 360.0 * NT)))
    B = ndimage.uniform_filter1d(P, size=w, axis=1, mode='wrap') if w > 1 else P
    src_t = (Tg - angle / 360.0 * NT) % NT
    out = np.stack([ndimage.map_coordinates(B[..., ch], [Rg, src_t], order=1, mode='grid-wrap')
                    for ch in range(4)], -1)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGBa').convert('RGBA')


# ---------------------------------------------------------------- helpers
def phone_pt(cx, cy, scale, ptx, pty):
    ph = A['phone']
    return (cx + (ph.sx + ptx * K - ph.w / 2) * scale, cy + (ph.sy + pty * K - ph.h / 2) * scale)


def draw_decor(c, t, cam):
    d = A['decor']
    e_in = e_out_back(prog(t, 0.0, 0.55), 1.4)
    bump = 0.0
    if 15.36 <= t < 15.9:   # little re-pop on the end card
        bump = math.sin(math.pi * prog(t, 15.36, 15.9)) * 0.06
    sway = 0.0 if t >= 15.3 else math.sin(t * 1.7) * 1.2
    s = DECO_SCALE * (1 + bump)
    spr, (x, y) = d['tl']
    place(c, spr, -(1 - e_in) * 320, -(1 - e_in) * 320, scale=s, rot=sway - (1 - e_in) * 25, anchor=(0, 0), cam=cam)
    spr, (x, y) = d['tr']
    place(c, spr, W + (1 - e_in) * 320, -(1 - e_in) * 320, scale=s, rot=-sway + (1 - e_in) * 25, anchor=(1, 0), cam=cam)
    place(c, A['deco_bl'], -(1 - e_in) * 300, H + (1 - e_in) * 300, scale=1.65 * (1 + bump), rot=-sway * 0.6,
          anchor=(0, 1), cam=cam)
    place(c, A['deco_br'], W + (1 - e_in) * 300, H + (1 - e_in) * 300, scale=2.0 * (1 + bump), rot=sway * 0.6,
          anchor=(1, 1), cam=cam)


def products_screen(t):
    x = prog(t, *TL.T_SCROLL)
    S_END = 3 * (ui.CARD_H + 12)
    base = S_END * e_inout_cubic(x)
    bounce = 26 * math.sin(math.pi * prog(t, TL.T_SCROLL[1] - 0.12, TL.T_SCROLL[1] + 0.3)) * (1 - prog(t, TL.T_SCROLL[1] - 0.12, TL.T_SCROLL[1] + 0.3))
    scroll = base + bounce
    dt = 1 / 120
    v = abs(S_END * (e_inout_cubic(prog(t + dt, *TL.T_SCROLL)) - e_inout_cubic(prog(t - dt, *TL.T_SCROLL)))) / (2 * dt)
    blur = v * (0.5 / FPS) * K
    scr = ui.screen_products(K, A['prod_content'], A['prod_header'], A['prod_tabs'], scroll, blur_px=blur)
    # holes left by the cards that jumped out
    pitch = ui.CARD_H + 12
    holes = [(0, 1, 3), (1, 0, 4), (2, 0, 3)]   # (product idx, col, row)
    for i, (idx, col, row) in enumerate(holes):
        if t >= TL.FLY_OUT[i]:
            hx = 22 + col * 180
            hy = 214 + 8 + row * pitch - scroll
            hole = rrect(ui.CARD_W * K, ui.CARD_H * K, 18 * K, (243, 236, 226, 255), outline=(230, 220, 206), width=1.5 * K)
            scr.alpha_composite(hole, (int(hx * K), int(hy * K)))
    return scr, scroll


def slot_center(i, scroll, cx, cy, sc):
    holes = [(0, 1, 3), (1, 0, 4), (2, 0, 3)]
    idx, col, row = holes[i]
    pitch = ui.CARD_H + 12
    hx = 22 + col * 180 + ui.CARD_W / 2
    hy = 214 + 8 + row * pitch - scroll + ui.CARD_H / 2
    return phone_pt(cx, cy, sc, hx, hy)


def points_card_sprite(pts, progv, label, shine=0.0):
    key = (pts, round(progv, 3), label, round(shine, 2))
    cache = A['pc_cache']
    if key in cache:
        return cache[key]
    if len(cache) > 60:
        cache.clear()
    kc = 880 / 365
    p = ui.Painter(kc, 365 + 90, 164 + 100, bg=(0, 0, 0, 0))
    ui.draw_points_card(p, 45, 43, 365, 164, pts, progv, label, shine)
    cache[key] = p.img
    return p.img


# ---------------------------------------------------------------- the scenes
PH_S2 = 0.716               # phone scale in scenes 2/3
PH_C2 = (520, 1150)


def scene1(c, t, cam):
    oy = -2150 * e_in_cubic(prog(t, *TL.T_WHIP1))
    p = prog(t, 0.04, 0.72)
    if p > 0:
        s = 1.08 * max(0.04, e_out_back(p, 1.6))
        rot = -540 * (1 - e_out_cubic(p))
        dps = 540 * 3 * (1 - p) ** 2 / 0.68
        s *= 1 + 0.015 * math.sin(2 * math.pi * max(0, t - 0.9) * 0.9)
        # glow ring when it lands
        q = prog(t, 0.72, 1.25)
        if 0 < q < 1:
            place(c, A['ring'], 500, 690 + oy, scale=0.9 + 0.7 * e_out_cubic(q), alpha=(1 - q) * 0.8, cam=cam)
        blur = dps * 0.5 / FPS
        if blur > 0.6 and t < 0.72:
            place(c, rot_blurred(A['logo'], rot, blur), 500, 690 + oy, scale=s * 1.22, alpha=clamp(p * 4), cam=cam)
        else:
            place(c, A['logo'], 500, 690 + oy, scale=s * 1.22, rot=rot, alpha=clamp(p * 4), cam=cam)
    A['cap1'].draw(c, t, 0.76, None, cam=cam, oy=oy, stagger=0.08, line_delay=0.42)


def scene2(c, t, cam):
    # phone rises from the bottom during the whip
    p = prog(t, 2.3, 2.84)
    cx, cy = PH_C2
    cy_ = cy + (1 - e_out_back(p, 1.25)) * 1500
    rot = 9 * (1 - e_out_cubic(p))
    # screen: products, then slides to home before the roue card expands
    sw = prog(t, 5.58, 5.84)
    if sw <= 0:
        scr, scroll = products_screen(t)
    else:
        scr_p, scroll = products_screen(t)
        e = e_inout_cubic(sw)
        scr = Image.new('RGBA', scr_p.size, SCREEN_BG + (255,))
        scr.alpha_composite(scr_p, (int(-e * scr_p.width), 0))
        scr.alpha_composite(A['home_screen'], (int((1 - e) * scr_p.width), 0))
    phone_img = A['phone_home'] if sw >= 1 else A['phone'].compose(scr)
    place(c, phone_img, cx, cy_, scale=PH_S2, rot=rot, cam=cam)
    if t < 5.6:
        A['cap2'].draw(c, t, 2.58, 5.46, cam=cam)
    # cards jumping out
    targets = [((705, 770), 5), ((640, 1290), 3), ((290, 1020), -6)]
    s_slot = 1.432 / 3.2
    for i in (0, 1, 2):
        t0 = TL.FLY_OUT[i]
        if t < t0:
            continue
        spr, pad = A['fly'][i]
        q = prog(t, t0, t0 + 0.42)
        sx, sy = slot_center(i, scroll if t < TL.T_SCROLL[1] + 0.4 else 3 * (ui.CARD_H + 12), cx, cy_, PH_S2)
        (tx, ty), trot = targets[i]
        e = e_out_back(q, 1.5)
        x = lerp(sx, tx, e_out_cubic(q))
        y = lerp(sy, ty, e_out_cubic(q)) - 170 * math.sin(math.pi * clamp(q))
        s = lerp(s_slot, 0.7, e)
        r = trot * e
        if q >= 1:
            y += 9 * math.sin(2 * math.pi * 0.9 * (t - t0 - 0.42) + i)
        f = prog(t, TL.T_FLYCAM[0] + 0.05 * i, TL.T_FLYCAM[1] - 0.08 + 0.05 * i)
        alpha = 1.0
        if f > 0:
            ef = e_in_cubic(f)
            s *= 1 + 4.2 * ef
            x += (x - 540) * 1.8 * ef
            y += (y - 980) * 1.8 * ef
            r += (12 if i % 2 == 0 else -12) * ef
            alpha = 1 - prog(f, 0.55, 1.0)
        place(c, spr, x, y, scale=s, rot=r, alpha=alpha, cam=cam)


def roulette_layer(c, t, alpha=1.0, cam=None, wheel_c=(510, 1010), wheel_s=1.0, show_ui=True):
    WD = A['WD']
    cx, cy = wheel_c
    ang = TL.wheel_angle(t)
    # warm glow behind
    place(c, A['glow_dark'], cx, cy, scale=1.0 * wheel_s, alpha=alpha * 0.9, cam=cam)
    # win rays
    if t >= TL.SPIN1:
        q = prog(t, TL.SPIN1, TL.SPIN1 + 0.5)
        place(c, A['rays'], cx, cy, scale=(0.55 + 0.5 * e_out_cubic(q)) * wheel_s, rot=(t - TL.SPIN1) * 25,
              alpha=alpha * 0.85 * e_out_cubic(q), cam=cam)
    # lights ring
    if show_ui:
        n = 16
        for i in range(n):
            a_ = math.radians(i * 360 / n + 11.25)
            px, py = cx + math.sin(a_) * 418 * wheel_s, cy - math.cos(a_) * 418 * wheel_s
            if TL.SPIN0 <= t < TL.SPIN1:
                on = (i + int(t * 18)) % 2 == 0
            elif t >= TL.SPIN1:
                on = int((t - TL.SPIN1) * 10) % 2 == 0 or i % 2 == 0
            else:
                on = i % 2 == 0
            spr = A['dot_c'] if on else A['dot_k']
            if t >= TL.SPIN1 and on:
                place(c, A['dot_g'], px, py, scale=wheel_s, alpha=alpha * 0.9, cam=cam)
            place(c, spr, px, py, scale=wheel_s, alpha=alpha, cam=cam)
    beta = TL.wheel_speed(t) * 0.75 / FPS if TL.SPIN0 <= t < TL.SPIN_SETTLE else 0.0
    if beta > 0.6:
        place(c, rot_blurred(A['wheel'], ang, beta), cx, cy, scale=wheel_s, alpha=alpha, cam=cam)
    else:
        place(c, A['wheel'], cx, cy, scale=wheel_s, rot=ang, alpha=alpha, cam=cam)
    if t >= TL.SPIN1:
        pulse = 0.55 + 0.45 * math.sin(2 * math.pi * 3 * (t - TL.SPIN1))
        place(c, A['win_wedge'], cx, cy, scale=wheel_s, rot=ang + 90, alpha=alpha * pulse * prog(t, TL.SPIN1, TL.SPIN1 + 0.12), cam=cam)
    place(c, A['hub'], cx, cy, scale=wheel_s, alpha=alpha, cam=cam)
    if show_ui:
        # pointer with flapper kick on every click
        kick = 0.0
        for tc in A['clicks']:
            if 0 <= t - tc < 0.25:
                kick += 16 * math.exp(-(t - tc) * 22)
        kick = min(kick, 24)
        pp = A['pointer']
        place(c, pp, cx, cy - WD / 2 * wheel_s - 6, scale=wheel_s, rot=-kick, anchor=(0.5, 0.22), alpha=alpha, cam=cam)


def scene3(c, t, cam, handoff=False):
    cx, cy = PH_C2
    # 1) expand the "LA ROUE DU JOUR" card to full screen
    if t < TL.T_EXPAND[1] + 0.02:
        place(c, A['phone_home'], cx, cy, scale=PH_S2, cam=cam)
        e = e_inout_cubic(prog(t, *TL.T_EXPAND))
        x0, y0 = phone_pt(cx, cy, PH_S2, 14, 400)
        x1, y1 = phone_pt(cx, cy, PH_S2, 14 + 365, 400 + 132)
        X0, Y0, X1, Y1 = lerp(x0, -12, e), lerp(y0, -12, e), lerp(x1, W + 12, e), lerp(y1, H + 12, e)
        rad = lerp(22 * K * PH_S2, 0, e)
        ss = 2
        m = Image.new('L', (W // ss, H // ss), 0)
        ImageDraw.Draw(m).rounded_rectangle((X0 / ss, Y0 / ss, X1 / ss, Y1 / ss), radius=rad / ss, fill=255)
        m = m.resize((W, H), Image.BILINEAR)
        c.paste(A['dark'], (0, 0), m)
        # card text + mini wheel fade out
        fa = 1 - prog(t, TL.T_EXPAND[0], TL.T_EXPAND[0] + 0.12)
        if fa > 0:
            card = A['phone_home'].crop((int(A['phone'].sx + 14 * K), int(A['phone'].sy + 400 * K),
                                         int(A['phone'].sx + 379 * K), int(A['phone'].sy + 532 * K)))
            place(c, card, (x0 + x1) / 2, (y0 + y1) / 2, scale=PH_S2, alpha=fa, cam=cam)
        # wheel flies from the mini wheel to the centre (clipped by the expanding card)
        we = e_inout_cubic(prog(t, TL.T_EXPAND[0] + 0.03, TL.T_EXPAND[1]))
        mx, my = phone_pt(cx, cy, PH_S2, 349, 468)
        ms = 150 * K * PH_S2 / 2 / A['WD'] * 1.0
        ms = (150 * 1.432) / A['WD']
        layer_ = new(W, H)
        roulette_layer(layer_, t, 1.0, None, (lerp(mx, 510, we), lerp(my, 1010, we)), lerp(ms, 1.0, we), show_ui=False)
        al = np.minimum(np.asarray(layer_.getchannel('A')), np.asarray(m))
        layer_.putalpha(Image.fromarray(al))
        c.alpha_composite(layer_)
        return
    c.alpha_composite(A['dark'])
    ui_in = e_out_back(prog(t, 6.42, 6.66), 1.6)
    roulette_layer(c, t, 1.0, cam, show_ui=True)
    A['cap3'].draw(c, t, 6.5, 9.95, cam=cam)
    # Jouer button: pops in, pressed by the finger, then leaves
    if t < 7.5:
        press = 1.0
        if TL.T_TAP - 0.04 <= t < TL.T_TAP + 0.16:
            press = 1 - 0.1 * math.sin(math.pi * prog(t, TL.T_TAP - 0.04, TL.T_TAP + 0.16))
        out_ = e_in_cubic(prog(t, 7.08, 7.4))
        place(c, A['jouer'], 510, 1500 + 420 * out_, scale=max(0.01, ui_in) * press, alpha=1 - out_, cam=cam)
    # tap ripple
    q = prog(t, TL.T_TAP, TL.T_TAP + 0.4)
    if 0 < q < 1:
        place(c, A['ring_w'], 640, 1504, scale=0.3 + 1.1 * e_out_cubic(q), alpha=(1 - q) * 0.9, cam=cam)
    # finger
    if 6.45 <= t < 7.4:
        tx, ty = A['hand_tip']
        hin = e_out_cubic(prog(t, 6.45, 6.8))
        hout = e_in_cubic(prog(t, 6.98, 7.32))
        px = lerp(1000, 640, hin) + 420 * hout
        py = lerp(2350, 1500, hin) + 900 * hout
        if TL.T_TAP - 0.06 <= t < TL.T_TAP + 0.12:
            py += 14 * math.sin(math.pi * prog(t, TL.T_TAP - 0.06, TL.T_TAP + 0.12))
        hs = A['hand']
        place(c, hs, px, py, anchor=(tx / hs.width, ty / hs.height), cam=cam)
    # win: +50 pts pops on the wheel and confetti
    if TL.SPIN1 + 0.05 <= t < TL.T_SHRINK[0]:
        q = prog(t, TL.SPIN1 + 0.05, TL.SPIN1 + 0.4)
        place(c, A['plus50'], 510, 1010, scale=0.2 + 0.95 * e_out_back(q, 2.2), alpha=clamp(q * 3), cam=cam)
    if not handoff:
        draw_confetti(c, A['confetti'], t, TL.SPIN1, cam=cam)


def scene4(c, t, cam):
    # shrink roulette into the points card
    CX, CY = 482, 1020
    CW, CH = 880, 395
    if t < TL.T_SHRINK[1]:
        e = e_inout_cubic(prog(t, *TL.T_SHRINK))
        X0, Y0 = lerp(-12, CX - CW / 2, e), lerp(-12, CY - CH / 2, e)
        X1, Y1 = lerp(W + 12, CX + CW / 2, e), lerp(H + 12, CY + CH / 2, e)
        rad = lerp(0, 22 * 880 / 365, e)
        ss = 2
        m = Image.new('L', (W // ss, H // ss), 0)
        ImageDraw.Draw(m).rounded_rectangle((X0 / ss, Y0 / ss, X1 / ss, Y1 / ss), radius=rad / ss, fill=255)
        m = m.resize((W, H), Image.BILINEAR)
        # dark that warms into the card gradient
        dark = A['dark']
        layer_ = dark.copy()
        ra = 1 - prog(t, TL.T_SHRINK[0], TL.T_SHRINK[0] + 0.14)
        if ra > 0:
            rl = new(W, H)
            scene3(rl, t, None, handoff=True)
            if ra < 1:
                rl = Image.fromarray((np.asarray(rl).astype(np.float32) * np.array([1, 1, 1, ra], np.float32)).astype(np.uint8), 'RGBA')
            layer_.alpha_composite(rl)
        warm = prog(t, TL.T_SHRINK[0] + 0.1, TL.T_SHRINK[1])
        if warm > 0:
            gx0, gy0 = int(max(0, X0)), int(max(0, Y0))
            gw, gh = int(min(W, X1) - gx0), int(min(H, Y1) - gy0)
            if gw > 2 and gh > 2:
                g = arr_to_rgba(ui.points_card_gradient(gw, gh))
                g.putalpha(int(255 * warm))
                layer_.alpha_composite(g, (gx0, gy0))
        c.paste(layer_, (0, 0), m)
    pts = TL.points_at(t)
    progv = min(1.0, pts / TL.P_GOAL)
    label = 'Encore %d pts : croissant' % (TL.P_GOAL - pts) if pts < TL.P_GOAL else 'Croissant débloqué !'
    shine = prog(t, TL.COUNT1 + 0.02, TL.COUNT1 + 0.6)
    shine = shine if 0 < shine < 1 else 0.0
    # burst behind the card when the counter lands
    if t >= TL.COUNT1:
        q = prog(t, TL.COUNT1, TL.COUNT1 + 0.45)
        fade = 1 - prog(t, 12.4, 12.9)
        place(c, A['rays'], CX, CY, scale=0.55 + 0.6 * e_out_cubic(q), rot=(t - TL.COUNT1) * 20, alpha=0.9 * e_out_cubic(q) * fade, cam=cam)
        place(c, A['glow'], CX, CY, scale=1.3, alpha=0.6 * e_out_cubic(q) * fade, cam=cam)
    if t >= TL.T_SHRINK[1] - 0.1:
        a = prog(t, TL.T_SHRINK[1] - 0.1, TL.T_SHRINK[1])
        bump = 1 + 0.05 * math.sin(math.pi * prog(t, TL.T_SHRINK[1], TL.T_SHRINK[1] + 0.25))
        bump *= 1 + 0.035 * math.sin(math.pi * prog(t, TL.T_GOAL, TL.T_GOAL + 0.2))
        bump *= 1 + 0.06 * math.sin(math.pi * prog(t, TL.COUNT1, TL.COUNT1 + 0.28))
        flip = prog(t, *TL.T_FLIP)
        sx = math.cos(math.pi / 2 * e_in_cubic(flip))
        card = points_card_sprite(pts, progv, label, shine)
        if sx > 0.02:
            place(c, card, CX, CY + 8 - 60 * e_in_cubic(flip), scale=bump, sx=sx, alpha=a, cam=cam)
    # +50 flies into the card
    q = prog(t, TL.T_SHRINK[0], TL.COUNT0)
    if 0 <= q < 1 and t >= TL.T_SHRINK[0]:
        e = e_inout_cubic(q)
        place(c, A['plus50'], lerp(510, 300, e), lerp(1010, 790, e) - 60 * math.sin(math.pi * e),
              scale=lerp(1.15, 0.4, e), alpha=1 - prog(q, 0.6, 1.0), cam=cam)
    q = prog(t, TL.COUNT0 - 0.06, TL.COUNT0 + 0.3)
    if 0 < q < 1:
        place(c, A['glow'], 230, 950, scale=0.7, alpha=(1 - q) * 0.85, cam=cam)
    draw_confetti(c, A['confetti'], t, TL.SPIN1, cam=cam)
    draw_sparkles(c, A['spark4'], t, TL.COUNT1, dur=0.75, cam=cam)
    if t >= TL.T_SHRINK[1] - 0.15:
        A['cap4'].draw(c, t, 10.2, 12.8, cam=cam)


def scene5(c, t, cam):
    BX, BY = 495, 1420          # box bottom centre
    body, lid = A['gift_body'], A['gift_lid']
    if t < 14.26:
        fall = prog(t, 12.9, TL.GIFT_LAND)
        yb = lerp(-60, BY, fall ** 1.7)
        sq = 0.0
        if t >= TL.GIFT_LAND:
            u = t - TL.GIFT_LAND
            sq = 0.16 * math.exp(-9 * u) * math.cos(2 * math.pi * 4 * u)
        wig = 0.0
        if 13.36 <= t < TL.LID_POP:
            wig = 5 * math.sin(2 * math.pi * 14 * (t - 13.36))
        leave = e_in_cubic(prog(t, 13.72, 14.02))
        yb += 900 * leave
        ba = 1 - prog(t, 13.85, 14.02)
        # burst from the box
        if t >= TL.LID_POP:
            q = prog(t, TL.LID_POP, TL.LID_POP + 0.4)
            fade = 1 - prog(t, 13.8, 14.1)
            place(c, A['rays'], BX, BY - body.height, scale=0.4 + 0.6 * e_out_cubic(q), rot=(t - TL.LID_POP) * 30, alpha=0.95 * e_out_cubic(q) * fade, cam=cam)
            place(c, A['glow'], BX, BY - body.height, scale=1.1, alpha=0.7 * e_out_cubic(q) * fade, cam=cam)
        place(c, body, BX, yb, anchor=(0.5, 1.0), sx=1 + sq * 0.6, sy=1 - sq, rot=wig, alpha=ba, cam=cam)
        # lid
        lt = prog(t, TL.LID_POP, TL.LID_POP + 0.42)
        ly = yb - body.height * (1 - sq) + 14 - 950 * e_out_cubic(lt)
        lx = BX + 300 * e_out_cubic(lt)
        place(c, lid, lx, ly, anchor=(0.5, 1.0), rot=wig + 38 * e_out_cubic(lt), alpha=(1 - prog(lt, 0.6, 1.0)) * ba, cam=cam)
        # reward card rises out of the box
        r = prog(t, TL.LID_POP + 0.02, TL.LID_POP + 0.42)
        if r > 0:
            ex = e_in_cubic(prog(t, 14.0, 14.22))
            place(c, A['reward'], lerp(BX, 505, r) - 1100 * ex, lerp(BY - body.height, 1000, e_out_cubic(r)),
                  scale=0.2 + 0.8 * e_out_back(r, 1.7), rot=-16 * ex, cam=cam)
        draw_confetti(c, A['confetti2'], t, TL.LID_POP, cam=cam, life=1.3)
        draw_sparkles(c, A['spark5'], t, TL.LID_POP, dur=0.7, cam=cam)
    # QR phone turns in, is shown to the till, gets scanned
    if t >= TL.T_QR_IN[0]:
        ph = A['phone_qr']
        q = prog(t, *TL.T_QR_IN)
        x = lerp(1600, 505, e_out_cubic(q))
        ang = 78 * (1 - e_out_back(q, 1.6))
        show = e_inout_cubic(prog(t, 14.5, 14.7))
        exit_ = e_in_cubic(prog(t, 15.3, 15.5))
        sc = 0.671 * (1 + 0.1 * show) * (1 + 0.5 * exit_)
        x -= 1300 * exit_
        roll = -22 * exit_
        cy = 1125
        sx_, sy_ = cam.apply(x, cy)
        w_, h_ = ph.width * sc * cam.zoom, ph.height * sc * cam.zoom
        if abs(ang) > 0.05 or roll:
            place_quad(c, ph, rot_y_quad(sx_, sy_, w_, h_, ang, persp=2600, roll_deg=roll))
        else:
            place(c, ph, x, cy, scale=sc, cam=cam)
        # scan line over the QR
        s = prog(t, *TL.SCAN)
        if 0 < s < 1 and exit_ == 0:
            qx0, qy0 = phone_pt(x, cy, sc, ui.PW / 2, 180)
            qx1, qy1 = phone_pt(x, cy, sc, ui.PW / 2, 450)
            yy = lerp(qy0, qy1, 0.5 - 0.5 * math.cos(2 * math.pi * s))
            place(c, A['scan'], qx0, yy, scale=sc / 0.671 * 1.05, alpha=1.0, cam=cam)
        if t >= TL.SCAN[1] and exit_ < 1:
            b = prog(t, TL.SCAN[1], TL.SCAN[1] + 0.3)
            bx, by = phone_pt(x, cy, sc, 330, 470)
            place(c, A['check'], bx, by, scale=e_out_back(b, 2.5), alpha=1 - exit_, cam=cam)
    A['cap5'].draw(c, t, 13.06, 15.28, cam=cam)


def final_layer(c, t, cam):
    F = A['final']
    # phone slides in from the right while spinning, lands like on the flyer
    q = prog(t, *TL.T_FINAL)
    pcx, pcy = F['phone_c']
    if q > 0:
        e = e_out_cubic(q)
        x = lerp(1500, pcx, e)
        y = lerp(1750, pcy, e)
        roll = 34 * (1 - e_out_back(q, 1.7))
        ang = 55 * (1 - e_out_cubic(prog(t, TL.T_FINAL[0], TL.T_FINAL[1] - 0.12)))
        s = F['phone_s'] * lerp(0.6, 1.0, e_out_back(q, 1.2))
        ph = A['phone_home']
        if q >= 1:
            place(c, ph, pcx, pcy, scale=F['phone_s'], cam=cam, static=True)
        else:
            sx_, sy_ = cam.apply(x, y)
            place_quad(c, ph, rot_y_quad(sx_, sy_, ph.width * s * cam.zoom, ph.height * s * cam.zoom, ang, persp=2400, roll_deg=roll))
    # logo
    lp = prog(t, 15.42, 15.78)
    if lp > 0:
        lx, ly = F['logo_c']
        place(c, A['logo'], lx, ly, scale=F['logo_s'] * max(0.02, e_out_back(lp, 1.8)), rot=-120 * (1 - e_out_cubic(lp)), cam=cam, static=lp >= 1)
    # left column
    items = [('decouvrez', 15.5), ('application', 15.56), ('tag1', 15.66), ('tag2', 15.7), ('scannez', 15.72)]
    for key, t0 in items:
        spr, x, y, _ = F[key]
        p = prog(t, t0, t0 + 0.3)
        if p <= 0:
            continue
        dx = -260 * (1 - e_out_back(p, 1.4))
        place(c, spr, x + dx, y, anchor=(0, 0), alpha=clamp(p * 2.5), cam=cam, static=p >= 1)
    ul, (ux, uy) = F['underline']
    p = prog(t, 15.66, 15.9)
    if p > 0:
        place(c, ul, ux, uy, anchor=(0, 0), sx=max(0.02, e_out_cubic(p)), cam=cam, static=p >= 1)
    p = prog(t, 15.7, 16.0)
    if p > 0:
        qx, qy = F['qr_c']
        place(c, F['qr'], qx, qy, scale=max(0.02, e_out_back(p, 1.9)), rot=-25 * (1 - e_out_cubic(p)), cam=cam, static=p >= 1)
    for key, t0 in (('badge_a', 15.76), ('badge_g', 15.82)):
        p = prog(t, t0, t0 + 0.22)
        if p > 0:
            bx, by = F[key + '_c']
            place(c, F[key], bx, by + 140 * (1 - e_out_back(p, 1.5)), alpha=clamp(p * 2), cam=cam, static=p >= 1)
    p = prog(t, 15.8, 16.04)
    if p > 0:
        cx_, cy_ = F['cta_c']
        place(c, F['cta'], cx_, cy_ + 60 * (1 - e_out_back(p, 1.6)), scale=0.9 + 0.1 * e_out_back(p), alpha=clamp(p * 2), cam=cam, static=p >= 1)


def render(t):
    """Render one (sharp) instant. Returns RGBA canvas."""
    build_assets()
    ox, oy, rr = shake(t)
    zoom = 1.0
    # gentle camera push-ins for energy
    if TL.S4 <= t < TL.T_FLIP[0]:
        zoom = 1 + 0.035 * e_inout_cubic(prog(t, 10.3, 12.8))
    elif TL.S2 + 0.4 <= t < 5.5:
        zoom = 1 + 0.025 * e_inout_cubic(prog(t, 2.9, 5.4))
    for ti, amt in ((0.72, 0.05), (2.8, 0.04), (TL.SPIN1, 0.05), (TL.T_SHRINK[1], 0.04), (TL.COUNT1, 0.04),
                    (TL.GIFT_LAND, 0.05)):
        if 0 <= t - ti < 0.8:
            zoom += amt * math.exp(-(t - ti) * 9) * math.cos(2 * math.pi * 1.6 * (t - ti))
    cam = Cam(zoom=zoom, cx=W / 2, cy=1000, ox=ox, oy=oy, rot=rr)
    dark_full = TL.T_EXPAND[1] + 0.02 <= t < TL.T_SHRINK[0]
    c = A['dark'].copy() if dark_full else A['bg'].copy()
    if not dark_full:
        draw_decor(c, t, cam)
    if t < TL.T_WHIP1[1] + 0.02:
        scene1(c, t, cam)
    if TL.T_WHIP1[0] <= t < TL.T_EXPAND[0]:
        scene2(c, t, cam)
    if TL.T_FLYCAM[0] <= t < TL.T_EXPAND[0]:
        pass
    if TL.T_EXPAND[0] <= t < TL.T_SHRINK[0]:
        scene3(c, t, cam)
    if TL.T_SHRINK[0] <= t < TL.T_FLIP[1] + 0.01:
        scene4(c, t, cam)
    if 12.9 <= t < 15.52:
        scene5(c, t, cam)
    if t >= TL.T_FINAL[0]:
        final_layer(c, t, cam)
    return c


def motion_samples(t):
    """Sub-frame samples for motion blur (rotations of the wheel and logo are blurred exactly in polar space)."""
    n = 1
    if 0.04 <= t < 0.72:
        n = 4
    if TL.T_WHIP1[0] - 0.02 <= t < TL.T_WHIP1[1] + 0.3:
        n = 32
    if any(t0 <= t < t0 + 0.42 for t0 in TL.FLY_OUT):
        n = max(n, 12)
    if TL.T_FLYCAM[0] <= t < TL.T_FLYCAM[1]:
        n = max(n, 28)
    if TL.T_EXPAND[0] <= t < TL.T_EXPAND[1]:
        n = max(n, 12)
    if 6.45 <= t < 7.35:
        n = max(n, 6)       # finger in/out
    if TL.T_SHRINK[0] <= t < TL.T_SHRINK[1]:
        n = max(n, 12)
    if 12.84 <= t < TL.GIFT_LAND:
        n = max(n, 16)
    if TL.LID_POP <= t < TL.LID_POP + 0.4:
        n = max(n, 12)
    if 13.98 <= t < TL.T_QR_IN[1]:
        n = max(n, 24)
    if 15.26 <= t < TL.T_FINAL[1]:
        n = max(n, 24)
    return n


def shutter(t):
    return 0.5


def render_frame(fi):
    t = fi / FPS
    if t >= TL.HOLD_START:
        t = TL.HOLD_START
    n = motion_samples(t)
    if n <= 1:
        return render(t).convert('RGB')
    sh = shutter(t) / FPS
    acc = None
    for i in range(n):
        ts = t + (i / (n - 1) - 0.5) * sh
        arr = np.asarray(render(ts).convert('RGB'), dtype=np.float32)
        acc = arr if acc is None else acc + arr
    return Image.fromarray(np.clip(acc / n + 0.5, 0, 255).astype(np.uint8), 'RGB')
