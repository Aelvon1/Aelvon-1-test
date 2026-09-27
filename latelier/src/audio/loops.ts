/**
 * Recettes des sons continus (boucles). Chaque recette construit ses sources persistantes dans
 * une voix (arrêtée par la poignée de boucle) et peut programmer des événements aléatoires
 * (gouttes, crépitements, rafales) via `schedule`, alimenté par le minuteur du moteur.
 */
import type { AudioBus, LoopId } from './types';
import { percussive, smoothParam } from './envelope';
import type { Voice } from './kit';
import { type Rng, clamp01, randRange } from './math';
import { RandomEventTrack } from './scheduling';
import { createRadio } from './radio';

/** Contrôle d'une boucle construite. */
export interface LoopControl {
  /** Paramètre expressif 0..1 (intensité de pluie, vitesse du ventilateur…). */
  setIntensity(value: number, now: number): void;
  /** Programme les événements aléatoires dans [now, until). */
  schedule?(now: number, until: number): void;
  /** Appelé au début de l'arrêt (fondu de `fade` s) : ralentissement du moteur, etc. */
  release?(now: number, fade: number): void;
}

export interface LoopSpec {
  bus: AudioBus;
  /** Gain nominal. */
  gain: number;
  /** Envoi vers la réverbération de la pièce. */
  reverb: number;
  /** Fondu d'entrée (s). */
  fadeIn: number;
  /** Intensité initiale (0..1). */
  intensity: number;
  /** Distance de référence de la spatialisation (m) : en deçà, pas d'atténuation. */
  refDistance: number;
  create(v: Voice, t0: number, intensity: number): LoopControl;
}

/**
 * Dérive lente et aléatoire d'un paramètre (rafales de pluie, évanouissement radio…) :
 * nouvelle cible tirée à intervalle aléatoire, approche exponentielle.
 */
class Wander {
  private next: number;

  constructor(
    private readonly rng: Rng,
    private readonly param: AudioParam,
    private readonly range: () => readonly [number, number],
    private readonly period: readonly [number, number],
    private readonly smoothing: number,
    start: number,
  ) {
    this.next = start;
  }

  schedule(now: number, until: number): void {
    if (this.next < now - 0.5) this.next = now;
    while (this.next < until) {
      const [lo, hi] = this.range();
      this.param.setTargetAtTime(randRange(this.rng, lo, hi), this.next, this.smoothing);
      this.next += randRange(this.rng, this.period[0], this.period[1]);
    }
  }
}

/** Suite d'événements dont le taux dépend d'une intensité mutable. */
function eventTrack(rng: Rng, rate: () => number, start: number, minGap = 0): RandomEventTrack {
  return new RandomEventTrack(rng, rate, start, minGap);
}

/** Collecte les événements dus en recalant la suite après une coupure du contexte. */
function due(track: RandomEventTrack, now: number, until: number, out: number[]): number[] {
  out.length = 0;
  track.collect(until, out);
  // Événements trop anciens (onglet masqué, contexte suspendu) : ignorés.
  let w = 0;
  for (let i = 0; i < out.length; i++) if (out[i]! >= now - 0.05) out[w++] = Math.max(out[i]!, now);
  out.length = w;
  return out;
}

// --- Pluie ---------------------------------------------------------------------------------

