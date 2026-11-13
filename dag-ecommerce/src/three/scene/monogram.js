// ---------------------------------------------------------------------------
// Monogramme : le texte est dessiné sur un canvas, dont on tire un masque (alpha) et une
// carte de normales (épaulement de l'empreinte + grain du cuir, qui transparaît sous le marquage).
// Redessiné à chaque frappe ou changement de fini, sans toucher à la géométrie.
// ---------------------------------------------------------------------------

export const MONO_W = 640;
export const MONO_H = 256;
export const MONO_FONT = '"Cormorant Garamond Variable", "Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
const WEIGHT = 600;

/** Demande le chargement de la police d'affichage si la page la déclare. */
export function loadDisplayFont() {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  return document.fonts
    .load(`${WEIGHT} 64px "Cormorant Garamond Variable"`, 'DAG')
    .catch(() => undefined)
    .then(() => undefined);
}

function boxBlur(src, dst, w, h, r) {
  // flou séparable, deux passes, bords répliqués
  const tmp = new Float32Array(src.length);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * norm;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

export function createMonogramCanvases() {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = MONO_W;
    c.height = MONO_H;
    return c;
  };
  return { text: mk(), alpha: mk(), normal: mk() };
}

/**
 * Dessine `text` (≤ 3 caractères) ; renvoie false si le texte est vide.
 * @param {{ normalBytes: Uint8ClampedArray, ormBytes: Uint8ClampedArray, size: number, tile: number }} [grain]
 *        cartes du fini de cuir : le grain reste lisible dans l'empreinte et use la dorure sur ses bords
 * @param {number} [heightMm] hauteur réelle de la pastille, pour mettre le grain à l'échelle
 */
export function drawMonogram(canvases, text, grain = null, heightMm = 14) {
  const chars = Array.from(String(text ?? '').trim()).slice(0, 3);
  const w = MONO_W;
  const h = MONO_H;
  const ctx = canvases.text.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const actx = canvases.alpha.getContext('2d');
  const nctx = canvases.normal.getContext('2d');
  if (!chars.length) {
    actx.fillStyle = '#000';
    actx.fillRect(0, 0, w, h);
    nctx.fillStyle = 'rgb(128,128,255)';
    nctx.fillRect(0, 0, w, h);
    return false;
  }

  // Composition : capitales espacées, centrées optiquement.
  let size = h * 0.86;
  const measure = () => {
    ctx.font = `${WEIGHT} ${size}px ${MONO_FONT}`;
    const track = size * 0.065;
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
    return { widths, total, track };
  };
  let m = measure();
  const maxW = w * 0.86;
  if (m.total > maxW) {
    size *= maxW / m.total;
    m = measure();
  }
  const ref = ctx.measureText('H');
  const cap = ref.actualBoundingBoxAscent || size * 0.63;
  const baseline = h / 2 + cap / 2;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let x = (w - m.total) / 2;
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, baseline);
    x += m.widths[i] + m.track;
  });

  const px = ctx.getImageData(0, 0, w, h).data;
  const mask = new Float32Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4] / 255;
  const soft = new Float32Array(w * h);
  const bevel = new Float32Array(w * h);
  boxBlur(mask, soft, w, h, 1);
  boxBlur(soft, bevel, w, h, 3);
  boxBlur(bevel, bevel, w, h, 2);

  const aimg = actx.createImageData(w, h);
  const nimg = nctx.createImageData(w, h);
  const K = 7.5; // pente de l'épaulement
  const GRAIN = 0.7; // part du relief du cuir conservée sous le marquage
  const gs = grain ? grain.size : 0;
  const gk = grain ? (heightMm / h / grain.tile) * gs : 0; // pixels de cuir par pixel de pastille
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - 1) * w;
    const yb = Math.min(h - 1, y + 1) * w;
    for (let xx = 0; xx < w; xx++) {
      const i = y * w + xx;
      const o = i * 4;
      let gx = 0;
      let gy = 0;
      let pit = 0;
      if (grain) {
        const q = ((Math.floor(y * gk) % gs) * gs + (Math.floor(xx * gk) % gs)) * 4;
        gx = (grain.normalBytes[q] / 255 - 0.5) * 2 * GRAIN;
        gy = (grain.normalBytes[q + 1] / 255 - 0.5) * 2 * GRAIN;
        pit = 1 - grain.ormBytes[q] / 255; // creux du grain : pores, sillons
      }
      // masque net, très légèrement élargi pour porter l'épaulement
      const t = Math.min(1, Math.max(0, (bevel[i] - 0.1) / 0.3));
      let a = Math.max(soft[i], t * t * (3 - 2 * t) * 0.999);
      // le film ne descend pas au fond des creux et s'use sur les bords de la lettre
      const rim = 1 - Math.min(1, Math.max(0, (bevel[i] - 0.45) / 0.4));
      a *= 1 - Math.min(0.75, pit * (1.6 + 2.2 * rim));
      const g = Math.round(a * 255);
      aimg.data[o] = g;
      aimg.data[o + 1] = g;
      aimg.data[o + 2] = g;
      aimg.data[o + 3] = 255;
      // relief H = -bevel (empreinte en creux) → dH/dx = -K · d(bevel)/dx ; y = axe du canvas (vers le bas)
      const hx = -K * (bevel[i + (xx < w - 1 ? 1 : 0)] - bevel[i - (xx > 0 ? 1 : 0)]);
      const hy = -K * (bevel[yb + xx] - bevel[ya + xx]);
      const l = 1 / Math.sqrt(hx * hx + hy * hy + 1);
      const nx = -hx * l + gx;
      const ny = hy * l + gy;
      const nz = Math.sqrt(Math.max(0.04, 1 - Math.min(0.96, nx * nx + ny * ny)));
      nimg.data[o] = Math.round(255 * (0.5 + 0.5 * nx));
      nimg.data[o + 1] = Math.round(255 * (0.5 + 0.5 * ny));
      nimg.data[o + 2] = Math.round(255 * (0.5 + 0.5 * nz));
      nimg.data[o + 3] = 255;
    }
  }
  actx.putImageData(aimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);
  return true;
}
