/**
 * Disposition des outils sur le panneau perforé (indices de trous, voir `holeX`/`holeY`) et des
 * silhouettes peintes derrière eux. Module PUR : lu par la construction 3D et par l'atlas.
 *
 * Organisation (de gauche à droite) : scie à métaux, maillet, extracteur, pied à coulisse ;
 * râtelier de tournevis, clés Allen ; pinces ; clés mixtes 8 → 19 mm, tournevis de précision,
 * ruban adhésif, schéma accroché.
 */
import { holeX, holeY } from '../dims';
import {
  CALIPER,
  HACKSAW,
  MALLET,
  outlineBounds,
  pliersOutline,
  wrenchLength,
  wrenchOutline,
  type PliersKind,
} from './outlines';

/** Densité des silhouettes dans l'atlas (px par mètre, atlas de référence 2048). */
export const SILHOUETTE_PX_PER_M = 820;
/** Marge peinte autour de l'outil (m). */
export const SILHOUETTE_MARGIN = 0.006;

export const WRENCH_SIZES = [0.008, 0.01, 0.012, 0.013, 0.014, 0.016, 0.017, 0.019] as const;

export const PEG_LAYOUT = {
  hacksaw: { j: 35, i: [4, 15] as const },
  mallet: { j: 25, i: [2, 4] as const },
  puller: { j: 27, i: 10 },
  caliper: { j: 27, i: 16 },
  screwdriverRack: { j: 28, i: [22, 37] as const },
  allenRack: { j: 17, i: [24, 30] as const },
  precisionRack: { j: 17, i: [61, 67] as const },
  pliers: { j: 18, i: [42, 47, 52] as const, kinds: ['cutter', 'flat', 'circlip'] as const },
  /** Emplacement vide (pince multiprise absente : seule sa silhouette reste peinte). */
  missingPliers: { j: 18, i: 57 },
  wrenches: { j: 33, i0: 47, step: 4 },
  tape: { j: 12, i: 74 },
  sheet: { j: 10, i: 70 },
} as const;

/** Silhouette peinte : nom de région d'atlas, contour, centre (x, y) et taille (m). */
export interface SilhouetteSpec {
  region: string;
  /** Centre dans le plan du panneau (x, y monde). */
  center: readonly [number, number];
  size: readonly [number, number];
  /** Dessin : contour polygonal (repère de l'outil, origine à l'accroche) ou rectangles arrondis. */
  shape:
    | { kind: 'polygon'; points: readonly (readonly [number, number])[]; scale: number }
    | { kind: 'rects'; rects: readonly (readonly [number, number, number, number])[] };
  /** Position de l'origine de l'outil (accroche) dans le plan du panneau. */
  origin: readonly [number, number];
}

/** Échelle de la pince multiprise absente (contour de pince coupante agrandi). */
const MISSING_PLIERS_SCALE = 1.4;

function polygonSilhouette(
  region: string,
  points: readonly (readonly [number, number])[],
  origin: readonly [number, number],
  scale = 1,
): SilhouetteSpec {
  const b = outlineBounds(points);
  const m = SILHOUETTE_MARGIN;
  const w = (b.max[0] - b.min[0]) * scale + 2 * m;
  const h = (b.max[1] - b.min[1]) * scale + 2 * m;
  const cx = origin[0] + ((b.min[0] + b.max[0]) / 2) * scale;
  const cy = origin[1] + ((b.min[1] + b.max[1]) / 2) * scale;
  return { region, center: [cx, cy], size: [w, h], shape: { kind: 'polygon', points, scale }, origin };
}

function rectsSilhouette(
  region: string,
  origin: readonly [number, number],
  rects: readonly (readonly [number, number, number, number])[],
): SilhouetteSpec {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y, w, h] of rects) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  }
  const m = SILHOUETTE_MARGIN;
  return {
    region,
    center: [origin[0] + (x0 + x1) / 2, origin[1] + (y0 + y1) / 2],
    size: [x1 - x0 + 2 * m, y1 - y0 + 2 * m],
    shape: { kind: 'rects', rects },
    origin,
  };
}

