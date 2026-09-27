/**
 * Tests de la validation des définitions d'objets.
 */
import { describe, expect, it } from 'vitest';
import { findCycle, validateObject, validateObjectAllPresets } from '../src/objects/validate';
import type { ObjectDef } from '../src/objects/types';
import { miniObject, miniParts, type MiniParams } from './fixtures/miniObject';

describe('validateObject', () => {
  it('accepte l’objet de test pour tous ses préréglages', () => {
    for (const report of validateObjectAllPresets(miniObject)) expect(report.errors).toEqual([]);
  });

  it('signale identifiants dupliqués, parents et dépendances inexistants', () => {
    const broken: ObjectDef<MiniParams> = {
      ...miniObject,
      parts: [
        ...miniParts,
        { ...miniParts[1]!, id: 'lid' },
        { ...miniParts[2]!, id: 'orphan', parent: 'nowhere' },
        { ...miniParts[2]!, id: 'dangling', removal: { ...miniParts[2]!.removal!, requires: ['ghost'] } },
      ],
    };
    const { errors } = validateObject(broken);
    expect(errors.some((e) => e.includes('dupliqué'))).toBe(true);
    expect(errors.some((e) => e.includes('parent inexistant'))).toBe(true);
    expect(errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('signale un outil inconnu quand le catalogue est fourni', () => {
    const { errors } = validateObject(miniObject, undefined, new Set(['screwdriver']));
    expect(errors.some((e) => e.includes('outil inconnu « iron »'))).toBe(true);
  });

  it('signale une fiche incomplète et un axe nul', () => {
    const bad: ObjectDef<MiniParams> = {
      ...miniObject,
      parts: [
        ...miniParts,
        {
          ...miniParts[2]!,
          id: 'bad',
          info: { role: '', material: 'x', dimensions: 'y' },
          removal: { motion: 'translate', axis: [0, 0, 0], distance: 0.01 },
        },
      ],
    };
    const { errors } = validateObject(bad);
    expect(errors.some((e) => e.includes('fiche incomplète'))).toBe(true);
    expect(errors.some((e) => e.includes('axe de retrait'))).toBe(true);
  });
});

describe('findCycle', () => {
  it('retourne le chemin du cycle', () => {
    const edges: Record<string, string[]> = { a: ['b'], b: ['c'], c: ['a'], d: [] };
    expect(findCycle(['a', 'b', 'c', 'd'], (id) => edges[id] ?? [])).toEqual(['a', 'b', 'c', 'a']);
    expect(findCycle(['d'], () => [])).toBeNull();
  });
});
