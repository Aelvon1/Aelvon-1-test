// ---------------------------------------------------------------------------
// Textures procédurales, raccordables, générées une seule fois sur canvas puis mises en cache.
// Les canvas (données CPU) sont partagés entre toutes les instances de la scène ; chaque
// instance en tire ses propres textures GPU.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rend la main au navigateur (non ralenti dans un onglet en arrière-plan, contrairement à setTimeout). */
const breathe = () =>
  new Promise((resolve) => {
    if (typeof MessageChannel === 'undefined') {
      setTimeout(resolve, 0);
      return;
    }
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });

function makeBudget(ms = 9) {
  let t0 = performance.now();
  return async () => {
    if (performance.now() - t0 > ms) {
      await breathe();
      t0 = performance.now();
    }
  };
}

const smooth = (a, b, x) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Bruit cellulaire périodique : distances aux deux germes les plus proches (en unités de cellule). */
async function worley(size, cellsX, cellsY, seed, f1, f2, budget, id = null) {
  const rnd = mulberry32(seed);
  const n = cellsX * cellsY;
  const fx = new Float32Array(n);
  const fy = new Float32Array(n);
  const tag = id ? new Float32Array(n) : null;
  for (let i = 0; i < n; i++) {
    fx[i] = (i % cellsX) + rnd();
    fy[i] = Math.floor(i / cellsX) + rnd();
    if (tag) tag[i] = rnd();
  }
  const sx = cellsX / size;
  const sy = cellsY / size;
  for (let y = 0; y < size; y++) {
    const py = (y + 0.5) * sy;
    const cy = Math.floor(py);
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * sx;
      const cx = Math.floor(px);
      let d1 = 1e9;
      let d2 = 1e9;
      let near = 0;
      for (let j = -1; j <= 1; j++) {
        const iy = cy + j;
        const wy = iy < 0 ? iy + cellsY : iy >= cellsY ? iy - cellsY : iy;
        const oy = iy - wy;
        for (let i = -1; i <= 1; i++) {
          const ix = cx + i;
          const wx = ix < 0 ? ix + cellsX : ix >= cellsX ? ix - cellsX : ix;
          const k = wy * cellsX + wx;
          const dx = fx[k] + (ix - wx) - px;
          const dy = fy[k] + oy - py;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            near = k;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      const o = y * size + x;
      f1[o] = Math.sqrt(d1);
      f2[o] = Math.sqrt(d2);
      if (tag) id[o] = tag[near];
    }
    if ((y & 31) === 31) await budget();
  }
}

/**
 * Bruit de valeur fractal périodique, normalisé dans [0, 1]. `cellsX` et `cellsY` peuvent différer :
 * le motif s'étire alors le long de l'axe qui compte le moins de cellules.
 */
async function fbm(size, cellsX, cellsY, octaves, seed, out, budget) {
  const rnd = mulberry32(seed);
  out.fill(0);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = cellsX << o;
    const cy = cellsY << o;
    const lat = new Float32Array(cx * cy);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const sx = cx / size;
    const sy = cy / size;
    for (let y = 0; y < size; y++) {
      const py = y * sy;
      const y0 = Math.floor(py);
      const ty = py - y0;
      const wy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % cy) * cx;
      const r1 = ((y0 + 1) % cy) * cx;
      for (let x = 0; x < size; x++) {
        const px = x * sx;
        const x0 = Math.floor(px);
        const tx = px - x0;
        const wx = tx * tx * (3 - 2 * tx);
        const xa = x0 % cx;
        const xb = (x0 + 1) % cx;
        const a = lat[r0 + xa] + (lat[r0 + xb] - lat[r0 + xa]) * wx;
        const b = lat[r1 + xa] + (lat[r1 + xb] - lat[r1 + xa]) * wx;
        out[y * size + x] += amp * (a + (b - a) * wy);
      }
      if ((y & 63) === 63) await budget();
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
}

/** Flou en boîte périodique (rayon en pixels), sur place. */
function blur(field, size, radius) {
  if (radius < 1) return;
  const tmp = new Float32Array(size);
  const norm = 1 / (2 * radius + 1);
  for (let pass = 0; pass < 2; pass++) {
    const step = pass ? size : 1;
    const span = pass ? 1 : size;
    for (let line = 0; line < size; line++) {
      const base = line * span;
      let acc = 0;
      for (let i = -radius; i <= radius; i++) acc += field[base + ((i + size) % size) * step];
      for (let i = 0; i < size; i++) {
        tmp[i] = acc * norm;
        acc += field[base + ((i + radius + 1) % size) * step] - field[base + ((i - radius + size) % size) * step];
      }
      for (let i = 0; i < size; i++) field[base + i * step] = tmp[i];
    }
  }
}

/** Déforme un champ périodique par deux bruits (amplitude en pixels) : les contours deviennent sinueux. */
function warp(field, size, wx, wy, amount) {
  const out = new Float32Array(field.length);
  const mask = size - 1; // size est une puissance de deux
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const sx = x + (wx[i] - 0.5) * 2 * amount;
      const sy = y + (wy[i] - 0.5) * 2 * amount;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const tx = sx - x0;
      const ty = sy - y0;
      const xa = x0 & mask;
      const xb = (x0 + 1) & mask;
      const ya = (y0 & mask) * size;
      const yb = ((y0 + 1) & mask) * size;
      const top = field[ya + xa] + (field[ya + xb] - field[ya + xa]) * tx;
      const bottom = field[yb + xa] + (field[yb + xb] - field[yb + xa]) * tx;
      out[i] = top + (bottom - top) * ty;
    }
  }
  field.set(out);
}

