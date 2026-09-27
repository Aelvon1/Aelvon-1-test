/**
 * Aides communes du catalogue : création de maillages, sous-objets nommés (rig), inclinaison
 * vers le côté extérieur, tremblements déterministes. Les vecteurs et quaternions temporaires
 * sont partagés (aucune allocation dans les animations).
 */
import * as THREE from 'three/webgpu';
import type { ToolRigContext } from './rig';

export const AXIS_X = new THREE.Vector3(1, 0, 0);
export const AXIS_Y = new THREE.Vector3(0, 1, 0);
export const AXIS_Z = new THREE.Vector3(0, 0, 1);

const _axis = new THREE.Vector3();

/** Maillage d'outil (ombres portées et reçues). */
export function toolMesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Groupe nommé (sous-ensemble animé : mors, levier, piston…). */
export function toolGroup(name: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  if (children.length) g.add(...children);
  return g;
}

/** Racine d'un modèle d'outil. */
export function toolRoot(name: string): THREE.Group {
  const root = new THREE.Group();
  root.name = `Outil « ${name} »`;
  return root;
}

/**
 * Côté d'inclinaison : de préférence de profil (±X du montage, du côté extérieur de l'objet),
 * pour que l'outil ne masque pas la zone de travail à la caméra.
 */
export function sideSign(ctx: ToolRigContext): 1 | -1 {
  return ctx.outwardX < -0.2 ? -1 : 1;
}

/**
 * Oriente `target` : l'axe +Y de l'outil s'incline de `angle` (rad) vers la direction (dx, dz)
 * du plan XZ du montage (rotation autour de l'axe horizontal perpendiculaire).
 */
export function leanQuaternion(
  target: THREE.Quaternion,
  dx: number,
  dz: number,
  angle: number,
): THREE.Quaternion {
  // Axe de rotation = Y × d (fait basculer +Y vers d).
  _axis.set(dz, 0, -dx);
  if (_axis.lengthSq() < 1e-12) return target.identity();
  _axis.normalize();
  return target.setFromAxisAngle(_axis, angle);
}

/** Tremblement déterministe (m ou rad) : somme de deux sinusoïdes incommensurables. */
export function tremor(seconds: number, amplitude: number, f1 = 7.3, f2 = 17.9): number {
  return (
    amplitude *
    (0.65 * Math.sin(2 * Math.PI * f1 * seconds) + 0.35 * Math.sin(2 * Math.PI * f2 * seconds + 1.3))
  );
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
