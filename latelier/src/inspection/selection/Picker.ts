/**
 * Requêtes géométriques accélérées (three-mesh-bvh) sur l'objet inspecté : sélection au lancer
 * de rayon, obstacles et distance libre pour la caméra.
 *
 * - Les BVH sont construits PARESSEUSEMENT, une géométrie par tâche, dans la file des temps
 *   morts (`ctx.idle`), en mode `indirect` (l'index de la géométrie, déjà envoyé au GPU, n'est
 *   jamais réordonné). Tant qu'un BVH manque, le lancer de rayon retombe sur l'algorithme de
 *   three.js et la distance libre sur la boîte englobante (borne inférieure prudente).
 * - `acceleratedRaycast` appliqué directement à un `InstancedMesh` ignore les matrices
 *   d'instance (il ne lit que `matrixWorld`) : les instances sont donc parcourues ici une à une,
 *   via un maillage temporaire portant la matrice monde de l'instance.
 * - Plan de coupe : les impacts du côté retiré sont ignorés ; le « mur » de la coupe (plan
 *   limité aux bornes de l'objet) compte comme un obstacle pour la caméra.
 * - Rayons X : les pièces fantômes sont traversées par la caméra et ne sont sélectionnées que si
 *   aucune pièce opaque n'est sous le curseur.
 */
import * as THREE from 'three/webgpu';
import { MeshBVH, acceleratedRaycast, type ExtendedTriangle } from 'three-mesh-bvh';
import type { IdleQueue } from '../../core/scheduler';
import type { Assembly } from '../Assembly';
import type { CameraSceneQuery, ProbeHit } from '../camera/types';

export interface PickHit {
  partId: string;
  instance: number | null;
  mesh: THREE.Mesh;
  distance: number;
  point: THREE.Vector3;
  /** La pièce est affichée en fantôme (rayons X). */
  ghost: boolean;
}

/** Maillage neutre des résultats de sélection au repos. */
const NO_MESH = new THREE.Mesh();

/** Remet un résultat de sélection à vide : il ne retient plus le maillage d'un objet libéré. */
export function resetPickHit(hit: PickHit): void {
  hit.partId = '';
  hit.instance = null;
  hit.mesh = NO_MESH;
  hit.distance = 0;
  hit.ghost = false;
}

interface Entry {
  mesh: THREE.Mesh;
  partId: string;
  instanced: THREE.InstancedMesh | null;
}

/** Options des BVH : mode indirect (index intact), sans journal de construction. */
const BVH_OPTIONS = { indirect: true, verbose: false, targetLeafSize: 10 } as const;

const _sphere = new THREE.Sphere();
const _box = new THREE.Box3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _local = new THREE.Vector3();
const _world = new THREE.Vector3();
const _plane = new THREE.Plane();
const _hitNormal = new THREE.Vector3();
const _v = new THREE.Vector3();
/** Contenu neutre du maillage de travail hors objet attaché (aucune référence retenue). */
const EMPTY_GEOMETRY = new THREE.BufferGeometry();
const EMPTY_MATERIAL = new THREE.MeshBasicMaterial();

/** Matériau factice (jamais rendu) : lancer de rayon sur les deux faces. */
function doubleSideMaterial(): THREE.Material {
  const m = new THREE.Material();
  m.side = THREE.DoubleSide;
  return m;
}

export class Picker implements CameraSceneQuery {
  /** Plan de coupe monde (côté conservé : distance ≥ 0), ou null. */
  clipPlane: THREE.Plane | null = null;
  /** Bornes monde du « mur » de coupe (objet), utilisées avec `clipPlane`. */
  readonly clipBounds = new THREE.Box3();
  /** Pièce affichée en fantôme (rayons X). */
  isGhost: (partId: string) => boolean = () => false;