const toSrgb = (v) => {
  const x = v <= 0 ? 0 : v >= 1 ? 1 : v;
  return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
};
const toByte = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

function canvasOf(size, bytes) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  img.data.set(bytes);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Carte de normales (espace tangent, convention OpenGL) à partir d'un relief en mm. */
function normalBytes(size, height, pxMm, bytes) {
  const k = 1 / (2 * pxMm);
  for (let y = 0; y < size; y++) {
    const ya = ((y + size - 1) % size) * size;
    const yb = ((y + 1) % size) * size;
    const yc = y * size;
    for (let x = 0; x < size; x++) {
      const xa = (x + size - 1) % size;
      const xb = (x + 1) % size;
      const dx = (height[yc + xb] - height[yc + xa]) * k;
      const dy = (height[yb + x] - height[ya + x]) * k;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (yc + x) * 4;
      bytes[o] = toByte(0.5 - 0.5 * dx * l);
      bytes[o + 1] = toByte(0.5 + 0.5 * dy * l); // l'axe Y du canvas descend
      bytes[o + 2] = toByte(0.5 + 0.5 * l);
      bytes[o + 3] = 255;
    }
  }
}

// --- Cuirs -------------------------------------------------------------------

const LEATHER = {
  // Pleine fleur lisse : pores fins et irréguliers, longues rides peu profondes, peau d'orange très fine.
  lisse: { size: 1024, tile: 26 },
  // Grainé : petits galets bombés de tailles mêlées, séparés par des sillons doux.
  graine: { size: 1024, tile: 28 },
  // Nubuck : fibres très fines et plages de poil couché ; aucun relief marqué.
  mat: { size: 1024, tile: 22 },
};

const ridge = (v) => 1 - Math.abs(2 * v - 1); // 1 sur la ligne de niveau 0,5 : rides longues et sinueuses

