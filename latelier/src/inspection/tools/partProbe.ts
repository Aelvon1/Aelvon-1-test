/**
 * Sonde de pièce pour le présentateur d'outils : dimensions de la pièce vues depuis le point de
 * travail (profondeur le long de l'axe, largeurs perpendiculaires et leurs directions), centre
 * de l'objet (côté « extérieur ») et orientation courante (suivi rigide des brucelles…).
 *
 * `describeOrientedBox` est pur (testé) ; `AssemblyProbe` l'applique aux pièces d'un `Assembly`
 * (instance 0 pour les pièces instanciées, comme le séquenceur).
 */
import * as THREE from 'three/webgpu';
import type { Assembly } from '../Assembly';

export interface PartShape {
  /** Profondeur de la pièce derrière le point de travail, le long de −axe (m, ≥ 0). */
  depth: number;
  /** Direction monde (⊥ axe) de la plus grande largeur et demi-largeur correspondante. */
  longDir: THREE.Vector3;
  longHalf: number;
  /** Direction monde (⊥ axe, ⊥ longDir) de la petite largeur et demi-largeur. */
  shortDir: THREE.Vector3;
  shortHalf: number;
  /** Centre de l'objet (monde) si connu. */
  objectCenter: THREE.Vector3;
  hasCenter: boolean;
}

export function createPartShape(): PartShape {
  return {
    depth: 0,
    longDir: new THREE.Vector3(1, 0, 0),
    longHalf: 0,
    shortDir: new THREE.Vector3(0, 0, 1),
    shortHalf: 0,
    objectCenter: new THREE.Vector3(),
    hasCenter: false,
  };
}

export interface PartProbe {
  /** Remplit `out` pour la pièce (repère monde). Faux si la pièce est inconnue. */
  describe(partId: string, axis: THREE.Vector3, anchor: THREE.Vector3, out: PartShape): boolean;
  /** Orientation monde courante de la pièce (instance 0). Faux si inconnue. */
  worldQuaternion(partId: string, out: THREE.Quaternion): boolean;
}

const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _e = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] as const;
const _p = new THREE.Vector3();

/**
 * Dimensions d'une boîte orientée (`box` dans le repère de `matrix`) vues depuis `anchor` le long
 * de `axis` (normalisé). Aucune allocation.
 */
export function describeOrientedBox(
  box: THREE.Box3,
  matrix: THREE.Matrix4,
  axis: THREE.Vector3,
  anchor: THREE.Vector3,
  out: PartShape,
): PartShape {
  matrix.decompose(_pos, _q, _scale);
  box.getCenter(_center).applyMatrix4(matrix);
  box.getSize(_size);
  const h = [
    (_size.x * Math.abs(_scale.x)) / 2,
    (_size.y * Math.abs(_scale.y)) / 2,
    (_size.z * Math.abs(_scale.z)) / 2,
  ] as const;
  _e[0].set(1, 0, 0).applyQuaternion(_q);
  _e[1].set(0, 1, 0).applyQuaternion(_q);
  _e[2].set(0, 0, 1).applyQuaternion(_q);
  let along = 0;
  let main = 0;
  let best = -1;
  for (let i = 0; i < 3; i++) {
    const a = Math.abs(_e[i]!.dot(axis));
    along += a * h[i]!;
    if (a > best) {
      best = a;
      main = i;
    }
  }
  out.depth = Math.max(0, anchor.dot(axis) - (_center.dot(axis) - along));
  const j = (main + 1) % 3;
  const k = (main + 2) % 3;
  const [iLong, iShort] = h[j]! >= h[k]! ? [j, k] : [k, j];
  _p.copy(_e[iLong]!).addScaledVector(axis, -_e[iLong]!.dot(axis));
  if (_p.lengthSq() < 1e-10) _p.copy(_e[iShort]!).addScaledVector(axis, -_e[iShort]!.dot(axis));
  if (_p.lengthSq() < 1e-10) _p.set(1, 0, 0).addScaledVector(axis, -axis.x);
  out.longDir.copy(_p).normalize();
  out.shortDir.crossVectors(axis, out.longDir).normalize();
  out.longHalf = h[iLong]!;
  out.shortHalf = h[iShort]!;
  return out;
}

/** Remplit une forme approchée à partir du seul rayon englobant (pièce inconnue). */
export function shapeFromSize(size: number, axis: THREE.Vector3, out: PartShape): PartShape {
  out.depth = size;
  out.longHalf = size * 0.7;
  out.shortHalf = size * 0.7;
  const ref = Math.abs(axis.z) < 0.9 ? _p.set(0, 0, 1) : _p.set(1, 0, 0);
  out.longDir.crossVectors(ref, axis).normalize();
  out.shortDir.crossVectors(axis, out.longDir).normalize();
  out.hasCenter = false;
  return out;
}

const _m = new THREE.Matrix4();

/** Sonde branchée sur l'objet en cours d'inspection. */
export class AssemblyProbe implements PartProbe {
  private readonly centers = new WeakMap<Assembly, THREE.Vector3>();

  constructor(private readonly getAssembly: () => Assembly | null) {}

  describe(partId: string, axis: THREE.Vector3, anchor: THREE.Vector3, out: PartShape): boolean {
    const assembly = this.getAssembly();
    const part = assembly?.parts.get(partId);
    if (!assembly || !part) return false;
    let box: THREE.Box3;
    if (part.instanced) {
      box = part.instanced.instanceBox;
      assembly.instanceWorldMatrix(partId, 0, _m);
    } else {
      box = part.localBox.isEmpty() ? part.subtreeBox : part.localBox;
      part.node.updateWorldMatrix(true, false);
      _m.copy(part.node.matrixWorld);
    }
    if (box.isEmpty()) return false;
    describeOrientedBox(box, _m, axis, anchor, out);
    // Centre de l'objet : mesuré une fois par objet (au premier geste, l'objet est assemblé).
    let center = this.centers.get(assembly);
    if (!center) {
      center = assembly.objectBounds(new THREE.Box3()).getCenter(new THREE.Vector3());
      this.centers.set(assembly, center);
    }
    out.objectCenter.copy(center);
    out.hasCenter = true;
    return true;
  }

  worldQuaternion(partId: string, out: THREE.Quaternion): boolean {
    const assembly = this.getAssembly();
    const part = assembly?.parts.get(partId);
    if (!assembly || !part) return false;
    if (part.instanced) {
      assembly.instanceWorldMatrix(partId, 0, _m).decompose(_pos, out, _scale);
      return true;
    }
    part.node.getWorldQuaternion(out);
    return true;
  }
}
