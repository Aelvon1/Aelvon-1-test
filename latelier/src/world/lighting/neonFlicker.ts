/**
 * Comportement d'un tube fluorescent à starter (logique pure, déterministe pour une graine) :
 * - à la mise sous tension : lueur du starter, deux ou trois éclairs avec claquements, puis
 *   régime établi ;
 * - en régime établi : léger frémissement continu et, à intervalles aléatoires (7 à 22 s),
 *   une « crise » de ratés (clignotements rapides) ou un affaissement passager, avec
 *   grésillement plus fort ;
 * - hors tension : extinction immédiate.
 *
 * Sorties : `output` (flux lumineux relatif 0..1), `buzz` (intensité du bourdonnement 0..1),
 * rappel `onClick` à chaque claquement (son « neon.flicker »).
 */

/** Générateur pseudo-aléatoire mulberry32 (0..1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Segment {
  level: number;
  duration: number;
  /** Claquement au début du segment. */
  click: boolean;
}

export type NeonPhase = 'off' | 'starting' | 'stable' | 'burst';

export class NeonFlicker {
  output = 0;
  buzz = 0;
  /** Crises aléatoires activées (désactivées pour les captures à temps figé). */
  randomBursts = true;
  private phaseName: NeonPhase = 'off';
  private segments: Segment[] = [];
  private segIndex = 0;
  private segTime = 0;
  private untilBurst = 0;
  private clock = 0;
  private level = 0;
  private readonly random: () => number;

  constructor(
    seed = 1,
    private readonly onClick: (() => void) | null = null,
  ) {
    this.random = mulberry32(seed);
    this.untilBurst = this.nextBurstDelay();
  }

  get phase(): NeonPhase {
    return this.phaseName;
  }

  get powered(): boolean {
    return this.phaseName !== 'off';
  }

  /** Mise sous/hors tension. `instant` : régime établi immédiat (chargement, captures). */
  setPower(on: boolean, instant = false): void {
    if (!on) {
      this.phaseName = 'off';
      this.segments = [];
      this.level = 0;
      this.output = 0;
      this.buzz = 0;
      return;
    }
    if (this.phaseName !== 'off') return;
    if (instant) {
      this.phaseName = 'stable';
      this.level = 1;
      this.output = 1;
      this.buzz = 0.3;
      this.untilBurst = this.nextBurstDelay();
      return;
    }
    this.phaseName = 'starting';
    this.segments = this.startupSequence();
    this.segIndex = 0;
    this.segTime = 0;
    this.enterSegment();
  }

  update(dt: number): void {
    this.clock += dt;
    switch (this.phaseName) {
      case 'off':
        this.output = 0;
        this.buzz = 0;
        return;
      case 'stable': {
        this.level = 1;
        this.buzz += (0.3 - this.buzz) * Math.min(1, dt * 3);
        if (this.randomBursts) {
          this.untilBurst -= dt;
          if (this.untilBurst <= 0) {
            this.phaseName = 'burst';
            this.segments = this.random() < 0.3 ? this.sagSequence() : this.burstSequence();
            this.segIndex = 0;
            this.segTime = 0;
            this.enterSegment();
          }
        }
        break;
      }
      case 'starting':
      case 'burst':
        this.buzz += (1 - this.buzz) * Math.min(1, dt * 12);
        this.segTime += dt;
        while (this.segments.length > 0 && this.segTime >= this.segments[this.segIndex]!.duration) {
          this.segTime -= this.segments[this.segIndex]!.duration;
          this.segIndex++;
          if (this.segIndex >= this.segments.length) {
            this.phaseName = 'stable';
            this.segments = [];
            this.level = 1;
            this.untilBurst = this.nextBurstDelay();
            break;
          }
          this.enterSegment();
        }
        break;
    }
    // Frémissement continu (quelques %) : ondulation du ballast.
    const shimmer = 1 - 0.012 * (1 + Math.sin(this.clock * 37.3) * Math.sin(this.clock * 5.1));
    this.output = Math.min(1, Math.max(0, this.level * shimmer));
  }

  private enterSegment(): void {
    const seg = this.segments[this.segIndex];
    if (!seg) return;
    this.level = seg.level;
    if (seg.click) this.onClick?.();
  }

  private nextBurstDelay(): number {
    return 7 + this.random() * 15;
  }

  /** Démarrage : lueur de starter, éclairs, puis allumage franc. */
  private startupSequence(): Segment[] {
    const r = this.random;
    const seq: Segment[] = [{ level: 0.02, duration: 0.35 + r() * 0.5, click: false }];
    const flashes = 1 + Math.floor(r() * 3);
    for (let i = 0; i < flashes; i++) {
      seq.push({ level: 0.7 + r() * 0.3, duration: 0.04 + r() * 0.08, click: true });
      seq.push({ level: 0.03 + r() * 0.05, duration: 0.12 + r() * 0.35, click: false });
    }
    seq.push({ level: 1, duration: 0.05, click: true });
    return seq;
  }

  /** Crise de ratés : alternance rapide de niveaux bas et hauts. */
  private burstSequence(): Segment[] {
    const r = this.random;
    const seq: Segment[] = [];
    const count = 3 + Math.floor(r() * 6);
    for (let i = 0; i < count; i++) {
      seq.push({ level: 0.04 + r() * 0.3, duration: 0.02 + r() * 0.1, click: false });
      seq.push({ level: 0.8 + r() * 0.2, duration: 0.03 + r() * 0.17, click: r() < 0.6 });
    }
    return seq;
  }

  /** Affaissement : baisse de régime passagère avec ondulations. */
  private sagSequence(): Segment[] {
    const r = this.random;
    const seq: Segment[] = [];
    const steps = 5 + Math.floor(r() * 4);
    for (let i = 0; i < steps; i++)
      seq.push({ level: 0.55 + r() * 0.2, duration: 0.06 + r() * 0.08, click: false });
    seq.push({ level: 1, duration: 0.05, click: true });
    return seq;
  }
}
