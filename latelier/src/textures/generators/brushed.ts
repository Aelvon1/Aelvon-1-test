/**
 * Générateur `brushed` : métal brossé / rectifié (données linéaires, périodique).
 *
 * Les stries sont ALIGNÉES SUR L'AXE U (horizontal de la texture) : la géométrie doit donc
 * orienter u dans le sens du brossage (circonférence d'un arbre rectifié).
 *
 * Canaux :
 * - R : stries principales (bruit très étiré le long de u) ;
 * - G : stries fines (quasi 1 pixel) ;
 * - B : quelques rayures longues et profondes dans le sens du brossage ;
 * - A : variation lente (taches de reprise, léger voilage).
 *
 * Paramètres : { streaks?: 320 (cellules en travers), along?: 8 (cellules le long), deep?: 40 }.
 */
import type { Generator } from './types';
import { addGradientNoise, addValueNoise, clamp01, drawLine, fbmField, normalize, num, packRGBA, rng } from './field';

export const brushed: Generator = ({ width, height, params, seed }) => {
  const across = Math.max(8, Math.round(num(params, 'streaks', 320)));
  const along = Math.max(1, Math.round(num(params, 'along', 8)));
  const deepCount = Math.round(num(params, 'deep', 40));

  const main = new Float32Array(width * height);
  // Plusieurs octaves étirées : stries de largeurs variées.
  // Bruit de gradient (pas de « briques » d'alignement du bruit de valeur).
  addGradientNoise(main, width, height, along, across / 4, seed, 0.35);
  addGradientNoise(main, width, height, along * 2, across / 2, seed + 1, 0.3);
  addGradientNoise(main, width, height, along * 2, across, seed + 2, 0.25);
  addGradientNoise(main, width, height, along * 4, Math.min(height, across * 2), seed + 3, 0.1);
  normalize(main);

  const fine = new Float32Array(width * height);
  addGradientNoise(fine, width, height, along * 4, Math.min(height, across * 3), seed + 4, 0.6);
  addValueNoise(fine, width, height, along * 8, height, seed + 5, 0.4);
  normalize(fine);

  const deep = new Float32Array(width * height);
  const rand = rng(seed, 9);
  const pxScale = width / 1024;
  for (let i = 0; i < deepCount; i++) {
    const y = rand() * height;
    const x = rand() * width;
    const length = width * (0.2 + rand() * 0.8);
    const slope = (rand() - 0.5) * 0.01;
    drawLine(deep, width, height, x, y, x + length, y + length * slope, pxScale * (0.6 + rand()), 0.4 + rand() * 0.6, 'max', (t) =>
      Math.sin(Math.PI * t),
    );
  }

  const slow = fbmField(width, height, { scale: 3, octaves: 4, seed: seed + 6 });
  for (let i = 0; i < slow.length; i++) slow[i] = clamp01(slow[i]!);

  return packRGBA(width, height, main, fine, deep, slow);
};
