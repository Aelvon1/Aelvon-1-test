/**
 * Petites aides de dessin 2D (listes d'opérations `DrawOp` sérialisables, rastérisées dans le
 * worker de textures). Coordonnées en pixels de l'atlas de référence (2048 px), origine en haut
 * à gauche de la région.
 */
import type { DrawOp } from '../../../textures/types';
import { mulberry32 } from '../../lighting/neonFlicker';

export const FONT_SANS = "'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif";
export const FONT_COND = "'DejaVu Sans Condensed', 'Arial Narrow', Arial, sans-serif";
export const FONT_MONO = "'DejaVu Sans Mono', 'Courier New', monospace";
export const FONT_SERIF = "'DejaVu Serif', Georgia, 'Times New Roman', serif";
/** Écriture manuscrite (feutre) : police cursive du système, légèrement penchée. */
export const FONT_HAND = "'Comic Sans MS', 'Segoe Print', 'Chalkboard', 'URW Chancery L', cursive";

export interface TextOptions {
  weight?: 'normal' | 'bold' | '600' | '800' | '900';
  italic?: boolean;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'alphabetic' | 'bottom';
  font?: string;
  rotate?: number;
  spacing?: number;
}

export function text(value: string, x: number, y: number, size: number, o: TextOptions = {}): DrawOp {
  const font = `${o.italic ? 'italic ' : ''}${o.weight ?? 'normal'} ${size}px ${o.font ?? FONT_SANS}`;
  return {
    op: 'text',
    text: value,
    x,
    y,
    font,
    fill: o.fill ?? (o.stroke ? undefined : '#1d1b18'),
    stroke: o.stroke,
    lineWidth: o.lineWidth,
    align: o.align ?? 'left',
    baseline: o.baseline ?? 'middle',
    rotate: o.rotate,
    letterSpacing: o.spacing,
  };
}

export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: string,
  o: { stroke?: string; lineWidth?: number; radius?: number } = {},
): DrawOp {
  return { op: 'rect', x, y, w, h, fill, stroke: o.stroke, lineWidth: o.lineWidth, radius: o.radius };
}

export function circle(
  x: number,
  y: number,
  r: number,
  fill?: string,
  o: { stroke?: string; lineWidth?: number } = {},
): DrawOp {
  return { op: 'circle', x, y, r, fill, stroke: o.stroke, lineWidth: o.lineWidth };
}

export function line(points: readonly number[], stroke: string, lineWidth = 1, closed = false): DrawOp {
  return { op: 'polyline', points, stroke, lineWidth, closed, lineCap: 'round', lineJoin: 'round' };
}

export function translate(x: number, y: number): DrawOp {
  return { op: 'transform', a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function rotateAbout(angle: number, x: number, y: number): DrawOp[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    translate(x, y),
    { op: 'transform', a: c, b: s, c: -s, d: c, e: 0, f: 0 },
    translate(-x, -y),
  ];
}

/**
 * Graduation circulaire d'un bouton : `n` traits de `a0` à `a1` (rad, sens horaire écran,
 * 0 = droite), un trait sur `major` plus long, étiquettes facultatives aux traits majeurs.
 */
export function dialScale(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  n: number,
  o: { major?: number; len?: number; color?: string; width?: number; labels?: string[]; labelSize?: number } = {},
): DrawOp[] {
  const ops: DrawOp[] = [];
  const color = o.color ?? '#1d1b18';
  const len = o.len ?? r * 0.18;
  const major = o.major ?? 5;
  let label = 0;
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const big = k % major === 0;
    const r0 = r;
    const r1 = r + (big ? len * 1.7 : len);
    const c = Math.cos(a);
    const s = Math.sin(a);
    ops.push(line([cx + c * r0, cy + s * r0, cx + c * r1, cy + s * r1], color, (o.width ?? 1.6) * (big ? 1.4 : 1)));
    if (big && o.labels && label < o.labels.length) {
      const rl = r1 + (o.labelSize ?? 10) * 0.95;
      ops.push(
        text(o.labels[label]!, cx + c * rl, cy + s * rl, o.labelSize ?? 10, {
          fill: color,
          align: 'center',
          font: FONT_COND,
          weight: 'bold',
        }),
      );
      label++;
    }
  }
  return ops;
}

