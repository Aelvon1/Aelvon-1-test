/**
 * Caméra d'inspection (sans OrbitControls) : cible + azimut/élévation + distance.
 *
 * - Clic gauche + glisser : orbite ; clic droit ou molette-clic + glisser : panoramique écran
 *   (proportionnel à la distance) ; molette : zoom exponentiel vers le point sous le curseur
 *   (lancer de rayon BVH, homothétie de centre le point visé : la cible glisse vers lui).
 * - Amortissement : l'état courant suit un état « but » (lissage exponentiel indépendant de la
 *   cadence) ; au lâcher, l'élan de l'orbite et du panoramique décroît (inertie).
 * - Garde-fous : jamais sous le tapis ni hors de la pièce (distance raccourcie contre les murs),
 *   jamais à travers la géométrie (segment parcouru testé par lancer de rayon, distance libre ≥
 *   `minSurfaceDistance`), sinon le mouvement de l'image est annulé et l'élan coupé.
 * - Plans near/far recalculés à chaque image à partir de la distance libre (voir `orbitMath`).
 * - Transitions douces (cadrage, vue initiale, centrage) : interpolation de l'état, distance en
 *   échelle logarithmique ; toute action de l'utilisateur les interrompt.
 */
import * as THREE from 'three/webgpu';
import { easeInOutCubic } from '../easing';
import {
  MAX_ELEVATION,
  MIN_ELEVATION,
  computeClipRange,
  damp,
  distanceInsideBox,
  effectiveMinSurfaceDistance,
  fitDistance,
  isClick,
  lerpLog,
  minElevationAboveFloor,
  orbitAngles,
  orbitOffset,
  shortestAngle,
  wheelZoomFactor,
  worldPerPixel,
  zoomTowardPoint,
} from './orbitMath';
import type {
  CameraPointerListener,
  CameraSceneQuery,
  InspectionCameraController,
  InspectionViewPose,
  ProbeHit,
} from './types';

export interface InspectionCameraOptions {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  /** Requêtes géométriques sur l'objet (null tant qu'aucun objet n'est ouvert). */
  query: () => CameraSceneQuery | null;
  /** Hauteur de la surface du tapis (m, monde) : la caméra reste au-dessus. */
  floorY: number;
  /** Volume autorisé pour la caméra (murs, plafond). */
  roomBounds: THREE.Box3;
  /** Profondeur inversée disponible (WebGPU, WebGL2 avec EXT_clip_control). */
  reversedDepth: boolean;
  /** Champ de vision vertical (degrés). */
  fov: number;
}

/** État orbital. */
interface OrbitState {
  target: THREE.Vector3;
  azimuth: number;
  elevation: number;
  distance: number;
}

interface Flight {
  from: OrbitState;
  to: OrbitState;
  elapsed: number;
  duration: number;
}

type DragMode = 'orbit' | 'pan';

interface Drag {
  mode: DragMode;
  pointerId: number;
  button: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  lastTime: number;
  /** A franchi le seuil de clic : c'est un glisser. */
  moved: boolean;
}

/** Raideur du lissage (1/s) : ~95 % du chemin en 0,19 s. */
const SMOOTHING = 16;
/** Décroissance de l'élan (1/s). */
const INERTIA_DECAY = 5;
/** Vitesse d'orbite : tours par hauteur d'écran glissée. */
const ORBIT_TURNS_PER_SCREEN = 0.75;
/** Marge aux murs et au plafond (m). */
const WALL_MARGIN = 0.05;
/** Durées des transitions (s). */
const ACTIVATE_SECONDS = 0.8;
const FRAME_SECONDS = 0.6;
const RESET_SECONDS = 0.7;
const FOCUS_SECONDS = 0.55;
/** Distance maximale caméra → cible (m). */
const MAX_DISTANCE = 2.2;
/** Rayon de recherche de la distance libre (m) : au-delà, near est à son maximum. */
const CLEARANCE_SEARCH = 0.08;

