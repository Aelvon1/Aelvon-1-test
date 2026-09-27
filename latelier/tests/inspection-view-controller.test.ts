/**
 * Caméra d'inspection pilotée comme dans le navigateur (événements de pointeur et de molette sur
 * un canvas factice) autour de l'objet d'exemple construit sous Node, requêtes géométriques BVH
 * réelles (`Picker`) :
 * - zoom à la molette vers le point sous le curseur, du cadrage de l'objet entier jusqu'au macro :
 *   le point visé reste fixe à l'écran, la caméra s'arrête à `minSurfaceDistance` de la surface ;
 * - plans near/far recalculés en continu (near ≤ distance libre, jamais nul) ;
 * - orbite rasante au macro : jamais à travers la matière ; jamais sous le tapis ;
 * - clic simple (sélection) distinct du glisser ; cadrage et vue initiale ;
 * - zone libre de l'écran (panneaux de l'interface) : point principal décalé, cadrage dans la
 *   zone, zoom vers le curseur toujours exact, retour à zéro à la désactivation ;
 * - modes de rendu de la vue : substitution et restitution EXACTE des matériaux (rayons X, coupe),
 *   plan de coupe (3 axes, inversion).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Assembly } from '../src/inspection/Assembly';
import { PoseComposer } from '../src/inspection/poses';
import { Picker } from '../src/inspection/selection/Picker';
import { InspectionCamera } from '../src/inspection/camera/InspectionCamera';
import type { CameraPointerListener } from '../src/inspection/camera/types';
import {
  NEAR_MIN_REVERSED,
  fitDistance,
  fitDistanceInArea,
  freeViewArea,
  principalOffset,
} from '../src/inspection/camera/orbitMath';
import { MaterialModes } from '../src/inspection/view/MaterialModes';
import { Section, sectionNormalLocal, sectionPointLocal } from '../src/inspection/view/Section';
import { IdleQueue } from '../src/core/scheduler';
import { listDevObjectDefs } from '../src/objects/registry';
import { MAT, PEGBOARD, ROOM } from '../src/world/layout';
import { createFakeServices } from './helpers/fakeServices';

const WIDTH = 1280;
const HEIGHT = 720;
const FOV = 35;
const MIN_SURFACE = 0.002;
const FLOOR_Y = MAT.center[1];

type Handler = (event: unknown) => void;

/** Canvas factice : écouteurs, capture du pointeur, rectangle client fixe. */
class FakeCanvas {
  readonly style = { cursor: '' };
  readonly clientWidth = WIDTH;
  readonly clientHeight = HEIGHT;
  private readonly listeners = new Map<string, Handler[]>();
  private readonly captured = new Set<number>();

  addEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, handler: Handler): void {
    const list = this.listeners.get(type);
    if (list)
      this.listeners.set(
        type,
        list.filter((h) => h !== handler),
      );
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: WIDTH, height: HEIGHT };
  }

  setPointerCapture(id: number): void {
    this.captured.add(id);
  }

  hasPointerCapture(id: number): boolean {
    return this.captured.has(id);
  }

  releasePointerCapture(id: number): void {
    this.captured.delete(id);
  }

  /** Émet un événement (champs par défaut : pointeur 1, bouton gauche, molette en pixels). */
  dispatch(type: string, fields: Record<string, number>): void {
    const event = {
      pointerId: 1,
      button: 0,
      deltaMode: 0,
      deltaY: 0,
      preventDefault: () => undefined,
      ...fields,
    };
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  get listenerCount(): number {
    let n = 0;
    for (const list of this.listeners.values()) n += list.length;
    return n;
  }
}

const def = listDevObjectDefs().find((d) => d.id === 'exemple-boitier')!;

let assembly: Assembly;
let composer: PoseComposer;
let picker: Picker;
let camera: THREE.PerspectiveCamera;
let canvas: FakeCanvas;
let controller: InspectionCamera;
const bounds = new THREE.Box3();
const sphere = new THREE.Sphere();
const clicks: { x: number; y: number }[] = [];
const roomBounds = new THREE.Box3(
  new THREE.Vector3(ROOM.minX + 0.02, 0, PEGBOARD.z + 0.07),
  new THREE.Vector3(ROOM.maxX - 0.02, ROOM.height - 0.02, ROOM.maxZ - 0.02),
);

