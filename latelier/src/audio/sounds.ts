/**
 * Recettes des sons ponctuels, entièrement synthétisés (oscillateurs, bruits filtrés,
 * enveloppes). Chaque recette reçoit une voix éphémère, l'instant de départ et un facteur de
 * hauteur (déjà légèrement aléatoire) ; elle crée ses nœuds et les relie à la sortie de la voix.
 *
 * Briques communes : « thump » (corps grave à hauteur descendante), « burst » (bruit filtré
 * bref), « tick » (clic résonant), « ring » (partiels inharmoniques du métal), « grains »
 * (rafale de micro-impacts sur une seule source de bruit, coût constant).
 */
import type { AudioBus, SoundId } from './types';
import { EXP_FLOOR, adsr, percussive } from './envelope';
import type { NoiseColor, Voice } from './kit';
import { type Rng, randRange } from './math';

export interface ShotContext {
  v: Voice;
  /** Instant de départ (temps audio). */
  t: number;
  /** Facteur de hauteur (variation aléatoire incluse). */
  p: number;
  rng: Rng;
}

export interface SoundSpec {
  bus: AudioBus;
  /** Gain nominal. */
  gain: number;
  /** Voix simultanées maximales pour ce son. */
  maxVoices: number;
  /** Intervalle minimal entre deux déclenchements (s). */
  minInterval: number;
  /** Variation aléatoire de hauteur (± fraction). */
  pitchJitter: number;
  /** Variation aléatoire de volume (± fraction). */
  volumeJitter: number;
  /** Part envoyée à la réverbération de la pièce (0..1). */
  reverb: number;
  recipe: (c: ShotContext) => void;
}

// --- Briques ---------------------------------------------------------------------------

/** Corps grave : sinus dont la hauteur chute de `freq` à `freq × drop`. */
function thump(v: Voice, t: number, freq: number, decay: number, gain: number, drop = 0.55): void {
  const o = v.osc('sine', freq, t, t + decay + 0.02);
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * drop), t + decay * 0.8);
  v.chain(o, v.env(percussive(0.0015, decay), t, gain));
}

/** Bruit filtré bref. */
function burst(
  v: Voice,
  t: number,
  color: NoiseColor,
  type: BiquadFilterType,
  freq: number,
  q: number,
  attack: number,
  decay: number,
  gain: number,
): void {
  const n = v.noise(color, t, t + attack + decay + 0.02);
  v.chain(n, v.filter(type, freq, q), v.env(percussive(attack, decay), t, gain));
}

/** Clic résonant (bruit blanc dans un passe-bande étroit). */
function tick(v: Voice, t: number, freq: number, q: number, decay: number, gain: number): void {
  burst(v, t, 'white', 'bandpass', freq, q, 0.0004, decay, gain * Math.sqrt(q));
}

/** Partiels sinusoïdaux amortis : [fréquence, décroissance, gain]. */
function ring(v: Voice, t: number, partials: readonly (readonly [number, number, number])[]): void {
  for (const [f, decay, gain] of partials) {
    v.chain(v.osc('sine', f, t, t + decay + 0.02), v.env(percussive(0.0008, decay), t, gain));
  }
}

/**
 * Rafale de micro-impacts : une seule source de bruit filtrée dont le gain est automatisé
 * (grains triés, sans chevauchement) — coût constant quel que soit le nombre de grains.
 */
function grains(
  v: Voice,
  t: number,
  duration: number,
  count: number,
  filter: { type: BiquadFilterType; freq: number; q: number },
  gain: number,
  shape: (x: number) => number,
): void {
  const rng = v.rng;
  const times: number[] = [];
  for (let i = 0; i < count; i++) times.push(rng() * duration);
  times.sort((a, b) => a - b);
  // Écart minimal de 3 ms : les automatisations restent strictement ordonnées dans le temps.
  let w = 0;
  for (let i = 0; i < times.length; i++)
    if (w === 0 || times[i]! - times[w - 1]! >= 0.003) times[w++] = times[i]!;
  times.length = w;
  const n = v.noise('white', t, t + duration + 0.05);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < times.length; i++) {
    const start = t + times[i]!;
    const next = i + 1 < times.length ? t + times[i + 1]! : t + duration + 0.04;
    const decay = Math.min(randRange(rng, 0.004, 0.02), Math.max(0.002, next - start - 0.002));
    const a = gain * shape(times[i]! / duration) * randRange(rng, 0.25, 1);
    g.gain.setValueAtTime(EXP_FLOOR, start);
    g.gain.linearRampToValueAtTime(Math.max(EXP_FLOOR, a), start + 0.0008);
    g.gain.exponentialRampToValueAtTime(EXP_FLOOR, start + 0.0008 + decay);
  }
  v.chain(n, v.filter(filter.type, filter.freq, filter.q), g);
}

