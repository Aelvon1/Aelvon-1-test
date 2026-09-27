/**
 * Tests des mouvements de retrait/remontage (module pur `inspection/motions`) :
 * valeurs aux bornes, monotonie, remontage inverse, repères sonores, instances décalées.
 */
import { describe, expect, it } from 'vitest';
import type { MotionKind } from '../src/objects/types';
import {
  createMotionSample,
  finalOffset,
  heatWindow,
  instanceProgress,
  meltProgress,
  motionCues,
  motionDuration,
  motionTiming,
  quarterTurnIndex,
  sampleMotion,
  sampleRemoval,
  staggeredDuration,
  type MotionSpec,
} from '../src/inspection/motions';

const KINDS: MotionKind[] = [
  'translate',
  'unscrew',
  'magneticPull',
  'desolder',
  'pressOut',
  'unwind',
  'unclip',
  'lift',
  'spread',
  'peel',
  'cut',
];

const specFor = (motion: MotionKind): MotionSpec =>
  motion === 'unscrew' ? { motion, distance: 0.02, turns: 8, pitch: 0.0005 } : { motion, distance: 0.02 };

const N = 400;
const samples = (spec: MotionSpec, direction: 1 | -1 = 1) =>
  Array.from({ length: N + 1 }, (_, i) => ({ ...sampleMotion(spec, i / N, direction) }));

describe('mouvements — bornes', () => {
  for (const kind of KINDS) {
    it(`${kind} : repos à t = 0, fin de course à t = 1`, () => {
      const spec = specFor(kind);
      const start = sampleRemoval(spec, 0, createMotionSample());
      expect(start.offset).toBeCloseTo(0, 9);
      expect(start.spin).toBeCloseTo(0, 9);
      expect(start.tilt).toBeCloseTo(0, 9);
      expect(start.lateral).toBeCloseTo(0, 9);
      expect(start.spread).toBeCloseTo(0, 9);
      const end = sampleRemoval(spec, 1, createMotionSample());
      expect(end.offset).toBeCloseTo(finalOffset(spec), 9);
      expect(end.tilt).toBeCloseTo(0, 6);
      expect(end.lateral).toBeCloseTo(0, 9);
      if (kind === 'unscrew') expect(end.spin).toBeCloseTo(8 * 2 * Math.PI, 9);
      else expect(end.spin).toBe(0);
      expect(end.spread).toBe(kind === 'spread' ? 1 : 0);
    });

    it(`${kind} : valeurs hors [0, 1] bornées`, () => {
      const spec = specFor(kind);
      expect(sampleRemoval(spec, -2, createMotionSample()).offset).toBeCloseTo(0, 9);
      expect(sampleRemoval(spec, 3, createMotionSample()).offset).toBeCloseTo(finalOffset(spec), 9);
    });

    it(`${kind} : durée par défaut réaliste et surchargeable`, () => {
      const d = motionDuration(specFor(kind));
      expect(d).toBeGreaterThan(0.4);
      expect(d).toBeLessThan(4);
      expect(motionDuration({ ...specFor(kind), duration: 2.5 })).toBe(2.5);
    });
  }
});

describe('mouvements — monotonie', () => {
  for (const kind of KINDS) {
    it(`${kind} : la course le long de l'axe ne recule jamais`, () => {
      const list = samples(specFor(kind));
      for (let i = 1; i < list.length; i++)
        expect(list[i]!.offset).toBeGreaterThanOrEqual(list[i - 1]!.offset - 1e-12);
    });
  }

  it('unscrew : rotation monotone, translation couplée au pas pendant le filet', () => {
    const spec = specFor('unscrew');
    const { a } = motionTiming(spec);
    const list = samples(spec);
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.spin).toBeGreaterThanOrEqual(list[i - 1]!.spin - 1e-12);
    // Pendant le filet : offset = pas × tours effectués.
    for (let i = 0; i <= N; i++) {
      if (i / N > a) break;
      const s = list[i]!;
      expect(s.offset).toBeCloseTo((s.spin / (2 * Math.PI)) * 0.0005, 9);
    }
  });

  it('spread : écartement monotone puis translation', () => {
    const spec = specFor('spread');
    const list = samples(spec);
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.spread).toBeGreaterThanOrEqual(list[i - 1]!.spread - 1e-12);
    const { a } = motionTiming(spec);
    expect(sampleRemoval(spec, a * 0.99, createMotionSample()).offset).toBe(0);
  });
});