const _offset = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _v = new THREE.Vector3();
const _point = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Ray();
const _plane = new THREE.Plane();
const _sphere = new THREE.Sphere();
const _corner = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _angles = { azimuth: 0, elevation: 0 };

const newState = (): OrbitState => ({ target: new THREE.Vector3(), azimuth: 0, elevation: 0, distance: 1 });

function copyState(src: OrbitState, dst: OrbitState): OrbitState {
  dst.target.copy(src.target);
  dst.azimuth = src.azimuth;
  dst.elevation = src.elevation;
  dst.distance = src.distance;
  return dst;
}

export class InspectionCamera implements InspectionCameraController {
  /** Écouteur des clics / survols (sélection). */
  listener: CameraPointerListener | null = null;
  /** Rayon de l'objet (m) : borne la distance maximale et le recentrage de la cible. */
  objectRadius = 0.1;
  /** Centre de l'objet (monde) : la cible ne s'en éloigne pas au-delà de 2 rayons. */
  readonly objectCenter = new THREE.Vector3();

  private isActive = false;
  private readonly current = newState();
  private readonly goal = newState();
  private readonly lastValid = newState();
  private readonly home = newState();
  private flight: Flight | null = null;
  private drag: Drag | null = null;
  private readonly orbitVelocity = new THREE.Vector2();
  private readonly panVelocity = new THREE.Vector3();
  private minSurface = 0.002;
  /** Distance d'arrivée de la dernière transition : le recul maximal ne la contredit pas. */
  private flightDistanceFloor = 0;
  /** La scène a changé (poses, visibilité, coupe) : distance libre à recalculer. */
  private sceneDirty = true;
  private readonly lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  private lastClearance = Infinity;
  /** Distance libre déjà calculée pour la position validée de l'image (évite une requête). */
  private pendingClearance: number | null = null;
  private hoverPointer = false;
  private readonly probeHit: ProbeHit = { distance: 0, backFace: false };
  private readonly disposers: (() => void)[] = [];

  constructor(private readonly o: InspectionCameraOptions) {
    this.bindPointer();
  }

  get active(): boolean {
    return this.isActive;
  }

  /** Cible courante (monde). */
  get target(): THREE.Vector3 {
    return this.current.target;
  }

  get distance(): number {
    return this.current.distance;
  }

  /** Distance minimale effective à la surface (m). */
  get minSurfaceDistance(): number {
    return effectiveMinSurfaceDistance(this.minSurface, this.farDistance(), this.o.reversedDepth);
  }

  /** Distance libre courante de la caméra (m, Infinity au-delà du rayon de recherche). */
  get clearance(): number {
    return this.lastClearance;
  }

  /** Signale un changement de la scène inspectée (poses, visibilité, coupe…). */
  notifySceneChanged(): void {
    this.sceneDirty = true;
  }

  /** Curseur « main » au survol d'une pièce. */
  setHoverCursor(onPart: boolean): void {
    this.hoverPointer = onPart;
    this.applyCursor();
  }

  // --- Contrat InspectionCameraController -----------------------------------------------------

  activate(view: InspectionViewPose): void {
    this.minSurface = Math.max(1e-4, view.minDistance);
    orbitAngles(view.direction, _angles);
    this.home.target.copy(view.target);
    this.home.azimuth = _angles.azimuth;
    this.home.elevation = _angles.elevation;
    this.home.distance = view.distance;
    this.isActive = true;
    this.sceneDirty = true;
    this.lastPosition.set(Infinity, Infinity, Infinity);
    this.orbitVelocity.set(0, 0);
    this.panVelocity.set(0, 0, 0);
    this.o.camera.fov = this.o.fov;
    // État de départ : pose actuelle de la caméra (fin de la transition vers l'établi).
    this.stateFromCamera(view.target, this.current);
    copyState(this.current, this.goal);
    copyState(this.current, this.lastValid);
    const to = copyState(this.home, newState());
    to.distance = this.resolveDistance(to.target, to.azimuth, to.elevation, to.distance);
    if (view.instant) {
      copyState(to, this.current);
      copyState(to, this.goal);
      copyState(to, this.lastValid);
      this.flight = null;
    } else {
      this.startFlight(to, ACTIVATE_SECONDS);
    }
    this.applyCursor();
    this.writeCamera();
  }

