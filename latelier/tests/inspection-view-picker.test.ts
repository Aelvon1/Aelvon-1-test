/**
 * Requêtes géométriques de la vue (BVH) sur l'objet d'exemple construit sous Node : sélection au
 * lancer de rayon (instances comprises), distance libre, obstacles, intérieur d'un volume, plan
 * de coupe et fantômes des rayons X ; miniatures (planche de sprites, réduction 2×2).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Assembly } from '../src/inspection/Assembly';
import { PoseComposer } from '../src/inspection/poses';
import { Picker, type PickHit } from '../src/inspection/selection/Picker';
import { IdleQueue } from '../src/core/scheduler';
import { listDevObjectDefs } from '../src/objects/registry';
import { MAT } from '../src/world/layout';
import { createFakeServices } from './helpers/fakeServices';
import {
  downsample2x,
  frameOrigin,
  readbackRowBytes,
  sheetLayout,
  turntableAzimuth,
} from '../src/inspection/thumbnails/spriteSheet';

const def = listDevObjectDefs().find((d) => d.id === 'exemple-boitier')!;

let assembly: Assembly;
let picker: Picker;
const hit = (): PickHit => ({
  partId: '',
  instance: null,
  mesh: new THREE.Mesh(),
  distance: 0,
  point: new THREE.Vector3(),
  ghost: false,
});

beforeAll(async () => {
  const services = createFakeServices();
  assembly = new Assembly(def, undefined, { ...services, matCenter: new THREE.Vector3(...MAT.center) });
  expect(await assembly.build()).toBe(true);
  const composer = new PoseComposer(assembly);
  composer.setExplodeRate(0);
  composer.apply(true);
  assembly.root.updateMatrixWorld(true);
  const idle = new IdleQueue();
  picker = new Picker(idle);
  picker.attach(assembly);
  // Construction paresseuse : tâches déposées dans la file des temps morts.
  expect(idle.size).toBeGreaterThan(0);
  expect(picker.treeStats.pending).toBeGreaterThan(0);
  while (idle.size > 0) idle.run(1000);
  expect(picker.treeStats.pending).toBe(0);
  expect(picker.treeStats.built).toBeGreaterThan(0);
}, 60000);

/** Rayon vertical descendant au-dessus d'un point monde. */
const downRay = (p: THREE.Vector3) => new THREE.Ray(p.clone().setY(p.y + 0.5), new THREE.Vector3(0, -1, 0));

describe('sélection BVH', () => {
  it('un rayon vertical au centre touche le couvercle, au bon endroit', () => {
    const bounds = assembly.objectBounds(new THREE.Box3());
    const center = bounds.getCenter(new THREE.Vector3());
    const h = hit();
    expect(picker.pick(downRay(center), h)).toBe(true);
    expect(h.partId).toBe('lid');
    expect(h.point.y).toBeCloseTo(bounds.max.y, 2);
    expect(h.ghost).toBe(false);
  });

  it('instances : la vis visée est identifiée par son index', () => {
    const screws = assembly.parts.get('screws')!;
    for (let i = 0; i < screws.instanced!.count; i++) {
      const c = assembly.instanceCenterWorld('screws', i, new THREE.Vector3());
      const h = hit();
      expect(picker.pick(downRay(c), h)).toBe(true);
      expect(h.partId).toBe('screws');
      expect(h.instance).toBe(i);
    }
  });

  it('pièce masquée : ignorée par la sélection', () => {
    const lid = assembly.parts.get('lid')!;
    const center = assembly.objectBounds(new THREE.Box3()).getCenter(new THREE.Vector3());
    for (const m of lid.ownMeshes) m.visible = false;
    const h = hit();
    picker.pick(downRay(center), h);
    expect(h.partId).not.toBe('lid');
    for (const m of lid.ownMeshes) m.visible = true;
  });

  it('rayons X : un fantôme ne masque pas une pièce opaque derrière lui', () => {
    const center = assembly.objectBounds(new THREE.Box3()).getCenter(new THREE.Vector3());
    picker.isGhost = (id) => id !== 'terminal';
    const h = hit();
    const terminal = assembly.worldBounds('terminal', new THREE.Box3()).getCenter(new THREE.Vector3());
    expect(picker.pick(downRay(terminal), h)).toBe(true);
    expect(h.partId).toBe('terminal');
    expect(h.ghost).toBe(false);
    // Sans pièce opaque sous le rayon : le fantôme le plus proche est retenu.
    picker.isGhost = () => true;
    expect(picker.pick(downRay(center), h)).toBe(true);
    expect(h.ghost).toBe(true);
    picker.isGhost = () => false;
  });
});

