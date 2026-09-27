/**
 * Génération procédurale d'échantillons (fonctions pures sur `Float32Array`) : bruits blanc,
 * rose et brun bouclables, textures d'impacts de pluie, crépitements, réponse impulsionnelle
 * de la pièce. Calculées une seule fois puis réutilisées par toutes les voix.
 */
import { type Rng, mulberry32, randRange } from './math';

/** Bruit blanc uniforme dans [−1, 1). */
export function whiteNoise(length: number, rng: Rng): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rng() * 2 - 1;
  return out;
}

/**
 * Bruit rose (−3 dB/octave), crête ≈ 1.
 * Approximation : filtre de Paul Kellet (somme de filtres à un pôle), pente exacte à ±0,05 dB
 * près dans la bande audible.
 */
export function pinkNoise(length: number, rng: Rng): Float32Array {
  const out = new Float32Array(length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Bruit brun (−6 dB/octave, intégrateur à fuite), normalisé. */
export function brownNoise(length: number, rng: Rng): Float32Array {
  const out = new Float32Array(length);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    out[i] = last;
  }
  // Retrait de la composante continue puis normalisation de la crête.
  removeDc(out);
  normalizePeak(out, 0.9);
  return out;
}

/** Soustrait la moyenne. */
export function removeDc(data: Float32Array): void {
  if (data.length === 0) return;
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]!;
  const mean = sum / data.length;
  for (let i = 0; i < data.length; i++) data[i] = data[i]! - mean;
}

/** Ramène la crête à `peak` (sans effet sur un signal nul). */
export function normalizePeak(data: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]!));
  if (max <= 1e-9) return;
  const k = peak / max;
  for (let i = 0; i < data.length; i++) data[i] = data[i]! * k;
}

/** Valeur efficace (RMS). */
export function rms(data: Float32Array, start = 0, end = data.length): number {
  let sum = 0;
  const n = Math.max(1, end - start);
  for (let i = start; i < end; i++) sum += data[i]! * data[i]!;
  return Math.sqrt(sum / n);
}

/**
 * Rend un tampon bouclable sans clic : la fin est fondue (à puissance constante) dans le
 * début. Le résultat est plus court de `fade` échantillons ; lu en boucle, il est continu.
 */
export function makeSeamless(data: Float32Array, fade: number): Float32Array {
  const f = Math.max(1, Math.min(Math.floor(fade), Math.floor(data.length / 2)));
  const n = data.length - f;
  const out = new Float32Array(n);
  out.set(data.subarray(0, n));
  for (let i = 0; i < f; i++) {
    const x = (i / f) * (Math.PI / 2);
    out[i] = data[i]! * Math.sin(x) + data[n + i]! * Math.cos(x);
  }
  return out;
}

/** Styles de textures d'impacts. */
export type ImpactStyle = 'roof' | 'glass' | 'sizzle';

export interface ImpactTextureSpec {
  style: ImpactStyle;
  /** Impacts par seconde. */
  rate: number;
  seconds: number;
}

/**
 * Texture d'impacts (gouttes, crépitements) bouclable : chaque impact est écrit modulo la
 * longueur du tampon, la boucle n'a donc aucune couture.
 */
export function renderImpacts(sampleRate: number, spec: ImpactTextureSpec, rng: Rng): Float32Array {
  const n = Math.max(1, Math.floor(spec.seconds * sampleRate));
  const out = new Float32Array(n);
  const count = Math.max(1, Math.round(spec.rate * spec.seconds));
  for (let k = 0; k < count; k++) {
    const start = Math.floor(rng() * n);
    // Distribution des tailles : beaucoup de petites gouttes, quelques grosses.
    const size = rng() ** 2.6;
    switch (spec.style) {
      case 'roof':
        writeRoofDrop(out, start, sampleRate, size, rng);
        break;
      case 'glass':
        writeGlassDrop(out, start, sampleRate, size, rng);
        break;
      case 'sizzle':
        writeSizzlePop(out, start, sampleRate, size, rng);
        break;
    }
  }
  removeDc(out);
  normalizePeak(out, 0.95);
  return out;
}

/**
 * Goutte sur une toiture (tôle + voligeage), entendue de l'intérieur : « toc » sourd + souffle bref.
 * Approximation : modèle phénoménologique (sinus amorti à hauteur descendante + clic filtré),
 * pas une simulation physique de l'impact ni du rayonnement de la tôle.
 */