  deactivate(): void {
    this.isActive = false;
    this.flight = null;
    this.endDrag();
    this.orbitVelocity.set(0, 0);
    this.panVelocity.set(0, 0, 0);
    this.o.canvas.style.cursor = '';
    // Plans sûrs pour les transitions vers la salle (le joueur rétablit les siens).
    const camera = this.o.camera;
    camera.near = 0.02;
    camera.far = 60;
    camera.updateProjectionMatrix();
  }

  frameBox(box: THREE.Box3): void {
    if (!this.isActive || box.isEmpty()) return;
    box.getBoundingSphere(_sphere);
    const camera = this.o.camera;
    const to = copyState(this.goal, newState());
    to.target.copy(_sphere.center);
    to.distance = Math.max(
      this.minSurfaceDistance * 2,
      fitDistance(_sphere.radius, camera.fov, camera.aspect, 1.3),
    );
    to.distance = this.resolveDistance(to.target, to.azimuth, to.elevation, to.distance);
    this.startFlight(to, FRAME_SECONDS);
  }

  resetView(): void {
    if (!this.isActive) return;
    const to = copyState(this.home, newState());
    to.distance = this.resolveDistance(to.target, to.azimuth, to.elevation, to.distance);
    this.startFlight(to, RESET_SECONDS);
  }

  /**
   * Centre la vue sur un point (double-clic) : la distance est conservée tant que la sphère de
   * rayon `radius` y est lisible (entre 1,2 et 4 fois la distance de cadrage).
   */
  focusOn(center: THREE.Vector3, radius: number): void {
    if (!this.isActive) return;
    const camera = this.o.camera;
    const fit = fitDistance(radius, camera.fov, camera.aspect, 1);
    const to = copyState(this.goal, newState());
    to.target.copy(center);
    to.distance = THREE.MathUtils.clamp(this.goal.distance, fit * 1.2, fit * 4);
    to.distance = Math.max(to.distance, this.minSurfaceDistance * 2);
    to.distance = this.resolveDistance(to.target, to.azimuth, to.elevation, to.distance);
    this.startFlight(to, FOCUS_SECONDS);
  }

  /** Place la caméra immédiatement (paramètres de développement, captures). */
  setView(target: THREE.Vector3, direction: THREE.Vector3, distance: number): void {
    orbitAngles(direction, _angles);
    const s = this.current;
    s.target.copy(target);
    s.azimuth = _angles.azimuth;
    s.elevation = _angles.elevation;
    s.distance = distance;
    copyState(s, this.goal);
    copyState(s, this.lastValid);
    this.flight = null;
    this.sceneDirty = true;
    this.lastPosition.set(Infinity, Infinity, Infinity);
    this.writeCamera();
  }

