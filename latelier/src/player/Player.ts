/**
 * Joueur à la première personne.
 *
 * - Déplacements liés à la POSITION PHYSIQUE des touches (`Input.moveAxes` : ZQSD en AZERTY,
 *   WASD en QWERTY), Maj = marche rapide, C = s'accroupir (appui bref : bascule ; maintenu :
 *   temporaire), vitesse lissée (accélération/décélération douces), gravité + accroche au sol.
 * - Capsule cinématique Rapier (glissement le long des obstacles, aucune traversée), UN SEUL
 *   pas de physique par image ; impossible de se relever sous un obstacle (`Character.resize`).
 * - Regard souris (sensibilité, inversion Y, tangage borné), FOV des réglages, balancement de
 *   tête léger et désactivable, pas sonores (béton / tapis) cadencés par la distance parcourue.
 * - Interaction au réticule (voir `Interaction.ts`), touche E.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../core/context';
import type { FrameInfo } from '../core/Engine';
import type { KeyInfo } from '../core/Input';
import type { Character } from '../core/Physics';
import { poseLookingAt, type CameraPose } from '../core/cameraTween';
import type { World } from '../world/World';
import { PLAYER, SPAWN } from '../world/layout';
import { Gait, type GaitInput } from './gait';
import { Interaction } from './Interaction';
import {
  CrouchToggle,
  VelocitySmoother,
  capsuleHalfHeight,
  smoothDamp,
  surfaceAt,
  wishVelocity,
  type DampState,
  type MoveIntent,
  type Surface,
  type Vec2,
} from './locomotion';

/** Radians par pixel de souris à la sensibilité 1. */
const MOUSE_RADIANS_PER_PIXEL = 0.0022;
/** Tangage maximal (≈ 83°). */
const PITCH_LIMIT = 1.45;
const GRAVITY = 9.81;
const MAX_FALL_SPEED = 20;
/** Vitesse verticale appliquée au sol : garde le contact (l'accroche au sol fait le reste). */
const GROUND_STICK_SPEED = 0.5;
/** Lissage de la hauteur des yeux (accroupi ↔ debout), s. */
const EYE_SMOOTH_TIME = 0.09;
/** Intervalle entre deux tentatives de se relever sous un obstacle (s). */
const STAND_RETRY_INTERVAL = 0.2;

const STAND_HALF_HEIGHT = capsuleHalfHeight(PLAYER.eyeHeight);
const CROUCH_HALF_HEIGHT = capsuleHalfHeight(PLAYER.crouchEyeHeight);

/** Instantané de l'état du joueur (débogage, tests automatisés). */
export interface PlayerDebugState {
  position: { x: number; y: number; z: number };
  feetY: number;
  eyeHeight: number;
  yaw: number;
  pitch: number;
  speed: number;
  grounded: boolean;
  crouched: boolean;
  wantCrouch: boolean;
  sprinting: boolean;
  surface: Surface;
  steps: number;
  target: string | null;
}

export class Player {
  private character: Character | null = null;
  private yaw: number = SPAWN.yaw;
  private pitch = -0.12;
  private active = false;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  private readonly velocity = new VelocitySmoother();
  private readonly wish: Vec2 = { x: 0, z: 0 };
  private readonly intent: MoveIntent = { forward: 0, right: 0, sprint: false, crouched: false };
  private readonly axes = { forward: 0, right: 0 };
  private readonly mouse = { x: 0, y: 0 };
  private readonly delta = { x: 0, y: 0, z: 0 };
  private verticalSpeed = 0;
  private grounded = false;

  private readonly crouch = new CrouchToggle();
  private crouched = false;
  private nextStandAttempt = 0;
  private readonly eye: DampState = { value: PLAYER.eyeHeight, rate: 0 };
  /** Hauteur des pieds lissée (petites marches franchies sans à-coup de caméra). */
  private smoothFeetY = 0;
  private feetInitialized = false;

  private readonly gait = new Gait();
  /** Entrée de la démarche, réutilisée à chaque image (aucune allocation). */
  private readonly gaitInput: GaitInput = {
    dt: 0,
    distance: 0,
    speed: 0,
    referenceSpeed: PLAYER.walkSpeed,
    crouched: false,
    sprinting: false,
    bobEnabled: true,
    time: 0,
  };
  private surface: Surface = 'concrete';
  private sprinting = false;
  private readonly interaction: Interaction;
  private readonly disposers: (() => void)[] = [];
  private time = 0;

  constructor(
    protected readonly ctx: AppContext,
    protected readonly world: World,
  ) {
    this.interaction = new Interaction(
      ctx,
      () => this.world.interactables,
      () => this.character?.body ?? null,
    );
  }

