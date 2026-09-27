/**
 * Plans de placement monde des pièces, à partir de la logique pure de `knolling.ts` :
 * - vue rangée (K) : toutes les pièces à géométrie (hors `knolling.exclude`) posées à plat,
 *   groupées par sous-ensemble de premier niveau (ou `knolling.group`) ;
 * - rangement des pièces retirées (« park ») : chaque pièce retirable (avec ses sous-pièces) a
 *   un emplacement AUTOUR de l'emprise de l'objet resté sur le tapis.
 *
 * Approximation : le rangement « park » n'utilise pas les emplacements de la vue rangée (qui
 * occupent aussi le centre du tapis, où l'objet reste posé) mais une disposition dédiée évitant
 * l'emprise de l'objet ; l'orientation à plat et les espacements sont les mêmes.
 */
import * as THREE from 'three/webgpu';
import type { Assembly, PartRuntime } from './Assembly';
import type { DisassemblyGraph } from './graph';
import { chooseFlatOrientation, layoutKnolling, type KnollingItem, type Rect } from './knolling';
import { BENCH, MAT, SPOTS } from '../world/layout';
import type { Vec3 } from '../objects/types';

/** Ancrage d'une étiquette de nom en vue rangée (pour le module d'étiquettes de la vue). */
export interface KnollingLabel {
  partId: string;
  text: string;
  /** Position monde (devant l'emplacement, au ras de la surface). */
  position: THREE.Vector3;
}

export interface PlacementPlan {
  /** Matrice monde cible du nœud (pièces non instanciées). */
  targets: Map<string, THREE.Matrix4>;
  /** Matrices monde cibles de chaque instance (repère de l'instance). */
  instanceTargets: Map<string, THREE.Matrix4[]>;
  labels: KnollingLabel[];
  /** Ordre des pièces (départs décalés des transitions). */
  order: string[];
  fits: boolean;
  /** Bornes monde de la disposition (cadrage). */
  bounds: THREE.Box3;
}

/** Marge au bord du plateau de l'établi (m). */
const BENCH_EDGE = 0.02;
/** Marge autour de l'emprise de l'objet pour le rangement (m). */
const OBJECT_CLEARANCE = 0.03;

/** Zones du plateau occupées par le décor (pied de la loupe-lampe). */
const BENCH_OBSTACLES: readonly Rect[] = [
  {
    minX: SPOTS.magnifierLampBase[0] - 0.1,
    maxX: SPOTS.magnifierLampBase[0] + 0.1,
    minZ: SPOTS.magnifierLampBase[2] - 0.1,
    maxZ: SPOTS.magnifierLampBase[2] + 0.1,
  },
];

const matRect = (): Rect => ({
  minX: MAT.center[0] - MAT.size[0] / 2 + 0.015,
  maxX: MAT.center[0] + MAT.size[0] / 2 - 0.015,
  minZ: MAT.center[2] - MAT.size[1] / 2 + 0.015,
  maxZ: MAT.center[2] + MAT.size[1] / 2 - 0.015,
});

const benchRect = (): Rect => ({
  minX: BENCH.x[0] + BENCH_EDGE,
  maxX: BENCH.x[1] - BENCH_EDGE,
  minZ: BENCH.z[0] + BENCH_EDGE,
  maxZ: BENCH.z[1] - BENCH_EDGE,
});

const inside = (x: number, z: number, r: Rect) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

interface Oriented {
  quaternion: THREE.Quaternion;
  /** Dimensions monde après orientation (x, y, z). */
  extents: Vec3;
}

const _corner = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