/** Taches, jaunissement et usure (papier, carton, étiquettes) à l'intérieur d'un rectangle. */
export function aging(
  w: number,
  h: number,
  seed: number,
  o: { stains?: number; color?: string; fold?: boolean; edges?: number } = {},
): DrawOp[] {
  const rand = mulberry32(seed);
  const ops: DrawOp[] = [];
  const color = o.color ?? '120, 88, 48';
  const n = o.stains ?? 6;
  for (let k = 0; k < n; k++) {
    const r = (0.04 + rand() * 0.16) * Math.min(w, h);
    const x = rand() * w;
    const y = rand() * h;
    ops.push(circle(x, y, r, `rgba(${color}, ${0.03 + rand() * 0.06})`));
    // Auréole (tache d'eau ou de tasse) : anneau plus sombre.
    if (rand() < 0.35) ops.push(circle(x, y, r * 0.95, undefined, { stroke: `rgba(${color}, 0.12)`, lineWidth: 1.5 }));
  }
  // Bords jaunis / salis.
  const e = o.edges ?? 0.18;
  if (e > 0) {
    const t = Math.max(2, Math.min(w, h) * 0.04);
    ops.push(rect(0, 0, w, t, `rgba(${color}, ${e})`));
    ops.push(rect(0, h - t, w, t, `rgba(${color}, ${e})`));
    ops.push(rect(0, 0, t, h, `rgba(${color}, ${e * 0.8})`));
    ops.push(rect(w - t, 0, t, h, `rgba(${color}, ${e * 0.8})`));
  }
  if (o.fold) {
    ops.push(line([0, h * 0.5, w, h * 0.5 + 2], `rgba(${color}, 0.22)`, 1.5));
    ops.push(line([0, h * 0.5 + 2, w, h * 0.5 + 4], 'rgba(255, 255, 255, 0.18)', 1));
  }
  return ops;
}

/** Érode l'encre ou la peinture (petits manques transparents) dans un rectangle. */
export function erode(w: number, h: number, seed: number, count: number, size = 2.2): DrawOp[] {
  const rand = mulberry32(seed);
  const ops: DrawOp[] = [{ op: 'save' }, { op: 'composite', mode: 'destination-out' }];
  for (let k = 0; k < count; k++) {
    ops.push(circle(rand() * w, rand() * h, size * (0.4 + rand()), 'rgba(0, 0, 0, 1)'));
  }
  ops.push({ op: 'restore' });
  return ops;
}

/** Bande de ruban de masquage avec une note au feutre. */
export function maskingTape(w: number, h: number, note: string, seed: number, color = '#1b1f5c'): DrawOp[] {
  const rand = mulberry32(seed);
  const ops: DrawOp[] = [];
  // Bords déchirés : polygone dentelé aux deux extrémités.
  const pts: number[] = [0, 0, w, 0];
  for (let k = 1; k < 6; k++) pts.push(w - rand() * 4, (h * k) / 6);
  pts.push(w, h, 0, h);
  for (let k = 5; k > 0; k--) pts.push(rand() * 4, (h * k) / 6);
  ops.push({ op: 'polyline', points: pts, fill: '#ddd0a8', closed: true });
  ops.push(...aging(w, h, seed + 3, { stains: 3, edges: 0.1 }));
  ops.push(
    text(note, w / 2, h / 2 + 1, h * 0.58, {
      font: FONT_HAND,
      fill: color,
      align: 'center',
      weight: 'bold',
      rotate: (rand() - 0.5) * 0.06,
    }),
  );
  return ops;
}

/** Vis de fixation dessinée (plaques, affiches). */
export function screwHead(x: number, y: number, r: number): DrawOp[] {
  return [
    circle(x, y, r, '#8d8b85', { stroke: '#4c4a45', lineWidth: 1 }),
    line([x - r * 0.7, y - r * 0.2, x + r * 0.7, y + r * 0.2], '#3a3833', 1.4),
  ];
}
