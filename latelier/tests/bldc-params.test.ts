/**
 * Moteur brushless inrunner : calculs purs (cotes dérivées, spires ↔ KV, tôles, variantes).
 */
import { describe, expect, it } from 'vitest';
import def from '../src/objects/bldc-inrunner/index';
import {
  DEFAULT_PARAMS,
  PRESETS,
  chooseStrands,
  deriveDimensions,
  laminationCount,
  normalizeParams,
  roundTurns,
  slotPoleSpec,
  strandLayout,
  turnsForKv,
  type BldcParams,
} from '../src/objects/bldc-inrunner/params';
import { resolveObject, partQuantity } from '../src/objects/resolve';
import { DisassemblyGraph } from '../src/inspection/graph';
import type { ObjectParams } from '../src/objects/types';

const contexts: Partial<BldcParams>[] = [
  {},
  ...PRESETS.map((p) => p.params),
  { format: '3660', slotPole: '9-6', kv: 6000, lamination: '0.2' },
  { format: '2848', slotPole: '12-2', kv: 3000, sensors: true },
];

describe('bldc-inrunner : cotes dérivées', () => {
  it('paquet ajusté à l’alésage du carter, entrefer de 0,3 à 0,5 mm', () => {
    for (const c of contexts) {
      const d = deriveDimensions(c);
      expect(2 * d.stator.Ro).toBeCloseTo(2 * d.boreR, 6);
      const gap = d.stator.Ri - d.rotorR;
      expect(gap).toBeGreaterThanOrEqual(0.3);
      expect(gap).toBeLessThanOrEqual(0.5);
      expect(d.magnetOuterR).toBeLessThan(d.rotorR);
      expect(d.magnetInnerR).toBeGreaterThan(d.shaftR);
      expect(d.stator.Rsb).toBeGreaterThan(d.stator.Ri + d.stator.tipHeight + d.stator.wedgeHeight + 1);
    }
  });

  it('longueur de paquet = carter − flasques − têtes de bobines (≈ 30 mm en 3650, ≈ 40 mm en 3660)', () => {
    const d3650 = deriveDimensions({ format: '3650' });
    const d3660 = deriveDimensions({ format: '3660' });
    expect(d3650.stator.stackLength).toBeCloseTo(30, 0);
    expect(d3660.stator.stackLength).toBeCloseTo(40, 0);
    for (const c of contexts) {
      const d = deriveDimensions(c);
      const f = d.format;
      const clearance = 1 * d.s;
      const expected = f.length - 2 * (f.flangeT + f.webDepth + clearance + d.winding.endTurnHeight);
      expect(d.stator.stackLength).toBeCloseTo(expected, 6);
      // Les têtes de bobines tiennent entre la face du paquet et le voile des flasques.
      expect(d.stator.stackLength / 2 + d.winding.endTurnHeight).toBeLessThan(d.webX);
    }
  });

  it('nombre de tôles = longueur / épaisseur (quantité réelle)', () => {
    expect(laminationCount(30, 0.35)).toBe(86);
    expect(laminationCount(30, 0.2)).toBe(150);
    const thin = deriveDimensions({ lamination: '0.2' });
    const thick = deriveDimensions({ lamination: '0.35' });
    expect(thin.stator.lamCount).toBe(Math.round(thin.stator.stackLength / 0.2));
    expect(thick.stator.lamCount).toBe(Math.round(thick.stator.stackLength / 0.35));
    expect(thin.stator.lamCount * thin.stator.lamPitch).toBeCloseTo(thin.stator.stackLength, 6);
    // La nomenclature déclare la quantité réelle.
    const r = resolveObject(def as never, { lamination: '0.2' } as Partial<ObjectParams>);
    const core = r.parts.find((p) => p.id === 'stator.core')!;
    expect(partQuantity(core, r.params)).toBe(thin.stator.lamCount);
  });

  it('jeux de montage cohérents (vis, capteurs, platine, moteur posé sur ses ailettes)', () => {
    for (const c of contexts) {
      const d = deriveDimensions(c);
      const sc = d.screw;
      // Trous taraudés dans l'épaisseur du tube.
      expect(sc.pcdR - sc.d / 2).toBeGreaterThan(d.boreR + 0.3);
      expect(sc.pcdR + sc.d / 2).toBeLessThan(d.bodyR - 0.3);
      // Têtes de vis sous le bord de la flasque, flasque au-dessus du tapis.
      expect(sc.pcdR + sc.headD / 2).toBeLessThanOrEqual(d.flangeR + 0.3);
      expect(d.flangeR).toBeLessThan(d.axisY);
      expect(d.axisY).toBeLessThanOrEqual(d.canR);
      // Capteurs Hall entre le bossage et l'alésage, platine hors du logement de roulement.
      expect(d.hall.r0).toBeGreaterThan(d.bossR + 0.2);
      expect(d.pcb.rIn).toBeGreaterThan(d.bearing.D / 2);
      expect(d.pcb.rOut + 0.25).toBeLessThan(sc.pcdR - sc.headD / 2 + 0.01);
      // Passages des sorties dans la collerette de centrage.
      for (const h of d.leadHoles) {
        const r = Math.hypot(h.y, h.z);
        expect(r - h.r).toBeGreaterThan(d.spigotInnerR + 0.2);
        expect(r + h.r).toBeLessThan(d.spigotR - 0.2);
      }
      // Pignon : vis sans tête noyée dans le moyeu, contre le méplat.
      const top = Math.sqrt(d.pinion.hubR ** 2 - 1.5 ** 2) - 0.12;
      expect(top - d.pinion.setScrewL).toBeGreaterThan(d.shaftR - d.flat.depth - 0.1);
    }
  });

  it('roulements cohérents (R2-6ZZ en 3650, 685ZZ en 3660, ~7 billes)', () => {
    const d = deriveDimensions({});
    expect(d.bearing.ref).toBe('R2-6ZZ');
    expect(d.bearing.d).toBeCloseTo(3.175, 3);
    expect(d.bearing.ballCount).toBe(7);
    expect(deriveDimensions({ format: '3660' }).bearing.ref).toBe('685ZZ');
    expect(d.bearing.d).toBeCloseTo(d.format.shaftD, 6);
  });
});

