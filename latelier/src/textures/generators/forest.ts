/**
 * Générateur `forest` : silhouettes d'arbres dans la brume, vues par la fenêtre (couleur sRGB
 * dans RGB, profondeur dans A : 0 = ciel, 1 = plan le plus proche ; ciel en v = 1 sur des UV
 * standard). Périodique HORIZONTALEMENT
 * seulement (ciel en haut, sol en bas) : utiliser `wrap: 'clamp'` ou une répétition en U seule.
 *
 * Plans successifs de conifères et de feuillus, de plus en plus sombres et nets vers l'avant,
 * noyés dans une brume froide ; bandes de brouillard au pied de chaque plan.
 *
 * Paramètres : { layers?: 5, sky?: '#8f9ca4', fog?: '#c5cbc7', trees?: '#26302c',
 * density?: 1, conifers?: 0.7 (proportion) }.
 */
import type { Generator } from './types';
import {
  type RGB,
  clamp01,
  fbmField,
  flipRowsRGBA,
  mixRGB,
  num,
  parseRGB,
  raw,
  rng,
  smoothstep,
  wrapIndex,
} from './field';

export const forest: Generator = ({ width, height, params, seed }) => {
  const layers = Math.max(1, Math.round(num(params, 'layers', 5)));
  const sky: RGB = parseRGB(raw(params, 'sky'), [143, 156, 164]);
  const fog: RGB = parseRGB(raw(params, 'fog'), [197, 203, 199]);
  const trees: RGB = parseRGB(raw(params, 'trees'), [38, 48, 44]);
  const density = num(params, 'density', 1);
  const coniferRatio = clamp01(num(params, 'conifers', 0.7));
  const rand = rng(seed, 37);

  const out = new Uint8ClampedArray(width * height * 4);
  const skyNoise = fbmField(width, height, { scale: 3, scaleY: 2, octaves: 5, seed });
  // Ciel : dégradé vers la brume de l'horizon, nuages bas très doux.
  for (let y = 0; y < height; y++) {
    const t = y / height;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const haze = smoothstep(0.1, 0.65, t) + (skyNoise[i]! - 0.5) * 0.25;
      const c = mixRGB(sky, fog, clamp01(haze));
      out[i * 4] = c[0];
      out[i * 4 + 1] = c[1];
      out[i * 4 + 2] = c[2];
      out[i * 4 + 3] = 0;
    }
  }

  const mask = new Float32Array(width * height);
  const hills = fbmField(width, 1, { scale: 4, scaleY: 1, octaves: 4, seed: seed + 1 });
  const grain = fbmField(width, height, { scale: 64, octaves: 3, seed: seed + 2 });
  // Remplit une ligne [x0, x1] (périodique en x) avec anticrénelage horizontal des extrémités.
  const span = (y: number, x0: number, x1: number): void => {
    if (y < 0 || y >= height || x1 <= x0) return;
    const row = y * width;
    const a = Math.floor(x0);
    const b = Math.ceil(x1);
    for (let x = a; x <= b; x++) {
      const cover = Math.min(1, Math.max(0, Math.min(x + 1 - x0, x1 - x)));
      if (cover <= 0) continue;
      const o = row + wrapIndex(x, width);
      if (cover > mask[o]!) mask[o] = cover;
    }
  };
  for (let layer = 0; layer < layers; layer++) {
    mask.fill(0);
    const depth = (layer + 1) / layers; // 1 = plan le plus proche
    const baseline = height * (0.52 + depth * 0.3);
    const scale = height * (0.07 + depth * depth * 0.26);
    // Sous-bois : masse continue sous une ligne de collines.
    for (let x = 0; x < width; x++) {
      const ground = baseline - scale * 0.25 - (hills[x]! - 0.5) * scale * 0.6;
      for (let y = Math.max(0, Math.floor(ground)); y < height; y++) {
        mask[y * width + x] = Math.max(mask[y * width + x]!, Math.min(1, y - ground + 1));
      }
    }
    const count = Math.round((14 + (1 - depth) * 70) * density * (width / height / 2));
    for (let k = 0; k < count; k++) {
      const cx = rand() * width;
      const h = scale * (0.55 + rand() * 0.6);
      const top = baseline - h;
      if (rand() < coniferRatio) {
        // Conifère : cône à étages de branches (dents de scie), légèrement dissymétrique.
        const w = h * (0.2 + rand() * 0.1);
        const tiers = 5 + Math.floor(rand() * 5);
        const skew = (rand() - 0.5) * 0.25;
        for (let y = Math.max(0, Math.floor(top)); y < Math.min(height, Math.ceil(baseline)); y++) {
          const t = (y + 0.5 - top) / h; // 0 au sommet, 1 au pied
          const saw = (t * tiers) % 1;
          const half = w * t * (0.7 + 0.3 * saw);
          const shift = skew * half;
          span(y, cx - half + shift, cx + half + shift);
        }
      } else {
        // Feuillu : houppier fait de touffes rondes qui se chevauchent, tronc sous la couronne.
        const crownR = h * (0.28 + rand() * 0.12);
        const crownY = top + crownR;
        const clumps = 5 + Math.floor(rand() * 5);
        for (let c = 0; c < clumps; c++) {
          const a = rand() * Math.PI * 2;
          const dist = rand() * crownR * 0.7;
          const r = crownR * (0.4 + rand() * 0.35);
          const ccx = cx + Math.cos(a) * dist * 1.2;
          const ccy = crownY + Math.sin(a) * dist * 0.8;
          for (let y = Math.floor(ccy - r); y <= Math.ceil(ccy + r); y++) {
            const dy = y + 0.5 - ccy;
            const half = Math.sqrt(Math.max(0, r * r - dy * dy));
            span(y, ccx - half, ccx + half);
          }
        }
        const trunk = Math.max(0.6, h * 0.025);
        for (let y = Math.floor(crownY); y < Math.ceil(baseline); y++) span(y, cx - trunk, cx + trunk);
      }
    }
    // Couleur du plan : brume forte au loin, silhouette nette devant.
    const fogAmount = 0.88 - depth * 0.78;
    const layerColor = mixRGB(trees, fog, fogAmount);
    const bandHeight = height * (0.04 + depth * 0.05);
    for (let y = 0; y < height; y++) {
      // Bande de brouillard au pied du plan.
      const mist = smoothstep(baseline - bandHeight * 2, baseline + bandHeight, y) * 0.55;
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const k = mask[i]!;
        if (k <= 0) continue;
        const g = (grain[i]! - 0.5) * 0.08;
        const c = mixRGB(layerColor, fog, clamp01(mist + g));
        out[i * 4] = out[i * 4]! + (c[0] - out[i * 4]!) * k;
        out[i * 4 + 1] = out[i * 4 + 1]! + (c[1] - out[i * 4 + 1]!) * k;
        out[i * 4 + 2] = out[i * 4 + 2]! + (c[2] - out[i * 4 + 2]!) * k;
        out[i * 4 + 3] = Math.max(out[i * 4 + 3]!, depth * 255 * k);
      }
    }
  }
  // Ciel en haut sur des UV standard (v = 1).
  return flipRowsRGBA(out, width, height);
};
