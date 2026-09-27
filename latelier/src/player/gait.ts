/**
 * Démarche (logique pure, testable) : cadence des pas liée à la DISTANCE parcourue (pas de pas
 * « dans le vide » contre un mur), balancement de la tête (vertical à chaque pas, latéral et
 * roulis à chaque foulée), léger souffle au repos.
 */

/** Longueur d'un pas (m) selon la vitesse : pas plus longs en marche rapide, courts accroupi. */
export function stepLength(speed: number, crouched: boolean): number {
  if (crouched) return 0.5;
  return Math.min(0.95, Math.max(0.55, 0.42 + 0.22 * speed));
}

/** Amplitudes du balancement de la tête (m, rad). */
export const BOB = {
  vertical: 0.014,
  verticalSprint: 0.022,
  verticalCrouch: 0.008,
  lateral: 0.01,
  roll: 0.003,
  /** Respiration au repos (m). */
  breath: 0.0025,
  /** Période de respiration (s). */
  breathPeriod: 4.2,
} as const;

/** Vitesse en dessous de laquelle le joueur est considéré à l'arrêt (m/s). */
export const STOP_SPEED = 0.12;

export interface GaitInput {
  dt: number;
  /** Distance horizontale réellement parcourue pendant l'image (m). */
  distance: number;
  /** Vitesse horizontale réelle (m/s). */
  speed: number;
  /** Vitesse de référence (marche) pour normaliser l'intensité du balancement. */
  referenceSpeed: number;
  crouched: boolean;
  sprinting: boolean;
  /** Balancement activé (réglage). */
  bobEnabled: boolean;
  /** Temps courant (s), pour la respiration. */
  time: number;
}

export class Gait {
  /** Avancement dans le pas courant (0..1). */
  progress = 0;
  /** Nombre de pas effectués (parité = pied). */
  steps = 0;
  /** Intensité lissée du balancement (0..~1,3). */
  intensity = 0;
  /** Sorties : décalage latéral (m, vers la droite), vertical (m), roulis (rad). */
  offsetX = 0;
  offsetY = 0;
  roll = 0;
  /** Pas émis pendant la dernière mise à jour (0 ou 1) et sa force (0..1). */
  stepped = false;
  stepStrength = 0;
  private moving = false;
  /** Avancement (en pas) depuis le dernier pas émis. */
  private sinceStep = 0;
  /** Nombre de cycles de pas complets (phase du balancement latéral). */
  private cycles = 0;

  update(input: GaitInput): void {
    this.stepped = false;
    const { dt, distance, speed } = input;
    const movingNow = speed > STOP_SPEED;

    if (movingNow && !this.moving) {
      // Départ : le premier pas tombe après une demi-longueur de pas (≈ 0,3 s).
      this.progress = Math.max(this.progress, 0.5);
    }
    if (!movingNow && this.moving && this.sinceStep > 0.45) {
      // Arrêt au milieu d'une foulée : on repose le pied (pas plus léger). La phase n'est pas
      // remise à zéro (le balancement s'éteint avec l'intensité, sans saut de caméra).
      this.emitStep(0.55);
    }
    this.moving = movingNow;

    if (movingNow && distance > 0) {
      const advance = distance / stepLength(speed, input.crouched);
      this.progress += advance;
      this.sinceStep += advance;
      if (this.progress >= 1) {
        this.cycles += Math.floor(this.progress);
        this.progress -= Math.floor(this.progress);
        const strength = input.crouched ? 0.55 : input.sprinting ? 1.15 : 1;
        this.emitStep(strength);
      }
    }

    // Intensité : suit la vitesse avec une constante de temps de 0,15 s.
    const targetIntensity = input.bobEnabled ? Math.min(1.3, speed / Math.max(0.1, input.referenceSpeed)) : 0;
    const k = 1 - Math.exp(-dt / 0.15);
    this.intensity += (targetIntensity - this.intensity) * k;

    if (!input.bobEnabled) {
      this.offsetX = 0;
      this.offsetY = 0;
      this.roll = 0;
      return;
    }
    const amp = input.crouched ? BOB.verticalCrouch : input.sprinting ? BOB.verticalSprint : BOB.vertical;
    // Phase de foulée continue (le pas « reposé » à l'arrêt ne la décale pas).
    const stride = Math.PI * (this.cycles + this.progress);
    const w = Math.min(1, this.intensity);
    // Tête au plus bas à l'appui du pied (progress = 0), au plus haut à mi-pas.
    this.offsetY = -Math.cos(2 * Math.PI * this.progress) * amp * this.intensity;
    this.offsetX = Math.sin(stride) * BOB.lateral * w;
    this.roll = Math.sin(stride) * BOB.roll * w;
    // Respiration discrète, masquée par la marche.
    this.offsetY += Math.sin((2 * Math.PI * input.time) / BOB.breathPeriod) * BOB.breath * (1 - w);
  }

  reset(): void {
    this.progress = 0;
    this.intensity = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.roll = 0;
    this.stepped = false;
    this.moving = false;
    this.sinceStep = 0;
  }

  private emitStep(strength: number): void {
    this.sinceStep = 0;
    this.stepped = true;
    this.stepStrength = strength;
    this.steps++;
  }
}
