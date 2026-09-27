/**
 * Composition générative (pure, reproductible) de la musique de la radio : chaque « morceau »
 * tire une tonalité, un mode, un tempo, un style, deux progressions d'accords et des motifs
 * mélodiques, puis produit mesure par mesure les notes de basse, d'accords, de mélodie et de
 * batterie. Aucune dépendance à Web Audio : la synthèse est faite par `radio.ts`.
 */
import { type Rng, mulberry32, pick, pickWeighted, randInt, randRange } from './math';

export type Mode = 'major' | 'minor' | 'dorian' | 'mixolydian';
export type Style = 'ballad' | 'pop' | 'shuffle' | 'bossa';
export type ChordVoice = 'pluck' | 'pad' | 'organ';
export type LeadVoice = 'square' | 'triangle' | 'saw';
export type Instrument = 'bass' | 'chord' | 'lead' | 'kick' | 'snare' | 'rim' | 'hat' | 'openhat';
export type SectionKind = 'intro' | 'A' | 'B' | 'outro';

/** Note (ou coup de batterie) positionnée dans une mesure 4/4. */
export interface NoteEvent {
  /** Début en temps (noires) depuis le début de la mesure, dans [0, 4). */
  beat: number;
  /** Durée en temps. */
  dur: number;
  /** Hauteur MIDI (ignorée pour la batterie). */
  midi: number;
  /** Vélocité 0..1. */
  vel: number;
  inst: Instrument;
}

export interface BarPlan {
  section: SectionKind;
  /** Degré de l'accord (0 = tonique). */
  degree: number;
  /** Notes MIDI de l'accord (voicing). */
  chord: number[];
  events: NoteEvent[];
}

export interface SongPlan {
  seed: number;
  tempo: number;
  /** Tonique MIDI (octave de la basse). */
  root: number;
  mode: Mode;
  style: Style;
  chordVoice: ChordVoice;
  leadVoice: LeadVoice;
  /** Retard des croches paires (fraction de temps) : 0 = droit, 1/6 = ternaire. */
  swing: number;
  bars: BarPlan[];
}

export const SCALES: Readonly<Record<Mode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** Progressions (degrés 0..6) par mode, sur 4 mesures. */
const PROGRESSIONS: Readonly<Record<Mode, readonly (readonly number[])[]>> = {
  major: [
    [0, 4, 5, 3],
    [0, 5, 3, 4],
    [5, 3, 0, 4],
    [0, 3, 1, 4],
    [0, 2, 3, 4],
    [3, 4, 2, 5],
    [0, 3, 0, 4],
  ],
  minor: [
    [0, 5, 2, 6],
    [0, 3, 6, 2],
    [0, 6, 5, 6],
    [0, 3, 4, 0],
    [5, 6, 0, 0],
  ],
  dorian: [
    [0, 3, 0, 3],
    [0, 6, 3, 0],
    [0, 1, 3, 0],
  ],
  mixolydian: [
    [0, 6, 3, 0],
    [0, 3, 6, 3],
    [0, 6, 0, 3],
  ],
};

const FORMS: readonly (readonly SectionKind[])[] = [
  ['intro', 'A', 'A', 'B', 'A', 'B', 'outro'],
  ['intro', 'A', 'B', 'A', 'B', 'B', 'outro'],
  ['A', 'A', 'B', 'A', 'outro'],
  ['intro', 'A', 'B', 'B', 'A', 'outro'],
];

/** Rythmes mélodiques sur 2 mesures : [début, durée] en temps (0..8). */
const MELODY_RHYTHMS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [0, 1],
    [1, 0.5],
    [1.5, 0.5],
    [2, 1.5],
    [4, 1],
    [5, 1],
    [6, 2],
  ],
  [
    [0.5, 0.5],
    [1, 0.5],
    [1.5, 1],
    [2.5, 1.5],
    [4.5, 0.5],
    [5, 0.5],
    [5.5, 0.5],
    [6, 2],
  ],
  [
    [0, 1.5],
    [1.5, 0.5],
    [2, 0.5],
    [2.5, 0.5],
    [3, 1],
    [4, 2],
    [6, 1],
    [7, 1],
  ],
  [
    [0, 0.5],
    [0.5, 0.5],
    [1, 1],
    [2, 0.5],
    [2.5, 1.5],
    [4, 0.5],
    [4.5, 0.5],
    [5, 1],
    [6, 1.5],
  ],
  [
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 3],
    [7, 0.5],
    [7.5, 0.5],
  ],
];

