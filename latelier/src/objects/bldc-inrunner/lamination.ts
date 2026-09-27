/**
 * Géométrie PURE de la tôle statorique (sans three.js) : contour des dents et encoches, polygone
 * d'une encoche (aire, isolant), rangement des conducteurs dans l'encoche.
 *
 * Repère local d'encoche : axe x = rayon passant par le milieu de l'encoche (vers l'extérieur),
 * axe y = latéral, vers les θ croissants. Repère global de la tôle : (a, b) = (y, z) du moteur,
 * angle θ mesuré de +a vers +b.
 */
import { roundedPath, polar, rotate, signedDistanceToPolygon, type P2, type PathNode } from './profile2d';

export interface LaminationSpec {
  slots: number;
  /** Rayon extérieur du paquet. */
  Ro: number;
  /** Rayon d'alésage (becs de dents). */
  Ri: number;
  /** Rayon du fond d'encoche. */
  Rsb: number;
  toothWidth: number;
  /** Épaisseur radiale du bec de dent. */
  tipHeight: number;
  /** Hauteur du biseau entre bec et corps de dent. */
  wedgeHeight: number;
  /** Ouverture d'encoche (corde à l'alésage). */
  slotOpening: number;
  /** Angle (rad) du milieu de l'encoche 0. */
  slot0: number;
}

/** Points caractéristiques du côté droit (y > 0) d'une encoche, repère local. */
export function slotKeyPoints(spec: LaminationSpec): { O: P2; T1: P2; W: P2; B: P2 } {
  const alpha = Math.PI / spec.slots;
  const hw = spec.toothWidth / 2;
  // Bord gauche de la dent située à +α : droite parallèle à l'axe de la dent, décalée de hw.
  const side = (rho: number): P2 => [
    rho * Math.cos(alpha) + hw * Math.sin(alpha),
    rho * Math.sin(alpha) - hw * Math.cos(alpha),
  ];
  const thetaO = spec.slotOpening / 2 / spec.Ri;
  const O = polar(spec.Ri, thetaO);
  const T1 = polar(spec.Ri + spec.tipHeight, thetaO);
  const rw = spec.Ri + spec.tipHeight + spec.wedgeHeight;
  const W = side(Math.sqrt(Math.max(0, rw * rw - hw * hw)));
  const B = side(Math.sqrt(Math.max(0, spec.Rsb * spec.Rsb - hw * hw)));
  return { O, T1, W, B };
}

const mirror = (p: P2): P2 => [p[0], -p[1]];

/** Arrondis (longueurs de tangente) des coins de la tôle. */
function rounds(spec: LaminationSpec) {
  const k = spec.Ro / 13.5;
  return { O: 0.08 * k, T1: 0.12 * k, W: 0.25 * k, B: 0.35 * k };
}

/** Polygone arrondi d'une encoche (repère local, sens trigonométrique), fermé par la corde des becs. */
export function laminationSlotPolygon(spec: LaminationSpec, maxStep: number): P2[] {
  const { T1, W, B } = slotKeyPoints(spec);
  const r = rounds(spec);
  const nodes: PathNode[] = [
    { p: mirror(T1), round: r.T1 },
    { p: mirror(W), round: r.W },
    { p: mirror(B), round: r.B, arc: { cx: 0, cy: 0, r: spec.Rsb, ccw: true } },
    { p: B, round: r.B },
    { p: W, round: r.W },
    { p: T1, round: r.T1 },
  ];
  return roundedPath(nodes, true, maxStep);
}

/**
 * Contour intérieur complet de la tôle (dents + encoches), repère global, sens trigonométrique.
 * `maxStep` : pas maximal d'échantillonnage des arcs.
 */
export function laminationInnerContour(spec: LaminationSpec, maxStep: number, cornerSteps = 4): P2[] {
  const { O, T1, W, B } = slotKeyPoints(spec);
  const r = rounds(spec);
  const nodes: PathNode[] = [];
  const step = (2 * Math.PI) / spec.slots;
  for (let s = 0; s < spec.slots; s++) {
    const a = spec.slot0 + s * step;
    const rot = (p: P2) => rotate(p, a);
    nodes.push(
      { p: rot(mirror(O)), round: r.O },
      { p: rot(mirror(T1)), round: r.T1 },
      { p: rot(mirror(W)), round: r.W },
      { p: rot(mirror(B)), round: r.B, arc: { cx: 0, cy: 0, r: spec.Rsb, ccw: true } },
      { p: rot(B), round: r.B },
      { p: rot(W), round: r.W },
      { p: rot(T1), round: r.T1 },
      // Bec de la dent suivante : arc d'alésage jusqu'à l'encoche suivante.
      { p: rot(O), round: r.O, arc: { cx: 0, cy: 0, r: spec.Ri, ccw: true } },
    );
  }
  return roundedPath(nodes, true, maxStep, cornerSteps);
}

/**
 * Ligne moyenne de l'isolant d'encoche (repère local) : suit les flancs et le fond, du biseau
 * gauche au biseau droit, décalée de `offset` vers l'intérieur de l'encoche.
 */
