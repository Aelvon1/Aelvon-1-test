/**
 * Tests des générateurs de textures purement calculés (exécutés sous Node) : taille des
 * données, déterminisme (graine), périodicité annoncée (raccord sans couture) et utilitaires de
 * champs. Le générateur `label` (OffscreenCanvas) n'est pas testable sous Node.
 */
import { describe, expect, it } from 'vitest';
import { builtinGenerators } from '../src/textures/generators';
import {
  blurWrap,
  drawLine,
  fbmField,
  flipRowsRGBA,
  normalize,
  packRGBA,
  worleyField,
} from '../src/textures/generators/field';
import { warpOnTop } from '../src/textures/generators/weave';

/**
 * `cellular` : motif à cellules franches (tissage) — le raccord tombe sur une frontière de fil ;
 * on le compare alors à la pire frontière intérieure.
 */
type Case = { name: string; params?: unknown; periodic: 'both' | 'x' | 'none'; cellular?: boolean };

const CASES: Case[] = [
  { name: 'noise', params: { layers: [{ scale: 4 }, { scale: 16 }, { scale: 32, octaves: 2 }, { scale: 2 }] }, periodic: 'both' },
  { name: 'grunge', periodic: 'both' },
  { name: 'scratches', periodic: 'both' },
  { name: 'brushed', periodic: 'both' },
  { name: 'wood', periodic: 'both' },
  { name: 'wood', params: { style: 'plywood' }, periodic: 'both' },
  { name: 'concrete', periodic: 'both' },
  { name: 'rust', periodic: 'both' },
  { name: 'weave', params: { pattern: 'twill', threads: 8 }, periodic: 'both', cellular: true },
  { name: 'weave', params: { pattern: 'satin', threads: 10 }, periodic: 'both', cellular: true },
  { name: 'paint', periodic: 'both' },
  { name: 'cardboard', periodic: 'both' },
  { name: 'raindrops', periodic: 'both' },
  { name: 'forest', periodic: 'x' },
];

const SIZE = 128;

function run(name: string, params: unknown, seed: number, width = SIZE, height = SIZE): Uint8ClampedArray {
  const generator = builtinGenerators[name];
  if (!generator) throw new Error(`générateur absent : ${name}`);
  return generator({ width, height, params: params ?? {}, seed });
}

/**
 * Écart moyen au raccord (colonne W−1 → colonne 0) comparé à l'écart moyen entre colonnes
 * voisines. Une texture périodique a un raccord comparable à l'intérieur.
 */
function seamRatio(data: Uint8ClampedArray, width: number, height: number, axis: 'x' | 'y', channel: number) {
  const at = (x: number, y: number) =>
    axis === 'x' ? data[(y * width + x) * 4 + channel]! : data[(x * width + y) * 4 + channel]!;
  const n = axis === 'x' ? width : height;
  const m = axis === 'x' ? height : width;
  // Écart moyen entre les lignes (ou colonnes) k et k+1, k = n−1 désignant le raccord.
  const lineDiff = (k: number) => {
    let sum = 0;
    for (let j = 0; j < m; j++) sum += Math.abs(at((k + 1) % n, j) - at(k, j));
    return sum / m;
  };
  let inner = 0;
  let worst = 0;
  for (let k = 0; k < n - 1; k++) {
    const d = lineDiff(k);
    inner += d;
    worst = Math.max(worst, d);
  }
  return { seam: lineDiff(n - 1), inner: inner / (n - 1), worst };
}

