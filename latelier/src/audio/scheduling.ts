/**
 * Planification pure (sans Web Audio) : processus aléatoires d'événements (gouttes, parasites),
 * limitation de polyphonie par son.
 *
 * Principe (« deux horloges ») : un minuteur léger du fil principal appelle régulièrement
 * `collect(horizon)` et programme sur l'horloge audio, avec un peu d'avance, les événements dont
 * l'instant tombe avant l'horizon. L'horloge audio garantit la précision, le minuteur ne sert
 * qu'à alimenter la file.
 */
import type { Rng } from './math';

/** Instant du prochain événement d'un processus de Poisson de taux `rate` (événements/s). */
export function nextPoissonTime(from: number, rate: number, rng: Rng): number {
  if (!(rate > 0)) return Number.POSITIVE_INFINITY;
  // 1 − u ∈ (0, 1] : évite log(0).
  return from - Math.log(1 - rng()) / rate;
}

/**
 * Suite d'événements aléatoires (processus de Poisson dont le taux peut varier dans le temps).
 * Si le taux devient nul, la suite s'interrompt et reprend dès qu'il redevient positif.
 */
export class RandomEventTrack {
  private next: number;
  /** Instant jusqu'auquel les événements ont déjà été collectés. */
  private cursor: number;

  constructor(
    private readonly rng: Rng,
    private readonly rate: () => number,
    start: number,
    /** Écart minimal entre deux événements (s). */
    private readonly minGap = 0,
  ) {
    this.cursor = start;
    this.next = nextPoissonTime(start, rate(), rng);
  }

  /** Ajoute à `out` les instants d'événements < `until` et avance la suite. */
  collect(until: number, out: number[] = []): number[] {
    if (!Number.isFinite(this.next)) {
      // Taux redevenu positif : la suite repart de là où la collecte s'était arrêtée.
      const rate = this.rate();
      if (!(rate > 0)) {
        this.cursor = Math.max(this.cursor, until);
        return out;
      }
      this.next = nextPoissonTime(this.cursor, rate, this.rng);
    }
    let guard = 0;
    while (this.next < until && guard++ < 10000) {
      out.push(this.next);
      this.next = nextPoissonTime(this.next + this.minGap, this.rate(), this.rng);
    }
    this.cursor = Math.max(this.cursor, until);
    return out;
  }

  /** Recale le prochain événement (après une coupure, ex. reprise du contexte). */
  resetFrom(time: number): void {
    this.cursor = time;
    this.next = nextPoissonTime(time, this.rate(), this.rng);
  }
}

/**
 * Limiteur de polyphonie par identifiant : empêche qu'un son déclenché à chaque image
 * (ex. cliquetis de vis) n'accumule des dizaines de voix simultanées.
 */
export class VoiceLimiter {
  private readonly voices = new Map<string, number[]>();
  private readonly lastStart = new Map<string, number>();

  /**
   * Indique si un nouveau déclenchement de `key` est permis à `now` : moins de `maxVoices`
   * voix actives et dernier départ plus ancien que `minInterval` s.
   */
  canStart(key: string, now: number, maxVoices: number, minInterval: number): boolean {
    const last = this.lastStart.get(key);
    if (last !== undefined && now - last < minInterval) return false;
    return this.active(key, now) < maxVoices;
  }

  /** Enregistre une voix de `key` démarrée à `now` et terminée à `endTime`. */
  register(key: string, now: number, endTime: number): void {
    let list = this.voices.get(key);
    if (!list) {
      list = [];
      this.voices.set(key, list);
    }
    // Purge des voix terminées (en place : aucune allocation).
    let w = 0;
    for (let i = 0; i < list.length; i++) if (list[i]! > now) list[w++] = list[i]!;
    list.length = w;
    list.push(endTime);
    this.lastStart.set(key, now);
  }

  /** Nombre de voix actives pour `key` à `now`. */
  active(key: string, now: number): number {
    const list = this.voices.get(key);
    if (!list) return 0;
    let n = 0;
    for (const end of list) if (end > now) n++;
    return n;
  }

  clear(): void {
    this.voices.clear();
    this.lastStart.clear();
  }
}
