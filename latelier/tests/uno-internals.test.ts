/**
 * Tests des intérieurs des composants clés de la carte « uno-board » (niveau 3) :
 * implantation de la puce et de la grille de connexion de l'ATmega328P (isolement entre doigts,
 * fils sans croisement), plan de la puce.
 */
import { describe, expect, it } from 'vitest';
import {
  DIE,
  DIE_BLOCKS,
  DIE_CORE,
  LEADFRAME,
  PIN_NAMES,
  WIRE,
  bondPads,
  bondWires,
  fingers,
  leadframeClearance,
  pinX,
} from '../src/objects/uno-board/internals/dieLayout';

describe('ATmega328P : puce, fils et grille de connexion', () => {
  it('28 doigts, un par broche, arrivant au flanc du boîtier face à leur patte', () => {
    const list = fingers();
    expect(list.map((f) => f.pin)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    for (const f of list) {
      const end = f.path[f.path.length - 1]!;
      expect(end[0], `broche ${f.pin}`).toBeCloseTo(pinX(f.pin), 9);
      expect(Math.abs(end[1])).toBeCloseTo(LEADFRAME.flank, 9);
      expect(Math.sign(end[1])).toBe(f.pin <= 14 ? 1 : -1);
    }
  });

  it('isolement entre doigts, îlot et barrettes ≥ 0,15 mm', () => {
    expect(leadframeClearance()).toBeGreaterThanOrEqual(0.15);
  });

  it('32 plots dont 28 câblés, tous sur la puce', () => {
    const pads = bondPads();
    expect(pads).toHaveLength(32);
    expect(pads.filter((p) => p.pin !== undefined)).toHaveLength(28);
    const half = DIE.size / 2 - DIE.pad / 2;
    for (const p of pads) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(half);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(half);
    }
    // Chaque broche a un nom de fonction.
    for (let pin = 1; pin <= 28; pin++) expect(PIN_NAMES[pin]).toBeTruthy();
  });

  it('fils : portées proches du profil de référence et aucun croisement vu de dessus', () => {
    const wires = bondWires();
    expect(wires).toHaveLength(28);
    for (const w of wires) {
      const k = w.span / WIRE.referenceSpan;
      expect(k, `broche ${w.pin}`).toBeGreaterThan(0.85);
      expect(k, `broche ${w.pin}`).toBeLessThan(1.15);
    }
    const cross = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
      (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
    for (let i = 0; i < wires.length; i++)
      for (let j = i + 1; j < wires.length; j++) {
        const a = wires[i]!;
        const b = wires[j]!;
        const d1 = cross(a.pad, a.stitch, b.pad);
        const d2 = cross(a.pad, a.stitch, b.stitch);
        const d3 = cross(b.pad, b.stitch, a.pad);
        const d4 = cross(b.pad, b.stitch, a.stitch);
        expect(d1 * d2 < 0 && d3 * d4 < 0, `fils ${a.pin} et ${b.pin}`).toBe(false);
      }
  });

  it('plan de la puce : blocs dans le cœur, sans recouvrement', () => {
    for (const b of DIE_BLOCKS) {
      const [x0, z0, x1, z1] = b.rect;
      expect(x0).toBeLessThan(x1);
      expect(z0).toBeLessThan(z1);
      for (const v of b.rect) expect(Math.abs(v)).toBeLessThanOrEqual(DIE_CORE);
    }
    for (let i = 0; i < DIE_BLOCKS.length; i++)
      for (let j = i + 1; j < DIE_BLOCKS.length; j++) {
        const a = DIE_BLOCKS[i]!.rect;
        const b = DIE_BLOCKS[j]!.rect;
        const overlap = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
        expect(overlap, `${DIE_BLOCKS[i]!.label} / ${DIE_BLOCKS[j]!.label}`).toBe(false);
      }
  });
});