function rainRoof(v: Voice, t0: number, intensity: number): LoopControl {
  const rng = v.rng;
  const mix = v.gain(1);
  mix.connect(v.out);
  // Voile continu (pluie lointaine sur la tôle, entendue à travers le plafond).
  const wash = v.gain(0);
  const washLp = v.filter('lowpass', 2200, 0.5);
  v.noise('pink', t0, Infinity)
    .connect(v.filter('highpass', 180, 0.7))
    .connect(washLp)
    .connect(wash);
  wash.connect(mix);
  // Corps grave (résonance de la toiture).
  const body = v.gain(0);
  v.noise('brown', t0, Infinity)
    .connect(v.filter('lowpass', 380, 0.7))
    .connect(body);
  body.connect(mix);
  // Impacts : deux textures de durées premières entre elles, écartées en stéréo.
  const impacts = v.gain(0);
  const impactLp = v.filter('lowpass', 3500, 0.6);
  impactLp.connect(impacts);
  impacts.connect(mix);
  const a = v.sample(v.kit.buffer('roofImpactsA'), t0, Infinity, { loop: true });
  const b = v.sample(v.kit.buffer('roofImpactsB'), t0, Infinity, { loop: true, rate: 0.93 });
  a.connect(v.panner(-0.55)).connect(impactLp);
  b.connect(v.panner(0.55)).connect(impactLp);
  // Gouttières et fuites : gouttes lourdes isolées.
  const drips = v.gain(1);
  drips.connect(mix);

  let level = clamp01(intensity);
  const apply = (now: number, seconds: number) => {
    smoothParam(wash.gain, 0.12 + 0.4 * level, now, seconds);
    smoothParam(body.gain, 0.06 + 0.1 * level, now, seconds);
    smoothParam(impacts.gain, 0.08 + 0.5 * level, now, seconds);
    smoothParam(washLp.frequency, 2200 + 3000 * level, now, seconds);
    smoothParam(impactLp.frequency, 2600 + 2600 * level, now, seconds);
  };
  apply(t0, 0.05);
  const gusts = new Wander(rng, mix.gain, () => [0.78, 1.12], [1.5, 4.5], 0.9, t0);
  const dripTrack = eventTrack(rng, () => 0.25 + 0.9 * level, t0, 0.08);
  const times: number[] = [];
  return {
    setIntensity(value, now) {
      level = clamp01(value);
      apply(now, 1.5);
    },
    schedule(now, until) {
      gusts.schedule(now, until);
      for (const time of due(dripTrack, now, until, times)) {
        const d = v.kit.voice(drips, randRange(rng, 0.06, 0.2));
        const pan = d.panner(randRange(rng, -0.8, 0.8));
        pan.connect(d.out);
        if (rng() < 0.6) {
          // « Plic » : résonance de bulle, glissando montant.
          const f = randRange(rng, 700, 1400);
          const o = d.osc('sine', f, time, time + 0.08);
          o.frequency.setValueAtTime(f, time);
          o.frequency.exponentialRampToValueAtTime(f * randRange(rng, 1.6, 2.2), time + 0.03);
          o.connect(d.env(percussive(0.001, randRange(rng, 0.02, 0.04)), time)).connect(pan);
        } else {
          // « Toc » sur la gouttière en zinc.
          const f = randRange(rng, 300, 520);
          const o = d.osc('sine', f, time, time + 0.07);
          o.connect(d.env(percussive(0.001, 0.045), time)).connect(pan);
          const n = d.noise('white', time, time + 0.02);
          n.connect(d.filter('bandpass', 2600, 1.5))
            .connect(d.env(percussive(0.0005, 0.006), time, 0.6))
            .connect(pan);
        }
      }
    },
  };
}

function rainWindow(v: Voice, t0: number, intensity: number): LoopControl {
  const rng = v.rng;
  const mix = v.gain(1);
  mix.connect(v.out);
  // Tics des gouttes sur le verre.
  const ticks = v.gain(0);
  v.sample(v.kit.buffer('glassImpacts'), t0, Infinity, { loop: true })
    .connect(v.filter('highpass', 900, 0.7))
    .connect(v.filter('lowpass', 5500, 0.7))
    .connect(ticks);
  ticks.connect(mix);
  // Voile d'éclaboussures.
  const wash = v.gain(0);
  v.noise('pink', t0, Infinity)
    .connect(v.filter('bandpass', 3200, 0.6))
    .connect(wash);
  wash.connect(mix);
  // Ruissellement : passe-bande étroit dont la fréquence est modulée par deux oscillateurs lents.
  const trickle = v.gain(0);
  const bp = v.filter('bandpass', 1900, 6);
  v.noise('white', t0, Infinity).connect(bp).connect(trickle);
  trickle.connect(mix);
  const lfo1 = v.osc('sine', 3.1, t0, Infinity);
  const lfo2 = v.osc('sine', 7.7, t0, Infinity);
  lfo1.connect(v.gain(350)).connect(bp.frequency);
  lfo2.connect(v.gain(180)).connect(bp.frequency);

  let level = clamp01(intensity);
  const apply = (now: number, seconds: number) => {
    smoothParam(ticks.gain, 0.12 + 0.5 * level, now, seconds);
    smoothParam(wash.gain, 0.05 + 0.16 * level, now, seconds);
    smoothParam(trickle.gain, 0.01 + 0.05 * level, now, seconds);
  };
  apply(t0, 0.05);
  const gusts = new Wander(rng, mix.gain, () => [0.75, 1.1], [1.2, 3.5], 0.6, t0);
  return {
    setIntensity(value, now) {
      level = clamp01(value);
      apply(now, 1.5);
    },
    schedule(now, until) {
      gusts.schedule(now, until);
    },
  };
}

