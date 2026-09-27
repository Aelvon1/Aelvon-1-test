/**
 * Générateur `concrete` : béton de garage taché d'huile (données linéaires, périodique).
 *
 * Canaux :
 * - R : marbrures (nuances du béton, traces de talochage) ;
 * - G : taches d'huile (1 = saturé : cœur sombre et brillant, auréole plus claire) ;
 * - B : bullage et granulats (0,5 = neutre, < 0,5 pores sombres, > 0,5 granulats clairs) ;
 * - A : fissures fines (1 = fissure).
 *
 * Paramètres : { scale?: 3, stains?: 7 (taches d'huile), drips?: 40 (gouttes), cracks?: 0.5 }.
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

export const concrete: Generator = ({ width, height, params, seed }) => {
  const scale = num(params, 'scale', 3);
  const stainCount = Math.round(num(params, 'stains', 7));
  const dripCount = Math.round(num(params, 'drips', 40));
  const crackAmount = num(params, 'cracks', 0.5);
  const rand = rng(seed, 17);

  // R : marbrures.
  const large = fbmField(width, height, { scale, octaves: 6, persistence: 0.55, seed });
  const trowel = fbmField(width, height, { scale: scale * 6, scaleY: scale * 3, octaves: 3, seed: seed + 2 });
  const mottle = new Float32Array(width * height);
  for (let i = 0; i < mottle.length; i++) mottle[i] = large[i]! * 0.75 + trowel[i]! * 0.25;
  normalize(mottle);

  // G : taches d'huile, contours déformés (domaine distordu par un bruit).
  const oilRaw = new Float32Array(width * height);
  for (let s = 0; s < stainCount; s++) {
    // Une tache = grappe de flaques qui se chevauchent (contour irrégulier), cœur plus sombre.
    const cx = rand() * width;
    const cy = rand() * height;
    const size = (0.06 + rand() * rand() * 0.16) * width;
    const strength = 0.45 + rand() * 0.45;
    const blobs = 2 + Math.floor(rand() * 4);
    for (let b = 0; b < blobs; b++) {
      const bx = cx + (rand() - 0.5) * size * 1.2;
      const by = cy + (rand() - 0.5) * size * 1.2;
      const r = size * (0.4 + rand() * 0.6);
      stampRadial(
        oilRaw,
        width,
        height,
        bx,
        by,
        r,
        (d) => {
          const body = smoothstep(1, 0.35, d);
          const rim = smoothstep(0.1, 0.0, Math.abs(d - 0.86)) * 0.25;
          return Math.min(1, body * (0.55 + 0.45 * smoothstep(0.8, 0, d)) + rim) * strength;
        },
        'max',
        0.7 + rand() * 0.6,
        0.7 + rand() * 0.6,
        rand() * Math.PI,
      );
    }
  }
  for (let s = 0; s < dripCount; s++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const r = (0.003 + rand() * 0.008) * width;
    const strength = 0.4 + rand() * 0.5;
    stampRadial(oilRaw, width, height, cx, cy, r, (d) => smoothstep(1, 0.4, d) * strength, 'max');
  }
  const wx = fbmField(width, height, { scale: scale * 4, octaves: 4, seed: seed + 5 });
  const wy = fbmField(width, height, { scale: scale * 4, octaves: 4, seed: seed + 6 });
  const oil = warpField(oilRaw, width, height, wx, wy, width * 0.07);
  blurWrap(oil, width, height, width / 512);

  // B : pores (bullage) et granulats affleurants.
  const cells = worleyField(width, height, Math.round(scale * 40), seed + 9, 0.95);
  const specks = fbmField(width, height, { scale: scale * 64, octaves: 2, seed: seed + 10 });
  const grain = new Float32Array(width * height);
  for (let i = 0; i < grain.length; i++) {
    const id = cells.id[i]!;
    const f1 = cells.f1[i]!;
    const pit = id < 0.12 ? smoothstep(0.3, 0.12, f1) : 0;
    const aggregate = id > 0.8 ? smoothstep(0.45, 0.25, f1) * 0.6 : 0;
    grain[i] = clamp01(0.5 - pit * 0.5 + aggregate * 0.5 + (specks[i]! - 0.5) * 0.25);
  }

  // A : fissures (bords des cellules de Worley, déformés), présentes seulement par endroits.
  const crackCells = worleyField(width, height, Math.round(scale * 3), seed + 13, 1);
  const edge = new Float32Array(width * height);
  for (let i = 0; i < edge.length; i++) edge[i] = crackCells.f2[i]! - crackCells.f1[i]!;
  const cwx = fbmField(width, height, { scale: scale * 8, octaves: 4, seed: seed + 14 });
  const cwy = fbmField(width, height, { scale: scale * 8, octaves: 4, seed: seed + 15 });
  const edgeWarped = warpField(edge, width, height, cwx, cwy, width * 0.02);
  const presence = normalize(fbmField(width, height, { scale: scale * 2, octaves: 3, seed: seed + 16 }));
  const cracks = new Float32Array(width * height);
  const lineWidth = 0.012 * (1024 / width) + 0.004;
  for (let i = 0; i < cracks.length; i++) {
    const line = smoothstep(lineWidth, 0, edgeWarped[i]!);
    cracks[i] = line * smoothstep(1 - crackAmount * 0.6, 1.05 - crackAmount * 0.45, presence[i]!);
  }

  return packRGBA(width, height, mottle, oil, grain, cracks);
};