  update(dt: number): void {
    if (!this.isActive) return;
    const cur = this.current;
    const goal = this.goal;
    let checkGeometry = true;
    if (this.flight) {
      const f = this.flight;
      f.elapsed += dt;
      const t = easeInOutCubic(f.elapsed / f.duration);
      interpolateState(f.from, f.to, t, cur);
      copyState(cur, goal);
      if (f.elapsed >= f.duration) this.flight = null;
      // Transition automatique : sa destination a été validée, le trajet n'est pas bloqué.
      checkGeometry = false;
    } else {
      this.applyInertia(dt);
      const k = damp(SMOOTHING, dt);
      cur.target.lerp(goal.target, k);
      cur.azimuth += shortestAngle(cur.azimuth, goal.azimuth) * k;
      cur.elevation += (goal.elevation - cur.elevation) * k;
      cur.distance += (goal.distance - cur.distance) * k;
      if (Math.abs(goal.distance - cur.distance) < goal.distance * 1e-5) cur.distance = goal.distance;
    }
    this.applyEnvironmentLimits(cur);
    this.applyEnvironmentLimits(goal);
    this.positionOf(cur, _pos);
    const moved = _pos.distanceToSquared(this.lastPosition) > 1e-16;
    if (moved && checkGeometry && !this.validateMove(this.lastPosition, _pos)) {
      // Mouvement refusé : retour au dernier état valide, élan coupé.
      copyState(this.lastValid, cur);
      copyState(this.lastValid, goal);
      this.orbitVelocity.set(0, 0);
      this.panVelocity.set(0, 0, 0);
      this.pendingClearance = null;
      this.positionOf(cur, _pos);
    }
    if (moved || this.sceneDirty) this.writeCamera();
  }

  dispose(): void {
    this.deactivate();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }

  // --- État, contraintes ------------------------------------------------------------------

  private positionOf(s: OrbitState, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(s.target).add(orbitOffset(s.azimuth, s.elevation, s.distance, _offset));
  }

  /** État orbital équivalent à la pose actuelle de la caméra, en visant la distance de `target`. */
  private stateFromCamera(target: THREE.Vector3, out: OrbitState): void {
    const camera = this.o.camera;
    camera.getWorldDirection(_dir);
    const distance = Math.max(1e-3, camera.position.distanceTo(target));
    out.target.copy(camera.position).addScaledVector(_dir, distance);
    orbitAngles(_v.copy(camera.position).sub(out.target), _angles);
    out.azimuth = _angles.azimuth;
    out.elevation = _angles.elevation;
    out.distance = distance;
  }

  /** Tapis, murs, plafond, distances extrêmes, cible près de l'objet. */
  private applyEnvironmentLimits(s: OrbitState): void {
    // La cible ne s'éloigne pas de l'objet (zoom arrière décentré, panoramique).
    const maxOffset = Math.max(0.05, this.objectRadius * 2.5);
    _v.subVectors(s.target, this.objectCenter);
    if (_v.lengthSq() > maxOffset * maxOffset) s.target.copy(this.objectCenter).add(_v.setLength(maxOffset));
    const minD = this.minSurfaceDistance;
    // Recul maximal : 4 cadrages de l'objet, et au moins la distance de la dernière transition
    // (vue rangée, qui s'étend pendant son animation).
    const maxD = Math.min(
      MAX_DISTANCE,
      Math.max(0.3, fitDistance(this.objectRadius, this.o.fov, 1, 4), this.flightDistanceFloor * 1.25),
    );
    s.distance = THREE.MathUtils.clamp(s.distance, minD, maxD);
    const floorMargin = Math.max(minD, 0.003);
    const minEl = minElevationAboveFloor(s.target.y, s.distance, this.o.floorY, floorMargin);
    s.elevation = THREE.MathUtils.clamp(s.elevation, Math.max(MIN_ELEVATION, minEl), MAX_ELEVATION);
    // Murs et plafond : la distance est raccourcie le long de la direction de vue.
    orbitOffset(s.azimuth, s.elevation, 1, _dir);
    _v.copy(this.o.roomBounds.min).addScalar(WALL_MARGIN);
    _corner.copy(this.o.roomBounds.max).subScalar(WALL_MARGIN);
    const inner = _tmpBox.set(_v, _corner);
    const room = distanceInsideBox(s.target, _dir, inner);
    if (Number.isFinite(room)) s.distance = Math.max(minD, Math.min(s.distance, room));
  }