/** Orientation à plat d'une boîte locale (dimensions déjà mises à l'échelle monde). */
function orient(size: THREE.Vector3, forced: Vec3 | undefined): Oriented {
  if (forced) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(forced[0], forced[1], forced[2], 'XYZ'));
    const box = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      _corner.set(i & 1 ? size.x / 2 : -size.x / 2, i & 2 ? size.y / 2 : -size.y / 2, i & 4 ? size.z / 2 : -size.z / 2);
      box.expandByPoint(_corner.applyQuaternion(q));
    }
    const e = box.getSize(new THREE.Vector3());
    return { quaternion: q, extents: [e.x, e.y, e.z] };
  }
  const flat = chooseFlatOrientation([size.x, size.y, size.z]);
  const [x, y, z, w] = flat.quaternion;
  return { quaternion: new THREE.Quaternion(x, y, z, w).normalize(), extents: flat.extents };
}

/** Groupe d'alignement : `knolling.group`, sinon sous-ensemble de premier niveau, sinon racine. */
function groupOf(assembly: Assembly, part: PartRuntime): string {
  if (part.def.knolling?.group) return part.def.knolling.group;
  let top = part;
  while (top.parentId) top = assembly.parts.get(top.parentId)!;
  return top.def.kind === 'assembly' ? top.id : '';
}

function labelText(part: PartRuntime, count: number): string {
  const base = part.def.label && part.def.label.text ? part.def.label.text : part.def.name;
  return count > 1 ? `${base} ×${count}` : base;
}

interface Entry {
  part: PartRuntime;
  item: KnollingItem;
  oriented: Oriented;
  /** Centre de la boîte (repère local mis à l'échelle : nœud ou instance). */
  boxCenter: THREE.Vector3;
  scale: THREE.Vector3;
}

function makeEntry(part: PartRuntime, useSubtree: boolean, group: string): Entry | null {
  const inst = part.instanced;
  const box = inst ? inst.instanceBox : useSubtree ? part.subtreeBox : part.localBox;
  if (box.isEmpty()) return null;
  const scale = part.restWorldScale.clone();
  if (inst) scale.multiply(inst.frameScale[0] ?? new THREE.Vector3(1, 1, 1));
  box.getSize(_size).multiply(scale);
  // Épaisseur minimale : évite les boîtes dégénérées (pièces planes).
  _size.set(Math.max(_size.x, 1e-4), Math.max(_size.y, 1e-4), Math.max(_size.z, 1e-4));
  const oriented = orient(_size, part.def.knolling?.rotation);
  const count = inst ? inst.count : 1;
  return {
    part,
    oriented,
    boxCenter: box.getCenter(new THREE.Vector3()),
    scale,
    item: {
      id: part.id,
      group,
      size: oriented.extents,
      count,
      layout: part.def.knolling?.layout ?? 'row',
      label: labelText(part, inst ? count : part.quantity),
    },
  };
}

/** Matrice monde : centre de boîte en `center`, orientation `q`, échelle `s`, boîte centrée en `c`. */
function targetMatrix(center: Vec3, q: THREE.Quaternion, s: THREE.Vector3, c: THREE.Vector3): THREE.Matrix4 {
  const m = new THREE.Matrix4().compose(_center.set(center[0], center[1], center[2]), q, s);
  const offset = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
  return m.multiply(offset);
}

function buildPlan(entries: Entry[], region: Parameters<typeof layoutKnolling>[1]): PlacementPlan {
  const layout = layoutKnolling(
    entries.map((e) => e.item),
    region,
  );
  const mat = matRect();
  const benchDrop = MAT.center[1] - BENCH.topHeight;
  const plan: PlacementPlan = {
    targets: new Map(),
    instanceTargets: new Map(),
    labels: [],
    order: entries.map((e) => e.part.id),
    fits: layout.fits,
    bounds: new THREE.Box3(),
  };
  for (const e of entries) {
    const slot = layout.slots.get(e.part.id);
    if (!slot) continue;
    // Hors du tapis : la surface de pose est le plateau (quelques mm plus bas).
    const cx = (slot.footprint.minX + slot.footprint.maxX) / 2;
    const cz = (slot.footprint.minZ + slot.footprint.maxZ) / 2;
    const dy = inside(cx, cz, mat) ? 0 : -benchDrop;
    const matrices = slot.instances.map((p) => targetMatrix([p[0], p[1] + dy, p[2]], e.oriented.quaternion, e.scale, e.boxCenter));
    if (e.part.instanced) plan.instanceTargets.set(e.part.id, matrices);
    else plan.targets.set(e.part.id, matrices[0]!);
    const height = e.item.size[1] * (e.item.layout === 'stack' ? e.item.count : 1);
    plan.bounds.expandByPoint(_center.set(slot.footprint.minX, MAT.center[1] + dy, slot.footprint.minZ));
    plan.bounds.expandByPoint(_center.set(slot.footprint.maxX, MAT.center[1] + dy + height, slot.footprint.maxZ));
    if (e.part.def.label !== false)
      plan.labels.push({
        partId: e.part.id,
        text: slot.label,
        position: new THREE.Vector3(slot.labelPosition[0], slot.labelPosition[1] + dy, slot.labelPosition[2]),
      });
  }
  return plan;
}

