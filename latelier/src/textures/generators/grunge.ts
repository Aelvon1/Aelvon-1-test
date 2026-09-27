/**
 * Générateur `grunge` : salissures polyvalentes (données linéaires, périodique).
 *
 * Canaux :
 * - R : taches et salissures larges (bruit fractal déformé, contrasté) ;
 * - G : poussière fine et mouchetures ;
 * - B : traces de doigts (empreintes à crêtes, partielles) et frottis ;
 * - A : bruit de rupture de l'usure (seuillé dans les shaders pour découper arêtes/écailles).
 *
 * Paramètres : { scale?: 4 (cellules de base), fingerprints?: 10, printRadius?: 0.045 (fraction
 * de la largeur), speckles?: 0.6 (densité 0..1), contrast?: 1.4 }.
 */
import type { Generator } from './types';
import {
  blurWrap,
  clamp01,
  fbmField,
  normalize,
  num,
  packRGBA,
  rng,
  smoothstep,
  stampRadial,
  warpField,
  worleyField,
} from './field';

export const grunge: Generator = ({ width, height, params, seed }) => {
  const scale = num(params, 'scale', 4);
  const contrast = num(params, 'contrast', 1.4);
  const printCount = Math.round(num(params, 'fingerprints', 10));
  const printRadius = num(params, 'printRadius', 0.045) * width;
  const speckleDensity = num(params, 'speckles', 0.6);

  // R : salissures larges, domaine déformé pour des formes organiques.
  const base = fbmField(width, height, { scale, octaves: 6, persistence: 0.55, seed });
  const wx = fbmField(width, height, { scale: scale * 2, octaves: 3, seed: seed + 11 });
  const wy = fbmField(width, height, { scale: scale * 2, octaves: 3, seed: seed + 23 });
  const stains = normalize(warpField(base, width, height, wx, wy, width * 0.08));
  for (let i = 0; i < stains.length; i++) {
    stains[i] = clamp01((stains[i]! - 0.5) * contrast + 0.5);
  }

  // G : poussière fine + mouchetures (cellules minuscules seuillées).
  const dust = fbmField(width, height, { scale: scale * 16, octaves: 3, persistence: 0.6, seed: seed + 31 });
  const specks = worleyField(width, height, Math.max(8, Math.round(scale * 24)), seed + 37, 0.9);
  const fine = new Float32Array(width * height);
  for (let i = 0; i < fine.length; i++) {
    const speck = specks.id[i]! < speckleDensity * 0.35 ? smoothstep(0.22, 0.08, specks.f1[i]!) : 0;
    fine[i] = clamp01(dust[i]! * 0.65 + speck * 0.6);
  }

  // B : empreintes digitales (crêtes concentriques déformées, partielles) + frottis.
  const prints = new Float32Array(width * height);
  const rand = rng(seed, 3);
  for (let p = 0; p < printCount; p++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const r = printRadius * (0.75 + rand() * 0.5);
    const angle = rand() * Math.PI;
    const ridges = 11 + rand() * 5;
    const whorl = rand() * 2 - 1;
    const cutAngle = rand() * Math.PI * 2;
    const cutAmount = rand() * 0.8;
    const strength = 0.55 + rand() * 0.45;
    const cc = Math.cos(cutAngle);
    const cs = Math.sin(cutAngle);
    stampRadial(
      prints,
      width,
      height,
      cx,
      cy,
      r,
      (d, lx, ly) => {
        // Motif en boucle : distance elliptique + légère spirale.
        const theta = Math.atan2(ly, lx);
        const ridge = 0.5 + 0.5 * Math.sin((d * ridges + whorl * theta * 0.35) * Math.PI * 2);
        const fade = smoothstep(1, 0.55, d);
        // Empreinte partielle : un demi-plan s'estompe (doigt posé de biais).
        const partial = smoothstep(-0.6, 0.4, lx * cc + ly * cs + cutAmount);
        return ridge * ridge * fade * partial * strength;
      },
      'max',
      0.72,
      1,
      angle,
    );
  }
  // Frottis : empreintes étalées et floutées, plus larges.
  const smudge = new Float32Array(width * height);
  for (let p = 0; p < Math.max(2, Math.round(printCount / 2)); p++) {
    const cx = rand() * width;
    const cy = rand() * height;
    stampRadial(
      smudge,
      width,
      height,
      cx,
      cy,
      printRadius * (1.5 + rand() * 1.5),
      (d) => smoothstep(1, 0.2, d) * 0.5,
      'max',
      0.45 + rand() * 0.3,
      1,
      rand() * Math.PI,
    );
  }
  blurWrap(smudge, width, height, Math.max(1, width / 256));
  for (let i = 0; i < prints.length; i++) prints[i] = clamp01(prints[i]! + smudge[i]! * 0.6);

  // A : rupture de l'usure (bruit moyen, bords nets une fois seuillé dans le shader).
  const breakup = fbmField(width, height, { scale: scale * 4, octaves: 5, persistence: 0.6, seed: seed + 47 });
  normalize(breakup);

  return packRGBA(width, height, stains, fine, prints, breakup);
};
