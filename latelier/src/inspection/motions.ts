/**
 * Mouvements de retrait/remontage des pièces (module PUR, sans three.js, couvert par les tests).
 *
 * Chaque `MotionKind` du contrat (`objects/types.ts`) est traduit en une fonction de la
 * progression t ∈ [0, 1] du mouvement vers un échantillon :
 * - `offset`  : déplacement le long de l'axe de sortie (m) ;
 * - `spin`    : rotation autour de l'axe de sortie (rad) — dévissage ;
 * - `tilt`    : bascule autour d'un axe perpendiculaire (rad) — levier, extraction, décollement ;
 * - `lateral` : petit déplacement perpendiculaire (m) — tremblements (résistance, découpe) ;
 * - `spread`  : taux d'écartement des instances (0..1).
 *
 * Les durées par défaut sont réalistes mais accélérées (un dévissage de 10 tours dure ~1,6 s).
 * Remontage (direction −1) = sens inverse, sauf l'aimant : aspiration puis claquement au contact.
 * Le module décrit aussi les repères sonores (`motionCues`) que le séquenceur déclenche.
 */
import type { MotionKind } from '../objects/types';
import type { LoopId, SoundId } from '../audio/types';
import {
  clamp01,
  easeInOutCubic,
  easeInOutSine,
  easeInQuad,
  easeOutCubic,
  easeOutQuad,
  easeInCubic,
  segment,
  smoothstep,
  trapezoid,
} from './easing';

/** Sous-ensemble de `RemovalSpec` utile au calcul du mouvement. */
export interface MotionSpec {
  motion: MotionKind;
  distance: number;
  turns?: number;
  pitch?: number;
  duration?: number;
}

export interface MotionSample {
  offset: number;
  spin: number;
  tilt: number;
  lateral: number;
  spread: number;
}

export const createMotionSample = (): MotionSample => ({ offset: 0, spin: 0, tilt: 0, lateral: 0, spread: 0 });

/** Découpage temporel d'un mouvement : durée totale (s) et frontières de phases (fractions). */
export interface MotionTiming {
  total: number;
  /** Fin de la première phase (fraction de `total`). */
  a: number;
  /** Fin de la deuxième phase (fraction de `total`), si le mouvement en a trois. */
  b: number;
}

/** Repère sonore ponctuel (fraction de la progression du mouvement). */
export interface MotionCue {
  at: number;
  sound: SoundId;
}

/** Fenêtre d'une boucle sonore (fraction de la progression), ex. grésillement du fer. */
export interface MotionLoopWindow {
  from: number;
  to: number;
}

// --- Constantes physiques (m, rad) -------------------------------------------------------

/** Fluage de l'aimant avant décrochage (~0,15 mm). */
export const MAGNET_CREEP = 0.00015;
/** Amplitude du tremblement latéral de résistance (aimant, presse, découpe). */
const TREMOR = 0.00006;
/** Fraction de la course parcourue d'un coup au décrochage magnétique. */
const MAGNET_SNAP_FRACTION = 0.35;
/** Angle du levier de déclipsage. */
const UNCLIP_TILT = 0.1;
/** Course du levier de déclipsage avant le déclic. */
const UNCLIP_PLAY = 0.0004;
/** Angle maximal de bascule à l'extraction (`lift`). */
const LIFT_TILT = 0.14;
/** Angle maximal de décollement (`peel`). */
const PEEL_TILT = 0.28;
/** Fluage sous la presse avant la rupture d'adhérence. */
const PRESS_CREEP = 0.0002;

const clampRange = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Course de vissage (m) d'un dévissage : tours × pas. */
export function threadTravel(spec: MotionSpec): number {
  return spec.motion === 'unscrew' ? Math.max(0, (spec.turns ?? 0) * (spec.pitch ?? 0)) : 0;
}

/** Course finale réelle (m) : la distance, ou la course du filet si elle est plus longue. */
export function finalOffset(spec: MotionSpec): number {
  return Math.max(spec.distance, threadTravel(spec));
}