describe('bldc-inrunner : bobinage et KV', () => {
  it('étalonnage : ~5 spires en 3650, 4 pôles, 12 encoches, 4300 KV', () => {
    const d = deriveDimensions(DEFAULT_PARAMS);
    expect(d.winding.turnsExact).toBeCloseTo(5, 6);
    expect(d.winding.turns).toBe(5);
  });

  it('KV élevé = moins de spires d’un fil plus gros (section de cuivre par encoche constante)', () => {
    const lo = deriveDimensions({ kv: 3000 });
    const hi = deriveDimensions({ kv: 6000 });
    expect(lo.winding.turnsExact / hi.winding.turnsExact).toBeCloseTo(2, 9);
    expect(lo.winding.turns).toBeGreaterThan(hi.winding.turns);
    expect(hi.winding.conductorArea).toBeGreaterThan(lo.winding.conductorArea * 1.7);
    expect(hi.winding.copperPerSlot).toBeCloseTo(lo.winding.copperPerSlot, 9);
    expect(hi.winding.lineResistance).toBeLessThan(lo.winding.lineResistance);
    for (const kv of [3000, 3550, 4300, 5100, 6000]) {
      const d = deriveDimensions({ kv });
      // Arrondi au demi-tour : KV obtenu à ±10 %.
      expect(Math.abs(d.winding.kvEffective - kv) / kv).toBeLessThan(0.1);
      expect((d.winding.turns * 2) % 1).toBe(0);
    }
  });

  it('spires ∝ 1 / (KV · kw · Ø rotor · longueur · bobines en série)', () => {
    const base = turnsForKv(4000, 1, 14, 30, 2);
    expect(turnsForKv(8000, 1, 14, 30, 2)).toBeCloseTo(base / 2, 9);
    expect(turnsForKv(4000, 1, 28, 30, 2)).toBeCloseTo(base / 2, 9);
    expect(turnsForKv(4000, 1, 14, 60, 2)).toBeCloseTo(base / 2, 9);
    expect(turnsForKv(4000, 0.5, 14, 30, 2)).toBeCloseTo(base * 2, 9);
    expect(turnsForKv(4000, 1, 14, 30, 4)).toBeCloseTo(base / 2, 9);
    expect(roundTurns(3.58)).toBe(3.5);
    expect(roundTurns(0.2)).toBe(1);
  });

  it('choix des brins : section visée, diamètres normalisés', () => {
    const s = chooseStrands(0.7, 0.4);
    expect(s.d).toBe(0.4);
    expect(Math.abs(s.area - 0.7) / 0.7).toBeLessThan(0.15);
    const big = chooseStrands(3, 0.4);
    expect(big.count).toBeLessThanOrEqual(14);
    for (const n of [1, 2, 3, 5, 7, 8, 12]) {
      const pts = strandLayout(n, 0.45);
      expect(pts).toHaveLength(n);
      // Aucun brin ne se chevauche.
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
          expect(Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1])).toBeGreaterThan(0.45 * 0.9);
    }
  });

  it('schémas de bobinage cohérents avec la combinaison encoches/pôles', () => {
    const s124 = slotPoleSpec('12-4');
    expect(s124.coils).toHaveLength(6);
    expect(s124.pitch).toBe(3);
    expect(s124.windingFactor).toBeCloseTo(1, 9);
    expect(s124.coils.filter((c) => c.phase === 0).map((c) => [c.go, c.ret])).toEqual([
      [0, 3],
      [6, 9],
    ]);
    const s122 = slotPoleSpec('12-2');
    expect(s122.pitch).toBe(6);
    expect(s122.windingFactor).toBeCloseTo(0.9659, 3);
    const s96 = slotPoleSpec('9-6');
    expect(s96.kind).toBe('concentrated');
    expect(s96.coils).toHaveLength(9);
    expect(s96.coilsPerPhase).toBe(3);
    expect(s96.windingFactor).toBeCloseTo(Math.sqrt(3) / 2, 9);
    for (const sp of [s124, s122, s96]) {
      // Phases équilibrées, chaque encoche occupée par exactement « layers » côtés de bobine.
      for (const ph of [0, 1, 2])
        expect(sp.coils.filter((c) => c.phase === ph)).toHaveLength(sp.coilsPerPhase);
      const use = new Array<number>(sp.slots).fill(0);
      for (const c of sp.coils) {
        use[c.go]!++;
        use[c.ret]!++;
      }
      expect(use.every((u) => u === sp.layers)).toBe(true);
    }
  });

  it('capteurs Hall à 120° électriques', () => {
    for (const slotPole of ['12-4', '12-2', '9-6'] as const) {
      const d = deriveDimensions({ slotPole });
      const p = d.winding.spec.polePairs;
      const [a, b, c] = d.hall.angles;
      expect(((b! - a!) * p * 180) / Math.PI).toBeCloseTo(120, 6);
      expect(((c! - b!) * p * 180) / Math.PI).toBeCloseTo(120, 6);
    }
  });
});

