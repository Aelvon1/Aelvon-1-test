/**
 * Vue rangée (« knolling ») : logique PURE (sans three.js), couverte par les tests.
 *
 * 1. Orientation « à plat » d'une pièce : parmi les 24 rotations axiales, celle qui minimise la
 *    hauteur, puis place la plus grande dimension horizontale selon X ; à égalité, la rotation la
 *    plus proche de l'orientation d'origine.
 * 2. Disposition en rangées alignées (de l'arrière vers l'avant du tapis, de gauche à droite) :
 *    ~12 mm entre pièces, ~25 mm entre groupes, chaque groupe commence une nouvelle rangée.
 *    Si le tapis ne suffit pas, la zone s'élargit progressivement jusqu'aux bords du plateau de
 *    l'établi, sans jamais les dépasser. Des zones interdites (`keepOut`) peuvent être évitées
 *    (rangement des pièces retirées autour de l'objet resté sur le tapis).
 * 3. Pièces instanciées : pile (`stack`, tôles) ou rangée compacte (`row`, vis, billes), qui passe
 *    à la ligne si elle est plus large que la zone.
 * 4. Ancrages des étiquettes de noms (devant chaque emplacement).
 */
import type { Vec3 } from '../objects/types';

/** Rectangle horizontal (m, repère monde). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Élément à ranger (une pièce, éventuellement instanciée). */
export interface KnollingItem {
  id: string;
  /** Groupe d'alignement ; les éléments d'un même groupe doivent être consécutifs. */
  group: string;
  /** Dimensions d'UNE instance après orientation : x = largeur, y = hauteur, z = profondeur (m). */
  size: Vec3;
  count: number;
  layout: 'row' | 'stack';
  /** Texte de l'étiquette de nom. */
  label: string;
}

export interface KnollingRegion {
  /** Hauteur (y monde) de la surface de pose. */
  surfaceY: number;
  /** Zone préférée (le tapis). */
  preferred: Rect;
  /** Limite absolue (plateau de l'établi moins une marge de bord). */
  limit: Rect;
  /** Zones à éviter (emprise de l'objet resté en place…). */
  keepOut?: readonly Rect[];
  /** Centrer le bloc rangé sur la zone préférée (défaut : vrai sans zones interdites). */
  center?: boolean;
}

export interface KnollingSlot {
  id: string;
  /** Emprise au sol de l'élément (toutes instances comprises). */
  footprint: Rect;
  /** Centre (monde) de la boîte orientée de chaque instance. */
  instances: [number, number, number][];
  /** Ancrage de l'étiquette de nom (monde), devant l'emplacement. */
  labelPosition: [number, number, number];
  label: string;
}

export interface KnollingLayout {
  slots: Map<string, KnollingSlot>;
  /** Vrai si tout tient sans chevauchement dans la limite. */
  fits: boolean;
  /** Emprise totale utilisée. */
  bounds: Rect;
}

/** Espacements (m). */
export const KNOLLING_GAPS = {
  item: 0.012,
  group: 0.025,
  instance: 0.004,
} as const;

const EPS = 1e-9;

// --- Orientation à plat ------------------------------------------------------------------

/** Matrice 3×3 (ligne par ligne) d'une rotation axiale (permutation signée, déterminant +1). */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const det3 = (m: Mat3): number =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) -
  m[1] * (m[3] * m[8] - m[5] * m[6]) +
  m[2] * (m[3] * m[7] - m[4] * m[6]);

/** Les 24 rotations axiales (permutations signées de déterminant +1). */
export const AXIAL_ROTATIONS: readonly Mat3[] = (() => {
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const out: Mat3[] = [];
  for (const p of perms) {
    for (let signs = 0; signs < 8; signs++) {
      const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let row = 0; row < 3; row++) m[row * 3 + p[row]!] = signs & (1 << row) ? -1 : 1;
      const mat = m as unknown as Mat3;
      if (Math.abs(det3(mat) - 1) < 1e-9) out.push(mat);
    }
  }
  return out;
})();

