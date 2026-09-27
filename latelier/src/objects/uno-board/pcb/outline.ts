/**
 * Contour de la carte : polygone de `layout.ts` avec congés d'angle (aucun angle vif) et
 * contours décalés (plan de masse en retrait du bord). Module pur (mm, repère carte).
 */
import { BOARD_OUTLINE, OUTLINE_CORNER_RADIUS } from '../layout';

export type Pt = readonly [number, number];

/** Polygone avec un congé de rayon `r` à chaque sommet (sens conservé). */
export function filletPolygon(poly: readonly Pt[], r: number, segments = 6): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const a = poly[(i + n - 1) % n]!;
    const b = poly[(i + 1) % n]!;
    const u = norm([a[0] - p[0], a[1] - p[1]]);
    const v = norm([b[0] - p[0], b[1] - p[1]]);
    const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
    const angle = Math.acos(cos); // angle entre les deux arêtes
    if (angle < 1e-3 || Math.PI - angle < 1e-3) {
      out.push(p);
      continue;
    }
    const t = r / Math.tan(angle / 2);
    const bis = norm([u[0] + v[0], u[1] + v[1]]);
    const cd = r / Math.sin(angle / 2);
    const c: Pt = [p[0] + bis[0] * cd, p[1] + bis[1] * cd];
    const p0: Pt = [p[0] + u[0] * t, p[1] + u[1] * t];
    const p1: Pt = [p[0] + v[0] * t, p[1] + v[1] * t];
    const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
    let a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    // Plus court chemin angulaire.
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    for (let k = 0; k <= segments; k++) {
      const ang = a0 + ((a1 - a0) * k) / segments;
      out.push([c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r]);
    }
  }
  return out;
}

function norm(v: Pt): Pt {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/** Aire signée (positive = sens trigonométrique). */
export function signedArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[(i + 1) % poly.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/**
 * Décalage d'un polygone simple de `d` mm vers l'intérieur (polygone en sens trigonométrique),
 * par intersection des arêtes décalées. Suffisant pour le contour peu concave de la carte.
 */
export function insetPolygon(poly: readonly Pt[], d: number): Pt[] {
  const n = poly.length;
  const lines: { p: Pt; dir: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const dir = norm([b[0] - a[0], b[1] - a[1]]);
    const inward: Pt = [-dir[1], dir[0]]; // normale gauche = intérieur (sens trigonométrique)
    lines.push({ p: [a[0] + inward[0] * d, a[1] + inward[1] * d], dir });
  }
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const l0 = lines[(i + n - 1) % n]!;
    const l1 = lines[i]!;
    const den = l0.dir[0] * l1.dir[1] - l0.dir[1] * l1.dir[0];
    if (Math.abs(den) < 1e-9) {
      out.push(l1.p);
      continue;
    }
    const t = ((l1.p[0] - l0.p[0]) * l1.dir[1] - (l1.p[1] - l0.p[1]) * l1.dir[0]) / den;
    out.push([l0.p[0] + l0.dir[0] * t, l0.p[1] + l0.dir[1] * t]);
  }
  return out;
}

/** Contour arrondi de la carte (mm, sens trigonométrique). */
export function boardOutline(segments = 6): Pt[] {
  return filletPolygon(BOARD_OUTLINE, OUTLINE_CORNER_RADIUS, segments);
}
