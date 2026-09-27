/**
 * Routage de la carte : relie les broches de chaque réseau par des pistes (2 couches) et des vias,
 * à partir des données de `layout.ts`. Module pur, résultat déterministe et mis en cache.
 *
 * - Masse (GND) : non routée en pistes, assurée par les plans de masse des deux faces ; des vias
 *   de couture relient les pastilles CMS de masse au plan inférieur.
 * - Boîtiers à pas fin (QFN, MSOP) : amorces de dégagement tracées depuis chaque pastille utilisée.
 * - Version asynchrone : rend la main au navigateur entre deux réseaux (écran de chargement fluide).
 */
import { BOARD_H, BOARD_W } from '../constants';
import {
  BOARD_OUTLINE,
  COMPONENTS,
  DEFAULT_TRACE,
  GND,
  MOUNTING_HOLES,
  MOUNTING_KEEPOUT,
  NC,
  NET_CLASSES,
} from '../layout';
import { FOOTPRINTS } from '../footprints';
import { allPads, pointConvexDistance, rectCorners, type PlacedPad } from './pads';
import {
  GridRouter,
  pointSegmentDistance,
  type Layer,
  type RouteResult,
  type Shape,
  type Terminal,
} from './router';

export interface Trace {
  net: string;
  layer: Layer;
  width: number;
  /** Polyligne [x0, y0, x1, y1, …] (mm, repère carte). */
  points: number[];
}

export interface Via {
  net: string;
  x: number;
  y: number;
}

export interface Routing {
  traces: Trace[];
  vias: Via[];
  /** Réseaux dont au moins une broche n'a pas pu être reliée (diagnostic). */
  failures: { net: string; count: number; at: { x: number; y: number }[] }[];
  pads: PlacedPad[];
}

/** Paramètres de fabrication (mm). */
export const DRC = {
  clearance: 0.15,
  viaDiameter: 0.8,
  viaDrill: 0.4,
  pitch: 0.2,
} as const;

/** Réseaux routés en premier (liaisons courtes et sensibles), puis alimentations. */
const PRIORITY = [
  'XT1',
  'XT2',
  'XTAL1',
  'XTAL2',
  'RD_P',
  'RD_M',
  'USB_DP',
  'USB_DM',
  'PWRIN',
  'VIN',
  'XUSB',
  'USBVCC',
  'UGND',
  '+3V3',
  '+5V',
];

/** Forme de cuivre d'une pastille. */
export function padShape(p: PlacedPad): Shape {
  if (p.shape === 'round') return { kind: 'circle', x: p.x, y: p.y, r: p.w / 2 };
  return {
    kind: 'rect',
    x: p.x,
    y: p.y,
    hw: p.w / 2,
    hh: p.h / 2,
    cos: Math.cos(p.rot),
    sin: Math.sin(p.rot),
  };
}

export const traceWidth = (net: string): number => NET_CLASSES[net] ?? DEFAULT_TRACE;

