import { it } from 'vitest';
import { deriveDimensions, PRESETS } from '../src/objects/bldc-inrunner/params';
import { buildWindingLayout } from '../src/objects/bldc-inrunner/windingLayout';
it('probe', () => {
  for (const pr of [...PRESETS]) {
    for (const kv of [3000, 4300, 6000]) {
      const d = deriveDimensions({ ...pr.params, kv });
      const L = buildWindingLayout(d, 2);
      const half = d.stator.stackLength / 2;
      let worst = { out: 0, i: -1, ph: -1, n: 0, seg: '' };
      for (const p of L.phases) for (let i = p.sleeveEnd + 1; i < p.count; i++) {
        const out = Math.abs(p.centers[i*3]!) - half + p.radius[i]!;
        if (out > worst.out) worst = { out, i, ph: p.phase, n: p.count, seg: i >= p.neutralStart ? 'neutral' : i <= p.tailEnd ? 'tail' : 'coil' };
      }
      console.log(pr.id, kv, 'budget', (d.webX - half).toFixed(2), 'worst', worst.out.toFixed(2), worst.seg, worst.i, '/', worst.n, 'rb', L.bundleRadius.toFixed(2), 'maxH', L.maxHeight.toFixed(2));
    }
  }
});
