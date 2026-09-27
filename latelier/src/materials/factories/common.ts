/**
 * Éléments communs aux fabriques paramétrables de matériaux.
 */
import * as THREE from 'three/webgpu';
import { clamp } from 'three/tsl';
import type { FloatNode } from '../tsl/types';

/** Options communes à toutes les fabriques. */
export interface CommonOptions {
  /** Nom du matériau (débogage). */
  name?: string;
}

/** Rugosité bornée (évite les reflets « aiguille » instables et les valeurs > 1). */
export function clampRoughness(r: FloatNode, min = 0.03): FloatNode {
  return clamp(r, min, 1);
}

/** Crée un `MeshPhysicalNodeMaterial` nommé. */
export function physical(
  name: string | undefined,
  parameters: THREE.MeshPhysicalNodeMaterialParameters,
): THREE.MeshPhysicalNodeMaterial {
  const m = new THREE.MeshPhysicalNodeMaterial(parameters);
  if (name) m.name = name;
  return m;
}

/** Crée un `MeshStandardNodeMaterial` nommé (surfaces sans clearcoat/sheen/transmission). */
export function standard(
  name: string | undefined,
  parameters: THREE.MeshStandardNodeMaterialParameters,
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial(parameters);
  if (name) m.name = name;
  return m;
}