  init(): void {
    this.character = this.ctx.physics.createCharacter({
      radius: PLAYER.radius,
      halfHeight: STAND_HALF_HEIGHT,
      position: { x: SPAWN.position[0], y: STAND_HALF_HEIGHT + PLAYER.radius + 0.01, z: SPAWN.position[2] },
    });
    // Un pas initial (personnage immobile) insère les colliders du décor dans la structure
    // d'accélération : sans lui, le premier déplacement ne « voit » pas encore le sol.
    this.ctx.physics.step(1 / 60);
    const { input } = this.ctx;
    this.disposers.push(
      input.onKeyDown((key) => this.onKeyDown(key)),
      input.onKeyUp((key) => this.onKeyUp(key)),
    );
  }

  /** Active/désactive le contrôle (exploration ↔ inventaire, inspection, pause). */
  setActive(active: boolean): void {
    if (this.active === active) {
      if (active) this.applyCamera();
      return;
    }
    this.active = active;
    // Aucun élan ni mouvement de souris résiduel d'une phase à l'autre.
    this.velocity.reset();
    this.gait.reset();
    this.ctx.input.consumeMouseDelta(this.mouse);
    if (active) {
      this.applyCamera();
    } else {
      this.interaction.clear();
      this.crouch.wanted = this.crouched;
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Pose des yeux (transitions caméra). */
  getEyePose(): CameraPose {
    const pos = this.eyePosition(new THREE.Vector3());
    this.euler.set(this.pitch, this.yaw, 0);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.euler);
    return poseLookingAt(pos, pos.clone().add(dir), this.ctx.store.getState().settings.fov);
  }

  /** Oriente le regard (lacet : 0 = vers −Z ; tangage borné). */
  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    if (this.active) this.applyCamera();
  }

  /** Place le joueur debout en (x, z) au sol. */
  teleport(x: number, z: number, yaw?: number): void {
    const c = this.character;
    if (!c) return;
    c.teleport({ x, y: c.halfHeight + c.radius + 0.01, z });
    this.ctx.physics.world.propagateModifiedBodyPositionsToColliders();
    this.velocity.reset();
    this.verticalSpeed = 0;
    this.feetInitialized = false;
    if (yaw !== undefined) this.yaw = yaw;
    if (this.active) this.applyCamera();
  }

  applyCamera(): void {
    const camera = this.ctx.engine.camera;
    this.eyePosition(camera.position);
    const g = this.gait;
    if (g.offsetX !== 0 || g.offsetY !== 0) {
      // Décalage latéral le long du vecteur « droite » du lacet.
      camera.position.x += Math.cos(this.yaw) * g.offsetX;
      camera.position.z += -Math.sin(this.yaw) * g.offsetX;
      camera.position.y += g.offsetY;
    }
    this.euler.set(this.pitch, this.yaw, g.roll);
    camera.quaternion.setFromEuler(this.euler);
    const fov = this.ctx.store.getState().settings.fov;
    if (camera.fov !== fov || camera.near !== 0.05 || camera.far !== 60) {
      camera.fov = fov;
      camera.near = 0.05;
      camera.far = 60;
      camera.updateProjectionMatrix();
    }
  }