/** Durées par défaut des phases (s), avant mise à l'échelle par `spec.duration`. */
function basePhases(spec: MotionSpec, direction: 1 | -1): number[] {
  const d = Math.max(0, spec.distance);
  switch (spec.motion) {
    case 'translate':
      return [clampRange(0.5 + 10 * d, 0.6, 1.4)];
    case 'unscrew': {
      const turns = Math.max(0, spec.turns ?? 0);
      const free = Math.max(0, d - threadTravel(spec));
      return [clampRange(turns * 0.16, 0.45, 2.6), clampRange(0.3 + 10 * free, 0.3, 0.8)];
    }
    case 'magneticPull':
      // Démontage : résistance, décrochage, sortie. Remontage : approche, aspiration, rebond.
      return direction === 1 ? [0.45, 0.08, 0.5] : [0.55, 0.1, 0.22];
    case 'desolder':
      return [1.1, 0.7];
    case 'pressOut':
      return [0.7, clampRange(0.9 + 25 * d, 1.0, 2.2)];
    case 'unwind':
      return [1.8, 0.6];
    case 'unclip':
      return [0.3, clampRange(0.45 + 6 * d, 0.45, 0.9)];
    case 'lift':
      return [clampRange(0.8 + 5 * d, 0.8, 1.4)];
    case 'spread':
      return [0.6, clampRange(0.4 + 8 * d, 0.45, 1.0)];
    case 'peel':
      return [1.4];
    case 'cut':
      return [0.5, 0.6];
  }
}

/** Découpage temporel d'un mouvement (durée totale et frontières des phases). */
export function motionTiming(spec: MotionSpec, direction: 1 | -1 = 1): MotionTiming {
  const phases = basePhases(spec, direction);
  const raw = phases.reduce((s, p) => s + p, 0);
  const total = spec.duration !== undefined && spec.duration > 0 ? spec.duration : raw;
  const a = phases.length > 1 ? phases[0]! / raw : 1;
  const b = phases.length > 2 ? (phases[0]! + phases[1]!) / raw : 1;
  return { total, a, b };
}

/** Durée d'un mouvement (s), hors approche/retrait de l'outil. */
export function motionDuration(spec: MotionSpec, direction: 1 | -1 = 1): number {
  return motionTiming(spec, direction).total;
}

/** Tremblement déterministe (m) : sinusoïde rapide modulée par une enveloppe 0..1. */
const tremor = (seconds: number, frequency: number, envelope: number, amplitude = TREMOR): number =>
  amplitude * Math.sin(2 * Math.PI * frequency * seconds) * envelope;

/**
 * Échantillon de RETRAIT pour la progression u ∈ [0, 1] (0 = en place, 1 = fin de course).
 * Écrit dans `out` (aucune allocation) et le retourne.
 */
