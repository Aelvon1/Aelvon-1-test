/**
 * Moteur brushless inrunner : tracé du bobinage et géométrie plane (modules purs).
 */
import { describe, expect, it } from 'vitest';
import { deriveDimensions, PRESETS, slotAngle, type BldcParams } from '../src/objects/bldc-inrunner/params';
import { buildWindingLayout } from '../src/objects/bldc-inrunner/windingLayout';
import {
  laminationInnerContour,
  laminationSlotPolygon,
  packSlot,
} from '../src/objects/bldc-inrunner/lamination';
import { canContour, gearContour } from '../src/objects/bldc-inrunner/sections';
import { roundedPath, signedArea } from '../src/objects/bldc-inrunner/profile2d';
import { isoThreadProfile } from '../src/objects/bldc-inrunner/build/geom';

const contexts: Partial<BldcParams>[] = [{}, ...PRESETS.map((p) => p.params), { kv: 3000 }, { kv: 6000 }];

describe('bldc-inrunner : tracé du bobinage', () => {
  it('fil continu de la languette au point neutre, dans le volume du moteur', () => {
    for (const c of contexts) {
      const d = deriveDimensions(c);
      const L = buildWindingLayout(d, 1);
      expect(L.phases).toHaveLength(3);
      expect(L.packScale).toBeGreaterThan(0.95);
      const maxStep = d.stator.stackLength / 3 + 1.5;
      for (const ph of L.phases) {
        // Départ à l'œillet de la languette de la phase.
        const e = L.eyelets[ph.phase]!;
        expect(Math.hypot(ph.centers[0]! - e[0], ph.centers[1]! - e[1], ph.centers[2]! - e[2])).toBeLessThan(
          1.5,
        );
        for (let i = 1; i < ph.count; i++) {
          const dx = ph.centers[i * 3]! - ph.centers[(i - 1) * 3]!;
          const dy = ph.centers[i * 3 + 1]! - ph.centers[(i - 1) * 3 + 1]!;
          const dz = ph.centers[i * 3 + 2]! - ph.centers[(i - 1) * 3 + 2]!;
          expect(Math.hypot(dx, dy, dz)).toBeLessThan(maxStep);
        }
        // Après la sortie : tout le fil reste entre les voiles des flasques et sous l'alésage du carter.
        for (let i = ph.sleeveEnd + 1; i < ph.count; i++) {
          const x = ph.centers[i * 3]!;
          const r = Math.hypot(ph.centers[i * 3 + 1]!, ph.centers[i * 3 + 2]!);
          expect(Math.abs(x)).toBeLessThan(d.webX + 0.2);
          expect(r + ph.radius[i]!).toBeLessThan(d.stator.Ro + 0.05);
        }
        // Longueur de fil cohérente avec l'estimation analytique (±20 %).
        const len = ph.arc[ph.count - 1]!;
        expect(Math.abs(len - d.winding.wirePerPhase) / d.winding.wirePerPhase).toBeLessThan(0.2);
      }
    }
  });

  it('chaque encoche contient le nombre de conducteurs attendu', () => {
    for (const c of contexts) {
      const d = deriveDimensions(c);
      const L = buildWindingLayout(d, 0);
      const counts = new Array<number>(d.stator.slots).fill(0);
      const half = d.stator.stackLength / 2;
      for (const ph of L.phases) {
        // Un passage d'encoche = un échantillon au milieu du paquet (x ≈ 0) dans un conducteur.
        for (let i = 1; i < ph.count; i++) {
          const x0 = ph.centers[(i - 1) * 3]!;
          const x1 = ph.centers[i * 3]!;
          if (!(Math.sign(x0) !== Math.sign(x1) && Math.abs(x0) < half && Math.abs(x1) < half)) continue;
          const th = Math.atan2(ph.centers[i * 3 + 2]!, ph.centers[i * 3 + 1]!);
          let best = 0;
          let bestD = Infinity;
          for (let k = 0; k < d.stator.slots; k++) {
            const dd = Math.abs(Math.atan2(Math.sin(th - slotAngle(d, k)), Math.cos(th - slotAngle(d, k))));
            if (dd < bestD) {
              bestD = dd;
              best = k;
            }
          }
          counts[best]!++;
        }
      }
      const total = counts.reduce((a, b) => a + b, 0);
      expect(total).toBe(3 * d.winding.spec.coilsPerPhase * Math.round(2 * d.winding.turns));
      expect(Math.max(...counts)).toBeLessThanOrEqual(d.winding.conductorsPerSlot);
    }
  });

  it('brins rangés sans chevauchement dans l’encoche', () => {
    const d = deriveDimensions({});
    const w = d.winding;
    const pack = packSlot(
      { ...d.stator, slot0: 0 },
      d.stator.liner,
      w.turns,
      w.strands,
      w.strandOuterD / 2,
      'full',
    );
    expect(pack.scale).toBe(1);
    const all = pack.clusters.flatMap((c) => c.strands);
    expect(all).toHaveLength(Math.ceil(w.turns) * w.strands);
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        expect(Math.hypot(all[i]!.x - all[j]!.x, all[i]!.y - all[j]!.y)).toBeGreaterThan(
          2 * pack.radius * 0.99,
        );
  });
});

