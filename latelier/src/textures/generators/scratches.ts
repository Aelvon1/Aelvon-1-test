/**
 * Générateur `scratches` : rayures (données linéaires, périodique).
 *
 * Canaux :
 * - R : rayures franches (intensité variable, extrémités effilées, légères courbures) ;
 * - G : micro-rayures d'usage, denses et courtes ;
 * - B : profondeur des sillons (R + G floutés) pour le relief ;
 * - A : 1.
 *
 * Paramètres : { count?: 260, micro?: 2200, direction?: rad (orientation dominante ; absente =
 * aléatoire), spread?: 0.6 (dispersion angulaire autour de `direction`, rad), length?: 0.18
 * (longueur moyenne, fraction de la largeur), width?: 1 (épaisseur en px à 1024) }.
 */
import type { Generator } from './types';
import { blurWrap, clamp01, drawLine, num, packRGBA, raw, rng } from './field';

export const scratches: Generator = ({ width, height, params, seed }) => {
  const count = Math.round(num(params, 'count', 260));
  const microCount = Math.round(num(params, 'micro', 2200));
  const dirParam = raw(params, 'direction');
  const direction = typeof dirParam === 'number' ? dirParam : null;
  const spread = num(params, 'spread', 0.6);
  const meanLength = num(params, 'length', 0.18) * width;
  const pxScale = width / 1024;
  const thickness = num(params, 'width', 1) * pxScale;
  const rand = rng(seed, 5);

  const angleOf = (): number =>
    direction === null ? rand() * Math.PI : direction + (rand() - 0.5) * 2 * spread;

  const main = new Float32Array(width * height);
  for (let s = 0; s < count; s++) {
    let x = rand() * width;
    let y = rand() * height;
    let angle = angleOf();
    const length = meanLength * (0.25 + rand() * rand() * 2.2);
    const segments = 3 + Math.floor(rand() * 4);
    const bend = (rand() - 0.5) * 0.25;
    const intensity = 0.35 + rand() * 0.65;
    const w = thickness * (0.5 + rand() * 1.1);
    const step = length / segments;
    for (let k = 0; k < segments; k++) {
      const nx = x + Math.cos(angle) * step;
      const ny = y + Math.sin(angle) * step;
      const t0 = k / segments;
      const t1 = (k + 1) / segments;
      // Effilement aux extrémités + interruptions aléatoires (le métal accroche puis glisse).
      const skip = rand() < 0.12;
      if (!skip) {
        drawLine(main, width, height, x, y, nx, ny, w, intensity, 'max', (t) => {
          const u = t0 + (t1 - t0) * t;
          return Math.sqrt(Math.sin(Math.PI * u));
        });
      }
      x = nx;
      y = ny;
      angle += bend;
    }
  }

  const micro = new Float32Array(width * height);
  const microLength = meanLength * 0.18;
  for (let s = 0; s < microCount; s++) {
    const x = rand() * width;
    const y = rand() * height;
    const angle = angleOf();
    const length = microLength * (0.3 + rand() * 1.4);
    drawLine(
      micro,
      width,
      height,
      x,
      y,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
      thickness * 0.6,
      0.25 + rand() * 0.5,
      'max',
      (t) => Math.sin(Math.PI * t),
    );
  }

  const depth = new Float32Array(width * height);
  for (let i = 0; i < depth.length; i++) depth[i] = clamp01(main[i]! + micro[i]! * 0.4);
  blurWrap(depth, width, height, Math.max(0.6, pxScale * 0.8));
  for (let i = 0; i < depth.length; i++) depth[i] = clamp01(depth[i]! * 1.6);

  return packRGBA(width, height, main, micro, depth, 1);
};