  /**
   * Mouvement de `from` à `to` acceptable ? Refusé s'il traverse une surface ou s'il amène la
   * caméra à moins de la distance minimale d'une surface (sauf s'il l'en éloigne).
   */
  private validateMove(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const q = this.o.query();
    if (!q) return true;
    const min = this.minSurfaceDistance;
    const clearTo = q.clearance(to, CLEARANCE_SEARCH);
    this.pendingClearance = clearTo;
    if (!Number.isFinite(from.x)) return true;
    const clearFrom = this.sceneDirty ? q.clearance(from, CLEARANCE_SEARCH) : this.lastClearance;
    if (clearTo < min && clearTo < clearFrom) return false;
    if (clearFrom < min) return true;
    const length = from.distanceTo(to);
    if (length < 1e-9) return true;
    _dir.subVectors(to, from).divideScalar(length);
    return q.obstacleDistance(from, _dir, length) > length;
  }

  /**
   * Distance de caméra valide le long de la direction (azimut, élévation) : si la position voulue
   * est dans la matière (première surface vue de dos) ou trop près d'une surface, la caméra
   * recule jusqu'à l'extérieur.
   */
  private resolveDistance(
    target: THREE.Vector3,
    azimuth: number,
    elevation: number,
    desired: number,
  ): number {
    const q = this.o.query();
    if (!q) return desired;
    const min = this.minSurfaceDistance;
    orbitOffset(azimuth, elevation, 1, _dir);
    let d = desired;
    for (let i = 0; i < 12; i++) {
      _pos.copy(target).addScaledVector(_dir, d);
      if (q.probe(_pos, _dir, MAX_DISTANCE, this.probeHit) && this.probeHit.backFace) {
        d += this.probeHit.distance + min * 2;
        continue;
      }
      if (q.clearance(_pos, min) < min) {
        d += Math.max(min * 2, d * 0.1);
        continue;
      }
      break;
    }
    return Math.min(d, MAX_DISTANCE);
  }

  private startFlight(to: OrbitState, duration: number): void {
    this.flightDistanceFloor = to.distance;
    this.flight = { from: copyState(this.current, newState()), to, elapsed: 0, duration };
    this.orbitVelocity.set(0, 0);
    this.panVelocity.set(0, 0, 0);
  }

  private applyInertia(dt: number): void {
    if (this.drag?.moved) return;
    const decay = Math.exp(-INERTIA_DECAY * dt);
    if (this.orbitVelocity.lengthSq() > 1e-6) {
      this.goal.azimuth += this.orbitVelocity.x * dt;
      this.goal.elevation += this.orbitVelocity.y * dt;
      this.orbitVelocity.multiplyScalar(decay);
    } else this.orbitVelocity.set(0, 0);
    if (this.panVelocity.lengthSq() > 1e-12) {
      this.goal.target.addScaledVector(this.panVelocity, dt);
      this.panVelocity.multiplyScalar(decay);
    } else this.panVelocity.set(0, 0, 0);
  }

  // --- Caméra three.js --------------------------------------------------------------------

  private writeCamera(): void {
    const camera = this.o.camera;
    const s = this.current;
    this.positionOf(s, _pos);
    camera.position.copy(_pos);
    camera.up.copy(_Y);
    camera.lookAt(s.target);
    camera.updateMatrixWorld();
    const q = this.o.query();
    if (this.pendingClearance !== null && !this.sceneDirty) this.lastClearance = this.pendingClearance;
    else if (q && (this.sceneDirty || _pos.distanceToSquared(this.lastPosition) > 1e-16))
      this.lastClearance = q.clearance(_pos, CLEARANCE_SEARCH);
    else if (!q) this.lastClearance = Infinity;
    this.pendingClearance = null;
    this.sceneDirty = false;
    copyState(s, this.lastValid);
    this.lastPosition.copy(_pos);
    this.updateClipPlanes(_pos);
  }

