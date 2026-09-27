/**
 * Niveau de détail adaptatif : la géométrie fine d'une pièce (`PartDef.detail`) n'est construite
 * qu'à l'approche de la caméra.
 *
 * Toutes les ~200 ms, pour chaque pièce avec `detail` : si la distance caméra → surface de sa
 * sphère englobante passe sous `detail.distance`, la construction est confiée à la file des temps
 * morts (`ctx.idle`, priorité aux plus proches) ; le résultat est rattaché à l'objet de la pièce
 * et masque ses enfants nommés dans `replaces`. Au-delà de 1,6 × `distance`, le détail est masqué,
 * puis libéré après ~20 s sans être réaffiché.
 */
import * as THREE from 'three/webgpu';
import type { IdleQueue } from '../core/scheduler';
import { createBuildContext } from '../objects/buildSupport';
import { disposeObjectTree, type Assembly, type PartRuntime } from './Assembly';
import type { PoseComposer } from './poses';

/** Intervalle entre deux évaluations (s). */
const CHECK_INTERVAL = 0.2;
/** Hystérésis de masquage (× distance). */
const HIDE_FACTOR = 1.6;
/** Délai de libération d'un détail masqué (s). */
const FREE_AFTER = 20;

type DetailState = 'none' | 'queued' | 'shown' | 'hidden';

interface DetailEntry {
  part: PartRuntime;
  state: DetailState;
  object: THREE.Object3D | null;
  meshes: THREE.Mesh[];
  /** Maillages d'origine masqués par le détail. */
  replaced: THREE.Mesh[];
  hiddenSince: number;
}

const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();

export class DetailManager {
  private readonly entries: DetailEntry[] = [];
  private timer = 0;
  private clock = 0;
  private generation = 0;

  constructor(
    private readonly assembly: Assembly,
    private readonly composer: PoseComposer,
    private readonly idle: IdleQueue,
  ) {
    for (const part of assembly.order) {
      if (part.def.detail)
        this.entries.push({ part, state: 'none', object: null, meshes: [], replaced: [], hiddenSince: 0 });
    }
  }

  get count(): number {
    return this.entries.length;
  }

  /** Nombre de détails actuellement affichés (débogage). */
  get shownCount(): number {
    return this.entries.filter((e) => e.state === 'shown').length;
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.entries.length === 0) return;
    this.clock += dt;
    this.timer += dt;
    if (this.timer < CHECK_INTERVAL) return;
    this.timer = 0;
    for (const entry of this.entries) {
      const spec = entry.part.def.detail!;
      this.assembly.worldBounds(entry.part.id, _box, false);
      if (_box.isEmpty()) continue;
      _box.getBoundingSphere(_sphere);
      const distance = Math.max(0, camera.position.distanceTo(_sphere.center) - _sphere.radius);
      if (distance < spec.distance) {
        if (entry.state === 'none') this.queueBuild(entry, distance);
        else if (entry.state === 'hidden') this.show(entry);
      } else if (distance > spec.distance * HIDE_FACTOR) {
        if (entry.state === 'shown') this.hide(entry);
        else if (entry.state === 'hidden' && this.clock - entry.hiddenSince > FREE_AFTER) this.free(entry);
      }
    }
  }

  private queueBuild(entry: DetailEntry, distance: number): void {
    entry.state = 'queued';
    const generation = this.generation;
    // Priorité plus haute pour les pièces les plus proches (la file exécute les priorités hautes d'abord).
    this.idle.push(() => {
      if (generation !== this.generation || this.assembly.isDisposed || entry.state !== 'queued') return;
      this.build(entry);
    }, -distance);
  }

  private build(entry: DetailEntry): void {
    const part = entry.part;
    const spec = part.def.detail!;
    const a = this.assembly;
    let object: THREE.Object3D;
    try {
      object = spec.build(createBuildContext(part.def, a.params, a.services, a.geometryCache, a.shared));
    } catch (error) {
      console.error(`[detail] construction du détail de « ${part.id} » :`, error);
      entry.state = 'none';
      return;
    }
    object.userData.detailOf = part.id;
    const meshes: THREE.Mesh[] = [];
    object.traverse((o) => {
      o.userData.partId = part.id;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshes.push(mesh);
      }
    });
    // Enfants remplacés (recherche dans les maillages propres de la pièce uniquement).
    const replaced: THREE.Mesh[] = [];
    for (const name of spec.replaces ?? []) {
      const target = this.findOwn(part, name);
      if (!target) continue;
      target.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && part.ownMeshes.includes(mesh)) replaced.push(mesh);
      });
    }
    part.node.add(object);
    entry.object = object;
    entry.meshes = meshes;
    entry.replaced = replaced;
    this.show(entry);
  }

  /** Objet nommé `name` appartenant à la pièce (hors sous-pièces). */
  private findOwn(part: PartRuntime, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    const visit = (o: THREE.Object3D) => {
      if (found) return;
      if (o !== part.node && o.userData.partNode === true) return;
      if (o.name === name && o !== part.node) {
        found = o;
        return;
      }
      for (const c of o.children) visit(c);
    };
    visit(part.node);
    return found;
  }

  private show(entry: DetailEntry): void {
    entry.state = 'shown';
    for (const m of entry.meshes) if (!entry.part.ownMeshes.includes(m)) entry.part.ownMeshes.push(m);
    for (const m of entry.replaced) m.userData.detailReplaced = true;
    this.composer.refreshVisibility(entry.part.id);
  }

  private hide(entry: DetailEntry): void {
    entry.state = 'hidden';
    entry.hiddenSince = this.clock;
    this.detachMeshes(entry);
    for (const m of entry.meshes) m.visible = false;
    this.composer.refreshVisibility(entry.part.id);
  }

  private detachMeshes(entry: DetailEntry): void {
    const own = entry.part.ownMeshes;
    for (const m of entry.meshes) {
      const i = own.indexOf(m);
      if (i >= 0) own.splice(i, 1);
    }
    for (const m of entry.replaced) m.userData.detailReplaced = false;
  }

  private free(entry: DetailEntry): void {
    this.detachMeshes(entry);
    if (entry.object) {
      entry.object.removeFromParent();
      disposeObjectTree(entry.object);
    }
    entry.object = null;
    entry.meshes = [];
    entry.replaced = [];
    entry.state = 'none';
    this.composer.refreshVisibility(entry.part.id);
  }

  dispose(): void {
    this.generation++;
    for (const entry of this.entries) if (entry.object) this.free(entry);
    this.entries.length = 0;
  }
}