const listener: CameraPointerListener = {
  onPointerMove: () => undefined,
  onPointerLeave: () => undefined,
  onClick: (x, y) => clicks.push({ x, y }),
  onDoubleClick: () => undefined,
};

/** Avance de `frames` images de 1/60 s. */
function step(frames: number, check?: () => void): void {
  for (let i = 0; i < frames; i++) {
    controller.update(1 / 60);
    check?.();
  }
}

/** Position écran (px) d'un point monde. */
function screenOf(point: THREE.Vector3): THREE.Vector2 {
  camera.updateMatrixWorld();
  const p = point.clone().project(camera);
  return new THREE.Vector2((p.x * 0.5 + 0.5) * WIDTH, (-p.y * 0.5 + 0.5) * HEIGHT);
}

/** Point de surface visible sous un pixel. */
function surfaceUnder(x: number, y: number): THREE.Vector3 {
  const origin = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const ndc = new THREE.Vector3((x / WIDTH) * 2 - 1, -(y / HEIGHT) * 2 + 1, 0.5);
  const direction = ndc.unproject(camera).sub(origin).normalize();
  const out = new THREE.Vector3();
  expect(Number.isFinite(picker.surfacePoint(new THREE.Ray(origin, direction), out))).toBe(true);
  return out;
}

/** Invariants de chaque image : distance libre, plans near/far, tapis. */
function invariants(): void {
  const position = camera.position;
  const clearance = picker.clearance(position, 1);
  expect(clearance).toBeGreaterThanOrEqual(MIN_SURFACE * (1 - 1e-3));
  expect(position.y).toBeGreaterThanOrEqual(FLOOR_Y + 0.003 - 1e-9);
  expect(camera.near).toBeGreaterThanOrEqual(NEAR_MIN_REVERSED);
  // Near sous la distance libre (le point le plus proche du tronc de vision n'est jamais rogné),
  // à 1 % près (hystérésis de la mise à jour de la projection).
  expect(camera.near).toBeLessThanOrEqual(Math.max(NEAR_MIN_REVERSED, clearance) * 1.01);
  expect(camera.far).toBeGreaterThan(position.distanceTo(roomBounds.min));
}

beforeAll(async () => {
  const services = createFakeServices();
  assembly = new Assembly(def, undefined, { ...services, matCenter: new THREE.Vector3(...MAT.center) });
  expect(await assembly.build()).toBe(true);
  composer = new PoseComposer(assembly);
  composer.setExplodeRate(0);
  composer.apply(true);
  assembly.root.updateMatrixWorld(true);
  const idle = new IdleQueue();
  picker = new Picker(idle);
  picker.attach(assembly);
  picker.buildAllNow();
  assembly.objectBounds(bounds).getBoundingSphere(sphere);

  // Pose de départ : fin de la transition vers l'établi (au-dessus et devant le tapis).
  camera = new THREE.PerspectiveCamera(FOV, WIDTH / HEIGHT, 0.02, 60);
  camera.position.set(MAT.center[0], MAT.center[1] + 0.32, MAT.center[2] + 0.42);
  camera.lookAt(new THREE.Vector3(...MAT.center));
  camera.updateMatrixWorld();
  canvas = new FakeCanvas();
  controller = new InspectionCamera({
    camera,
    canvas: canvas as unknown as HTMLCanvasElement,
    query: () => picker,
    floorY: FLOOR_Y,
    roomBounds,
    reversedDepth: true,
    fov: FOV,
  });
  controller.listener = listener;
  controller.objectCenter.copy(sphere.center);
  controller.objectRadius = sphere.radius;
  controller.activate({
    target: sphere.center.clone(),
    direction: new THREE.Vector3(0.25, 0.9, 1).normalize(),
    distance: fitDistance(sphere.radius, FOV, WIDTH / HEIGHT, 1.4),
    minDistance: MIN_SURFACE,
  });
}, 60000);

