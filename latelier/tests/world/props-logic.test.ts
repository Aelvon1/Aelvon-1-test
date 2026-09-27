/**
 * Tests de la logique pure des accessoires : afficheurs 7 segments, régime du ventilateur,
 * lectures des appareils, atlas des décalques, contours des outils et disposition du panneau
 * perforé, emplacements sur l'établi (tapis dégagé).
 */
import { describe, expect, it } from 'vitest';
import { formatDisplay, formatText, GLYPHS, segmentOn, SEGMENT_BITS } from '../../src/world/props/sevenSeg';
import { blink, FanSpin, heaterLed, hotAirTemperature, multimeterReading, psuReadings } from '../../src/world/props/live';
import { ATLAS_SIZE, atlasDrawParams, atlasLayout, atlasRect, atlasUV } from '../../src/world/props/atlas';
import { dialPositionPO, RADIO_STATION, regionDefs } from '../../src/world/props/atlas/regions';
import { pliersOutline, wrenchOutline, type P2 } from '../../src/world/props/pegboard/outlines';
import { PEG_LAYOUT, silhouetteSpecs, WRENCH_SIZES } from '../../src/world/props/pegboard/toolLayout';
import { BENCH_ITEMS, MAT_CLEAR_ZONE, PEG } from '../../src/world/props/dims';
import { BENCH, PEGBOARD } from '../../src/world/layout';

