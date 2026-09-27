/**
 * Texture de la puce de l'ATmega328P, générée dans le worker de textures (OffscreenCanvas 2D).
 *
 * Données linéaires (non colorimétriques), une par canal :
 * - R : métal d'interconnexion sous la passivation (lignes d'aluminium, anneaux d'alimentation,
 *   anneau de scellement), 0..1 = densité de couverture ;
 * - G : « épaisseur » de l'empilement diélectrique par région (teinte et irisation : chaque bloc
 *   a son aspect propre au microscope) ;
 * - B : plots de liaison (aluminium à nu, ouvertures de la passivation).
 *
 * Repère : la texture couvre exactement le dessus de la puce, haut de l'image = −Z local
 * (convention des marquages), unité de dessin = mm, origine au centre de la puce.
 * Toute la génération est déterministe (graine) : même image à chaque chargement.
 */
import type { Generator } from '../../../textures/generators/types';
import { mulberry32 } from '../../../textures/generators/random';
import type { BlockKind, DieSide } from './dieLayout';

export interface DieTextureParams {
  /** Côté de la puce (mm). */
  size: number;
  pads: readonly { side: DieSide; x: number; z: number; bonded: boolean }[];
  padSize: number;
  blocks: readonly { kind: BlockKind; rect: readonly [number, number, number, number] }[];
  /** Demi-côté du cœur (intérieur de l'anneau d'entrées-sorties). */
  core: number;
  /** Textes gravés dans le métal (identifiant de masque fictif). */
  marks: readonly string[];
}

type Ctx2D = OffscreenCanvasRenderingContext2D;

/** Teinte (canal G, 0..1) de chaque type de bloc. */
const TINT: Record<BlockKind, number> = {
  flash: 0.74,
  sram: 0.6,
  eeprom: 0.67,
  logic: 0.4,
  analog: 0.5,
  adc: 0.53,
  osc: 0.47,
};