/** Hauteur MIDI du degré `degree` (peut dépasser 6 ou être négatif) dans le mode. */
export function scaleNote(root: number, mode: Mode, degree: number): number {
  const scale = SCALES[mode];
  const octave = Math.floor(degree / 7);
  const index = ((degree % 7) + 7) % 7;
  return root + octave * 12 + scale[index]!;
}

/** La note MIDI appartient-elle au mode (toutes octaves) ? */
export function isInScale(root: number, mode: Mode, midi: number): boolean {
  const pc = (((midi - root) % 12) + 12) % 12;
  return SCALES[mode].includes(pc);
}

/** Accord de trois (ou quatre) sons empilés en tierces sur le degré (octave de la tonique). */
export function chordTones(root: number, mode: Mode, degree: number, seventh: boolean): number[] {
  const tones = [0, 2, 4].map((k) => scaleNote(root, mode, degree + k));
  if (seventh) tones.push(scaleNote(root, mode, degree + 6));
  return tones;
}

/**
 * Voicing le plus proche du précédent (conduite des voix) dans le registre [low, high] :
 * teste les renversements et octaves, retient le plus petit déplacement total.
 */
export function voiceLead(
  tones: readonly number[],
  previous: readonly number[] | null,
  low: number,
  high: number,
): number[] {
  const pcs = tones.map((t) => ((t % 12) + 12) % 12);
  let best: number[] | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  const center = (low + high) / 2;
  for (let inversion = 0; inversion < pcs.length; inversion++) {
    for (let base = low - 12; base <= high; base++) {
      if (((base % 12) + 12) % 12 !== pcs[inversion]) continue;
      const voicing: number[] = [base];
      for (let k = 1; k < pcs.length; k++) {
        const pc = pcs[(inversion + k) % pcs.length]!;
        let n = voicing[k - 1]! + 1;
        while (((n % 12) + 12) % 12 !== pc) n++;
        voicing.push(n);
      }
      if (voicing[0]! < low || voicing[voicing.length - 1]! > high) continue;
      let cost = 0;
      if (previous && previous.length > 0) {
        for (const v of voicing) {
          let d = Number.POSITIVE_INFINITY;
          for (const p of previous) d = Math.min(d, Math.abs(v - p));
          cost += d;
        }
      } else {
        cost = Math.abs(voicing[1]! - center);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = voicing;
      }
    }
  }
  return best ?? tones.map((t) => t + 12);
}

/** Décale une position de croche paire selon le swing. */
function swingBeat(beat: number, swing: number): number {
  const frac = beat - Math.floor(beat);
  return Math.abs(frac - 0.5) < 1e-6 ? beat + swing : beat;
}