export function slotLinerPath(spec: LaminationSpec, maxStep: number, offset: number): P2[] {
  const { W, B } = slotKeyPoints(spec);
  const r = rounds(spec);
  const inward = (p: P2, n: P2): P2 => [p[0] + n[0] * offset, p[1] + n[1] * offset];
  // Normale intérieure du flanc droit (vers y décroissant), perpendiculaire à l'axe de dent.
  const alpha = Math.PI / spec.slots;
  const nRight: P2 = [-Math.sin(alpha), Math.cos(alpha)];
  const nr: P2 = [-nRight[0], -nRight[1]];
  const Wr = inward(W, nr);
  const Br = inward(B, nr);
  const Wl = mirror(Wr);
  const Bl = mirror(Br);
  const R = spec.Rsb - offset;
  const nodes: PathNode[] = [
    { p: Wl },
    { p: Bl, round: r.B, arc: { cx: 0, cy: 0, r: R, ccw: true } },
    { p: Br, round: r.B },
    { p: Wr },
  ];
  return roundedPath(nodes, false, maxStep);
}

/** Position d'un brin dans l'encoche (repère local). */
export interface StrandSlot {
  /** Rayon (x local). */
  x: number;
  /** Décalage latéral (y local). */
  y: number;
}

/** Conducteur (une spire traversant l'encoche) : barycentre et brins qui le composent. */
export interface ConductorCluster {
  x: number;
  y: number;
  /** Positions absolues (repère local d'encoche) de ses brins. */
  strands: StrandSlot[];
}

/**
 * Range `conductors × strands` brins de rayon `radius` dans l'encoche (isolant d'épaisseur
 * `liner`) en empilement hexagonal depuis le fond, puis les regroupe en conducteurs compacts :
 * parcours par bandes de deux rangées, en serpentin (les brins d'une même spire restent voisins,
 * les spires successives sont adjacentes). `side` : encoche entière, ou demi-encoche
 * gauche/droite (bobinage concentré à deux couches). Si les brins ne tiennent pas, leur rayon
 * est réduit (facteur `scale` < 1 retourné : tassement du faisceau).
 */
export function packSlot(
  spec: LaminationSpec,
  liner: number,
  conductors: number,
  strands: number,
  radius: number,
  side: 'full' | 'left' | 'right',
): { clusters: ConductorCluster[]; radius: number; scale: number } {
  const poly = laminationSlotPolygon(spec, 0.05);
  const inner = spec.Ri + spec.tipHeight + spec.wedgeHeight * 0.35;
  const count = conductors * strands;
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = radius * Math.pow(0.97, attempt);
    const clearance = liner + r * 1.02;
    const ok = (p: P2) => signedDistanceToPolygon(p, poly) <= -clearance && p[0] >= inner + r;
    // Empilement hexagonal : rangées au pas √3·r, décalées d'un rayon une rangée sur deux.
    const rowPitch = Math.sqrt(3) * r * 1.01;
    const centerGap = side === 'full' ? 0 : liner / 2 + 0.03;
    const found: (StrandSlot & { row: number })[] = [];
    let row = 0;
    for (let x = spec.Rsb - clearance; x > inner && found.length < count * 1.6; x -= rowPitch, row++) {
      const offset = row % 2 === 1 ? r : 0;
      for (let j = -60; j <= 60; j++) {
        const y = offset + j * 2 * r * 1.005;
        if (side === 'right' && y < centerGap + r) continue;
        if (side === 'left' && y > -(centerGap + r)) continue;
        if (ok([x, y])) found.push({ x, y, row });
      }
    }
    if (found.length < count) continue;
    // Bandes de deux rangées depuis le fond, colonnes en serpentin.
    const ordered = [...found].sort((a, b) => {
      const ba = Math.floor(a.row / 2);
      const bb = Math.floor(b.row / 2);
      if (ba !== bb) return ba - bb;
      const dir = (ba % 2 === 0) !== (side === 'left') ? 1 : -1;
      if (Math.abs(a.y - b.y) > r * 0.5) return (a.y - b.y) * dir;
      return a.row - b.row;
    });
    const clusters: ConductorCluster[] = [];
    for (let c = 0; c < conductors; c++) {
      const list = ordered.slice(c * strands, (c + 1) * strands).map(({ x, y }) => ({ x, y }));
      const cx = list.reduce((acc, p) => acc + p.x, 0) / list.length;
      const cy = list.reduce((acc, p) => acc + p.y, 0) / list.length;
      clusters.push({ x: cx, y: cy, strands: list });
    }
    return { clusters, radius: r, scale: r / radius };
  }
  // Repli (encoche trop petite) : brins alignés sur l'axe de l'encoche, signalé par une échelle nulle.
  const clusters: ConductorCluster[] = [];
  for (let c = 0; c < conductors; c++) {
    const x = spec.Rsb - liner - radius * (1 + 2 * c);
    const y = side === 'left' ? -radius : side === 'right' ? radius : 0;
    clusters.push({ x, y, strands: Array.from({ length: strands }, () => ({ x, y })) });
  }
  return { clusters, radius, scale: 0 };
}