describe('mouvements — caractère', () => {
  it('magneticPull : résistance de ~0,15 mm puis décrochage brusque', () => {
    const spec = specFor('magneticPull');
    const { a, b } = motionTiming(spec);
    const before = sampleRemoval(spec, a - 1e-6, createMotionSample());
    expect(before.offset).toBeLessThanOrEqual(0.00015 + 1e-9);
    expect(before.offset).toBeGreaterThan(0.0001);
    const after = sampleRemoval(spec, b, createMotionSample());
    // Le décrochage parcourt au moins 30 % de la course en quelques centièmes de seconde.
    expect(after.offset).toBeGreaterThan(0.3 * spec.distance);
    expect((b - a) * motionDuration(spec)).toBeLessThan(0.15);
    // Tremblement latéral pendant la résistance.
    const tremor = samples(spec)
      .filter((_, i) => i / N < a)
      .some((s) => Math.abs(s.lateral) > 1e-5);
    expect(tremor).toBe(true);
  });

  it('pressOut : quasi immobile pendant la montée en effort', () => {
    const spec = specFor('pressOut');
    const { a } = motionTiming(spec);
    expect(sampleRemoval(spec, a, createMotionSample()).offset).toBeLessThanOrEqual(0.0002 + 1e-12);
  });

  it('desolder : la pièce ne bouge pas pendant la fusion ; fenêtre de chauffe cohérente', () => {
    const spec = specFor('desolder');
    const { a } = motionTiming(spec);
    expect(sampleRemoval(spec, a * 0.9, createMotionSample()).offset).toBe(0);
    expect(heatWindow(spec, 1)).toEqual({ from: 0, to: a });
    expect(heatWindow(spec, -1)).toEqual({ from: 1 - a, to: 1 });
    expect(meltProgress(0)).toBe(0);
    expect(meltProgress(a)).toBe(1);
  });

  it('unclip / lift / peel : bascule pendant le mouvement', () => {
    for (const kind of ['unclip', 'lift', 'peel'] as const) {
      const max = Math.max(...samples(specFor(kind)).map((s) => Math.abs(s.tilt)));
      expect(max, kind).toBeGreaterThan(0.05);
    }
  });
});

describe('mouvements — remontage', () => {
  for (const kind of KINDS.filter((k) => k !== 'magneticPull')) {
    it(`${kind} : le remontage parcourt le retrait à l'envers`, () => {
      const spec = specFor(kind);
      for (const u of [0, 0.13, 0.5, 0.77, 1]) {
        const back = sampleMotion(spec, u, -1);
        const fwd = sampleRemoval(spec, 1 - u, createMotionSample());
        expect(back.offset).toBeCloseTo(fwd.offset, 12);
        expect(back.spin).toBeCloseTo(fwd.spin, 12);
      }
    });
  }

  it('magneticPull : aspiration puis claquement au contact (course décroissante, contact final)', () => {
    const spec = specFor('magneticPull');
    const list = samples(spec, -1);
    expect(list[0]!.offset).toBeCloseTo(spec.distance, 9);
    const { b } = motionTiming(spec, -1);
    const contact = sampleMotion(spec, b, -1);
    expect(contact.offset).toBeCloseTo(0, 9);
    expect(list[N]!.offset).toBeCloseTo(0, 9);
    // Avant le contact, la course ne fait que diminuer.
    for (let i = 1; i < list.length && i / N <= b; i++)
      expect(list[i]!.offset).toBeLessThanOrEqual(list[i - 1]!.offset + 1e-12);
    // Vitesse d'aspiration finale supérieure à la vitesse d'approche.
    const { a } = motionTiming(spec, -1);
    const approachSpeed = (spec.distance - sampleMotion(spec, a, -1).offset) / a;
    const suctionSpeed = sampleMotion(spec, a, -1).offset / (b - a);
    expect(suctionSpeed).toBeGreaterThan(approachSpeed);
    expect(motionCues(spec, -1)).toEqual([{ at: b, sound: 'magnet.clack' }]);
    expect(motionCues(spec, 1).map((c) => c.sound)).toEqual(['magnet.release']);
  });
});

describe('mouvements — utilitaires', () => {
  it('quarts de tour', () => {
    expect(quarterTurnIndex(0)).toBe(0);
    expect(quarterTurnIndex(Math.PI / 2)).toBe(1);
    expect(quarterTurnIndex(2 * Math.PI)).toBe(4);
    expect(quarterTurnIndex(-Math.PI)).toBe(2);
  });

  it('instances décalées dans le temps', () => {
    expect(staggeredDuration(1, 4, 0.2)).toBeCloseTo(1.6, 12);
    expect(staggeredDuration(1, 1, 0.5)).toBe(1);
    expect(instanceProgress(0.1, 1, 0, 0.2)).toBeCloseTo(0.1, 12);
    expect(instanceProgress(0.1, 1, 1, 0.2)).toBe(0);
    expect(instanceProgress(0.7, 1, 3, 0.2)).toBeCloseTo(0.1, 12);
    expect(instanceProgress(1.6, 1, 3, 0.2)).toBe(1);
  });

  it('chaque repère sonore est dans [0, 1]', () => {
    for (const kind of KINDS)
      for (const dir of [1, -1] as const)
        for (const cue of motionCues(specFor(kind), dir)) {
          expect(cue.at).toBeGreaterThanOrEqual(0);
          expect(cue.at).toBeLessThanOrEqual(1);
        }
  });
});
