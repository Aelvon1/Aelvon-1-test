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
async function worley(size, cellsX, cellsY, seed, f1, f2, budget) {
  const rnd = mulberry32(seed);
  const n = cellsX * cellsY;
  const fx = new Float32Array(n);
  const fy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    fx[i] = (i % cellsX) + rnd();
    fy[i] = Math.floor(i / cellsX) + rnd();
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
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      const o = y * size + x;
      f1[o] = Math.sqrt(d1);
      f2[o] = Math.sqrt(d2);
    }
    if ((y & 31) === 31) await budget();
  }
}

/** Bruit de valeur fractal périodique, normalisé dans [0, 1]. */
async function fbm(size, cells, octaves, seed, out, budget) {
  const rnd = mulberry32(seed);
  out.fill(0);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = cells << o;
    const lat = new Float32Array(c * c);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    const s = c / size;
    for (let y = 0; y < size; y++) {
      const py = y * s;
      const y0 = Math.floor(py);
      const ty = py - y0;
      const wy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % c) * c;
      const r1 = ((y0 + 1) % c) * c;
      for (let x = 0; x < size; x++) {
        const px = x * s;
        const x0 = Math.floor(px);
        const tx = px - x0;
        const wx = tx * tx * (3 - 2 * tx);
        const xa = x0 % c;
        const xb = (x0 + 1) % c;
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
  // Pleine fleur lisse : grain très fin, pores, légère ondulation.
  lisse: { size: 1024, tile: 26 },
  // Grainé : galets irréguliers séparés par des sillons.
  graine: { size: 1024, tile: 28 },
  // Nubuck : pas de relief, seulement le velours des fibres.
  mat: { size: 512, tile: 20 },
};

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
    await worley(size, 34, 34, 1207, f1, f2, budget); // galets ≈ 0,8 mm
    await worley(size, 92, 92, 77, g1, g2, budget); // rides fines
    await fbm(size, 8, 4, 31, low, budget);
    for (let i = 0; i < n; i++) {
      const valley = 1 - smooth(0.0, 0.5, f2[i] - f1[i]); // 1 au fond du sillon
      const v2 = valley * valley; // épaulements arrondis
      const dome = 1 - 0.9 * f1[i] * f1[i];
      const c2 = (1 - smooth(0.0, 0.3, g2[i] - g1[i])) * (1 - valley);
      const f = low[i] - 0.5;
      height[i] = -0.075 * v2 + 0.03 * (dome - 0.5) - 0.006 * c2 + 0.012 * f;
      rough[i] = 0.5 + 0.12 * v2 + 0.03 * c2 - 0.06 * (dome - 0.6) + 0.03 * f;
      cavity[i] = 1 - 0.35 * v2 - 0.06 * c2;
      tint[i] = 1 - 0.1 * v2 - 0.02 * c2 + 0.03 * f;
    }
  } else if (finish === 'lisse') {
    const g1 = new Float32Array(n);
    const g2 = new Float32Array(n);
    const hi = new Float32Array(n);
    const mid = new Float32Array(n);
    await worley(size, 74, 60, 9001, f1, f2, budget);
    await worley(size, 128, 128, 4242, g1, g2, budget);
    await fbm(size, 7, 4, 5, low, budget);
    await fbm(size, 22, 3, 17, mid, budget);
    await fbm(size, 96, 2, 11, hi, budget);
    for (let i = 0; i < n; i++) {
      // rides fines, estompées par plages : le réseau ne se referme pas partout
      const c1 = (1 - smooth(0.0, 0.26, f2[i] - f1[i])) * (0.25 + 0.75 * smooth(0.34, 0.62, mid[i]));
      const f = low[i] - 0.5;
      const pore = (1 - smooth(0.1, 0.26, g1[i])) * smooth(-0.3, 0.05, f);
      height[i] = -0.012 * c1 - 0.02 * pore + 0.012 * f + 0.004 * (hi[i] - 0.5);
      rough[i] = 0.4 + 0.07 * c1 + 0.09 * pore + 0.012 * f + 0.025 * (hi[i] - 0.5);
      cavity[i] = 1 - 0.12 * c1 - 0.25 * pore;
      tint[i] = 1 - 0.045 * c1 - 0.1 * pore + 0.035 * f;
    }
  } else {
    const hi = new Float32Array(n);
    await fbm(size, 20, 4, 99, low, budget);
    await fbm(size, 128, 2, 7, hi, budget);
    for (let i = 0; i < n; i++) {
      const f = low[i] - 0.5;
      const h = hi[i] - 0.5;
      height[i] = 0.009 * h + 0.004 * f;
      rough[i] = 0.93 + 0.06 * f;
      cavity[i] = 1;
      tint[i] = 1 + 0.13 * f + 0.1 * h;
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
    tintGain: 1 / 0.86,
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
      const ph = ((x / size) * 3 + (y / size) * 1) * Math.PI * 2;
      const d = Math.cos(ph) * 0.75;
      // gradient de sin(ph) le long de (3, 1)
      const gx = d * 0.95;
      const gy = d * 0.32;
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
