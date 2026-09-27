/**
 * Générateur `rust` : rouille (données linéaires, périodique).
 *
 * Canaux :
 * - R : couverture (bruit fractal déformé ; seuillé dans le shader par les masques de recoins,
 *       d'arêtes et le taux de rouille : plus la valeur est haute, plus la rouille apparaît tôt) ;
 * - G : piqûres (cratères de corrosion) ;
 * - B : variation de teinte (0 = brun sombre, 1 = orange vif) ;
 * - A : relief des écailles (boursouflures sous la peinture, feuilletage).
 *
 * Paramètres : { scale?: 4, pits?: 0.5 (densité), flakes?: 0.6 }.
 */
import type { Generator } from './types';
import { clamp01, fbmField, normalize, num, packRGBA, smoothstep, warpField, worleyField } from './field';

export const rust: Generator = ({ width, height, params, seed }) => {
  const scale = num(params, 'scale', 4);
  const pitDensity = num(params, 'pits', 0.5);
  const flakeAmount = num(params, 'flakes', 0.6);

  const base = fbmField(width, height, { scale, octaves: 7, persistence: 0.58, seed });
  const wx = fbmField(width, height, { scale: scale * 2, octaves: 4, seed: seed + 1 });
  const wy = fbmField(width, height, { scale: scale * 2, octaves: 4, seed: seed + 2 });
  const coverage = normalize(warpField(base, width, height, wx, wy, width * 0.1));

  const cells = worleyField(width, height, Math.round(scale * 30), seed + 3, 0.9);
  const pits = new Float32Array(width * height);
  for (let i = 0; i < pits.length; i++) {
    pits[i] =
      cells.id[i]! < pitDensity * 0.5 ? smoothstep(0.35, 0.05, cells.f1[i]!) * (0.4 + cells.id[i]!) : 0;
  }

  const hue = fbmField(width, height, { scale: scale * 3, octaves: 5, persistence: 0.6, seed: seed + 4 });
  normalize(hue);

  // Écailles : cellules moyennes dont le bord se soulève (feuilletage), modulées par la couverture.
  const flakeCells = worleyField(width, height, Math.round(scale * 10), seed + 5, 1);
  const detail = fbmField(width, height, { scale: scale * 24, octaves: 3, seed: seed + 6 });
  const relief = new Float32Array(width * height);
  for (let i = 0; i < relief.length; i++) {
    const edge = flakeCells.f2[i]! - flakeCells.f1[i]!;
    const flake = smoothstep(0.02, 0.25, edge) * flakeAmount;
    relief[i] = clamp01(0.35 + flake * 0.4 * coverage[i]! + (detail[i]! - 0.5) * 0.35 - pits[i]! * 0.3);
  }

  return packRGBA(width, height, coverage, pits, hue, relief);
};
