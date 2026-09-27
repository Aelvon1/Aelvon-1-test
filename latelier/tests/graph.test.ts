/**
 * Tests du graphe de démontage : dépendances, blocages, ordre A → Z, remontage.
 */
import { describe, expect, it } from 'vitest';
import { DisassemblyGraph } from '../src/inspection/graph';
import { resolveObject } from '../src/objects/resolve';
import type { PartDef } from '../src/objects/types';
import { miniObject } from './fixtures/miniObject';

function graphFor(params?: Record<string, boolean>) {
  const r = resolveObject(miniObject, params);
  return new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
}

describe('DisassemblyGraph — dépendances', () => {
  const g = graphFor();

  it('développe les tags et ajoute la règle implicite du parent retirable', () => {
    expect([...g.requires('board.pcb')].sort()).toEqual(['board', 'board.cap', 'board.chip']);
    expect(g.requires('board.chip')).toEqual(['board']);
    expect(g.dependents('lid')).toContain('board');
  });

  it('signale les bloqueurs en démontage libre', () => {
    const removed = new Set<string>();
    const res = g.canRemove('lid', removed);
    expect(res.ok).toBe(false);
    expect(res.blockers).toEqual(['lid.screws']);
    expect(g.canRemove('lid.screws', removed).ok).toBe(true);
    expect(g.canRemove('case', removed).ok).toBe(false);
  });

  it('interdit le remontage hors ordre', () => {
    const removed = new Set(['lid.screws', 'lid']);
    // Les vis ne peuvent pas revenir tant que le couvercle est retiré.
    expect(g.canReinsert('lid.screws', removed)).toMatchObject({ ok: false, blockers: ['lid'] });
    expect(g.canReinsert('lid', removed).ok).toBe(true);
  });
});

describe('DisassemblyGraph — ordre A → Z', () => {
  it('trie topologiquement les étapes et départage par priorité', () => {
    const g = graphFor();
    expect(g.steps.map((s) => s.id)).toEqual(['open', 'battery', 'board', 'desolder', 'auto.board.pcb']);
    expect(g.steps[0]!.layers).toEqual([['lid.screws'], ['lid']]);
  });

  it('ignore les pièces désactivées par les paramètres', () => {
    const g = graphFor({ withBattery: false });
    expect(g.steps.map((s) => s.id)).toEqual(['open', 'board', 'desolder', 'auto.board.pcb']);
    expect(g.requires('board')).toEqual(['lid']);
  });

  it('simule un démontage complet sans blocage', () => {
    const g = graphFor();
    const order = g.simulateFullDisassembly();
    expect(order).toHaveLength(7);
    expect(order.indexOf('lid.screws')).toBeLessThan(order.indexOf('lid'));
    expect(order.at(-1)).toBe('board.pcb');
  });

  it('permet un remontage complet en sens inverse via planPrev', () => {
    const g = graphFor();
    const removed = new Set(g.simulateFullDisassembly());
    let guard = 0;
    for (let plan = g.planPrev(removed); plan; plan = g.planPrev(removed)) {
      for (const layer of plan.layers) {
        for (const id of layer) expect(g.canReinsert(id, removed)).toMatchObject({ ok: true });
        for (const id of layer) removed.delete(id);
      }
      if (++guard > 50) throw new Error('boucle infinie');
    }
    expect(removed.size).toBe(0);
    expect(g.cursor(removed)).toBe(0);
  });

  it('reprend le pas à pas après un démontage libre partiel', () => {
    const g = graphFor();
    const removed = new Set(['lid.screws']);
    expect(g.stepStatus(0, removed)).toBe('partial');
    expect(g.planNext(removed)).toEqual({ stepIndex: 0, layers: [['lid']] });
  });
});

describe('DisassemblyGraph — erreurs', () => {
  const info = { role: 'r', material: 'm', dimensions: 'd' };
  const part = (id: string, requires: string[] = []): PartDef => ({
    id,
    name: id,
    info,
    explode: { direction: [0, 1, 0], distance: 0 },
    removal: { requires, motion: 'translate', axis: [0, 1, 0], distance: 0.01 },
  });

  it('détecte un cycle entre étapes', () => {
    expect(() => new DisassemblyGraph([part('a', ['b']), part('b', ['a'])], [])).toThrow(/Cycle/);
  });

  it('refuse une référence inconnue', () => {
    expect(() => new DisassemblyGraph([part('a', ['zz'])], [])).toThrow(/inconnue/);
  });

  it('refuse une pièce présente dans deux étapes', () => {
    const steps = [
      { id: 's1', title: 't', description: 'd', parts: ['a'] },
      { id: 's2', title: 't', description: 'd', parts: ['a'] },
    ];
    expect(() => new DisassemblyGraph([part('a')], steps)).toThrow(/deux étapes/);
  });
});
