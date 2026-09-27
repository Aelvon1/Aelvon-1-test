/**
 * Champs scalaires rapides pour les générateurs procéduraux (exécutés dans le worker, mais
 * purement calculés : testables sous Node).
 *
 * Tous les champs sont des `Float32Array` largeur × hauteur, PÉRIODIQUES (bords raccordés) : les
 * textures produites se répètent sans couture. Les bruits sont évalués ligne par ligne à partir
 * de treillis précalculés (aucune allocation par pixel), ce qui permet quelques dizaines de
 * millisecondes par octave en 1024².
 */
import { hash2, mulberry32 } from './random';

export type Field = Float32Array;

/** Interpolation quintique (C2) : évite l'aspect « en grille » du bruit de valeur. */
const quintic = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Modulo positif. */
export const wrapIndex = (i: number, n: number): number => ((i % n) + n) % n;

export interface FbmOptions {
  /** Nombre de cellules de l'octave de base sur la largeur (entier : périodicité). */
  scale: number;
  /** Nombre de cellules sur la hauteur (défaut : `scale` × hauteur / largeur). */
  scaleY?: number;
  octaves?: number;
  persistence?: number;
  /** Facteur de fréquence entre octaves (entier conseillé ; défaut 2). */
  lacunarity?: number;
  /** Type de bruit (défaut `gradient`, plus organique ; `value` : plus rapide, plus « pixel »). */
  kind?: 'gradient' | 'value';
  seed: number;
}

/**
 * Ajoute à `out` une octave de bruit de valeur périodique (`px` × `py` cellules) × `amplitude`.
 * Treillis précalculé, poids horizontaux précalculés par colonne.
 */
export function addValueNoise(
  out: Field,
  width: number,
  height: number,
  px: number,
  py: number,
  seed: number,
  amplitude: number,
): void {
  px = Math.max(1, Math.round(px));
  py = Math.max(1, Math.round(py));
  const lattice = new Float32Array(px * py);
  for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) lattice[j * px + i] = hash2(i, j, seed);
  const x0 = new Int32Array(width);
  const x1 = new Int32Array(width);
  const sx = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const fx = (x / width) * px;
    const i = Math.floor(fx);
    x0[x] = i % px;
    x1[x] = (i + 1) % px;
    sx[x] = quintic(fx - i);
  }
  for (let y = 0; y < height; y++) {
    const fy = (y / height) * py;
    const j = Math.floor(fy);
    const r0 = (j % py) * px;
    const r1 = ((j + 1) % py) * px;
    const sy = quintic(fy - j);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const a = lattice[r0 + x0[x]!]!;
      const b = lattice[r0 + x1[x]!]!;
      const c = lattice[r1 + x0[x]!]!;
      const d = lattice[r1 + x1[x]!]!;
      const s = sx[x]!;
      const top = a + (b - a) * s;
      const bottom = c + (d - c) * s;
      out[row + x] = out[row + x]! + (top + (bottom - top) * sy) * amplitude;
    }
  }
}

/**
 * Ajoute à `out` une octave de bruit de gradient (Perlin) périodique × `amplitude`, recentrée
 * sur 0,5 (valeurs ≈ [0, 1]). Plus organique que le bruit de valeur (pas d'alignement sur la
 * grille), environ deux fois plus coûteux.
 */
export function addGradientNoise(
  out: Field,
  width: number,
  height: number,
  px: number,
  py: number,
  seed: number,
  amplitude: number,
): void {
  // Au-delà de ½ cellule par pixel, le bruit de gradient s'annule aux nœuds (pixels) : plafond.
  px = Math.max(1, Math.min(Math.round(px), Math.floor(width / 2)));
  py = Math.max(1, Math.min(Math.round(py), Math.floor(height / 2)));
  const gx = new Float32Array(px * py);
  const gy = new Float32Array(px * py);
  for (let j = 0; j < py; j++) {
    for (let i = 0; i < px; i++) {
      const a = hash2(i, j, seed) * Math.PI * 2;
      gx[j * px + i] = Math.cos(a);
      gy[j * px + i] = Math.sin(a);
    }
  }
  const x0 = new Int32Array(width);
  const x1 = new Int32Array(width);
  const fxs = new Float32Array(width);
  const sx = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const fx = (x / width) * px;
    const i = Math.floor(fx);
    x0[x] = i % px;
    x1[x] = (i + 1) % px;
    fxs[x] = fx - i;
    sx[x] = quintic(fx - i);
  }
  // ~0,7 : amplitude maximale théorique du bruit de gradient 2D → ramenée vers [0, 1].
  const k = amplitude * 0.75;
  for (let y = 0; y < height; y++) {
    const fyAbs = (y / height) * py;
    const j = Math.floor(fyAbs);
    const fy = fyAbs - j;
    const r0 = (j % py) * px;
    const r1 = ((j + 1) % py) * px;
    const sy = quintic(fy);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const fx = fxs[x]!;
      const a0 = r0 + x0[x]!;
      const b0 = r0 + x1[x]!;
      const c0 = r1 + x0[x]!;
      const d0 = r1 + x1[x]!;
      const a = gx[a0]! * fx + gy[a0]! * fy;
      const b = gx[b0]! * (fx - 1) + gy[b0]! * fy;
      const c = gx[c0]! * fx + gy[c0]! * (fy - 1);
      const d = gx[d0]! * (fx - 1) + gy[d0]! * (fy - 1);
      const s = sx[x]!;
      const top = a + (b - a) * s;
      const bottom = c + (d - c) * s;
      out[row + x] = out[row + x]! + (0.5 + (top + (bottom - top) * sy) * 1.3) * k;
    }
  }
}

