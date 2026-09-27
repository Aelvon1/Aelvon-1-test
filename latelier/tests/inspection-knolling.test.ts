/**
 * Tests de la vue rangée (module pur `inspection/knolling`) : orientation à plat, absence de
 * chevauchement, respect des bornes du plateau, zones interdites, transitions décalées.
 */
import { describe, expect, it } from 'vitest';
import {
  AXIAL_ROTATIONS,
  KNOLLING_GAPS,
  chooseFlatOrientation,
  knollingWeight,
  layoutKnolling,
  mat3ToQuaternion,
  slotsOverlap,
  type KnollingItem,
  type KnollingRegion,
  type Rect,
} from '../src/inspection/knolling';
import { BENCH, MAT } from '../src/world/layout';

const mat: Rect = {
  minX: MAT.center[0] - MAT.size[0] / 2,
  maxX: MAT.center[0] + MAT.size[0] / 2,
  minZ: MAT.center[2] - MAT.size[1] / 2,
  maxZ: MAT.center[2] + MAT.size[1] / 2,
};
const bench: Rect = {
  minX: BENCH.x[0] + 0.02,
  maxX: BENCH.x[1] - 0.02,
  minZ: BENCH.z[0] + 0.02,
  maxZ: BENCH.z[1] - 0.02,
};
const region = (extra: Partial<KnollingRegion> = {}): KnollingRegion => ({
  surfaceY: MAT.center[1],
  preferred: mat,
  limit: bench,
  ...extra,
});