  private assembly: Assembly | null = null;
  private entries: Entry[] = [];
  private entriesDirty = true;
  private readonly trees = new Map<THREE.BufferGeometry, MeshBVH>();
  private readonly queued = new Set<THREE.BufferGeometry>();
  private generation = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly scratch = new THREE.Mesh();
  /** Annulations des constructions de BVH en attente dans la file des temps morts. */
  private readonly pendingTasks = new Map<THREE.BufferGeometry, () => void>();
  private readonly bothSides = doubleSideMaterial();
  private readonly ray = new THREE.Ray();
  // --- État de la recherche du point le plus proche (rappels réutilisés, sans fermeture) ---
  private readonly queryPoint = new THREE.Vector3();
  private readonly queryClosest = new THREE.Vector3();
  private queryBestSq = Infinity;
  private queryPlane: THREE.Plane | null = null;
  private readonly closestCallbacks = {
    boundsTraverseOrder: (box: THREE.Box3): number => {
      _v.copy(this.queryPoint).clamp(box.min, box.max);
      return _v.distanceToSquared(this.queryPoint);
    },
    intersectsBounds: (_box: THREE.Box3, _isLeaf: boolean, score: number | undefined): boolean =>
      (score ?? 0) < this.queryBestSq,
    intersectsTriangle: (tri: ExtendedTriangle): boolean => {
      const plane = this.queryPlane;
      if (
        plane &&
        plane.distanceToPoint(tri.a) < 0 &&
        plane.distanceToPoint(tri.b) < 0 &&
        plane.distanceToPoint(tri.c) < 0
      )
        return false;
      tri.closestPointToPoint(this.queryPoint, _local);
      const d = _local.distanceToSquared(this.queryPoint);
      if (d < this.queryBestSq) {
        this.queryBestSq = d;
        this.queryClosest.copy(_local);
        this.queryFound = true;
      }
      return false;
    },
  };
  private queryFound = false;

  constructor(private readonly idle: IdleQueue) {
    this.raycaster.near = 0;
    this.raycaster.far = Infinity;
  }

  /** Branche l'objet inspecté et programme la construction des BVH. */
  attach(assembly: Assembly): void {
    this.detach();
    this.assembly = assembly;
    this.entriesDirty = true;
    this.scheduleTrees();
  }

  detach(): void {
    this.generation++;
    this.assembly = null;
    this.entries = [];
    this.queued.clear();
    for (const cancel of this.pendingTasks.values()) cancel();
    this.pendingTasks.clear();
    resetPickHit(this.tmpHit);
    for (const [geometry, tree] of this.trees) {
      if (geometry.boundsTree === tree) geometry.boundsTree = undefined;
    }
    this.trees.clear();
    this.clipPlane = null;
    // Le maillage de travail ne retient ni la géométrie ni le matériau de l'objet libéré.
    this.scratch.geometry = EMPTY_GEOMETRY;
    this.scratch.material = EMPTY_MATERIAL;
    this.hits.length = 0;
  }

  /** Les maillages ont changé (détail construit ou libéré) : liste à reconstruire. */
  invalidate(): void {
    this.entriesDirty = true;
    this.scheduleTrees();
  }

  /** Nombre de BVH construits / en attente (débogage, tests). */
  get treeStats(): { built: number; pending: number } {
    return { built: this.trees.size, pending: this.queued.size };
  }

  /** Construit immédiatement tous les BVH en attente (tests, captures). */
  buildAllNow(): void {
    for (const g of [...this.queued]) this.buildTree(g);
    this.queued.clear();
  }