/** Bruit fractal périodique normalisé dans [0, 1]. */
export function fbmField(width: number, height: number, options: FbmOptions): Field {
  const out = new Float32Array(width * height);
  const octaves = options.octaves ?? 5;
  const persistence = options.persistence ?? 0.5;
  const lacunarity = options.lacunarity ?? 2;
  const baseX = Math.max(1, Math.round(options.scale));
  const baseY = Math.max(1, Math.round(options.scaleY ?? (options.scale * height) / width));
  let amplitude = 1;
  let norm = 0;
  let fx = baseX;
  let fy = baseY;
  const add = options.kind === 'value' ? addValueNoise : addGradientNoise;
  for (let o = 0; o < octaves; o++) {
    add(out, width, height, fx, fy, options.seed + o * 1013, amplitude);
    norm += amplitude;
    amplitude *= persistence;
    fx = Math.max(1, Math.round(fx * lacunarity));
    fy = Math.max(1, Math.round(fy * lacunarity));
  }
  const inv = 1 / norm;
  for (let i = 0; i < out.length; i++) out[i] = clamp01(out[i]! * inv);
  return out;
}

/** Étire le champ pour occuper [0, 1] (min → 0, max → 1). */
export function normalize(field: Field): Field {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    const v = field[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range < 1e-9) {
    field.fill(0);
    return field;
  }
  const inv = 1 / range;
  for (let i = 0; i < field.length; i++) field[i] = (field[i]! - min) * inv;
  return field;
}

/** Lecture bilinéaire périodique d'un champ (coordonnées en pixels). */
export function sampleWrap(field: Field, width: number, height: number, x: number, y: number): number {
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const tx = x - xf;
  const ty = y - yf;
  const x0 = wrapIndex(xf, width);
  const y0 = wrapIndex(yf, height);
  const x1 = x0 + 1 === width ? 0 : x0 + 1;
  const y1 = y0 + 1 === height ? 0 : y0 + 1;
  const a = field[y0 * width + x0]!;
  const b = field[y0 * width + x1]!;
  const c = field[y1 * width + x0]!;
  const d = field[y1 * width + x1]!;
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

/**
 * Distorsion de domaine : `out(p) = field(p + amount × (dx(p) − 0,5, dy(p) − 0,5))`, `amount` en
 * pixels. Les champs de décalage doivent être périodiques pour conserver la périodicité.
 */
export function warpField(
  field: Field,
  width: number,
  height: number,
  dx: Field,
  dy: Field,
  amount: number,
): Field {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      out[i] = sampleWrap(field, width, height, x + (dx[i]! - 0.5) * amount, y + (dy[i]! - 0.5) * amount);
    }
  }
  return out;
}

/** Résultat d'un bruit cellulaire (Worley). */
export interface WorleyResult {
  /** Distance au point le plus proche (en cellules, ~0..1). */
  f1: Field;
  /** Distance au deuxième point le plus proche. */
  f2: Field;
  /** Valeur aléatoire [0, 1) de la cellule la plus proche. */
  id: Field;
}

/**
 * Bruit cellulaire périodique (`cells` × `cellsY` cellules, un point par cellule). Les points
 * sont recopiés dans une grille bordée d'une cellule (voisins périodiques sans modulo dans la
 * boucle chaude).
 */
