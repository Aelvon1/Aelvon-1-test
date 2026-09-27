/**
 * Tests de la vue éclatée par étages (module pur `inspection/explode`).
 */
import { describe, expect, it } from 'vitest';
import {
  composeOffsets,
  computeExplodeStages,
  explodeDirection,
  explodeStageAmount,
  radialDirection,
} from '../src/inspection/explode';
import type { ExplodeSpec } from '../src/objects/types';

const up: ExplodeSpec = { direction: [0, 1, 0], distance: 0.01 };

const parts = [
  { id: 'case', explode: { direction: [0, 0, 0], distance: 0 } as ExplodeSpec },
  { id: 'lid', explode: { direction: [0, 1, 0], distance: 0.03 } as ExplodeSpec },
  { id: 'board', explode: { direction: [0, 2, 0], distance: 0.02 } as ExplodeSpec },
  { id: 'board.chip', parent: 'board', explode: up },
  {
    id: 'board.chip.pin',
    parent: 'board.chip',
    explode: { direction: [1, 0, 0], distance: 0.005 } as ExplodeSpec,
  },
  { id: 'board.cap', parent: 'board', explode: { ...up, stage: 0 } },
];

describe('éclatement — étages', () => {
  it('étage par défaut = profondeur hiérarchique, surchargé par `stage`', () => {
    const { stageOf, stageCount, depthOf } = computeExplodeStages(parts);
    expect(stageOf.get('case')).toBe(0);
    expect(stageOf.get('board')).toBe(0);
    expect(stageOf.get('board.chip')).toBe(1);
    expect(stageOf.get('board.chip.pin')).toBe(2);
    expect(stageOf.get('board.cap')).toBe(0);
    expect(depthOf.get('board.cap')).toBe(1);
    expect(stageCount).toBe(3);
  });

  it("l'étage s se déplace pendant [s/S, (s+1)/S] du taux", () => {
    const S = 3;
    expect(explodeStageAmount(0, 0, S)).toBe(0);
    expect(explodeStageAmount(1 / 3, 0, S)).toBe(1);
    expect(explodeStageAmount(1 / 3, 1, S)).toBe(0);
    expect(explodeStageAmount(0.5, 1, S)).toBeCloseTo(0.5, 12);
    expect(explodeStageAmount(2 / 3, 2, S)).toBe(0);
    expect(explodeStageAmount(1, 2, S)).toBe(1);
    // Easing easeInOutCubic : lent au début de l'étage.
    expect(explodeStageAmount(0.1 / 3, 0, S)).toBeLessThan(0.1);
  });

  it('taux monotone pour chaque étage', () => {
    for (let s = 0; s < 3; s++) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const v = explodeStageAmount(i / 100, s, 3);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

describe('éclatement — composition hiérarchique', () => {
  it('un enfant hérite du décalage de ses ancêtres', () => {
    const off = composeOffsets(parts, 1);
    expect(off.get('case')).toEqual([0, 0, 0]);
    expect(off.get('lid')![1]).toBeCloseTo(0.03, 12);
    expect(off.get('board')![1]).toBeCloseTo(0.02, 12);
    const chip = off.get('board.chip')!;
    expect(chip[1]).toBeCloseTo(0.03, 12);
    const pin = off.get('board.chip.pin')!;
    expect(pin[0]).toBeCloseTo(0.005, 12);
    expect(pin[1]).toBeCloseTo(0.03, 12);
  });

  it('à mi-course, seul le premier étage est écarté (sur 3 étages : 1/3)', () => {
    const off = composeOffsets(parts, 1 / 3);
    expect(off.get('board')![1]).toBeCloseTo(0.02, 12);
    expect(off.get('board.chip')![1]).toBeCloseTo(0.02, 12);
    expect(off.get('board.chip.pin')![0]).toBeCloseTo(0, 12);
    expect(off.get('board.cap')![1]).toBeCloseTo(0.03, 12);
  });

  it('aucun décalage à taux nul', () => {
    for (const v of composeOffsets(parts, 0).values()) expect(v).toEqual([0, 0, 0]);
  });
});

describe('éclatement — directions', () => {
  it('direction normalisée', () => {
    expect(explodeDirection({ direction: [0, 3, 4], distance: 1 }, [0, 0, 0])).toEqual([0, 0.6, 0.8]);
    expect(explodeDirection({ direction: [0, 0, 0], distance: 0 }, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('radiale : perpendiculaire à l’axe, orientée vers la pièce', () => {
    const d = radialDirection([0.01, 0.02, 0.5], [0, 0, 1]);
    expect(d[2]).toBeCloseTo(0, 12);
    expect(d[0]).toBeGreaterThan(0);
    expect(Math.hypot(...d)).toBeCloseTo(1, 12);
    const onAxis = radialDirection([0, 0, 0.3], [0, 0, 1]);
    expect(Math.hypot(...onAxis)).toBeCloseTo(1, 12);
    expect(onAxis[2]).toBeCloseTo(0, 12);
    const r = explodeDirection({ direction: 'radial', distance: 1, radialAxis: [0, 1, 0] }, [0, 5, -2]);
    expect(r).toEqual([0, 0, -1]);
  });
});