async function generateLeather(finish) {
  const { size, tile } = LEATHER[finish];
  const budget = makeBudget();
  const n = size * size;
  const pxMm = tile / size;
  const height = new Float32Array(n);
  const rough = new Float32Array(n);
  const cavity = new Float32Array(n);
  const tint = new Float32Array(n);
  const f1 = new Float32Array(n);
  const f2 = new Float32Array(n);
  const low = new Float32Array(n);

  if (finish === 'graine') {
    const g1 = new Float32Array(n);
    const g2 = new Float32Array(n);
    const peb = new Float32Array(n);
    await worley(size, 24, 24, 1207, f1, f2, budget); // grands galets ≈ 1,2 mm
    await worley(size, 44, 44, 77, g1, g2, budget); // petits galets ≈ 0,6 mm
    await fbm(size, 7, 7, 2, 31, low, budget); // plages où le grain se resserre
    for (let i = 0; i < n; i++) {
      // profil bombé : la pente est nulle au sommet, franche au bord du galet
      const xa = Math.min(1, (f2[i] - f1[i]) / 0.7);
      const pa = 1 - Math.pow(1 - xa, 2.3);
      const xb = Math.min(1, (g2[i] - g1[i]) / 0.66);
      const pb = 1 - Math.pow(1 - xb, 2.3);
      const fine = smooth(0.25, 0.75, low[i]);
      // les petits galets redécoupent les grands, davantage par endroits
      peb[i] = pa * (1 - (0.45 + 0.3 * fine) * (1 - pb)) + 0.1 * (1 - f1[i] * f1[i]) * pa;
    }
    // Contours sinueux puis adoucis : des galets, plus une mosaïque de polygones à arêtes vives.
    await fbm(size, 36, 36, 2, 5, g1, budget);
    await fbm(size, 36, 36, 2, 9, g2, budget);
    warp(peb, size, g1, g2, 5);
    await budget();
    blur(peb, size, 3);
    blur(peb, size, 2);
    await budget();
    blur(peb, size, 1);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < n; i++) {
      lo = Math.min(lo, peb[i]);
      hi = Math.max(hi, peb[i]);
    }
    for (let i = 0; i < n; i++) {
      const p = (peb[i] - lo) / (hi - lo);
      const valley = 1 - smooth(0.15, 0.7, p);
      height[i] = 0.05 * p;
      rough[i] = 0.5 + 0.08 * valley - 0.03 * smooth(0.75, 1, p);
      cavity[i] = 1 - 0.16 * valley;
      tint[i] = 1 - 0.06 * valley;
    }
  } else if (finish === 'lisse') {
    const id = new Float32Array(n);
    const w1 = new Float32Array(n);
    const w2 = new Float32Array(n);
    const hi = new Float32Array(n);
    await worley(size, 104, 104, 4242, f1, f2, budget, id); // semis de pores (≈ 0,25 mm)
    await fbm(size, 5, 5, 3, 5, low, budget);
    await fbm(size, 12, 6, 3, 17, w1, budget); // rides, plutôt en travers de la lanière
    await fbm(size, 26, 14, 2, 23, w2, budget); // réseau de plis plus fin
    await fbm(size, 150, 150, 2, 11, hi, budget); // peau d'orange
    for (let i = 0; i < n; i++) {
      const f = low[i] - 0.5;
      // un pore par cellule au plus, de taille variable, et seulement par plages : aucun motif répété
      const present = id[i] < 0.2 + 0.5 * smooth(0.4, 0.66, low[i]) ? 1 : 0;
      const radius = 0.11 + 0.16 * ((id[i] * 7.31) % 1);
      const pore = present * (1 - smooth(radius * 0.45, radius, f1[i]));
      const r1 = smooth(0.94, 0.995, ridge(w1[i])) * smooth(0.42, 0.66, w2[i]);
      const r2 = smooth(0.9, 0.99, ridge(w2[i])) * (0.2 + 0.8 * smooth(0.5, 0.72, w1[i]));
      const fold = Math.max(r1, 0.7 * r2);
      const micro = hi[i] - 0.5;
      height[i] = -0.014 * pore - 0.004 * fold + 0.006 * micro + 0.012 * f;
      rough[i] = 0.41 + 0.09 * pore + 0.03 * fold + 0.05 * micro + 0.02 * f;
      cavity[i] = 1 - 0.22 * pore - 0.05 * fold;
      tint[i] = 1 - 0.07 * pore - 0.012 * fold + 0.03 * f;
    }
  } else {
    const hi = new Float32Array(n);
    const nap = new Float32Array(n);
    await fbm(size, 9, 4, 3, 99, nap, budget); // plages de poil couché, étirées dans le sens du brossage
    await fbm(size, 56, 40, 2, 3, low, budget); // moutonnement du velours
    await fbm(size, 190, 190, 2, 7, hi, budget); // fibres
    for (let i = 0; i < n; i++) {
      const f = nap[i] - 0.5;
      const m = low[i] - 0.5;
      const h = hi[i] - 0.5;
      height[i] = 0.016 * h + 0.012 * m;
      rough[i] = 0.9 + 0.08 * f + 0.06 * h;
      cavity[i] = 1 - 0.2 * Math.max(0, -h) - 0.1 * Math.max(0, -m);
      tint[i] = 1 + 0.16 * f + 0.14 * m + 0.2 * h;
    }
  }
  await budget();

  const nb = new Uint8ClampedArray(n * 4);
  normalBytes(size, height, pxMm, nb);
  await budget();
  const ob = new Uint8ClampedArray(n * 4);
  const ab = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    ob[o] = toByte(cavity[i]);
    ob[o + 1] = toByte(rough[i]);
    ob[o + 2] = 0;
    ob[o + 3] = 255;
    const t = toSrgb(tint[i] * 0.86); // marge pour les valeurs > 1 ; compensée par le matériau
    ab[o] = t;
    ab[o + 1] = t;
    ab[o + 2] = t;
    ab[o + 3] = 255;
  }
  return {
    finish,
    tile,
    size,
    tintGain: 1 / 0.86,
    // octets bruts : le monogramme y lit le grain (relief et creux) pour le laisser transparaître
    normalBytes: nb,
    ormBytes: ob,
    normal: canvasOf(size, nb),
    orm: canvasOf(size, ob),
    albedo: canvasOf(size, ab),
  };
}

