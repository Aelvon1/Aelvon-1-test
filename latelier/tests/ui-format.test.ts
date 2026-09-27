/**
 * Interface : formatages français (nombres, durées, pluriels, instances, paramètres).
 */
import { describe, expect, it } from 'vitest';
import {
  NARROW_NBSP,
  NBSP,
  decimalsOf,
  difficultyLabel,
  formatCompact,
  formatDecimal,
  formatInstance,
  formatInteger,
  formatMinutes,
  formatParamValue,
  formatPercent,
  formatQuantity,
  plural,
} from '../src/ui/logic/format';
import type { ParamSchema } from '../src/objects/types';

describe('nombres', () => {
  it('groupe les milliers avec une espace fine insécable', () => {
    expect(formatInteger(1234567)).toBe(`1${NARROW_NBSP}234${NARROW_NBSP}567`);
    expect(formatInteger(142)).toBe('142');
  });

  it('écrit les décimales avec une virgule, sans zéros inutiles', () => {
    expect(formatDecimal(3.175, 3)).toBe('3,175');
    expect(formatDecimal(0.5)).toBe('0,5');
    expect(formatDecimal(120, 0)).toBe('120');
    expect(formatDecimal(2.0, 2)).toBe('2');
    expect(formatDecimal(-1.25, 1)).toBe('-1,3');
    expect(formatDecimal(4300, 0)).toBe(`4${NARROW_NBSP}300`);
  });

  it('pourcentages bornés', () => {
    expect(formatPercent(0.456)).toBe(`46${NARROW_NBSP}%`);
    expect(formatPercent(2)).toBe(`100${NARROW_NBSP}%`);
    expect(formatPercent(Number.NaN)).toBe(`0${NARROW_NBSP}%`);
  });

  it('compteurs compacts du debug', () => {
    expect(formatCompact(845)).toBe('845');
    expect(formatCompact(84_500)).toBe(`84,5${NBSP}k`);
    expect(formatCompact(1_234_000)).toBe(`1,23${NBSP}M`);
  });

  it('décimales d’un pas', () => {
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf(10)).toBe(0);
    expect(decimalsOf(1e-7)).toBe(7);
  });
});

describe('textes', () => {
  it('pluriel français (singulier pour 0 et 1)', () => {
    expect(plural(0, 'pièce')).toBe(`0${NBSP}pièce`);
    expect(plural(1, 'pièce')).toBe(`1${NBSP}pièce`);
    expect(plural(142, 'pièce')).toBe(`142${NBSP}pièces`);
    expect(plural(3, 'paramètre modifié', 'paramètres modifiés')).toBe(`3${NBSP}paramètres modifiés`);
  });

  it('durées estimées', () => {
    expect(formatMinutes(8)).toBe(`8${NBSP}min`);
    expect(formatMinutes(60)).toBe(`1${NBSP}h`);
    expect(formatMinutes(90)).toBe(`1${NBSP}h${NBSP}30`);
    expect(formatMinutes(125)).toBe(`2${NBSP}h${NBSP}05`);
    expect(formatMinutes(-4)).toBe(`0${NBSP}min`);
  });

  it('quantités et instances (« Tôle n° 37/142 »)', () => {
    expect(formatQuantity(1)).toBe('');
    expect(formatQuantity(142)).toBe('×142');
    expect(formatInstance('Tôle n° 37', 36, 142)).toBe('Tôle n° 37/142');
    expect(formatInstance('Aimant n° 2 (pôle Sud vers l’extérieur)', 1, 4)).toBe(
      'Aimant n° 2 (pôle Sud vers l’extérieur) (2/4)',
    );
    expect(formatInstance('Membrane avant', 0, 2)).toBe('Membrane avant (1/2)');
    expect(formatInstance('Vis', 0, 1)).toBe('Vis');
  });

  it('difficultés', () => {
    expect(difficultyLabel(1)).toBe('Facile');
    expect(difficultyLabel(4)).toBe('Avancé');
    expect(difficultyLabel(9)).toBe('Expert');
  });
});

describe('valeurs de paramètres', () => {
  const kv: ParamSchema = {
    key: 'kv',
    label: 'KV',
    kind: 'number',
    min: 3000,
    max: 6000,
    step: 100,
    unit: 'tr/min/V',
  };
  const format: ParamSchema = {
    key: 'format',
    label: 'Format',
    kind: 'select',
    options: [{ value: '3650', label: '3650 (Ø 36 × 50 mm)' }],
  };
  const sensors: ParamSchema = { key: 'sensors', label: 'Capteurs', kind: 'boolean' };

  it('affiche unité, libellé d’option et oui/non', () => {
    expect(formatParamValue(kv, 4300)).toBe(`4${NARROW_NBSP}300${NBSP}tr/min/V`);
    expect(formatParamValue(format, '3650')).toBe('3650 (Ø 36 × 50 mm)');
    expect(formatParamValue(format, 'inconnu')).toBe('inconnu');
    expect(formatParamValue(sensors, true)).toBe('Oui');
    expect(formatParamValue(sensors, false)).toBe('Non');
    expect(formatParamValue(sensors, undefined)).toBe('—');
  });
});
