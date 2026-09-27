/**
 * Pastilles placées dans le repère carte (mm) : empreinte × implantation. Module pur.
 */
import { FOOTPRINTS, type PadDef, type PadShape, type Rect } from '../footprints';
import { COMPONENTS, type ComponentPlacement } from '../layout';

export interface PlacedPad {
  ref: string;
  num: string;
  net: string;
  /** Centre (mm, repère carte). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation de la pastille (rad, sens trigonométrique). */
  rot: number;
  shape: PadShape;
  /** Perçage (mm) : trou traversant métallisé. */
  drill?: number;
  /** Point d'arrivée de l'amorce de dégagement (boîtiers à pas fin). */
  fanoutEnd?: { x: number; y: number };
}

/** Transforme un point local d'empreinte en repère carte. */
export function toBoard(p: ComponentPlacement, lx: number, ly: number): { x: number; y: number } {
  const a = (p.rot * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c };
}

export function placePad(p: ComponentPlacement, pad: PadDef): PlacedPad {
  const at = toBoard(p, pad.x, pad.y);
  const placed: PlacedPad = {
    ref: p.ref,
    num: pad.num,
    net: p.nets[pad.num] ?? 'NC',
    x: at.x,
    y: at.y,
    w: pad.w,
    h: pad.h,
    rot: (p.rot * Math.PI) / 180,
    shape: pad.shape,
  };
  if (pad.drill !== undefined) placed.drill = pad.drill;
  if (pad.fanout) {
    const ex = pad.x + pad.fanout.dx * pad.fanout.length;
    const ey = pad.y + pad.fanout.dy * pad.fanout.length;
    placed.fanoutEnd = toBoard(p, ex, ey);
  }
  return placed;
}

/** Toutes les pastilles de la carte (ordre des composants puis des broches). */
export function allPads(components: readonly ComponentPlacement[] = COMPONENTS): PlacedPad[] {
  const out: PlacedPad[] = [];
  for (const c of components) for (const pad of FOOTPRINTS[c.footprint].pads) out.push(placePad(c, pad));
  return out;
}

/** Coins d'un rectangle local transformé (courtyard, contour) dans le repère carte. */
export function rectCorners(p: ComponentPlacement, r: Rect): { x: number; y: number }[] {
  const [x0, y0, x1, y1] = r;
  return [toBoard(p, x0, y0), toBoard(p, x1, y0), toBoard(p, x1, y1), toBoard(p, x0, y1)];
}

/** Recouvrement de deux polygones convexes (théorème de l'axe séparateur). */
export function convexOverlap(a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        minA = Math.min(minA, d);
        maxA = Math.max(maxA, d);
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        minB = Math.min(minB, d);
        maxB = Math.max(maxB, d);
      }
      if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
    }
  }
  return true;
}

/** Distance d'un point à un polygone convexe (0 à l'intérieur). */
export function pointConvexDistance(x: number, y: number, poly: readonly { x: number; y: number }[]): number {
  let inside = true;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const cross = (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x);
    if (cross < 0) inside = false;
    const vx = q.x - p.x;
    const vy = q.y - p.y;
    const t = Math.max(0, Math.min(1, ((x - p.x) * vx + (y - p.y) * vy) / (vx * vx + vy * vy)));
    d = Math.min(d, Math.hypot(x - (p.x + t * vx), y - (p.y + t * vy)));
  }
  return inside ? 0 : d;
}
