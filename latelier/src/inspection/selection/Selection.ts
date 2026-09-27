/**
 * Sélection à la souris (lancer de rayon BVH du `Picker`) et contours :
 * - survol : un lancer de rayon au plus toutes les 50 ms, seulement si le pointeur ou la scène
 *   ont changé → `inspection:hover` (store.hoveredId, contour « hover ») ;
 * - clic : `inspection:select` (pièce + instance) ; en démontage libre, le clic retire aussi la
 *   pièce (ou la remonte) via `inspection:toggleRemove`, après la fenêtre du double-clic ;
 * - double-clic : centrage animé de la caméra sur la pièce (ou l'instance) + `focusInfo`.
 * Contour d'UNE instance d'une pièce instanciée : `OutlineNode` entoure des objets entiers ; une
 * « doublure » par maillage instancié (même géométrie, matrice de l'instance, légèrement dilatée,
 * sans écriture de couleur ni de profondeur) est placée dans la scène et transmise au contour.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../../core/context';
import type { Assembly } from '../Assembly';
import type { InspectionCamera } from '../camera/InspectionCamera';
import type { CameraPointerListener } from '../camera/types';
import type { Picker, PickHit } from './Picker';

/** Intervalle minimal entre deux lancers de survol (s). */
const HOVER_INTERVAL = 0.05;
/** Fenêtre du double-clic (ms) : le retrait en démontage libre attend sa fin. */
const DOUBLE_CLICK_MS = 260;
/** Dilatation des doublures de contour (évite l'égalité de profondeur avec l'instance). */
const PROXY_INFLATE = 1.015;

const _ndc = new THREE.Vector2();
const _ray = new THREE.Ray();
const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _center = new THREE.Vector3();

/** Doublures d'une instance (une par maillage instancié de la pièce). */
class InstanceProxy {
  readonly meshes: THREE.Mesh[] = [];
  partId: string | null = null;
  instance = -1;
  private sources: THREE.InstancedMesh[] = [];

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly material: THREE.Material,
  ) {}

  show(partId: string, instance: number, sources: readonly THREE.InstancedMesh[]): void {
    this.partId = partId;
    this.instance = instance;
    this.sources = [...sources];
    while (this.meshes.length < sources.length) {
      const m = new THREE.Mesh(undefined, this.material);
      m.name = 'Doublure de contour';
      m.matrixAutoUpdate = false;
      m.matrixWorldAutoUpdate = false;
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.renderOrder = -1;
      this.parent.add(m);
      this.meshes.push(m);
    }
    this.meshes.forEach((m, k) => {
      const src = sources[k];
      m.visible = src !== undefined;
      if (src) m.geometry = src.geometry;
    });
    this.update();
  }

  hide(): void {
    this.partId = null;
    this.instance = -1;
    this.sources = [];
    for (const m of this.meshes) m.visible = false;
  }

  get active(): boolean {
    return this.partId !== null;
  }

  /** Suit l'instance (animation, éclatement). */
  update(): void {
    if (!this.active) return;
    for (let k = 0; k < this.sources.length; k++) {
      const src = this.sources[k]!;
      const proxy = this.meshes[k]!;
      proxy.visible = visibleChain(src) && this.instance < src.count;
      if (!proxy.visible) continue;
      const g = src.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      g.boundingBox!.getCenter(_center);
      src.getMatrixAt(this.instance, _m);
      // Dilatation autour du centre de la géométrie : S(f) puis translation c·(1 − f).
      const f = PROXY_INFLATE;
      _t.makeScale(f, f, f).setPosition(_center.x * (1 - f), _center.y * (1 - f), _center.z * (1 - f));
      proxy.matrixWorld.multiplyMatrices(src.matrixWorld, _m).multiply(_t);
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.removeFromParent();
    this.meshes.length = 0;
  }
}

function visibleChain(o: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) if (!cur.visible) return false;
  return true;
}

export interface SelectionOptions {
  ctx: AppContext;
  camera: InspectionCamera;
  picker: Picker;
  /** Parent des doublures de contour (groupe de coupe : elles sont découpées comme l'objet). */
  proxyParent: THREE.Object3D;
}