// --- Néon, ambiance de pièce ----------------------------------------------------------------

/** Harmoniques du bourdonnement secteur 50 Hz (le ballast vibre surtout à 100 Hz). */
const MAINS_HUM = [0.25, 1, 0.18, 0.45, 0.08, 0.22, 0.03, 0.1, 0.02, 0.05, 0.01, 0.03];

function neonHum(v: Voice, t0: number, intensity: number): LoopControl {
  const rng = v.rng;
  const hum = v.gain(0.05);
  v.periodic(v.kit.periodicWave('mains', MAINS_HUM), 50, t0, Infinity).connect(hum);
  hum.connect(v.out);
  // Bourdonnement électrique aigu (magnétostriction du ballast).
  const buzz = v.gain(0);
  v.osc('sawtooth', 100, t0, Infinity)
    .connect(v.filter('bandpass', 2600, 1.5))
    .connect(buzz);
  buzz.connect(v.out);
  // Grésillement : bruit modulé en amplitude à 100 Hz (décharge dans le tube).
  const sizzle = v.gain(0);
  const am = v.gain(0.5);
  v.noise('white', t0, Infinity)
    .connect(v.filter('bandpass', 4200, 0.9))
    .connect(am)
    .connect(sizzle);
  v.osc('sine', 100, t0, Infinity).connect(v.gain(0.5)).connect(am.gain);
  sizzle.connect(v.out);
  const crackles = v.gain(1);
  crackles.connect(v.out);

  let level = clamp01(intensity);
  const apply = (now: number, seconds: number) => {
    smoothParam(hum.gain, 0.045 + 0.02 * level, now, seconds);
    smoothParam(buzz.gain, 0.004 + 0.01 * level, now, seconds);
    smoothParam(sizzle.gain, 0.006 + 0.05 * level, now, seconds);
  };
  apply(t0, 0.05);
  const track = eventTrack(rng, () => 0.15 + 7 * level * level, t0, 0.01);
  const times: number[] = [];
  return {
    setIntensity(value, now) {
      level = clamp01(value);
      apply(now, 0.15);
    },
    schedule(now, until) {
      for (const time of due(track, now, until, times)) {
        const d = v.kit.voice(crackles, randRange(rng, 0.02, 0.09) * (0.4 + level));
        const n = d.noise('white', time, time + 0.03);
        n.connect(d.filter('highpass', randRange(rng, 2500, 5000), 0.7))
          .connect(d.env(percussive(0.0003, randRange(rng, 0.002, 0.01)), time))
          .connect(d.out);
      }
    },
  };
}

function roomTone(v: Voice, t0: number): LoopControl {
  const low = v.gain(0.14);
  v.noise('brown', t0, Infinity)
    .connect(v.filter('lowpass', 180, 0.7))
    .connect(low);
  low.connect(v.out);
  const air = v.gain(0.018);
  v.noise('pink', t0, Infinity)
    .connect(v.filter('highpass', 120, 0.7))
    .connect(v.filter('lowpass', 900, 0.7))
    .connect(air);
  air.connect(v.out);
  const drift = new Wander(v.rng, low.gain, () => [0.1, 0.17], [3, 7], 2, t0);
  return {
    setIntensity(value, now) {
      smoothParam(v.out.gain, 0.4 + 0.6 * clamp01(value), now, 1);
    },
    schedule(now, until) {
      drift.schedule(now, until);
    },
  };
}

// --- Appareils -----------------------------------------------------------------------------

