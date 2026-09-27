/**
 * Cinématique inverse à deux segments (bras articulé de la lampe loupe), logique pure.
 *
 * Repère du plan du bras : `r` = distance horizontale épaule → poignet (≥ 0), `h` = dénivelé
 * (poignet − épaule). Les angles sont mesurés depuis la verticale (+Y) vers l'avant (+r).
 * Solution « coude en haut » : le premier segment est moins incliné que la droite épaule-cible.
 */
export interface TwoLinkSolution {
  /** Angle du premier segment depuis la verticale (rad). */
  a1: number;
  /** Angle ABSOLU du second segment depuis la verticale (rad). */
  a2: number;
  /** Position du coude dans le plan (r, h). */
  elbowR: number;
  elbowH: number;
  /** Faux si la cible était hors d'atteinte (bras tendu au plus près). */
  reachable: boolean;
}

export function solveTwoLink(r: number, h: number, l1: number, l2: number): TwoLinkSolution {
  const dist = Math.hypot(r, h);
  const minReach = Math.abs(l1 - l2) + 1e-4;
  const maxReach = l1 + l2 - 1e-4;
  const d = Math.min(Math.max(dist, minReach), maxReach);
  const reachable = dist >= minReach && dist <= maxReach;
  const phi = Math.atan2(r, h);
  const cosAlpha = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosAlpha)));
  const a1 = phi - alpha;
  const elbowR = l1 * Math.sin(a1);
  const elbowH = l1 * Math.cos(a1);
  // Point visé effectivement (ramené sur la sphère atteignable si nécessaire).
  const scale = dist > 1e-6 ? d / dist : 0;
  const a2 = Math.atan2(r * scale - elbowR, h * scale - elbowH);
  return { a1, a2, elbowR, elbowH, reachable };
}
