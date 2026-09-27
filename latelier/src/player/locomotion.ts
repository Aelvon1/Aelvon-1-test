/**
 * Logique pure de locomotion (sans three.js ni physique, testable sous Node) : vitesse visée,
 * lissage critique de la vitesse (accélération/décélération douces), accroupissement
 * (appui bref = bascule, appui maintenu = temporaire), surface sous les pieds.
 */
import { PLAYER, RUG } from '../world/layout';

/** Vecteur horizontal (plan XZ). */
export interface Vec2 {
  x: number;
  z: number;
}

/** Temps de lissage de la vitesse à l'accélération (s) : ≈ 95 % de la vitesse visée en 0,24 s. */
export const ACCEL_SMOOTH_TIME = 0.1;
/** Temps de lissage au freinage (s) : arrêt en ≈ 0,18 s. */
export const DECEL_SMOOTH_TIME = 0.075;
/** Facteur de vitesse en marche arrière. */
export const BACKWARD_FACTOR = 0.85;
/** Durée d'appui au-delà de laquelle C agit en « maintenu » plutôt qu'en bascule (s). */
export const CROUCH_HOLD_THRESHOLD = 0.35;

/** Intention de déplacement issue des entrées. */
export interface MoveIntent {
  /** +1 avancer, −1 reculer. */
  forward: number;
  /** +1 pas chassé à droite, −1 à gauche. */
  right: number;
  sprint: boolean;
  crouched: boolean;
}

/** Vitesse maximale selon l'allure (m/s). La marche rapide ne s'applique qu'en avançant. */
export function moveSpeed(intent: MoveIntent): number {
  if (intent.crouched) return PLAYER.crouchSpeed;
  if (intent.sprint && intent.forward > 0) return PLAYER.sprintSpeed;
  return PLAYER.walkSpeed;
}

/**
 * Vitesse horizontale visée dans le repère monde (lacet `yaw` : 0 = regarde vers −Z).
 * Écrit dans `out` (aucune allocation) et le retourne.
 */
export function wishVelocity(intent: MoveIntent, yaw: number, out: Vec2): Vec2 {
  let f = intent.forward;
  let r = intent.right;
  const len = Math.hypot(f, r);
  if (len < 1e-6) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  // Diagonale : pas plus rapide qu'en ligne droite.
  if (len > 1) {
    f /= len;
    r /= len;
  }
  let speed = moveSpeed(intent);
  if (f < 0) speed *= BACKWARD_FACTOR;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  // avant = (−sin, −cos) ; droite = (cos, −sin)
  out.x = (-s * f + c * r) * speed;
  out.z = (-c * f - s * r) * speed;
  return out;
}

/** État d'un lissage critique : valeur et sa dérivée. */
export interface DampState {
  value: number;
  rate: number;
}

/**
 * Amortissement critique (« SmoothDamp ») d'une valeur vers une cible : départ et arrivée
 * sans à-coup, indépendant de la fréquence d'image. Modifie `state` et retourne la valeur.
 */
export function smoothDamp(state: DampState, target: number, smoothTime: number, dt: number): number {
  const t = Math.max(1e-4, smoothTime);
  const omega = 2 / t;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.rate + omega * change) * dt;
  state.rate = (state.rate - omega * temp) * decay;
  state.value = target + (change + temp) * decay;
  return state.value;
}

/** Lissage de la vitesse horizontale (deux composantes amorties). */
export class VelocitySmoother {
  readonly x: DampState = { value: 0, rate: 0 };
  readonly z: DampState = { value: 0, rate: 0 };

  get vx(): number {
    return this.x.value;
  }

  get vz(): number {
    return this.z.value;
  }

  get speed(): number {
    return Math.hypot(this.x.value, this.z.value);
  }

  /** Avance d'un pas de temps vers la vitesse visée. */
  update(target: Vec2, dt: number): void {
    const targetSpeed = Math.hypot(target.x, target.z);
    // Freinage plus vif que l'élan (sensation de contrôle), mais toujours sans à-coup.
    const smoothTime = targetSpeed + 1e-3 < this.speed ? DECEL_SMOOTH_TIME : ACCEL_SMOOTH_TIME;
    smoothDamp(this.x, target.x, smoothTime, dt);
    smoothDamp(this.z, target.z, smoothTime, dt);
    // Résidu négligeable : arrêt net (évite une dérive infinitésimale).
    if (targetSpeed === 0 && this.speed < 1e-3) this.reset();
  }

  /**
   * Remplace la vitesse par la vitesse réellement obtenue (glissement contre un obstacle) :
   * la composante qui pousse dans le mur est retirée, l'élan ne s'accumule pas.
   */
  clipTo(vx: number, vz: number): void {
    this.x.value = vx;
    this.z.value = vz;
  }

  reset(): void {
    this.x.value = 0;
    this.x.rate = 0;
    this.z.value = 0;
    this.z.rate = 0;
  }
}

/**
 * Commande d'accroupissement : un appui bref bascule (accroupi ↔ debout), un appui maintenu
 * plus de `CROUCH_HOLD_THRESHOLD` s agit temporairement (relâcher = se relever).
 */
export class CrouchToggle {
  /** Souhait courant du joueur. */
  wanted = false;
  private pressTime = 0;
  private crouchedByPress = false;

  press(time: number): void {
    this.pressTime = time;
    if (this.wanted) {
      this.wanted = false;
      this.crouchedByPress = false;
    } else {
      this.wanted = true;
      this.crouchedByPress = true;
    }
  }

  release(time: number): void {
    if (this.crouchedByPress && time - this.pressTime >= CROUCH_HOLD_THRESHOLD) this.wanted = false;
    this.crouchedByPress = false;
  }

  reset(): void {
    this.wanted = false;
    this.crouchedByPress = false;
  }
}

export type Surface = 'concrete' | 'rug';

/** Surface sous les pieds (le vieux tapis central, sinon le béton). */
export function surfaceAt(x: number, z: number): Surface {
  return x >= RUG.x[0] && x <= RUG.x[1] && z >= RUG.z[0] && z <= RUG.z[1] ? 'rug' : 'concrete';
}

/** Demi-hauteur de la partie cylindrique de la capsule pour une hauteur d'yeux donnée. */
export function capsuleHalfHeight(eyeHeight: number): number {
  // Sommet de la capsule 10 cm au-dessus des yeux (front, cheveux).
  return Math.max(0.05, (eyeHeight + 0.1) / 2 - PLAYER.radius);
}
