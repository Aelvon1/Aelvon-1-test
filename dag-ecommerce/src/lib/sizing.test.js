import { describe, expect, it } from 'vitest';
import { SIZES } from '../data/atelier';
import { SIZE_ALLOWANCE_CM, inchesToCm, recommendSize, sizeChart } from './sizing';

describe('recommendSize', () => {
  it('applique la règle maison : tour de taille + 15 cm', () => {
    expect(recommendSize(85)).toMatchObject({ size: '100', ideal: 100, exact: true, outOfRange: false });
    expect(recommendSize(70)).toMatchObject({ size: '85', exact: true });
  });

  it('arrondit à la taille la plus proche, et au-dessus en cas d’égalité', () => {
    expect(recommendSize(82).size).toBe('95'); // idéal 97 → 95
    expect(recommendSize(83).size).toBe('100'); // idéal 98 → 100
    expect(recommendSize(82.5).size).toBe('100'); // idéal 97,5 → à égalité, la plus grande
    expect(recommendSize(82).exact).toBe(false);
  });

  it('se limite aux tailles proposées pour le modèle et signale le hors-gamme', () => {
    const dress = ['85', '90', '95', '100', '105'];
    expect(recommendSize(95, dress)).toMatchObject({ size: '105', outOfRange: true }); // idéal 110
    expect(recommendSize(90, dress)).toMatchObject({ size: '105', outOfRange: false });
    expect(recommendSize(62, ['90', '95'])).toMatchObject({ size: '90', outOfRange: true });
  });

  it('refuse les mesures invalides ou invraisemblables', () => {
    expect(recommendSize('abc')).toBeNull();
    expect(recommendSize(20)).toBeNull();
    expect(recommendSize(300)).toBeNull();
    expect(recommendSize(85, [])).toBeNull();
    expect(recommendSize(undefined)).toBeNull();
  });

  it('accepte une mesure saisie sous forme de texte', () => {
    expect(recommendSize('85').size).toBe('100');
  });
});

describe('sizeChart', () => {
  it('couvre toutes les tailles avec une plage de tour de taille cohérente', () => {
    const chart = sizeChart();
    expect(chart.map((row) => row.size)).toEqual(SIZES);
    for (const row of chart) {
      const mid = (row.waistMin + row.waistMax) / 2;
      expect(mid + SIZE_ALLOWANCE_CM).toBe(Number(row.size));
      expect(recommendSize(mid).size).toBe(row.size);
    }
  });

  it('associe les tailles de pantalon françaises', () => {
    const row = sizeChart().find((r) => r.size === '95');
    expect(row.trouserFr).toContain('40');
  });
});

describe('inchesToCm', () => {
  it('convertit les pouces en centimètres entiers', () => {
    expect(inchesToCm(32)).toBe(81);
    expect(inchesToCm('34')).toBe(86);
  });
});
