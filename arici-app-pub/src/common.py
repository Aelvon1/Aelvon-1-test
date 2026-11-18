"""Shared constants, easing, fonts and 2D compositing helpers (numpy + Pillow)."""
import os
import math
import functools

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, FPS = 1080, 1920, 30
SAFE_TOP, SAFE_BOTTOM, SAFE_RIGHT = 250, H - 350, W - 120

# ---- palette (sampled on the flyer PDF) ----
CREAM = (247, 241, 232)
CREAM_LIGHT = (252, 249, 244)
SCREEN_BG = (250, 244, 236)
ESPRESSO = (42, 26, 16)
CARAMEL = (200, 120, 47)
CARAMEL_LIGHT = (224, 150, 72)
COPPER = (139, 90, 43)
TITLE_BROWN = (132, 80, 21)
INK = (14, 13, 12)
WHITE = (255, 255, 255)
GOLD = (236, 180, 84)
GREY_TXT = (110, 102, 96)

FONT_FILES = {
    'mont': os.path.join(ROOT, 'fonts', 'Montserrat%5Bwght%5D.ttf'),
    'monti': os.path.join(ROOT, 'fonts', 'Montserrat-Italic%5Bwght%5D.ttf'),
    'inter': os.path.join(ROOT, 'fonts', 'Inter%5Bopsz,wght%5D.ttf'),
}


@functools.lru_cache(maxsize=None)
def font(name, size, weight=400):
    f = ImageFont.truetype(FONT_FILES[name], max(1, int(round(size))))
    if name == 'inter':
        f.set_variation_by_axes([max(14, min(32, size * 0.5)), weight])
    else:
        f.set_variation_by_axes([weight])
    return f


# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, t):
    return a + (b - a) * t


def prog(t, t0, t1):
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return clamp((t - t0) / (t1 - t0))