/** Quaternion [x, y, z, w] d'une matrice de rotation 3×3. */
export function mat3ToQuaternion(m: Mat3): [number, number, number, number] {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = m;
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

/** Dimensions (x, y, z) d'une boîte de dimensions `size` après la rotation axiale `m`. */
export function rotatedExtents(m: Mat3, size: Vec3): [number, number, number] {
  const e = (row: number) =>
    Math.abs(m[row * 3]!) * size[0] +
    Math.abs(m[row * 3 + 1]!) * size[1] +
    Math.abs(m[row * 3 + 2]!) * size[2];
  return [e(0), e(1), e(2)];
}

export interface FlatOrientation {
  matrix: Mat3;
  quaternion: [number, number, number, number];
  /** Dimensions après rotation (x largeur, y hauteur, z profondeur). */
  extents: [number, number, number];
}

/**
 * Orientation « à plat » d'une boîte locale de dimensions `size` : hauteur minimale, puis plus
 * grande dimension horizontale selon X, puis rotation la plus proche de l'identité.
 */
export function chooseFlatOrientation(size: Vec3): FlatOrientation {
  const tol = 1e-6 + 1e-3 * Math.max(size[0], size[1], size[2]);
  let best: { m: Mat3; e: [number, number, number]; trace: number } | null = null;
  for (const m of AXIAL_ROTATIONS) {
    const e = rotatedExtents(m, size);
    const trace = m[0] + m[4] + m[8];
    if (!best) {
      best = { m, e, trace };
      continue;
    }
    const dh = e[1] - best.e[1];
    if (dh < -tol) best = { m, e, trace };
    else if (Math.abs(dh) <= tol) {
      const dx = e[0] - best.e[0];
      if (dx > tol || (Math.abs(dx) <= tol && trace > best.trace)) best = { m, e, trace };
    }
  }
  const chosen = best!;
  return { matrix: chosen.m, quaternion: mat3ToQuaternion(chosen.m), extents: chosen.e };
}

// --- Disposition -------------------------------------------------------------------------

const overlaps = (a: Rect, b: Rect, gap = 0): boolean =>
  a.minX < b.maxX + gap - EPS &&
  a.maxX > b.minX - gap + EPS &&
  a.minZ < b.maxZ + gap - EPS &&
  a.maxZ > b.minZ - gap + EPS;

const lerpRect = (a: Rect, b: Rect, s: number): Rect => ({
  minX: a.minX + (b.minX - a.minX) * s,
  maxX: a.maxX + (b.maxX - a.maxX) * s,
  minZ: a.minZ + (b.minZ - a.minZ) * s,
  maxZ: a.maxZ + (b.maxZ - a.maxZ) * s,
});

const intersectRect = (a: Rect, b: Rect): Rect => ({
  minX: Math.max(a.minX, b.minX),
  maxX: Math.min(a.maxX, b.maxX),
  minZ: Math.max(a.minZ, b.minZ),
  maxZ: Math.min(a.maxZ, b.maxZ),
});

interface Gaps {
  item: number;
  group: number;
  instance: number;
}

/** Grille des instances d'un élément pour une largeur disponible. */
function instanceGrid(
  item: KnollingItem,
  width: number,
  gaps: Gaps,
): { cols: number; rows: number; w: number; d: number } {
  const [w, , d] = item.size;
  const count = Math.max(1, item.count);
  if (item.layout === 'stack' || count === 1) return { cols: 1, rows: 1, w, d };
  const cols = Math.max(1, Math.min(count, Math.floor((width + gaps.instance + EPS) / (w + gaps.instance))));
  const rows = Math.ceil(count / cols);
  return { cols, rows, w: cols * w + (cols - 1) * gaps.instance, d: rows * d + (rows - 1) * gaps.instance };
}

function slotFor(
  item: KnollingItem,
  x: number,
  z: number,
  grid: ReturnType<typeof instanceGrid>,
  surfaceY: number,
  gaps: Gaps,
): KnollingSlot {
  const [w, h, d] = item.size;
  const count = Math.max(1, item.count);
  const instances: [number, number, number][] = [];
  for (let k = 0; k < count; k++) {
    if (item.layout === 'stack') instances.push([x + w / 2, surfaceY + h / 2 + k * h, z + d / 2]);
    else {
      const col = k % grid.cols;
      const row = Math.floor(k / grid.cols);
      instances.push([
        x + col * (w + gaps.instance) + w / 2,
        surfaceY + h / 2,
        z + row * (d + gaps.instance) + d / 2,
      ]);
    }
  }
  const footprint = { minX: x, maxX: x + grid.w, minZ: z, maxZ: z + grid.d };
  return {
    id: item.id,
    footprint,
    instances,
    labelPosition: [x + grid.w / 2, surfaceY + 0.0005, footprint.maxZ + 0.006],
    label: item.label,
  };
}

/**
 * Disposition en rangées dans `rect` ; retourne null si tout ne tient pas. `groupRows` : chaque
 * groupe commence une nouvelle rangée (sinon les groupes se suivent, séparés par l'écart de groupe).
 */
function placeRows(
  items: readonly KnollingItem[],
  rect: Rect,
  keepOut: readonly Rect[],
  surfaceY: number,
  gaps: Gaps,
  groupRows: boolean,
): KnollingSlot[] | null {
  const width = rect.maxX - rect.minX;
  const slots: KnollingSlot[] = [];
  let z = rect.minZ;
  let group: string | null = null;
  let rowX = rect.minX;
  let rowDepth = 0;
  for (const item of items) {
    if (group !== null && item.group !== group) {
      if (groupRows) {
        // Nouveau groupe : nouvelle rangée, écart de groupe.
        z += rowDepth + gaps.group;
        rowX = rect.minX;
        rowDepth = 0;
      } else {
        rowX += gaps.group - gaps.item;
      }
    }
    group = item.group;
    const grid = instanceGrid(item, width, gaps);
    if (grid.w > width + EPS) return null;
    let x = rowX;
    for (let guard = 0; ; guard++) {
      if (guard > 10_000) return null;
      if (z + grid.d > rect.maxZ + EPS) return null;
      const candidate: Rect = { minX: x, maxX: x + grid.w, minZ: z, maxZ: z + grid.d };
      const blocking = keepOut.find((k) => overlaps(candidate, k, gaps.item));
      if (blocking) {
        x = blocking.maxX + gaps.item;
      } else if (x + grid.w <= rect.maxX + EPS) {
        break;
      }
      if (x + grid.w > rect.maxX + EPS) {
        // Rangée pleine : on passe à la suivante.
        z += (rowDepth > 0 ? rowDepth : 0) + gaps.item;
        rowX = rect.minX;
        rowDepth = 0;
        x = rowX;
      }
    }
    slots.push(slotFor(item, x, z, grid, surfaceY, gaps));
    rowX = x + grid.w + gaps.item;
    rowDepth = Math.max(rowDepth, grid.d);
  }
  return slots;
}

const boundsOf = (slots: readonly KnollingSlot[]): Rect => {
  const r = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const s of slots) {
    r.minX = Math.min(r.minX, s.footprint.minX);
    r.maxX = Math.max(r.maxX, s.footprint.maxX);
    r.minZ = Math.min(r.minZ, s.footprint.minZ);
    r.maxZ = Math.max(r.maxZ, s.footprint.maxZ);
  }
  return slots.length ? r : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
};