/** Coin supérieur gauche de la monture de la scie (accrochée par le tube supérieur). */
export function hacksawOrigin(): [number, number] {
  return [holeX(PEG_LAYOUT.hacksaw.i[0]) - 0.055, holeY(PEG_LAYOUT.hacksaw.j) - 0.004];
}

/** Haut de la règle du pied à coulisse (accroché par le bec supérieur). */
export function caliperOrigin(): [number, number] {
  return [holeX(PEG_LAYOUT.caliper.i), holeY(PEG_LAYOUT.caliper.j) + 0.012];
}

/** Accroche d'une pince : la cheville passe dans l'entrejambe, juste au-dessus de l'axe. */
export function pliersAnchorOffset(kind: PliersKind): number {
  return pliersOutline(kind).pivotY + 0.016;
}

/** Liste des silhouettes (ordre stable : sert aussi à l'empaquetage de l'atlas). */
export function silhouetteSpecs(): SilhouetteSpec[] {
  const out: SilhouetteSpec[] = [];
  const L = PEG_LAYOUT;
  WRENCH_SIZES.forEach((size, k) => {
    const x = holeX(L.wrenches.i0 + k * L.wrenches.step);
    const y = holeY(L.wrenches.j);
    // L'œil repose sur la cheville : son bord intérieur touche le haut de la cheville.
    const origin: [number, number] = [x, y - 0.58 * size + 0.003];
    out.push(polygonSilhouette(`sil.wrench${k}`, wrenchOutline(size, 8).outer, origin));
  });
  L.pliers.kinds.forEach((kind, k) => {
    const x = holeX(L.pliers.i[k]!);
    const y = holeY(L.pliers.j);
    const origin: [number, number] = [x, y - pliersAnchorOffset(kind)];
    out.push(polygonSilhouette(`sil.pliers${k}`, pliersOutline(kind).outer, origin));
  });
  {
    const x = holeX(L.missingPliers.i);
    const y = holeY(L.missingPliers.j);
    const s = MISSING_PLIERS_SCALE;
    const origin: [number, number] = [x, y - pliersAnchorOffset('cutter') * s];
    out.push(polygonSilhouette('sil.pliersMissing', pliersOutline('cutter').outer, origin, s));
  }
  {
    const x = (holeX(L.mallet.i[0]) + holeX(L.mallet.i[1])) / 2;
    const top = holeY(L.mallet.j) + 0.004 + 2 * MALLET.headRadius;
    out.push(
      rectsSilhouette('sil.mallet', [x, top], [
        [-MALLET.headLength / 2, -2 * MALLET.headRadius, MALLET.headLength, 2 * MALLET.headRadius],
        [
          -MALLET.handleRadius - 0.002,
          -2 * MALLET.headRadius - MALLET.handleLength,
          2 * MALLET.handleRadius + 0.004,
          MALLET.handleLength,
        ],
      ]),
    );
  }
  {
    const origin = hacksawOrigin();
    const F = HACKSAW;
    out.push(
      rectsSilhouette('sil.hacksaw', origin, [
        [0, -0.016, F.frameLength, 0.016],
        [0, -F.frameHeight, 0.016, F.frameHeight],
        [0, -F.frameHeight, F.frameLength, 0.014],
        [F.frameLength - 0.02, -F.frameHeight - 0.05, 0.065, F.frameHeight + 0.05],
      ]),
    );
  }
  {
    const origin = caliperOrigin();
    const C = CALIPER;
    out.push(
      rectsSilhouette('sil.caliper', origin, [
        [-C.beamWidth / 2, -C.beamLength, C.beamWidth, C.beamLength],
        [-C.beamWidth / 2, -0.034, C.jawLength + C.beamWidth / 2, 0.018],
        [-C.beamWidth / 2, -0.078, C.jawLength + C.beamWidth / 2, 0.026],
      ]),
    );
  }
  return out;
}

/** Longueur totale de la clé `k` (m), pour les contrôles de disposition. */
export function wrenchSpan(k: number): number {
  const s = WRENCH_SIZES[k]!;
  return wrenchLength(s) + 0.9 * s + 1.15 * s + 0.01;
}