const leatherCache = new Map();

/** Cartes d'un fini de cuir (promesse ; calcul étalé sur plusieurs images, une seule fois par fini). */
export function leatherMaps(finish) {
  const key = LEATHER[finish] ? finish : 'lisse';
  if (!leatherCache.has(key)) leatherCache.set(key, generateLeather(key));
  return leatherCache.get(key);
}

// --- Métal brossé ------------------------------------------------------------

let brushedCache = null;

/** Stries de brossage le long de U : normales + rugosité. */
export function brushedMaps() {
  if (brushedCache) return brushedCache;
  const size = 512;
  const rnd = mulberry32(2024);
  const n = size * size;
  const height = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    const base = rnd();
    const cells = 4 + Math.floor(rnd() * 5);
    const lat = [];
    for (let i = 0; i < cells; i++) lat.push(rnd());
    const depth = Math.pow(rnd(), 3); // quelques rayures plus marquées
    for (let x = 0; x < size; x++) {
      const p = (x / size) * cells;
      const i0 = Math.floor(p);
      const t = p - i0;
      const w = t * t * (3 - 2 * t);
      const v = lat[i0 % cells] + (lat[(i0 + 1) % cells] - lat[i0 % cells]) * w;
      height[y * size + x] = base * 0.6 + v * 0.4 - depth * 0.5 * smooth(0.35, 0.65, v);
    }
  }
  const nb = new Uint8ClampedArray(n * 4);
  const rb = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < size; y++) {
    const ya = ((y + size - 1) % size) * size;
    const yb = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dy = (height[yb + x] - height[ya + x]) * 0.55;
      const l = 1 / Math.sqrt(dy * dy + 1);
      const o = i * 4;
      nb[o] = 128;
      nb[o + 1] = toByte(0.5 + 0.5 * dy * l);
      nb[o + 2] = toByte(0.5 + 0.5 * l);
      nb[o + 3] = 255;
      const r = toByte(0.78 + 0.34 * (height[i] - 0.5));
      rb[o] = 255;
      rb[o + 1] = r;
      rb[o + 2] = 255;
      rb[o + 3] = 255;
    }
  }
  brushedCache = { tile: 9, normal: canvasOf(size, nb), rough: canvasOf(size, rb) };
  return brushedCache;
}

// --- Fil ---------------------------------------------------------------------

let threadCache = null;

/** Torsade du fil ciré : stries diagonales. */
export function threadMaps() {
  if (threadCache) return threadCache;
  const size = 64;
  const bytes = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // deux brins retordus : 5 spires sur la longueur du point, inclinées d'environ 55°
      const ph = ((x / size) * 5 + (y / size) * 2) * Math.PI * 2;
      const d = Math.cos(ph) * 0.6;
      const gx = d * 0.93;
      const gy = d * 0.37;
      const l = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const o = (y * size + x) * 4;
      bytes[o] = toByte(0.5 - 0.5 * gx * l);
      bytes[o + 1] = toByte(0.5 + 0.5 * gy * l);
      bytes[o + 2] = toByte(0.5 + 0.5 * l);
      bytes[o + 3] = 255;
    }
  }
  threadCache = { normal: canvasOf(size, bytes) };
  return threadCache;
}

// --- Boîte à lumière ---------------------------------------------------------

let softboxCache = null;

/** Rectangle lumineux aux bords doux, plus chaud au centre (reflet de softbox). */
export function softboxCanvas() {
  if (softboxCache) return softboxCache;
  const size = 128;
  const bytes = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;
      const edge = Math.min(0.5 - Math.abs(u), 0.5 - Math.abs(v));
      const fall = smooth(0.0, 0.085, edge);
      const hot = 0.72 + 0.28 * Math.exp(-(u * u + v * v) * 7);
      const g = toByte(fall * hot);
      const o = (y * size + x) * 4;
      bytes[o] = g;
      bytes[o + 1] = g;
      bytes[o + 2] = g;
      bytes[o + 3] = 255;
    }
  }
  softboxCache = canvasOf(size, bytes);
  return softboxCache;
}