export class Selection implements CameraPointerListener {
  private assembly: Assembly | null = null;
  private pointer: { x: number; y: number } | null = null;
  private pointerDirty = false;
  private hoverTimer = 0;
  private lastHoverPart: string | null = null;
  private lastHoverInstance: number | null = null;
  private pendingToggle: { partId: string; timer: ReturnType<typeof setTimeout> } | null = null;
  private readonly hit: PickHit = {
    partId: '',
    instance: null,
    mesh: new THREE.Mesh(),
    distance: 0,
    point: new THREE.Vector3(),
    ghost: false,
  };
  private readonly proxyMaterial: THREE.MeshBasicNodeMaterial;
  private readonly hoverProxy: InstanceProxy;
  private readonly selectedProxy: InstanceProxy;
  private hoverOutline: { partId: string | null; instance: number | null } = { partId: null, instance: null };
  private selectedOutline: { partId: string | null; instance: number | null } = {
    partId: null,
    instance: null,
  };

  constructor(private readonly o: SelectionOptions) {
    this.proxyMaterial = new THREE.MeshBasicNodeMaterial({ colorWrite: false, depthWrite: false });
    this.proxyMaterial.name = 'Doublure de contour (invisible)';
    this.proxyMaterial.userData.shared = true;
    this.hoverProxy = new InstanceProxy(o.proxyParent, this.proxyMaterial);
    this.selectedProxy = new InstanceProxy(o.proxyParent, this.proxyMaterial);
    o.camera.listener = this;
  }

  attach(assembly: Assembly): void {
    this.assembly = assembly;
    this.lastHoverPart = null;
    this.lastHoverInstance = null;
    this.pointerDirty = true;
  }

  detach(): void {
    this.cancelPendingToggle();
    this.assembly = null;
    this.hoverProxy.hide();
    this.selectedProxy.hide();
    this.hoverOutline = { partId: null, instance: null };
    this.selectedOutline = { partId: null, instance: null };
    this.o.ctx.postfx.setOutline('hover', []);
    this.o.ctx.postfx.setOutline('selected', []);
    this.o.camera.setHoverCursor(false);
  }

  /** La scène a changé (poses, visibilité) : le survol est réévalué. */
  notifySceneChanged(): void {
    this.pointerDirty = true;
  }

  // --- Écouteur de la caméra ------------------------------------------------------------------

  onPointerMove(clientX: number, clientY: number): void {
    if (!this.pointer) this.pointer = { x: clientX, y: clientY };
    this.pointer.x = clientX;
    this.pointer.y = clientY;
    this.pointerDirty = true;
  }

  onPointerLeave(): void {
    this.pointer = null;
    this.setHoverTarget(null, null);
  }

  onClick(clientX: number, clientY: number): void {
    const a = this.assembly;
    if (!a) return;
    const { bus, store } = this.o.ctx;
    const hit = this.pickAt(clientX, clientY);
    if (!hit) {
      this.cancelPendingToggle();
      bus.emit('inspection:select', { partId: null });
      return;
    }
    const pending = this.pendingToggle;
    // Second clic d'un double-clic : ni nouvelle sélection ni nouveau retrait.
    if (pending && pending.partId === hit.partId) return;
    bus.emit('inspection:select', { partId: hit.partId, instance: hit.instance });
    if (store.getState().inspection?.mode !== 'free') return;
    this.cancelPendingToggle();
    const partId = hit.partId;
    this.pendingToggle = {
      partId,
      timer: setTimeout(() => {
        this.pendingToggle = null;
        if (this.assembly === a) bus.emit('inspection:toggleRemove', { partId });
      }, DOUBLE_CLICK_MS),
    };
  }

  onDoubleClick(clientX: number, clientY: number): void {
    this.cancelPendingToggle();
    const a = this.assembly;
    if (!a) return;
    const hit = this.pickAt(clientX, clientY);
    if (!hit) return;
    this.o.ctx.bus.emit('inspection:select', { partId: hit.partId, instance: hit.instance });
    this.focusPart(hit.partId, hit.instance);
    this.o.ctx.bus.emit('inspection:focusInfo', { partId: hit.partId });
  }