describe('caméra d’inspection — transitions et cadrage', () => {
  it('vue initiale atteinte en douceur, objet entier cadré', () => {
    step(70, invariants);
    expect(controller.target.distanceTo(sphere.center)).toBeLessThan(1e-9);
    const expected = fitDistance(sphere.radius, FOV, WIDTH / HEIGHT, 1.4);
    expect(controller.distance).toBeCloseTo(expected, 6);
    // Tout l'objet est à l'écran.
    const corners = [bounds.min, bounds.max].flatMap((a) =>
      [bounds.min, bounds.max].flatMap((b) =>
        [bounds.min, bounds.max].map((c) => new THREE.Vector3(a.x, b.y, c.z)),
      ),
    );
    for (const corner of corners) {
      const s = screenOf(corner);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(WIDTH);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(HEIGHT);
    }
  });

  it('cadrage d’une pièce (F), puis retour à la vue initiale (R)', () => {
    const box = assembly.worldBounds('terminal', new THREE.Box3());
    const center = box.getCenter(new THREE.Vector3());
    controller.frameBox(box);
    step(50, invariants);
    expect(controller.target.distanceTo(center)).toBeLessThan(1e-6);
    expect(controller.distance).toBeLessThan(fitDistance(sphere.radius, FOV, WIDTH / HEIGHT, 1.4));
    controller.resetView();
    step(60, invariants);
    expect(controller.target.distanceTo(sphere.center)).toBeLessThan(1e-9);
  });
});

describe('caméra d’inspection — pointeur', () => {
  it('clic simple = sélection ; glisser = orbite sans clic', () => {
    clicks.length = 0;
    canvas.dispatch('pointerdown', { clientX: 600, clientY: 300 });
    canvas.dispatch('pointerup', { clientX: 601, clientY: 301 });
    expect(clicks).toEqual([{ x: 601, y: 301 }]);
    const before = camera.position.clone();
    canvas.dispatch('pointerdown', { clientX: 600, clientY: 300 });
    for (let i = 1; i <= 10; i++) {
      canvas.dispatch('pointermove', { clientX: 600 + i * 12, clientY: 300 });
      step(1, invariants);
    }
    expect(controller.dragging).toBe(true);
    expect(canvas.style.cursor).toBe('grabbing');
    canvas.dispatch('pointerup', { clientX: 720, clientY: 300 });
    expect(controller.dragging).toBe(false);
    step(30, invariants);
    expect(clicks.length).toBe(1);
    // Orbite autour de la cible : distance conservée, position changée.
    expect(camera.position.distanceTo(controller.target)).toBeCloseTo(controller.distance, 9);
    expect(camera.position.distanceTo(before)).toBeGreaterThan(0.01);
    controller.resetView();
    step(60);
  });

  it('panoramique (clic droit) : la cible se déplace dans le plan de l’écran', () => {
    const target = controller.target.clone();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    canvas.dispatch('pointerdown', { clientX: 600, clientY: 300, button: 2, pointerId: 2 });
    for (let i = 1; i <= 6; i++) {
      canvas.dispatch('pointermove', { clientX: 600 - i * 10, clientY: 300, pointerId: 2 });
      step(1, invariants);
    }
    canvas.dispatch('pointerup', { clientX: 540, clientY: 300, button: 2, pointerId: 2 });
    step(40, invariants);
    const moved = controller.target.clone().sub(target);
    // Glisser vers la gauche : la scène suit le pointeur, la cible part vers la droite.
    expect(moved.dot(right)).toBeGreaterThan(0.005);
    controller.resetView();
    step(60);
  });
});