  private scheduleTrees(): void {
    const generation = this.generation;
    for (const entry of this.getEntries()) {
      const g = entry.mesh.geometry;
      if (this.trees.has(g) || this.queued.has(g) || !this.canBuild(g)) continue;
      this.queued.add(g);
      const triangles = (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
      // Les petites géométries d'abord : la sélection devient rapide au plus tôt.
      this.pendingTasks.set(
        g,
        this.idle.push(() => {
          this.pendingTasks.delete(g);
          if (generation !== this.generation || !this.queued.delete(g)) return;
          this.buildTree(g);
        }, -triangles),
      );
    }
  }

  private canBuild(g: THREE.BufferGeometry): boolean {
    const position = g.getAttribute('position');
    if (!position || position.count < 3) return false;
    const index = g.index as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null;
    return !(index && (index as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute);
  }

  private buildTree(g: THREE.BufferGeometry): void {
    if (this.trees.has(g)) return;
    try {
      const tree = new MeshBVH(g, BVH_OPTIONS);
      this.trees.set(g, tree);
      g.boundsTree = tree;
    } catch (error) {
      // Géométrie non prise en charge (index entrelacé…) : repli sur le lancer de rayon standard.
      console.warn('[Picker] BVH impossible pour une géométrie :', error);
    }
  }

  private getEntries(): readonly Entry[] {
    if (!this.entriesDirty) return this.entries;
    this.entriesDirty = false;
    const list: Entry[] = [];
    const a = this.assembly;
    if (a) {
      for (const part of a.order) {
        for (const mesh of part.ownMeshes) {
          const im = mesh as THREE.InstancedMesh;
          list.push({ mesh, partId: part.id, instanced: im.isInstancedMesh ? im : null });
        }
      }
    }
    this.entries = list;
    return list;
  }

  /** Le maillage est-il réellement affiché (lui et tous ses ancêtres) ? */
  private rendered(mesh: THREE.Object3D): boolean {
    const root = this.assembly?.root ?? null;
    for (let o: THREE.Object3D | null = mesh; o; o = o.parent) {
      if (!o.visible) return false;
      if (o === root) return true;
    }
    return false;
  }

  /** Point du côté retiré par la coupe ? */
  private clipped(point: THREE.Vector3): boolean {
    return this.clipPlane !== null && this.clipPlane.distanceToPoint(point) < 0;
  }

  // --- Lancer de rayon ----------------------------------------------------------------------

  /**
   * Lance `ray` sur un maillage (instances comprises) et ajoute les impacts dans `this.hits`.
   * `material` : matériau fixant les faces testées (null = celui du maillage).
   */
  private castMesh(entry: Entry, material: THREE.Material | null): void {
    const mesh = entry.mesh;
    const probe = this.scratch;
    probe.geometry = mesh.geometry;
    probe.material = material ?? mesh.material;
    const inst = entry.instanced;
    if (!inst) {
      // Rejet rapide par la sphère englobante (évite l'inversion de matrice du BVH).
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (g.boundingSphere) {
        _sphere.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
        if (!this.raycaster.ray.intersectsSphere(_sphere)) return;
        if (
          this.raycaster.far < Infinity &&
          _sphere.distanceToPoint(this.raycaster.ray.origin) > this.raycaster.far
        )
          return;
      }
      probe.matrixWorld.copy(mesh.matrixWorld);
      const before = this.hits.length;
      acceleratedRaycast.call(probe, this.raycaster, this.hits);
      for (let i = before; i < this.hits.length; i++) {
        const h = this.hits[i]!;
        h.object = mesh;
        h.instanceId = undefined;
      }
      return;
    }
    // Test global sur la sphère englobante des instances.
    if (!inst.boundingSphere) inst.computeBoundingSphere();
    if (inst.boundingSphere) {
      _sphere.copy(inst.boundingSphere).applyMatrix4(inst.matrixWorld);
      if (!this.raycaster.ray.intersectsSphere(_sphere)) return;
    }
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const local = g.boundingSphere;
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, _m);
      probe.matrixWorld.multiplyMatrices(inst.matrixWorld, _m);
      // Rejet rapide par instance (tôles, broches, billes : des centaines d'instances).
      if (local) {
        _sphere.copy(local).applyMatrix4(probe.matrixWorld);
        if (!this.raycaster.ray.intersectsSphere(_sphere)) continue;
      }
      const before = this.hits.length;
      acceleratedRaycast.call(probe, this.raycaster, this.hits);
      for (let k = before; k < this.hits.length; k++) {
        const h = this.hits[k]!;
        h.object = mesh;
        h.instanceId = i;
      }
    }
  }

  private prepareRay(ray: THREE.Ray, far: number): void {
    this.raycaster.ray.copy(ray);
    this.raycaster.far = far;
    // Sans plan de coupe, seul le premier impact de chaque maillage est utile.
    this.raycaster.firstHitOnly = this.clipPlane === null;
    this.hits.length = 0;
  }