export function sampleRemoval(spec: MotionSpec, u: number, out: MotionSample, timing = motionTiming(spec)): MotionSample {
  const t = clamp01(u);
  const d = Math.max(0, spec.distance);
  const seconds = t * timing.total;
  out.offset = 0;
  out.spin = 0;
  out.tilt = 0;
  out.lateral = 0;
  out.spread = 0;
  switch (spec.motion) {
    case 'translate':
      out.offset = d * easeInOutCubic(t);
      break;
    case 'unscrew': {
      const turns = Math.max(0, spec.turns ?? 0);
      const travel = threadTravel(spec);
      const end = finalOffset(spec);
      if (t < timing.a) {
        // Vitesse trapézoïdale : décollement, rotation régulière, ralentissement en fin de filet.
        const k = trapezoid(t / timing.a, 0.18);
        out.spin = turns * 2 * Math.PI * k;
        out.offset = travel * k;
      } else {
        out.spin = turns * 2 * Math.PI;
        out.offset = travel + (end - travel) * easeInOutCubic(segment(t, timing.a, 1));
      }
      break;
    }
    case 'magneticPull': {
      const snap = Math.max(MAGNET_CREEP, d * MAGNET_SNAP_FRACTION);
      if (t < timing.a) {
        const k = t / timing.a;
        out.offset = Math.min(MAGNET_CREEP, d) * smoothstep(k);
        out.lateral = tremor(seconds, 28, Math.sin(Math.PI * k));
      } else if (t < timing.b) {
        const k = segment(t, timing.a, timing.b);
        out.offset = MAGNET_CREEP + (snap - MAGNET_CREEP) * easeOutQuad(k);
      } else {
        out.offset = snap + (Math.max(d, snap) - snap) * easeOutCubic(segment(t, timing.b, 1));
      }
      break;
    }
    case 'desolder':
      // Fusion de l'étain (hook de la pièce) puis soulèvement.
      out.offset = t < timing.a ? 0 : d * easeInOutCubic(segment(t, timing.a, 1));
      break;
    case 'pressOut': {
      const creep = Math.min(PRESS_CREEP, d);
      if (t < timing.a) {
        const k = t / timing.a;
        out.offset = creep * easeInQuad(k);
        out.lateral = tremor(seconds, 35, k, TREMOR * 0.5);
      } else {
        out.offset = creep + (d - creep) * trapezoid(segment(t, timing.a, 1), 0.08);
      }
      break;
    }
    case 'unwind':
      out.offset = t < timing.a ? 0 : d * easeInOutCubic(segment(t, timing.a, 1));
      break;
    case 'unclip': {
      const play = Math.min(UNCLIP_PLAY, d);
      if (t < timing.a) {
        const k = t / timing.a;
        out.tilt = UNCLIP_TILT * easeOutQuad(k);
        out.offset = play * k;
      } else {
        const k = segment(t, timing.a, 1);
        out.tilt = UNCLIP_TILT * (1 - smoothstep(k));
        out.offset = play + (d - play) * easeInOutCubic(k);
      }
      break;
    }
    case 'lift':
      out.offset = d * easeInOutCubic(t);
      out.tilt = LIFT_TILT * Math.sin(Math.PI * Math.min(1, t / 0.7));
      break;
    case 'spread':
      if (t < timing.a) {
        out.spread = easeInOutCubic(t / timing.a);
      } else {
        out.spread = 1;
        out.offset = d * easeInOutCubic(segment(t, timing.a, 1));
      }
      break;
    case 'peel':
      // Décollement : lent au début (adhérence), rotation qui culmine à mi-course.
      out.offset = d * (0.5 * easeInCubic(t) + 0.5 * easeInOutCubic(t));
      out.tilt = PEEL_TILT * Math.sin(Math.PI * t);
      break;
    case 'cut':
      if (t < timing.a) {
        const k = t / timing.a;
        out.lateral = tremor(seconds, 30, Math.sin(Math.PI * k), TREMOR * 1.3);
      } else {
        out.offset = d * easeInOutCubic(segment(t, timing.a, 1));
      }
      break;
  }
  return out;
}

/**
 * Remontage d'un aimant : approche lente jusqu'à ~30 % de la course, aspiration accélérée,
 * claquement au contact puis léger rebond amorti. u ∈ [0, 1] (0 = pièce retirée).
 */
function sampleMagnetReinsert(spec: MotionSpec, u: number, out: MotionSample, timing: MotionTiming): MotionSample {
  const t = clamp01(u);
  const d = Math.max(0, spec.distance);
  const near = d * 0.3;
  out.spin = 0;
  out.tilt = 0;
  out.lateral = 0;
  out.spread = 0;
  if (t < timing.a) out.offset = d - (d - near) * easeInOutSine(t / timing.a);
  else if (t < timing.b) out.offset = near * (1 - easeInQuad(segment(t, timing.a, timing.b)));
  else {
    const k = segment(t, timing.b, 1);
    out.offset = Math.min(near, 0.00025) * Math.sin(Math.PI * k) * (1 - k);
  }
  return out;
}

/**
 * Échantillon d'un geste : `u` = progression du geste (0 → 1 dans le temps), `direction` = +1
 * démontage, −1 remontage. Le remontage parcourt le retrait à l'envers (sauf l'aimant).
 */