/** Générateur pseudo-aléatoire déterministe. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomItems(count: number, seed: number, maxSize = 0.08): KnollingItem[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const flat = chooseFlatOrientation([0.003 + r() * maxSize, 0.002 + r() * maxSize, 0.003 + r() * maxSize]);
    const instanced = r() < 0.3;
    return {
      id: `p${i}`,
      group: `g${Math.floor(i / 5)}`,
      size: flat.extents,
      count: instanced ? 2 + Math.floor(r() * 12) : 1,
      layout: r() < 0.5 ? 'row' : 'stack',
      label: `Pièce ${i}`,
    };
  });
}

const inside = (a: Rect, b: Rect) =>
  a.minX >= b.minX - 1e-9 && a.maxX <= b.maxX + 1e-9 && a.minZ >= b.minZ - 1e-9 && a.maxZ <= b.maxZ + 1e-9;

describe('knolling — orientation à plat', () => {
  it('24 rotations axiales distinctes de déterminant +1', () => {
    expect(AXIAL_ROTATIONS).toHaveLength(24);
    expect(new Set(AXIAL_ROTATIONS.map((m) => m.join(','))).size).toBe(24);
  });

  it('hauteur minimale, plus grande dimension selon X', () => {
    const o = chooseFlatOrientation([0.01, 0.06, 0.03]);
    expect(o.extents[1]).toBeCloseTo(0.01, 12);
    expect(o.extents[0]).toBeCloseTo(0.06, 12);
    expect(o.extents[2]).toBeCloseTo(0.03, 12);
  });

  it("conserve l'orientation d'origine si elle est déjà à plat", () => {
    const o = chooseFlatOrientation([0.08, 0.036, 0.05]);
    expect(o.quaternion.map((v) => Math.abs(v))).toEqual([0, 0, 0, 1]);
  });

  it('quaternions unitaires', () => {
    for (const m of AXIAL_ROTATIONS) {
      const q = mat3ToQuaternion(m);
      expect(Math.hypot(...q)).toBeCloseTo(1, 12);
    }
  });
});

describe('knolling — disposition', () => {
  for (const [count, seed, maxSize] of [
    [6, 1, 0.08],
    [20, 2, 0.08],
    [45, 3, 0.08],
    [80, 4, 0.05],
    [140, 5, 0.03],
  ] as const) {
    it(`${count} pièces : aucun chevauchement, dans le plateau (graine ${seed})`, () => {
      const items = randomItems(count, seed, maxSize);
      const layout = layoutKnolling(items, region());
      expect(layout.fits).toBe(true);
      const slots = [...layout.slots.values()];
      expect(slots).toHaveLength(count);
      for (const s of slots) expect(inside(s.footprint, bench), s.id).toBe(true);
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++)
          expect(slotsOverlap(slots[i]!, slots[j]!), `${slots[i]!.id} × ${slots[j]!.id}`).toBe(false);
    });
  }

  it('peu de pièces : tout tient sur le tapis, bloc centré', () => {
    const items = randomItems(6, 9, 0.04);
    const layout = layoutKnolling(items, region());
    for (const s of layout.slots.values()) expect(inside(s.footprint, mat)).toBe(true);
    const cx = (layout.bounds.minX + layout.bounds.maxX) / 2;
    expect(cx).toBeCloseTo(MAT.center[0], 6);
  });

  it('espacements : ≥ 12 mm entre pièces, ≥ 25 mm entre groupes (rangées)', () => {
    const items: KnollingItem[] = [
      { id: 'a', group: 'A', size: [0.05, 0.01, 0.03], count: 1, layout: 'row', label: 'a' },
      { id: 'b', group: 'A', size: [0.05, 0.01, 0.03], count: 1, layout: 'row', label: 'b' },
      { id: 'c', group: 'B', size: [0.05, 0.01, 0.03], count: 1, layout: 'row', label: 'c' },
    ];
    const layout = layoutKnolling(items, region());
    const a = layout.slots.get('a')!.footprint;
    const b = layout.slots.get('b')!.footprint;
    const c = layout.slots.get('c')!.footprint;
    expect(b.minX - a.maxX).toBeCloseTo(KNOLLING_GAPS.item, 9);
    expect(c.minZ - a.maxZ).toBeCloseTo(KNOLLING_GAPS.group, 9);
  });

  it('instances en rangée compacte ou en pile', () => {
    const items: KnollingItem[] = [
      { id: 'row', group: '', size: [0.01, 0.004, 0.006], count: 5, layout: 'row', label: 'vis' },
      { id: 'stack', group: '', size: [0.03, 0.0005, 0.03], count: 12, layout: 'stack', label: 'tôles' },
    ];
    const layout = layoutKnolling(items, region());
    const row = layout.slots.get('row')!;
    expect(row.instances).toHaveLength(5);
    expect(new Set(row.instances.map((p) => p[1].toFixed(6))).size).toBe(1);
    expect(row.instances[1]![0] - row.instances[0]![0]).toBeCloseTo(0.01 + KNOLLING_GAPS.instance, 9);
    const stack = layout.slots.get('stack')!;
    expect(stack.instances[11]![1] - stack.instances[0]![1]).toBeCloseTo(11 * 0.0005, 9);
    expect(stack.footprint.maxX - stack.footprint.minX).toBeCloseTo(0.03, 9);
  });

  it('évite les zones interdites (emprise de l’objet resté en place)', () => {
    const keep: Rect = {
      minX: MAT.center[0] - 0.06,
      maxX: MAT.center[0] + 0.06,
      minZ: MAT.center[2] - 0.06,
      maxZ: MAT.center[2] + 0.06,
    };
    const items = randomItems(30, 5, 0.05);
    const layout = layoutKnolling(items, region({ keepOut: [keep] }));
    for (const s of layout.slots.values()) {
      const f = s.footprint;
      const hit = f.minX < keep.maxX && f.maxX > keep.minX && f.minZ < keep.maxZ && f.maxZ > keep.minZ;
      expect(hit, s.id).toBe(false);
      expect(inside(f, bench)).toBe(true);
    }
  });

  it('pièce trop grande : repli signalé sans sortir du plateau', () => {
    const items: KnollingItem[] = [
      { id: 'big', group: '', size: [3, 0.1, 0.5], count: 1, layout: 'row', label: 'big' },
    ];
    const layout = layoutKnolling(items, region());
    expect(layout.fits).toBe(false);
    const f = layout.slots.get('big')!.footprint;
    expect(f.minX).toBeGreaterThanOrEqual(bench.minX - 1e-9);
    expect(f.minZ).toBeGreaterThanOrEqual(bench.minZ - 1e-9);
  });

  it('étiquettes devant chaque emplacement', () => {
    const layout = layoutKnolling(randomItems(8, 11), region());
    for (const s of layout.slots.values()) {
      expect(s.labelPosition[2]).toBeGreaterThan(s.footprint.maxZ);
      expect(s.labelPosition[0]).toBeCloseTo((s.footprint.minX + s.footprint.maxX) / 2, 9);
    }
  });
});

describe('knolling — transitions', () => {
  it('départs décalés, durée totale ~1,2 s', () => {
    expect(knollingWeight(0, 0, 10)).toBe(0);
    expect(knollingWeight(0.35, 0, 10)).toBeCloseTo(0.5, 9);
    expect(knollingWeight(0.35, 9, 10)).toBe(0);
    expect(knollingWeight(1.2, 9, 10)).toBe(1);
    expect(knollingWeight(1.2, 0, 1)).toBe(1);
  });
});
