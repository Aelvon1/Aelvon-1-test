/**
 * Logique pure des éléments « vivants » des accessoires : régime du ventilateur (montée et
 * descente en vitesse), lectures des appareils de mesure (légère gigue réaliste des derniers
 * chiffres), clignotement des voyants. Fonctions déterministes du temps : `?time=…` fige tout.
 */

/** Hachage déterministe d'un entier → 0..1. */
export function hash01(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/**
 * Régime du ventilateur : premier ordre (montée ~2,4 s à 95 %, descente en roue libre ~3,6 s),
 * calé sur la boucle audio `fan.motor` (montée 2,5 s, ralentissement pendant le fondu d'arrêt).
 */
export class FanSpin {
  /** Consigne (interrupteur). */
  on = false;
  /** Régime 0..1. */
  speed = 0;
  /** Angle du rotor (rad), borné à [0, 2π). */
  angle = 0;
  /** Constantes de temps (s). */
  static readonly TAU_UP = 0.8;
  static readonly TAU_DOWN = 1.2;
  /**
   * Vitesse de rotation VISUELLE maximale (tr/s). Approximation : un ventilateur réel tourne à
   * ~20 tr/s ; à 60 i/s trois pales produiraient un effet stroboscopique (rotation apparente
   * inversée). On plafonne donc la rotation affichée et un disque de flou prend le relais.
   */
  static readonly VISUAL_MAX_RPS = 4.2;

  update(dt: number): void {
    const target = this.on ? 1 : 0;
    const tau = this.on ? FanSpin.TAU_UP : FanSpin.TAU_DOWN;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt / tau));
    if (!this.on && this.speed < 1e-3) this.speed = 0;
    this.angle = (this.angle + this.speed * FanSpin.VISUAL_MAX_RPS * Math.PI * 2 * dt) % (Math.PI * 2);
  }

  /** Opacité du disque de flou (0 à l'arrêt, ~0,6 à plein régime). */
  get blur(): number {
    const s = Math.max(0, (this.speed - 0.25) / 0.75);
    return 0.6 * s * s;
  }
}

/** Lectures affichées par l'alimentation (consigne 12,0 V, charge ~0,35 A). */
export function psuReadings(time: number): { volts: number; amps: number } {
  const n = Math.floor(time * 3);
  const jitter = hash01(n) < 0.7 ? 0 : hash01(n + 7919) < 0.5 ? -0.01 : 0.01;
  return { volts: 12.0, amps: 0.35 + jitter };
}

/** Tension lue par le multimètre sur les bornes de l'alimentation (4 chiffres, 2 décimales). */
export function multimeterReading(time: number): number {
  const n = Math.floor(time * 2.5);
  const h = hash01(n + 104729);
  return 12.03 + (h < 0.6 ? 0 : h < 0.8 ? -0.01 : 0.01);
}

/** Température affichée par la station à air chaud (régulation autour de 350 °C). */
export function hotAirTemperature(time: number): number {
  const n = Math.floor(time * 1.5);
  const h = hash01(n + 1299709);
  return 350 + (h < 0.8 ? 0 : h < 0.9 ? -1 : 1);
}

/**
 * Voyant de chauffe de la station de soudage : régulation tout-ou-rien dont le rapport cyclique
 * varie lentement (le fer reprend de la température par à-coups). 0 ou 1.
 */
export function heaterLed(time: number): number {
  const duty = 0.3 + 0.22 * Math.sin(time * 0.37) + 0.1 * Math.sin(time * 1.9 + 1.3);
  return hash01(Math.floor(time * 7) + 15485863) < duty ? 1 : 0;
}

/** Clignotement périodique (0/1) : période (s), rapport cyclique, déphasage (s). */
export function blink(time: number, period: number, duty = 0.5, phase = 0): number {
  const u = (((time + phase) / period) % 1 + 1) % 1;
  return u < duty ? 1 : 0;
}
