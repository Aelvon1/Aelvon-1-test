/**
 * Sections planes PURES (sans three.js) des pièces découpées ou extrudées : carter à ailettes,
 * aimant, platine capteurs, circlip, denture en développante, isolant d'encoche.
 * Coordonnées (a, b) = (y, z) du moteur pour les sections perpendiculaires à l'axe.
 */
import { circle, roundedPath, TAU, type P2, type PathNode } from './profile2d';
import { slotLinerPath, type LaminationSpec } from './lamination';

/** Contour extérieur du carter : cylindre + ailettes longitudinales à sommets arrondis. */
export function canContour(
  bodyR: number,
  finR: number,
  finAngles: readonly number[],
  finWidth: number,
  maxStep: number,
): P2[] {
  const hw = finWidth / 2;
  const angles = [...finAngles].map((a) => ((a % TAU) + TAU) % TAU).sort((x, y) => x - y);
  const nodes: PathNode[] = [];
  const tRoot = Math.sqrt(bodyR * bodyR - hw * hw);
  const tTip = Math.sqrt(finR * finR - hw * hw) - 0.02;
  for (const a of angles) {
    const u: P2 = [Math.cos(a), Math.sin(a)];
    const v: P2 = [-Math.sin(a), Math.cos(a)];
    const at = (t: number, s: number): P2 => [u[0] * t + v[0] * s, u[1] * t + v[1] * s];
    nodes.push(
      { p: at(tRoot, -hw), round: 0.25 },
      { p: at(tTip, -hw), round: hw * 0.85 },
      { p: at(tTip, hw), round: hw * 0.85 },
      { p: at(tRoot, hw), round: 0.25, arc: { cx: 0, cy: 0, r: bodyR, ccw: true } },
    );
  }
  return roundedPath(nodes, true, maxStep, 6);
}

/** Section d'un segment d'aimant en arc (centré sur l'angle 0), coins arrondis. */
export function magnetSection(
  rIn: number,
  rOut: number,
  halfAngle: number,
  round: number,
  maxStep: number,
): P2[] {
  const c = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];
  // Côtés radiaux ; arrondis plus marqués sur l'arête extérieure (meulage).
  return roundedPath(
    [
      { p: c(rIn, -halfAngle), round: round * 0.7, arc: { cx: 0, cy: 0, r: rIn, ccw: true } },
      { p: c(rIn, halfAngle), round: round * 0.7 },
      { p: c(rOut, halfAngle), round, arc: { cx: 0, cy: 0, r: rOut, ccw: false } },
      { p: c(rOut, -halfAngle), round },
    ],
    true,
    maxStep,
  );
}

/** Secteur annulaire à coins arrondis (platine capteurs, logement), angles a0 < a1. */
export function annularSector(
  rIn: number,
  rOut: number,
  a0: number,
  a1: number,
  round: number,
  maxStep: number,
): P2[] {
  const c = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];
  return roundedPath(
    [
      { p: c(rIn, a0), round },
      { p: c(rOut, a0), round, arc: { cx: 0, cy: 0, r: rOut, ccw: true } },
      { p: c(rOut, a1), round },
      { p: c(rIn, a1), round, arc: { cx: 0, cy: 0, r: rIn, ccw: false } },
    ],
    true,
    maxStep,
  );
}

/**
 * Circlip extérieur (type DIN 471) : anneau ouvert en haut (θ = 0), largeur croissante vers le
 * dos, oreilles percées pour la pince. Retourne le contour et les deux trous d'oreilles.
 */
