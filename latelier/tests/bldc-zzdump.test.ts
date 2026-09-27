import { it } from 'vitest';
import def from '../src/objects/bldc-inrunner/index';
import { deriveDimensions, PRESETS, type BldcParams } from '../src/objects/bldc-inrunner/params';
import { resolveObject } from '../src/objects/resolve';
import { DisassemblyGraph } from '../src/inspection/graph';
import type { ObjectParams } from '../src/objects/types';

it('dump', () => {
  const ctxs: Partial<BldcParams>[] = [
    {},
    ...PRESETS.map((p) => p.params),
    { kv: 3000 },
    { kv: 6000 },
    { format: '3660', kv: 6000 },
    { format: '2848', slotPole: '9-6', kv: 6000 },
    { format: '2848', slotPole: '12-2', kv: 3000 },
  ];
  for (const c of ctxs) {
    const d = deriveDimensions(c);
    const w = d.winding;
    console.log(
      JSON.stringify(c),
      `turns=${w.turns} exact=${w.turnsExact.toFixed(2)} kvEff=${w.kvEffective.toFixed(0)} strands=${w.strands}x${w.strandD} cond/slot=${w.conductorsPerSlot} area=${w.conductorArea.toFixed(3)} slotArea=${d.stator.slotArea.toFixed(2)} usable=${d.stator.usableSlotArea.toFixed(2)} Rline=${(w.lineResistance * 1000).toFixed(1)}mΩ wire=${w.wirePerPhase.toFixed(0)} stack=${d.stator.stackLength.toFixed(2)} lam=${d.stator.lamCount} Ri=${d.stator.Ri.toFixed(2)} rotorR=${d.rotorR.toFixed(2)} Rsb=${d.stator.Rsb.toFixed(2)} Ro=${d.stator.Ro} tooth=${d.stator.toothWidth.toFixed(2)} yoke=${(d.stator.Ro - d.stator.Rsb).toFixed(2)} magT=${(d.magnetOuterR - d.magnetInnerR).toFixed(2)} magInR=${d.magnetInnerR.toFixed(2)} balls=${d.bearing.ballCount} rpm=${w.noLoadRpm} et=${w.endTurnHeight}`,
    );
    const r = resolveObject(def as never, c as Partial<ObjectParams>);
    const g = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
    console.log(g.steps.map((s) => `${s.index}:${s.id}${s.auto ? '(auto)' : ''}[${s.layers.map((l) => l.join('+')).join(' | ')}]`).join('\n'));
  }
});
