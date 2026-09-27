/**
 * Carte d'occupation 2D (vue de dessus) des volumes de collision et calcul des passages libres.
 *
 * Principe : chaque collider dont la hauteur recoupe le corps du joueur est projeté au sol et
 * rastérisé sur une grille (1 cm par défaut) ; une transformée en distance EXACTE (Felzenszwalb
 * et Huttenlocher) donne, pour chaque cellule libre, la distance au plus proche obstacle. Un
 * disque de diamètre `w` peut passer par une cellule si cette distance est ≥ w / 2 : la largeur
 * d'un passage entre deux points est donc le double du « goulet » du chemin le plus large.
 *
 * Module PUR (tests Vitest, outils de debug) : aucune dépendance à three.js ni à Rapier.
 */
import type { StaticColliderSpec } from '../../core/Physics';
import { BENCH, ROOM } from '../layout';

/** Emprise au sol d'un volume (repère monde). */
export type Footprint =
  | { kind: 'box'; name: string; cx: number; cz: number; hx: number; hz: number; rotationY: number }
  | { kind: 'circle'; name: string; cx: number; cz: number; radius: number };

/** Tranche de hauteur occupée par le joueur (du bas des chevilles au sommet du crâne). */
export const PLAYER_BODY_SPAN: readonly [number, number] = [0.03, 1.9];

/**
 * Emprise au sol d'un collider, ou `null` s'il ne gêne pas le passage (entièrement au-dessus
 * ou au-dessous de la tranche `span`).
 */
export function footprintOf(
  spec: StaticColliderSpec,
  span: readonly [number, number] = PLAYER_BODY_SPAN,
): Footprint | null {
  const name = spec.name ?? spec.kind;
  const [cx, cy, cz] = spec.center;
  if (spec.kind === 'box') {
    const [hx, hy, hz] = spec.halfExtents;
    if (cy + hy < span[0] || cy - hy > span[1]) return null;
    return { kind: 'box', name, cx, cz, hx, hz, rotationY: spec.rotationY ?? 0 };
  }
  const halfHeight = spec.halfHeight + (spec.kind === 'capsule' ? spec.radius : 0);
  if (cy + halfHeight < span[0] || cy - halfHeight > span[1]) return null;
  return { kind: 'circle', name, cx, cz, radius: spec.radius };
}

/**
 * Emprises fixes de la salle, reconstruites depuis le plan (`layout.ts`) : l'établi (le seul
 * meuble posé par la salle). Les murs sont les bords de la grille.
 */
export function roomFootprints(): Footprint[] {
  return [
    {
      kind: 'box',
      name: 'établi',
      cx: (BENCH.x[0] + BENCH.x[1]) / 2,
      cz: (BENCH.z[0] + BENCH.z[1]) / 2,
      hx: (BENCH.x[1] - BENCH.x[0]) / 2,
      hz: (BENCH.z[1] - BENCH.z[0]) / 2,
      rotationY: 0,
    },
  ];
}

/** Point du plan (x, z). */
export interface Point2 {
  x: number;
  z: number;
}

export class OccupancyGrid {
  readonly cols: number;
  readonly rows: number;
  /** 1 = occupé. */
  readonly occupied: Uint8Array;
  private distance: Float32Array | null = null;

  /**
   * @param bounds rectangle couvert (intérieur de la pièce) ; tout ce qui est hors du rectangle
   *   est considéré comme mur
   * @param cell taille d'une cellule (m)
   */
  constructor(
    readonly bounds: { x: readonly [number, number]; z: readonly [number, number] } = {
      x: [ROOM.minX, ROOM.maxX],
      z: [ROOM.minZ, ROOM.maxZ],
    },
    readonly cell = 0.01,
  ) {
    this.cols = Math.round((bounds.x[1] - bounds.x[0]) / cell);
    this.rows = Math.round((bounds.z[1] - bounds.z[0]) / cell);
    this.occupied = new Uint8Array(this.cols * this.rows);
  }

  /** Centre de la cellule (i, j). */
  cellCenter(i: number, j: number): Point2 {
    return { x: this.bounds.x[0] + (i + 0.5) * this.cell, z: this.bounds.z[0] + (j + 0.5) * this.cell };
  }

  /** Cellule contenant un point (bornée à la grille). */
  cellOf(p: Point2): { i: number; j: number } {
    const i = Math.floor((p.x - this.bounds.x[0]) / this.cell);
    const j = Math.floor((p.z - this.bounds.z[0]) / this.cell);
    return { i: Math.min(this.cols - 1, Math.max(0, i)), j: Math.min(this.rows - 1, Math.max(0, j)) };
  }

  /** Marque les cellules dont le centre est dans l'emprise. */
  rasterize(footprints: readonly Footprint[]): void {
    for (const f of footprints) {
      for (let j = 0; j < this.rows; j++) {
        for (let i = 0; i < this.cols; i++) {
          const c = this.cellCenter(i, j);
          if (contains(f, c.x, c.z)) this.occupied[j * this.cols + i] = 1;
        }
      }
    }
    this.distance = null;
  }