export const dieGenerator: Generator<DieTextureParams> = ({ width, height, params, seed }) => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) throw new Error('OffscreenCanvas 2D indisponible.');
  const S = params.size;
  const k = width / S;
  // Repère : mm, origine au centre de la puce.
  ctx.setTransform(k, 0, 0, height / S, (S / 2) * k, (S / 2) * (height / S));
  const rand = mulberry32(seed || 328);
  const half = S / 2;
  const px = 1 / k; // taille d'un pixel en mm

  // --- Canal G : régions (écrasement successif) ---------------------------------------------
  ctx.globalCompositeOperation = 'source-over';
  const g = (v: number) => `rgb(0, ${Math.round(v * 255)}, 0)`;
  ctx.fillStyle = g(0.08); // chemin de découpe : silicium presque nu
  ctx.fillRect(-half, -half, S, S);
  ctx.fillStyle = g(0.3);
  ctx.fillRect(-half + 0.03, -half + 0.03, S - 0.06, S - 0.06);
  ctx.fillStyle = g(0.43); // anneau d'entrées-sorties
  ctx.fillRect(-half + 0.08, -half + 0.08, S - 0.16, S - 0.16);
  ctx.fillStyle = g(0.3);
  ctx.fillRect(-params.core, -params.core, 2 * params.core, 2 * params.core);
  for (const b of params.blocks) {
    const [x0, z0, x1, z1] = b.rect;
    ctx.fillStyle = g(TINT[b.kind] + (rand() - 0.5) * 0.04);
    ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
  }

  // --- Canaux R et B : additions ---------------------------------------------------------------
  ctx.globalCompositeOperation = 'lighter';
  const R = (a: number) => `rgba(255, 0, 0, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const rect = (x: number, z: number, w: number, h: number, a: number) => {
    ctx.fillStyle = R(a);
    ctx.fillRect(x, z, Math.max(w, px * 0.5), Math.max(h, px * 0.5));
  };
  const frame = (d: number, w: number, a: number) => {
    const o = half - d;
    rect(-o, -o, 2 * o, w, a);
    rect(-o, o - w, 2 * o, w, a);
    rect(-o, -o, w, 2 * o, a);
    rect(o - w, -o, w, 2 * o, a);
  };
  // Anneau de scellement (empilement de tous les niveaux de métal) et anneau de garde.
  frame(0.035, 0.016, 1);
  frame(0.062, 0.005, 0.6);
  // Anneaux d'alimentation VCC / GND au-dessus des cellules d'entrées-sorties.
  frame(0.3, 0.03, 0.95);
  frame(0.345, 0.03, 0.95);

  // Cellules d'entrées-sorties et plots. `sideRect` : rectangle exprimé le long du côté
  // (a0, longueur la) et en profondeur depuis le bord de la puce (d0, profondeur ld).
  const pad = params.padSize;
  const sideRect = (side: DieSide, a0: number, la: number, d0: number, ld: number, a: number) => {
    switch (side) {
      case '-z':
        return rect(a0, -half + d0, la, ld, a);
      case '+z':
        return rect(a0, half - d0 - ld, la, ld, a);
      case '-x':
        return rect(-half + d0, a0, ld, la, a);
      case '+x':
        return rect(half - d0 - ld, a0, ld, la, a);
    }
  };
  const inCore = half - params.core;
  for (const p of params.pads) {
    const along = p.side === '-z' || p.side === '+z' ? p.x : p.z;
    // Cellule de 0,22 mm de large entre 0,17 et 0,33 mm du bord : transistors de protection
    // contre les décharges électrostatiques, en peigne.
    for (let i = 0; i < 14; i++)
      sideRect(p.side, along - 0.11 + (i + 0.2) * (0.22 / 14), 0.006, 0.17, 0.16, 0.55);
    // Liaison plot → cellule, puis cellule → cœur (piste de signal).
    sideRect(p.side, along - 0.012, 0.024, 0.12, 0.07, 0.9);
    sideRect(p.side, along - 0.004, 0.008, 0.33, inCore - 0.33 + 0.15, 0.5);
    // Plot : cadre métallique sous la passivation, ouverture d'aluminium nu (canal B).
    rect(p.x - pad * 0.62, p.z - pad * 0.62, pad * 1.24, pad * 1.24, 0.85);
    ctx.fillStyle = 'rgb(0, 0, 255)';
    ctx.fillRect(p.x - pad / 2, p.z - pad / 2, pad, pad);
  }

  for (const b of params.blocks) drawBlock(ctx, b.kind, b.rect, rand, rect, px);

  // Bus de liaison entre blocs (métal 2 / métal 3).
  const bus = (x0: number, z0: number, x1: number, z1: number, n: number, pitch: number) => {
    const horizontal = Math.abs(z1 - z0) < Math.abs(x1 - x0);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * pitch;
      if (horizontal) rect(Math.min(x0, x1), z0 + o - 0.0012, Math.abs(x1 - x0), 0.0024, 0.8);
      else rect(x0 + o - 0.0012, Math.min(z0, z1), 0.0024, Math.abs(z1 - z0), 0.8);
    }
  };
  bus(-1.1, -0.07, 1.1, -0.07, 18, 0.005);
  bus(-1.1, 0.52, 1.1, 0.52, 12, 0.005);
  bus(0.17, -0.02, 0.17, 0.46, 8, 0.006);
  bus(0.4, 0.56, 0.4, 1.12, 10, 0.005);
  bus(-0.55, -0.02, -0.55, 0.44, 6, 0.006);
  // Rails d'alimentation du cœur (bandes larges verticales).
  for (const x of [-0.8, -0.2, 0.75]) rect(x - 0.012, -params.core, 0.024, 2 * params.core, 0.35);

  // Marques de masque : croix d'alignement, identifiant et rangée de niveaux (fictifs).
  const cross = (x: number, z: number) => {
    rect(x - 0.03, z - 0.003, 0.06, 0.006, 1);
    rect(x - 0.003, z - 0.03, 0.006, 0.06, 1);
  };
  cross(-half + 0.13, -half + 0.13);
  cross(half - 0.13, half - 0.13);
  ctx.fillStyle = R(1);
  ctx.font = `bold ${(0.045 * 100).toFixed(1)}px 'DejaVu Sans Mono', 'Liberation Mono', monospace`;
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.scale(0.01, 0.01);
  params.marks.forEach((text, i) => ctx.fillText(text, (0.4 - half) * 100, (half - 0.2 - i * 0.06) * 100));
  ctx.restore();
  for (let i = 0; i < 8; i++) {
    const x = half - 0.75 + i * 0.07;
    rect(x, -half + 0.1, 0.05, 0.05, 0.25 + 0.09 * i);
  }

  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
};

type RectFn = (x: number, z: number, w: number, h: number, a: number) => void;

/** Motif interne d'un bloc (matrices mémoire, cellules standard, analogique). */
function drawBlock(
  _ctx: Ctx2D,
  kind: BlockKind,
  r: readonly [number, number, number, number],
  rand: () => number,
  rect: RectFn,
  px: number,
): void {
  const [x0, z0, x1, z1] = r;
  const w = x1 - x0;
  const h = z1 - z0;
  switch (kind) {
    case 'flash':
    case 'sram':
    case 'eeprom': {
      // Matrices : 2 × 2 sous-matrices (flash) ou 2 × 1, décodeurs de lignes au centre,
      // amplificateurs de lecture en bas.
      const cols = kind === 'flash' ? 2 : 2;
      const rows = kind === 'flash' ? 2 : 1;
      const dec = kind === 'flash' ? 0.07 : 0.05;
      const amp = kind === 'flash' ? 0.07 : 0.05;
      const pitchX = kind === 'flash' ? 0.008 : kind === 'sram' ? 0.006 : 0.009;
      const pitchZ = kind === 'flash' ? 0.004 : kind === 'sram' ? 0.009 : 0.006;
      const aw = (w - dec) / cols;
      const ah = (h - amp * rows) / rows;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const ax = x0 + cx * (aw + dec);
          const az = z0 + cy * (ah + amp);
          // Lignes de mots (poly/métal 1) et lignes de bits (métal 2).
          for (let z = az; z < az + ah; z += pitchZ) rect(ax, z, aw, Math.max(px, pitchZ * 0.35), 0.3);
          for (let x = ax; x < ax + aw; x += pitchX) rect(x, az, Math.max(px, pitchX * 0.35), ah, 0.28);
          if (kind === 'sram') {
            // Cellules 6T : petits rectangles en quinconce.
            for (let z = az; z < az + ah; z += pitchZ * 2)
              for (let x = ax + ((z - az) / pitchZ) * 0.0015; x < ax + aw; x += pitchX * 2)
                rect(x, z, pitchX * 0.7, pitchZ * 0.6, 0.18);
          }
          // Amplificateurs de lecture : peigne dense sous la matrice.
          const sz = az + ah + 0.008;
          for (let x = ax; x < ax + aw; x += pitchX) rect(x, sz, pitchX * 0.5, amp - 0.016, 0.45);
          rect(ax, sz + amp - 0.02, aw, 0.004, 0.8);
        }
        // Décodeurs de lignes : colonne centrale de logique dense.
        const dx = x0 + aw;
        const dz = z0 + cy * (ah + amp);
        for (let z = dz; z < dz + ah; z += pitchZ * 2)
          rect(dx + 0.006, z, dec - 0.012, pitchZ * 0.9, 0.25 + rand() * 0.25);
      }
      // Cadre du bloc (anneau d'alimentation local).
      rect(x0 - 0.008, z0 - 0.008, w + 0.016, 0.006, 0.9);
      rect(x0 - 0.008, z1 + 0.002, w + 0.016, 0.006, 0.9);
      rect(x0 - 0.008, z0 - 0.008, 0.006, h + 0.016, 0.9);
      rect(x1 + 0.002, z0 - 0.008, 0.006, h + 0.016, 0.9);
      break;
    }
    case 'logic': {
      // Rangées de cellules standard (hauteur 13 µm) séparées par les rails VDD/GND.
      const row = 0.013;
      for (let z = z0; z + row <= z1; z += row) {
        rect(x0, z, w, 0.0016, 0.75);
        let x = x0;
        while (x < x1) {
          const cw = 0.003 + rand() * rand() * 0.02;
          if (x + cw > x1) break;
          rect(x + 0.0006, z + 0.0024, cw - 0.0012, row - 0.0044, 0.12 + rand() * 0.35);
          x += cw;
        }
      }
      // Routage : segments horizontaux (métal 2) et verticaux (métal 3).
      const n = Math.round(w * h * 5200);
      for (let i = 0; i < n; i++) {
        const horizontal = rand() < 0.55;
        const len = 0.015 + rand() * rand() * 0.3;
        const x = x0 + rand() * w;
        const z = z0 + rand() * h;
        if (horizontal) rect(x, z, Math.min(len, x1 - x), 0.0014, 0.45 + rand() * 0.35);
        else rect(x, z, 0.0014, Math.min(len, z1 - z), 0.45 + rand() * 0.35);
      }
      break;
    }
    case 'adc': {
      // Réseau de condensateurs pondérés (carrés appariés) + comparateur.
      const c = 0.026;
      for (let z = z0 + 0.01; z + c <= z1 - 0.06; z += c + 0.006)
        for (let x = x0 + 0.01; x + c <= x1 - 0.01; x += c + 0.006) rect(x, z, c, c, 0.55);
      for (let x = x0 + 0.02; x < x1 - 0.02; x += 0.012) rect(x, z1 - 0.05, 0.006, 0.04, 0.5);
      break;
    }
    case 'osc':
    case 'analog': {
      // Grands transistors en peigne (interdigités) et résistances en serpentin.
      const n = 4;
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const bx = x0 + i * bw + 0.01;
        for (let x = bx; x < bx + bw - 0.03; x += 0.008) rect(x, z0 + 0.01, 0.004, h - 0.02, 0.6);
        rect(bx, z0 + 0.006, bw - 0.03, 0.004, 0.85);
      }
      break;
    }
  }
}
