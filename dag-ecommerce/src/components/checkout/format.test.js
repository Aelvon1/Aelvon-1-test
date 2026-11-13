import { describe, expect, it } from 'vitest';
import { NBSP, addressLines, countLabel, delayLabel, deliveryWindow, formatDateRange, fullName, tidySubtitle } from './format';

/** Date locale à midi : indépendante du fuseau où tournent les tests. */
const day = (year, month, date) => new Date(year, month - 1, date, 12);
const range = (from, to) => ({ earliest: from, latest: to });

describe('formatDateRange', () => {
  it('ne répète ni le mois ni l’année quand ils sont communs', () => {
    expect(formatDateRange(range(day(2026, 11, 18), day(2026, 11, 20)))).toBe(`du 18 au 20${NBSP}novembre 2026`);
  });

  it('garde les deux mois quand la fenêtre passe un mois', () => {
    expect(formatDateRange(range(day(2026, 11, 27), day(2026, 12, 2)))).toBe(`du 27${NBSP}novembre au 2${NBSP}décembre 2026`);
  });

  it('garde les deux années quand la fenêtre passe l’an', () => {
    expect(formatDateRange(range(day(2026, 12, 30), day(2027, 1, 4)))).toBe(`du 30${NBSP}décembre 2026 au 4${NBSP}janvier 2027`);
  });

  it('écrit « 1er » pour le premier du mois', () => {
    expect(formatDateRange(range(day(2026, 11, 27), day(2026, 12, 1)))).toBe(`du 27${NBSP}novembre au 1er${NBSP}décembre 2026`);
    expect(formatDateRange(range(day(2026, 12, 1), day(2026, 12, 3)))).toBe(`du 1er au 3${NBSP}décembre 2026`);
  });

  it('réduit une fenêtre d’un seul jour à ce jour', () => {
    expect(formatDateRange(range(day(2026, 11, 18), day(2026, 11, 18)))).toBe(`le 18${NBSP}novembre 2026`);
  });

  it('renvoie une chaîne vide sans fenêtre', () => {
    expect(formatDateRange(null)).toBe('');
    expect(formatDateRange(undefined)).toBe('');
  });
});

describe('deliveryWindow et delayLabel', () => {
  it('suit le délai annoncé pour le pays', () => {
    // lundi 9 novembre 2026
    expect(formatDateRange(deliveryWindow(day(2026, 11, 9), 'FR'))).toBe(`du 12 au 16${NBSP}novembre 2026`);
    expect(formatDateRange(deliveryWindow(day(2026, 11, 9), 'BE'))).toBe(`du 16 au 18${NBSP}novembre 2026`);
    expect(deliveryWindow('pas une date', 'FR')).toBeNull();
  });

  it('énonce le délai en jours ouvrés', () => {
    expect(delayLabel('FR')).toBe(`3 à 5${NBSP}jours ouvrés`);
    expect(delayLabel('CH')).toBe(`5 à 7${NBSP}jours ouvrés`);
    expect(delayLabel(undefined)).toBe(`3 à 5${NBSP}jours ouvrés`);
  });
});

describe('libellés', () => {
  it('accorde le nombre d’articles', () => {
    expect(countLabel(1)).toBe(`1${NBSP}article`);
    expect(countLabel(3)).toBe(`3${NBSP}articles`);
  });

  it('ne coupe pas un nombre de son unité', () => {
    expect(tidySubtitle('Cuir cognac lisse · 38 mm · 95 cm')).toBe(`Cuir cognac lisse · 38${NBSP}mm · 95${NBSP}cm`);
    expect(tidySubtitle('Noir · 95 cm · Monogramme AD')).toBe(`Noir · 95${NBSP}cm · Monogramme AD`);
    expect(tidySubtitle(undefined)).toBe('');
  });

  it('compose le nom et l’adresse ligne à ligne', () => {
    const customer = { firstName: 'Camille', lastName: 'Durand', address: '12 rue de Turenne', addressComplement: '', postalCode: '75003', city: 'Paris', country: 'FR' };
    expect(fullName(customer)).toBe('Camille Durand');
    expect(fullName({ firstName: 'Camille' })).toBe('Camille');
    expect(fullName(undefined)).toBe('');
    expect(addressLines(customer)).toEqual(['12 rue de Turenne', '75003 Paris', 'France']);
    expect(addressLines({ ...customer, addressComplement: 'Bâtiment B', country: 'LU', postalCode: '1249', city: 'Luxembourg' })).toEqual([
      '12 rue de Turenne',
      'Bâtiment B',
      '1249 Luxembourg',
      'Luxembourg',
    ]);
    expect(addressLines()).toEqual([]);
  });
});