function writeRoofDrop(out: Float32Array, start: number, sr: number, size: number, rng: Rng): void {
  const n = out.length;
  const amp = 0.15 + size * 0.85;
  // Composante tonale : résonance de la tôle, légère chute de hauteur.
  const f0 = randRange(rng, 170, 520) * (1.25 - size * 0.4);
  const tau = randRange(rng, 0.006, 0.014) + size * 0.02;
  const len = Math.min(n, Math.floor(tau * 6 * sr));
  let phase = rng() * Math.PI * 2;
  // Composante bruitée : claquement filtré passe-bas (un pôle).
  const tauNoise = randRange(rng, 0.0015, 0.004);
  const lp = Math.exp((-2 * Math.PI * randRange(rng, 1200, 3200)) / sr);
  let y = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = f0 * (1 - 0.25 * Math.min(1, t / tau / 3));
    phase += (2 * Math.PI * f) / sr;
    const tone = Math.sin(phase) * Math.exp(-t / tau) * (0.55 + size * 0.45);
    y = lp * y + (1 - lp) * (rng() * 2 - 1);
    const click = y * 3 * Math.exp(-t / tauNoise);
    const idx = (start + i) % n;
    out[idx] = out[idx]! + amp * (tone + click);
  }
}

/** Goutte sur une vitre : tic sec, parfois un « plink » (résonance de bulle, glissando montant). */
function writeGlassDrop(out: Float32Array, start: number, sr: number, size: number, rng: Rng): void {
  const n = out.length;
  const amp = 0.2 + size * 0.8;
  const tauClick = randRange(rng, 0.0004, 0.0012);
  const lenClick = Math.floor(tauClick * 8 * sr);
  let prev = 0;
  for (let i = 0; i < lenClick; i++) {
    const w = rng() * 2 - 1;
    // Dérivée du bruit : spectre éclairci (tic de verre).
    const v = (w - prev) * 0.6;
    prev = w;
    const idx = (start + i) % n;
    out[idx] = out[idx]! + amp * v * Math.exp(-i / sr / tauClick);
  }
  if (rng() < 0.35) {
    const f0 = randRange(rng, 1400, 3600) * (1.2 - size * 0.5);
    const tau = randRange(rng, 0.004, 0.011);
    const len = Math.floor(tau * 6 * sr);
    let phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = f0 * (1 + 1.4 * (t / (tau * 6)));
      phase += (2 * Math.PI * f) / sr;
      const idx = (start + i) % n;
      out[idx] = out[idx]! + amp * 0.35 * Math.sin(phase) * Math.exp(-t / tau);
    }
  }
}

/** Micro-éclatement (flux qui grésille sous la panne du fer) : impulsion brève très aiguë. */
function writeSizzlePop(out: Float32Array, start: number, sr: number, size: number, rng: Rng): void {
  const n = out.length;
  const amp = 0.25 + size * 0.75;
  const tau = randRange(rng, 0.0002, 0.0009) + size * 0.001;
  const len = Math.floor(tau * 7 * sr) + 2;
  const sign = rng() < 0.5 ? -1 : 1;
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const w = rng() * 2 - 1;
    const v = i === 0 ? sign : (w - prev) * 0.7;
    prev = w;
    const idx = (start + i) % n;
    out[idx] = out[idx]! + amp * v * Math.exp(-i / sr / tau);
  }
}

/**
 * Crépitements d'électricité statique (parasites radio) : impulsions éparses d'amplitude très
 * variable, parfois en rafales.
 */
export function renderCrackle(sampleRate: number, seconds: number, density: number, rng: Rng): Float32Array {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(n);
  const count = Math.round(density * seconds);
  for (let k = 0; k < count; k++) {
    let start = Math.floor(rng() * n);
    const burst = rng() < 0.2 ? 2 + Math.floor(rng() * 6) : 1;
    for (let b = 0; b < burst; b++) {
      const amp = rng() ** 3 * (b === 0 ? 1 : 0.6);
      const len = 2 + Math.floor(rng() * 24);
      const sign = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < len; i++) {
        const idx = (start + i) % n;
        out[idx] = out[idx]! + sign * amp * Math.exp(-i / (len * 0.3)) * (i % 2 === 0 ? 1 : -0.7);
      }
      start += Math.floor(randRange(rng, 0.0005, 0.004) * sampleRate);
    }
  }
  normalizePeak(out, 0.95);
  return out;
}

/**
 * Réponse impulsionnelle stéréo de l'atelier (≈ 20 m², béton, étagères encombrées) :
 * premières réflexions discrètes puis queue diffuse dont les aigus s'éteignent plus vite.
 * Approximation : réponse synthétique (délais de réflexions plausibles pour une pièce de
 * 5 × 4 × 2,7 m, décroissance exponentielle), non calculée à partir de la géométrie réelle.
 */