export function sampleMotion(
  spec: MotionSpec,
  u: number,
  direction: 1 | -1,
  out: MotionSample = createMotionSample(),
  timing = motionTiming(spec, direction),
): MotionSample {
  if (direction === 1) return sampleRemoval(spec, u, out, timing);
  if (spec.motion === 'magneticPull') return sampleMagnetReinsert(spec, u, out, timing);
  return sampleRemoval(spec, 1 - clamp01(u), out, motionTiming(spec, 1));
}

/**
 * Progression transmise au hook `onRemovalProgress` (0 = en place, 1 = retirée) pour une
 * progression de geste `u`.
 */
export const removalProgress = (u: number, direction: 1 | -1): number =>
  direction === 1 ? clamp01(u) : 1 - clamp01(u);

/**
 * Fusion de l'étain pour un dessoudage, en fonction de la progression de retrait (0..1) :
 * 0 = soudure intacte, 1 = étain entièrement fondu/aspiré. Utilisable par les hooks des objets.
 */
export function meltProgress(removal: number, spec: MotionSpec = { motion: 'desolder', distance: 0.01 }): number {
  const { a } = motionTiming(spec, 1);
  return smoothstep(segment(removal, a * 0.1, a * 0.9));
}

/** Repères sonores ponctuels d'un geste. */
export function motionCues(spec: MotionSpec, direction: 1 | -1): MotionCue[] {
  const { a } = motionTiming(spec, direction);
  const forward = direction === 1;
  switch (spec.motion) {
    case 'magneticPull':
      return forward ? [{ at: a, sound: 'magnet.release' }] : [{ at: motionTiming(spec, -1).b, sound: 'magnet.clack' }];
    case 'pressOut':
      return forward
        ? [
            { at: 0.04, sound: 'press.creak' },
            { at: a, sound: 'press.pop' },
          ]
        : [{ at: 1 - a + 0.02, sound: 'press.creak' }];
    case 'unwind':
      return forward
        ? [
            { at: 0.02, sound: 'wire.unwind' },
            { at: a * 0.5, sound: 'wire.unwind' },
          ]
        : [{ at: 1 - a + 0.02, sound: 'wire.unwind' }];
    case 'unclip':
      return forward ? [{ at: a, sound: 'snap.click' }] : [{ at: 0.97, sound: 'snap.click' }];
    case 'cut':
      return forward ? [{ at: a, sound: 'cut.crack' }] : [];
    case 'peel':
      return forward ? [{ at: 0.1, sound: 'wire.unwind' }] : [];
    default:
      return [];
  }
}

/** Fenêtre de la boucle de chauffe (dessoudage) : fusion en début de retrait, en fin de remontage. */
export function heatWindow(spec: MotionSpec, direction: 1 | -1): MotionLoopWindow | null {
  if (spec.motion !== 'desolder') return null;
  const { a } = motionTiming(spec, 1);
  return direction === 1 ? { from: 0, to: a } : { from: 1 - a, to: 1 };
}

/** Boucle sonore de chauffe selon l'outil (air chaud ou fer). */
export const heatLoopFor = (toolId: string | null | undefined): LoopId =>
  toolId === 'hot-air' ? 'hotair.blow' : 'iron.sizzle';

/** Son joué à chaque quart de tour : dévissage ou serrage. */
export const quarterTurnSound = (direction: 1 | -1): SoundId =>
  direction === 1 ? 'screw.unscrew' : 'screw.tighten';

/** Numéro du quart de tour courant pour une rotation `spin` (rad). */
export const quarterTurnIndex = (spin: number): number => Math.floor(Math.abs(spin) / (Math.PI / 2) + 1e-9);

// --- Instances décalées dans le temps ----------------------------------------------------

/** Durée totale d'un geste sur `count` instances décalées de `stagger` × durée. */
export function staggeredDuration(duration: number, count: number, stagger = 0): number {
  const s = clamp01(stagger);
  return duration * (1 + Math.max(0, count - 1) * s);
}

/** Progression (0..1) de l'instance `index` à l'instant `elapsed` (s) d'un geste décalé. */
export function instanceProgress(elapsed: number, duration: number, index: number, stagger = 0): number {
  if (duration <= 0) return 1;
  return clamp01((elapsed - index * clamp01(stagger) * duration) / duration);
}