  /**
   * Pièce visible sous le rayon (faces telles que rendues). Les pièces fantômes (rayons X) ne
   * sont retenues qu'à défaut de pièce opaque le long du rayon.
   */
  pick(ray: THREE.Ray, out: PickHit): boolean {
    this.prepareRay(ray, Infinity);
    let bestSolid: THREE.Intersection | null = null;
    let bestGhost: THREE.Intersection | null = null;
    let solidPart = '';
    let ghostPart = '';
    for (const entry of this.getEntries()) {
      if (!this.rendered(entry.mesh)) continue;
      const ghost = this.isGhost(entry.partId);
      this.castMesh(entry, null);
      for (const h of this.hits) {
        if (this.clipped(h.point)) continue;
        if (ghost) {
          if (!bestGhost || h.distance < bestGhost.distance) {
            bestGhost = h;
            ghostPart = entry.partId;
          }
        } else if (!bestSolid || h.distance < bestSolid.distance) {
          bestSolid = h;
          solidPart = entry.partId;
        }
      }
      this.hits.length = 0;
    }
    const best = bestSolid ?? bestGhost;
    if (!best) return false;
    out.partId = bestSolid ? solidPart : ghostPart;
    out.mesh = best.object as THREE.Mesh;
    out.instance = best.instanceId ?? null;
    out.distance = best.distance;
    out.point.copy(best.point);
    out.ghost = bestSolid === null;
    return true;
  }