describe('distance libre et obstacles', () => {
  /** Point du couvercle sous le centre de l'objet. */
  const lidTop = (): THREE.Vector3 => {
    const center = assembly.objectBounds(new THREE.Box3()).getCenter(new THREE.Vector3());
    const h = hit();
    expect(picker.pick(downRay(center), h)).toBe(true);
    return h.point.clone();
  };

  it('distance libre au-dessus du couvercle = hauteur au-dessus de la surface', () => {
    const p = lidTop().add(new THREE.Vector3(0, 0.004, 0));
    expect(picker.clearance(p, 0.05)).toBeCloseTo(0.004, 3);
    expect(picker.clearance(p, 0.001)).toBe(Infinity);
  });

  it('obstacle le long d’un rayon et intérieur d’un volume (faces vues de dos)', () => {
    const top = lidTop();
    const above = top.clone().add(new THREE.Vector3(0, 0.05, 0));
    const d = picker.obstacleDistance(above, new THREE.Vector3(0, -1, 0), 1);
    expect(d).toBeCloseTo(0.05, 2);
    expect(picker.obstacleDistance(above, new THREE.Vector3(0, 1, 0), 1)).toBe(Infinity);
    const out = { distance: 0, backFace: false };
    // Depuis l'extérieur : première face vue de face.
    expect(picker.probe(above, new THREE.Vector3(0, -1, 0), 1, out)).toBe(true);
    expect(out.backFace).toBe(false);
    // Depuis l'intérieur de la paroi du couvercle : la face touchée en sortant est vue de dos.
    const inside = top.clone().add(new THREE.Vector3(0, -0.0005, 0));
    expect(picker.probe(inside, new THREE.Vector3(0, 1, 0), 1, out)).toBe(true);
    expect(out.backFace).toBe(true);
  });

  it('plan de coupe : impacts du côté retiré ignorés, face de coupe comptée comme surface', () => {
    const bounds = assembly.objectBounds(new THREE.Box3());
    const center = bounds.getCenter(new THREE.Vector3());
    // Côté conservé : y ≤ centre (on coupe le haut de l'objet).
    picker.clipPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, -1, 0), center);
    picker.clipBounds.copy(bounds);
    const h = hit();
    expect(picker.pick(downRay(center), h)).toBe(true);
    expect(h.partId).not.toBe('lid');
    expect(h.point.y).toBeLessThanOrEqual(center.y + 1e-6);
    // Juste au-dessus de la coupe, dans l'emprise : la face de coupe est à 3 mm.
    expect(picker.clearance(center.clone().setY(center.y + 0.003), 0.05)).toBeCloseTo(0.003, 4);
    // Point de surface pour le zoom : sur le plan de coupe si l'on voit une face de coupe.
    const p = new THREE.Vector3();
    const t = picker.surfacePoint(downRay(center), p);
    expect(Number.isFinite(t)).toBe(true);
    expect(p.y).toBeLessThanOrEqual(center.y + 1e-6);
    picker.clipPlane = null;
  });
});

describe('miniatures — planche de sprites', () => {
  it('24 vues de 192 px : 6 colonnes × 4 lignes, origines et tour complet', () => {
    const layout = sheetLayout(24, 192, 192);
    expect(layout.columns).toBe(6);
    expect(layout.rows).toBe(4);
    expect(layout.width).toBe(1152);
    expect(frameOrigin(layout, 7)).toEqual({ x: 192, y: 192 });
    expect(turntableAzimuth(12, 24, 0.5)).toBeCloseTo(0.5 + Math.PI, 12);
    expect(readbackRowBytes(100, 4, true)).toBe(512);
    expect(readbackRowBytes(100, 4, false)).toBe(400);
  });

  it('réduction 2×2 pondérée par l’alpha, avec retournement vertical', () => {
    // Image 4×2 : colonne gauche rouge opaque sur la ligne 0, transparente sur la ligne 1.
    const src = new Uint8Array(4 * 2 * 4);
    const set = (x: number, y: number, r: number, g: number, b: number, a: number) =>
      src.set([r, g, b, a], (y * 4 + x) * 4);
    set(0, 0, 255, 0, 0, 255);
    set(1, 0, 255, 0, 0, 255);
    set(2, 0, 0, 0, 255, 255);
    set(3, 1, 0, 0, 255, 255);
    const dst = new Uint8ClampedArray(2 * 1 * 4);
    downsample2x(src, 4, 2, 16, dst, 2, 0, 0, false);
    // Rouge pur (les pixels transparents ne l'assombrissent pas), alpha moyen 50 %.
    expect([...dst.slice(0, 4)]).toEqual([255, 0, 0, 128]);
    expect([...dst.slice(4, 8)]).toEqual([0, 0, 255, 128]);
    const flipped = new Uint8ClampedArray(8);
    downsample2x(src, 4, 2, 16, flipped, 2, 0, 0, true);
    expect([...flipped]).toEqual([...dst]);
  });
});

describe('libération — tâches en attente et références', () => {
  it('détacher le sélecteur annule ses constructions de BVH en attente', () => {
    const idle = new IdleQueue();
    const other = new Picker(idle);
    other.attach(assembly);
    expect(idle.size).toBeGreaterThan(0);
    other.detach();
    // Les fermetures (qui retiennent les géométries de l'objet) ont quitté la file.
    expect(idle.size).toBe(0);
    expect(other.treeStats.pending).toBe(0);
  });

  it('file des temps morts : annulation d’une tâche, sans effet une fois exécutée', () => {
    const idle = new IdleQueue();
    const done: string[] = [];
    const cancelA = idle.push(() => done.push('a'));
    idle.push(() => done.push('b'), 1);
    cancelA();
    idle.run(1000);
    expect(done).toEqual(['b']);
    const cancelC = idle.push(() => done.push('c'));
    idle.run(1000);
    cancelC();
    expect(done).toEqual(['b', 'c']);
    expect(idle.size).toBe(0);
  });
});