export function worleyField(
  width: number,
  height: number,
  cells: number,
  seed: number,
  jitter = 1,
  cellsY?: number,
): WorleyResult {
  const cx = Math.max(1, Math.round(cells));
  const cy = Math.max(1, Math.round(cellsY ?? (cells * height) / width));
  const pw = cx + 2;
  const ph = cy + 2;
  // Positions absolues (en cellules) des points de la grille bordée.
  const px = new Float32Array(pw * ph);
  const py = new Float32Array(pw * ph);
  const pid = new Float32Array(pw * ph);
  for (let j = -1; j <= cy; j++) {
    const sj = wrapIndex(j, cy);
    for (let i = -1; i <= cx; i++) {
      const si = wrapIndex(i, cx);
      const k = (j + 1) * pw + (i + 1);
      px[k] = i + 0.5 + (hash2(si, sj, seed) - 0.5) * jitter;
      py[k] = j + 0.5 + (hash2(si, sj, seed + 7919) - 0.5) * jitter;
      pid[k] = hash2(si, sj, seed + 104729);
    }
  }
  const f1 = new Float32Array(width * height);
  const f2 = new Float32Array(width * height);
  const id = new Float32Array(width * height);
  const sxCell = cx / width;
  const syCell = cy / height;
  for (let y = 0; y < height; y++) {
    const gy = (y + 0.5) * syCell;
    const j = Math.min(cy - 1, Math.floor(gy));
    for (let x = 0; x < width; x++) {
      const gx = (x + 0.5) * sxCell;
      const i = Math.min(cx - 1, Math.floor(gx));
      let d1 = 1e9;
      let d2 = 1e9;
      let best = 0;
      for (let oj = 0; oj < 3; oj++) {
        let k = (j + oj) * pw + i;
        for (let oi = 0; oi < 3; oi++, k++) {
          const ddx = px[k]! - gx;
          const ddy = py[k]! - gy;
          const d = ddx * ddx + ddy * ddy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            best = pid[k]!;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      const o = y * width + x;
      f1[o] = Math.sqrt(d1);
      f2[o] = Math.sqrt(d2);
      id[o] = best;
    }
  }
  return { f1, f2, id };
}

/** Flou périodique (trois flous-boîtes séparables ≈ gaussienne d'écart-type ~ `radius`). */
export function blurWrap(data: Field, width: number, height: number, radius: number): void {
  if (radius < 0.5) return;
  const r = Math.max(1, Math.round(radius / 1.7));
  const tmp = new Float32Array(data.length);
  for (let pass = 0; pass < 3; pass++) {
    boxWrapH(data, tmp, width, height, r);
    boxWrapV(tmp, data, width, height, r);
  }
}

function boxWrapH(src: Field, dst: Field, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[row + wrapIndex(i, w)]!;
    let add = r + 1;
    let sub = -r;
    for (let x = 0; x < w; x++, add++, sub++) {
      dst[row + x] = acc * inv;
      acc += src[row + (add >= w ? add - w : add)]! - src[row + (sub < 0 ? sub + w : sub)]!;
    }
  }
}

function boxWrapV(src: Field, dst: Field, w: number, h: number, r: number): void {
  const inv = 1 / (2 * r + 1);
  // Accumulateurs par colonne : parcours ligne par ligne (accès mémoire contigus).
  const acc = new Float64Array(w);
  for (let i = -r; i <= r; i++) {
    const row = wrapIndex(i, h) * w;
    for (let x = 0; x < w; x++) acc[x] = acc[x]! + src[row + x]!;
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let add = y + r + 1;
    let sub = y - r;
    if (add >= h) add -= h;
    if (sub < 0) sub += h;
    const addRow = add * w;
    const subRow = sub * w;
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc[x]! * inv;
      acc[x] = acc[x]! + src[addRow + x]! - src[subRow + x]!;
    }
  }
}

/** Mode de combinaison d'un tracé avec le champ existant. */
export type BlendMode = 'max' | 'add' | 'over';

function blendInto(field: Field, index: number, value: number, alpha: number, mode: BlendMode): void {
  const current = field[index]!;
  if (mode === 'max') field[index] = Math.max(current, value * alpha);
  else if (mode === 'add') field[index] = current + value * alpha;
  else field[index] = current + (value - current) * alpha;
}

/**
 * Trace un segment anticrénelé périodique (coordonnées en pixels, épaisseur en pixels) avec une
 * intensité qui peut varier le long du segment (`profile(t)`, t ∈ [0, 1]).
 */
export function drawLine(
  field: Field,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  value: number,
  mode: BlendMode = 'max',
  profile?: (t: number) => number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return;
  const half = Math.max(0.35, thickness / 2);
  const reach = half + 1;
  const minX = Math.floor(Math.min(x0, x1) - reach);
  const maxX = Math.ceil(Math.max(x0, x1) + reach);
  const minY = Math.floor(Math.min(y0, y1) - reach);
  const maxY = Math.ceil(Math.max(y0, y1) + reach);
  const invLen2 = 1 / (length * length);
  // Les traits très fins restent visibles mais s'atténuent (couverture partielle du pixel).
  const coverage = Math.min(1, thickness);
  for (let y = minY; y <= maxY; y++) {
    const wy = wrapIndex(y, height) * width;
    for (let x = minX; x <= maxX; x++) {
      const t = Math.min(1, Math.max(0, ((x - x0) * dx + (y - y0) * dy) * invLen2));
      const px = x0 + dx * t - x;
      const py = y0 + dy * t - y;
      const d = Math.sqrt(px * px + py * py);
      const a = Math.min(1, Math.max(0, half + 0.5 - d)) * coverage;
      if (a <= 0) continue;
      blendInto(field, wy + wrapIndex(x, width), profile ? value * profile(t) : value, a, mode);
    }
  }
}