  /** Distance nécessaire pour voir toute la pièce depuis la caméra (coin le plus éloigné). */
  private farDistance(): number {
    const b = this.o.roomBounds;
    const p = this.o.camera.position;
    const dx = Math.max(Math.abs(p.x - b.min.x), Math.abs(p.x - b.max.x));
    const dy = Math.max(Math.abs(p.y - b.min.y), Math.abs(p.y - b.max.y));
    const dz = Math.max(Math.abs(p.z - b.min.z), Math.abs(p.z - b.max.z));
    return Math.hypot(dx, dy, dz) * 1.05;
  }

  private updateClipPlanes(position: THREE.Vector3): void {
    const camera = this.o.camera;
    const b = this.o.roomBounds;
    // Surfaces analytiques : tapis (plan) et parois de la pièce.
    const walls = Math.min(
      position.x - b.min.x,
      b.max.x - position.x,
      position.z - b.min.z,
      b.max.z - position.z,
      b.max.y - position.y,
    );
    const clearance = Math.min(this.lastClearance, Math.max(0, position.y - this.o.floorY), walls);
    const { near, far } = computeClipRange({
      clearance,
      farDistance: this.farDistance(),
      reversedDepth: this.o.reversedDepth,
    });
    if (
      Math.abs(near - camera.near) > camera.near * 0.01 ||
      Math.abs(far - camera.far) > camera.far * 0.01 ||
      camera.fov !== this.o.fov
    ) {
      camera.near = near;
      camera.far = far;
      camera.fov = this.o.fov;
      camera.updateProjectionMatrix();
    }
  }

  // --- Pointeur ---------------------------------------------------------------------------