/** Graine d'un morceau → plan complet. */
export function composeSong(seed: number): SongPlan {
  const rng = mulberry32(seed);
  const mode = pickWeighted<Mode>(rng, ['major', 'minor', 'dorian', 'mixolydian'], [4, 3, 1.5, 1.5]);
  const style = pickWeighted<Style>(rng, ['ballad', 'pop', 'shuffle', 'bossa'], [2, 4, 2, 1.5]);
  const tempo =
    style === 'ballad'
      ? randInt(rng, 70, 84)
      : style === 'bossa'
        ? randInt(rng, 96, 118)
        : style === 'shuffle'
          ? randInt(rng, 84, 104)
          : randInt(rng, 92, 116);
  const root = randInt(rng, 40, 47); // Mi1..Si1 : octave de la basse
  const chordVoice: ChordVoice =
    style === 'ballad'
      ? pick(rng, ['pad', 'organ'] as const)
      : pick(rng, ['pluck', 'pluck', 'organ', 'pad'] as const);
  const leadVoice: LeadVoice = pick(rng, ['square', 'triangle', 'triangle', 'saw'] as const);
  const swing = style === 'shuffle' ? 1 / 6 : style === 'bossa' ? 0 : randRange(rng, 0, 0.05);

  const progs = PROGRESSIONS[mode];
  const progA = pick(rng, progs);
  let progB = pick(rng, progs);
  for (let guard = 0; progB === progA && progs.length > 1 && guard < 8; guard++) progB = pick(rng, progs);
  const form = pick(rng, FORMS);
  const useSevenths = style === 'bossa' || style === 'shuffle' || rng() < 0.3;

  // Motifs mélodiques : une graine et un rythme par type de section (répétition + variation).
  const motif = {
    A: { seed: Math.floor(rng() * 1e9), rhythm: pick(rng, MELODY_RHYTHMS), offset: 0 },
    B: { seed: Math.floor(rng() * 1e9), rhythm: pick(rng, MELODY_RHYTHMS), offset: 2 },
  };
  const bassPattern = randInt(rng, 0, 2);
  const compPattern = randInt(rng, 0, 3);
  const drumVariant = randInt(rng, 0, 2);

  const song: SongPlan = { seed, tempo, root, mode, style, chordVoice, leadVoice, swing, bars: [] };
  let previousVoicing: number[] | null = null;
  let leadPitch = scaleNote(root, mode, 14 + 4); // départ : quinte, deux octaves au-dessus
  const totalSections = form.length;

  form.forEach((section, sectionIndex) => {
    const prog = section === 'B' ? progB : progA;
    const isLast = sectionIndex === totalSections - 1;
    for (let barInSection = 0; barInSection < 4; barInSection++) {
      const degree = section === 'outro' && barInSection === 3 ? 0 : prog[barInSection]!;
      const tones = chordTones(root, mode, degree, useSevenths && degree !== 0);
      const voicing = voiceLead(tones, previousVoicing, root + 17, root + 33);
      previousVoicing = voicing;
      const events: NoteEvent[] = [];
      const barRng = mulberry32((seed ^ (sectionIndex * 7919 + barInSection * 104729)) >>> 0);
      const finalBar = isLast && barInSection === 3;

      writeDrums(events, style, section, barInSection, drumVariant, finalBar, swing, barRng);
      writeBass(
        events,
        style,
        bassPattern,
        tones,
        root,
        mode,
        degree,
        prog,
        barInSection,
        finalBar,
        swing,
        barRng,
      );
      writeChords(events, style, song.chordVoice, compPattern, voicing, finalBar, swing, barRng);
      if (section === 'A' || section === 'B') {
        const m = motif[section];
        // Même graine pour les deux phrases de 2 mesures : répétition ; la seconde phrase varie
        // sa fin (graine décalée) et se résout sur l'accord.
        const phrase = Math.floor(barInSection / 2);
        const half = barInSection % 2;
        const melodyRng = mulberry32((m.seed + (half === 1 && phrase === 1 ? 17 : 0) + half * 31) >>> 0);
        leadPitch = writeMelody(
          events,
          m.rhythm,
          half,
          leadPitch,
          voicing,
          root,
          mode,
          m.offset,
          phrase === 1 && half === 1,
          swing,
          melodyRng,
        );
      }
      events.sort((a, b) => a.beat - b.beat);
      song.bars.push({ section, degree, chord: voicing, events });
    }
  });
  return song;
}

/** Durée d'un morceau (s). */
export function songDuration(song: SongPlan): number {
  return (song.bars.length * 4 * 60) / song.tempo;
}

