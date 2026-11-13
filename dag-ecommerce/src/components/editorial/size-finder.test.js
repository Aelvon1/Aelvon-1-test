import { describe, expect, it } from 'vitest';
import {
  ALL_SIZES,
  COLLECTION_SIZES,
  FINDER_DEFAULTS,
  INCH_MAX,
  INCH_MIN,
  clampMeasure,
  cleanMeasure,
  finderResult,
  parseMeasure,
  sizeAvailability,
  stepMeasure,
} from './size-finder';

const withCm = (cm) => finderResult({ ...FINDER_DEFAULTS, mode: 'cm', cm });

describe('saisie', () => {
  it('lit les décimales à la française', () => {
    expect(parseMeasure('85,5')).toBe(85.5);
    expect(parseMeasure(' 90 ')).toBe(90);
    expect(Number.isNaN(parseMeasure(''))).toBe(true);
  });

  it('nettoie et borne', () => {
    expect(cleanMeasure('8a5 cm')).toBe('85');
    expect(clampMeasure('200', 60, 115)).toBe(115);
    expect(clampMeasure('abc', 60, 115, 85)).toBe(85);
  });

  it('avance d’un cran vers l’entier voisin, même depuis une décimale', () => {
    expect(stepMeasure('85', 1, 60, 115)).toBe(86);
    expect(stepMeasure('85', -1, 60, 115)).toBe(84);
    expect(stepMeasure('85,5', 1, 60, 115)).toBe(86);
    expect(stepMeasure('85,5', -1, 60, 115)).toBe(85);
    expect(stepMeasure('85,4', 1, 60, 115)).toBe(86);
    expect(stepMeasure('85,4', -1, 60, 115)).toBe(85);
  });

  it('borne le pas et part du repli quand la saisie est illisible', () => {
    expect(stepMeasure('115', 1, 60, 115)).toBe(115);
    expect(stepMeasure('60', -1, 60, 115)).toBe(60);
    expect(stepMeasure('200', -1, 60, 115)).toBe(115);
    expect(stepMeasure('', 1, 60, 115, 88)).toBe(88);
  });

  it('garde les pouces dans les repères en centimètres', () => {
    expect(INCH_MIN).toBe(24);
    expect(INCH_MAX).toBe(45);
  });
});

describe('résultat du trouveur', () => {
  it('applique la règle maison : tour de taille + 15 cm', () => {
    expect(withCm('85')).toMatchObject({ status: 'exact', size: '100', ideal: 100, waist: 85 });
  });

  it('arrondit à la taille la plus proche', () => {
    expect(withCm('83')).toMatchObject({ status: 'near', size: '100', ideal: 98 });
    expect(withCm('87')).toMatchObject({ status: 'near', size: '100', ideal: 102 });
  });

  it('entre deux tailles, conseille la plus grande', () => {
    expect(withCm('87,5')).toMatchObject({ status: 'near', size: '105', ideal: 102.5 });
  });

  it('reste vide tant que rien n’est saisi', () => {
    expect(withCm('')).toMatchObject({ status: 'empty', size: null });
  });

  it('attend la fin de la saisie avant de signaler quoi que ce soit', () => {
    expect(withCm('8')).toMatchObject({ status: 'empty' });
    expect(withCm('10')).toMatchObject({ status: 'empty' });
    expect(withCm('11')).toMatchObject({ status: 'empty' });
    expect(withCm('12')).toMatchObject({ status: 'invalid' });
    expect(finderResult({ ...FINDER_DEFAULTS, mode: 'pouces', inches: '3' })).toMatchObject({ status: 'empty' });
    expect(finderResult({ ...FINDER_DEFAULTS, mode: 'pouces', inches: '5' })).toMatchObject({ status: 'invalid' });
  });

  it('ne retient aucune mesure d’une saisie encore incomplète', () => {
    // « 3 » sur le chemin de « 34 » : rien à convertir, rien à afficher
    expect(finderResult({ ...FINDER_DEFAULTS, mode: 'pouces', inches: '3' })).toMatchObject({ status: 'empty', waist: null, entered: null });
    expect(withCm('8')).toMatchObject({ status: 'empty', waist: null, entered: null });
    expect(withCm('')).toMatchObject({ status: 'empty', waist: null, entered: null });
  });

  it('signale une mesure hors des repères, sans taille', () => {
    expect(withCm('40')).toMatchObject({ status: 'invalid', size: null });
    expect(withCm('150')).toMatchObject({ status: 'invalid', size: null });
    expect(withCm('abc')).toMatchObject({ status: 'invalid' });
  });

  it('propose la taille la plus proche quand la longueur idéale sort de la gamme', () => {
    expect(withCm('112')).toMatchObject({ status: 'out', size: '120', direction: 'short' });
    expect(withCm('61')).toMatchObject({ status: 'out', size: '80', direction: 'long' });
  });

  it('convertit une taille de pantalon française', () => {
    expect(finderResult({ ...FINDER_DEFAULTS, mode: 'pantalon', trouser: '42' })).toMatchObject({ status: 'near', waist: 84, size: '100' });
    expect(finderResult({ ...FINDER_DEFAULTS, mode: 'pantalon', trouser: '' })).toMatchObject({ status: 'empty' });
  });

  it('convertit les pouces', () => {
    expect(finderResult({ ...FINDER_DEFAULTS, mode: 'pouces', inches: '33' })).toMatchObject({ status: 'near', waist: 84, size: '100' });
    expect(finderResult({ ...FINDER_DEFAULTS, mode: 'pouces', inches: '80' })).toMatchObject({ status: 'invalid' });
  });
});

describe('disponibilité', () => {
  it('distingue la collection de l’Atelier', () => {
    expect(COLLECTION_SIZES[0]).toBe('85');
    expect(ALL_SIZES).toContain('120');
    expect(sizeAvailability('100').inCollection).toBe(true);
    expect(sizeAvailability('100').missing).toHaveLength(0);
    expect(sizeAvailability('120').inCollection).toBe(false);
    expect(sizeAvailability('110').missing.map((product) => product.slug)).toEqual(['dress']);
  });
});