export function renderRoomImpulse(sampleRate: number, rt60: number, rng: Rng): [Float32Array, Float32Array] {
  const seconds = Math.min(2, rt60 * 1.1);
  const n = Math.max(16, Math.floor(seconds * sampleRate));
  const channels: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const tau = rt60 / 6.91; // −60 dB à rt60
  for (let c = 0; c < 2; c++) {
    const data = channels[c]!;
    // Premières réflexions (murs à 2–2,5 m, sol, plafond).
    const taps = [0.0042, 0.0071, 0.0093, 0.0121, 0.0148, 0.0183, 0.0217, 0.0262];
    for (const tap of taps) {
      const t = tap * randRange(rng, 0.9, 1.12);
      const idx = Math.floor(t * sampleRate);
      if (idx < n) data[idx] = data[idx]! + (rng() < 0.5 ? -1 : 1) * 0.55 * Math.exp(-t / (tau * 1.4));
    }
    // Queue diffuse : bruit × décroissance exponentielle, passe-bas dont la coupure baisse.
    let y = 0;
    const onset = Math.floor(0.006 * sampleRate);
    for (let i = onset; i < n; i++) {
      const t = i / sampleRate;
      const cutoff = 7000 * Math.exp(-t / (rt60 * 0.45)) + 900;
      const a = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      y = a * y + (1 - a) * (rng() * 2 - 1);
      const fadeIn = Math.min(1, (i - onset) / (0.012 * sampleRate));
      data[i] = data[i]! + y * 1.6 * Math.exp(-t / tau) * fadeIn;
    }
    // Petit fondu final (pas de troncature audible).
    const fadeLen = Math.floor(0.03 * sampleRate);
    for (let i = 0; i < fadeLen; i++) data[n - 1 - i] = data[n - 1 - i]! * (i / fadeLen);
  }
  // Normalisation en énergie : le niveau de réverbération est réglé par les envois.
  let energy = 0;
  for (const d of channels) for (let i = 0; i < n; i++) energy += d[i]! * d[i]!;
  const k = energy > 0 ? 1 / Math.sqrt(energy / 2) : 1;
  for (const d of channels) for (let i = 0; i < n; i++) d[i] = d[i]! * k * 0.5;
  return channels;
}

/** Tampons partagés par toutes les voix (bruits, textures d'impacts, parasites). */
export type SharedSampleId =
  'white' | 'pink' | 'brown' | 'roofImpactsA' | 'roofImpactsB' | 'glassImpacts' | 'sizzlePops' | 'crackle';

export const SHARED_SAMPLE_IDS: readonly SharedSampleId[] = [
  'white',
  'pink',
  'brown',
  'roofImpactsA',
  'roofImpactsB',
  'glassImpacts',
  'sizzlePops',
  'crackle',
];

/** Fréquence d'échantillonnage des tampons pré-générés (rééchantillonnés à la lecture si besoin). */
export const PREGENERATED_SAMPLE_RATE = 48000;

/** Graines fixes : textures identiques d'une session à l'autre (reproductibilité). */
const SHARED_SEEDS: Record<SharedSampleId, number> = {
  white: 11,
  pink: 12,
  brown: 13,
  roofImpactsA: 21,
  roofImpactsB: 22,
  glassImpacts: 23,
  sizzlePops: 24,
  crackle: 25,
};

/** Génère un tampon partagé (mono, bouclable sans couture). */
export function generateSharedSamples(id: SharedSampleId, sampleRate: number): Float32Array {
  const rng = mulberry32(SHARED_SEEDS[id]);
  const fade = Math.floor(0.05 * sampleRate);
  switch (id) {
    case 'white':
      return whiteNoise(Math.floor(2.3 * sampleRate), rng);
    case 'pink':
      return makeSeamless(pinkNoise(Math.floor(3.1 * sampleRate) + fade, rng), fade);
    case 'brown':
      return makeSeamless(brownNoise(Math.floor(3.7 * sampleRate) + fade, rng), fade);
    // Durées premières entre elles : les motifs des couches ne se répètent pas ensemble.
    case 'roofImpactsA':
      return renderImpacts(sampleRate, { style: 'roof', rate: 34, seconds: 5.3 }, rng);
    case 'roofImpactsB':
      return renderImpacts(sampleRate, { style: 'roof', rate: 28, seconds: 6.1 }, rng);
    case 'glassImpacts':
      return renderImpacts(sampleRate, { style: 'glass', rate: 22, seconds: 4.7 }, rng);
    case 'sizzlePops':
      return renderImpacts(sampleRate, { style: 'sizzle', rate: 260, seconds: 2.9 }, rng);
    case 'crackle':
      return renderCrackle(sampleRate, 3.3, 9, rng);
  }
}

/** Réverbération de l'atelier : RT60 et graine (communs au fil principal et au worker). */
export const ROOM_RT60 = 0.55;
export const ROOM_IMPULSE_SEED = 7;
