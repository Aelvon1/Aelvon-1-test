/**
 * Générateur `weave` : tissage (toile, sergé, natté, satin) — fibre de verre, fibre de carbone,
 * tissus, tapis (données linéaires, périodique).
 *
 * Chaîne = fils verticaux (le long de V), trame = fils horizontaux (le long de U).
 *
 * Canaux :
 * - R : hauteur (section du fil + ondulation dessus/dessous) ;
 * - G : fil visible (1 = chaîne, 0 = trame) : sert à orienter reflets et anisotropie ;
 * - B : fibres (stries le long du fil visible) + teinte propre à chaque fil ;
 * - A : couverture (0 = interstice entre les fils).
 *
 * Paramètres : { threads?: 16 (fils par répétition, chaque sens), threadsY?: threads,
 * pattern?: 'plain' | 'twill' | 'basket' | 'satin', over?: 2 (sergé : fils sautés), gap?: 0.08
 * (interstice, fraction du pas), flat?: 0.5 (0 = fil rond, 1 = mèche plate), fiber?: 0.6,
 * irregularity?: 0.15 }. Le nombre de fils est arrondi à un multiple de la période du motif.
 */
import type { Generator } from './types';
import { addValueNoise, clamp01, normalize, num, packRGBA, rng, smoothstep, str } from './field';

type Pattern = 'plain' | 'twill' | 'basket' | 'satin';

/** Vrai si la chaîne passe AU-DESSUS de la trame à l'intersection (i, j). */
export function warpOnTop(pattern: Pattern, i: number, j: number, over: number): boolean {
  switch (pattern) {
    case 'twill':
      return (((i + j) % (2 * over)) + 2 * over) % (2 * over) < over;
    case 'basket':
      return (Math.floor(i / 2) + Math.floor(j / 2)) % 2 === 0;
    case 'satin':
      return (i * 2 + j) % 5 !== 0;
    default:
      return (i + j) % 2 === 0;
  }
}

/** Période (en fils) du motif. */
function patternPeriod(pattern: Pattern, over: number): number {
  switch (pattern) {
    case 'twill':
      return 2 * over;
    case 'basket':
      return 4;
    case 'satin':
      return 5;
    default:
      return 2;
  }
}

export const weave: Generator = ({ width, height, params, seed }) => {
  const patternName = str(params, 'pattern', 'plain');
  const pattern: Pattern =
    patternName === 'twill' || patternName === 'basket' || patternName === 'satin' ? patternName : 'plain';
  const over = Math.max(1, Math.round(num(params, 'over', 2)));
  const period = patternPeriod(pattern, over);
  const roundTo = (n: number) => Math.max(period, Math.round(n / period) * period);
  const nx = roundTo(num(params, 'threads', 16));
  const ny = roundTo(num(params, 'threadsY', nx));
  const gap = clamp01(num(params, 'gap', 0.08));
  const flat = clamp01(num(params, 'flat', 0.5));
  const fiberAmount = clamp01(num(params, 'fiber', 0.6));
  const irregularity = num(params, 'irregularity', 0.15);
  const rand = rng(seed, 21);

  // Variations propres à chaque fil (largeur, teinte).
  const warpWidth = new Float32Array(nx);
  const warpTone = new Float32Array(nx);
  const weftWidth = new Float32Array(ny);
  const weftTone = new Float32Array(ny);
  for (let i = 0; i < nx; i++) {
    warpWidth[i] = 1 + (rand() - 0.5) * irregularity;
    warpTone[i] = rand();
  }
  for (let j = 0; j < ny; j++) {
    weftWidth[j] = 1 + (rand() - 0.5) * irregularity;
    weftTone[j] = rand();
  }

  // Fibres : bruit très étiré le long de chaque direction de fil.
  const fibersV = new Float32Array(width * height);
  addValueNoise(fibersV, width, height, Math.min(width, nx * 12), Math.max(1, ny / 2), seed + 1, 0.6);
  addValueNoise(fibersV, width, height, Math.min(width, nx * 24), Math.max(1, ny), seed + 2, 0.4);
  normalize(fibersV);
  const fibersU = new Float32Array(width * height);
  addValueNoise(fibersU, width, height, Math.max(1, nx / 2), Math.min(height, ny * 12), seed + 3, 0.6);
  addValueNoise(fibersU, width, height, Math.max(1, nx), Math.min(height, ny * 24), seed + 4, 0.4);
  normalize(fibersU);

  // Section du fil : exposant faible = mèche plate (carbone), 0,5 = fil rond.
  const exponent = 0.5 - flat * 0.38;
  const profile = (t: number): number => (t >= 1 ? 0 : Math.pow(1 - t * t, exponent));
  const halfWidth = 0.5 - gap / 2;

  const h = new Float32Array(width * height);
  const id = new Float32Array(width * height);
  const fiber = new Float32Array(width * height);
  const cover = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = (y / height) * ny;
    const j = Math.floor(v);
    const fv = v - j;
    for (let x = 0; x < width; x++) {
      const u = (x / width) * nx;
      const i = Math.floor(u);
      const fu = u - i;
      const top = warpOnTop(pattern, i, j, over);
      const pw = profile(Math.abs(fu - 0.5) / (halfWidth * warpWidth[i]!));
      const pf = profile(Math.abs(fv - 0.5) / (halfWidth * weftWidth[j]!));
      // Ondulation : le fil du dessus culmine au centre de l'intersection et plonge vers les voisins.
      const warpH = pw * (top ? 0.72 + 0.28 * Math.cos(Math.PI * (fv - 0.5)) : 0.3);
      const weftH = pf * (!top ? 0.72 + 0.28 * Math.cos(Math.PI * (fu - 0.5)) : 0.3);
      const o = y * width + x;
      const warpVisible = warpH >= weftH;
      h[o] = Math.max(warpH, weftH);
      id[o] = warpVisible ? 1 : 0;
      const f = warpVisible ? fibersV[o]! : fibersU[o]!;
      const tone = warpVisible ? warpTone[i]! : weftTone[j]!;
      fiber[o] = clamp01(0.5 + (f - 0.5) * fiberAmount * 1.6 + (tone - 0.5) * 0.3);
      cover[o] = smoothstep(0, 0.15, Math.max(pw, pf));
    }
  }
  return packRGBA(width, height, h, id, fiber, cover);
};