function fanMotor(v: Voice, t0: number, intensity: number): LoopControl {
  // Ventilateur sur pied à 3 pales : fréquence de passage des pales = 3 × rotation.
  const air = v.gain(0);
  const airBp = v.filter('bandpass', 400, 0.6);
  const am = v.gain(0.75);
  v.noise('pink', t0, Infinity).connect(airBp).connect(am).connect(air);
  air.connect(v.out);
  const blade = v.osc('sine', 1, t0, Infinity);
  blade.connect(v.gain(0.25)).connect(am.gain);
  const whoosh = v.gain(0);
  v.noise('brown', t0, Infinity)
    .connect(v.filter('lowpass', 260, 0.7))
    .connect(whoosh);
  whoosh.connect(v.out);
  // Moteur asynchrone : ronflement secteur + léger sifflement.
  const hum = v.gain(0);
  v.periodic(v.kit.periodicWave('mains', MAINS_HUM), 50, t0, Infinity).connect(hum);
  hum.connect(v.out);
  const whine = v.gain(0);
  const whineOsc = v.osc('triangle', 200, t0, Infinity);
  whineOsc.connect(v.filter('lowpass', 1200, 0.7)).connect(whine);
  whine.connect(v.out);

  let speed = clamp01(intensity);
  const apply = (now: number, seconds: number) => {
    const s = speed;
    smoothParam(blade.frequency, 3 + 50 * s, now, seconds);
    smoothParam(airBp.frequency, 350 + 900 * s, now, seconds);
    smoothParam(air.gain, 0.03 + 0.28 * s * s, now, seconds);
    smoothParam(whoosh.gain, 0.2 * s, now, seconds);
    smoothParam(hum.gain, s > 0.02 ? 0.012 : 0, now, 0.1);
    smoothParam(whineOsc.frequency, 60 + 170 * s, now, seconds);
    smoothParam(whine.gain, 0.006 * s, now, seconds);
  };
  // Démarrage : le moteur monte en régime en ~2,5 s.
  const target = speed;
  speed = 0;
  apply(t0, 0.02);
  speed = target;
  apply(t0 + 0.02, 2.5);
  return {
    setIntensity(value, now) {
      speed = clamp01(value);
      apply(now, 1.2);
    },
    release(now, fade) {
      // Ralentissement : les pales décélèrent pendant le fondu.
      speed = 0;
      apply(now, Math.max(fade, 0.8));
    },
  };
}

function ironSizzle(v: Voice, t0: number, intensity: number): LoopControl {
  const rng = v.rng;
  const pops = v.gain(0);
  v.sample(v.kit.buffer('sizzlePops'), t0, Infinity, { loop: true })
    .connect(v.filter('highpass', 2000, 0.7))
    .connect(v.filter('lowpass', 9000, 0.7))
    .connect(pops);
  pops.connect(v.out);
  const hiss = v.gain(0);
  const flutter = v.gain(1);
  v.noise('white', t0, Infinity)
    .connect(v.filter('bandpass', 5500, 0.7))
    .connect(flutter)
    .connect(hiss);
  hiss.connect(v.out);
  const steam = v.gain(0);
  v.noise('pink', t0, Infinity)
    .connect(v.filter('highpass', 1500, 0.7))
    .connect(steam);
  steam.connect(v.out);
  let level = clamp01(intensity);
  const apply = (now: number, seconds: number) => {
    smoothParam(pops.gain, 0.5 * level, now, seconds);
    smoothParam(hiss.gain, 0.12 * level, now, seconds);
    smoothParam(steam.gain, 0.04 * level, now, seconds);
  };
  apply(t0, 0.08);
  // Fluctuations rapides du grésillement (bulles de flux).
  const wobble = new Wander(rng, flutter.gain, () => [0.4, 1.2], [0.05, 0.15], 0.03, t0);
  return {
    setIntensity(value, now) {
      level = clamp01(value);
      apply(now, 0.12);
    },
    schedule(now, until) {
      wobble.schedule(now, until);
    },
  };
}

