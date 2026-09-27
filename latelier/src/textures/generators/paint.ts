/**
 * Générateur `paint` : grain « peint à la main » (données linéaires, périodique).
 *
 * Des coups de pinceau superposés (le dernier recouvre les précédents) portent des stries de
 * poils et un léger bourrelet de bord ; une teinte propre à chaque touche donne la vibration
 * colorée typique d'une peinture appliquée à la main.
 *
 * Canaux :
 * - R : relief des coups de pinceau (stries, bourrelets) ;
 * - G : variation de teinte (par touche + bruit lent) ;
 * - B : grain fin (peau d'orange, poussière prise dans la peinture) ;
 * - A : rupture de l'usure (bruit contrasté : écaillage, zones de peinture mince).
 *
 * Paramètres : { strokes?: 520, length?: 0.14, width?: 0.04 (fractions de la largeur),
 * direction?: rad (dominante, défaut 0 = le long de U) | 'random', spread?: 0.35, bristles?: 0.6 }.
 */
import type { Generator } from './types';
import { clamp01, fbmField, normalize, num, packRGBA, raw, rng, smoothstep, wrapIndex } from './field';

export const paint: Generator = ({ width, height, params, seed }) => {
  const strokeCount = Math.round(num(params, 'strokes', 520));
  const meanLength = num(params, 'length', 0.14) * width;
  const meanWidth = num(params, 'width', 0.04) * width;
  const dirParam = raw(params, 'direction');
  const direction = typeof dirParam === 'number' ? dirParam : dirParam === 'random' ? null : 0;
  const spread = num(params, 'spread', 0.35);
  const bristleAmount = num(params, 'bristles', 0.6);
  const rand = rng(seed, 29);

  const slow = fbmField(width, height, { scale: 3, octaves: 4, seed });
  const relief = new Float32Array(width * height).fill(0.5);
  const tone = new Float32Array(width * height);
  for (let i = 0; i < tone.length; i++) tone[i] = 0.5 + (slow[i]! - 0.5) * 0.6;

  const bristles = new Float32Array(33);
  for (let s = 0; s < strokeCount; s++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const angle = direction === null ? rand() * Math.PI : direction + (rand() - 0.5) * 2 * spread;
    const length = meanLength * (0.5 + rand());
    const w = meanWidth * (0.6 + rand() * 0.8);
    const strokeTone = rand();
    const load = 0.6 + rand() * 0.4; // charge du pinceau : touches sèches = stries marquées
    for (let b = 0; b < bristles.length; b++) bristles[b] = rand();
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    const ex = Math.abs(c) * length * 0.5 + Math.abs(sn) * w * 0.5 + 1;
    const ey = Math.abs(sn) * length * 0.5 + Math.abs(c) * w * 0.5 + 1;
    for (let y = Math.floor(cy - ey); y <= Math.ceil(cy + ey); y++) {
      const row = wrapIndex(y, height) * width;
      for (let x = Math.floor(cx - ex); x <= Math.ceil(cx + ex); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const along = (dx * c + dy * sn) / (length * 0.5); // -1..1
        const across = (-dx * sn + dy * c) / (w * 0.5); // -1..1
        if (Math.abs(along) >= 1 || Math.abs(across) >= 1) continue;
        // Extrémités : attaque franche, fin de touche effilée et sèche.
        const endFade = smoothstep(1, 0.7, along) * smoothstep(-1, -0.85, along);
        const sideFade = smoothstep(1, 0.8, Math.abs(across));
        const alpha = endFade * sideFade * load;
        if (alpha <= 0.01) continue;
        const bf = (across * 0.5 + 0.5) * (bristles.length - 1);
        const bi = Math.floor(bf);
        const bt = bf - bi;
        const bristle =
          bristles[bi]! + (bristles[Math.min(bristles.length - 1, bi + 1)]! - bristles[bi]!) * bt;
        const ridge = smoothstep(0.55, 0.9, Math.abs(across)) * 0.25;
        const h = 0.5 + (bristle - 0.5) * bristleAmount * (1.2 - load * 0.6) + ridge;
        const o = row + wrapIndex(x, width);
        relief[o] = relief[o]! + (h - relief[o]!) * alpha;
        tone[o] = tone[o]! + (0.5 + (strokeTone - 0.5) * 0.45 + (slow[o]! - 0.5) * 0.6 - tone[o]!) * alpha;
      }
    }
  }

  const grain = fbmField(width, height, { scale: 96, octaves: 3, persistence: 0.55, seed: seed + 3 });
  const breakup = fbmField(width, height, { scale: 6, octaves: 6, persistence: 0.6, seed: seed + 4 });
  normalize(breakup);
  for (let i = 0; i < relief.length; i++) relief[i] = clamp01(relief[i]!);

  return packRGBA(width, height, relief, tone, grain, breakup);
};
