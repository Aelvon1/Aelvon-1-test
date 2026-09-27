/**
 * Pipeline de post-traitement (TSL, `THREE.RenderPipeline`).
 *
 * Version socle : simple passe de scène. La phase « finitions » ajoute GTAO, bloom, profondeur
 * de champ, assombrissement de l'arrière-plan, contours de sélection, étalonnage chaud/froid,
 * grain, vignettage et anticrénelage — derrière la même API.
 */
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import type { Engine, FrameInfo } from '../core/Engine';
import type { AppStore } from '../core/store';

export type PostMode = 'home' | 'exploration' | 'inspection';

/** Mise au point de l'inspection : distance caméra → objet et rayon de l'objet (m). */
export interface InspectionFocus {
  distance: number;
  radius: number;
}

export type OutlineKind = 'hover' | 'selected' | 'blocked';

export class PostFX {
  protected pipeline: THREE.RenderPipeline | null = null;
  protected mode: PostMode = 'home';

  constructor(
    protected readonly engine: Engine,
    protected readonly store: AppStore,
  ) {}

  init(): void {
    const pipeline = new THREE.RenderPipeline(this.engine.renderer);
    pipeline.outputNode = pass(this.engine.scene, this.engine.camera);
    this.pipeline = pipeline;
    this.engine.renderFn = () => pipeline.render();
  }

  setMode(mode: PostMode): void {
    this.mode = mode;
  }

  /** Profondeur de champ + assombrissement de l'arrière-plan (null = désactivé). */
  setFocus(_focus: InspectionFocus | null): void {}

  /** Objets à entourer (contour lumineux) selon leur rôle. */
  setOutline(_kind: OutlineKind, _objects: readonly THREE.Object3D[]): void {}

  /** Assombrissement de l'arrière-plan en inspection (0..1). */
  setBackgroundDim(_amount: number): void {}

  update(_frame: FrameInfo): void {}

  dispose(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
  }
}
