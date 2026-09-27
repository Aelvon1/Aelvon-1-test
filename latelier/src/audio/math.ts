/**
 * Utilitaires numériques purs du moteur audio (aucune dépendance à Web Audio : testables sous
 * Node) : hasard reproductible, conversions de volume, notes MIDI.
 */

/** Générateur pseudo-aléatoire uniforme dans [0, 1). */
export type Rng = () => number;

/** Générateur « mulberry32 » : rapide, 32 bits, reproductible à partir d'une graine. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function randRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Entier uniforme dans [min, max] (bornes incluses). */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, values: readonly T[]): T {
  if (values.length === 0) throw new Error('pick : tableau vide');
  return values[Math.min(values.length - 1, Math.floor(rng() * values.length))]!;
}

/** Choix pondéré : `weights[i]` ≥ 0. */
export function pickWeighted<T>(rng: Rng, values: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += Math.max(0, weights[i] ?? 0);
  if (total <= 0) return pick(rng, values);
  let r = rng() * total;
  for (let i = 0; i < values.length; i++) {
    r -= Math.max(0, weights[i] ?? 0);
    if (r < 0) return values[i]!;
  }
  return values[values.length - 1]!;
}

/** Facteur multiplicatif aléatoire centré sur 1 : 1 ± `amount`. */
export function jitter(rng: Rng, amount: number): number {
  return 1 + (rng() * 2 - 1) * amount;
}

/** Variable gaussienne approchée (somme de 3 uniformes), centrée, écart-type ≈ 1. */
export function gaussian(rng: Rng): number {
  return (rng() + rng() + rng() - 1.5) * 2;
}

/**
 * Curseur de volume (0..1) → gain linéaire. Courbe quadratique : le milieu du curseur
 * (0,5) vaut −12 dB, ce qui correspond mieux à la perception qu'un gain linéaire.
 */
export function volumeToGain(volume: number): number {
  const v = clamp01(Number.isFinite(volume) ? volume : 0);
  return v * v;
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return gain <= 1e-9 ? -180 : 20 * Math.log10(gain);
}

/** Note MIDI → fréquence (La 440 = 69). */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