/** Série de clics d'un cliquet (vis, crémaillère). */
function ratchet(v: Voice, t: number, p: number, count: number, spacing: number, freq: number): number {
  let time = t;
  for (let i = 0; i < count; i++) {
    const f = freq * p * randRange(v.rng, 0.94, 1.06);
    tick(v, time, f, 9, 0.011, 0.16);
    ring(v, time, [[f * 1.52, 0.018, 0.02]]);
    time += spacing * randRange(v.rng, 0.8, 1.2);
  }
  return time;
}

/** Partiels d'un petit objet métallique (plaque/barre libre : rapports inharmoniques). */
function metalPartials(base: number, decay: number, gain: number): [number, number, number][] {
  return [
    [base, decay, gain],
    [base * 2.76, decay * 0.7, gain * 0.7],
    [base * 5.4, decay * 0.45, gain * 0.45],
  ];
}

/** Rebonds successifs (intervalles et amplitudes décroissants). */
function bounces(
  v: Voice,
  t: number,
  first: number,
  count: number,
  hit: (time: number, level: number) => void,
): void {
  let dt = first;
  let time = t;
  let level = 0.45;
  for (let i = 0; i < count; i++) {
    time += dt;
    hit(time, level);
    dt *= randRange(v.rng, 0.55, 0.7);
    level *= 0.5;
  }
}

// --- Pas -------------------------------------------------------------------------------

function stepConcrete({ v, t, p, rng }: ShotContext): void {
  // Léger décalage stéréo aléatoire : pied gauche/droit.
  const pan = v.panner(randRange(rng, -0.12, 0.12));
  pan.connect(v.out);
  // Impact du talon : corps grave à hauteur descendante.
  const o = v.osc('sine', 88 * p, t, t + 0.1);
  o.frequency.setValueAtTime(88 * p, t);
  o.frequency.exponentialRampToValueAtTime(52 * p, t + 0.06);
  o.connect(v.env(percussive(0.0015, 0.07), t, 0.55)).connect(pan);
  const body = v.osc('triangle', 190 * p, t, t + 0.06);
  body.connect(v.env(percussive(0.001, 0.035), t, 0.12)).connect(pan);
  // Claquement de la semelle sur le béton.
  const n = v.noise('white', t, t + 0.09);
  n.connect(v.filter('bandpass', randRange(rng, 1500, 2400) * p, 1.1))
    .connect(v.env(percussive(0.0008, randRange(rng, 0.025, 0.045)), t, 0.45))
    .connect(pan);
  // Grain de poussière / gravillons sous la pointe du pied, un peu après.
  const t2 = t + randRange(rng, 0.012, 0.028);
  const g = v.noise('white', t2, t2 + 0.1);
  g.connect(v.filter('highpass', 4000, 0.7))
    .connect(v.env(percussive(0.003, randRange(rng, 0.04, 0.07)), t2, randRange(rng, 0.03, 0.06)))
    .connect(pan);
  if (rng() < 0.2) {
    // Frottement occasionnel de la semelle.
    const t3 = t + 0.02;
    const s = v.noise('pink', t3, t3 + 0.16);
    s.connect(v.filter('bandpass', 3300, 2))
      .connect(v.env(adsr({ attack: 0.03, decay: 0.03, sustain: 0.6, release: 0.05 }, 0.07), t3, 0.08))
      .connect(pan);
  }
}

