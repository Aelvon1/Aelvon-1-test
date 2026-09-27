/**
 * Routeur de circuit imprimé sur grille (2 couches), module PUR (sans three.js).
 *
 * Principe (routage « labyrinthe » de Lee, recherche A*) :
 * - la carte est discrétisée en cellules de `pitch` mm sur deux couches (0 = dessus, 1 = dessous) ;
 * - chaque élément de cuivre marque autour de lui une zone « dure » (court-circuit si une piste
 *   y passait) et une zone « d'isolement » (clearance) réservée à son réseau ;
 * - une piste avance en 8 directions (0°, 45°, 90°…) avec pénalité de changement de direction,
 *   et change de couche par un via (coût élevé) là où le disque du via est libre sur les deux faces ;
 * - les réseaux à plusieurs broches sont reliés en arbre : chaque nouvelle broche est reliée à la
 *   partie déjà routée du réseau (broche la plus proche d'abord) ;
 * - près des broches, une petite zone de tolérance ignore l'isolement (pas la zone dure) pour
 *   permettre le dégagement des boîtiers à pas fin.
 *
 * Approximation : distances évaluées au centre des cellules (précision ± pitch/2) ; heuristique
 * A* légèrement pondérée (recherche plus rapide, chemins quasi optimaux). On vise un routage
 * plausible et sans court-circuit, pas un routage industriel optimisé.
 */

export type Layer = 0 | 1;

/** Forme de cuivre / d'obstacle (mm, repère carte). */
export type Shape =
  | { kind: 'circle'; x: number; y: number; r: number }
  | {
      /** Rectangle tourné : demi-dimensions et cosinus/sinus de la rotation. */
      kind: 'rect';
      x: number;
      y: number;
      hw: number;
      hh: number;
      cos: number;
      sin: number;
    }
  | { kind: 'segment'; x0: number; y0: number; x1: number; y1: number; r: number };

export function pointSegmentDistance(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - x0) * vx + (py - y0) * vy) / len2)) : 0;
  return Math.hypot(px - (x0 + t * vx), py - (y0 + t * vy));
}

/** Distance d'un point à une forme (0 à l'intérieur). */
export function shapeDistance(s: Shape, px: number, py: number): number {
  switch (s.kind) {
    case 'circle':
      return Math.max(0, Math.hypot(px - s.x, py - s.y) - s.r);
    case 'rect': {
      const dx = px - s.x;
      const dy = py - s.y;
      const lx = Math.abs(dx * s.cos + dy * s.sin) - s.hw;
      const ly = Math.abs(-dx * s.sin + dy * s.cos) - s.hh;
      return Math.hypot(Math.max(lx, 0), Math.max(ly, 0));
    }
    case 'segment':
      return Math.max(0, pointSegmentDistance(px, py, s.x0, s.y0, s.x1, s.y1) - s.r);
  }
}

/** Boîte englobante d'une forme (mm). */
function shapeBounds(s: Shape): [number, number, number, number] {
  switch (s.kind) {
    case 'circle':
      return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
    case 'rect': {
      const ex = Math.abs(s.hw * s.cos) + Math.abs(s.hh * s.sin);
      const ey = Math.abs(s.hw * s.sin) + Math.abs(s.hh * s.cos);
      return [s.x - ex, s.y - ey, s.x + ex, s.y + ey];
    }
    case 'segment':
      return [
        Math.min(s.x0, s.x1) - s.r,
        Math.min(s.y0, s.y1) - s.r,
        Math.max(s.x0, s.x1) + s.r,
        Math.max(s.y0, s.y1) + s.r,
      ];
  }
}

export interface RouterConfig {
  /** Dimensions de la zone routable (mm). */
  width: number;
  height: number;
  /** Pas de la grille (mm). */
  pitch: number;
  /** Isolement minimal entre cuivres de réseaux différents (mm). */
  clearance: number;
  /** Largeur de piste de référence (mm). */
  traceWidth: number;
  /** Diamètre de la pastille des vias (mm). */
  viaDiameter: number;
  /** Coût d'un via (mm équivalents). */
  viaCost: number;
  /** Pénalité par changement de direction de 45° (mm équivalents). */
  turnCost: number;
  /** Rayon de tolérance autour des broches (mm). */
  leniency: number;
  /** Pondération de l'heuristique (1 = A* exact). */
  heuristicWeight: number;
  /** Plafond d'expansions par recherche. */
  maxExpansions: number;
}

