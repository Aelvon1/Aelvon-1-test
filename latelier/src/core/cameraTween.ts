/**
 * Interpolation douce de la caméra entre deux poses (transitions exploration ⇄ établi).
 * Position sur une courbe de Bézier quadratique (légère montée), orientation en slerp,
 * FOV interpolé ; easing « easeInOutCubic ».
 */
import * as THREE from 'three/webgpu';

export interface CameraPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

export function capturePose(camera: THREE.PerspectiveCamera): CameraPose {
  return { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
}

/** Pose regardant `target` depuis `position`. */
export function poseLookingAt(position: THREE.Vector3, target: THREE.Vector3, fov: number): CameraPose {
  const m = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0));
  return { position: position.clone(), quaternion: new THREE.Quaternion().setFromRotationMatrix(m), fov };
}

export class CameraTween {
  private elapsed = 0;
  private readonly control = new THREE.Vector3();
  private resolveDone: (() => void) | null = null;
  readonly done: Promise<void>;
  private finished = false;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly from: CameraPose,
    private readonly to: CameraPose,
    private readonly duration = 1.6,
    arcHeight = 0.12,
  ) {
    this.control.copy(from.position).lerp(to.position, 0.5);
    this.control.y += arcHeight;
    this.done = new Promise((resolve) => (this.resolveDone = resolve));
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Avance l'interpolation ; retourne vrai une fois terminée. */
  update(dt: number): boolean {
    if (this.finished) return true;
    this.elapsed += dt;
    const raw = Math.min(1, this.elapsed / this.duration);
    const t = easeInOutCubic(raw);
    const a = this.from.position;
    const b = this.to.position;
    const c = this.control;
    const u = 1 - t;
    this.camera.position.set(
      u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      u * u * a.z + 2 * u * t * c.z + t * t * b.z,
    );
    this.camera.quaternion.slerpQuaternions(this.from.quaternion, this.to.quaternion, t);
    this.camera.fov = this.from.fov + (this.to.fov - this.from.fov) * t;
    this.camera.updateProjectionMatrix();
    if (raw >= 1) {
      this.finished = true;
      this.resolveDone?.();
    }
    return this.finished;
  }
}