  private bindPointer(): void {
    const canvas = this.o.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      canvas.addEventListener(type, handler, options);
      this.disposers.push(() => canvas.removeEventListener(type, handler, options));
    };
    on('pointerdown', (e) => this.onPointerDown(e));
    on('pointermove', (e) => this.onPointerMove(e));
    on('pointerup', (e) => this.onPointerUp(e));
    on('pointercancel', () => this.endDrag());
    on('pointerleave', () => {
      if (this.isActive && !this.drag) this.listener?.onPointerLeave();
    });
    on('dblclick', (e) => {
      if (this.isActive) this.listener?.onDoubleClick(e.clientX, e.clientY);
    });
    on('wheel', (e) => this.onWheel(e), { passive: false });
    on('contextmenu', (e) => {
      if (this.isActive) e.preventDefault();
    });
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.isActive || this.drag) return;
    const mode: DragMode | null = e.button === 0 ? 'orbit' : e.button === 1 || e.button === 2 ? 'pan' : null;
    if (!mode) return;
    if (e.button === 1) e.preventDefault();
    const now = performance.now();
    this.drag = {
      mode,
      pointerId: e.pointerId,
      button: e.button,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startTime: now,
      lastTime: now,
      moved: false,
    };
    try {
      this.o.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture refusée (pointeur déjà relâché) : le glisser s'arrêtera à la sortie du canvas.
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.isActive) return;
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) {
      this.listener?.onPointerMove(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    const now = performance.now();
    const dtEvent = Math.max(1, now - d.lastTime) / 1000;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastTime = now;
    if (!d.moved && !isClick(e.clientX - d.startX, e.clientY - d.startY, 0)) {
      d.moved = true;
      // L'utilisateur reprend la main : transition interrompue à la pose courante.
      if (this.flight) {
        this.flight = null;
        copyState(this.current, this.goal);
      }
      this.applyCursor();
    }
    if (!d.moved) return;
    const height = Math.max(1, this.o.canvas.clientHeight);
    if (d.mode === 'orbit') {
      const k = (2 * Math.PI * ORBIT_TURNS_PER_SCREEN) / height;
      const da = -dx * k;
      const de = dy * k;
      this.goal.azimuth += da;
      this.goal.elevation += de;
      // Vitesse lissée pour l'élan au lâcher.
      this.orbitVelocity.lerp(_ndc.set(da / dtEvent, de / dtEvent), 0.5);
    } else {
      const w = worldPerPixel(this.current.distance, this.o.camera.fov, height);
      const camera = this.o.camera;
      _right.setFromMatrixColumn(camera.matrixWorld, 0);
      _up.setFromMatrixColumn(camera.matrixWorld, 1);
      _v.copy(_right)
        .multiplyScalar(-dx * w)
        .addScaledVector(_up, dy * w);
      this.goal.target.add(_v);
      this.panVelocity.lerp(_v.divideScalar(dtEvent), 0.5);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    const now = performance.now();
    const click = !d.moved && isClick(e.clientX - d.startX, e.clientY - d.startY, now - d.startTime);
    // Pas d'élan si le pointeur était immobile avant le lâcher.
    if (now - d.lastTime > 60) {
      this.orbitVelocity.set(0, 0);
      this.panVelocity.set(0, 0, 0);
    }
    if (d.mode === 'orbit') this.panVelocity.set(0, 0, 0);
    else this.orbitVelocity.set(0, 0);
    this.endDrag();
    if (click && d.button === 0 && this.isActive) this.listener?.onClick(e.clientX, e.clientY, e);
  }

  private endDrag(): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try {
      if (this.o.canvas.hasPointerCapture(d.pointerId)) this.o.canvas.releasePointerCapture(d.pointerId);
    } catch {
      // Pointeur inconnu : rien à relâcher.
    }
    this.applyCursor();
  }

  private onWheel(e: WheelEvent): void {
    if (!this.isActive) return;
    e.preventDefault();
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode);
    if (factor === 1) return;
    if (this.flight) {
      this.flight = null;
      copyState(this.current, this.goal);
    }
    const goal = this.goal;
    this.cursorRay(e.clientX, e.clientY, _ray);
    const q = this.o.query();
    // Point visé : surface sous le curseur, sinon plan de la cible face à la caméra.
    let hit = q ? q.surfacePoint(_ray, _point) : Infinity;
    if (!Number.isFinite(hit)) {
      this.o.camera.getWorldDirection(_dir);
      _plane.setFromNormalAndCoplanarPoint(_dir, goal.target);
      hit = _ray.intersectPlane(_plane, _point) ? 1 : Infinity;
      if (!Number.isFinite(hit)) _point.copy(goal.target);
    }
    this.positionOf(goal, _prev);
    const min = this.minSurfaceDistance;
    const result = zoomTowardPoint(goal.target, _prev, goal.distance, _point, factor, {
      minDistanceToPoint: min * 1.05,
      minDistance: min,
      maxDistance: MAX_DISTANCE,
    });
    goal.distance = result.distance;
  }

  /** Rayon monde passant par un point écran (coordonnées client). */
  private cursorRay(clientX: number, clientY: number, out: THREE.Ray): THREE.Ray {
    const rect = this.o.canvas.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const camera = this.o.camera;
    out.origin.setFromMatrixPosition(camera.matrixWorld);
    out.direction.set(_ndc.x, _ndc.y, 0.5).unproject(camera).sub(out.origin).normalize();
    return out;
  }

  private applyCursor(): void {
    if (!this.isActive) return;
    const d = this.drag;
    this.o.canvas.style.cursor =
      d && d.moved ? (d.mode === 'pan' ? 'move' : 'grabbing') : this.hoverPointer ? 'pointer' : 'grab';
  }
}

const _tmpBox = new THREE.Box3();

/** Interpolation d'état : cible linéaire, angles au plus court, distance logarithmique. */
function interpolateState(a: OrbitState, b: OrbitState, t: number, out: OrbitState): void {
  out.target.lerpVectors(a.target, b.target, t);
  out.azimuth = a.azimuth + shortestAngle(a.azimuth, b.azimuth) * t;
  out.elevation = a.elevation + (b.elevation - a.elevation) * t;
  out.distance = lerpLog(a.distance, b.distance, t);
}