function hotAirBlow(v: Voice, t0: number, intensity: number): LoopControl {
  const rng = v.rng;
  const air = v.gain(0);
  const bp = v.filter('bandpass', 1100, 0.5);
  const turbulence = v.gain(1);
  v.noise('pink', t0, Infinity).connect(bp).connect(turbulence).connect(air);
  air.connect(v.out);
  const hiss = v.gain(0);
  v.noise('white', t0, Infinity)
    .connect(v.filter('highpass', 4000, 0.7))
    .connect(hiss);
  hiss.connect(v.out);
  const whine = v.gain(0);
  const turbine = v.osc('sine', 1800, t0, Infinity);
  turbine.connect(whine);
  whine.connect(v.out);
  const motor = v.gain(0.01);
  const motorOsc = v.osc('sawtooth', 150, t0, Infinity);
  motorOsc.connect(v.filter('lowpass', 500, 0.7)).connect(motor);
  motor.connect(v.out);
  let level = clamp01(intensity);
  const apply = (now: number, seconds: number) => {
    smoothParam(air.gain, 0.08 + 0.3 * level, now, seconds);
    smoothParam(bp.frequency, 1100 + 1200 * level, now, seconds);
    smoothParam(hiss.gain, 0.015 * level, now, seconds);
    smoothParam(turbine.frequency, 1800 + 1400 * level, now, seconds);
    smoothParam(whine.gain, 0.006 * level, now, seconds);
    smoothParam(motorOsc.frequency, 150 + 100 * level, now, seconds);
  };
  apply(t0, 0.3);
  const wobble = new Wander(rng, turbulence.gain, () => [0.85, 1.1], [0.08, 0.2], 0.05, t0);
  return {
    setIntensity(value, now) {
      level = clamp01(value);
      apply(now, 0.4);
    },
    schedule(now, until) {
      wobble.schedule(now, until);
    },
  };
}

function oscilloscopeWhine(v: Voice, t0: number, intensity: number): LoopControl {
  // Transformateur THT d'un tube cathodique : 15 625 Hz (balayage ligne), très faible.
  const flyback = v.gain(0.0035);
  const osc = v.osc('sine', 15625, t0, Infinity);
  osc.connect(flyback);
  flyback.connect(v.out);
  const hum = v.gain(0.006);
  v.periodic(v.kit.periodicWave('mains', MAINS_HUM), 50, t0, Infinity).connect(hum);
  hum.connect(v.out);
  // Légère instabilité de la fréquence de balayage (±8 cents).
  const drift = new Wander(v.rng, osc.detune, () => [-8, 8], [0.5, 2], 0.3, t0);
  smoothParam(v.out.gain, clamp01(intensity), t0, 0.05);
  return {
    setIntensity(value, now) {
      smoothParam(v.out.gain, clamp01(value), now, 0.3);
    },
    schedule(now, until) {
      drift.schedule(now, until);
    },
  };
}

/** Table des boucles (gains équilibrés par mesure du niveau efficace hors ligne). */
export const LOOPS: Readonly<Record<LoopId, LoopSpec>> = {
  'rain.roof': {
    bus: 'ambience',
    gain: 0.3,
    reverb: 0.08,
    fadeIn: 2.5,
    intensity: 0.7,
    refDistance: 2,
    create: rainRoof,
  },
  'rain.window': {
    bus: 'ambience',
    gain: 0.6,
    reverb: 0.12,
    fadeIn: 2,
    intensity: 0.7,
    refDistance: 1.2,
    create: rainWindow,
  },
  'neon.hum': {
    bus: 'ambience',
    gain: 0.45,
    reverb: 0.05,
    fadeIn: 0.3,
    intensity: 0.2,
    refDistance: 0.7,
    create: neonHum,
  },
  'room.tone': {
    bus: 'ambience',
    gain: 0.35,
    reverb: 0,
    fadeIn: 3,
    intensity: 1,
    refDistance: 3,
    create: roomTone,
  },
  'fan.motor': {
    bus: 'ambience',
    gain: 0.5,
    reverb: 0.15,
    fadeIn: 0.2,
    intensity: 1,
    refDistance: 0.8,
    create: fanMotor,
  },
  'radio.music': {
    bus: 'ambience',
    gain: 0.3,
    reverb: 0.18,
    fadeIn: 0.6,
    intensity: 1,
    refDistance: 0.6,
    create: createRadio,
  },
  'iron.sizzle': {
    bus: 'sfx',
    gain: 0.7,
    reverb: 0.1,
    fadeIn: 0.08,
    intensity: 0.6,
    refDistance: 0.5,
    create: ironSizzle,
  },
  'hotair.blow': {
    bus: 'sfx',
    gain: 0.9,
    reverb: 0.1,
    fadeIn: 0.3,
    intensity: 0.7,
    refDistance: 0.5,
    create: hotAirBlow,
  },
  'oscilloscope.whine': {
    bus: 'sfx',
    gain: 0.5,
    reverb: 0,
    fadeIn: 1,
    intensity: 1,
    refDistance: 0.5,
    create: oscilloscopeWhine,
  },
};