  /** Centre la caméra sur une pièce (ou une instance). */
  focusPart(partId: string, instance: number | null): void {
    const a = this.assembly;
    if (!a) return;
    const part = a.parts.get(partId);
    if (!part) return;
    if (instance !== null && part.instanced) {
      a.instanceCenterWorld(partId, instance, _sphere.center);
      _box.copy(part.instanced.instanceBox);
      _sphere.radius = Math.max(
        1e-4,
        (_box.isEmpty() ? 0.002 : _box.getSize(_center).length() / 2) * part.restWorldScale.x,
      );
    } else {
      a.worldBounds(partId, _box);
      if (_box.isEmpty()) return;
      _box.getBoundingSphere(_sphere);
    }
    this.o.camera.focusOn(_sphere.center, _sphere.radius);
  }

  private cancelPendingToggle(): void {
    if (this.pendingToggle) clearTimeout(this.pendingToggle.timer);
    this.pendingToggle = null;
  }

  private pickAt(clientX: number, clientY: number): PickHit | null {
    const canvas = this.o.ctx.engine.canvas;
    const rect = canvas.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const camera = this.o.ctx.engine.camera;
    _ray.origin.setFromMatrixPosition(camera.matrixWorld);
    _ray.direction.set(_ndc.x, _ndc.y, 0.5).unproject(camera).sub(_ray.origin).normalize();
    return this.o.picker.pick(_ray, this.hit) ? this.hit : null;
  }

  // --- Boucle -----------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.assembly) return;
    this.hoverTimer += dt;
    if (this.pointer && this.pointerDirty && this.hoverTimer >= HOVER_INTERVAL) {
      this.hoverTimer = 0;
      this.pointerDirty = false;
      const hit = this.pickAt(this.pointer.x, this.pointer.y);
      this.setHoverTarget(hit?.partId ?? null, hit?.instance ?? null);
    }
    this.hoverProxy.update();
    this.selectedProxy.update();
  }

  private setHoverTarget(partId: string | null, instance: number | null): void {
    const samePart = partId === this.lastHoverPart;
    const sameInstance = instance === this.lastHoverInstance;
    this.lastHoverInstance = instance;
    this.o.camera.setHoverCursor(partId !== null);
    if (samePart && sameInstance) return;
    this.lastHoverPart = partId;
    if (samePart) this.showHover(partId);
    else this.o.ctx.bus.emit('inspection:hover', { partId });
  }

  // --- Contours ---------------------------------------------------------------------------

  /** Contour de survol : l'instance survolée si elle vient de la souris, sinon la pièce. */
  showHover(partId: string | null): void {
    const instance = partId !== null && partId === this.lastHoverPart ? this.lastHoverInstance : null;
    if (this.hoverOutline.partId === partId && this.hoverOutline.instance === instance) return;
    this.hoverOutline = { partId, instance };
    this.o.ctx.postfx.setOutline('hover', this.outlineObjects(partId, instance, this.hoverProxy));
  }

  /** Contour de la sélection (pièce ou instance). */
  showSelected(partId: string | null, instance: number | null): void {
    if (this.selectedOutline.partId === partId && this.selectedOutline.instance === instance) return;
    this.selectedOutline = { partId, instance };
    this.o.ctx.postfx.setOutline('selected', this.outlineObjects(partId, instance, this.selectedProxy));
  }

  private outlineObjects(
    partId: string | null,
    instance: number | null,
    proxy: InstanceProxy,
  ): THREE.Object3D[] {
    const a = this.assembly;
    if (!a || !partId) {
      proxy.hide();
      return [];
    }
    const part = a.parts.get(partId);
    if (part?.instanced && instance !== null && instance < part.instanced.count) {
      proxy.show(partId, instance, part.instanced.meshes);
      return proxy.meshes.slice(0, part.instanced.meshes.length);
    }
    proxy.hide();
    return a.meshesOf(partId, true);
  }

  dispose(): void {
    this.detach();
    this.hoverProxy.dispose();
    this.selectedProxy.dispose();
    this.proxyMaterial.dispose();
    if (this.o.camera.listener === this) this.o.camera.listener = null;
  }
}