  /**
   * Distance (m) de chaque cellule au plus proche obstacle ou mur (0 pour une cellule occupée).
   * Les murs sont à la frontière du rectangle : la distance au mur d'une cellule est celle de son
   * centre au bord.
   */
  distanceField(): Float32Array {
    if (this.distance) return this.distance;
    const { cols, rows, cell } = this;
    // Grille bordée d'une rangée de cellules « mur » (demi-cellule hors du bord réel).
    const w = cols + 2;
    const h = rows + 2;
    const INF = 1e20;
    const f = new Float64Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const border = i === 0 || j === 0 || i === w - 1 || j === h - 1;
        f[j * w + i] = border || this.occupied[(j - 1) * cols + (i - 1)] ? 0 : INF;
      }
    }
    // Transformée exacte séparable : colonnes puis rangées (distances au carré, en cellules).
    const column = new Float64Array(h);
    const outColumn = new Float64Array(h);
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) column[j] = f[j * w + i]!;
      edt1d(column, outColumn, h);
      for (let j = 0; j < h; j++) f[j * w + i] = outColumn[j]!;
    }
    const row = new Float64Array(w);
    const outRow = new Float64Array(w);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) row[i] = f[j * w + i]!;
      edt1d(row, outRow, w);
      for (let i = 0; i < w; i++) f[j * w + i] = outRow[i]!;
    }
    const out = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        // Distance centre → centre de la cellule obstacle, moins une demi-cellule (bord de l'obstacle).
        const d = Math.sqrt(f[(j + 1) * w + (i + 1)]!) * cell;
        out[j * cols + i] = this.occupied[j * cols + i] ? 0 : Math.max(0, d - cell / 2);
      }
    }
    this.distance = out;
    return out;
  }

  /** Dégagement (distance au plus proche obstacle) au point `p`. */
  clearanceAt(p: Point2): number {
    const { i, j } = this.cellOf(p);
    return this.distanceField()[j * this.cols + i]!;
  }

  /** Cellules atteignables depuis `from` en gardant un dégagement ≥ `radius` (4-connexité). */
  reachable(from: Point2, radius: number): Uint8Array {
    const dist = this.distanceField();
    const seen = new Uint8Array(this.cols * this.rows);
    const start = this.cellOf(from);
    const s = start.j * this.cols + start.i;
    if (dist[s]! < radius) return seen;
    const queue = new Int32Array(this.cols * this.rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    seen[s] = 1;
    while (head < tail) {
      const k = queue[head++]!;
      const i = k % this.cols;
      const j = (k - i) / this.cols;
      const next = [
        i > 0 ? k - 1 : -1,
        i < this.cols - 1 ? k + 1 : -1,
        j > 0 ? k - this.cols : -1,
        j < this.rows - 1 ? k + this.cols : -1,
      ];
      for (const n of next) {
        if (n < 0 || seen[n] || dist[n]! < radius) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    return seen;
  }

  /** Vrai si une cellule d'une zone rectangulaire est marquée dans `mask`. */
  anyIn(mask: Uint8Array, zone: { x: readonly [number, number]; z: readonly [number, number] }): boolean {
    const a = this.cellOf({ x: zone.x[0], z: zone.z[0] });
    const b = this.cellOf({ x: zone.x[1], z: zone.z[1] });
    for (let j = a.j; j <= b.j; j++) for (let i = a.i; i <= b.i; i++) if (mask[j * this.cols + i]) return true;
    return false;
  }

  /**
   * Largeur du passage le plus large (m) reliant `from` à une zone : 2 × le plus grand rayon
   * pour lequel la zone reste atteignable (recherche dichotomique, précision `tolerance`).
   */
  passageWidth(
    from: Point2,
    zone: { x: readonly [number, number]; z: readonly [number, number] },
    tolerance = 0.005,
  ): number {
    let lo = 0;
    let hi = Math.min(this.bounds.x[1] - this.bounds.x[0], this.bounds.z[1] - this.bounds.z[0]) / 2;
    if (!this.anyIn(this.reachable(from, lo), zone)) return 0;
    while (hi - lo > tolerance) {
      const mid = (lo + hi) / 2;
      if (this.anyIn(this.reachable(from, mid), zone)) lo = mid;
      else hi = mid;
    }
    return 2 * lo;
  }
}

/** Vrai si le point (x, z) est dans l'emprise. */
export function contains(f: Footprint, x: number, z: number): boolean {
  const dx = x - f.cx;
  const dz = z - f.cz;
  if (f.kind === 'circle') return dx * dx + dz * dz <= f.radius * f.radius;
  // Rotation autour de Y (convention three.js : x' = x cos + z sin, z' = −x sin + z cos).
  const c = Math.cos(f.rotationY);
  const s = Math.sin(f.rotationY);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= f.hx && Math.abs(lz) <= f.hz;
}

/**
 * Transformée en distance 1D au carré (enveloppe inférieure de paraboles, Felzenszwalb &
 * Huttenlocher 2012). `f` : 0 sur les obstacles, très grand ailleurs.
 */
function edt1d(f: Float64Array, d: Float64Array, n: number): void {
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dq = q - v[k]!;
    d[q] = dq * dq + f[v[k]!]!;
  }
}