describe('caméra d’inspection — zoom vers le curseur jusqu’au macro', () => {
  it('le point visé reste fixe à l’écran ; arrêt à la distance minimale de la surface', () => {
    // Point du couvercle, loin du centre de l'image (le zoom n'est pas centré).
    const cursor = { x: WIDTH * 0.5 + 90, y: HEIGHT * 0.5 - 40 };
    const point = surfaceUnder(cursor.x, cursor.y);
    const startDistance = camera.position.distanceTo(point);
    let minClearance = Infinity;
    for (let notch = 0; notch < 70; notch++) {
      canvas.dispatch('wheel', { clientX: cursor.x, clientY: cursor.y, deltaY: -100 });
      step(6, () => {
        invariants();
        minClearance = Math.min(minClearance, picker.clearance(camera.position, 1));
      });
    }
    step(60, invariants);
    const s = screenOf(point);
    expect(s.x).toBeCloseTo(cursor.x, 0);
    expect(s.y).toBeCloseTo(cursor.y, 0);
    // Du cadrage de l'objet entier (≈ 20 cm) jusqu'à quelques millimètres de la surface.
    expect(startDistance).toBeGreaterThan(0.1);
    const clearance = picker.clearance(camera.position, 1);
    expect(clearance).toBeLessThan(MIN_SURFACE * 3);
    expect(minClearance).toBeGreaterThanOrEqual(MIN_SURFACE * (1 - 1e-3));
    // Near suit la distance libre (profondeur inversée) : ~0,75 × distance libre.
    expect(camera.near).toBeLessThan(clearance);
    expect(camera.near).toBeGreaterThan(clearance * 0.5);
    // Le point visé est toujours la surface sous le curseur (rien n'a été traversé).
    expect(surfaceUnder(cursor.x, cursor.y).distanceTo(point)).toBeLessThan(1e-5);
  });

  it('orbite rasante au macro : la caméra ne traverse jamais la surface', () => {
    // Glisser vers le haut : l'élévation diminue, la caméra « plonge » vers le couvercle.
    canvas.dispatch('pointerdown', { clientX: 640, clientY: 500 });
    for (let i = 1; i <= 40; i++) {
      canvas.dispatch('pointermove', { clientX: 640, clientY: 500 - i * 15 });
      step(2, invariants);
    }
    canvas.dispatch('pointerup', { clientX: 640, clientY: -100 });
    step(40, invariants);
    // La caméra est toujours hors de la matière : le premier impact vers la cible est vu de face.
    const hit = { distance: 0, backFace: false };
    const direction = controller.target.clone().sub(camera.position).normalize();
    if (picker.probe(camera.position, direction, 1, hit)) expect(hit.backFace).toBe(false);
  });

  it('zoom arrière borné, jamais sous le tapis même en orbite vers le bas', () => {
    for (let notch = 0; notch < 60; notch++) {
      canvas.dispatch('wheel', { clientX: WIDTH / 2, clientY: HEIGHT / 2, deltaY: 200 });
      step(3, invariants);
    }
    step(40, invariants);
    expect(controller.distance).toBeLessThanOrEqual(2.2);
    canvas.dispatch('pointerdown', { clientX: 640, clientY: 700 });
    for (let i = 1; i <= 30; i++) {
      canvas.dispatch('pointermove', { clientX: 640, clientY: 700 - i * 30 });
      step(2, invariants);
    }
    canvas.dispatch('pointerup', { clientX: 640, clientY: -200 });
    step(60, invariants);
    // Panoramique vers le bas : la cible ne passe pas sous le tapis.
    canvas.dispatch('pointerdown', { clientX: 640, clientY: 300, button: 2, pointerId: 3 });
    for (let i = 1; i <= 30; i++) {
      canvas.dispatch('pointermove', { clientX: 640, clientY: 300 - i * 20, pointerId: 3 });
      step(1, invariants);
    }
    canvas.dispatch('pointerup', { clientX: 640, clientY: -300, button: 2, pointerId: 3 });
    step(60, invariants);
    expect(controller.target.y).toBeGreaterThanOrEqual(FLOOR_Y - 1e-12);
  });

  it('désactivation : plans sûrs, écouteurs retirés à la libération', () => {
    controller.deactivate();
    expect(camera.near).toBe(0.02);
    expect(controller.active).toBe(false);
    const count = canvas.listenerCount;
    expect(count).toBeGreaterThan(0);
    const other = new InspectionCamera({
      camera: new THREE.PerspectiveCamera(),
      canvas: canvas as unknown as HTMLCanvasElement,
      query: () => null,
      floorY: 0,
      roomBounds,
      reversedDepth: false,
      fov: FOV,
    });
    expect(canvas.listenerCount).toBe(count * 2);
    other.dispose();
    expect(canvas.listenerCount).toBe(count);
  });
});