/** Aire signée (> 0 : sens trigonométrique). */
function signedArea(points: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

describe('afficheurs 7 segments', () => {
  it('code les chiffres selon la convention a..g', () => {
    expect(GLYPHS['8']).toBe(127);
    expect(segmentOn(GLYPHS['1']!, SEGMENT_BITS.b)).toBe(true);
    expect(segmentOn(GLYPHS['1']!, SEGMENT_BITS.a)).toBe(false);
    expect(segmentOn(GLYPHS['7']!, SEGMENT_BITS.a)).toBe(true);
  });

  it('formate une valeur alignée à droite avec point décimal', () => {
    const v = formatDisplay(12, 3, 1);
    expect(v.codes).toEqual([GLYPHS['1'], GLYPHS['2'], GLYPHS['0']]);
    expect(v.dp).toBe(1);
    const a = formatDisplay(0.35, 3, 2);
    expect(a.codes).toEqual([GLYPHS['0'], GLYPHS['3'], GLYPHS['5']]);
    expect(a.dp).toBe(0);
    const t = formatDisplay(350, 3, 0);
    expect(t.codes).toEqual([GLYPHS['3'], GLYPHS['5'], GLYPHS['0']]);
    expect(t.dp).toBe(-1);
    expect(formatDisplay(7, 4, 0).codes).toEqual([0, 0, 0, GLYPHS['7']]);
  });

  it('signale les dépassements et les valeurs négatives', () => {
    expect(formatDisplay(1234, 3, 0).codes).toEqual([64, 64, 64]);
    expect(formatDisplay(-1.5, 4, 1).codes).toEqual([0, GLYPHS['-'], GLYPHS['1'], GLYPHS['5']]);
    expect(formatText('Err', 3).codes).toEqual([GLYPHS['E'], GLYPHS['r'], GLYPHS['r']]);
  });
});

describe('ventilateur', () => {
  it('monte en régime en ~2,5 s puis ralentit en roue libre', () => {
    const fan = new FanSpin();
    fan.on = true;
    for (let i = 0; i < 60; i++) fan.update(1 / 60);
    expect(fan.speed).toBeGreaterThan(0.6);
    expect(fan.speed).toBeLessThan(0.9);
    for (let i = 0; i < 90; i++) fan.update(1 / 60);
    expect(fan.speed).toBeGreaterThan(0.94);
    fan.on = false;
    for (let i = 0; i < 60; i++) fan.update(1 / 60);
    expect(fan.speed).toBeGreaterThan(0.2);
    for (let i = 0; i < 600; i++) fan.update(1 / 60);
    expect(fan.speed).toBe(0);
  });

  it('garde un angle borné et une rotation visuelle sous le seuil stroboscopique', () => {
    const fan = new FanSpin();
    fan.on = true;
    let previous = fan.angle;
    let maxStep = 0;
    for (let i = 0; i < 600; i++) {
      fan.update(1 / 60);
      const step = (fan.angle - previous + Math.PI * 2) % (Math.PI * 2);
      maxStep = Math.max(maxStep, step);
      previous = fan.angle;
      expect(fan.angle).toBeGreaterThanOrEqual(0);
      expect(fan.angle).toBeLessThan(Math.PI * 2);
    }
    // Trois pales : le pas angulaire par image doit rester < 60° (sinon rotation apparente inversée).
    expect(maxStep).toBeLessThan(Math.PI / 3);
    expect(fan.blur).toBeGreaterThan(0.5);
  });
});

describe('appareils de mesure', () => {
  it('produit des lectures stables avec une gigue du dernier chiffre', () => {
    const amps = new Set<number>();
    for (let t = 0; t < 30; t += 0.1) {
      const r = psuReadings(t);
      expect(r.volts).toBe(12);
      expect(r.amps).toBeGreaterThanOrEqual(0.339);
      expect(r.amps).toBeLessThanOrEqual(0.361);
      amps.add(Math.round(r.amps * 100));
      const m = multimeterReading(t);
      expect(Math.abs(m - 12.03)).toBeLessThanOrEqual(0.0101);
      expect(Math.abs(hotAirTemperature(t) - 350)).toBeLessThanOrEqual(1);
    }
    expect(amps.size).toBeGreaterThan(1);
    expect(psuReadings(4.2)).toEqual(psuReadings(4.2));
  });

  it('fait clignoter les voyants de façon déterministe', () => {
    expect(blink(0.1, 1)).toBe(1);
    expect(blink(0.6, 1)).toBe(0);
    let on = 0;
    for (let t = 0; t < 60; t += 0.05) on += heaterLed(t);
    const duty = on / 1200;
    expect(duty).toBeGreaterThan(0.1);
    expect(duty).toBeLessThan(0.6);
  });
});

describe('atlas des décalques', () => {
  it('empaquette toutes les régions sans chevauchement dans 2048 × 2048', () => {
    const layout = atlasLayout();
    const rects = [...layout.rects.entries()];
    expect(rects.length).toBe(regionDefs().length);
    expect(layout.usedHeight).toBeLessThanOrEqual(ATLAS_SIZE);
    for (const [, r] of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(ATLAS_SIZE);
      expect(r.y + r.h).toBeLessThanOrEqual(ATLAS_SIZE);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]![1];
        const b = rects[j]![1];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${rects[i]![0]} / ${rects[j]![0]}`).toBe(false);
      }
    }
  });

  it('oriente les UV (haut de région = petit v) et produit une liste de dessin sérialisable', () => {
    const r = atlasRect('psu');
    const [u0, vTop] = atlasUV(r, 0, 1);
    const [u1, vBottom] = atlasUV(r, 1, 0);
    expect(u0).toBeCloseTo(r.x / ATLAS_SIZE);
    expect(u1).toBeCloseTo((r.x + r.w) / ATLAS_SIZE);
    expect(vTop).toBeLessThan(vBottom);
    const params = atlasDrawParams();
    expect(() => JSON.stringify(params)).not.toThrow();
    expect(params.ops.length).toBeGreaterThan(500);
    expect(() => atlasRect('inconnue')).toThrow();
  });

  it('place la station favorite sur le cadran PO', () => {
    const u = dialPositionPO(RADIO_STATION.khz);
    expect(u).toBeGreaterThan(0.1);
    expect(u).toBeLessThan(0.95);
    expect(RADIO_STATION.label).toMatch(/Radio/);
  });
});

describe('outils du panneau perforé', () => {
  it('produit des contours fermés, orientés, aux proportions réalistes', () => {
    for (const size of WRENCH_SIZES) {
      const o = wrenchOutline(size);
      expect(signedArea(o.outer)).toBeGreaterThan(0);
      expect(signedArea(o.holes[0]!)).toBeLessThan(0);
      const ys = o.outer.map((p) => p[1]);
      const length = Math.max(...ys) - Math.min(...ys);
      expect(length).toBeGreaterThan(0.1);
      expect(length).toBeLessThan(0.3);
    }
    for (const kind of ['cutter', 'flat', 'circlip'] as const) {
      const p = pliersOutline(kind);
      expect(signedArea(p.outer)).toBeGreaterThan(0);
      const ys = p.outer.map((q) => q[1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.14);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.22);
    }
  });

  it('accroche outils et silhouettes à l’intérieur du panneau', () => {
    for (const spec of silhouetteSpecs()) {
      const [cx, cy] = spec.center;
      const [w, h] = spec.size;
      expect(cx - w / 2, spec.region).toBeGreaterThanOrEqual(PEGBOARD.x[0] - 1e-3);
      expect(cx + w / 2, spec.region).toBeLessThanOrEqual(PEGBOARD.x[1] + 1e-3);
      expect(cy - h / 2, spec.region).toBeGreaterThanOrEqual(PEGBOARD.y[0] - 1e-3);
      expect(cy + h / 2, spec.region).toBeLessThanOrEqual(PEGBOARD.y[1] + 1e-3);
    }
    const indices = [
      ...PEG_LAYOUT.hacksaw.i,
      ...PEG_LAYOUT.mallet.i,
      ...PEG_LAYOUT.screwdriverRack.i,
      ...PEG_LAYOUT.allenRack.i,
      ...PEG_LAYOUT.precisionRack.i,
      ...PEG_LAYOUT.pliers.i,
      PEG_LAYOUT.wrenches.i0 + 7 * PEG_LAYOUT.wrenches.step,
    ];
    for (const i of indices) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(PEG.cols);
    }
  });

  it('ne fait pas se chevaucher les silhouettes', () => {
    const specs = silhouetteSpecs();
    for (let i = 0; i < specs.length; i++) {
      for (let j = i + 1; j < specs.length; j++) {
        const a = specs[i]!;
        const b = specs[j]!;
        const ox = Math.abs(a.center[0] - b.center[0]) < (a.size[0] + b.size[0]) / 2 - 0.004;
        const oy = Math.abs(a.center[1] - b.center[1]) < (a.size[1] + b.size[1]) / 2 - 0.004;
        expect(ox && oy, `${a.region} / ${b.region}`).toBe(false);
      }
    }
  });
});

describe('établi', () => {
  it('laisse le tapis dégagé et garde les appareils sur le plateau', () => {
    for (const [name, item] of Object.entries(BENCH_ITEMS)) {
      const r = Math.hypot(item.size[0], item.size[2]) / 2;
      const [x, z] = item.center;
      // Emprise (cercle circonscrit) hors du tapis, sauf les brucelles posées au bord.
      const dx = Math.max(MAT_CLEAR_ZONE.x[0] - x, 0, x - MAT_CLEAR_ZONE.x[1]);
      const dz = Math.max(MAT_CLEAR_ZONE.z[0] - z, 0, z - MAT_CLEAR_ZONE.z[1]);
      const inside = Math.hypot(dx, dz);
      expect(inside, name).toBeGreaterThan(name === 'tweezers' ? 0.01 : Math.min(r, 0.02));
      if (name !== 'vise') {
        expect(x - item.size[0] / 2, name).toBeGreaterThan(BENCH.x[0]);
        expect(x + item.size[0] / 2, name).toBeLessThan(BENCH.x[1]);
        expect(z - item.size[2] / 2, name).toBeGreaterThan(BENCH.z[0]);
        expect(z + item.size[2] / 2, name).toBeLessThan(BENCH.z[1]);
      }
    }
  });
});
