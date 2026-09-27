/**
 * Mode inspection et démontage.
 *
 * Version socle : la transition caméra vers l'établi et le retour sont fonctionnels ; la
 * construction de l'objet, la caméra orbitale, l'éclatement, le pas à pas, le démontage libre
 * et les outils d'analyse sont ajoutés par la phase « système de démontage » derrière cette API.
 */
import type { AppContext } from '../core/context';
import type { FrameInfo } from '../core/Engine';
import { CameraTween, capturePose, poseLookingAt, type CameraPose } from '../core/cameraTween';
import type { ObjectParams } from '../objects/types';
import { INSPECTION_VIEW } from '../world/layout';
import type { World } from '../world/World';

export class Inspection {
  private tween: CameraTween | null = null;

  constructor(
    protected readonly ctx: AppContext,
    protected readonly world: World,
  ) {}

  update(frame: FrameInfo): void {
    if (this.tween && this.tween.update(frame.dt)) this.tween = null;
  }

  /** Ouvre l'inspection d'un objet : transition caméra jusqu'à l'établi. */
  async open(objectId: string, _params?: ObjectParams): Promise<void> {
    const camera = this.ctx.engine.camera;
    const target = this.world.bench.matCenter;
    const to = poseLookingAt(this.world.bench.viewPosition, target, INSPECTION_VIEW.fov);
    this.tween = new CameraTween(camera, capturePose(camera), to, 1.6);
    await this.tween.done;
    if (import.meta.env.DEV)
      console.info(`[Inspection] Objet « ${objectId} » (socle : construction non implémentée).`);
  }

  /** Ferme l'inspection : retour caméra vers `returnPose`. */
  async close(returnPose: CameraPose): Promise<void> {
    const camera = this.ctx.engine.camera;
    this.tween = new CameraTween(camera, capturePose(camera), returnPose, 1.3);
    await this.tween.done;
  }

  /** Génère les miniatures d'inventaire (planches de sprites). */
  async renderThumbnails(_objectIds: string[]): Promise<void> {}

  dispose(): void {
    this.tween = null;
  }
}
