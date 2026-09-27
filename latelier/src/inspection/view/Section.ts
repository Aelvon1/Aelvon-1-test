/**
 * Plan de coupe de l'inspection (touche C, commandes `inspection:section`).
 *
 * - L'objet est rattaché à un `ClippingGroup` (nœud de découpe de three/webgpu, compatible
 *   WebGPU et repli WebGL2) : activer la coupe active le groupe et son unique plan.
 * - Axe x/y/z dans le repère de l'objet, position 0..1 sur ses bornes au repos. Côté conservé :
 *   coordonnées inférieures à la coupe (on regarde la coupe depuis +axe), `flip` inverse.
 * - Un plan translucide à bord lumineux matérialise la coupe (hors du groupe : jamais découpé).
 */
import * as THREE from 'three/webgpu';
import type { SectionAxis } from '../../core/store';
import { createSectionPlaneMaterial, type SectionPlaneUniforms } from './viewMaterials';

export interface SectionState {
  enabled: boolean;
  axis: SectionAxis;
  position: number;
  flip: boolean;
}

const AXES: Record<SectionAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/** Point de coupe (repère de l'objet) pour un axe et une position 0..1 sur les bornes. */
export function sectionPointLocal(bounds: THREE.Box3, axis: SectionAxis, position: number, out: THREE.Vector3): THREE.Vector3 {
  bounds.getCenter(out);
  const t = THREE.MathUtils.clamp(position, 0, 1);
  out[axis] = bounds.min[axis] + (bounds.max[axis] - bounds.min[axis]) * t;
  return out;
}

/** Normale du côté conservé (repère de l'objet). */
export function sectionNormalLocal(axis: SectionAxis, flip: boolean, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(AXES[axis]).multiplyScalar(flip ? 1 : -1);
}

export class Section {
  /** Parent de la racine de l'objet inspecté. */
  readonly group = new THREE.ClippingGroup();
  /** Plan monde (côté conservé : distance ≥ 0). */
  readonly plane = new THREE.Plane();
  /** Bornes monde de l'objet (mur de coupe pour la caméra). */
  readonly worldBounds = new THREE.Box3();
  private readonly helper: THREE.Mesh;
  private readonly helperUniforms: SectionPlaneUniforms;
  private readonly localBounds = new THREE.Box3();
  private root: THREE.Object3D | null = null;
  private state: SectionState = { enabled: false, axis: 'x', position: 0.5, flip: false };
  private fade = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'Inspection : coupe';
    this.group.enabled = false;
    this.group.clippingPlanes = [this.plane];
    scene.add(this.group);
    const { material, uniforms } = createSectionPlaneMaterial();
    this.helperUniforms = uniforms;
    this.helper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.helper.name = 'Inspection : plan de coupe';
    this.helper.renderOrder = 20;
    this.helper.castShadow = false;
    this.helper.receiveShadow = false;
    this.helper.visible = false;
    this.helper.matrixAutoUpdate = false;
    scene.add(this.helper);
  }

  get enabled(): boolean {
    return this.state.enabled;
  }

  /** Objet coupé : racine et bornes au repos dans son propre repère. */
  setObject(root: THREE.Object3D | null, localBounds: THREE.Box3 | null): void {
    this.root = root;
    if (localBounds) this.localBounds.copy(localBounds);
    else this.localBounds.makeEmpty();
    this.update(0);
  }

  setState(state: SectionState): void {
    this.state = { ...state };
    this.group.enabled = state.enabled && this.root !== null;
    this.update(0);
  }

  /** Suit la racine de l'objet (pose sur le tapis) et anime l'apparition du plan. */
  update(dt: number): void {
    const root = this.root;
    const on = this.state.enabled && root !== null && !this.localBounds.isEmpty();
    this.fade = on ? Math.min(1, this.fade + dt * 5) : 0;
    this.helper.visible = on;
    if (!on || !root) {
      this.group.enabled = false;
      return;
    }
    root.updateWorldMatrix(true, false);
    const { axis, position, flip } = this.state;
    sectionPointLocal(this.localBounds, axis, position, _p).applyMatrix4(root.matrixWorld);
    root.getWorldQuaternion(_q);
    sectionNormalLocal(axis, flip, _n).applyQuaternion(_q).normalize();
    this.plane.setFromNormalAndCoplanarPoint(_n, _p);
    this.worldBounds.copy(this.localBounds).applyMatrix4(root.matrixWorld).expandByScalar(0.002);
    // Plan visuel : rectangle des bornes dans le plan de coupe, marge de 8 %.
    this.localBounds.getSize(_size);
    const w = (axis === 'x' ? _size.z : _size.x) * 1.08;
    const h = (axis === 'y' ? _size.z : _size.y) * 1.08;
    this.helperUniforms.size.value.set(w, h);
    this.helperUniforms.strength.value = this.fade;
    sectionPointLocal(this.localBounds, axis, position, _center);
    // Orientation locale du rectangle (normale +Z de PlaneGeometry tournée vers l'axe de coupe).
    const local = _helperMatrix;
    if (axis === 'x') local.makeRotationY(Math.PI / 2);
    else if (axis === 'y') local.makeRotationX(-Math.PI / 2);
    else local.identity();
    local.scale(_scale.set(w, h, 1)).setPosition(_center);
    this.helper.matrix.multiplyMatrices(root.matrixWorld, local);
    this.helper.matrixWorld.copy(this.helper.matrix);
    this.group.enabled = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.helper.removeFromParent();
    this.helper.geometry.dispose();
    (this.helper.material as THREE.Material).dispose();
  }
}

const _helperMatrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();