function writeDrums(
  out: NoteEvent[],
  style: Style,
  section: SectionKind,
  bar: number,
  variant: number,
  finalBar: boolean,
  swing: number,
  rng: Rng,
): void {
  const hit = (beat: number, inst: Instrument, vel: number, dur = 0.25) =>
    out.push({ beat: swingBeat(beat, swing), dur, midi: 0, vel: vel * randRange(rng, 0.85, 1), inst });
  if (finalBar) {
    hit(0, 'kick', 0.9);
    hit(0, 'openhat', 0.5, 1);
    return;
  }
  const light = section === 'intro';
  const fill = bar === 3 && section !== 'intro' && rng() < 0.5;
  switch (style) {
    case 'ballad': {
      hit(0, 'kick', 0.8);
      if (!light && (variant === 1 || rng() < 0.35)) hit(2.5, 'kick', 0.5);
      if (!light) hit(2, variant === 2 ? 'rim' : 'snare', 0.65);
      for (let b = 0; b < 4; b += variant === 0 ? 1 : 0.5) hit(b, 'hat', b % 1 === 0 ? 0.35 : 0.22);
      break;
    }
    case 'bossa': {
      for (const b of [0, 1.5, 2, 3.5]) hit(b, 'kick', b % 2 === 0 ? 0.6 : 0.4);
      if (!light) for (const b of bar % 2 === 0 ? [0, 1, 2.5] : [1, 2, 3.5]) hit(b, 'rim', 0.55);
      for (let b = 0; b < 4; b += 0.5) hit(b, 'hat', b % 1 === 0 ? 0.3 : 0.2);
      break;
    }
    case 'shuffle':
    case 'pop': {
      hit(0, 'kick', 0.9);
      hit(2, 'kick', 0.8);
      if (variant >= 1 && rng() < 0.5) hit(2.5, 'kick', 0.55);
      if (variant === 2 && rng() < 0.3) hit(1.5, 'kick', 0.45);
      if (!light) {
        hit(1, 'snare', 0.8);
        hit(3, 'snare', 0.85);
        if (fill) {
          hit(3.5, 'snare', 0.5);
          hit(3.75, 'snare', 0.6);
        }
      }
      for (let b = 0; b < 4; b += 0.5) {
        const open = !light && variant !== 0 && b === 3.5 && bar % 2 === 1;
        hit(b, open ? 'openhat' : 'hat', b % 1 === 0 ? 0.42 : 0.26, open ? 0.5 : 0.25);
      }
      break;
    }
  }
}

function writeBass(
  out: NoteEvent[],
  style: Style,
  pattern: number,
  tones: readonly number[],
  root: number,
  mode: Mode,
  degree: number,
  prog: readonly number[],
  bar: number,
  finalBar: boolean,
  swing: number,
  rng: Rng,
): void {
  const r = tones[0]!;
  const fifth = tones[2]!;
  const third = tones[1]!;
  const note = (beat: number, dur: number, midi: number, vel: number) =>
    out.push({ beat: swingBeat(beat, swing), dur, midi, vel: vel * randRange(rng, 0.9, 1), inst: 'bass' });
  if (finalBar) {
    note(0, 3.5, r, 0.9);
    return;
  }
  switch (style) {
    case 'ballad':
      note(0, 2, r, 0.85);
      note(2, 2, pattern === 1 ? fifth - 12 : r, 0.7);
      break;
    case 'bossa':
      note(0, 1.4, r, 0.85);
      note(1.5, 0.45, fifth - 12, 0.6);
      note(2, 1.4, fifth - 12, 0.75);
      note(3.5, 0.45, r, 0.6);
      break;
    case 'shuffle': {
      // Basse marchante : fondamentale, tierce, quinte, approche chromatique de l'accord suivant.
      const nextDegree = prog[(bar + 1) % prog.length] ?? degree;
      const nextRoot = scaleNote(root, mode, nextDegree);
      const approach = nextRoot + (nextRoot > fifth ? -1 : 1);
      note(0, 0.9, r, 0.85);
      note(1, 0.9, third, 0.7);
      note(2, 0.9, fifth, 0.75);
      note(3, 0.9, approach, 0.65);
      break;
    }
    case 'pop':
      if (pattern === 0) {
        for (let b = 0; b < 4; b += 0.5) note(b, 0.42, r, b % 1 === 0 ? 0.8 : 0.6);
      } else if (pattern === 1) {
        note(0, 1.4, r, 0.85);
        note(1.5, 0.5, r, 0.6);
        note(2, 1, fifth - 12, 0.75);
        note(3, 0.9, r + 12, 0.6);
      } else {
        note(0, 0.9, r, 0.85);
        note(1, 0.4, r, 0.55);
        note(1.5, 0.9, r + 12, 0.6);
        note(2.5, 0.4, fifth - 12, 0.6);
        note(3, 0.9, r, 0.7);
      }
      break;
  }
}

