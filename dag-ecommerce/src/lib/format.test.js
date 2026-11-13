import { describe, expect, it } from 'vitest';
import { formatDate, formatPrice } from './format';

/** Date locale à midi : indépendante du fuseau où tournent les tests. */
const day = (year, month, date) => new Date(year, month - 1, date, 12);

describe('formatDate', () => {
  it('écrit la date en toutes lettres', () => {
    expect(formatDate(day(2026, 11, 13))).toBe('13 novembre 2026');
    expect(formatDate(day(2026, 12, 2))).toBe('2 décembre 2026');
  });

  it('écrit « 1er » pour le premier du mois, et lui seul', () => {
    expect(formatDate(day(2026, 12, 1))).toBe('1er décembre 2026');
    expect(formatDate(day(2027, 1, 1))).toBe('1er janvier 2027');
    expect(formatDate(day(2026, 12, 11))).toBe('11 décembre 2026');
    expect(formatDate(day(2026, 12, 21))).toBe('21 décembre 2026');
    expect(formatDate(day(2026, 12, 31))).toBe('31 décembre 2026');
    expect(formatDate(day(2026, 11, 10))).toBe('10 novembre 2026');
  });

  it('accepte une date ISO', () => {
    expect(formatDate(day(2026, 12, 1).toISOString())).toBe('1er décembre 2026');
  });
});

describe('formatPrice', () => {
  it('n’affiche les centimes que lorsqu’il y en a', () => {
    expect(formatPrice(89).replace(/\s/g, ' ')).toBe('89 €');
    expect(formatPrice(7.9).replace(/\s/g, ' ')).toBe('7,90 €');
  });
});