describe('bldc-inrunner : géométrie plane', () => {
  it('tôle : contour intérieur orienté, aire d’encoche positive', () => {
    const d = deriveDimensions({});
    const inner = laminationInnerContour(d.stator, 0.2);
    expect(signedArea(inner)).toBeGreaterThan(0);
    expect(Math.abs(signedArea(laminationSlotPolygon({ ...d.stator, slot0: 0 }, 0.1)))).toBeCloseTo(
      d.stator.slotArea,
      0,
    );
    // Aucun point à l'intérieur de l'alésage ni au-delà du fond d'encoche.
    for (const [a, b] of inner) {
      const r = Math.hypot(a, b);
      expect(r).toBeGreaterThanOrEqual(d.stator.Ri - 1e-6);
      expect(r).toBeLessThanOrEqual(d.stator.Rsb + 1e-6);
    }
  });

  it('carter : le moteur repose sur ses ailettes (point bas à y = −axisY)', () => {
    const d = deriveDimensions({});
    const c = canContour(d.bodyR, d.canR, d.fins.angles, d.fins.width, 0.05);
    const minA = Math.min(...c.map((p) => p[0]));
    expect(-minA).toBeCloseTo(d.axisY, 6);
    // Point bas sur une ailette (au-delà du fût).
    expect(d.axisY).toBeGreaterThan(d.bodyR);
  });

  it('pignon : denture en développante à z dents', () => {
    const z = 18;
    const m = 0.6;
    const pts = gearContour(z, m, 8, 0.05);
    const r = pts.map(([a, b]) => Math.hypot(a, b));
    expect(Math.max(...r)).toBeLessThanOrEqual((z * m) / 2 + m + 1e-6);
    expect(Math.min(...r)).toBeGreaterThanOrEqual((z * m) / 2 - 1.25 * m - 1e-6);
    // Nombre de têtes : passages au-dessus du rayon primitif.
    let crossings = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i]! > (z * m) / 2;
      const b = r[(i + 1) % r.length]! > (z * m) / 2;
      if (!a && b) crossings++;
    }
    expect(crossings).toBe(z);
  });

  it('profil ISO du filet : sommet en 0, fond en 1/2', () => {
    expect(isoThreadProfile(0)).toBeCloseTo(1, 6);
    expect(isoThreadProfile(0.5)).toBeCloseTo(0, 6);
    expect(isoThreadProfile(0.25)).toBeGreaterThan(0.2);
    expect(isoThreadProfile(0.25)).toBeLessThan(0.8);
  });

  it('contour arrondi : congés sans arête vive', () => {
    const pts = roundedPath(
      [
        { p: [0, 0], round: 1 },
        { p: [10, 0], round: 1 },
        { p: [10, 5], round: 1 },
        { p: [0, 5], round: 1 },
      ],
      true,
      0.5,
      6,
    );
    // Angle maximal entre segments consécutifs bien inférieur à 90°.
    let maxTurn = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      const t0 = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const t1 = Math.atan2(c[1] - b[1], c[0] - b[0]);
      maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(t1 - t0), Math.cos(t1 - t0))));
    }
    expect(maxTurn).toBeLessThan(Math.PI / 4);
  });
});