export interface Terminal {
  /** Point de raccordement (mm). */
  x: number;
  y: number;
  /** Couches où la broche est accessible. */
  layers: readonly Layer[];
  /** Zone de la broche (cellules de départ / d'arrivée). */
  region: Shape;
}

export interface RoutedSegment {
  layer: Layer;
  /** Polyligne [x0, y0, x1, y1, …] (mm). */
  points: number[];
}

export interface RouteResult {
  net: string;
  width: number;
  segments: RoutedSegment[];
  vias: { x: number; y: number }[];
  /** Nombre de broches qui n'ont pas pu être reliées. */
  failed: number;
  /** Points des broches non reliées (diagnostic). */
  unrouted: { x: number; y: number }[];
}

const FREE = -1;
const CONFLICT = -2;
const BLOCKED = -3;

/** Directions : 0 = +X, puis sens trigonométrique par pas de 45°. */
const DX = [1, 1, 0, -1, -1, -1, 0, 1] as const;
const DY = [0, 1, 1, 1, 0, -1, -1, -1] as const;
const NO_DIR = 8;
const STATES_PER_CELL = 9;

/** Tas binaire minimal (clés flottantes) sur des indices d'état entiers. */
class MinHeap {
  private keys = new Float64Array(4096);
  private vals = new Int32Array(4096);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2);
      k.set(this.keys);
      this.keys = k;
      const v = new Int32Array(this.size * 2);
      v.set(this.vals);
      this.vals = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p]! <= key) break;
      this.keys[i] = this.keys[p]!;
      this.vals[i] = this.vals[p]!;
      i = p;
    }
    this.keys[i] = key;
    this.vals[i] = val;
  }

  pop(): number {
    const top = this.vals[0]!;
    const lastKey = this.keys[--this.size]!;
    const lastVal = this.vals[this.size]!;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= this.size) break;
      const r = l + 1;
      const c = r < this.size && this.keys[r]! < this.keys[l]! ? r : l;
      if (this.keys[c]! >= lastKey) break;
      this.keys[i] = this.keys[c]!;
      this.vals[i] = this.vals[c]!;
      i = c;
    }
    this.keys[i] = lastKey;
    this.vals[i] = lastVal;
    return top;
  }
}

export class GridRouter {
  readonly nx: number;
  readonly ny: number;
  readonly pitch: number;
  /** Zone d'isolement : réseau propriétaire (≥ 0), libre, conflit ou bloqué. */
  private readonly soft: [Int32Array, Int32Array];
  /** Zone dure : cuivre effectif (une piste de référence y ferait court-circuit). */
  private readonly hard: [Int32Array, Int32Array];
  private readonly nets = new Map<string, number>();
  private readonly cfg: RouterConfig;
  private readonly softRadius: number;
  private readonly hardRadius: number;
  // Tampons de recherche réutilisés (estampillés par numéro de recherche).
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly stamp: Int32Array;
  private readonly closed: Int32Array;
  private readonly goal: Int32Array;
  private readonly lenient: Int32Array;
  private readonly tree: Uint8Array;
  private searchId = 0;
  private readonly heap = new MinHeap();
  /** Zones réservées (face supérieure) : index de réservation par cellule, −1 = aucune. */
  private readonly reserved: Int32Array;
  private readonly reservations: Set<number>[] = [];

  constructor(cfg: RouterConfig) {
    this.cfg = cfg;
    this.pitch = cfg.pitch;
    this.nx = Math.ceil(cfg.width / cfg.pitch) + 1;
    this.ny = Math.ceil(cfg.height / cfg.pitch) + 1;
    const n = this.nx * this.ny;
    this.soft = [new Int32Array(n).fill(FREE), new Int32Array(n).fill(FREE)];
    this.hard = [new Int32Array(n).fill(FREE), new Int32Array(n).fill(FREE)];
    this.softRadius = cfg.clearance + cfg.traceWidth / 2;
    this.hardRadius = cfg.traceWidth / 2 + 0.06;
    const states = n * 2 * STATES_PER_CELL;
    this.g = new Float32Array(states);
    this.parent = new Int32Array(states);
    this.stamp = new Int32Array(states);
    this.closed = new Int32Array(states);
    this.goal = new Int32Array(n * 2);
    this.lenient = new Int32Array(n);
    this.tree = new Uint8Array(n * 2);
    this.reserved = new Int32Array(n).fill(-1);
  }

