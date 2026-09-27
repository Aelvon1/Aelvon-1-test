/**
 * Contexte de construction partagé par les modules du décor.
 */
import type * as THREE from 'three/webgpu';
import type { StaticColliderSpec } from '../../core/Physics';
import type { StaticBatch } from '../geometry/StaticBatch';
import type { WorldMaterials } from '../materials/WorldMaterials';

export interface DecorBuild {
  /** Géométrie statique fusionnée par matériau. */
  batch: StaticBatch;
  /** Décalques et surfaces transparentes (fusionnés à part : pas d'ombre portée). */
  overlays: StaticBatch;
  /** Maillages indépendants (animés, interactifs, matériaux uniques). */
  group: THREE.Group;
  materials: WorldMaterials;
  colliders: StaticColliderSpec[];
}
