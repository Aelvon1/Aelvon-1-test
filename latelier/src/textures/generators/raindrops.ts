/**
 * Générateur `raindrops` : gouttes et ruisselets sur une vitre (données linéaires, périodique).
 *
 * Orientation : la gravité va vers les lignes d'indice DÉCROISSANT, soit v décroissant (bas d'une
 * `PlaneGeometry` standard, la ligne 0 des données correspondant à v = 0).
 *
 * Canaux :
 * - R : hauteur (dômes des gouttes, film des ruisselets) ;
 * - G : masque mouillé (gouttes + ruisselets, anticrénelé) ;
 * - B : masque des ruisselets seuls ;
 * - A : valeur aléatoire propre à chaque goutte (phase d'animation), 0 hors des gouttes.
 *
 * Paramètres : { drops?: 420 (pour 1024²), size?: 0.011 (rayon moyen, fraction de la largeur),
 * trails?: 9, micro?: 1400 (gouttelettes) }.
 */
import type { Generator } from './types';
import { clamp01, num, packRGBA, rng, smoothstep, stampRadial, wrapIndex } from './field';

export const raindrops: Generator = ({ width, height, params, seed }) => {
  const area = (width * height) / (1024 * 1024);
  const dropCount = Math.round(num(params, 'drops', 420) * area);
  const microCount = Math.round(num(params, 'micro', 1400) * area);
  const meanRadius = num(params, 'size', 0.011) * width;
  const trailCount = Math.round(num(params, 'trails', 9) * Math.sqrt(area));
  const rand = rng(seed, 41);

  const heightField = new Float32Array(width * height);
  const wet = new Float32Array(width * height);
  const trails = new Float32Array(width * height);
  const phase = new Float32Array(width * height);

  const drop = (cx: number, cy: number, r: number, id: number, stretch: number) => {
    // Goutte légèrement alourdie vers le bas (y décroissant).
    stampRadial(
      heightField,
      width,
      height,
      cx,
      cy,
      r,
      (d, _lx, ly) => {
        const sag = 1 - 0.15 * ly; // ly < 0 : partie basse plus épaisse
        return Math.sqrt(Math.max(0, 1 - d * d)) * sag;
      },
      'max',
      1,
      stretch,
    );
    stampRadial(wet, width, height, cx, cy, r + 0.7, (d) => smoothstep(1, 0.8, d), 'max', 1, stretch);
    stampRadial(phase, width, height, cx, cy, r, () => id, 'over', 1, stretch);
  };

  // Gouttelettes (brume déposée), puis gouttes : tailles très inégales (loi de puissance).
  for (let k = 0; k < microCount; k++) {
    drop(rand() * width, rand() * height, Math.max(0.8, meanRadius * (0.12 + rand() * 0.2)), rand(), 1);
  }
  for (let k = 0; k < dropCount; k++) {
    const r = Math.max(1, meanRadius * (0.35 + Math.pow(rand(), 3) * 2.2));
    drop(rand() * width, rand() * height, r, 0.05 + rand() * 0.95, 1 + rand() * 0.25);
  }

  // Ruisselets : une grosse goutte a glissé en laissant un film sinueux et des perles.
  for (let t = 0; t < trailCount; t++) {
    const headX = rand() * width;
    let x = headX;
    const yEnd = rand() * height;
    const length = height * (0.2 + rand() * 0.5);
    const headRadius = meanRadius * (1.6 + rand() * 1.2);
    const trailHalf = headRadius * (0.28 + rand() * 0.12);
    const wobbleFreq = 2 + rand() * 4;
    const wobblePhase = rand() * Math.PI * 2;
    const id = 0.05 + rand() * 0.95;
    const steps = Math.ceil(length);
    for (let s = 0; s < steps; s++) {
      const y = yEnd + s; // le film s'étend AU-DESSUS de la tête (y croissant)
      const k = s / steps;
      x += Math.sin(wobblePhase + k * wobbleFreq * Math.PI * 2) * 0.35;
      const half = trailHalf * (1 - k * 0.6);
      const row = wrapIndex(Math.round(y), height) * width;
      for (let dx = Math.floor(-half - 1); dx <= Math.ceil(half + 1); dx++) {
        const cover = clamp01(half + 0.5 - Math.abs(dx));
        if (cover <= 0) continue;
        const o = row + wrapIndex(Math.round(x) + dx, width);
        const film = Math.sqrt(Math.max(0, 1 - (dx / (half + 0.5)) ** 2)) * 0.35;
        heightField[o] = Math.max(heightField[o]!, film);
        wet[o] = Math.max(wet[o]!, cover);
        trails[o] = Math.max(trails[o]!, cover * (1 - k * 0.5));
        if (phase[o] === 0) phase[o] = id;
      }
      // Perles laissées sur le trajet.
      if (rand() < 0.012) drop(x + (rand() - 0.5) * half, y, headRadius * (0.25 + rand() * 0.3), id, 1.1);
    }
    drop(headX, yEnd, headRadius, id, 1.25);
  }

  for (let i = 0; i < heightField.length; i++) heightField[i] = clamp01(heightField[i]!);
  return packRGBA(width, height, heightField, wet, trails, phase);
};