function stepRug({ v, t, p, rng }: ShotContext): void {
  const pan = v.panner(randRange(rng, -0.1, 0.1));
  pan.connect(v.out);
  const o = v.osc('sine', 72 * p, t, t + 0.1);
  o.frequency.setValueAtTime(72 * p, t);
  o.frequency.exponentialRampToValueAtTime(48 * p, t + 0.07);
  o.connect(v.env(percussive(0.004, 0.075), t, 0.42)).connect(pan);
  const n = v.noise('pink', t, t + 0.12);
  n.connect(v.filter('lowpass', 650 * p, 0.8))
    .connect(v.env(percussive(0.003, 0.06), t, 0.5))
    .connect(pan);
  // Froissement des fibres du tapis.
  const f = v.noise('white', t + 0.005, t + 0.14);
  f.connect(v.filter('bandpass', randRange(rng, 1000, 1500), 0.8))
    .connect(v.env(adsr({ attack: 0.012, decay: 0.03, sustain: 0.4, release: 0.05 }, 0.05), t + 0.005, 0.06))
    .connect(pan);
}

// --- Table des sons --------------------------------------------------------------------

const spec = (
  bus: AudioBus,
  gain: number,
  recipe: SoundSpec['recipe'],
  extra: Partial<SoundSpec> = {},
): SoundSpec => ({
  bus,
  gain,
  maxVoices: 4,
  minInterval: 0.02,
  pitchJitter: 0.04,
  volumeJitter: 0.1,
  reverb: bus === 'ui' ? 0 : 0.25,
  recipe,
  ...extra,
});

