/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CAMÉRA D'INSPECTION TEMPORAIRE (mise au point du moteur de démontage).
 * Elle sera remplacée par la caméra de l'agent « vue » (orbite amortie, zoom macro, cadrage
 * soigné, sélection au survol…) derrière l'interface `InspectionCameraController`.
 *
 * Contenu volontairement simple : OrbitControls (amorti, zoom vers le curseur), plans near/far
 * adaptés à la distance, transitions douces de cadrage, et une sélection minimale à la souris
 * (clic = sélection, double-clic = retirer/remonter, survol) pour tester le démontage libre.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { easeInOutCubic } from './easing';

/** Contrat d'une caméra d'inspection (implémentation définitive fournie par la vue). */
export interface InspectionCameraController {
  readonly active: boolean;
  /** Prend le contrôle de la caméra et se place sur la vue initiale (transition douce). */
  activate(view: InspectionViewPose): void;
  /** Rend le contrôle (transitions d'entrée/sortie). */
  deactivate(): void;
  update(dt: number): void;
  /** Cadre une boîte monde (transition douce). */
  frameBox(box: THREE.Box3): void;
  /** Retour à la vue initiale. */
  resetView(): void;
  dispose(): void;
}

export interface InspectionViewPose {
  target: THREE.Vector3;
  /** Direction de la cible vers la caméra (monde, normalisée). */
  direction: THREE.Vector3;
  distance: number;
  /** Distance minimale caméra → cible (m). */
  minDistance: number;
}

/** Sélection minimale à la souris (temporaire) : callbacks branchés par l'orchestrateur. */
export interface BasicPickHandlers {
  /** Objets candidats au lancer de rayon. */
  targets: () => THREE.Object3D | null;
  onHover: (object: THREE.Object3D | null, instanceId: number | null) => void;
  onClick: (object: THREE.Object3D | null, instanceId: number | null) => void;
  onDoubleClick: (object: THREE.Object3D | null, instanceId: number | null) => void;
}