  /**
   * Réserve une zone de la face supérieure aux seuls réseaux donnés (ex. couronne de dégagement
   * autour d'un QFN : les autres réseaux ne peuvent pas y enfermer les amorces).
   */
  reserve(shape: Shape, nets: readonly string[]): void {
    const id = this.reservations.length;
    this.reservations.push(new Set(nets.map((name) => this.netIndex(name))));
    this.forCells(shape, 0, (c) => {
      if (this.reserved[c]! < 0) this.reserved[c] = id;
    });
  }

  private saved: {
    soft: [Int32Array, Int32Array];
    hard: [Int32Array, Int32Array];
    nets: [string, number][];
  } | null = null;

  /** Mémorise l'état de la grille (ex. contour + pastilles) pour y revenir sans tout recalculer. */
  snapshot(): void {
    this.saved = {
      soft: [this.soft[0].slice(), this.soft[1].slice()],
      hard: [this.hard[0].slice(), this.hard[1].slice()],
      nets: [...this.nets],
    };
  }

  /** Revient à l'état mémorisé par `snapshot()` (tampons de recherche conservés). */
  restore(): void {
    if (!this.saved) throw new Error('GridRouter.restore() sans snapshot().');
    for (const l of [0, 1] as const) {
      this.soft[l].set(this.saved.soft[l]);
      this.hard[l].set(this.saved.hard[l]);
    }
    this.nets.clear();
    for (const [k, v] of this.saved.nets) this.nets.set(k, v);
  }

  netIndex(name: string): number {
    let i = this.nets.get(name);
    if (i === undefined) {
      i = this.nets.size;
      this.nets.set(name, i);
    }
    return i;
  }