/** Ordre A → Z d'une pièce (pièces de base d'abord). */
function stepRank(graph: DisassemblyGraph, id: string): number {
  const s = graph.stepIndexOf(id);
  return s === undefined ? -1 : s;
}

/** Plan de la vue rangée : toutes les pièces à géométrie, groupées. */
export function planKnolling(assembly: Assembly, graph: DisassemblyGraph): PlacementPlan {
  const groups = new Map<string, Entry[]>();
  const groupOrder: string[] = [''];
  assembly.order.forEach((part) => {
    if (!part.hasGeometry || part.def.knolling?.exclude) return;
    const group = groupOf(assembly, part);
    const entry = makeEntry(part, false, group);
    if (!entry) return;
    if (!groups.has(group)) {
      groups.set(group, []);
      if (!groupOrder.includes(group)) groupOrder.push(group);
    }
    groups.get(group)!.push(entry);
  });
  const declIndex = new Map(assembly.order.map((p, i) => [p.id, i] as const));
  const entries: Entry[] = [];
  for (const g of groupOrder) {
    const list = groups.get(g);
    if (!list) continue;
    list.sort(
      (a, b) =>
        stepRank(graph, a.part.id) - stepRank(graph, b.part.id) ||
        declIndex.get(a.part.id)! - declIndex.get(b.part.id)!,
    );
    entries.push(...list);
  }
  return buildPlan(entries, {
    surfaceY: MAT.center[1],
    preferred: matRect(),
    limit: benchRect(),
    keepOut: BENCH_OBSTACLES,
    center: true,
  });
}

/**
 * Plan de rangement des pièces retirées : pièces retirables (sous-arbre compris), rangées autour
 * de l'emprise `objectFootprint` (monde) de l'objet au repos.
 */
export function planParking(assembly: Assembly, graph: DisassemblyGraph, objectFootprint: THREE.Box3): PlacementPlan {
  const entries: Entry[] = [];
  for (const part of assembly.order) {
    if (!part.def.removal) continue;
    const entry = makeEntry(part, true, '');
    if (entry) entries.push(entry);
  }
  const declIndex = new Map(assembly.order.map((p, i) => [p.id, i] as const));
  entries.sort(
    (a, b) =>
      stepRank(graph, a.part.id) - stepRank(graph, b.part.id) || declIndex.get(a.part.id)! - declIndex.get(b.part.id)!,
  );
  const keepOut: Rect[] = [...BENCH_OBSTACLES];
  if (!objectFootprint.isEmpty()) {
    keepOut.push({
      minX: objectFootprint.min.x - OBJECT_CLEARANCE,
      maxX: objectFootprint.max.x + OBJECT_CLEARANCE,
      minZ: objectFootprint.min.z - OBJECT_CLEARANCE,
      maxZ: objectFootprint.max.z + OBJECT_CLEARANCE,
    });
  }
  return buildPlan(entries, {
    surfaceY: MAT.center[1],
    preferred: matRect(),
    limit: benchRect(),
    keepOut,
    center: false,
  });
}
