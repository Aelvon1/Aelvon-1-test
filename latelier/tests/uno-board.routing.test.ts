import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { computeRouting } from '../src/objects/uno-board/pcb/routing';
import { COMPONENTS } from '../src/objects/uno-board/layout';
import { FOOTPRINTS } from '../src/objects/uno-board/footprints';
import { rectCorners } from '../src/objects/uno-board/pcb/pads';

describe('routage uno-board (brouillon)', () => {
  it('route', { timeout: 300000 }, () => {
    const t0 = performance.now();
    const r = computeRouting();
    const dt = performance.now() - t0;
    console.log('routing ms', dt.toFixed(0), 'traces', r.traces.length, 'vias', r.vias.length, 'failures', JSON.stringify(r.failures));
    const S = 20;
    const H = 53.34;
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${68.58 * S}" height="${H * S}" viewBox="0 0 68.58 53.34"><rect width="68.58" height="53.34" fill="#113"/>`);
    for (const c of COMPONENTS) {
      const pts = rectCorners(c, FOOTPRINTS[c.footprint].courtyard).map((p) => `${p.x},${H - p.y}`).join(' ');
      parts.push(`<polygon points="${pts}" fill="none" stroke="#555" stroke-width="0.05"/>`);
      parts.push(`<text x="${c.x}" y="${H - c.y}" font-size="0.8" fill="#888">${c.ref}</text>`);
    }
    for (const t of r.traces) {
      const pts: string[] = [];
      for (let i = 0; i < t.points.length; i += 2) pts.push(`${t.points[i]},${H - t.points[i + 1]!}`);
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${t.layer === 0 ? '#e33' : '#39f'}" stroke-opacity="0.8" stroke-width="${t.width}" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    for (const p of r.pads) {
      const col = p.net === 'GND' ? '#2a2' : p.net === 'NC' ? '#666' : '#ddd';
      if (p.shape === 'round') parts.push(`<circle cx="${p.x}" cy="${H - p.y}" r="${p.w / 2}" fill="${col}" fill-opacity="0.8"/>`);
      else parts.push(`<rect x="${-p.w / 2}" y="${-p.h / 2}" width="${p.w}" height="${p.h}" fill="${col}" fill-opacity="0.8" transform="translate(${p.x},${H - p.y}) rotate(${(-p.rot * 180) / Math.PI})"/>`);
    }
    for (const v of r.vias) parts.push(`<circle cx="${v.x}" cy="${H - v.y}" r="0.4" fill="${v.net === 'GND' ? '#2a2' : '#fc3'}"/>`);
    parts.push('</svg>');
    writeFileSync('/tmp/claude-0/-home-user-Aelvon-1-test/e1092cbb-f4f7-5a1b-a3b7-53f209fd7bcc/scratchpad/tmp/routing.svg', parts.join('\n'));
    expect(r.traces.length).toBeGreaterThan(0);
  });
});