/** Distance de cadrage pour qu'une sphère de rayon `radius` tienne dans le champ vertical. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 1.25): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.2, aspect));
  const fov = Math.min(vFov, hFov);
  return (Math.max(radius, 1e-4) * margin) / Math.sin(fov / 2);
}

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  elapsed: number;
  duration: number;
}

export class BasicCamera implements InspectionCameraController {
  private readonly controls: OrbitControls;
  private flight: Flight | null = null;
  private home: InspectionViewPose | null = null;
  private isActive = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private downX = 0;
  private downY = 0;
  private hoverTimer = 0;
  private lastMove: PointerEvent | null = null;
  private readonly disposers: (() => void)[] = [];
  private readonly sphere = new THREE.Sphere();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly pick: BasicPickHandlers | null = null,
  ) {
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    this.controls.maxDistance = 1.6;
    this.controls.rotateSpeed = 0.7;
    if (pick) this.bindPointer(pick);
  }

  get active(): boolean {
    return this.isActive;
  }

  activate(view: InspectionViewPose): void {
    this.home = {
      target: view.target.clone(),
      direction: view.direction.clone().normalize(),
      distance: view.distance,
      minDistance: view.minDistance,
    };
    this.isActive = true;
    this.controls.enabled = true;
    this.controls.minDistance = view.minDistance;
    this.flyTo(view.target, view.target.clone().addScaledVector(this.home.direction, view.distance), 0.8, true);
  }

  deactivate(): void {
    this.isActive = false;
    this.controls.enabled = false;
    this.flight = null;
  }

  frameBox(box: THREE.Box3): void {
    if (!this.isActive || box.isEmpty()) return;
    box.getBoundingSphere(this.sphere);
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    if (dir.lengthSq() < 1e-8) dir.set(0, 0.6, 1).normalize();
    const distance = fitDistance(this.sphere.radius, this.camera.fov, this.camera.aspect, 1.35);
    this.flyTo(this.sphere.center, this.sphere.center.clone().addScaledVector(dir, distance), 0.6, false);
  }

  resetView(): void {
    if (!this.home || !this.isActive) return;
    const h = this.home;
    this.flyTo(h.target, h.target.clone().addScaledVector(h.direction, h.distance), 0.7, false);
  }

  private flyTo(target: THREE.Vector3, position: THREE.Vector3, duration: number, fromCurrentView: boolean): void {
    // Cible de départ : point regardé actuellement (transition depuis la caméra de l'établi).
    const fromTarget = fromCurrentView
      ? this.camera.position
          .clone()
          .add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(this.camera.position.distanceTo(target)))
      : this.controls.target.clone();
    this.flight = {
      fromTarget,
      toTarget: target.clone(),
      fromPosition: this.camera.position.clone(),
      toPosition: position.clone(),
      elapsed: 0,
      duration,
    };
  }

  update(dt: number): void {
    if (!this.isActive) return;
    const f = this.flight;
    if (f) {
      f.elapsed += dt;
      const k = easeInOutCubic(f.elapsed / f.duration);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      this.camera.position.lerpVectors(f.fromPosition, f.toPosition, k);
      this.camera.lookAt(this.controls.target);
      if (f.elapsed >= f.duration) this.flight = null;
      // Pendant une transition, l'amorti ne doit pas réinjecter d'élan.
      this.controls.update(0);
    } else {
      this.controls.update(dt);
    }
    this.adaptClipping();
    if (this.pick && this.lastMove) {
      this.hoverTimer += dt;
      if (this.hoverTimer > 0.08) {
        this.hoverTimer = 0;
        const e = this.lastMove;
        this.lastMove = null;
        const hit = this.raycast(e);
        this.pick.onHover(hit?.object ?? null, hit?.instanceId ?? null);
      }
    }
  }

  /** Plans near/far selon la distance à la cible (profondeur inversée : large plage tolérée). */
  private adaptClipping(): void {
    const d = this.camera.position.distanceTo(this.controls.target);
    const near = THREE.MathUtils.clamp(d * 0.02, 1e-5, 0.02);
    const far = Math.max(14, d * 60);
    if (Math.abs(near - this.camera.near) > near * 0.05 || far !== this.camera.far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }

  // --- Sélection minimale (temporaire) ------------------------------------------------------

  private bindPointer(pick: BasicPickHandlers): void {
    const canvas = this.canvas;
    const onDown = (e: PointerEvent) => {
      this.downX = e.clientX;
      this.downY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (!this.isActive || e.button !== 0) return;
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 4) return;
      const hit = this.raycast(e);
      pick.onClick(hit?.object ?? null, hit?.instanceId ?? null);
    };
    const onDbl = (e: MouseEvent) => {
      if (!this.isActive) return;
      const hit = this.raycast(e);
      pick.onDoubleClick(hit?.object ?? null, hit?.instanceId ?? null);
    };
    const onMove = (e: PointerEvent) => {
      if (this.isActive) this.lastMove = e;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('pointermove', onMove);
    this.disposers.push(
      () => canvas.removeEventListener('pointerdown', onDown),
      () => canvas.removeEventListener('pointerup', onUp),
      () => canvas.removeEventListener('dblclick', onDbl),
      () => canvas.removeEventListener('pointermove', onMove),
    );
  }

  private raycast(e: MouseEvent): { object: THREE.Object3D; instanceId: number | null } | null {
    const root = this.pick?.targets();
    if (!root) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(root, true);
    const hit = hits.find((h) => h.object.visible && isVisibleChain(h.object));
    return hit ? { object: hit.object, instanceId: hit.instanceId ?? null } : null;
  }

  dispose(): void {
    this.deactivate();
    for (const d of this.disposers) d();
    this.controls.dispose();
  }
}

function isVisibleChain(o: THREE.Object3D): boolean {
  for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) if (!cur.visible) return false;
  return true;
}