describe('générateurs de textures procédurales', () => {
  for (const c of CASES) {
    const label = `${c.name}${c.params ? ' ' + JSON.stringify(c.params) : ''}`;
    it(`${label} : taille, déterminisme, sensibilité à la graine`, () => {
      const a = run(c.name, c.params, 42);
      const b = run(c.name, c.params, 42);
      const other = run(c.name, c.params, 43);
      expect(a.length).toBe(SIZE * SIZE * 4);
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
      expect(Buffer.from(a).equals(Buffer.from(other))).toBe(false);
    });
    it(`${label} : dimensions non carrées`, () => {
      expect(run(c.name, c.params, 7, 96, 64).length).toBe(96 * 64 * 4);
    });
    if (c.periodic !== 'none') {
      it(`${label} : raccord périodique (${c.periodic === 'both' ? 'x et y' : 'x'})`, () => {
        const data = run(c.name, c.params, 11);
        const axes: ('x' | 'y')[] = c.periodic === 'both' ? ['x', 'y'] : ['x'];
        for (const axis of axes) {
          for (let channel = 0; channel < 4; channel++) {
            const { seam, inner, worst } = seamRatio(data, SIZE, SIZE, axis, channel);
            const bound = c.cellular ? worst + 1 : inner * 4 + 3;
            expect(seam, `canal ${channel}, axe ${axis}`).toBeLessThanOrEqual(bound);
          }
        }
      });
    }
  }

  it('bruit multicanal : chaque canal couvre [0, 1] (étirement)', () => {
    const data = run('noise', { layers: [{ scale: 4 }, { scale: 8 }] }, 3);
    for (const channel of [0, 1]) {
      let min = 255;
      let max = 0;
      for (let i = channel; i < data.length; i += 4) {
        min = Math.min(min, data[i]!);
        max = Math.max(max, data[i]!);
      }
      expect(min).toBeLessThanOrEqual(1);
      expect(max).toBeGreaterThanOrEqual(254);
    }
    // Canaux non fournis : B = 0, A = 1.
    expect(data[2]).toBe(0);
    expect(data[3]).toBe(255);
  });

  it('le bruit en niveaux de gris historique reste inchangé (contrat)', () => {
    const data = run('noise', { scale: 4, octaves: 2 }, 5, 16, 16);
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
    expect(data[3]).toBe(255);
  });

  it('génère une texture 1024² en un temps raisonnable', () => {
    for (const name of ['grunge', 'concrete', 'rust', 'wood', 'paint']) {
      const t0 = performance.now();
      run(name, {}, 1, 1024, 1024);
      const elapsed = performance.now() - t0;
      // Borne large (machines d'intégration lentes) ; cible réelle : quelques centaines de ms.
      expect(elapsed, name).toBeLessThan(4000);
    }
  });
});

describe('utilitaires de champs', () => {
  it('fbmField : valeurs dans [0, 1] et périodiques', () => {
    const f = fbmField(64, 64, { scale: 4, octaves: 4, seed: 9 });
    for (const v of f) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const packed = packRGBA(64, 64, f, f, f);
    const { seam, inner } = seamRatio(packed, 64, 64, 'x', 0);
    expect(seam).toBeLessThanOrEqual(inner * 4 + 3);
  });

  it('worleyField : f1 ≤ f2 et identifiants dans [0, 1)', () => {
    const w = worleyField(32, 32, 4, 1);
    for (let i = 0; i < w.f1.length; i++) {
      expect(w.f1[i]!).toBeLessThanOrEqual(w.f2[i]!);
      expect(w.id[i]!).toBeGreaterThanOrEqual(0);
      expect(w.id[i]!).toBeLessThan(1);
    }
  });

  it('blurWrap conserve la moyenne', () => {
    const f = normalize(fbmField(32, 32, { scale: 4, octaves: 3, seed: 2 }));
    const mean = f.reduce((a, b) => a + b, 0) / f.length;
    blurWrap(f, 32, 32, 4);
    const after = f.reduce((a, b) => a + b, 0) / f.length;
    expect(after).toBeCloseTo(mean, 4);
  });

  it('drawLine traverse le bord (périodicité)', () => {
    const f = new Float32Array(16 * 16);
    drawLine(f, 16, 16, 12, 8, 20, 8, 1, 1);
    expect(f[8 * 16 + 14]).toBeGreaterThan(0.5);
    expect(f[8 * 16 + 2]).toBeGreaterThan(0.5);
  });

  it('flipRowsRGBA retourne l’image verticalement', () => {
    const d = new Uint8ClampedArray([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    flipRowsRGBA(d, 1, 3);
    expect([...d.slice(0, 4)]).toEqual([3, 3, 3, 3]);
    expect([...d.slice(8, 12)]).toEqual([1, 1, 1, 1]);
  });

  it('armures de tissage : toile alternée, sergé en diagonale', () => {
    expect(warpOnTop('plain', 0, 0, 2)).not.toBe(warpOnTop('plain', 1, 0, 2));
    // Sergé 2/2 : le motif se décale d'un fil à chaque rangée.
    for (let i = 0; i < 8; i++) expect(warpOnTop('twill', i, 1, 2)).toBe(warpOnTop('twill', i + 1, 0, 2));
  });
});
