/**
 * Matériaux simples propres à l'objet (TSL, `MeshPhysicalNodeMaterial`) : diélectriques des
 * condensateurs céramiques (teinte selon la classe), varistances, ferrites.
 */
import * as THREE from 'three/webgpu';
import type { MaterialFactory } from '../../materials/types';

const plain =
  (name: string, color: number, roughness: number): MaterialFactory =>
  () =>
    new THREE.MeshPhysicalNodeMaterial({ name, color, roughness, metalness: 0 });

export function miscMaterials(): Record<string, MaterialFactory> {
  return {
    // Céramiques multicouches : C0G gris clair, X7R beige, X5R brun.
    'mlcc.c0g': plain('Céramique C0G', 0xc9c0ab, 0.55),
    'mlcc.x7r': plain('Céramique X7R', 0xb49c73, 0.55),
    'mlcc.x5r': plain('Céramique X5R', 0x8c6d49, 0.58),
    // Varistance à oxyde de zinc (gris) et ferrite NiZn (gris très foncé, mat).
    varistor: plain('Varistance ZnO', 0x6c7074, 0.6),
    ferrite: plain('Ferrite NiZn', 0x2c2d2f, 0.72),
  };
}