function shiftSlots(slots: KnollingSlot[], dx: number, dz: number): void {
  for (const s of slots) {
    s.footprint = {
      minX: s.footprint.minX + dx,
      maxX: s.footprint.maxX + dx,
      minZ: s.footprint.minZ + dz,
      maxZ: s.footprint.maxZ + dz,
    };
    for (const p of s.instances) {
      p[0] += dx;
      p[2] += dz;
    }
    s.labelPosition[0] += dx;
    s.labelPosition[2] += dz;
  }
}

/** Étapes d'élargissement de la zone, du tapis (0) jusqu'au plateau entier (1). */
const EXPANSION = [0, 0.12, 0.25, 0.4, 0.6, 0.8, 1] as const;

/**
 * Calcule la disposition rangée de `items` (déjà triés par groupe puis par ordre souhaité).
 */
export function layoutKnolling(items: readonly KnollingItem[], region: KnollingRegion): KnollingLayout {
  const keepOut = region.keepOut ?? [];
  const preferred = intersectRect(region.preferred, region.limit);
  // Ordre des essais : rester au plus près du tapis ; à chaque élargissement, groupes en rangées
  // séparées puis groupes à la suite ; en dernier recours, espacements réduits.
  const attempts: { gaps: Gaps; s: number; groupRows: boolean }[] = [];
  for (const s of EXPANSION) {
    attempts.push({ gaps: KNOLLING_GAPS, s, groupRows: true });
    attempts.push({ gaps: KNOLLING_GAPS, s, groupRows: false });
  }
  const tight = {
    item: KNOLLING_GAPS.item / 2,
    group: KNOLLING_GAPS.group / 2,
    instance: KNOLLING_GAPS.instance / 2,
  };
  attempts.push({ gaps: tight, s: 1, groupRows: false });
  for (const { gaps, s, groupRows } of attempts) {
    const rect = lerpRect(preferred, region.limit, s);
    const slots = placeRows(items, rect, keepOut, region.surfaceY, gaps, groupRows);
    if (!slots) continue;
    if (region.center ?? keepOut.length === 0) {
      // Centrage du bloc sur le tapis, sans sortir de la zone utilisée.
      const b = boundsOf(slots);
      let dx = (preferred.minX + preferred.maxX) / 2 - (b.minX + b.maxX) / 2;
      let dz = (preferred.minZ + preferred.maxZ) / 2 - (b.minZ + b.maxZ) / 2;
      dx = Math.min(Math.max(dx, rect.minX - b.minX), rect.maxX - b.maxX);
      dz = Math.min(Math.max(dz, rect.minZ - b.minZ), rect.maxZ - b.maxZ);
      shiftSlots(slots, dx, dz);
    }
    return { slots: new Map(slots.map((sl) => [sl.id, sl] as const)), fits: true, bounds: boundsOf(slots) };
  }
  // Impossible sans chevauchement : empilement en colonne bornée au plateau (signalé par fits=false).
  const slots: KnollingSlot[] = [];
  const limit = region.limit;
  let x = limit.minX;
  let z = limit.minZ;
  for (const item of items) {
    const grid = instanceGrid(item, limit.maxX - limit.minX, KNOLLING_GAPS);
    if (x + grid.w > limit.maxX) {
      x = limit.minX;
      z += KNOLLING_GAPS.item;
    }
    const cx = Math.min(x, limit.maxX - grid.w);
    const cz = Math.min(z, limit.maxZ - grid.d);
    slots.push(
      slotFor(item, Math.max(limit.minX, cx), Math.max(limit.minZ, cz), grid, region.surfaceY, KNOLLING_GAPS),
    );
    x += grid.w + KNOLLING_GAPS.item;
  }
  return { slots: new Map(slots.map((sl) => [sl.id, sl] as const)), fits: false, bounds: boundsOf(slots) };
}

/** Vrai si deux emplacements se chevauchent (tests, diagnostics). */
export const slotsOverlap = (a: KnollingSlot, b: KnollingSlot): boolean => overlaps(a.footprint, b.footprint);

// --- Transitions -------------------------------------------------------------------------

/** Durée totale de l'entrée/sortie de la vue rangée (s) et durée du trajet d'une pièce. */
export const KNOLLING_TRANSITION = { total: 1.2, travel: 0.7 } as const;

/**
 * Poids (0..1, non easé) de la pièce de rang `index` parmi `count`, `elapsed` secondes après le
 * début de la transition : les départs sont répartis sur `total − travel`.
 */
export function knollingWeight(elapsed: number, index: number, count: number): number {
  const spreadTime = KNOLLING_TRANSITION.total - KNOLLING_TRANSITION.travel;
  const delay = count > 1 ? (index / (count - 1)) * spreadTime : 0;
  const u = (elapsed - delay) / KNOLLING_TRANSITION.travel;
  return u <= 0 ? 0 : u >= 1 ? 1 : u;
}
