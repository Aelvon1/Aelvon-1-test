"""Corner decorations (leaves, swoosh, wheat, bottom wave) rebuilt from the flyer PDF layers and placements."""
import numpy as np
from PIL import Image, ImageDraw

from ui import layer

PAGE_W, PAGE_H = 814.5, 1086.0
# (layer, PDF cm matrix a b c d e f, clip polygon in PDF points)
PLACEMENTS = [
    (0, (-97.066605, -179.00061, 295.77054, -160.38739, -7.8796997, 1140.4314),
     [(278.80096, 984.97314), (188.18019, 817.8593), (-88.711365, 968.0092), (1.9093933, 1135.123)]),
    (1, (360.3208, 0, 0, 244.98633, 0, 908.8887),
     [(0, 922.41064), (351.5713, 922.41064), (351.5713, 1153.875), (0, 1153.875)]),
    (2, (219.5332, 0, 0, 290.3247, 594.9668, 848.4375),
     [(609.2842, 850.8237), (814.5, 850.8237), (814.5, 1125.2402), (609.2842, 1125.2402)]),
    (9, (814.5, 0, 0, 198.85254, -0.39770508, -53.833008),
     [(-0.4, -53.833), (814.1, -53.833), (814.1, 133.88), (-0.4, 133.88)]),
]


def _render_layer(idx, m, clip, S, out_w, out_h, ss=2):
    a, b, c, d, e, f = m
    img = layer(idx)
    Wi, Hi = img.size
    Sx = S * ss
    M = np.array([[a, c], [b, d]], float)
    Mi = np.linalg.inv(M)
    H = PAGE_H
    A = Wi * Mi[0, 0] / Sx
    B = -Wi * Mi[0, 1] / Sx
    C = Wi * (-Mi[0, 0] * e + Mi[0, 1] * (H - f))
    D = -Hi * Mi[1, 0] / Sx
    E = Hi * Mi[1, 1] / Sx
    F = Hi - Hi * (-Mi[1, 0] * e + Mi[1, 1] * (H - f))
    big = img.convert('RGBa').transform((out_w * ss, out_h * ss), Image.AFFINE, (A, B, C, D, E, F),
                                        resample=Image.BICUBIC).convert('RGBA')
    mask = Image.new('L', big.size, 0)
    ImageDraw.Draw(mask).polygon([(x * Sx, (H - y) * Sx) for x, y in clip], fill=255)
    al = np.minimum(np.asarray(big.getchannel('A')), np.asarray(mask))
    big.putalpha(Image.fromarray(al))
    return big.resize((out_w, out_h), Image.LANCZOS)


def build(frame_w=1080):
    """Return dict name -> (sprite, (x, y) top-left in a frame of width frame_w, pivot corner)."""
    S = frame_w / PAGE_W  # PDF points -> frame px
    out_w, out_h = frame_w, int(round(PAGE_H * S))
    full = {}
    for idx, m, clip in PLACEMENTS:
        full[idx] = _render_layer(idx, m, clip, S, out_w, out_h)

    def crop(im):
        bb = im.getbbox()
        return im.crop(bb), bb

    tl = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    tl.alpha_composite(full[0]); tl.alpha_composite(full[1])
    tl_s, tl_bb = crop(tl)
    tr_s, tr_bb = crop(full[2])
    bt_s, bt_bb = crop(full[9])
    return {
        'tl': (tl_s, (tl_bb[0], tl_bb[1])),
        'tr': (tr_s, (tr_bb[0], tr_bb[1])),
        'bottom': (bt_s, (bt_bb[0], bt_bb[1] - out_h)),  # y relative to page bottom
    }
