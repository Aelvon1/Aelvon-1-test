/**
 * Aléa déterministe et bruits (valeur, fractal) utilisés par les générateurs procéduraux.
 */

/** Générateur pseudo-aléatoire rapide (mulberry32), reproductible à graine égale. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage entier 2D → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Bruit de valeur 2D périodique (période `px`×`py` cellules) : les textures générées se
 * répètent sans couture.
 */
export function valueNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Bruit fractal périodique : `u`, `v` ∈ [0, 1) ; `scale` = nombre de cellules de l'octave de base.
 * Retourne une valeur ∈ [0, 1].
 */
export function fbm(
  u: number,
  v: number,
  scale: number,
  octaves: number,
  seed: number,
  persistence = 0.5,
): number {
  let amplitude = 1;
  let frequency = scale;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const period = Math.max(1, Math.round(frequency));
    sum += amplitude * valueNoise(u * period, v * period, period, period, seed + o * 1013);
    norm += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return sum / norm;
}
