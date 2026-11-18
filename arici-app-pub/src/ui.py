"""App UI sprites rebuilt in vector (Pillow) in the ARICI flyer style."""
import math
import os
import re
import functools

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from common import (ROOT, W, H, CREAM, SCREEN_BG, ESPRESSO, CARAMEL, CARAMEL_LIGHT, COPPER, TITLE_BROWN, INK,
                    WHITE, GOLD, GREY_TXT, font, rrect, rrect_mask, ellipse_mask, circle, gradient, radial,
                    arr_to_rgba, draw_text, text_sprite, drop_shadow, new, solid_with_mask)

LAYERS = os.path.join(ROOT, 'ref', 'layers')
PHOTOS = os.path.join(ROOT, 'assets', 'photos')

PW, PH = 393, 788  # phone screen in points (flyer proportions)


def layer(n):
    return Image.open(os.path.join(LAYERS, 'L%02d.png' % n)).convert('RGBA')


@functools.lru_cache(maxsize=None)
def photo(name):
    return Image.open(os.path.join(PHOTOS, name + '.png')).convert('RGB')


def cover(img, w, h, focus=(0.5, 0.5)):
    """Center-crop + resize an RGB image to exactly w x h."""
    w, h = int(round(w)), int(round(h))
    iw, ih = img.size
    s = max(w / iw, h / ih)
    nw, nh = int(math.ceil(iw * s)), int(math.ceil(ih * s))
    r = img.resize((nw, nh), Image.LANCZOS)
    x0 = int((nw - w) * focus[0]); y0 = int((nh - h) * focus[1])
    return r.crop((x0, y0, x0 + w, y0 + h))


# ------------------------------------------------------------------ logos
@functools.lru_cache(maxsize=None)
def logo_round():
    """White round ARICI logo with black rings (from the flyer)."""
    return layer(27)


@functools.lru_cache(maxsize=None)
def logo_dark():
    """App avatar: black disc, thin white ring, white ARICI wordmark."""
    L = layer(27)
    c = 251
    r = 197
    crop = L.crop((c - r, c - r, c + r, c + r))
    rgb = ImageOps.invert(crop.convert('RGB'))
    m = ellipse_mask(2 * r, 2 * r)
    out = rgb.convert('RGBA')
    out.putalpha(m)
    return out


# ------------------------------------------------------------------ icons (drawn at high res)
def _icon_canvas(size, ss=4):
    big = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0))
    return big, ImageDraw.Draw(big), ss


def _finish(big, size):
    return big.resize((size, size), Image.LANCZOS)