def e_out_cubic(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def e_in_cubic(x):
    x = clamp(x)
    return x ** 3


def e_inout_cubic(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def e_out_quint(x):
    x = clamp(x)
    return 1 - (1 - x) ** 5


def e_out_expo(x):
    x = clamp(x)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def e_in_expo(x):
    x = clamp(x)
    return 0.0 if x <= 0 else 2 ** (10 * x - 10)


def e_out_back(x, s=1.70158):
    x = clamp(x)
    c3 = s + 1
    return 1 + c3 * (x - 1) ** 3 + s * (x - 1) ** 2


def e_out_elastic(x, period=0.32):
    x = clamp(x)
    if x in (0.0, 1.0):
        return x
    return 2 ** (-9 * x) * math.sin((x - period / 4) * (2 * math.pi) / period) + 1


def spring(x, freq=2.2, damp=6.0):
    """0 -> 1 damped spring (overshoots), x in seconds-ish normalised units."""
    if x <= 0:
        return 0.0
    return 1 - math.exp(-damp * x) * math.cos(2 * math.pi * freq * x)


# ---------------------------------------------------------------- drawing helpers
def new(w, h, color=(0, 0, 0, 0)):
    return Image.new('RGBA', (int(w), int(h)), color)


def rrect(w, h, r, fill, ss=3, outline=None, width=0):
    """Anti-aliased rounded rectangle (RGBA) via supersampling."""
    w, h = int(round(w)), int(round(h))
    big = Image.new('RGBA', (w * ss, h * ss), fill[:3] + (0,) if len(fill) >= 3 else (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    f = tuple(fill) if len(fill) == 4 else tuple(fill) + (255,)
    d.rounded_rectangle((0, 0, w * ss - 1, h * ss - 1), radius=r * ss, fill=f,
                        outline=(tuple(outline) + (255,) if outline is not None and len(outline) == 3 else outline),
                        width=int(width * ss))
    return big.resize((w, h), Image.LANCZOS)


def rrect_mask(w, h, r, ss=3):
    w, h = int(round(w)), int(round(h))
    big = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, w * ss - 1, h * ss - 1), radius=r * ss, fill=255)
    return big.resize((w, h), Image.LANCZOS)


def ellipse_mask(w, h, ss=4):
    w, h = int(round(w)), int(round(h))
    big = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(big).ellipse((0, 0, w * ss - 1, h * ss - 1), fill=255)
    return big.resize((w, h), Image.LANCZOS)


def circle(d, fill, ss=4):
    m = ellipse_mask(d, d, ss)
    im = Image.new('RGBA', m.size, tuple(fill[:3]) + (0,))
    solid = Image.new('RGBA', m.size, tuple(fill[:3]) + (255,))
    im.paste(solid, (0, 0), m)
    if len(fill) == 4:
        im.putalpha(m.point(lambda v: v * fill[3] // 255))
    return im


def solid_with_mask(mask, color):
    im = Image.new('RGBA', mask.size, tuple(color[:3]) + (0,))
    im.putalpha(mask if len(color) == 3 else mask.point(lambda v: v * color[3] // 255))
    return im


def gradient(w, h, stops, angle_deg=0.0):
    """Linear gradient as RGB uint8 array. stops: [(pos, (r,g,b)), ...]; angle 0 = left->right, 90 = top->bottom."""
    w, h = int(w), int(h)
    a = math.radians(angle_deg)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = math.cos(a), math.sin(a)
    proj = (xs - w / 2) * dx + (ys - h / 2) * dy
    half = abs(w / 2 * dx) + abs(h / 2 * dy)
    t = (proj / (2 * half) + 0.5).clip(0, 1)
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.array([s[1] for s in stops], np.float32)
    out = np.zeros((h, w, cols.shape[1]), np.float32)
    for c in range(cols.shape[1]):
        out[..., c] = np.interp(t, pos, cols[:, c])
    return out


def radial(w, h, cx, cy, r, stops):
    ys, xs = np.mgrid[0:int(h), 0:int(w)].astype(np.float32)
    t = (np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / r).clip(0, 1)
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.array([s[1] for s in stops], np.float32)
    out = np.zeros((int(h), int(w), cols.shape[1]), np.float32)
    for c in range(cols.shape[1]):
        out[..., c] = np.interp(t, pos, cols[:, c])
    return out


def arr_to_rgba(arr, mask=None):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    if arr.shape[2] == 3:
        im = Image.fromarray(arr, 'RGB').convert('RGBA')
    else:
        im = Image.fromarray(arr, 'RGBA')
    if mask is not None:
        im.putalpha(mask)
    return im


def text_size(txt, fnt, tracking=0.0):
    if tracking == 0:
        b = fnt.getbbox(txt)
        return b[2] - b[0], b[3] - b[1]
    wsum = sum(fnt.getlength(ch) for ch in txt) + tracking * (len(txt) - 1)
    b = fnt.getbbox(txt)
    return int(math.ceil(wsum)), b[3] - b[1]


def draw_text(img, xy, txt, fnt, fill, tracking=0.0, anchor='ls'):
    """Draw text on an RGBA image. anchor like Pillow ('ls' = left baseline, 'lt', 'mm'...)."""
    d = ImageDraw.Draw(img)
    fill = tuple(fill) if len(fill) == 4 else tuple(fill) + (255,)
    if tracking == 0:
        d.text(xy, txt, font=fnt, fill=fill, anchor=anchor)
        return
    total = sum(fnt.getlength(ch) for ch in txt) + tracking * (len(txt) - 1)
    x, y = xy
    if anchor[0] == 'm':
        x -= total / 2
    elif anchor[0] == 'r':
        x -= total
    a2 = 'l' + anchor[1]
    for ch in txt:
        d.text((x, y), ch, font=fnt, fill=fill, anchor=a2)
        x += fnt.getlength(ch) + tracking


def text_sprite(txt, fnt, fill, tracking=0.0, pad=6):
    """Tight RGBA sprite of a single line; returns (img, baseline_y_in_img)."""
    asc, desc = fnt.getmetrics()
    wt = sum(fnt.getlength(ch) for ch in txt) + tracking * (len(txt) - 1) if tracking else fnt.getlength(txt)
    im = new(int(math.ceil(wt)) + pad * 2, asc + desc + pad * 2)
    draw_text(im, (pad, pad + asc), txt, fnt, fill, tracking, 'ls')
    return im, pad + asc


def drop_shadow(img, blur=18, offset=(0, 12), opacity=0.25, color=(40, 25, 10), spread=0):
    """Return a new RGBA with shadow behind img; also returns the offset of img inside it."""
    pad = blur * 2 + max(abs(offset[0]), abs(offset[1])) + spread
    w, h = img.size
    out = new(w + pad * 2, h + pad * 2)
    a = img.getchannel('A')
    if spread:
        a = a.filter(ImageFilter.MaxFilter(spread * 2 + 1))
    sh = Image.new('RGBA', img.size, tuple(color) + (0,))
    sh.putalpha(a.point(lambda v: int(v * opacity)))
    layer = new(*out.size)
    layer.paste(sh, (pad + offset[0], pad + offset[1]))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    out.alpha_composite(layer)
    out.alpha_composite(img, (pad, pad))
    return out, pad


# ---------------------------------------------------------------- compositing with transforms
class Cam:
    """Simple 2D camera: world point -> screen point. zoom about (cx, cy) then offset."""

    def __init__(self, zoom=1.0, cx=W / 2, cy=H / 2, ox=0.0, oy=0.0, rot=0.0):
        self.zoom, self.cx, self.cy, self.ox, self.oy, self.rot = zoom, cx, cy, ox, oy, rot

    def apply(self, x, y):
        dx, dy = (x - self.cx) * self.zoom, (y - self.cy) * self.zoom
        if self.rot:
            r = math.radians(self.rot)
            dx, dy = dx * math.cos(r) - dy * math.sin(r), dx * math.sin(r) + dy * math.cos(r)
        return self.cx + dx + self.ox, self.cy + dy + self.oy


_RES_CACHE = {}


def _resized(spr, tw, th):
    key = (id(spr), tw, th)
    r = _RES_CACHE.get(key)
    if r is None:
        if len(_RES_CACHE) > 160:
            _RES_CACHE.clear()
        method = Image.LANCZOS if tw < spr.width else Image.BICUBIC
        r = spr.resize((tw, th), method)
        _RES_CACHE[key] = r
    return r


_PREMUL = {}


def premul(spr):
    """Cache premultiplied version of an RGBA sprite (keyed by id)."""
    k = id(spr)
    p = _PREMUL.get(k)
    if p is None or p[0] is not spr:
        if len(_PREMUL) > 400:
            _PREMUL.clear()
        p = (spr, spr.convert('RGBa'))
        _PREMUL[k] = p
    return p[1]


def place(canvas, spr, x, y, scale=1.0, rot=0.0, alpha=1.0, anchor=(0.5, 0.5), cam=None, sx=None, sy=None,
          static=False):
    """Composite sprite `spr` (RGBA) onto canvas with anchor at (x, y), uniform scale (or sx/sy),
    clockwise rotation in degrees, opacity. Sub-pixel accurate. Returns screen bbox."""
    if alpha <= 0.003:
        return None
    if cam is not None:
        x, y = cam.apply(x, y)
        scale *= cam.zoom
        rot += cam.rot
    sxv = scale * (sx if sx is not None else 1.0)
    syv = scale * (sy if sy is not None else 1.0)
    if sxv <= 0.002 or syv <= 0.002:
        return None
    src = premul(spr)
    w, h = src.size
    tw, th = max(1, int(round(w * sxv))), max(1, int(round(h * syv)))
    pre = src if (tw, th) == (w, h) else _resized(src, tw, th) if static or (tw * th < 4_000_000) else src.resize((tw, th), Image.BICUBIC)
    fx, fy = tw / w, th / h  # actual scale achieved by the resize
    ax, ay = anchor[0] * tw, anchor[1] * th
    # residual scale correction is ignored (<0.5px); rotation + subpixel translation via affine
    th_r = math.radians(rot)
    c, s = math.cos(th_r), math.sin(th_r)
    corners = [(-ax, -ay), (tw - ax, -ay), (-ax, th - ay), (tw - ax, th - ay)]
    xs = [x + c * px - s * py for px, py in corners]
    ys = [y + s * px + c * py for px, py in corners]
    bx0, by0 = max(0, int(math.floor(min(xs)))), max(0, int(math.floor(min(ys))))
    bx1, by1 = min(canvas.width, int(math.ceil(max(xs)))), min(canvas.height, int(math.ceil(max(ys))))
    if bx1 <= bx0 or by1 <= by0:
        return None
    if rot == 0 and abs(x - ax - round(x - ax)) < 0.02 and abs(y - ay - round(y - ay)) < 0.02:
        ox, oy = int(round(x - ax)), int(round(y - ay))
        crop = pre.crop((bx0 - ox, by0 - oy, bx1 - ox, by1 - oy))
    else:
        a0 = ax + c * (bx0 - x) + s * (by0 - y)
        f0 = ay - s * (bx0 - x) + c * (by0 - y)
        crop = pre.transform((bx1 - bx0, by1 - by0), Image.AFFINE, (c, s, a0, -s, c, f0), resample=Image.BICUBIC)
    if alpha < 0.997:
        crop = crop.point(lambda v: int(v * alpha + 0.5))
    canvas.alpha_composite(crop.convert('RGBA'), (bx0, by0))
    return (bx0, by0, bx1, by1)


def _homography(src_pts, dst_pts):
    """Coefficients for PIL PERSPECTIVE: maps output(dst) -> input(src)."""
    A, B = [], []
    for (x, y), (u, v) in zip(dst_pts, src_pts):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def place_quad(canvas, spr, quad, alpha=1.0):
    """Perspective-warp sprite so its corners (tl, tr, br, bl) land on `quad` (screen coords)."""
    xs = [p[0] for p in quad]; ys = [p[1] for p in quad]
    bx0, by0 = max(0, int(math.floor(min(xs)))), max(0, int(math.floor(min(ys))))
    bx1, by1 = min(canvas.width, int(math.ceil(max(xs)))), min(canvas.height, int(math.ceil(max(ys))))
    if bx1 <= bx0 or by1 <= by0 or alpha <= 0.003:
        return
    src = premul(spr)
    # pre-shrink to roughly the target size to avoid aliasing
    tw = max(abs(quad[1][0] - quad[0][0]), abs(quad[2][0] - quad[3][0]))
    th = max(abs(quad[3][1] - quad[0][1]), abs(quad[2][1] - quad[1][1]))
    k = min(1.0, max(tw / src.width, th / src.height) * 1.05)
    if k < 0.98:
        src = _resized(src, max(1, int(src.width * k)), max(1, int(src.height * k)))
    w, h = src.size
    dst = [(px - bx0, py - by0) for px, py in quad]
    coeffs = _homography([(0, 0), (w, 0), (w, h), (0, h)], dst)
    crop = src.transform((bx1 - bx0, by1 - by0), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC)
    if alpha < 0.997:
        crop = crop.point(lambda v: int(v * alpha + 0.5))
    canvas.alpha_composite(crop.convert('RGBA'), (bx0, by0))


def rot_y_quad(cx, cy, w, h, angle_deg, persp=1800.0, tilt_x_deg=0.0, roll_deg=0.0):
    """Screen quad of a w*h card centred at (cx,cy) rotated around its vertical axis (and a bit around X)."""
    ay = math.radians(angle_deg)
    ax = math.radians(tilt_x_deg)
    rr = math.radians(roll_deg)
    pts = []
    for px, py in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        # roll (in-plane)
        px, py = px * math.cos(rr) - py * math.sin(rr), px * math.sin(rr) + py * math.cos(rr)
        # rotate around Y
        x1, z1 = px * math.cos(ay), px * math.sin(ay)
        # rotate around X
        y2, z2 = py * math.cos(ax) - z1 * math.sin(ax) * 0 + 0, z1 + py * math.sin(ax)
        k = persp / (persp + z2)
        pts.append((cx + x1 * k, cy + y2 * k))
    return pts
