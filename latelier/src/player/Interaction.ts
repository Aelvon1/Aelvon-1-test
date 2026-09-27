/**
 * Interaction au regard : lancer de rayon depuis le centre de l'écran contre les éléments
 * interactifs du décor (`world.interactables`), surbrillance de la cible, invite et réticule
 * dans le HUD (store), activation par la touche E (position physique `KeyE`).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import type { AppContext } from '../core/context';
import type { Interactable } from '../world/types';

/** Distance d'interaction par défaut (m). */
export const DEFAULT_INTERACT_DISTANCE = 1.8;
/**
 * Marge d'occultation (m). Approximation : les colliders du décor sont des volumes simplifiés
 * (une étagère = une boîte pleine) ; un obstacle n'occulte la cible que s'il est touché au moins
 * 25 cm avant elle, pour ne pas masquer un objet posé DANS le volume simplifié d'un meuble.
 */
const OCCLUSION_MARGIN = 0.25;

function isVisible(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

export class Interaction {
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  private current: Interactable | null = null;
  private currentDistance = Number.POSITIVE_INFINITY;

  constructor(
    private readonly ctx: AppContext,
    private readonly interactables: () => readonly Interactable[],
    /** Corps du personnage, exclu du test d'occultation (la caméra est dans la capsule). */
    private readonly characterBody: () => RAPIER.RigidBody | null,
  ) {}

  /** Cible actuellement visée. */
  get target(): Interactable | null {
    return this.current;
  }

  /** Distance de la cible visée (m). */
  get targetDistance(): number {
    return this.current ? this.currentDistance : Number.POSITIVE_INFINITY;
  }

  /** Recherche la cible sous le réticule et met à jour surbrillance et HUD. */
  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this.origin);
    camera.getWorldDirection(this.direction);
    this.raycaster.set(this.origin, this.direction);
    this.raycaster.near = 0;

    let best: Interactable | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const list = this.interactables();
    for (let i = 0; i < list.length; i++) {
      const item = list[i]!;
      const maxDistance = item.maxDistance ?? DEFAULT_INTERACT_DISTANCE;
      this.raycaster.far = Math.min(maxDistance, bestDistance);
      for (let k = 0; k < item.targets.length; k++) {
        const target = item.targets[k]!;
        if (!isVisible(target)) continue;
        this.hits.length = 0;
        this.raycaster.intersectObject(target, true, this.hits);
        const hit = this.hits[0];
        if (hit && hit.distance < bestDistance && hit.distance <= maxDistance) {
          best = item;
          bestDistance = hit.distance;
        }
      }
    }
    this.hits.length = 0;
    if (best && this.occluded(bestDistance)) best = null;
    this.setCurrent(best, bestDistance);
  }

  /** Active la cible visée (touche E). Retourne vrai si une action a eu lieu. */
  use(): boolean {
    const target = this.current;
    if (!target) return false;
    try {
      target.use();
    } catch (error) {
      console.error(`[Interaction] Échec de l'action « ${target.id} » :`, error);
    }
    // Le libellé change souvent après l'action (« Allumer » → « Éteindre »).
    this.publish(this.safePrompt(target), true);
    return true;
  }

  /** Retire la cible (joueur inactif) : plus de surbrillance ni d'invite. */
  clear(): void {
    this.setCurrent(null, Number.POSITIVE_INFINITY);
  }

  private occluded(distance: number): boolean {
    const body = this.characterBody();
    const world = this.ctx.physics.world;
    this.ray.origin.x = this.origin.x;
    this.ray.origin.y = this.origin.y;
    this.ray.origin.z = this.origin.z;
    this.ray.dir.x = this.direction.x;
    this.ray.dir.y = this.direction.y;
    this.ray.dir.z = this.direction.z;
    const hit = world.castRay(this.ray, distance, true, undefined, undefined, undefined, body ?? undefined);
    return hit !== null && hit.timeOfImpact < distance - OCCLUSION_MARGIN;
  }

  private setCurrent(next: Interactable | null, distance: number): void {
    const previous = this.current;
    this.currentDistance = distance;
    if (previous !== next) {
      try {
        previous?.setHighlighted?.(false);
        next?.setHighlighted?.(true);
      } catch (error) {
        console.error('[Interaction] Surbrillance impossible :', error);
      }
      this.current = next;
    }
    this.publish(next ? this.safePrompt(next) : null, next !== null);
  }

  private safePrompt(item: Interactable): string | null {
    try {
      return item.prompt() || null;
    } catch {
      return null;
    }
  }

  /** Écrit l'invite dans le store seulement si elle change (pas de rendu React inutile). */
  private publish(prompt: string | null, active: boolean): void {
    const hud = this.ctx.store.getState().hud;
    if (hud.prompt === prompt && hud.targetActive === active) return;
    this.ctx.store.setState((s) => ({ hud: { ...s.hud, prompt, targetActive: active } }));
  }
}
