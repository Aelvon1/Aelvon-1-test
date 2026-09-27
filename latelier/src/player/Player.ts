/**
 * Joueur à la première personne.
 *
 * Version socle : regard souris et déplacement physique minimal (capsule Rapier cinématique).
 * La phase « déplacement » complète : marche rapide, accroupi, balancement, pas sonores,
 * interactions (E) avec surbrillance et invite.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../core/context';
import type { FrameInfo } from '../core/Engine';
import type { Character } from '../core/Physics';
import { poseLookingAt, type CameraPose } from '../core/cameraTween';
import type { World } from '../world/World';
import { PLAYER, SPAWN } from '../world/layout';

export class Player {
  private character: Character | null = null;
  private yaw: number = SPAWN.yaw;
  private pitch = -0.12;
  private active = false;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(
    protected readonly ctx: AppContext,
    protected readonly world: World,
  ) {}

  init(): void {
    const halfHeight = (PLAYER.eyeHeight + 0.1) / 2 - PLAYER.radius;
    this.character = this.ctx.physics.createCharacter({
      radius: PLAYER.radius,
      halfHeight,
      position: { x: SPAWN.position[0], y: halfHeight + PLAYER.radius + 0.01, z: SPAWN.position[2] },
    });
  }

  setActive(active: boolean): void {
    this.active = active;
    if (active) this.applyCamera();
  }

  /** Pose des yeux (transitions caméra). */
  getEyePose(): CameraPose {
    const pos = this.eyePosition();
    this.euler.set(this.pitch, this.yaw, 0);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.euler);
    return poseLookingAt(pos, pos.clone().add(dir), this.ctx.store.getState().settings.fov);
  }

  applyCamera(): void {
    const camera = this.ctx.engine.camera;
    camera.position.copy(this.eyePosition());
    this.euler.set(this.pitch, this.yaw, 0);
    camera.quaternion.setFromEuler(this.euler);
    camera.fov = this.ctx.store.getState().settings.fov;
    camera.near = 0.05;
    camera.far = 60;
    camera.updateProjectionMatrix();
  }

  update(frame: FrameInfo): void {
    if (!this.active || !this.character) return;
    const { input, store } = this.ctx;
    const settings = store.getState().settings;
    const mouse = input.consumeMouseDelta();
    const sens = 0.0022 * settings.mouseSensitivity;
    this.yaw -= mouse.x * sens;
    this.pitch -= mouse.y * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    const axes = input.moveAxes();
    const speed =
      input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const move = forward.multiplyScalar(axes.forward).add(right.multiplyScalar(axes.right));
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(speed * frame.dt);
    move.y = -9.81 * 0.1 * frame.dt;
    this.character.move(move);
    this.ctx.physics.step(frame.dt);
    this.applyCamera();
  }

  private eyePosition(): THREE.Vector3 {
    const c = this.character;
    if (!c) return new THREE.Vector3(SPAWN.position[0], PLAYER.eyeHeight, SPAWN.position[2]);
    const p = c.position();
    const feet = p.y - c.halfHeight - c.radius;
    return new THREE.Vector3(p.x, feet + PLAYER.eyeHeight, p.z);
  }
}
