/**
 * Physique (Rapier) : monde statique de colliders simplifiés (boîtes, capsules, cylindres) et
 * contrôleur de personnage cinématique (glissement le long des obstacles).
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';

/** Description d'un collider statique (repère monde). */
export type StaticColliderSpec =
  | {
      kind: 'box';
      /** Centre (m). */
      center: readonly [number, number, number];
      /** Demi-dimensions (m). */
      halfExtents: readonly [number, number, number];
      /** Rotation autour de Y (rad). */
      rotationY?: number;
      /** Nom pour le debug. */
      name?: string;
    }
  | {
      kind: 'cylinder';
      center: readonly [number, number, number];
      radius: number;
      halfHeight: number;
      name?: string;
    }
  | {
      kind: 'capsule';
      center: readonly [number, number, number];
      radius: number;
      halfHeight: number;
      name?: string;
    };

export interface CharacterOptions {
  radius: number;
  /** Demi-hauteur de la partie cylindrique de la capsule. */
  halfHeight: number;
  position: THREE.Vector3Like;
}

/** Personnage cinématique : capsule + contrôleur Rapier. */
export class Character {
  constructor(
    private readonly world: RAPIER.World,
    readonly body: RAPIER.RigidBody,
    private collider: RAPIER.Collider,
    readonly controller: RAPIER.KinematicCharacterController,
    public radius: number,
    public halfHeight: number,
  ) {}

  /** Déplace le personnage de `delta` (m) en glissant contre les obstacles ; retourne le mouvement effectif. */
  move(delta: THREE.Vector3Like): { x: number; y: number; z: number; grounded: boolean } {
    this.controller.computeColliderMovement(this.collider, { x: delta.x, y: delta.y, z: delta.z });
    const m = this.controller.computedMovement();
    const p = this.body.translation();
    this.body.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    return { x: m.x, y: m.y, z: m.z, grounded: this.controller.computedGrounded() };
  }

  /** Position du centre de la capsule (après le pas de simulation). */
  position(): { x: number; y: number; z: number } {
    return this.body.nextTranslation();
  }

  teleport(position: THREE.Vector3Like): void {
    this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
    this.body.setNextKinematicTranslation({ x: position.x, y: position.y, z: position.z });
  }

  /** Change la demi-hauteur (accroupi) ; retourne `false` si l'espace au-dessus est obstrué. */
  resize(halfHeight: number): boolean {
    if (Math.abs(halfHeight - this.halfHeight) < 1e-4) return true;
    const p = this.body.translation();
    const bottom = p.y - this.halfHeight - this.radius;
    const newCenterY = bottom + halfHeight + this.radius;
    if (halfHeight > this.halfHeight) {
      // Vérifie qu'on peut se relever.
      const shape = new RAPIER.Capsule(halfHeight, this.radius * 0.95);
      const hit = this.world.intersectionWithShape(
        { x: p.x, y: newCenterY, z: p.z },
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
        undefined,
        undefined,
        this.collider,
        this.body,
      );
      if (hit) return false;
    }
    this.world.removeCollider(this.collider, false);
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, this.radius),
      this.body,
    );
    this.halfHeight = halfHeight;
    this.teleport({ x: p.x, y: newCenterY, z: p.z });
    return true;
  }
}

export class Physics {
  private constructor(readonly world: RAPIER.World) {}

  static async create(): Promise<Physics> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    return new Physics(world);
  }

  /** Ajoute un collider statique ; retourne la fonction de retrait. */
  addStatic(spec: StaticColliderSpec): () => void {
    let desc: RAPIER.ColliderDesc;
    switch (spec.kind) {
      case 'box': {
        desc = RAPIER.ColliderDesc.cuboid(spec.halfExtents[0], spec.halfExtents[1], spec.halfExtents[2]);
        if (spec.rotationY) {
          const h = spec.rotationY / 2;
          desc.setRotation({ x: 0, y: Math.sin(h), z: 0, w: Math.cos(h) });
        }
        break;
      }
      case 'cylinder':
        desc = RAPIER.ColliderDesc.cylinder(spec.halfHeight, spec.radius);
        break;
      case 'capsule':
        desc = RAPIER.ColliderDesc.capsule(spec.halfHeight, spec.radius);
        break;
    }
    desc.setTranslation(spec.center[0], spec.center[1], spec.center[2]);
    const collider = this.world.createCollider(desc);
    return () => this.world.removeCollider(collider, false);
  }

  createCharacter(options: CharacterOptions): Character {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        options.position.x,
        options.position.y,
        options.position.z,
      ),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(options.halfHeight, options.radius),
      body,
    );
    const controller = this.world.createCharacterController(0.01);
    controller.setSlideEnabled(true);
    controller.enableAutostep(0.05, 0.1, false);
    controller.enableSnapToGround(0.1);
    controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);
    return new Character(this.world, body, collider, controller, options.radius, options.halfHeight);
  }

  /** Lancer de rayon contre les colliders (ex. pas de caméra hors des murs). */
  castRay(origin: THREE.Vector3Like, dir: THREE.Vector3Like, maxToi: number): number | null {
    const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRay(ray, maxToi, true);
    return hit ? hit.timeOfImpact : null;
  }

  step(dt: number): void {
    this.world.timestep = Math.min(Math.max(dt, 1 / 240), 1 / 20);
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