/** Étapes du routage : produit la progression (0..1) et retourne le résultat. */
function* routingSteps(): Generator<number, Routing> {
  const pads = allPads(COMPONENTS);
  const router = new GridRouter({
    width: BOARD_W,
    height: BOARD_H,
    pitch: DRC.pitch,
    clearance: DRC.clearance,
    traceWidth: DEFAULT_TRACE,
    viaDiameter: DRC.viaDiameter,
    viaCost: 2.2,
    turnCost: 0.12,
    leniency: 0.45,
    heuristicWeight: 1.25,
    maxExpansions: 400_000,
  });
  router.blockOutside(BOARD_OUTLINE, 0.45);
  for (const h of MOUNTING_HOLES) router.block({ kind: 'circle', x: h.x, y: h.y, r: 0 }, MOUNTING_KEEPOUT);
  yield 0.05;

  const traces: Trace[] = [];
  const vias: Via[] = [];

  // Pastilles (cuivre des réseaux, masse comprise) et amorces de dégagement.
  for (const p of pads) {
    const layers: Layer[] = p.drill !== undefined ? [0, 1] : [0];
    router.addCopper(p.net === NC ? `NC:${p.ref}.${p.num}` : p.net, padShape(p), layers);
  }
  for (const p of pads) {
    if (!p.fanoutEnd || p.net === NC || p.net === GND) continue;
    const w = Math.min(traceWidth(p.net), 0.25);
    traces.push({ net: p.net, layer: 0, width: w, points: [p.x, p.y, p.fanoutEnd.x, p.fanoutEnd.y] });
    router.addCopper(
      p.net,
      { kind: 'segment', x0: p.x, y0: p.y, x1: p.fanoutEnd.x, y1: p.fanoutEnd.y, r: w / 2 },
      [0],
    );
  }

  // Couronnes de dégagement des boîtiers à pas fin, réservées à leurs propres réseaux.
  for (const c of COMPONENTS) {
    const fp = FOOTPRINTS[c.footprint];
    if (!fp.pads.some((p) => p.fanout)) continue;
    let hw = 0;
    let hh = 0;
    for (const p of fp.pads) {
      const ex = p.fanout ? Math.abs(p.x + p.fanout.dx * p.fanout.length) : Math.abs(p.x) + p.w / 2;
      const ey = p.fanout ? Math.abs(p.y + p.fanout.dy * p.fanout.length) : Math.abs(p.y) + p.h / 2;
      hw = Math.max(hw, ex);
      hh = Math.max(hh, ey);
    }
    const a = (c.rot * Math.PI) / 180;
    router.reserve(
      { kind: 'rect', x: c.x, y: c.y, hw: hw + 0.3, hh: hh + 0.3, cos: Math.cos(a), sin: Math.sin(a) },
      Object.values(c.nets).filter((n) => n !== NC && n !== GND),
    );
  }

  // Réseaux à router.
  const byNet = new Map<string, PlacedPad[]>();
  for (const p of pads) {
    if (p.net === NC || p.net === GND) continue;
    const list = byNet.get(p.net) ?? [];
    list.push(p);
    byNet.set(p.net, list);
  }
  const extent = (list: PlacedPad[]) => {
    const xs = list.map((p) => p.x);
    const ys = list.map((p) => p.y);
    return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  };
  const order = [...byNet.keys()].sort((a, b) => {
    const pa = PRIORITY.indexOf(a);
    const pb = PRIORITY.indexOf(b);
    if (pa >= 0 || pb >= 0) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    return extent(byNet.get(a)!) - extent(byNet.get(b)!) || a.localeCompare(b);
  });

  // Les broches à amorce (pas fin) d'abord : leur dégagement est tracé avant le reste du réseau.
  const terminalsOf = (net: string): Terminal[] =>
    [...byNet.get(net)!]
      .sort((a, b) => Number(!!b.fanoutEnd) - Number(!!a.fanoutEnd))
      .map((p) => {
        const at = p.fanoutEnd ?? { x: p.x, y: p.y };
        return {
          x: at.x,
          y: at.y,
          layers: p.drill !== undefined ? [0, 1] : [0],
          region: p.fanoutEnd ? { kind: 'circle', x: at.x, y: at.y, r: 0.05 } : padShape(p),
        };
      });
  const routeNet = (net: string): RouteResult => router.route(net, traceWidth(net), terminalsOf(net));

  // Première passe, dans l'ordre de priorité.
  router.snapshot();
  const results = new Map<string, RouteResult>();
  let done = 0;
  for (const net of order) {
    done++;
    if (byNet.get(net)!.length < 2) continue;
    results.set(net, routeNet(net));
    yield 0.05 + (0.7 * done) / order.length;
  }

  // Arrachage et reroutage : pour chaque réseau incomplet, on retire les réseaux qui passent près
  // de ses broches, on le route en premier, puis on reroute les autres ; accepté si mieux.
  const failedCount = (nets: Iterable<string>, map: ReadonlyMap<string, RouteResult>) =>
    [...nets].reduce((sum, n) => sum + (map.get(n)?.failed ?? 0), 0);
  const rebuild = (exclude: ReadonlySet<string>) => {
    router.restore();
    for (const [net, res] of results) if (!exclude.has(net)) router.applyResult(res);
  };
  for (let pass = 0; pass < 3; pass++) {
    const failed = order.filter((n) => (results.get(n)?.failed ?? 0) > 0);
    if (failed.length === 0) break;
    let improved = false;
    for (const F of failed) {
      const terms = terminalsOf(F);
      const blockers = new Set<string>();
      for (const [net, res] of results) {
        if (net === F) continue;
        const near = (x: number, y: number) => terms.some((t) => Math.hypot(t.x - x, t.y - y) < 1.6);
        const hit =
          res.vias.some((v) => near(v.x, v.y)) ||
          res.segments.some((seg) => {
            for (let k = 0; k + 3 < seg.points.length; k += 2) {
              for (const t of terms) {
                const d = pointSegmentDistance(
                  t.x,
                  t.y,
                  seg.points[k]!,
                  seg.points[k + 1]!,
                  seg.points[k + 2]!,
                  seg.points[k + 3]!,
                );
                if (d < 1.2) return true;
              }
            }
            return false;
          });
        if (hit) blockers.add(net);
      }
      if (blockers.size === 0) continue;
      const before = failedCount([F, ...blockers], results);
      rebuild(new Set([F, ...blockers]));
      const trial = new Map<string, RouteResult>();
      trial.set(F, routeNet(F));
      for (const b of order) if (blockers.has(b)) trial.set(b, routeNet(b));
      if (failedCount(trial.keys(), trial) < before) {
        for (const [k, v] of trial) results.set(k, v);
        improved = true;
      }
      rebuild(new Set());
      yield 0.8;
    }
    if (!improved) break;
  }
  rebuild(new Set());

  const failures: Routing['failures'] = [];
  for (const net of order) {
    const res = results.get(net);
    if (!res) continue;
    for (const s of res.segments) traces.push({ net, layer: s.layer, width: res.width, points: s.points });
    for (const v of res.vias) vias.push({ net, x: v.x, y: v.y });
    if (res.failed) failures.push({ net, count: res.failed, at: res.unrouted });
  }

  // Vias de couture : chaque pastille CMS de masse rejoint le plan inférieur par un via voisin.
  for (const p of pads) {
    if (p.net !== GND || p.drill !== undefined || p.w > 3) continue;
    const reach = Math.max(p.w, p.h) / 2 + 0.75;
    for (let k = 0; k < 16; k++) {
      const a = p.rot + (k * Math.PI) / 8;
      const x = p.x + Math.cos(a) * reach;
      const y = p.y + Math.sin(a) * reach;
      if (!router.viaFree(GND, x, y) || !router.segmentFree(GND, 0, p.x, p.y, x, y, 0.3)) continue;
      vias.push({ net: GND, x, y });
      traces.push({ net: GND, layer: 0, width: 0.3, points: [p.x, p.y, x, y] });
      router.addCopper(GND, { kind: 'circle', x, y, r: DRC.viaDiameter / 2 }, [0, 1]);
      router.addCopper(GND, { kind: 'segment', x0: p.x, y0: p.y, x1: x, y1: y, r: 0.15 }, [0]);
      break;
    }
  }
  // Vias de couture répartis (légèrement irréguliers) dans les zones libres hors composants :
  // ils relient les plans de masse des deux faces.
  const courtyards = COMPONENTS.map((c) => rectCorners(c, FOOTPRINTS[c.footprint].courtyard));
  let seed = 0x2331;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 4.0; y < BOARD_H - 3; y += 6.1) {
    for (let x = 4.5; x < BOARD_W - 3; x += 6.6) {
      const vx = x + (rand() - 0.5) * 2.6;
      const vy = y + (rand() - 0.5) * 2.4;
      if (courtyards.some((poly) => pointConvexDistance(vx, vy, poly) < 0.6)) continue;
      if (!router.viaFree(GND, vx, vy)) continue;
      if (vias.some((v) => Math.hypot(v.x - vx, v.y - vy) < 2.5)) continue;
      vias.push({ net: GND, x: vx, y: vy });
      router.addCopper(GND, { kind: 'circle', x: vx, y: vy, r: DRC.viaDiameter / 2 }, [0, 1]);
    }
  }
  yield 1;
  return { traces, vias, failures, pads };
}

let cache: Routing | null = null;

/** Routage complet (calculé une fois, puis mis en cache). */
export function computeRouting(): Routing {
  if (cache) return cache;
  const it = routingSteps();
  for (let r = it.next(); ; r = it.next()) {
    if (r.done) {
      cache = r.value;
      return cache;
    }
  }
}

/** Routage asynchrone : rend la main au navigateur toutes les ~20 ms. */
export async function computeRoutingAsync(onProgress?: (value: number) => void): Promise<Routing> {
  if (cache) return cache;
  const it = routingSteps();
  let last = performance.now();
  for (let r = it.next(); ; r = it.next()) {
    if (r.done) {
      cache = r.value;
      return cache;
    }
    onProgress?.(r.value);
    if (performance.now() - last > 20) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      last = performance.now();
    }
  }
}