export function circlipSection(rIn: number, rOut: number, maxStep: number): { outer: P2[]; holes: P2[][] } {
  const gap = 0.55; // demi-ouverture (rad)
  const band = rOut - rIn;
  const lug = band * 1.25;
  const c = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];
  const nodes: PathNode[] = [];
  // Extrémité gauche (angle +gap), puis extérieur jusqu'à l'extrémité droite (angle 2π − gap).
  nodes.push({ p: c(rIn, gap), round: band * 0.2 });
  nodes.push({ p: c(rIn + lug, gap), round: lug * 0.45 });
  nodes.push({ p: c(rIn + lug, gap + 0.42), round: lug * 0.4 });
  const steps = 28;
  for (let k = 0; k <= steps; k++) {
    const a = gap + 0.62 + ((TAU - 2 * gap - 1.24) * k) / steps;
    // Largeur maximale au dos (a = π), minimale près des oreilles.
    const w = band * (0.62 + 0.38 * Math.sin(((a - gap) / (TAU - 2 * gap)) * Math.PI));
    nodes.push({ p: c(rIn + w, a), round: k === 0 || k === steps ? band * 0.3 : 0 });
  }
  nodes.push({ p: c(rIn + lug, TAU - gap - 0.42), round: lug * 0.4 });
  nodes.push({ p: c(rIn + lug, TAU - gap), round: lug * 0.45 });
  // Retour par l'intérieur (sens horaire) jusqu'à l'extrémité de départ.
  nodes.push({ p: c(rIn, TAU - gap), round: band * 0.2, arc: { cx: 0, cy: 0, r: rIn, ccw: false } });
  const outer = roundedPath(nodes, true, maxStep);
  const hr = lug * 0.22;
  const holes = [
    circle(...c(rIn + lug * 0.55, gap + 0.2), hr, 16),
    circle(...c(rIn + lug * 0.55, TAU - gap - 0.2), hr, 16),
  ];
  return { outer, holes };
}

/** Fonction développante inv(α) = tan α − α. */
const inv = (a: number) => Math.tan(a) - a;

/**
 * Contour d'un pignon droit à denture en développante de cercle (angle de pression 20°),
 * congés de pied et arêtes de tête arrondis. `z` dents, module `m`.
 */
export function gearContour(z: number, m: number, flankSamples: number, maxStep: number): P2[] {
  const alpha = (20 * Math.PI) / 180;
  const rp = (z * m) / 2;
  const rb = rp * Math.cos(alpha);
  const ra = rp + m;
  const rf = rp - 1.25 * m;
  // Demi-épaisseur angulaire au rayon r (épaisseur au primitif = π m / 2).
  const psi = (r: number) =>
    Math.PI / (2 * z) + inv(alpha) - inv(Math.acos(Math.min(1, rb / Math.max(r, rb))));
  const rStart = Math.max(rb, rf);
  const nodes: PathNode[] = [];
  const c = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];
  for (let k = 0; k < z; k++) {
    const g = (k * TAU) / z;
    const psiB = psi(rStart);
    // Pied gauche (congé), flanc gauche montant, tête, flanc droit descendant, pied droit.
    nodes.push({ p: c(rf, g - psiB - 0.02), round: 0.28 * m });
    if (rf < rb) nodes.push({ p: c(rb, g - psiB) });
    for (let i = 1; i < flankSamples; i++) {
      const r = rStart + ((ra - rStart) * i) / flankSamples;
      nodes.push({ p: c(r, g - psi(r)) });
    }
    nodes.push({ p: c(ra, g - psi(ra)), round: 0.1 * m, arc: { cx: 0, cy: 0, r: ra, ccw: true } });
    nodes.push({ p: c(ra, g + psi(ra)), round: 0.1 * m });
    for (let i = flankSamples - 1; i >= 1; i--) {
      const r = rStart + ((ra - rStart) * i) / flankSamples;
      nodes.push({ p: c(r, g + psi(r)) });
    }
    if (rf < rb) nodes.push({ p: c(rb, g + psiB) });
    nodes.push({ p: c(rf, g + psiB + 0.02), round: 0.28 * m, arc: { cx: 0, cy: 0, r: rf, ccw: true } });
  }
  return roundedPath(nodes, true, maxStep, 4);
}

/**
 * Section de l'isolant d'encoche (papier) dans le repère local d'encoche : bande d'épaisseur
 * `t` suivant les flancs et le fond. Recentrée sur (rMid, 0) pour que l'instance pivote sur
 * l'encoche.
 */
export function linerSection(spec: LaminationSpec, t: number, rMid: number, maxStep: number): P2[] {
  const inner = slotLinerPath(spec, maxStep, t);
  const outer = slotLinerPath(spec, maxStep, 0.005);
  const pts = [...outer, ...[...inner].reverse()];
  return pts.map(([x, y]) => [x - rMid, y] as P2);
}