  /** Parcourt les cellules dont le centre est à moins de `margin` de la forme. */
  private forCells(shape: Shape, margin: number, fn: (c: number, d: number) => void): void {
    const [x0, y0, x1, y1] = shapeBounds(shape);
    const i0 = Math.max(0, Math.floor((x0 - margin) / this.pitch));
    const j0 = Math.max(0, Math.floor((y0 - margin) / this.pitch));
    const i1 = Math.min(this.nx - 1, Math.ceil((x1 + margin) / this.pitch));
    const j1 = Math.min(this.ny - 1, Math.ceil((y1 + margin) / this.pitch));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = shapeDistance(shape, i * this.pitch, j * this.pitch);
        if (d <= margin) fn(j * this.nx + i, d);
      }
    }
  }

  /** Interdit une zone (trou de fixation…) sur les couches données. */
  block(shape: Shape, margin: number, layers: readonly Layer[] = [0, 1]): void {
    for (const l of layers) {
      this.forCells(shape, margin, (c) => {
        this.soft[l][c] = BLOCKED;
        this.hard[l][c] = BLOCKED;
      });
    }
  }

  /** Interdit toute cellule hors du polygone (contour de carte) ou à moins de `margin` du bord. */
  blockOutside(polygon: readonly (readonly [number, number])[], margin: number): void {
    for (let j = 0; j < this.ny; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = i * this.pitch;
        const y = j * this.pitch;
        if (!pointInPolygon(x, y, polygon) || distanceToPolygon(x, y, polygon) < margin) {
          const c = j * this.nx + i;
          this.soft[0][c] = this.soft[1][c] = BLOCKED;
          this.hard[0][c] = this.hard[1][c] = BLOCKED;
        }
      }
    }
  }

  /** Déclare un élément de cuivre d'un réseau (pastille, piste, via) sur des couches. */
  addCopper(net: string, shape: Shape, layers: readonly Layer[]): void {
    const n = this.netIndex(net);
    for (const l of layers) {
      const soft = this.soft[l];
      const hard = this.hard[l];
      this.forCells(shape, this.softRadius, (c, d) => {
        if (soft[c] === BLOCKED) return;
        if (d <= this.hardRadius) {
          const h = hard[c]!;
          hard[c] = h === FREE || h === n ? n : CONFLICT;
        }
        const s = soft[c]!;
        soft[c] = s === FREE || s === n ? n : CONFLICT;
      });
    }
  }

  private cellOf(x: number, y: number): number {
    const i = Math.min(this.nx - 1, Math.max(0, Math.round(x / this.pitch)));
    const j = Math.min(this.ny - 1, Math.max(0, Math.round(y / this.pitch)));
    return j * this.nx + i;
  }

  /** Cellules d'une broche (au moins la plus proche de son point). */
  private terminalCells(t: Terminal): number[] {
    const cells: number[] = [];
    this.forCells(t.region, this.pitch * 0.5, (c) => cells.push(c));
    const nearest = this.cellOf(t.x, t.y);
    if (!cells.includes(nearest)) cells.push(nearest);
    return cells;
  }

  /**
   * Relie les broches d'un réseau. Les pistes réussies sont enregistrées comme cuivre (obstacles
   * pour les réseaux suivants).
   */
  route(netName: string, width: number, terminals: readonly Terminal[]): RouteResult {
    const net = this.netIndex(netName);
    const result: RouteResult = { net: netName, width, segments: [], vias: [], failed: 0, unrouted: [] };
    if (terminals.length < 2) return result;
    const n = this.nx * this.ny;
    this.tree.fill(0);
    const extra = Math.max(0, (width - this.cfg.traceWidth) / 2);
    // Pistes larges : disque de cellules à vérifier autour de l'axe (arrondi au plus près).
    const disk = diskOffsets(extra / this.pitch, this.nx);
    const viaDisk = diskOffsets(
      Math.max(0, this.cfg.viaDiameter / 2 - this.cfg.traceWidth / 2) / this.pitch,
      this.nx,
    );

    const connected = [terminals[0]!];
    const pending = terminals.slice(1);
    const addTree = (t: Terminal) => {
      for (const c of this.terminalCells(t)) for (const l of t.layers) this.tree[l * n + c] = 1;
    };
    addTree(terminals[0]!);

    while (pending.length) {
      let best = 0;
      let bestD = Infinity;
      pending.forEach((p, k) => {
        for (const q of connected) {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
      });
      const target = pending.splice(best, 1)[0]!;
      const path = this.search(net, target, disk, viaDisk, [...connected, target]);
      if (!path) {
        result.failed++;
        result.unrouted.push({ x: target.x, y: target.y });
        continue;
      }
      connected.push(target);
      addTree(target);
      this.commitPath(netName, width, path, target, result);
    }
    return result;
  }

  /** Recherche A* depuis l'arbre du réseau vers la broche `target`. */
  private search(
    net: number,
    target: Terminal,
    disk: readonly number[],
    viaDisk: readonly number[],
    lenientPoints: readonly Terminal[],
  ): { cell: number; layer: Layer }[] | null {
    const n = this.nx * this.ny;
    const nx = this.nx;
    const ny = this.ny;
    const pitch = this.pitch;
    const id = ++this.searchId;
    const heap = this.heap;
    const { g, parent, stamp, closed, goal, lenient, tree, reserved, reservations } = this;
    const reservedFor = (c: number): boolean => {
      const rv = reserved[c]!;
      return rv >= 0 && !reservations[rv]!.has(net);
    };
    heap.clear();
    for (const c of this.terminalCells(target)) for (const l of target.layers) goal[l * n + c] = id;
    for (const p of lenientPoints)
      this.forCells({ kind: 'circle', x: p.x, y: p.y, r: 0 }, this.cfg.leniency, (c) => (lenient[c] = id));
    const tx = target.x / pitch;
    const ty = target.y / pitch;
    const w = this.cfg.heuristicWeight * pitch;
    const heuristic = (i: number, j: number): number => {
      const dx = Math.abs(i - tx);
      const dy = Math.abs(j - ty);
      return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * w;
    };
    const hardArr = this.hard;
    const softArr = this.soft;
    const allowedDisk = (c: number, l: Layer, isLenient: boolean, offsets: readonly number[]): boolean => {
      const hard = hardArr[l];
      const soft = softArr[l];
      for (let k = 0; k < offsets.length; k++) {
        const q = c + offsets[k]!;
        if (q < 0 || q >= n) return false;
        const h = hard[q]!;
        if (h !== FREE && h !== net) return false;
        if (!isLenient) {
          const s = soft[q]!;
          if (s !== FREE && s !== net) return false;
        }
      }
      return true;
    };
    const single = disk.length === 1;

    for (let lc = 0; lc < 2 * n; lc++) {
      if (!tree[lc]) continue;
      const c = lc % n;
      const s = lc * STATES_PER_CELL + NO_DIR;
      stamp[s] = id;
      g[s] = 0;
      parent[s] = -1;
      heap.push(heuristic(c % nx, (c / nx) | 0), s);
    }

    let expansions = 0;
    const turnCost = this.cfg.turnCost;
    while (heap.size) {
      const s = heap.pop();
      if (closed[s] === id) continue;
      closed[s] = id;
      if (++expansions > this.cfg.maxExpansions) return null;
      const dir = s % STATES_PER_CELL;
      const lc = (s - dir) / STATES_PER_CELL;
      if (goal[lc] === id) return this.reconstruct(s, n);
      const l = (lc >= n ? 1 : 0) as Layer;
      const c = lc - l * n;
      const i = c % nx;
      const j = (c / nx) | 0;
      const g0 = g[s]!;
      const hard = hardArr[l];
      const soft = softArr[l];
      for (let d = 0; d < 8; d++) {
        let turn = 0;
        if (dir !== NO_DIR) {
          const delta = Math.min((d - dir + 8) % 8, (dir - d + 8) % 8);
          if (delta >= 3) continue; // ni demi-tour ni coude aigu
          turn = delta;
        }
        const ni = i + DX[d];
        const nj = j + DY[d];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nc = nj * nx + ni;
        if (l === 0 && reservedFor(nc)) continue;
        const isLenient = lenient[nc] === id;
        if (single) {
          const h = hard[nc]!;
          if (h !== FREE && h !== net) continue;
          if (!isLenient) {
            const sv = soft[nc]!;
            if (sv !== FREE && sv !== net) continue;
          }
        } else if (!allowedDisk(nc, l, isLenient, disk)) continue;
        // Diagonale : ne pas « couper » entre deux cellules interdites.
        if (d % 2 === 1 && !isLenient) {
          const a = soft[j * nx + ni]!;
          const b = soft[nj * nx + i]!;
          if (a !== FREE && a !== net && b !== FREE && b !== net) continue;
        }
        const ns = (l * n + nc) * STATES_PER_CELL + d;
        const ng = g0 + (d % 2 === 1 ? Math.SQRT2 : 1) * pitch + turn * turnCost;
        if (stamp[ns] === id && g[ns]! <= ng) continue;
        stamp[ns] = id;
        g[ns] = ng;
        parent[ns] = s;
        heap.push(ng + heuristic(ni, nj), ns);
      }
      // Changement de couche (via), hors zones de tolérance.
      if (lenient[c] !== id && !reservedFor(c)) {
        const ol = (1 - l) as Layer;
        if (allowedDisk(c, l, false, viaDisk) && allowedDisk(c, ol, false, viaDisk)) {
          const ns = (ol * n + c) * STATES_PER_CELL + NO_DIR;
          const ng = g0 + this.cfg.viaCost;
          if (!(stamp[ns] === id && g[ns]! <= ng)) {
            stamp[ns] = id;
            g[ns] = ng;
            parent[ns] = s;
            heap.push(ng + heuristic(i, j), ns);
          }
        }
      }
    }
    return null;
  }

  private reconstruct(s: number, n: number): { cell: number; layer: Layer }[] {
    const out: { cell: number; layer: Layer }[] = [];
    for (let k = s; k >= 0; k = this.parent[k]!) {
      const lc = Math.floor(k / STATES_PER_CELL);
      const layer = (lc >= n ? 1 : 0) as Layer;
      out.push({ cell: lc - layer * n, layer });
    }
    return out.reverse();
  }

  /** Convertit un chemin en polylignes et vias, puis l'enregistre comme cuivre. */
  private commitPath(
    netName: string,
    width: number,
    path: { cell: number; layer: Layer }[],
    target: Terminal,
    result: RouteResult,
  ): void {
    const n = this.nx * this.ny;
    const runs: { layer: Layer; pts: { x: number; y: number }[] }[] = [];
    for (const p of path) {
      const x = (p.cell % this.nx) * this.pitch;
      const y = Math.floor(p.cell / this.nx) * this.pitch;
      const last = runs[runs.length - 1];
      if (last && last.layer === p.layer) last.pts.push({ x, y });
      else {
        if (last) {
          const v = last.pts[last.pts.length - 1]!;
          result.vias.push({ x: v.x, y: v.y });
          this.addCopper(netName, { kind: 'circle', x: v.x, y: v.y, r: this.cfg.viaDiameter / 2 }, [0, 1]);
        }
        runs.push({ layer: p.layer, pts: [{ x, y }] });
      }
      this.tree[p.layer * n + p.cell] = 1;
    }
    // Raccord exact au point de la broche d'arrivée.
    runs[runs.length - 1]!.pts.push({ x: target.x, y: target.y });
    for (const run of runs) {
      const simple = simplify(run.pts);
      if (simple.length < 2) continue;
      const flat: number[] = [];
      for (const p of simple) flat.push(p.x, p.y);
      result.segments.push({ layer: run.layer, points: flat });
      for (let k = 0; k + 1 < simple.length; k++) {
        const a = simple[k]!;
        const b = simple[k + 1]!;
        this.addCopper(netName, { kind: 'segment', x0: a.x, y0: a.y, x1: b.x, y1: b.y, r: width / 2 }, [
          run.layer,
        ]);
      }
    }
  }

  /** Enregistre comme cuivre un résultat de routage obtenu auparavant (après `restore()`). */
  applyResult(result: RouteResult): void {
    for (const seg of result.segments) {
      const pts = seg.points;
      for (let k = 0; k + 3 < pts.length; k += 2) {
        this.addCopper(
          result.net,
          {
            kind: 'segment',
            x0: pts[k]!,
            y0: pts[k + 1]!,
            x1: pts[k + 2]!,
            y1: pts[k + 3]!,
            r: result.width / 2,
          },
          [seg.layer],
        );
      }
    }
    for (const v of result.vias)
      this.addCopper(result.net, { kind: 'circle', x: v.x, y: v.y, r: this.cfg.viaDiameter / 2 }, [0, 1]);
  }

  /** Le disque d'un via est-il libre (ou déjà au réseau) sur les deux couches ? */
  viaFree(netName: string, x: number, y: number): boolean {
    const net = this.netIndex(netName);
    const r = Math.max(this.pitch * 0.5, this.cfg.viaDiameter / 2 - this.cfg.traceWidth / 2);
    let ok = true;
    for (const l of [0, 1] as const) {
      const soft = this.soft[l];
      const hard = this.hard[l];
      this.forCells({ kind: 'circle', x, y, r: 0 }, r, (c) => {
        if (hard[c] !== FREE && hard[c] !== net) ok = false;
        if (soft[c] !== FREE && soft[c] !== net) ok = false;
      });
    }
    return ok;
  }

  /** Le segment (piste de largeur `width`) est-il libre sur la couche ? */
  segmentFree(
    netName: string,
    layer: Layer,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
  ): boolean {
    const net = this.netIndex(netName);
    let ok = true;
    const soft = this.soft[layer];
    const hard = this.hard[layer];
    // Les cellules testées couvrent la ligne (¾ de pas) plus l'excès de largeur sur la référence.
    const margin = Math.max(
      this.pitch * 0.75,
      width / 2 + this.cfg.clearance - this.softRadius + this.pitch * 0.75,
    );
    this.forCells({ kind: 'segment', x0, y0, x1, y1, r: 0 }, margin, (c) => {
      if (soft[c] !== FREE && soft[c] !== net) ok = false;
      if (hard[c] !== FREE && hard[c] !== net) ok = false;
    });
    return ok;
  }
}

/** Décalages (indices de cellule) d'un disque de rayon r cellules. */
function diskOffsets(r: number, nx: number): number[] {
  const out: number[] = [];
  const R = Math.ceil(r);
  for (let dj = -R; dj <= R; dj++)
    for (let di = -R; di <= R; di++) if (di * di + dj * dj <= r * r + 1e-9) out.push(dj * nx + di);
  if (out.length === 0) out.push(0);
  return out;
}

/** Supprime les points confondus ou alignés d'une polyligne. */
export function simplify(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < 1e-6) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
      if (Math.abs(cross) < 1e-6 && dot > 0) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/** Point dans un polygone (règle pair-impair). */
export function pointInPolygon(x: number, y: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance d'un point au contour d'un polygone. */
export function distanceToPolygon(
  x: number,
  y: number,
  poly: readonly (readonly [number, number])[],
): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    d = Math.min(d, pointSegmentDistance(x, y, xj, yj, xi, yi));
  }
  return d;
}
