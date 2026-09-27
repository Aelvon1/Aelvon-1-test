/**
 * Géométrie plane PURE (sans three.js) : contours arrondis, arcs, aires, décalages.
 *
 * Toutes les pièces « découpées » du moteur (tôles, aimants, platine, circlip, denture…) partent
 * d'un contour décrit par des sommets « coins » reliés par des segments droits ou des arcs. Chaque
 * coin peut recevoir un arrondi (longueur de tangente) : rien n'est parfaitement vif, comme sur
 * une pièce réelle (poinçonnage, usinage, moulage).
 *
 * Unités libres (le moteur travaille en millimètres dans ces modules).
 */

/** Point 2D. */
export type P2 = readonly [number, number];

/** Arc reliant un nœud au suivant : centre, rayon et sens (trigonométrique si `ccw`). */
export interface ArcTo {
  cx: number;
  cy: number;
  r: number;
  ccw: boolean;
}

/** Nœud d'un contour : sommet, arrondi éventuel, et nature du segment vers le nœud suivant. */
export interface PathNode {
  p: P2;
  /** Longueur de tangente de l'arrondi du coin (0 = coin conservé). */
  round?: number;
  /** Arc vers le nœud suivant (absent = segment droit). */
  arc?: ArcTo;
}

export const TAU = Math.PI * 2;

export const polar = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];
export const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
export const len = (a: P2): number => Math.hypot(a[0], a[1]);
export const norm = (a: P2): P2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const dist = (a: P2, b: P2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const rotate = (a: P2, angle: number): P2 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
};

/** Aire signée (positive si le contour tourne dans le sens trigonométrique). */
export function signedArea(points: readonly P2[]): number {
  let a = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Longueur d'un contour (fermé si `closed`). */
export function perimeter(points: readonly P2[], closed = true): number {
  let l = 0;
  const n = points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) l += dist(points[i]!, points[(i + 1) % n]!);
  return l;
}

/** Contour orienté dans le sens voulu (copie inversée si besoin). */
export function oriented(points: readonly P2[], ccw: boolean): P2[] {
  const isCcw = signedArea(points) > 0;
  return isCcw === ccw ? [...points] : [...points].reverse();
}

/** Angle (rad) de `p` autour de `c`. */
const angleAround = (c: P2, p: P2): number => Math.atan2(p[1] - c[1], p[0] - c[0]);

/** Balayage angulaire signé de `a0` vers `a1` dans le sens demandé. */
function sweepAngle(a0: number, a1: number, ccw: boolean): number {
  let d = a1 - a0;
  if (ccw) while (d <= 1e-12) d += TAU;
  else while (d >= -1e-12) d -= TAU;
  // Un balayage de quasi 2π pour deux points confondus : arc nul.
  if (Math.abs(Math.abs(d) - TAU) < 1e-9) return 0;
  return d;
}

/** Point de l'arc `arc` situé à la distance curviligne `s` de `from` (dans le sens de l'arc). */
function moveAlongArc(arc: ArcTo, from: P2, s: number): P2 {
  const a = angleAround([arc.cx, arc.cy], from) + (arc.ccw ? 1 : -1) * (s / arc.r);
  return [arc.cx + arc.r * Math.cos(a), arc.cy + arc.r * Math.sin(a)];
}

/** Longueur d'un segment (droit ou arc) du nœud `a` au point `b`. */
function segmentLength(a: PathNode, b: P2): number {
  if (!a.arc) return dist(a.p, b);
  const c: P2 = [a.arc.cx, a.arc.cy];
  return Math.abs(sweepAngle(angleAround(c, a.p), angleAround(c, b), a.arc.ccw)) * a.arc.r;
}

/**
 * Densifie un contour décrit par des nœuds : arcs échantillonnés (pas maximal `maxStep`), coins
 * arrondis par une courbe de Bézier quadratique tangente aux deux segments (courbure douce,
 * aucune arête vive). Retourne la liste de points (sans doublon de fermeture).
 */
