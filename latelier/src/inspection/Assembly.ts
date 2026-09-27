/**
 * Instance d'exécution d'un `ObjectDef` pour un jeu de paramètres : construction des pièces,
 * graphe de scène (un nœud par pièce), poses de repos, données des pièces instanciées, requêtes
 * géométriques (bornes, ancrages, sélection) et libération des ressources.
 *
 * Conventions (voir `objects/types.ts`) :
 * - le nœud d'une pièce est l'objet retourné par `build` (son origine est le pivot) ; un
 *   sous-ensemble sans `build` reçoit un `Group` ;
 * - chaque nœud de pièce ET chaque maillage portent `userData.partId` ;
 * - la racine est posée au centre du tapis, tournée de `presentation.rotationY` ; y = 0 de l'objet
 *   correspond à la surface du tapis.
 */
import * as THREE from 'three/webgpu';
import { TimeSlicer } from '../core/scheduler';
import type { MaterialLibrary } from '../materials/types';
import type { TextureService } from '../textures/types';
import {
  SimpleGeometryCache,
  createBuildContext,
  createPrepareContext,
  normalizeBuild,
  objectScope,
  registerObjectMaterials,
  type BuildServices,
} from '../objects/buildSupport';
import { partQuantity, resolveObject, type ResolvedObject } from '../objects/resolve';
import type { ObjectDef, ObjectParams, PartBuild, PartDef, PartHooks } from '../objects/types';

type AnyDef = ObjectDef<ObjectParams>;
type AnyPart = PartDef<ObjectParams>;

/** Données d'une pièce instanciée (repère du nœud de la pièce = « repère N »). */
export interface InstancedData {
  meshes: THREE.InstancedMesh[];
  /** Nombre d'instances animées (minimum des `count` des maillages). */
  count: number;
  /** Matrice de chaque maillage relative au nœud (L_k) et son inverse. */
  meshLocal: THREE.Matrix4[];
  meshLocalInv: THREE.Matrix4[];
  /** L_k est l'identité (raccourci de calcul). */
  meshLocalIdentity: boolean[];
  /** Repère de repos de chaque instance dans N : F_i = L_0 × IM_0,i, décomposé. */
  framePosition: THREE.Vector3[];
  frameQuaternion: THREE.Quaternion[];
  frameScale: THREE.Vector3[];
  /** Rel_k,i = F_i⁻¹ × L_k × IM_k,i (maillage k relatif au repère de l'instance i) ; null si k = 0. */
  rel: (THREE.Matrix4[] | null)[];
  /** Matrices d'instance au repos (copie de `instanceMatrix.array` de chaque maillage). */
  restMatrices: Float32Array[];
  /** Boîte d'UNE instance dans son propre repère (instance 0). */
  instanceBox: THREE.Box3;
  /** Les bornes des maillages instanciés doivent être recalculées. */
  boundsDirty: boolean;
}

/** État d'exécution d'une pièce. */
export interface PartRuntime {
  id: string;
  def: AnyPart;
  parentId: string | null;
  children: string[];
  /** Profondeur hiérarchique (0 = premier niveau). */
  depth: number;
  node: THREE.Object3D;
  restPosition: THREE.Vector3;
  restQuaternion: THREE.Quaternion;
  restScale: THREE.Vector3;
  /** Échelle monde au repos (produit des échelles des ancêtres). */
  restWorldScale: THREE.Vector3;
  hooks: PartHooks | null;
  /** Ancrage local (repère du nœud) : `PartBuild.anchor` ou centre de la boîte. */
  anchorLocal: THREE.Vector3;
  anchorExplicit: boolean;
  instanceLabel: ((index: number) => string) | null;
  quantity: number;
  /** Maillages propres à la pièce (hors sous-pièces), détail compris quand il est construit. */
  ownMeshes: THREE.Mesh[];
  instanced: InstancedData | null;
  /** Boîte au repos des maillages propres, repère du nœud (vide pour un groupe sans géométrie). */
  localBox: THREE.Box3;
  /** Boîte au repos du sous-arbre (pièce + descendants), repère du nœud. */
  subtreeBox: THREE.Box3;
  hasGeometry: boolean;
}

export interface PickResult {
  partId: string;
  instance: number | null;
}

export interface AssemblyOptions {
  materials: MaterialLibrary;
  textures: TextureService;
  quality: 0 | 1 | 2 | 3;
  maxAnisotropy: number;
  /** Centre de la surface du tapis (monde). */
  matCenter: THREE.Vector3;
}

const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