/**
 * Tampon radial périodique : `shape(d)` reçoit la distance normalisée (0 au centre, 1 au bord)
 * et retourne la valeur (0..1) combinée selon `mode`. `sx`/`sy`/`angle` : ellipse orientée.
 */
export function stampRadial(
  field: Field,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  shape: (d: number, x: number, y: number) => number,
  mode: BlendMode = 'max',
  sx = 1,
  sy = 1,
  angle = 0,
): void {
  const rx = radius * Math.max(sx, sy);
  const minX = Math.floor(cx - rx - 1);
  const maxX = Math.ceil(cx + rx + 1);
  const minY = Math.floor(cy - rx - 1);
  const maxY = Math.ceil(cy + rx + 1);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let y = minY; y <= maxY; y++) {
    const wy = wrapIndex(y, height) * width;
    for (let x = minX; x <= maxX; x++) {
      const ox = x + 0.5 - cx;
      const oy = y + 0.5 - cy;
      const lx = (ox * c + oy * s) / (radius * sx);
      const ly = (-ox * s + oy * c) / (radius * sy);
      const d = Math.sqrt(lx * lx + ly * ly);
      if (d >= 1) continue;
      const v = shape(d, lx, ly);
      if (v <= 0 && mode !== 'over') continue;
      blendInto(field, wy + wrapIndex(x, width), v, 1, mode);
    }
  }
}

/** Assemble jusqu'à 4 champs [0, 1] (ou constantes) en pixels RGBA 8 bits. */
export function packRGBA(
  width: number,
  height: number,
  r: Field | number,
  g: Field | number,
  b: Field | number,
  a: Field | number = 1,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const n = width * height;
  const channels = [r, g, b, a];
  for (let c = 0; c < 4; c++) {
    const src = channels[c]!;
    if (typeof src === 'number') {
      const v = Math.round(src * 255);
      for (let i = 0; i < n; i++) out[i * 4 + c] = v;
    } else {
      for (let i = 0; i < n; i++) out[i * 4 + c] = src[i]! * 255 + 0.5;
    }
  }
  return out;
}

/** Couleur RGB 0..255 (sRGB). */
export type RGB = readonly [number, number, number];

/** Interpolation linéaire de deux couleurs (composantes sRGB, suffisant pour des dégradés doux). */
export function mixRGB(a: RGB, b: RGB, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Lecture d'une couleur « #rrggbb » ou d'un triplet 0..255. */
export function parseRGB(value: unknown, fallback: RGB): RGB {
  if (Array.isArray(value) && value.length >= 3 && value.every((v) => typeof v === 'number')) {
    return [value[0] as number, value[1] as number, value[2] as number];
  }
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
    const n = parseInt(value.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return fallback;
}

/** Fonctions utilitaires. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Générateur aléatoire déterministe dérivé d'une graine et d'un canal. */
export const rng = (seed: number, salt: number): (() => number) =>
  mulberry32((seed ^ (salt * 0x9e3779b1)) >>> 0);

/** Lit un nombre dans des paramètres inconnus (valeur par défaut sinon). */
export function num(params: unknown, key: string, fallback: number): number {
  if (params && typeof params === 'object' && key in params) {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return fallback;
}

/** Lit une chaîne dans des paramètres inconnus. */
export function str(params: unknown, key: string, fallback: string): string {
  if (params && typeof params === 'object' && key in params) {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
  }
  return fallback;
}

/** Lit une valeur brute dans des paramètres inconnus. */
export function raw(params: unknown, key: string): unknown {
  if (params && typeof params === 'object' && key in params) return (params as Record<string, unknown>)[key];
  return undefined;
}

/**
 * Retourne verticalement des pixels RGBA (en place). Les générateurs « image » (étiquettes,
 * paysage) dessinent de haut en bas ; le service de textures place la ligne 0 en v = 0 (bas des
 * UV standard) : on retourne donc l'image pour qu'elle s'affiche à l'endroit.
 */
export function flipRowsRGBA(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const stride = width * 4;
  const tmp = new Uint8ClampedArray(stride);
  for (let y = 0; y < height >> 1; y++) {
    const a = y * stride;
    const b = (height - 1 - y) * stride;
    tmp.set(data.subarray(a, a + stride));
    data.copyWithin(a, b, b + stride);
    data.set(tmp, b);
  }
  return data;
}