  update(frame: FrameInfo): void {
    if (!this.active || !this.character) return;
    const dt = frame.dt;
    if (dt <= 0) return;
    this.time += dt;
    const { input, store, physics } = this.ctx;
    const settings = store.getState().settings;
    const c = this.character;

    // --- Regard ---
    input.consumeMouseDelta(this.mouse);
    const sens = MOUSE_RADIANS_PER_PIXEL * settings.mouseSensitivity;
    this.yaw -= this.mouse.x * sens;
    this.pitch -= this.mouse.y * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    // Lacet ramené dans [−π, π] (précision sur de longues sessions).
    if (this.yaw > Math.PI) this.yaw -= 2 * Math.PI;
    else if (this.yaw < -Math.PI) this.yaw += 2 * Math.PI;

    // --- Accroupi : capsule réduite immédiatement, relevé seulement si la place le permet ---
    this.updateCrouch();

    // --- Vitesse horizontale visée puis lissée ---
    input.moveAxes(this.axes);
    const intent = this.intent;
    intent.forward = this.axes.forward;
    intent.right = this.axes.right;
    intent.sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    intent.crouched = this.crouched;
    wishVelocity(intent, this.yaw, this.wish);
    this.velocity.update(this.wish, dt);
    this.sprinting =
      intent.sprint && !this.crouched && intent.forward > 0 && this.velocity.speed > PLAYER.walkSpeed;

    // --- Gravité ---
    if (this.grounded) this.verticalSpeed = -GROUND_STICK_SPEED;
    else this.verticalSpeed = Math.max(-MAX_FALL_SPEED, this.verticalSpeed - GRAVITY * dt);

    // --- Déplacement cinématique (glissement) + unique pas de physique de l'image ---
    const d = this.delta;
    d.x = this.velocity.vx * dt;
    d.y = this.verticalSpeed * dt;
    d.z = this.velocity.vz * dt;
    const moved = c.move(d);
    this.grounded = moved.grounded;
    if (this.grounded && this.verticalSpeed < -GROUND_STICK_SPEED) this.verticalSpeed = -GROUND_STICK_SPEED;
    physics.step(dt);

    // Vitesse réellement obtenue : l'élan qui pousse dans un obstacle est retiré.
    const intended = d.x * d.x + d.z * d.z;
    const actual = moved.x * moved.x + moved.z * moved.z;
    if (intended > 1e-10 && actual < intended * 0.98) this.velocity.clipTo(moved.x / dt, moved.z / dt);

    // --- Démarche : pas sonores et balancement ---
    const distance = Math.sqrt(actual);
    const p = c.position();
    this.surface = surfaceAt(p.x, p.z);
    const gi = this.gaitInput;
    gi.dt = dt;
    gi.distance = distance;
    gi.speed = distance / dt;
    gi.crouched = this.crouched;
    gi.sprinting = this.sprinting;
    gi.bobEnabled = settings.headBob;
    gi.time = this.time;
    this.gait.update(gi);
    // Approximation : pas non spatialisés (joués au centre de l'auditeur, comme ses propres pieds).
    if (this.gait.stepped && this.grounded) {
      this.ctx.audio.play(this.surface === 'rug' ? 'step.rug' : 'step.concrete', {
        volume: this.gait.stepStrength * (this.surface === 'rug' ? 0.8 : 1),
      });
    }

    // --- Hauteur des yeux, caméra ---
    smoothDamp(this.eye, this.crouched ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight, EYE_SMOOTH_TIME, dt);
    const feet = p.y - c.halfHeight - c.radius;
    if (!this.feetInitialized || Math.abs(feet - this.smoothFeetY) > 0.3) {
      this.smoothFeetY = feet;
      this.feetInitialized = true;
    } else {
      this.smoothFeetY += (feet - this.smoothFeetY) * (1 - Math.exp(-dt / 0.05));
    }
    this.applyCamera();

    // --- Interaction au réticule ---
    this.interaction.update(this.ctx.engine.camera);
  }

  /** État courant (débogage : `window.__latelier.app.player.debugState()`). */
  debugState(): PlayerDebugState {
    const c = this.character;
    const p = c ? c.position() : { x: SPAWN.position[0], y: 0, z: SPAWN.position[2] };
    const feet = c ? p.y - c.halfHeight - c.radius : 0;
    return {
      position: { x: p.x, y: p.y, z: p.z },
      feetY: feet,
      eyeHeight: this.eye.value,
      yaw: this.yaw,
      pitch: this.pitch,
      speed: this.velocity.speed,
      grounded: this.grounded,
      crouched: this.crouched,
      wantCrouch: this.crouch.wanted,
      sprinting: this.sprinting,
      surface: this.surface,
      steps: this.gait.steps,
      target: this.interaction.target?.id ?? null,
    };
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.interaction.clear();
  }

  // --- Interne -----------------------------------------------------------------------------

  private onKeyDown(key: KeyInfo): void {
    if (!this.active || key.inTextField || key.repeat) return;
    if (key.code === 'KeyC' && !key.ctrl && !key.meta) {
      this.crouch.press(performance.now() / 1000);
    } else if (key.code === 'KeyE' && !key.ctrl && !key.meta) {
      this.interaction.use();
    }
  }

  private onKeyUp(key: KeyInfo): void {
    if (key.code === 'KeyC') this.crouch.release(performance.now() / 1000);
  }

  private updateCrouch(): void {
    const c = this.character;
    if (!c) return;
    const want = this.crouch.wanted;
    if (want && !this.crouched) {
      c.resize(CROUCH_HALF_HEIGHT);
      this.crouched = true;
      this.ctx.physics.world.propagateModifiedBodyPositionsToColliders();
    } else if (!want && this.crouched && this.time >= this.nextStandAttempt) {
      if (c.resize(STAND_HALF_HEIGHT)) {
        this.crouched = false;
        this.ctx.physics.world.propagateModifiedBodyPositionsToColliders();
      } else {
        // Obstacle au-dessus : on reste accroupi et on réessaie un peu plus tard.
        this.nextStandAttempt = this.time + STAND_RETRY_INTERVAL;
      }
    }
  }

  /** Position des yeux (sans balancement) écrite dans `out`. */
  private eyePosition(out: THREE.Vector3): THREE.Vector3 {
    const c = this.character;
    if (!c) return out.set(SPAWN.position[0], PLAYER.eyeHeight, SPAWN.position[2]);
    const p = c.position();
    const feet = this.feetInitialized ? this.smoothFeetY : p.y - c.halfHeight - c.radius;
    return out.set(p.x, feet + this.eye.value, p.z);
  }
}