export class Assembly {
  readonly root = new THREE.Group();
  readonly parts = new Map<string, PartRuntime>();
  /** Pièces dans l'ordre hiérarchique (parents avant enfants). */
  readonly order: PartRuntime[] = [];
  readonly resolved: ResolvedObject<ObjectParams>;
  readonly shared: Record<string, unknown> = {};
  readonly geometryCache = new SimpleGeometryCache();
  readonly services: BuildServices;
  private disposed = false;
  private registeredMaterials: string[] = [];
  /** Pièces dont la construction a échoué (remplacées par un nœud vide). */
  readonly buildErrors: string[] = [];
  private built = false;

  constructor(
    readonly def: AnyDef,
    params: Partial<ObjectParams> | undefined,
    private readonly options: AssemblyOptions,
  ) {
    this.resolved = resolveObject(def, params);
    this.services = {
      materials: options.materials,
      textures: options.textures,
      quality: options.quality,
      maxAnisotropy: options.maxAnisotropy,
    };
    this.root.name = `Objet « ${def.name} »`;
    this.root.userData.objectId = def.id;
    this.root.position.copy(options.matCenter);
    this.root.rotation.y = def.presentation?.rotationY ?? 0;
  }

  get id(): string {
    return this.def.id;
  }

  get params(): ObjectParams {
    return this.resolved.params;
  }