describe('bldc-inrunner : variantes', () => {
  const partIds = (params: Partial<BldcParams>) =>
    resolveObject(def as never, params as Partial<ObjectParams>).parts.map((p) => p.id);
  const steps = (params: Partial<BldcParams>) => {
    const r = resolveObject(def as never, params as Partial<ObjectParams>);
    return new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id))).steps;
  };

  it('sans capteurs : ni platine, ni câble, ni étapes correspondantes', () => {
    const ids = partIds({ sensors: false });
    expect(ids.some((id) => id.startsWith('sensors'))).toBe(false);
    expect(ids).not.toContain('sensorCable');
    expect(steps({ sensors: false }).map((s) => s.id)).not.toContain('sensor-board');
    expect(steps({}).length).toBe(14);
  });

  it('sorties par fils : trois fils silicone avec bullet et gaine, retirés après dessoudage', () => {
    const ids = partIds({ leads: 'wires' });
    for (const k of ['a', 'b', 'c']) {
      expect(ids).toContain(`lead.${k}`);
      expect(ids).toContain(`lead.${k}.bullet`);
      expect(ids).toContain(`lead.${k}.shrink`);
    }
    expect(partIds({ leads: 'tabs' }).some((id) => id.startsWith('lead.'))).toBe(false);
    const phaseStep = steps({ leads: 'wires' }).find((s) => s.id === 'phases')!;
    expect(phaseStep.layers[0]).toEqual(['leads.joints']);
    expect(phaseStep.layers[1]).toEqual(['lead.a', 'lead.b', 'lead.c']);
  });

  it('nombre d’aimants et de billes selon les paramètres', () => {
    for (const [slotPole, poles] of [
      ['12-4', 4],
      ['12-2', 2],
      ['9-6', 6],
    ] as const) {
      const r = resolveObject(def as never, { slotPole } as Partial<ObjectParams>);
      expect(
        partQuantity(
          r.parts.find((p) => p.id === 'rotor.magnets')!,
          r.params,
        ),
      ).toBe(poles);
    }
  });

  it('paramètres d’URL invalides : repli sur les valeurs par défaut', () => {
    const p = normalizeParams({ format: '9999', kv: 12345, sensors: 'false', lamination: 'x' });
    expect(p.format).toBe('3650');
    expect(p.kv).toBe(6000);
    expect(p.sensors).toBe(false);
    expect(p.lamination).toBe('0.35');
  });
});