function writeChords(
  out: NoteEvent[],
  style: Style,
  voice: ChordVoice,
  pattern: number,
  voicing: readonly number[],
  finalBar: boolean,
  swing: number,
  rng: Rng,
): void {
  const strum = (beat: number, dur: number, vel: number) => {
    for (let i = 0; i < voicing.length; i++) {
      // Léger « strum » : les notes démarrent à quelques millitemps d'écart.
      out.push({
        beat: swingBeat(beat, swing) + i * 0.012,
        dur,
        midi: voicing[i]!,
        vel: vel * randRange(rng, 0.85, 1),
        inst: 'chord',
      });
    }
  };
  if (finalBar) {
    strum(0, 3.8, 0.7);
    return;
  }
  if (voice === 'pad' || style === 'ballad') {
    strum(0, 3.9, 0.55);
    return;
  }
  if (style === 'shuffle') {
    strum(1, 0.5, 0.6);
    strum(3, 0.5, 0.6);
    if (rng() < 0.3) strum(3.5, 0.4, 0.45);
    return;
  }
  if (style === 'bossa') {
    for (const b of [0, 1.5, 2.5, 3.5]) strum(b, 0.6, 0.5);
    return;
  }
  const patterns: readonly (readonly number[])[] = [
    [0, 1, 2, 3],
    [0, 1.5, 2, 3.5],
    [0, 0.5, 1.5, 2.5, 3],
    [0, 2, 2.5],
  ];
  const p = patterns[pattern % patterns.length]!;
  const dur = voice === 'organ' ? 0.9 : 0.45;
  for (const b of p) strum(b, dur, b % 1 === 0 ? 0.6 : 0.48);
}

/** Écrit une demi-phrase mélodique (1 mesure) et retourne la dernière hauteur jouée. */
function writeMelody(
  out: NoteEvent[],
  rhythm: readonly (readonly [number, number])[],
  half: number,
  startPitch: number,
  voicing: readonly number[],
  root: number,
  mode: Mode,
  registerOffset: number,
  resolve: boolean,
  swing: number,
  rng: Rng,
): number {
  const low = scaleNote(root, mode, 14 + registerOffset); // tonique + 2 octaves
  const high = scaleNote(root, mode, 24 + registerOffset);
  const scalePitches: number[] = [];
  for (let d = 7; d <= 35; d++) {
    const p = scaleNote(root, mode, d);
    if (p >= low && p <= high) scalePitches.push(p);
  }
  const chordPcs = voicing.map((v) => ((v % 12) + 12) % 12);
  const chordPitches = scalePitches.filter((p) => chordPcs.includes(((p % 12) + 12) % 12));
  let pitch = startPitch;
  const notes = rhythm.filter(([b]) => b >= half * 4 && b < half * 4 + 4);
  notes.forEach(([b, d], i) => {
    const beat = b - half * 4;
    const last = i === notes.length - 1;
    const strong = Math.abs(beat % 2) < 1e-6;
    if ((last && resolve) || (strong && chordPitches.length > 0)) {
      // Temps fort ou fin de phrase : note de l'accord la plus proche (parfois la 2e plus proche).
      const sorted = [...chordPitches].sort((x, y) => Math.abs(x - pitch) - Math.abs(y - pitch));
      pitch = sorted[resolve && last ? 0 : rng() < 0.7 ? 0 : Math.min(1, sorted.length - 1)] ?? pitch;
    } else {
      // Temps faible : mouvement conjoint dans la gamme (sauts rares).
      let index = scalePitches.indexOf(pitch);
      if (index < 0) index = nearestIndex(scalePitches, pitch);
      const step = pickWeighted(rng, [-2, -1, 1, 2, 3], [1, 3, 3, 1, 0.4]);
      index = Math.max(0, Math.min(scalePitches.length - 1, index + step));
      pitch = scalePitches[index] ?? pitch;
    }
    if (rng() < 0.08 && !last) return; // respiration : note omise
    out.push({
      beat: swingBeat(beat, swing),
      dur: Math.max(0.2, d * 0.92),
      midi: pitch,
      vel: (strong ? 0.75 : 0.6) * randRange(rng, 0.85, 1),
      inst: 'lead',
    });
  });
  return pitch;
}

function nearestIndex(values: readonly number[], target: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i]! - target) < Math.abs(values[best]! - target)) best = i;
  }
  return best;
}
