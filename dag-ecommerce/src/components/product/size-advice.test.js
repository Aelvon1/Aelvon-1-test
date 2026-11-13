import { describe, expect, it } from 'vitest';
import { WAIST_MAX_CM, WAIST_MIN_CM } from '../../lib/sizing';
import { formatCm, parseWaist, sizeAdvice, waistTooLarge } from './size-advice';

const STANDARD = ['85', '90', '95', '100', '105', '110'];
const DRESS = ['85', '90', '95', '100', '105'];

describe('formatCm', () => {
  it('écrit la décimale avec une virgule', () => {
    expect(formatCm(100.5)).toBe('100,5');
    expect(formatCm(77.3 + 15)).toBe('92,3');
    expect(formatCm(77.5)).toBe('77,5');
  });

  it('laisse les longueurs entières telles quelles', () => {
    expect(formatCm(100)).toBe('100');
    expect(formatCm(130)).toBe('130');
  });
});

describe('parseWaist', () => {
  it('accepte la virgule comme le point', () => {
    expect(parseWaist('85,5')).toBe(85.5);
    expect(parseWaist('85.5')).toBe(85.5);
    expect(parseWaist(' 85 ')).toBe(85);
  });

  it('rend NaN pour une saisie vide ou qui n’est pas un nombre', () => {
    expect(parseWaist('')).toBeNaN();
    expect(parseWaist(',')).toBeNaN();
    expect(parseWaist('8,,5')).toBeNaN();
  });
});

describe('waistTooLarge', () => {
  it('ne juge pas une saisie qui peut encore devenir valide', () => {
    // « 85 » et « 105 », touche après touche
    for (const entry of ['', '8', '85', '1', '10', '105', '11', '6', '85,', '85,5']) {
      expect(waistTooLarge(entry), entry).toBe(false);
    }
    expect(waistTooLarge(String(WAIST_MAX_CM))).toBe(false);
  });

  it('signale une saisie déjà au-delà du maximum', () => {
    for (const entry of ['116', '115,5', '120', '850', '1050']) {
      expect(waistTooLarge(entry), entry).toBe(true);
    }
  });
});

describe('sizeAdvice', () => {
  it('conseille une taille du modèle, sans renvoi vers l’Atelier', () => {
    expect(sizeAdvice(85, STANDARD)).toMatchObject({ size: '100', ideal: 100, exact: true, outOfRange: false, atelier: false });
    expect(sizeAdvice(85.5, STANDARD)).toMatchObject({ size: '100', ideal: 100.5, exact: false, outOfRange: false, atelier: false });
  });

  it('renvoie vers l’Atelier quand il réalise la longueur que le modèle n’a pas', () => {
    expect(sizeAdvice(95, DRESS)).toMatchObject({ size: '105', ideal: 110, outOfRange: true, atelier: true });
    expect(sizeAdvice(63, STANDARD)).toMatchObject({ size: '85', outOfRange: true, atelier: true }); // idéal 78 → 80
    expect(sizeAdvice(107, STANDARD)).toMatchObject({ size: '110', outOfRange: true, atelier: true }); // idéal 122 → 120
  });

  it('ne renvoie pas vers l’Atelier pour une longueur qu’il ne réalise pas non plus', () => {
    for (const waist of [WAIST_MIN_CM, 62, 108, WAIST_MAX_CM]) {
      expect(sizeAdvice(waist, STANDARD), String(waist)).toMatchObject({ outOfRange: true, atelier: false });
    }
  });

  it('refuse une mesure hors des repères', () => {
    expect(sizeAdvice(Number.NaN, STANDARD)).toBeNull();
    expect(sizeAdvice(8, STANDARD)).toBeNull();
    expect(sizeAdvice(116, STANDARD)).toBeNull();
  });
});