def icon(name, size, color=INK, width=None):
    big, d, ss = _icon_canvas(size)
    S = size * ss
    lw = int((width or max(1.6, size / 13)) * ss)
    col = tuple(color[:3]) + (255,)

    def P(x, y):
        return (x * S, y * S)

    if name == 'qr':
        for (x, y) in [(0.12, 0.12), (0.58, 0.12), (0.12, 0.58)]:
            d.rounded_rectangle((*P(x, y), *P(x + 0.3, y + 0.3)), radius=0.07 * S, outline=col, width=lw)
            d.rectangle((*P(x + 0.105, y + 0.105), *P(x + 0.195, y + 0.195)), fill=col)
        for (x, y) in [(0.6, 0.6), (0.78, 0.6), (0.6, 0.78), (0.8, 0.8), (0.7, 0.7)]:
            d.rectangle((*P(x, y), *P(x + 0.1, y + 0.1)), fill=col)
    elif name == 'gift':
        d.rounded_rectangle((*P(0.14, 0.4), *P(0.86, 0.88)), radius=0.06 * S, outline=col, width=lw)
        d.rounded_rectangle((*P(0.08, 0.27), *P(0.92, 0.42)), radius=0.05 * S, outline=col, width=lw)
        d.line((*P(0.5, 0.27), *P(0.5, 0.88)), fill=col, width=lw)
        d.arc((*P(0.26, 0.08), *P(0.52, 0.32)), 150, 400, fill=col, width=lw)
        d.arc((*P(0.48, 0.08), *P(0.74, 0.32)), 140, 390, fill=col, width=lw)
    elif name == 'cupcake':
        d.polygon([P(0.22, 0.5), P(0.78, 0.5), P(0.68, 0.9), P(0.32, 0.9)], outline=col, width=lw)
        for x in (0.4, 0.5, 0.6):
            d.line((*P(x, 0.52), *P(x - 0.02 if x < 0.5 else x + 0.02 if x > 0.5 else x, 0.88)), fill=col, width=max(1, lw // 2))
        d.arc((*P(0.16, 0.2), *P(0.84, 0.72)), 180, 360, fill=col, width=lw)
        d.line((*P(0.16, 0.47), *P(0.84, 0.47)), fill=col, width=lw)
        d.ellipse((*P(0.45, 0.08), *P(0.55, 0.18)), outline=col, width=lw)
    elif name == 'shop':
        d.rectangle((*P(0.14, 0.42), *P(0.86, 0.88)), outline=col, width=lw)
        d.polygon([P(0.1, 0.42), P(0.18, 0.14), P(0.82, 0.14), P(0.9, 0.42)], outline=col, width=lw)
        for x in (0.3, 0.5, 0.7):
            d.line((*P(x, 0.16), *P(x - 0.02 if x < 0.5 else x + 0.02 if x > 0.5 else x, 0.42)), fill=col, width=max(1, lw // 2))
        d.rectangle((*P(0.4, 0.6), *P(0.6, 0.88)), outline=col, width=lw)
        d.rectangle((*P(0.2, 0.5), *P(0.34, 0.64)), outline=col, width=max(1, lw // 2))
    elif name == 'pin':
        d.ellipse((*P(0.2, 0.06), *P(0.8, 0.66)), outline=col, width=lw)
        d.polygon([P(0.26, 0.5), P(0.5, 0.94), P(0.74, 0.5)], fill=col)
        d.ellipse((*P(0.24, 0.1), *P(0.76, 0.62)), fill=(0, 0, 0, 0))
        d.ellipse((*P(0.2, 0.06), *P(0.8, 0.66)), outline=col, width=lw)
        d.ellipse((*P(0.38, 0.24), *P(0.62, 0.48)), outline=col, width=lw)
    elif name == 'bell':
        d.arc((*P(0.2, 0.12), *P(0.8, 0.72)), 180, 360, fill=col, width=lw)
        d.line((*P(0.2, 0.42), *P(0.2, 0.66)), fill=col, width=lw)
        d.line((*P(0.8, 0.42), *P(0.8, 0.66)), fill=col, width=lw)
        d.line((*P(0.1, 0.72), *P(0.9, 0.72)), fill=col, width=lw)
        d.line((*P(0.2, 0.66), *P(0.1, 0.72)), fill=col, width=lw)
        d.line((*P(0.8, 0.66), *P(0.9, 0.72)), fill=col, width=lw)
        d.arc((*P(0.38, 0.72), *P(0.62, 0.92)), 0, 180, fill=col, width=lw)
    elif name == 'search':
        d.ellipse((*P(0.1, 0.1), *P(0.72, 0.72)), outline=col, width=lw)
        d.line((*P(0.64, 0.64), *P(0.9, 0.9)), fill=col, width=lw)
    elif name == 'home':
        d.polygon([P(0.12, 0.46), P(0.5, 0.12), P(0.88, 0.46)], outline=col, width=lw)
        d.rectangle((*P(0.2, 0.44), *P(0.8, 0.88)), outline=col, width=lw)
        d.rectangle((*P(0.42, 0.6), *P(0.58, 0.88)), outline=col, width=lw)
    elif name == 'wheat':
        d.line((*P(0.2, 0.92), *P(0.78, 0.18)), fill=col, width=lw)
        for i in range(4):
            t = 0.25 + i * 0.16
            cx, cy = 0.2 + (0.78 - 0.2) * t, 0.92 + (0.18 - 0.92) * t
            d.ellipse((*P(cx - 0.17, cy - 0.06), *P(cx - 0.01, cy + 0.06)), outline=col, width=lw)
            d.ellipse((*P(cx + 0.0, cy - 0.12), *P(cx + 0.16, cy + 0.0)), outline=col, width=lw)
    elif name == 'user':
        d.ellipse((*P(0.32, 0.1), *P(0.68, 0.46)), outline=col, width=lw)
        d.arc((*P(0.14, 0.56), *P(0.86, 1.2)), 180, 360, fill=col, width=lw)
    elif name == 'coins':
        d.ellipse((*P(0.08, 0.3), *P(0.58, 0.8)), outline=col, width=lw)
        d.ellipse((*P(0.42, 0.2), *P(0.92, 0.7)), outline=col, width=lw)
        d.line((*P(0.67, 0.34), *P(0.67, 0.56)), fill=col, width=lw)
        d.line((*P(0.6, 0.36), *P(0.67, 0.34)), fill=col, width=lw)
    elif name == 'retry':
        d.arc((*P(0.14, 0.14), *P(0.86, 0.86)), 300, 240 + 360 - 20, fill=col, width=lw)
        d.polygon([P(0.66, 0.02), P(0.82, 0.2), P(0.58, 0.26)], fill=col)
    elif name == 'coffee':
        d.rounded_rectangle((*P(0.14, 0.34), *P(0.7, 0.86)), radius=0.08 * S, outline=col, width=lw)
        d.arc((*P(0.58, 0.44), *P(0.9, 0.72)), 270, 90, fill=col, width=lw)
        for x in (0.3, 0.42, 0.54):
            d.arc((*P(x - 0.05, 0.08), *P(x + 0.05, 0.28)), 90, 270, fill=col, width=max(1, lw // 2))
    elif name == 'croissant':
        d.chord((*P(0.06, 0.22), *P(0.94, 1.02)), 195, 345, outline=col, width=lw)
        for x0, x1 in ((0.3, 0.34), (0.5, 0.5), (0.7, 0.66)):
            d.line((*P(x0, 0.27), *P(x1, 0.5)), fill=col, width=lw)
    elif name == 'check':
        d.line((*P(0.18, 0.52), *P(0.42, 0.76)), fill=col, width=lw)
        d.line((*P(0.42, 0.76), *P(0.84, 0.28)), fill=col, width=lw)
    elif name == 'apple':
        pass
    return _finish(big, size)


# ------------------------------------------------------------------ phone frame
class Phone:
    """iPhone-style frame (natural titanium rim, black bezel, dynamic island) around a screen of size sw x sh."""

    def __init__(self, sw, sh):
        self.sw, self.sh = int(sw), int(sh)
        b = int(round(0.047 * sw))  # rim + bezel each side
        self.b = b
        self.btn = int(round(0.022 * sw))
        self.bw, self.bh = self.sw + 2 * b, self.sh + 2 * b
        self.w, self.h = self.bw + 2 * self.btn, self.bh
        self.sx, self.sy = self.btn + b, b  # screen origin inside sprite
        self.r_body = 0.165 * self.bw
        self.r_screen = self.r_body - b
        self.frame = self._frame()
        self.screen_mask = rrect_mask(self.sw, self.sh, self.r_screen)

    def _frame(self):
        ss = 2
        Wd, Hd = self.w * ss, self.h * ss
        img = Image.new('RGBA', (Wd, Hd), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        bx0 = self.btn * ss
        bw, bh = self.bw * ss, self.bh * ss
        R = self.r_body * ss
        u = self.sw * ss / 100.0  # unit
        # side buttons (titanium)
        btn_col = (150, 146, 140, 255)
        for (yy, hh) in [(0.17, 0.045), (0.25, 0.085), (0.355, 0.085)]:
            d.rounded_rectangle((bx0 - self.btn * ss, yy * bh, bx0 + 6 * ss, (yy + hh) * bh), radius=1.2 * u, fill=btn_col)
        d.rounded_rectangle((bx0 + bw - 6 * ss, 0.27 * bh, bx0 + bw + self.btn * ss, 0.39 * bh), radius=1.2 * u, fill=btn_col)
        # body layers: dark outline, light titanium rim, dark inner band, black bezel
        layers = [(0.0, (46, 42, 40, 255)), (0.28, (196, 192, 186, 255)), (0.7, (238, 235, 231, 255)),
                  (1.15, (128, 124, 118, 255)), (1.5, (54, 52, 50, 255)), (1.9, (6, 6, 6, 255))]
        for inset_u, col in layers:
            ins = inset_u * u
            d.rounded_rectangle((bx0 + ins, ins, bx0 + bw - ins, bh - ins), radius=max(1, R - ins), fill=col)
        img = img.resize((self.w, self.h), Image.LANCZOS)
        # cut screen hole
        hole = Image.new('L', (self.w, self.h), 0)
        hole.paste(rrect_mask(self.sw, self.sh, self.r_screen), (self.sx, self.sy))
        a = np.asarray(img.getchannel('A')).astype(np.int16) - np.asarray(hole).astype(np.int16)
        img.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
        return img

    def compose(self, screen, island=True, status=True, status_dark=True):
        """screen: RGBA/RGB of size (sw, sh). Returns full phone RGBA."""
        out = new(self.w, self.h)
        scr = screen.convert('RGBA')
        if scr.size != (self.sw, self.sh):
            scr = scr.resize((self.sw, self.sh), Image.LANCZOS)
        scr = scr.copy()
        if status:
            self.status_bar(scr, dark=status_dark)
        if island:
            iw, ih = int(0.30 * self.sw), int(0.085 * self.sw)
            isl = rrect(iw, ih, ih / 2, (5, 5, 5))
            scr.alpha_composite(isl, ((self.sw - iw) // 2, int(0.026 * self.sw)))
            cam = circle(int(ih * 0.36), (22, 26, 40))
            scr.alpha_composite(cam, ((self.sw + iw) // 2 - int(ih * 0.75), int(0.026 * self.sw) + int(ih * 0.32)))
        m = Image.new('L', scr.size, 0)
        m.paste(self.screen_mask, (0, 0))
        scr.putalpha(Image.fromarray(np.minimum(np.asarray(scr.getchannel('A')), np.asarray(self.screen_mask))))
        out.alpha_composite(scr, (self.sx, self.sy))
        out.alpha_composite(self.frame)
        # subtle glass reflection
        return out

    def status_bar(self, scr, dark=True):
        k = self.sw / PW
        col = (16, 14, 12) if dark else (250, 248, 245)
        d = ImageDraw.Draw(scr)
        cy = 0.026 * self.sw + 0.0425 * self.sw
        f = font('inter', 15.5 * k, 640)
        d.text((40 * k, cy), '9:41', font=f, fill=col + (255,), anchor='lm')
        # signal bars
        x0 = PW * k - 108 * k
        for i in range(4):
            hh = (4 + 2.6 * i) * k
            d.rounded_rectangle((x0 + i * 5.2 * k, cy + 5.5 * k - hh, x0 + i * 5.2 * k + 3.4 * k, cy + 5.5 * k), radius=1 * k, fill=col + (255,))
        # wifi
        wx, wy = PW * k - 76 * k, cy + 5 * k
        for i, rr in enumerate((12.5, 8.4, 4.2)):
            d.pieslice((wx - rr * k, wy - rr * k, wx + rr * k, wy + rr * k), 225, 315, fill=col + (255,))
            inner = rr - 2.6
            if inner > 0:
                d.pieslice((wx - inner * k, wy - inner * k, wx + inner * k, wy + inner * k), 225, 315, fill=scr.getpixel((int(wx), int(wy - 30 * k))))
        # battery
        bx, by = PW * k - 56 * k, cy - 6 * k
        d.rounded_rectangle((bx, by, bx + 25 * k, by + 12 * k), radius=3.5 * k, outline=col + (110,), width=max(1, int(1.1 * k)))
        d.rounded_rectangle((bx + 2 * k, by + 2 * k, bx + 23 * k, by + 10 * k), radius=2 * k, fill=col + (255,))
        d.rounded_rectangle((bx + 26.2 * k, by + 4 * k, bx + 27.8 * k, by + 8 * k), radius=1 * k, fill=col + (120,))


# ------------------------------------------------------------------ screen painter (points units)
class Painter:
    def __init__(self, k, w=PW, h=PH, bg=SCREEN_BG):
        self.k = k
        bg = tuple(bg) if len(bg) == 4 else tuple(bg) + (255,)
        self.img = Image.new('RGBA', (int(round(w * k)), int(round(h * k))), bg)

    def rr(self, x, y, w, h, r, fill, shadow=None, outline=None, width=0):
        k = self.k
        im = rrect(w * k, h * k, r * k, fill, outline=outline, width=width * k)
        if shadow:
            blur, oy, op = shadow
            im2, pad = drop_shadow(im, blur=int(blur * k), offset=(0, int(oy * k)), opacity=op)
            self.img.alpha_composite(im2, (int(round(x * k)) - pad, int(round(y * k)) - pad))
        else:
            self.img.alpha_composite(im, (int(round(x * k)), int(round(y * k))))
        return im

    def paste(self, im, x, y):
        self.img.alpha_composite(im, (int(round(x * self.k)), int(round(y * self.k))))

    def text(self, x, y, s, fam, size, weight, fill, anchor='ls', tracking=0.0):
        draw_text(self.img, (x * self.k, y * self.k), s, font(fam, size * self.k, weight), fill, tracking * self.k, anchor)

    def textw(self, s, fam, size, weight):
        return font(fam, size * self.k, weight).getlength(s) / self.k

    def icon(self, name, x, y, size, color=INK, width=None):
        im = icon(name, int(round(size * self.k)), color, (width * self.k) if width else None)
        self.paste(im, x, y)


def points_card_gradient(w, h):
    g = gradient(w, h, [(0.0, (206, 128, 54)), (0.38, (160, 98, 42)), (0.72, (66, 40, 20)), (1.0, (24, 18, 13))], 28)
    # soft highlight top-left
    hl = radial(w, h, w * 0.12, h * 0.05, max(w, h) * 0.7, [(0, (40,)), (1, (0,))])
    g = g + hl
    return g


def draw_points_card(p, x, y, w, h, pts=174, prog=0.87, label='Encore 26 pts : croissant', shine=0.0):
    """Draw the MES POINTS card in points units on painter p."""
    k = p.k
    g = points_card_gradient(int(w * k), int(h * k))
    card = arr_to_rgba(g, rrect_mask(w * k, h * k, 22 * k))
    if shine > 0:
        # diagonal light sweep
        ww, hh = card.size
        ys, xs = np.mgrid[0:hh, 0:ww].astype(np.float32)
        pos = (xs + ys * 0.6) / (ww + hh * 0.6)
        band = np.exp(-((pos - (shine * 1.4 - 0.2)) / 0.06) ** 2) * 120
        arr = np.asarray(card).astype(np.float32)
        arr[..., :3] += band[..., None]
        card = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    sh, pad = drop_shadow(card, blur=int(14 * k), offset=(0, int(8 * k)), opacity=0.28)
    p.img.alpha_composite(sh, (int(x * k) - pad, int(y * k) - pad))
    lab = (252, 232, 208)
    p.text(x + 18, y + 34, 'MES POINTS', 'mont', 11.5, 620, lab, tracking=2.3)
    fnum = font('mont', 50 * k, 800)
    num = str(pts)
    p.text(x + 16, y + 86, num, 'mont', 50, 800, WHITE)
    nw = fnum.getlength(num) / k
    p.text(x + 16 + nw + 5, y + 86, 'pts', 'mont', 17, 700, WHITE)
    # progress bar
    bx, by, bw, bh = x + 18, y + 94, w - 36, 6
    p.rr(bx, by, bw, bh, 3, (255, 255, 255, 70))
    fw = max(bh, bw * min(1.0, prog))
    p.rr(bx, by, fw, bh, 3, (255, 255, 255, 255))
    p.text(x + 18, y + 132, label, 'inter', 12.5, 420, lab)
    # Mon QR button
    qx, qy = x + w - 133, y + 107
    p.rr(qx, qy, 115, 38, 19, (255, 255, 255, 255))
    p.icon('qr', qx + 14, qy + 10, 18, INK)
    p.text(qx + 38, qy + 25, 'Mon QR', 'mont', 14, 700, INK)


# ------------------------------------------------------------------ wheel
SEGMENTS = [  # clockwise from top
    ('20 points', 'black', 'coins'),
    ('Perdu', 'cream', 'retry'),
    ('50 points', 'black', 'coins'),
    ('Un café', 'caramel', 'coffee'),
    ('10 points', 'black', 'coins'),
    ('Perdu', 'cream', 'retry'),
    ('100 points', 'black', 'coins'),
    ('Viennoiserie', 'caramel', 'croissant'),
]
SEG_COL = {'black': (12, 11, 10), 'cream': (244, 234, 220), 'caramel': (186, 128, 72)}
WIN_INDEX = 2  # '50 points'


def wheel_disc(D, ss=2, highlight=None):
    """Rotating part of the wheel (segments, labels, icons). D = diameter in px."""
    S = D * ss
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    n = len(SEGMENTS)
    for i, (lab, col, ic) in enumerate(SEGMENTS):
        c = SEG_COL[col]
        a0 = -90 + i * 45 - 22.5
        d.pieslice((0, 0, S - 1, S - 1), a0, a0 + 45, fill=c + (255,))
    # thin separators
    for i in range(n):
        a = math.radians(-90 + i * 45 - 22.5)
        d.line((S / 2, S / 2, S / 2 + math.cos(a) * S / 2, S / 2 + math.sin(a) * S / 2), fill=(30, 22, 16, 255), width=int(ss * D / 500))
    # outer ring line
    d.ellipse((0, 0, S - 1, S - 1), outline=(186, 128, 72, 255), width=int(ss * D / 260))
    img = img.resize((D, D), Image.LANCZOS)
    R = D / 2
    for i, (lab, col, ic) in enumerate(SEGMENTS):
        tc = WHITE if col == 'black' else INK
        theta = i * 45  # clockwise from up
        # label sprite reading outward
        fs = D * 0.041
        f = font('mont', fs, 640)
        while f.getlength(lab) > R * 0.5 and fs > 8:
            fs *= 0.95
            f = font('mont', fs, 640)
        spr, base = text_sprite(lab, f, tc)
        # rotate so text direction points outward: text dir angle (screen, clockwise from +x) = theta - 90
        ang = theta - 90
        rs = spr.rotate(-ang, resample=Image.BICUBIC, expand=True)
        rr_ = R * 0.56
        cx = R + math.sin(math.radians(theta)) * rr_
        cy = R - math.cos(math.radians(theta)) * rr_
        img.alpha_composite(rs, (int(cx - rs.width / 2), int(cy - rs.height / 2)))
        isz = int(D * 0.062)
        ico = icon(ic, isz, tc, width=max(1.5, isz / 12))
        ico = ico.rotate(-(theta), resample=Image.BICUBIC, expand=True)
        ri = R * 0.885
        cx = R + math.sin(math.radians(theta)) * ri
        cy = R - math.cos(math.radians(theta)) * ri
        img.alpha_composite(ico, (int(cx - ico.width / 2), int(cy - ico.height / 2)))
    return img


def wheel_hub(D):
    hub_d = int(D * 0.27)
    ring = circle(hub_d, (186, 128, 72))
    inner = circle(int(hub_d * 0.86), (10, 10, 10))
    ring.alpha_composite(inner, ((hub_d - inner.width) // 2, (hub_d - inner.height) // 2))
    lg = logo_dark().resize((int(hub_d * 0.8), int(hub_d * 0.8)), Image.LANCZOS)
    ring.alpha_composite(lg, ((hub_d - lg.width) // 2, (hub_d - lg.height) // 2))
    out, pad = drop_shadow(ring, blur=int(D * 0.02), offset=(0, int(D * 0.008)), opacity=0.5, color=(0, 0, 0))
    return out


def wheel_pointer(D):
    w = int(D * 0.085)
    h = int(w * 0.95)
    ss = 4
    big = Image.new('RGBA', (w * ss, h * ss), (0, 0, 0, 0))
    ImageDraw.Draw(big).polygon([(0, 0), (w * ss, 0), (w * ss / 2, h * ss)], fill=(255, 255, 255, 255))
    tri = big.resize((w, h), Image.LANCZOS)
    out, pad = drop_shadow(tri, blur=6, offset=(0, 4), opacity=0.55, color=(0, 0, 0))
    return out, pad


# ------------------------------------------------------------------ QR codes
def qr_modules_from_svg(path):
    s = open(path).read()
    m = re.search(r'viewBox="0 0 (\d+) (\d+)"', s)
    n = int(m.group(1))
    grid = np.zeros((n, n), bool)
    for path_d in re.findall(r'<path[^>]*stroke="#0B0B0B"[^>]*d="([^"]+)"', s) + re.findall(r'<path[^>]*d="([^"]+)"[^>]*stroke="#0B0B0B"', s):
        x = y = 0.0
        for cmd, a, b in re.findall(r'([MmHh])\s*([-\d.]+)(?:\s*([-\d.]+))?', path_d):
            if cmd == 'M':
                x, y = float(a), float(b)
            elif cmd == 'm':
                x, y = x + float(a), y + float(b)
            elif cmd in 'hH':
                L = float(a)
                x2 = x + L if cmd == 'h' else L
                row = int(math.floor(y))
                for c in range(int(round(min(x, x2))), int(round(max(x, x2)))):
                    grid[row, c] = True
                x = x2
    return grid


def qr_image(grid, module_px, quiet=0, fg=(11, 11, 11), bg=(255, 255, 255)):
    n = grid.shape[0]
    # trim existing quiet zone
    rows = np.where(grid.any(1))[0]; cols = np.where(grid.any(0))[0]
    g = grid[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    g = np.pad(g, quiet)
    img = np.where(g[..., None], np.array(fg, np.uint8), np.array(bg, np.uint8)).astype(np.uint8)
    im = Image.fromarray(img, 'RGB').resize((g.shape[1] * module_px, g.shape[0] * module_px), Image.NEAREST)
    return im.convert('RGBA')


def member_qr_grid():
    import qrcode
    q = qrcode.QRCode(version=3, error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    q.add_data('ARICI-FIDELITE-CAMILLE-000174')
    q.make(fit=False)
    return np.array(q.get_matrix(), bool)


# ------------------------------------------------------------------ screens
def screen_home(k, pts=174, prog=0.87, label='Encore 26 pts : croissant', wheel_angle=0.0):
    """Home screen exactly like the flyer."""
    p = Painter(k)
    # header
    lg = logo_dark().resize((int(46 * k), int(46 * k)), Image.LANCZOS)
    sh, pad = drop_shadow(lg, blur=int(4 * k), offset=(0, int(2 * k)), opacity=0.25)
    p.img.alpha_composite(sh, (int(15 * k) - pad, int(67 * k) - pad))
    p.text(70, 83, 'Bonjour', 'inter', 15, 400, (70, 62, 56))
    p.text(69, 110, 'Camille', 'mont', 24, 800, (20, 16, 12))
    p.rr(236, 72, 82, 36, 18, (255, 255, 255, 255), shadow=(6, 2, 0.12))
    p.icon('pin', 250, 81, 17, (205, 120, 45), width=1.8)
    p.text(272, 96, 'Bron', 'inter', 16, 600, (20, 16, 12))
    # bell
    bell = circle(int(42 * k), (255, 255, 255))
    sh, pad = drop_shadow(bell, blur=int(6 * k), offset=(0, int(2 * k)), opacity=0.12)
    p.img.alpha_composite(sh, (int(329 * k) - pad, int(69 * k) - pad))
    p.icon('bell', 339, 79, 22, (20, 16, 12), width=1.7)
    badge = circle(int(18 * k), (222, 138, 52))
    p.paste(badge, 357, 63)
    p.text(366, 77, '2', 'inter', 11.5, 700, (30, 18, 8), anchor='ms')
    # points card
    draw_points_card(p, 14, 132, 365, 164, pts, prog, label)
    # quick tiles
    tiles = ['qr_text', 'gift', 'cupcake', 'shop']
    for i, t in enumerate(tiles):
        tx = 26 + i * 92.3
        p.rr(tx, 316, 64, 64, 20, (255, 255, 255, 255), shadow=(7, 3, 0.10))
        if t == 'qr_text':
            p.text(tx + 32, 357, 'QR', 'inter', 21, 380, (60, 56, 52), anchor='ms')
        else:
            p.icon(t, tx + 15, 331, 34, (60, 56, 52), width=1.55)
    # roue du jour card
    draw_roue_card(p, 14, 400, 365, 132, wheel_angle)
    p.text(16, 578, 'En ce moment', 'mont', 20, 800, (20, 16, 12))
    draw_offer_card(p, 16, 597, 361, 148)
    p.rr(PW / 2 - 68, 776, 136, 5, 2.5, (20, 16, 12, 255))
    return p.img


@functools.lru_cache(maxsize=4)
def _wheel_small(px):
    return wheel_disc(px, ss=3)


def draw_roue_card(p, x, y, w, h, wheel_angle=0.0, hide_wheel=False, hide_text=False):
    k = p.k
    card = rrect(w * k, h * k, 22 * k, (14, 13, 12, 255))
    sh, pad = drop_shadow(card, blur=int(12 * k), offset=(0, int(6 * k)), opacity=0.3)
    # wheel clipped in the card (right side)
    if not hide_wheel:
        wd = int(150 * k)
        wh = _wheel_small(wd).rotate(-wheel_angle, resample=Image.BICUBIC)
        hub = wheel_hub(wd)
        tmp = new(*card.size)
        cx, cy = (w - 30) * k, (h / 2 + 2) * k
        tmp.alpha_composite(wh, (int(cx - wd / 2), int(cy - wd / 2)))
        tmp.alpha_composite(hub, (int(cx - hub.width / 2), int(cy - hub.height / 2)))
        m = np.minimum(np.asarray(tmp.getchannel('A')), np.asarray(card.getchannel('A')))
        tmp.putalpha(Image.fromarray(m))
        card = card.copy()
        card.alpha_composite(tmp)
        sh, pad = drop_shadow(card, blur=int(12 * k), offset=(0, int(6 * k)), opacity=0.3)
    p.img.alpha_composite(sh, (int(x * k) - pad, int(y * k) - pad))
    if not hide_text:
        p.text(x + 20, y + 34, 'LA ROUE DU JOUR', 'mont', 11.5, 620, (214, 146, 74), tracking=2.4)
        p.text(x + 20, y + 64, 'Tentez votre chance', 'mont', 19.5, 800, WHITE)
        p.rr(x + 20, y + 82, 92, 36, 18, (224, 144, 60, 255))
        p.text(x + 66, y + 106, 'Jouer', 'mont', 15, 700, (25, 18, 12), anchor='ms')


def draw_offer_card(p, x, y, w, h):
    k = p.k
    tex = layer(26).convert('RGB')
    tex = cover(tex, w * k, h * k).filter(ImageFilter.GaussianBlur(2 * k))
    arr = np.asarray(tex).astype(np.float32) * 0.92
    g = gradient(arr.shape[1], arr.shape[0], [(0, (1.0,)), (1, (0.7,))], 0)
    arr = arr * g
    card = arr_to_rgba(arr, rrect_mask(w * k, h * k, 22 * k))
    sh, pad = drop_shadow(card, blur=int(12 * k), offset=(0, int(6 * k)), opacity=0.3)
    p.img.alpha_composite(sh, (int(x * k) - pad, int(y * k) - pad))
    p.text(x + 18, y + 36, "L'OFFRE DU MOMENT", 'mont', 11.5, 620, (214, 146, 74), tracking=2.4)
    p.text(x + 18, y + 66, 'La formule petit-déjeuner', 'mont', 19, 800, WHITE)
    p.text(x + 18, y + 93, 'Une boisson chaude et une viennoiserie,', 'inter', 12.5, 380, (240, 230, 218))
    p.text(x + 18, y + 111, 'dans nos trois boulangeries.', 'inter', 12.5, 380, (240, 230, 218))


PRODUCTS = [
    ('croissant', 'Croissant', '+11 pts', (0.5, 0.75)),
    ('pain_chocolat', 'Pain au chocolat', '+12 pts', (0.5, 0.5)),
    ('baguette', 'Baguette tradition', '+13 pts', (0.5, 0.5)),
    ('pains_speciaux', 'Pains spéciaux', '+23 pts', (0.5, 0.5)),
    ('tartelettes', 'Tartelettes', None, (0.2, 0.7)),
    ('eclairs', 'Éclairs', None, (0.7, 0.6)),
]
CARD_W, CARD_PH, CARD_H = 169, 124, 212


def product_card(k, idx, shadow=True):
    key, name, pts, focus = PRODUCTS[idx]
    w, ph, h = CARD_W * k, CARD_PH * k, CARD_H * k
    card = rrect(w, h, 18 * k, (255, 255, 255, 255))
    ph_img = cover(photo(key), w, ph, focus).convert('RGBA')
    m = rrect_mask(w, h, 18 * k).crop((0, 0, int(round(w)), int(round(ph))))
    ph_img.putalpha(m)
    card.alpha_composite(ph_img, (0, 0))
    lines = [name] if len(name) < 15 else name.split(' ', 1)
    by = (CARD_PH + 27) * k
    for li, ln in enumerate(lines):
        draw_text(card, (14 * k, by + li * 18 * k), ln, font('mont', 14.5 * k, 600), INK)
    if pts:
        draw_text(card, (14 * k, (CARD_H - 16) * k), pts, font('mont', 16 * k, 800), (140, 86, 34))
    else:
        draw_text(card, (14 * k, (CARD_H - 16) * k), 'Pâtisseries', font('inter', 13 * k, 450), (150, 140, 130))
    if shadow:
        return drop_shadow(card, blur=int(9 * k), offset=(0, int(4 * k)), opacity=0.13)
    return card, 0


def products_content(k, rows=6):
    """Tall scrollable grid (points units width PW)."""
    pitch = CARD_H + 12
    hgt = 12 + rows * pitch + 120
    img = Image.new('RGBA', (int(PW * k), int(hgt * k)), SCREEN_BG + (255,))
    order = [0, 1, 2, 3, 4, 5, 2, 0, 1, 3, 5, 4]
    pos = []
    for r in range(rows):
        for c in range(2):
            idx = order[(r * 2 + c) % len(order)]
            spr, pad = product_card(k, idx)
            x = 22 + c * 180
            y = 8 + r * pitch
            img.alpha_composite(spr, (int(x * k) - pad, int(y * k) - pad))
            pos.append((idx, x, y))
    return img, pos


def screen_products_header(k):
    p = Painter(k, PW, 214)
    p.text(22, 98, 'Produits', 'mont', 32, 800, INK)
    p.rr(22, 112, 349, 46, 16, (255, 255, 255, 255), outline=(234, 222, 206), width=1.2)
    p.icon('search', 38, 125, 20, (110, 104, 98), width=1.8)
    p.text(66, 141, 'Rechercher un produit…', 'inter', 15.5, 400, (128, 122, 116))
    x = 22
    for i, ch in enumerate(['Tout', 'Viennoiseries', 'Pains', 'Pâtisseries']):
        tw = p.textw(ch, 'inter', 15, 500)
        wch = tw + 34
        if i == 0:
            p.rr(x, 168, wch, 38, 19, (14, 13, 12, 255))
            p.text(x + wch / 2, 192, ch, 'inter', 15, 500, WHITE, anchor='ms')
        else:
            p.rr(x, 168, wch, 38, 19, (255, 255, 255, 255), outline=(234, 222, 206), width=1.2)
            p.text(x + wch / 2, 192, ch, 'inter', 15, 500, INK, anchor='ms')
        x += wch + 8
    return p.img


def tab_bar(k, active='produits'):
    p = Painter(k, PW, 110, bg=(0, 0, 0))
    p.img = new(p.img.width, p.img.height)
    p.rr(14, 34, 365, 66, 33, (46, 40, 36, 248), shadow=(10, 4, 0.25))
    items = [('home', 'Accueil', 48), ('wheat', 'Produits', 118), (None, None, 196.5), ('pin', 'Boutiques', 275), ('user', 'Profil', 345)]
    for ic, lab, cx in items:
        if ic is None:
            continue
        col = (222, 150, 76) if lab.lower() == active else (226, 220, 214)
        p.icon(ic, cx - 11, 46, 22, col, width=1.7)
        p.text(cx, 88, lab, 'inter', 11.5, 500, col, anchor='ms')
    c = circle(int(68 * k), (220, 150, 80))
    g = gradient(c.width, c.height, [(0, (232, 168, 98)), (1, (196, 124, 56))], 90)
    cc = arr_to_rgba(g, c.getchannel('A'))
    sh, pad = drop_shadow(cc, blur=int(8 * k), offset=(0, int(4 * k)), opacity=0.35)
    p.img.alpha_composite(sh, (int((196.5 - 34) * k) - pad, int(10 * k) - pad))
    p.icon('qr', 196.5 - 15, 29, 30, (24, 18, 12), width=2.4)
    return p.img


def screen_products(k, content, header, tabs, scroll_pt, blur_px=0):
    img = Image.new('RGBA', (int(PW * k), int(PH * k)), SCREEN_BG + (255,))
    top = 214
    y0 = int(round(scroll_pt * k))
    visible_h = int((PH - top) * k)
    crop = content.crop((0, y0, content.width, y0 + visible_h))
    if blur_px > 1:
        arr = np.asarray(crop).astype(np.float32)
        n = int(min(24, blur_px))
        acc = np.zeros_like(arr)
        for i in range(n):
            acc += np.roll(arr, int(i - n / 2), axis=0)
        crop = Image.fromarray((acc / n).astype(np.uint8), 'RGBA')
    img.alpha_composite(crop, (0, int(top * k)))
    img.alpha_composite(header, (0, 0))
    img.alpha_composite(tabs, (0, int((PH - 110) * k)))
    return img


def screen_qr(k, pts=224):
    p = Painter(k)
    p.text(22, 100, 'Mon QR', 'mont', 30, 800, INK)
    p.text(22, 128, 'Présentez ce code en caisse', 'inter', 15, 420, (110, 102, 96))
    p.rr(22, 152, 349, 420, 30, (255, 255, 255, 255), shadow=(16, 8, 0.16))
    grid = member_qr_grid()
    n = grid.shape[0]
    mod = int((262 * k) // n)
    q = qr_image(grid, mod, quiet=0)
    p.paste(q, (PW - q.width / k) / 2, 182)
    p.text(PW / 2, 500, 'Camille', 'mont', 20, 700, INK, anchor='ms')
    p.text(PW / 2, 536, f'{pts} pts', 'mont', 24, 800, (150, 92, 38), anchor='ms')
    p.img.alpha_composite(tab_bar(k, active='none'), (0, int((PH - 110) * k)))
    return p.img


# ------------------------------------------------------------------ bigger illustrations (video px)
def gift_box(wb=440):
    """Front view gift box body + lid (separate) in caramel/espresso."""
    hb = int(wb * 0.66)
    body_g = gradient(wb, hb, [(0, (214, 140, 66)), (1, (168, 100, 42))], 90)
    body = arr_to_rgba(body_g, rrect_mask(wb, hb, wb * 0.05))
    d = ImageDraw.Draw(body)
    rw = int(wb * 0.16)
    rib = gradient(rw, hb, [(0, (60, 36, 20)), (1, (42, 26, 16))], 90)
    ribbon = arr_to_rgba(rib)
    body.alpha_composite(ribbon, ((wb - rw) // 2, 0))
    # shade at top of body (under lid)
    shade = gradient(wb, int(hb * 0.12), [(0, (0, 0, 0)), (1, (0, 0, 0))], 90)
    sh = arr_to_rgba(shade)
    sh.putalpha(Image.fromarray((np.linspace(90, 0, sh.height)[:, None] * np.ones((1, sh.width))).astype(np.uint8)))
    body.alpha_composite(sh, (0, 0))
    body.putalpha(rrect_mask(wb, hb, wb * 0.05))
    wl = int(wb * 1.1); hl = int(wb * 0.22)
    lid_g = gradient(wl, hl, [(0, (230, 158, 82)), (1, (190, 118, 50))], 90)
    lid = arr_to_rgba(lid_g, rrect_mask(wl, hl, wb * 0.05))
    lid.alpha_composite(arr_to_rgba(gradient(rw, hl, [(0, (66, 40, 22)), (1, (48, 30, 18))], 90)), ((wl - rw) // 2, 0))
    lid.putalpha(rrect_mask(wl, hl, wb * 0.05))
    # bow on lid: two tilted loops + knot
    bw_ = int(wb * 0.66); bh_ = int(wb * 0.32)
    ss = 3
    bow = new(bw_, bh_)
    for side in (-1, 1):
        lw_, lh_ = int(bw_ * 0.5), int(bh_ * 0.62)
        loop = Image.new('RGBA', (lw_ * ss, lh_ * ss), (0, 0, 0, 0))
        dl = ImageDraw.Draw(loop)
        dl.ellipse((0, 0, lw_ * ss - 1, lh_ * ss - 1), fill=(56, 34, 19, 255))
        dl.ellipse((lw_ * ss * 0.2, lh_ * ss * 0.24, lw_ * ss * 0.8, lh_ * ss * 0.76), fill=(120, 76, 40, 255))
        loop = loop.resize((lw_, lh_), Image.LANCZOS).rotate(-22 * side, resample=Image.BICUBIC, expand=True)
        cx = bw_ / 2 + side * bw_ * 0.24
        bow.alpha_composite(loop, (int(cx - loop.width / 2), int(bh_ * 0.52 - loop.height / 2)))
    knot = circle(int(bh_ * 0.42), (46, 28, 16))
    bow.alpha_composite(knot, (int(bw_ / 2 - knot.width / 2), int(bh_ * 0.56 - knot.height / 2)))
    lid_full = new(wl, hl + bh_ - int(bh_ * 0.1))
    lid_full.alpha_composite(bow, ((wl - bw_) // 2, 0))
    lid_full.alpha_composite(lid, (0, bh_ - int(bh_ * 0.1)))
    return body, lid_full


def reward_card(w=600):
    h = int(w * 1.04)
    card = rrect(w, h, 40, (255, 255, 255, 255))
    ph_h = int(h * 0.66)
    ph = cover(photo('croissant'), w - 36, ph_h - 18, (0.5, 0.8)).convert('RGBA')
    ph.putalpha(rrect_mask(ph.width, ph.height, 28))
    card.alpha_composite(ph, (18, 18))
    u = w / 600
    draw_text(card, (w / 2, ph_h + 95 * u), 'Croissant', font('mont', 76 * u, 800), INK, anchor='ms')
    draw_text(card, (w / 2, ph_h + 150 * u), 'Récompense débloquée', font('inter', 34 * u, 450), (140, 86, 34), anchor='ms')
    return drop_shadow(card, blur=int(30 * u), offset=(0, int(18 * u)), opacity=0.3)


def hand_sprite(scale=1.0):
    """Single index finger entering from the bottom (flat illustration). Returns (sprite, fingertip xy)."""
    ss = 3
    Wd, Hd = int(300 * scale), int(760 * scale)
    big = Image.new('RGBA', (Wd * ss, Hd * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    u = ss * scale
    skin = (240, 199, 164, 255)
    shade = (222, 172, 134, 255)
    line = (176, 120, 84, 255)
    # palm mass (mostly below frame)
    d.rounded_rectangle((20 * u, 470 * u, 300 * u, 900 * u), radius=110 * u, fill=skin)
    d.rounded_rectangle((150 * u, 470 * u, 300 * u, 900 * u), radius=90 * u, fill=shade)
    # finger
    d.rounded_rectangle((70 * u, 10 * u, 182 * u, 600 * u), radius=56 * u, fill=skin)
    d.rounded_rectangle((150 * u, 60 * u, 182 * u, 560 * u), radius=16 * u, fill=shade)
    d.rounded_rectangle((70 * u, 10 * u, 182 * u, 600 * u), radius=56 * u, outline=line, width=int(3 * u))
    # nail
    d.rounded_rectangle((90 * u, 28 * u, 162 * u, 118 * u), radius=32 * u, fill=(250, 226, 206, 255), outline=(214, 170, 140, 255), width=int(2 * u))
    # knuckle creases
    for yy in (238, 252, 400):
        d.arc((92 * u, (yy - 10) * u, 160 * u, (yy + 14) * u), 200, 340, fill=line, width=int(3 * u))
    img = big.resize((Wd, Hd), Image.LANCZOS)
    ang = -14
    img = img.rotate(-ang, resample=Image.BICUBIC, expand=True)
    out, pad = drop_shadow(img, blur=20, offset=(16, 22), opacity=0.35, color=(20, 12, 6))
    cx0, cy0 = Wd / 2, Hd / 2
    fx, fy = 126 * scale - cx0, 14 * scale - cy0
    a = math.radians(ang)
    rx, ry = fx * math.cos(a) - fy * math.sin(a), fx * math.sin(a) + fy * math.cos(a)
    return out, (img.width / 2 + rx + pad, img.height / 2 + ry + pad)


def burst_rays(D, n=18, color=(255, 214, 140)):
    """Radial god-rays sprite (RGBA) with soft falloff."""
    ys, xs = np.mgrid[0:D, 0:D].astype(np.float32)
    c = D / 2
    dx, dy = xs - c, ys - c
    r = np.sqrt(dx * dx + dy * dy) / c
    th = np.arctan2(dy, dx)
    rays = (0.5 + 0.5 * np.cos(th * n)) ** 3
    fall = np.clip(1 - r, 0, 1) ** 1.6
    core = np.exp(-(r / 0.22) ** 2)
    a = np.clip(rays * fall * 0.75 + core * 0.9, 0, 1) * (r < 1)
    arr = np.zeros((D, D, 4), np.float32)
    arr[..., 0], arr[..., 1], arr[..., 2] = color
    arr[..., 3] = a * 255
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def glow(D, color=(255, 200, 120), strength=1.0):
    ys, xs = np.mgrid[0:D, 0:D].astype(np.float32)
    c = D / 2
    r = np.sqrt((xs - c) ** 2 + (ys - c) ** 2) / c
    a = np.clip(np.exp(-(r / 0.45) ** 2) * strength, 0, 1) * (r < 1)
    arr = np.zeros((D, D, 4), np.float32)
    arr[..., 0], arr[..., 1], arr[..., 2] = color
    arr[..., 3] = a * 255
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def store_badge(kind, w=330):
    h = int(w * 0.29)
    b = rrect(w, h, h * 0.2, (12, 12, 12, 255), outline=(150, 150, 150), width=1.5)
    if kind == 'apple':
        lg = layer(5)
        lg = lg.resize((int(h * 0.56), int(h * 0.56 * lg.height / lg.width)), Image.LANCZOS)
        b.alpha_composite(lg, (int(h * 0.3), int((h - lg.height) / 2)))
        tx = int(h * 0.3 + lg.width + h * 0.18)
        draw_text(b, (tx, h * 0.40), 'Télécharger dans', font('inter', h * 0.2, 420), WHITE)
        draw_text(b, (tx - 2, h * 0.80), "l'App Store", font('inter', h * 0.36, 520), WHITE)
    else:
        lg = layer(7)
        lg = lg.resize((int(h * 0.58), int(h * 0.58 * lg.height / lg.width)), Image.LANCZOS)
        b.alpha_composite(lg, (int(h * 0.3), int((h - lg.height) / 2)))
        tx = int(h * 0.3 + lg.width + h * 0.18)
        draw_text(b, (tx, h * 0.38), 'DISPONIBLE SUR', font('inter', h * 0.17, 560), WHITE, tracking=h * 0.01)
        draw_text(b, (tx - 2, h * 0.80), 'Google Play', font('inter', h * 0.36, 500), WHITE)
    return b