describe('caméra d’inspection — zone libre (panneaux de l’interface)', () => {
  const insets = { left: 300, top: 60, right: 340, bottom: 220 };

  it('zone libre, décalage du point principal et distance de cadrage (fonctions pures)', () => {
    const area = freeViewArea(WIDTH, HEIGHT, insets, { x: 0, y: 0, width: 0, height: 0 });
    expect(area).toEqual({ x: 300, y: 60, width: 640, height: 440 });
    const offset = principalOffset(WIDTH, HEIGHT, area, { x: 0, y: 0 });
    expect(offset).toEqual({ x: 640 - 620, y: 360 - 280 });
    // Écran entier : identique à `fitDistance`.
    expect(fitDistanceInArea(0.05, FOV, HEIGHT, WIDTH, HEIGHT, 1.3)).toBeCloseTo(
      fitDistance(0.05, FOV, WIDTH / HEIGHT, 1.3),
      12,
    );
    // Zone plus petite : plus loin.
    expect(fitDistanceInArea(0.05, FOV, HEIGHT, 640, 440, 1.3)).toBeGreaterThan(
      fitDistance(0.05, FOV, WIDTH / HEIGHT, 1.3),
    );
    // Mesure incohérente (interface masquée) : écran entier.
    const hidden = freeViewArea(
      WIDTH,
      HEIGHT,
      { left: 8, top: 8, right: WIDTH + 8, bottom: HEIGHT + 8 },
      area,
    );
    expect(hidden).toEqual({ x: 0, y: 0, width: WIDTH, height: HEIGHT });
  });

  it('l’objet est cadré et centré dans la zone libre ; zoom au curseur exact ; retour à zéro', () => {
    const cam = new THREE.PerspectiveCamera(FOV, WIDTH / HEIGHT, 0.02, 60);
    cam.position.set(MAT.center[0], MAT.center[1] + 0.32, MAT.center[2] + 0.42);
    cam.lookAt(new THREE.Vector3(...MAT.center));
    cam.updateMatrixWorld();
    const ui = new FakeCanvas();
    let published: typeof insets | null = null;
    const offsetCamera = new InspectionCamera({
      camera: cam,
      canvas: ui as unknown as HTMLCanvasElement,
      query: () => picker,
      floorY: FLOOR_Y,
      roomBounds,
      reversedDepth: true,
      fov: FOV,
      safeInsets: () => published,
    });
    offsetCamera.objectCenter.copy(sphere.center);
    offsetCamera.objectRadius = sphere.radius;
    offsetCamera.activate({
      target: sphere.center.clone(),
      direction: new THREE.Vector3(0.25, 0.9, 1).normalize(),
      distance: fitDistance(sphere.radius, FOV, WIDTH / HEIGHT, 1.4),
      radius: sphere.radius,
      minDistance: MIN_SURFACE,
    });
    const frames = (n: number): void => {
      for (let i = 0; i < n; i++) {
        offsetCamera.update(1 / 60);
        offsetCamera.updateViewOffset(1 / 60);
      }
    };
    frames(5);
    // Les panneaux apparaissent pendant la transition d'arrivée : destination recadrée.
    published = insets;
    frames(90);
    const px = (p: THREE.Vector3): THREE.Vector2 => {
      cam.updateMatrixWorld();
      const n = p.clone().project(cam);
      return new THREE.Vector2((n.x * 0.5 + 0.5) * WIDTH, (-n.y * 0.5 + 0.5) * HEIGHT);
    };
    const center = px(sphere.center);
    expect(center.x).toBeCloseTo(300 + 640 / 2, 0);
    expect(center.y).toBeCloseTo(60 + 440 / 2, 0);
    expect(offsetCamera.distance).toBeCloseTo(
      fitDistanceInArea(sphere.radius, FOV, HEIGHT, 640, 440, 1.4),
      4,
    );
    for (let k = 0; k < 8; k++) {
      const corner = new THREE.Vector3(
        k & 1 ? bounds.max.x : bounds.min.x,
        k & 2 ? bounds.max.y : bounds.min.y,
        k & 4 ? bounds.max.z : bounds.min.z,
      );
      const s = px(corner);
      expect(s.x).toBeGreaterThan(300);
      expect(s.x).toBeLessThan(WIDTH - 340);
      expect(s.y).toBeGreaterThan(60);
      expect(s.y).toBeLessThan(HEIGHT - 220);
    }
    // Zoom vers le curseur avec la projection décalée : le point visé ne bouge pas.
    const cursor = { x: 560, y: 250 };
    const origin = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const direction = new THREE.Vector3((cursor.x / WIDTH) * 2 - 1, -(cursor.y / HEIGHT) * 2 + 1, 0.5)
      .unproject(cam)
      .sub(origin)
      .normalize();
    const point = new THREE.Vector3();
    expect(Number.isFinite(picker.surfacePoint(new THREE.Ray(origin, direction), point))).toBe(true);
    for (let notch = 0; notch < 12; notch++) {
      ui.dispatch('wheel', { clientX: cursor.x, clientY: cursor.y, deltaY: -100 });
      frames(4);
    }
    frames(40);
    const after = px(point);
    expect(after.x).toBeCloseTo(cursor.x, 0);
    expect(after.y).toBeCloseTo(cursor.y, 0);
    // Désactivation : le décalage revient à zéro en douceur, puis est supprimé.
    offsetCamera.deactivate();
    frames(2);
    expect(cam.view?.enabled).toBe(true);
    frames(120);
    expect(cam.view === null || !cam.view.enabled).toBe(true);
    offsetCamera.dispose();
  });
});