  get isBuilt(): boolean {
    return this.built;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Préparation puis construction des pièces par tranches (≤ ~8 ms par tranche).
   * `progress` reçoit 0..1. Retourne `false` si l'assemblage a été libéré entre-temps.
   */
  async build(progress: (value: number, label?: string) => void = () => undefined): Promise<boolean> {
    const { def } = this;
    const params = this.resolved.params;
    const slicer = new TimeSlicer(8);
    this.registeredMaterials = registerObjectMaterials(def, this.options.materials);

    progress(0, 'Préparation…');
    if (def.prepare) {
      await def.prepare(
        createPrepareContext(params, this.services, this.shared, (v, label) =>
          progress(Math.min(1, Math.max(0, v)) * 0.3, label),
        ),
      );
    }
    if (this.disposed) return false;
    slicer.reset();

    // Ordre hiérarchique : parents d'abord (ordre de déclaration conservé sinon).
    const parts = this.resolved.parts;
    const byId = this.resolved.byId;
    const ordered: AnyPart[] = [];
    const placed = new Set<string>();
    const visit = (p: AnyPart, guard: Set<string>) => {
      if (placed.has(p.id) || guard.has(p.id)) return;
      guard.add(p.id);
      const parent = p.parent ? byId.get(p.parent) : undefined;
      if (parent) visit(parent, guard);
      placed.add(p.id);
      ordered.push(p);
    };
    for (const p of parts) visit(p, new Set());

    const total = ordered.length || 1;
    for (let i = 0; i < ordered.length; i++) {
      const def_ = ordered[i]!;
      this.buildPart(def_);
      progress(0.3 + 0.7 * ((i + 1) / total), `Construction : ${def_.name}`);
      await slicer.maybeYield();
      if (this.disposed) return false;
    }

    this.finalize();
    this.built = true;
    progress(1, 'Prêt');
    return true;
  }

  private buildPart(def: AnyPart): void {
    const params = this.resolved.params;
    let node: THREE.Object3D;
    let hooks: PartHooks | null = null;
    let anchor: THREE.Vector3 | null = null;
    let instanceLabel: ((index: number) => string) | null = null;
    let instancedList: THREE.InstancedMesh[] = [];
    let built: PartBuild | null = null;
    if (def.build) {
      try {
        built = normalizeBuild(
          def.build(createBuildContext(def, params, this.services, this.geometryCache, this.shared)),
        );
      } catch (error) {
        // Une pièce en échec ne bloque pas l'ouverture : nœud vide, erreur signalée.
        console.error(`[Assembly] Construction de « ${def.id} » impossible :`, error);
        this.buildErrors.push(def.id);
      }
    }
    if (built) {
      node = built.object;
      hooks = built.hooks ?? null;
      anchor = built.anchor ? new THREE.Vector3(built.anchor[0], built.anchor[1], built.anchor[2]) : null;
      instanceLabel = built.instanceLabel ?? null;
      if (built.instanced) {
        instancedList = Array.isArray(built.instanced)
          ? [...(built.instanced as readonly THREE.InstancedMesh[])]
          : [built.instanced as THREE.InstancedMesh];
      }
    } else {
      node = new THREE.Group();
    }
    if (!node.name) node.name = def.name;
    node.userData.partId = def.id;
    node.userData.partNode = true;

    const ownMeshes: THREE.Mesh[] = [];
    node.traverse((o) => {
      o.userData.partId = def.id;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        ownMeshes.push(mesh);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    const parentRuntime = def.parent ? this.parts.get(def.parent) : undefined;
    (parentRuntime ? parentRuntime.node : this.root).add(node);
    parentRuntime?.children.push(def.id);

    const runtime: PartRuntime = {
      id: def.id,
      def,
      parentId: parentRuntime ? parentRuntime.id : null,
      children: [],
      depth: parentRuntime ? parentRuntime.depth + 1 : 0,
      node,
      restPosition: node.position.clone(),
      restQuaternion: node.quaternion.clone(),
      restScale: node.scale.clone(),
      restWorldScale: new THREE.Vector3(1, 1, 1),
      hooks,
      anchorLocal: anchor ?? new THREE.Vector3(),
      anchorExplicit: anchor !== null,
      instanceLabel,
      quantity: partQuantity(def, this.resolved.params),
      ownMeshes,
      instanced: null,
      localBox: new THREE.Box3(),
      subtreeBox: new THREE.Box3(),
      hasGeometry: ownMeshes.length > 0,
    };
    // Maillages instanciés déclarés : ils doivent appartenir au sous-arbre du nœud.
    const valid = instancedList.filter((m) => ownMeshes.includes(m));
    if (valid.length !== instancedList.length)
      console.warn(`[Assembly] ${def.id} : maillage instancié hors du nœud de la pièce ignoré.`);
    if (valid.length) runtime.instanced = this.createInstancedPlaceholder(valid);
    this.parts.set(def.id, runtime);
    this.order.push(runtime);
  }

  private createInstancedPlaceholder(meshes: THREE.InstancedMesh[]): InstancedData {
    return {
      meshes,
      count: Math.min(...meshes.map((m) => m.count)),
      meshLocal: [],
      meshLocalInv: [],
      meshLocalIdentity: [],
      framePosition: [],
      frameQuaternion: [],
      frameScale: [],
      rel: [],
      restMatrices: meshes.map((m) => new Float32Array(m.instanceMatrix.array)),
      instanceBox: new THREE.Box3(),
      boundsDirty: true,
    };
  }

  /** Calculs dépendant de l'arbre complet : boîtes locales, repères d'instances, ancrages. */
  private finalize(): void {
    this.root.updateMatrixWorld(true);
    for (const part of this.order) {
      const node = part.node;
      _inv.copy(node.matrixWorld).invert();
      // Échelle monde au repos, relative à la racine de l'objet.
      _m1.copy(this.root.matrixWorld).invert().multiply(node.matrixWorld);
      _m1.decompose(_v, new THREE.Quaternion(), part.restWorldScale);

      // Boîte des maillages propres dans le repère du nœud.
      part.localBox.makeEmpty();
      for (const mesh of part.ownMeshes) this.expandLocal(part.localBox, mesh, _inv);

      const inst = part.instanced;
      if (inst) {
        const count = inst.count;
        for (const mesh of inst.meshes) {
          const L = _m1.copy(_inv).multiply(mesh.matrixWorld).clone();
          inst.meshLocal.push(L);
          inst.meshLocalInv.push(L.clone().invert());
          inst.meshLocalIdentity.push(L.equals(new THREE.Matrix4()));
        }
        const L0 = inst.meshLocal[0]!;
        const im = new THREE.Matrix4();
        const frames: THREE.Matrix4[] = [];
        for (let i = 0; i < count; i++) {
          inst.meshes[0]!.getMatrixAt(i, im);
          const F = new THREE.Matrix4().multiplyMatrices(L0, im);
          frames.push(F);
          const p = new THREE.Vector3();
          const q = new THREE.Quaternion();
          const s = new THREE.Vector3();
          F.decompose(p, q, s);
          inst.framePosition.push(p);
          inst.frameQuaternion.push(q);
          inst.frameScale.push(s);
        }
        inst.meshes.forEach((mesh, k) => {
          if (k === 0) {
            inst.rel.push(null);
            return;
          }
          const list: THREE.Matrix4[] = [];
          for (let i = 0; i < count; i++) {
            mesh.getMatrixAt(i, im);
            list.push(
              new THREE.Matrix4().copy(frames[i]!).invert().multiply(inst.meshLocal[k]!).multiply(im),
            );
          }
          inst.rel.push(list);
        });
        // Boîte d'une instance (instance 0) dans son repère.
        inst.instanceBox.makeEmpty();
        if (count > 0) {
          inst.meshes.forEach((mesh, k) => {
            const g = mesh.geometry;
            if (!g.boundingBox) g.computeBoundingBox();
            if (!g.boundingBox) return;
            const rel = k === 0 ? _m2.identity() : _m2.copy(inst.rel[k]![0]!);
            _box.copy(g.boundingBox).applyMatrix4(rel);
            inst.instanceBox.union(_box);
          });
        }
        for (const mesh of inst.meshes) {
          mesh.computeBoundingBox();
          mesh.computeBoundingSphere();
        }
        inst.boundsDirty = false;
      }
    }
    // Boîtes de sous-arbre (enfants d'abord) et ancrages par défaut.
    for (let i = this.order.length - 1; i >= 0; i--) {
      const part = this.order[i]!;
      _inv.copy(part.node.matrixWorld).invert();
      part.subtreeBox.copy(part.localBox);
      for (const childId of part.children) {
        const child = this.parts.get(childId)!;
        if (child.subtreeBox.isEmpty()) continue;
        _m1.multiplyMatrices(_inv, child.node.matrixWorld);
        _box.copy(child.subtreeBox).applyMatrix4(_m1);
        part.subtreeBox.union(_box);
      }
      if (!part.anchorExplicit) {
        const box = part.localBox.isEmpty() ? part.subtreeBox : part.localBox;
        if (!box.isEmpty()) box.getCenter(part.anchorLocal);
      }
    }
  }

  /** Étend `box` (repère défini par `worldToLocal`) avec les bornes d'un maillage. */
  private expandLocal(box: THREE.Box3, mesh: THREE.Mesh, worldToLocal: THREE.Matrix4): void {
    const inst = mesh as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      inst.computeBoundingBox();
      if (!inst.boundingBox) return;
      _box.copy(inst.boundingBox);
    } else {
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return;
      _box.copy(g.boundingBox);
    }
    _m2.multiplyMatrices(worldToLocal, mesh.matrixWorld);
    box.union(_box.applyMatrix4(_m2));
  }

  // --- Requêtes pour la vue ----------------------------------------------------------------

  /**
   * Identifie la pièce (et l'instance éventuelle) touchée par un lancer de rayon, en remontant
   * jusqu'au nœud de pièce le plus proche.
   */
  pick(object: THREE.Object3D, instanceId?: number | null): PickResult | null {
    for (let o: THREE.Object3D | null = object; o && o !== this.root; o = o.parent) {
      const id: unknown = o.userData.partId;
      if (typeof id !== 'string') continue;
      const part = this.parts.get(id);
      if (!part) continue;
      let instance: number | null = null;
      const mesh = object as THREE.InstancedMesh;
      if (
        part.instanced &&
        mesh.isInstancedMesh &&
        part.instanced.meshes.includes(mesh) &&
        instanceId !== undefined &&
        instanceId !== null &&
        instanceId < part.instanced.count
      )
        instance = instanceId;
      return { partId: id, instance };
    }
    return null;
  }

  /** Maillages d'une pièce ; `deep` inclut ceux de ses sous-pièces. */
  meshesOf(id: string, deep = false): THREE.Mesh[] {
    const part = this.parts.get(id);
    if (!part) return [];
    if (!deep) return [...part.ownMeshes];
    const out: THREE.Mesh[] = [];
    const visit = (p: PartRuntime) => {
      out.push(...p.ownMeshes);
      for (const c of p.children) visit(this.parts.get(c)!);
    };
    visit(part);
    return out;
  }

  /** Identifiants d'une pièce et de tous ses descendants. */
  subtreeIds(id: string): string[] {
    const out: string[] = [];
    const visit = (pid: string) => {
      const p = this.parts.get(pid);
      if (!p) return;
      out.push(pid);
      for (const c of p.children) visit(c);
    };
    visit(id);
    return out;
  }

  /** Bornes monde courantes d'une pièce (sous-pièces comprises par défaut). */
  worldBounds(id: string, target: THREE.Box3, deep = true): THREE.Box3 {
    target.makeEmpty();
    const part = this.parts.get(id);
    if (!part) return target;
    part.node.updateWorldMatrix(true, false);
    const visit = (p: PartRuntime) => {
      this.expandWorld(target, p);
      if (deep) for (const c of p.children) visit(this.parts.get(c)!);
    };
    visit(part);
    return target;
  }

  /** Bornes monde courantes de l'objet entier. */
  objectBounds(target = new THREE.Box3()): THREE.Box3 {
    target.makeEmpty();
    this.root.updateWorldMatrix(true, false);
    for (const part of this.order) this.expandWorld(target, part);
    return target;
  }

  private expandWorld(target: THREE.Box3, part: PartRuntime): void {
    const inst = part.instanced;
    if (inst?.boundsDirty) this.refreshInstancedBounds(part);
    for (const mesh of part.ownMeshes) {
      mesh.updateWorldMatrix(true, false);
      const im = mesh as THREE.InstancedMesh;
      if (im.isInstancedMesh) {
        if (!im.boundingBox) im.computeBoundingBox();
        if (!im.boundingBox) continue;
        _box.copy(im.boundingBox);
      } else {
        const g = mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (!g.boundingBox) continue;
        _box.copy(g.boundingBox);
      }
      target.union(_box.applyMatrix4(mesh.matrixWorld));
    }
  }

  /** Recalcule les bornes des maillages instanciés d'une pièce (après animation des instances). */
  refreshInstancedBounds(part: PartRuntime): void {
    const inst = part.instanced;
    if (!inst) return;
    for (const mesh of inst.meshes) {
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
    inst.boundsDirty = false;
  }

  /** Ancrage monde courant d'une pièce (étiquettes, outil). */
  anchorWorld(id: string, target: THREE.Vector3): THREE.Vector3 {
    const part = this.parts.get(id);
    if (!part) return target.set(0, 0, 0);
    part.node.updateWorldMatrix(true, false);
    return target.copy(part.anchorLocal).applyMatrix4(part.node.matrixWorld);
  }

  /** Matrice monde courante de l'instance `index` (repère de l'instance) d'une pièce instanciée. */
  instanceWorldMatrix(id: string, index: number, target: THREE.Matrix4): THREE.Matrix4 {
    const part = this.parts.get(id);
    const inst = part?.instanced;
    if (!part || !inst || index >= inst.count) return target.identity();
    const mesh = inst.meshes[0]!;
    mesh.updateWorldMatrix(true, false);
    mesh.getMatrixAt(index, _m1);
    return target.multiplyMatrices(mesh.matrixWorld, _m1);
  }

  /** Centre monde courant d'une instance (centre de sa boîte). */
  instanceCenterWorld(id: string, index: number, target: THREE.Vector3): THREE.Vector3 {
    const part = this.parts.get(id);
    const inst = part?.instanced;
    if (!inst) return this.anchorWorld(id, target);
    this.instanceWorldMatrix(id, index, _m2);
    return inst.instanceBox.getCenter(target).applyMatrix4(_m2);
  }

  /** Libellé d'une instance (repli : « Nom n° i »). */
  instanceLabelOf(id: string, index: number): string {
    const part = this.parts.get(id);
    if (!part) return '';
    return part.instanceLabel ? part.instanceLabel(index) : `${part.def.name} n° ${index + 1}`;
  }

  /** Appelle les hooks `onFrame` des pièces. */
  update(dt: number, time: number): void {
    if (!this.built) return;
    for (const part of this.order) {
      if (part.hooks?.onFrame) {
        try {
          part.hooks.onFrame(dt, time);
        } catch (error) {
          console.error(`[Assembly] hook onFrame de « ${part.id} » :`, error);
        }
      }
    }
  }

  /** Libère géométries, matériaux non partagés, textures et matériaux de l'objet. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of this.order) {
      try {
        part.hooks?.dispose?.();
      } catch (error) {
        console.error(`[Assembly] hook dispose de « ${part.id} » :`, error);
      }
    }
    this.root.removeFromParent();
    disposeObjectTree(this.root);
    this.geometryCache.dispose();
    const scope = objectScope(this.def.id);
    this.options.textures.disposeScope(scope);
    this.options.materials.disposeScope(scope);
    // Alias courts `<clé>` enregistrés par l'objet : libérés s'ils ne préfixent aucun autre matériau.
    const ids = this.options.materials.ids();
    for (const id of this.registeredMaterials) {
      if (id.startsWith(scope)) continue;
      if (ids.filter((other) => other.startsWith(id)).length === 1) this.options.materials.disposeScope(id);
    }
    this.parts.clear();
    this.order.length = 0;
  }
}

/**
 * Libère un sous-arbre : géométries non mises en cache, maillages instanciés, matériaux non
 * partagés et leurs textures directes. Les géométries du cache (`userData.cached`) et les
 * matériaux de la bibliothèque (`userData.shared`) sont libérés par leurs propriétaires.
 */
export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Line).isLine && !(o as THREE.Points).isPoints) return;
    const g = mesh.geometry;
    if (g && g.userData.cached !== true) geometries.add(g);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if (m && m.userData.shared !== true) materials.add(m);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const value of Object.values(m)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    m.dispose();
  }
}
