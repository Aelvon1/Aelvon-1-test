/**
 * Contours 2D des outils du panneau perforé (mètres, repère du plan de l'outil : x à droite,
 * y vers le haut, origine au point d'accroche sur la cheville). Module PUR : les MÊMES contours
 * servent à extruder les outils en 3D et à peindre leurs silhouettes (atlas des décalques).
 */

export type P2 = readonly [number, number];

export interface Outline {
  /** Contour extérieur (sens trigonométrique). */
  outer: P2[];
  /** Trous (sens horaire). */
  holes: P2[][];
}

/** Boîte englobante d'un contour. */
export function outlineBounds(points: readonly P2[]): { min: P2; max: P2 } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { min: [x0, y0], max: [x1, y1] };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): P2[] {
  const out: P2[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Longueur d'une clé mixte de taille `size` (m, sur plats). */
export function wrenchLength(size: number): number {
  return 0.06 + 8.5 * size;
}

/**
 * Clé mixte (œil en haut, accroché à la cheville ; fourche en bas, inclinée de 15°).
 * Proportions d'une clé forgée réelle : œil Ø ≈ 1,8 × taille, tête de fourche ≈ 2,3 × taille.
 */
export function wrenchOutline(size: number, steps = 18): Outline {
  const s = size;
  const L = wrenchLength(s);
  const R1 = 0.9 * s + 0.004;
  const R2 = 1.15 * s + 0.0045;
  const w1 = (0.5 * s + 0.0035) / 2 + 0.002;
  const w2 = (0.6 * s + 0.004) / 2 + 0.002;
  const cy = -L;
  const ringJoin = Math.asin(Math.min(0.95, w1 / R1));
  const headJoin = Math.asin(Math.min(0.95, w2 / R2));
  const outer: P2[] = [];
  // Œil : de l'attache droite, par le haut, jusqu'à l'attache gauche.
  outer.push(...arc(0, 0, R1, -Math.PI / 2 + ringJoin, (3 * Math.PI) / 2 - ringJoin, steps * 2));
  // Corps (côté gauche, en descendant), puis tête de fourche jusqu'à l'ouverture.
  const tilt = 0.26;
  const slotAngle = (3 * Math.PI) / 2 + tilt;
  const half = s / 2;
  const beta = Math.asin(Math.min(0.95, half / R2));
  outer.push(...arc(0, cy, R2, Math.PI / 2 + headJoin, slotAngle - beta, steps));
  // Ouverture : flancs parallèles, fond arrondi légèrement au-delà du centre.
  const d: P2 = [Math.cos(slotAngle), Math.sin(slotAngle)];
  const n: P2 = [-d[1], d[0]];
  const rim = Math.sqrt(R2 * R2 - half * half);
  const bottom = -0.12 * s;
  outer.push([d[0] * rim - n[0] * half, cy + d[1] * rim - n[1] * half]);
  outer.push([d[0] * bottom - n[0] * half, cy + d[1] * bottom - n[1] * half]);
  for (let k = 1; k < 8; k++) {
    const phi = (Math.PI * k) / 8;
    const vx = -n[0] * Math.cos(phi) - d[0] * Math.sin(phi);
    const vy = -n[1] * Math.cos(phi) - d[1] * Math.sin(phi);
    outer.push([d[0] * bottom + vx * half, cy + d[1] * bottom + vy * half]);
  }
  outer.push([d[0] * bottom + n[0] * half, cy + d[1] * bottom + n[1] * half]);
  outer.push([d[0] * rim + n[0] * half, cy + d[1] * rim + n[1] * half]);
  outer.push(...arc(0, cy, R2, slotAngle + beta, Math.PI / 2 - headJoin + Math.PI * 2, steps));
  // Corps (côté droit, en remontant) : l'œil referme le contour.
  const hole: P2[] = [];
  const holeR = 0.58 * s;
  const n12 = 24;
  for (let k = n12; k > 0; k--) {
    const a = (k / n12) * Math.PI * 2;
    // Œil 12 pans suggéré par une légère ondulation.
    const r = holeR * (1 + 0.05 * Math.cos(a * 12));
    hole.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return { outer, holes: [hole] };
}

export type PliersKind = 'cutter' | 'flat' | 'circlip';

export interface PliersShape extends Outline {
  /** Lignes médianes des deux branches (gaines plastique). */
  grips: [P2[], P2[]];
  /** Hauteur de l'axe au-dessus de la pointe des mors. */
  pivotY: number;
}

/**
 * Pince (mors vers le bas, branches écartées vers le haut, posées sur deux chevilles). Origine
 * au sommet des branches (point d'accroche) ; les mors pointent vers −y.
 */
export function pliersOutline(kind: PliersKind): PliersShape {
  const jaw = kind === 'flat' ? 0.062 : kind === 'cutter' ? 0.032 : 0.05;
  const handle = kind === 'cutter' ? 0.12 : 0.13;
  const spread = kind === 'circlip' ? 0.022 : 0.028;
  const pivotY = -handle;
  const tipY = pivotY - jaw;
  const armW = 0.0055;
  // Branche droite : de l'axe vers le haut, légèrement galbée.
  const armCenter = (t: number): P2 => {
    const y = pivotY + 0.012 + (handle - 0.012) * t;
    const x = 0.006 + spread * Math.pow(t, 0.8) - 0.004 * Math.sin(Math.PI * t);
    return [x, y];
  };
  const right: P2[] = [];
  const left: P2[] = [];
  const armSteps = 10;
  for (let k = 0; k <= armSteps; k++) {
    const [x, y] = armCenter(k / armSteps);
    right.push([x + armW, y]);
    left.push([-x - armW, y]);
  }
  const rightInner: P2[] = [];
  for (let k = armSteps; k >= 0; k--) {
    const [x, y] = armCenter(k / armSteps);
    rightInner.push([Math.max(0.0015, x - armW), y]);
  }
  const outer: P2[] = [];
  // Mors : du côté droit de l'axe jusqu'à la pointe puis côté gauche.
  const pivotR = 0.014;
  const jawHalf = kind === 'cutter' ? 0.012 : kind === 'flat' ? 0.0065 : 0.005;
  outer.push([pivotR, pivotY + 0.004]);
  if (kind === 'cutter') {
    outer.push([jawHalf + 0.002, pivotY - jaw * 0.4], [0.003, tipY + 0.002], [0, tipY]);
    outer.push([-0.003, tipY + 0.002], [-jawHalf - 0.002, pivotY - jaw * 0.4]);
  } else if (kind === 'flat') {
    outer.push([0.009, pivotY - 0.012], [jawHalf, pivotY - 0.03], [jawHalf * 0.8, tipY + 0.001]);
    outer.push([jawHalf * 0.6, tipY], [-jawHalf * 0.6, tipY], [-jawHalf * 0.8, tipY + 0.001]);
    outer.push([-jawHalf, pivotY - 0.03], [-0.009, pivotY - 0.012]);
  } else {
    // Pince à circlips : becs fins coudés en pointe.
    outer.push([0.008, pivotY - 0.012], [jawHalf, pivotY - 0.035], [0.006, tipY + 0.006]);
    outer.push([0.0035, tipY], [0.0015, tipY], [0.0012, tipY + 0.008], [-0.0012, tipY + 0.008]);
    outer.push([-0.0015, tipY], [-0.0035, tipY], [-0.006, tipY + 0.006], [-jawHalf, pivotY - 0.035]);
    outer.push([-0.008, pivotY - 0.012]);
  }
  outer.push([-pivotR, pivotY + 0.004]);
  // Branche gauche (bord extérieur en montant), bout arrondi, bord intérieur en descendant.
  outer.push(...left);
  const [lx, ly] = armCenter(1);
  outer.push([-lx, ly + armW]);
  for (let k = armSteps; k >= 0; k--) {
    const [x, y] = armCenter(k / armSteps);
    outer.push([-Math.max(0.0015, x - armW), y]);
  }
  // Bord intérieur droit (en remontant), bout arrondi, bord extérieur droit (en descendant).
  outer.push(...rightInner.slice().reverse());
  outer.push([lx, ly + armW]);
  outer.push(...right.slice().reverse());
  const gripL: P2[] = [];
  const gripR: P2[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = 0.32 + (0.68 * k) / 8;
    const [x, y] = armCenter(t);
    gripL.push([-x, y]);
    gripR.push([x, y]);
  }
  // Le contour est parcouru dans le sens horaire (montée à gauche) : on l'inverse.
  outer.reverse();
  return { outer, holes: [], grips: [gripL, gripR], pivotY };
}

/** Maillet à tête caoutchouc (accroché tête en haut entre deux chevilles). */
export const MALLET = {
  headRadius: 0.032,
  headLength: 0.11,
  handleRadius: 0.012,
  handleLength: 0.27,
} as const;

/** Scie à métaux (monture tubulaire, lame de 300 mm). */
export const HACKSAW = {
  frameLength: 0.4,
  frameHeight: 0.095,
  tube: 0.0075,
  handleLength: 0.1,
} as const;

/** Pied à coulisse 150 mm. */
export const CALIPER = {
  beamLength: 0.235,
  beamWidth: 0.016,
  jawLength: 0.042,
} as const;

/** Extracteur à deux griffes. */
export const PULLER = {
  barLength: 0.13,
  screwLength: 0.17,
  jawLength: 0.11,
} as const;
