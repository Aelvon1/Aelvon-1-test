/**
 * Générateur `cardboard` : carton ondulé kraft (couleur sRGB dans RGB, relief dans A ;
 * périodique).
 *
 * Les cannelures sont parallèles à V (répétées le long de U) et transparaissent sous la couverture.
 * Fibres claires et sombres, marbrures, auréoles d'humidité et éraflures.
 *
 * Paramètres : { flutes?: 24 (cannelures par répétition), color?: '#a87d4f', stains?: 2,
 * scuffs?: 30 }.
 */
import type { Generator } from './types';
import {
  type RGB,
  clamp01,
  drawLine,
  fbmField,
  mixRGB,
  num,
  parseRGB,
  raw,
  rng,
  smoothstep,
  stampRadial,
  worleyField,
} from './field';

export const cardboard: Generator = ({ width, height, params, seed }) => {
  const flutes = Math.max(1, Math.round(num(params, 'flutes', 24)));
  const base: RGB = parseRGB(raw(params, 'color'), [168, 125, 79]);
  const stainCount = Math.round(num(params, 'stains', 2));
  const scuffCount = Math.round(num(params, 'scuffs', 30));
  const rand = rng(seed, 31);

  const mottle = fbmField(width, height, { scale: 4, octaves: 6, persistence: 0.55, seed });
  const fibers = worleyField(width, height, Math.round(width / 6), seed + 1, 1);
  const fineNoise = fbmField(width, height, { scale: 128, octaves: 2, seed: seed + 2 });

  const stains = new Float32Array(width * height);
  for (let s = 0; s < stainCount; s++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const r = (0.08 + rand() * 0.1) * width;
    stampRadial(
      stains,
      width,
      height,
      cx,
      cy,
      r,
      (d) => smoothstep(0.08, 0, Math.abs(d - 0.9)) * 0.6 + smoothstep(0.9, 0.2, d) * 0.15,
      'max',
      0.8 + rand() * 0.4,
      0.8 + rand() * 0.4,
      rand() * Math.PI,
    );
  }
  const scuffs = new Float32Array(width * height);
  for (let s = 0; s < scuffCount; s++) {
    const x = rand() * width;
    const y = rand() * height;
    const a = rand() * Math.PI;
    const l = (0.02 + rand() * 0.08) * width;
    drawLine(
      scuffs,
      width,
      height,
      x,
      y,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l,
      1 + rand() * 2,
      0.5 + rand() * 0.5,
    );
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const light: RGB = [
    Math.min(255, base[0] * 1.2 + 20),
    Math.min(255, base[1] * 1.2 + 18),
    Math.min(255, base[2] * 1.15 + 12),
  ];
  const dark: RGB = [base[0] * 0.62, base[1] * 0.55, base[2] * 0.48];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const flute = 0.5 + 0.5 * Math.cos((2 * Math.PI * x * flutes) / width);
      // Fibres : quelques cellules très petites, claires ou sombres.
      const fid = fibers.id[i]!;
      const fiber = smoothstep(0.35, 0.05, fibers.f1[i]!) * (fid < 0.08 ? -1 : fid > 0.93 ? 1 : 0);
      let shade = 0.5 + (mottle[i]! - 0.5) * 0.5 + (fineNoise[i]! - 0.5) * 0.15 + (flute - 0.5) * 0.06;
      shade += fiber * 0.35;
      let c = shade < 0.5 ? mixRGB(dark, base, shade * 2) : mixRGB(base, light, (shade - 0.5) * 2);
      c = mixRGB(c, [c[0] * 0.72, c[1] * 0.64, c[2] * 0.55], clamp01(stains[i]!));
      // Éraflure : couche de surface arrachée, fibres claires dessous.
      c = mixRGB(c, light, clamp01(scuffs[i]!) * 0.6);
      out[i * 4] = c[0];
      out[i * 4 + 1] = c[1];
      out[i * 4 + 2] = c[2];
      out[i * 4 + 3] = clamp01(0.45 + flute * 0.35 + (fineNoise[i]! - 0.5) * 0.2 - scuffs[i]! * 0.2) * 255;
    }
  }
  return out;
};