export function roundedPath(nodes: readonly PathNode[], closed: boolean, maxStep: number, cornerSteps = 5): P2[] {
  const n = nodes.length;
  if (n < 2) return nodes.map((node) => node.p);
  // Longueur de tangente effective de chaque coin (bornée à 45 % des segments adjacents).
  const tangent: number[] = nodes.map((node, i) => {
    const r = node.round ?? 0;
    if (r <= 0) return 0;
    if (!closed && (i === 0 || i === n - 1)) return 0;
    const prev = nodes[(i - 1 + n) % n]!;
    const next = nodes[(i + 1) % n]!;
    const lin = segmentLength(prev, node.p);
    const lout = segmentLength(node, next.p);
    return Math.min(r, 0.45 * lin, 0.45 * lout);
  });

  /** Point de départ (après l'arrondi) du segment sortant du nœud i. */
  const startOf = (i: number): P2 => {
    const node = nodes[i]!;
    const t = tangent[i]!;
    if (t <= 0) return node.p;
    const next = nodes[(i + 1) % n]!;
    return node.arc ? moveAlongArc(node.arc, node.p, t) : add(node.p, scale(norm(sub(next.p, node.p)), t));
  };
  /** Point d'arrivée (avant l'arrondi) du segment entrant dans le nœud i. */
  const endOf = (i: number): P2 => {
    const node = nodes[i]!;
    const t = tangent[i]!;
    if (t <= 0) return node.p;
    const prev = nodes[(i - 1 + n) % n]!;
    if (prev.arc) {
      const reversed: ArcTo = { ...prev.arc, ccw: !prev.arc.ccw };
      return moveAlongArc(reversed, node.p, t);
    }
    return add(node.p, scale(norm(sub(prev.p, node.p)), t));
  };

  const out: P2[] = [];
  const push = (p: P2) => {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > 1e-9) out.push(p);
  };
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    // Coin i : arrondi (Bézier A → coin → B) ou sommet.
    const t = tangent[i]!;
    if (t > 0) {
      const a = endOf(i);
      const b = startOf(i);
      const c = nodes[i]!.p;
      for (let k = 0; k <= cornerSteps; k++) {
        const u = k / cornerSteps;
        const w0 = (1 - u) * (1 - u);
        const w1 = 2 * (1 - u) * u;
        const w2 = u * u;
        push([w0 * a[0] + w1 * c[0] + w2 * b[0], w0 * a[1] + w1 * c[1] + w2 * b[1]]);
      }
    } else {
      push(nodes[i]!.p);
    }
    if (i >= segCount) break;
    // Segment i → i+1 (arc densifié ; un segment droit n'ajoute aucun point intermédiaire).
    const node = nodes[i]!;
    if (node.arc) {
      const from = startOf(i);
      const to = endOf((i + 1) % n);
      const c: P2 = [node.arc.cx, node.arc.cy];
      const a0 = angleAround(c, from);
      const sweep = sweepAngle(a0, angleAround(c, to), node.arc.ccw);
      const steps = Math.max(1, Math.ceil((Math.abs(sweep) * node.arc.r) / maxStep));
      for (let k = 1; k < steps; k++) {
        const a = a0 + (sweep * k) / steps;
        push([c[0] + node.arc.r * Math.cos(a), c[1] + node.arc.r * Math.sin(a)]);
      }
    }
  }
  if (closed && out.length > 2 && dist(out[0]!, out[out.length - 1]!) < 1e-9) out.pop();
  return out;
}

/** Cercle échantillonné (sens trigonométrique) : `segments` points, premier point à l'angle `a0`. */
export function circle(cx: number, cy: number, r: number, segments: number, a0 = 0): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = a0 + (TAU * i) / segments;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Rectangle à coins arrondis centré en (cx, cy), sens trigonométrique. */
export function roundedRect(
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
  maxStep: number,
  cornerSteps = 5,
): P2[] {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return roundedPath(
    [
      { p: [x0, y0], round: r },
      { p: [x1, y0], round: r },
      { p: [x1, y1], round: r },
      { p: [x0, y1], round: r },
    ],
    true,
    maxStep,
    cornerSteps,
  );
}

/**
 * Normales sortantes (côté matière → vide) des sommets d'un contour fermé : pour un contour
 * extérieur orienté trigonométrique ou un trou orienté horaire, la normale d'une arête (dx, dy)
 * est (dy, −dx). Retourne des normales de sommet (moyenne des arêtes adjacentes, normalisée) et
 * le facteur de mitre (1 / cos du demi-angle) pour décaler exactement les arêtes.
 */
export function vertexNormals(points: readonly P2[]): { normals: P2[]; miter: number[] } {
  const n = points.length;
  const edgeNormals: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    edgeNormals.push(norm([b[1] - a[1], -(b[0] - a[0])]));
  }
  const normals: P2[] = [];
  const miter: number[] = [];
  for (let i = 0; i < n; i++) {
    const e0 = edgeNormals[(i - 1 + n) % n]!;
    const e1 = edgeNormals[i]!;
    const m = norm(add(e0, e1));
    normals.push(m);
    const c = Math.max(0.35, m[0] * e1[0] + m[1] * e1[1]);
    miter.push(1 / c);
  }
  return { normals, miter };
}

/** Distance d'un point à un segment. */
export function distanceToSegment(p: P2, a: P2, b: P2): number {
  const ab = sub(b, a);
  const l2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2)) : 0;
  return dist(p, add(a, scale(ab, t)));
}

/** Point dans un polygone (règle pair-impair). */
export function pointInPolygon(p: P2, poly: readonly P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Distance signée d'un point au bord d'un polygone (négative à l'intérieur). */
export function signedDistanceToPolygon(p: P2, poly: readonly P2[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distanceToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  return pointInPolygon(p, poly) ? -d : d;
}
