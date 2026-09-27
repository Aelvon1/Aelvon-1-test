/**
 * Contrat entre le séquenceur de démontage et l'affichage des outils 3D animés.
 *
 * Pour chaque geste (retrait ou remontage d'une pièce), le séquenceur appelle :
 *   begin(geste) → update(état) à chaque image (approche, mouvement, retrait de l'outil) → end().
 * L'implémentation (catalogue de modèles + animations) vit dans `inspection/tools/`.
 */
import type * as THREE from 'three/webgpu';
import type { MotionKind } from '../../objects/types';

export interface ToolGesture {
  toolId: string;
  partId: string;
  motion: MotionKind;
  /** +1 démontage, −1 remontage. */
  direction: 1 | -1;
  /** Direction de sortie de la pièce (monde, normalisée). */
  axis: THREE.Vector3;
  /** Point de travail initial (monde) : ancrage de la pièce en place. */
  anchor: THREE.Vector3;
  /** Rayon de la sphère englobante de la pièce (m). */
  size: number;
  /** Durée du mouvement de la pièce (s), hors approche/retrait de l'outil. */
  motionDuration: number;
}

export interface ToolFrameState {
  /** Progression globale du geste 0..1 (approche + mouvement + retrait). */
  t: number;
  /** Progression du mouvement de la pièce 0..1 (0 avant le début du mouvement). */
  motionT: number;
  /** Rotation courante de la pièce autour de l'axe (rad) — clés et tournevis. */
  spin: number;
  /** Ancrage courant de la pièce (monde) : l'outil suit la pièce. */
  anchor: THREE.Vector3;
}

/** Durées (s) d'approche et de retrait de l'outil, encadrant le mouvement de la pièce. */
export const TOOL_APPROACH_SECONDS = 0.45;
export const TOOL_RETRACT_SECONDS = 0.4;

export interface ToolPresenter {
  begin(gesture: ToolGesture): void;
  update(state: ToolFrameState): void;
  end(): void;
  dispose(): void;
}

/** Présentateur inactif (aucun outil affiché). */
export const noopToolPresenter: ToolPresenter = {
  begin: () => undefined,
  update: () => undefined,
  end: () => undefined,
  dispose: () => undefined,
};