  /** Premier obstacle (pièces opaques, deux faces, coupe comprise) le long d'un rayon. */
  obstacleDistance(origin: THREE.Vector3, direction: THREE.Vector3, far: number): number {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction);
    this.prepareRay(this.ray, far);
    let best = Infinity;
    for (const entry of this.getEntries()) {
      if (!this.rendered(entry.mesh) || this.isGhost(entry.partId)) continue;
      this.castMesh(entry, this.bothSides);
      for (const h of this.hits) if (h.distance < best && !this.clipped(h.point)) best = h.distance;
      this.hits.length = 0;
    }
    const wall = this.wallDistance(this.ray);
    return Math.min(best, wall) <= far ? Math.min(best, wall) : Infinity;
  }

  /**
   * Point de surface visible sous le rayon (zoom vers le curseur). Si le rayon voit la face de
   * coupe (face arrière derrière le plan), le point retenu est sur le plan de coupe.
   */
  surfacePoint(ray: THREE.Ray, out: THREE.Vector3): number {
    const hit = this.tmpHit;
    if (!this.pick(ray, hit)) return Infinity;
    out.copy(hit.point);
    let distance = hit.distance;
    const plane = this.clipPlane;
    if (plane && this.lastPickBackFace(ray)) {
      const t = ray.distanceToPlane(plane);
      if (t !== null && t < distance) {
        ray.at(t, out);
        distance = t;
      }
    }
    return distance;
  }

  private readonly tmpHit: PickHit = {
    partId: '',
    instance: null,
    mesh: new THREE.Mesh(),
    distance: 0,
    point: new THREE.Vector3(),
    ghost: false,
  };

  /** La face touchée par le dernier `pick` est-elle vue de dos ? (face de coupe) */
  private lastPickBackFace(ray: THREE.Ray): boolean {
    const hit = this.tmpHit;
    const entry = this.getEntries().find((e) => e.mesh === hit.mesh);
    if (!entry) return false;
    this.prepareRay(ray, hit.distance * 1.0001 + 1e-6);
    this.castMesh(entry, this.bothSides);
    const back = this.nearestFacing(ray, this.probeResult) && this.probeResult.backFace;
    this.hits.length = 0;
    return back;
  }

  private readonly probeResult: ProbeHit = { distance: 0, backFace: false };

  /**
   * Parmi les impacts accumulés dans `this.hits`, le plus proche non coupé : distance et sens de
   * la face (vue de dos ou non).
   */
  private nearestFacing(ray: THREE.Ray, out: ProbeHit): boolean {
    let best: THREE.Intersection | null = null;
    for (const h of this.hits) {
      if (!h.face || this.clipped(h.point)) continue;
      if (!best || h.distance < best.distance) best = h;
    }
    if (!best || !best.face) return false;
    const mesh = best.object as THREE.Mesh;
    _m.copy(mesh.matrixWorld);
    const im = mesh as THREE.InstancedMesh;
    if (im.isInstancedMesh && best.instanceId !== undefined) {
      im.getMatrixAt(best.instanceId, _inv);
      _m.multiply(_inv);
    }
    _hitNormal.copy(best.face.normal).transformDirection(_m);
    out.distance = best.distance;
    out.backFace = _hitNormal.dot(ray.direction) > 0;
    return true;
  }

  /** Premier impact (pièces opaques, deux faces) et sens de la face touchée. */
  probe(origin: THREE.Vector3, direction: THREE.Vector3, far: number, out: ProbeHit): boolean {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction);
    this.prepareRay(this.ray, far);
    // Tous les impacts sont nécessaires pour ignorer ceux du côté coupé.
    this.raycaster.firstHitOnly = false;
    for (const entry of this.getEntries()) {
      if (!this.rendered(entry.mesh) || this.isGhost(entry.partId)) continue;
      this.castMesh(entry, this.bothSides);
    }
    const found = this.nearestFacing(this.ray, out);
    this.hits.length = 0;
    const wall = this.wallDistance(this.ray);
    if (wall < (found ? out.distance : far)) {
      // Face de coupe : vue de dos depuis le côté conservé (l'origine est dans la matière).
      out.distance = wall;
      out.backFace = this.clipPlane !== null && this.clipPlane.distanceToPoint(origin) >= 0;
      return true;
    }
    return found;
  }

  /** Distance le long du rayon jusqu'au « mur » de coupe (plan limité aux bornes de l'objet). */
  private wallDistance(ray: THREE.Ray): number {
    const plane = this.clipPlane;
    if (!plane || this.clipBounds.isEmpty()) return Infinity;
    const t = ray.distanceToPlane(plane);
    if (t === null) return Infinity;
    ray.at(t, _v);
    return this.clipBounds.containsPoint(_v) ? t : Infinity;
  }

  // --- Distance libre ----------------------------------------------------------------------

  /** Distance du point à la surface opaque la plus proche (≤ `maxDistance`, sinon Infinity). */
  clearance(point: THREE.Vector3, maxDistance: number): number {
    let best = maxDistance;
    const plane = this.clipPlane;
    for (const entry of this.getEntries()) {
      if (!this.rendered(entry.mesh) || this.isGhost(entry.partId)) continue;
      const mesh = entry.mesh;
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const inst = entry.instanced;
      if (!inst) {
        best = Math.min(best, this.closestOn(g, mesh.matrixWorld, point, best, plane));
        continue;
      }
      if (!inst.boundingSphere) inst.computeBoundingSphere();
      if (inst.boundingSphere) {
        _sphere.copy(inst.boundingSphere).applyMatrix4(inst.matrixWorld);
        if (_sphere.distanceToPoint(point) > best) continue;
      }
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, _m);
        _m.premultiply(inst.matrixWorld);
        best = Math.min(best, this.closestOn(g, _m, point, best, plane));
      }
    }
    // Mur de coupe : la face de coupe se comporte comme une surface.
    if (plane && !this.clipBounds.isEmpty()) {
      plane.projectPoint(point, _v);
      _box.copy(this.clipBounds).expandByScalar(1e-4);
      if (_box.containsPoint(_v)) best = Math.min(best, Math.abs(plane.distanceToPoint(point)));
    }
    return best < maxDistance ? best : Infinity;
  }

  /** Distance monde point → géométrie `g` placée par `world`, bornée par `best`. */
  private closestOn(
    g: THREE.BufferGeometry,
    world: THREE.Matrix4,
    point: THREE.Vector3,
    best: number,
    plane: THREE.Plane | null,
  ): number {
    const bs = g.boundingSphere;
    if (bs) {
      _sphere.copy(bs).applyMatrix4(world);
      if (_sphere.distanceToPoint(point) > best) return Infinity;
    }
    const tree = this.trees.get(g);
    if (!tree) {
      // BVH pas encore prêt : distance à la boîte englobante (borne inférieure prudente).
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return Infinity;
      _box.copy(g.boundingBox).applyMatrix4(world);
      return _box.distanceToPoint(point);
    }
    _inv.copy(world).invert();
    this.queryPoint.copy(point).applyMatrix4(_inv);
    // Seuil de recherche local : une mise à l'échelle uniforme est prise en compte.
    const localBest = best / Math.max(1e-9, world.getMaxScaleOnAxis());
    this.queryBestSq = localBest * localBest;
    this.queryPlane = plane ? _plane.copy(plane).applyMatrix4(_inv) : null;
    this.queryFound = false;
    tree.shapecast(this.closestCallbacks);
    if (!this.queryFound) return Infinity;
    return _world.copy(this.queryClosest).applyMatrix4(world).distanceTo(point);
  }

  dispose(): void {
    this.detach();
    this.bothSides.dispose();
  }
}