export const SOUNDS: Readonly<Record<SoundId, SoundSpec>> = {
  // --- Interface (sons secs, non réverbérés) ---
  'ui.click': spec(
    'ui',
    0.5,
    ({ v, t, p }) => {
      tick(v, t, 3200 * p, 2.5, 0.012, 0.45);
      v.chain(v.osc('sine', 1150 * p, t, t + 0.04), v.env(percussive(0.001, 0.022), t, 0.25));
    },
    { pitchJitter: 0.02, maxVoices: 3 },
  ),
  'ui.hover': spec(
    'ui',
    0.55,
    ({ v, t, p }) => {
      tick(v, t, 5200 * p, 4, 0.007, 0.1);
      v.chain(v.osc('sine', 2400 * p, t, t + 0.03), v.env(percussive(0.001, 0.012), t, 0.05));
    },
    { pitchJitter: 0.03, maxVoices: 2, minInterval: 0.04 },
  ),
  'ui.open': spec(
    'ui',
    0.45,
    ({ v, t, p }) => {
      const n = v.noise('pink', t, t + 0.3);
      const f = v.filter('bandpass', 500 * p, 1.2);
      f.frequency.setValueAtTime(500 * p, t);
      f.frequency.exponentialRampToValueAtTime(2400 * p, t + 0.16);
      v.chain(n, f, v.env(adsr({ attack: 0.05, decay: 0.05, sustain: 0.6, release: 0.1 }, 0.1), t, 0.5));
      tick(v, t + 0.13, 2600 * p, 4, 0.015, 0.3);
      thump(v, t + 0.13, 420 * p, 0.03, 0.12);
    },
    { pitchJitter: 0.02 },
  ),
  'ui.close': spec(
    'ui',
    0.45,
    ({ v, t, p }) => {
      tick(v, t, 2300 * p, 4, 0.015, 0.3);
      const n = v.noise('pink', t, t + 0.28);
      const f = v.filter('bandpass', 2200 * p, 1.2);
      f.frequency.setValueAtTime(2200 * p, t);
      f.frequency.exponentialRampToValueAtTime(450 * p, t + 0.16);
      v.chain(n, f, v.env(adsr({ attack: 0.02, decay: 0.05, sustain: 0.5, release: 0.1 }, 0.1), t, 0.45));
      thump(v, t + 0.11, 300 * p, 0.04, 0.2);
    },
    { pitchJitter: 0.02 },
  ),
  'ui.error': spec(
    'ui',
    0.2,
    ({ v, t, p }) => {
      for (const dt of [0, 0.12]) {
        const o = v.osc('square', 150 * p, t + dt, t + dt + 0.12);
        // Deux passe-bas en série (24 dB/oct) : « bip-bip » grave et feutré, pas agressif.
        v.chain(
          o,
          v.filter('lowpass', 650, 0.6),
          v.filter('lowpass', 1300, 0.6),
          v.env(adsr({ attack: 0.006, decay: 0.02, sustain: 0.7, release: 0.04 }, 0.07), t + dt, 0.35),
        );
      }
    },
    { pitchJitter: 0.01, maxVoices: 1, minInterval: 0.2 },
  ),
  'ui.stamp': spec(
    'ui',
    0.25,
    ({ v, t, p, rng }) => {
      thump(v, t, 115 * p, 0.09, 0.8, 0.45);
      burst(v, t, 'white', 'lowpass', 1800, 0.7, 0.001, 0.04, 0.45);
      v.chain(v.osc('sine', 420 * p, t, t + 0.08), v.env(percussive(0.001, 0.05), t, 0.25));
      burst(v, t + 0.02, 'pink', 'bandpass', randRange(rng, 2600, 3400), 1, 0.01, 0.08, 0.1);
    },
    { maxVoices: 2 },
  ),

  // --- Pas ---
  'step.concrete': spec('sfx', 0.55, stepConcrete, { pitchJitter: 0.06, volumeJitter: 0.14, reverb: 0.3 }),
  'step.rug': spec('sfx', 0.42, stepRug, { pitchJitter: 0.06, volumeJitter: 0.14, reverb: 0.15 }),

  // --- Interrupteurs et appareils ---
  'switch.toggle': spec('sfx', 0.6, ({ v, t, p }) => {
    tick(v, t, 2600 * p, 5, 0.02, 0.35);
    burst(v, t, 'white', 'highpass', 4000, 0.7, 0.0004, 0.006, 0.25);
    thump(v, t, 240 * p, 0.03, 0.35);
    tick(v, t + 0.009, 1700 * p, 6, 0.03, 0.18);
  }),
  'lamp.toggle': spec('sfx', 1.6, ({ v, t, p }) => {
    tick(v, t, 3800 * p, 3, 0.01, 0.3);
    tick(v, t + 0.035, 3000 * p, 4, 0.012, 0.2);
    v.chain(v.osc('sine', 5200 * p, t, t + 0.1), v.env(percussive(0.001, 0.06), t, 0.02));
  }),
  'radio.toggle': spec('sfx', 0.6, ({ v, t, p }) => {
    tick(v, t, 1900 * p, 4, 0.025, 0.3);
    thump(v, t, 180 * p, 0.04, 0.3);
    const s = v.sample(v.kit.buffer('crackle'), t + 0.02, t + 0.45, { loop: true });
    v.chain(s, v.filter('bandpass', 1600, 0.7), v.env(percussive(0.004, 0.3), t + 0.02, 0.3));
    burst(v, t + 0.02, 'white', 'bandpass', 1500, 0.8, 0.005, 0.35, 0.18);
  }),
  'fan.toggle': spec('sfx', 0.6, ({ v, t, p }) => {
    thump(v, t, 140 * p, 0.05, 0.5);
    tick(v, t, 1400 * p, 3, 0.03, 0.35);
    tick(v, t + 0.015, 2200 * p, 5, 0.02, 0.15);
    for (let i = 1; i <= 3; i++) tick(v, t + 0.03 * i + 0.02, 1800 * p, 6, 0.01, 0.05 / i);
  }),
  'neon.flicker': spec(
    'sfx',
    0.8,
    ({ v, t, p }) => {
      // Claquement du starter (bilame) puis amorçage du tube (bouffée de bourdonnement).
      tick(v, t, 4200 * p, 3, 0.006, 0.3);
      burst(v, t, 'white', 'highpass', 6000, 0.7, 0.0003, 0.003, 0.3);
      const buzz = v.osc('sawtooth', 100, t + 0.01, t + 0.16);
      v.chain(buzz, v.filter('bandpass', 1200, 0.6), v.env(percussive(0.002, 0.09), t + 0.01, 0.16));
      tick(v, t + 0.03, 3000 * p, 8, 0.02, 0.08);
    },
    { maxVoices: 2, minInterval: 0.05 },
  ),

  // --- Démontage ---
  'screw.unscrew': spec(
    'sfx',
    1.4,
    ({ v, t, p, rng }) => {
      const count = 3 + Math.floor(rng() * 3);
      const end = ratchet(v, t, p, count, 0.034, 3400);
      // Frottement du filet.
      const n = v.noise('pink', t, end + 0.05);
      v.chain(
        n,
        v.filter('bandpass', 1300 * p, 2),
        v.env(adsr({ attack: 0.02, decay: 0.03, sustain: 0.6, release: 0.04 }, end - t), t, 0.05),
      );
    },
    { maxVoices: 2, minInterval: 0.09 },
  ),
  'screw.tighten': spec(
    'sfx',
    0.45,
    ({ v, t, p, rng }) => {
      const end = ratchet(v, t, p * 0.85, 2 + Math.floor(rng() * 2), 0.04, 3400);
      // Portée de la tête : « toc » ferme.
      thump(v, end, 620 * p, 0.03, 0.3);
      tick(v, end, 2000 * p, 4, 0.015, 0.25);
    },
    { maxVoices: 2, minInterval: 0.09 },
  ),
  'snap.click': spec('sfx', 0.75, ({ v, t, p }) => {
    tick(v, t, 2900 * p, 6, 0.015, 0.3);
    burst(v, t, 'white', 'highpass', 5000, 0.7, 0.0003, 0.004, 0.15);
    tick(v, t + 0.011, 2200 * p, 5, 0.02, 0.2);
    thump(v, t, 700 * p, 0.02, 0.15);
  }),
  'magnet.clack': spec('sfx', 0.6, ({ v, t, p }) => {
    thump(v, t, 160 * p, 0.04, 0.5, 0.6);
    burst(v, t, 'white', 'highpass', 3000, 0.7, 0.0003, 0.004, 0.35);
    ring(v, t, [
      [2350 * p, 0.05, 0.12],
      [3710 * p, 0.04, 0.09],
      [5230 * p, 0.03, 0.07],
      [7400 * p, 0.02, 0.05],
    ]);
    burst(v, t + 0.006, 'white', 'highpass', 3500, 0.7, 0.0003, 0.003, 0.15);
  }),
  'magnet.release': spec('sfx', 0.6, ({ v, t, p }) => {
    burst(v, t, 'pink', 'bandpass', 2500 * p, 1.5, 0.02, 0.06, 0.3);
    thump(v, t + 0.05, 220 * p, 0.03, 0.35);
    ring(v, t + 0.05, [
      [1900 * p, 0.03, 0.06],
      [3300 * p, 0.025, 0.04],
    ]);
  }),
  'press.creak': spec(
    'sfx',
    1,
    ({ v, t, p, rng }) => {
      // Adhérence-glissement : train d'impulsions irrégulier dans des formants résonants.
      const dur = randRange(rng, 0.75, 1.05);
      const o = v.osc('sawtooth', 38 * p, t, t + dur + 0.25);
      let time = t;
      let f = 38 * p;
      o.frequency.setValueAtTime(f, t);
      while (time < t + dur) {
        time += randRange(rng, 0.06, 0.14);
        f = Math.min(95, Math.max(28, f * randRange(rng, 0.88, 1.2) + 2));
        o.frequency.linearRampToValueAtTime(f, time);
      }
      const shape = adsr({ attack: 0.15, decay: 0.2, sustain: 0.8, release: 0.2 }, dur);
      const hp = v.filter('highpass', 280, 0.7);
      const f1 = v.filter('bandpass', 760 * p, 10);
      const f2 = v.filter('bandpass', 1650 * p, 12);
      f1.frequency.setValueAtTime(760 * p, t);
      f1.frequency.linearRampToValueAtTime(840 * p, t + dur);
      f2.frequency.setValueAtTime(1650 * p, t);
      f2.frequency.linearRampToValueAtTime(1800 * p, t + dur);
      const env = v.env(shape, t, 0.55);
      o.connect(hp);
      hp.connect(f1).connect(env);
      hp.connect(f2).connect(env);
      env.connect(v.out);
      const n = v.noise('pink', t, t + dur + 0.25);
      v.chain(n, v.filter('bandpass', 3000, 1), v.env(shape, t, 0.05));
    },
    { maxVoices: 1, minInterval: 0.3 },
  ),
  'press.pop': spec('sfx', 0.35, ({ v, t, p }) => {
    thump(v, t, 180 * p, 0.08, 0.8, 0.35);
    burst(v, t, 'white', 'bandpass', 1800 * p, 0.8, 0.0005, 0.03, 0.7);
    ring(v, t, [
      [1250 * p, 0.12, 0.1],
      [2780 * p, 0.08, 0.07],
      [4630 * p, 0.05, 0.05],
    ]);
    tick(v, t + 0.07, 2400 * p, 5, 0.02, 0.12);
  }),
  'part.drop.metal': spec(
    'sfx',
    0.47,
    ({ v, t, p, rng }) => {
      const base = randRange(rng, 1500, 2600) * p;
      const hit = (time: number, level: number) => {
        thump(v, time, 190 * p, 0.035, 0.45 * level, 0.7);
        ring(v, time, metalPartials(base, 0.07, 0.1 * level));
        burst(v, time, 'white', 'lowpass', 3000, 0.7, 0.001, 0.01, 0.3 * level);
      };
      hit(t, 1);
      if (rng() < 0.6) bounces(v, t, randRange(rng, 0.07, 0.1), 1 + Math.floor(rng() * 2), hit);
    },
    { maxVoices: 4, minInterval: 0.03 },
  ),
  'part.drop.small': spec(
    'sfx',
    0.6,
    ({ v, t, p, rng }) => {
      const base = randRange(rng, 3800, 5500) * p;
      const hit = (time: number, level: number) => {
        ring(v, time, [
          [base, 0.04, 0.12 * level],
          [base * 2.3, 0.03, 0.08 * level],
        ]);
        burst(v, time, 'white', 'highpass', 6000, 0.7, 0.0003, 0.003, 0.15 * level);
      };
      hit(t, 1);
      bounces(v, t, randRange(rng, 0.05, 0.07), 2 + Math.floor(rng() * 2), hit);
    },
    { maxVoices: 4, minInterval: 0.03 },
  ),
  'part.drop.plastic': spec(
    'sfx',
    0.7,
    ({ v, t, p, rng }) => {
      const hit = (time: number, level: number) => {
        burst(v, time, 'white', 'bandpass', 950 * p, 3, 0.001, 0.03, 0.6 * level);
        v.chain(
          v.osc('sine', 430 * p, time, time + 0.06),
          v.env(percussive(0.001, 0.03), time, 0.25 * level),
        );
        tick(v, time, 2500 * p, 3, 0.01, 0.12 * level);
      };
      hit(t, 1);
      if (rng() < 0.4) bounces(v, t, randRange(rng, 0.06, 0.09), 1, hit);
    },
    { maxVoices: 4, minInterval: 0.03 },
  ),
  'wire.unwind': spec(
    'sfx',
    1.1,
    ({ v, t, p, rng }) => {
      const dur = randRange(rng, 0.45, 0.7);
      grains(v, t, dur, 24 + Math.floor(rng() * 14), { type: 'bandpass', freq: 3000 * p, q: 2.5 }, 0.5, (x) =>
        Math.sin(Math.PI * Math.min(1, x * 1.1)),
      );
      const n = v.noise('pink', t, t + dur + 0.2);
      v.chain(
        n,
        v.filter('bandpass', 1800 * p, 0.8),
        v.env(adsr({ attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.15 }, dur), t, 0.1),
      );
    },
    { maxVoices: 2, minInterval: 0.1 },
  ),
  'cut.crack': spec(
    'sfx',
    0.5,
    ({ v, t, p, rng }) => {
      burst(v, t, 'white', 'highpass', 1500, 0.7, 0.0002, 0.012, 0.6);
      tick(v, t, 2100 * p, 4, 0.03, 0.35);
      thump(v, t, 130 * p, 0.05, 0.5);
      grains(
        v,
        t + 0.01,
        randRange(rng, 0.15, 0.25),
        8 + Math.floor(rng() * 7),
        { type: 'bandpass', freq: 3000 * p, q: 1.2 },
        0.8,
        (x) => (1 - x) ** 1.5,
      );
    },
    { maxVoices: 2, minInterval: 0.08 },
  ),
  'tool.pickup': spec('sfx', 0.85, ({ v, t, p }) => {
    burst(v, t, 'pink', 'bandpass', 1500, 0.9, 0.03, 0.12, 0.2);
    ring(v, t + 0.03, [
      [2900 * p, 0.06, 0.07],
      [4400 * p, 0.05, 0.05],
      [6900 * p, 0.03, 0.03],
    ]);
    thump(v, t + 0.02, 300 * p, 0.02, 0.15);
  }),
};