describe('modes de rendu de la vue', () => {
  it('rayons X puis coupe : substitution puis restitution exacte des matériaux', () => {
    const modes = new MaterialModes();
    modes.attach(assembly, composer);
    const original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    for (const part of assembly.order) for (const mesh of part.ownMeshes) original.set(mesh, mesh.material);
    expect(original.size).toBeGreaterThan(0);

    const solid = new Set(assembly.subtreeIds('terminal'));
    modes.setXray(true, solid);
    expect(modes.isGhost('lid')).toBe(true);
    expect(modes.isGhost('terminal')).toBe(false);
    for (const part of assembly.order) {
      for (const mesh of part.ownMeshes) {
        if (solid.has(part.id)) expect(mesh.material).toBe(original.get(mesh));
        else {
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of list) expect(material.userData.viewMaterial).toBe('xray');
        }
      }
    }
    modes.setXray(false, new Set());
    for (const [mesh, material] of original) expect(mesh.material).toBe(material);

    modes.setSection(true);
    let capped = 0;
    const capOf = new Map<THREE.Material, THREE.Material>();
    for (const [mesh, base] of original) {
      if (Array.isArray(base) || mesh.material === base) continue;
      const cap = mesh.material as THREE.Material;
      expect(cap.userData.viewMaterial).toBe('sectionCap');
      expect(cap.side).toBe(THREE.DoubleSide);
      // Une seule variante par matériau d'origine.
      const known = capOf.get(base);
      if (known) expect(cap).toBe(known);
      else capOf.set(base, cap);
      capped++;
    }
    expect(capped).toBeGreaterThan(0);
    modes.detach();
    for (const [mesh, material] of original) expect(mesh.material).toBe(material);
    modes.dispose();
  });

  it('plan de coupe : côté conservé, 3 axes, inversion, activation du groupe', () => {
    const local = new THREE.Box3(new THREE.Vector3(-0.04, 0, -0.03), new THREE.Vector3(0.04, 0.05, 0.03));
    const p = sectionPointLocal(local, 'y', 0.5, new THREE.Vector3());
    expect(p.toArray()).toEqual([0, 0.025, 0]);
    expect(sectionPointLocal(local, 'x', 1, new THREE.Vector3()).x).toBeCloseTo(0.04, 12);
    expect(sectionNormalLocal('z', false, new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 0, -1))).toBe(
      0,
    );
    expect(sectionNormalLocal('z', true, new THREE.Vector3()).distanceTo(new THREE.Vector3(0, 0, 1))).toBe(0);

    const scene = new THREE.Scene();
    const section = new Section(scene);
    const root = new THREE.Group();
    root.position.set(-0.75, 0.93, -1.56);
    root.rotation.y = -0.3;
    root.updateMatrixWorld(true);
    section.setObject(root, local);
    section.setState({ enabled: true, axis: 'y', position: 0.5, flip: false });
    expect(section.group.enabled).toBe(true);
    const below = new THREE.Vector3(0, 0.01, 0).applyMatrix4(root.matrixWorld);
    const above = new THREE.Vector3(0, 0.04, 0).applyMatrix4(root.matrixWorld);
    expect(section.plane.distanceToPoint(below)).toBeGreaterThan(0);
    expect(section.plane.distanceToPoint(above)).toBeLessThan(0);
    section.setState({ enabled: true, axis: 'y', position: 0.5, flip: true });
    expect(section.plane.distanceToPoint(above)).toBeGreaterThan(0);
    // Axe X de l'objet tourné : la normale suit la rotation de la racine.
    section.setState({ enabled: true, axis: 'x', position: 0.25, flip: false });
    const expected = new THREE.Vector3(-1, 0, 0).applyQuaternion(root.quaternion);
    expect(section.plane.normal.distanceTo(expected)).toBeLessThan(1e-9);
    const onPlane = new THREE.Vector3(-0.02, 0.02, 0.01).applyMatrix4(root.matrixWorld);
    expect(Math.abs(section.plane.distanceToPoint(onPlane))).toBeLessThan(1e-9);
    section.setState({ enabled: false, axis: 'x', position: 0.25, flip: false });
    section.update(0);
    expect(section.group.enabled).toBe(false);
    section.dispose();
  });
});
