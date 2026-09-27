/**
 * Types partagés du décor.
 */
import type * as THREE from 'three/webgpu';

/** Élément interactif (touche E). */
export interface Interactable {
  id: string;
  /** Objets visés par le réticule (lancer de rayon). */
  targets: THREE.Object3D[];
  /** Texte de l'invite sans la touche, ex. « Allumer la lampe ». */
  prompt(): string;
  use(): void;
  /** Distance maximale d'interaction (m), défaut 1,8. */
  maxDistance?: number;
  /** Mise en évidence au regard. */
  setHighlighted?(on: boolean): void;
}

/** Informations sur l'établi exposées aux autres systèmes. */
export interface BenchInfo {
  /** Centre de la surface supérieure du tapis antistatique (monde). */
  matCenter: THREE.Vector3;
  /** Dimensions utiles du tapis : x = largeur (X), y = profondeur (Z). */
  matSize: THREE.Vector2;
  /** Position de départ de la caméra d'inspection. */
  viewPosition: THREE.Vector3;
}
