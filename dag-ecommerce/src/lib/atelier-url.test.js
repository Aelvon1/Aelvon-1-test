import { describe, expect, it } from 'vitest';
import { DEFAULT_BELT, HERO_BELT } from '../data/atelier';
import { ATELIER_PARAMS, atelierPath, beltToSearchParams, searchParamsToBelt } from './atelier-url';

describe('beltToSearchParams', () => {
  it('écrit les cinq options de fabrication, sans monogramme ni taille par défaut', () => {
    const params = beltToSearchParams(DEFAULT_BELT);
    expect(params.toString()).toBe('cuir=cognac&finition=lisse&boucle=brosse&couture=ton&largeur=35');
  });

  it('ajoute le monogramme nettoyé, son style et la taille', () => {
    const params = beltToSearchParams({ ...HERO_BELT, monogram: 'd.a-g!' }, '95');
    expect(params.get(ATELIER_PARAMS.monogram)).toBe('DAG');
    expect(params.get(ATELIER_PARAMS.monogramStyle)).toBe('or');
    expect(params.get(ATELIER_PARAMS.size)).toBe('95');
  });

  it('ignore une taille qui n’existe pas', () => {
    expect(beltToSearchParams(DEFAULT_BELT, '93').has(ATELIER_PARAMS.size)).toBe(false);
  });
});

describe('searchParamsToBelt', () => {
  it('retrouve exactement la configuration sérialisée', () => {
    const source = { ...HERO_BELT, leather: 'bordeaux', stitch: 'or', width: 38 };
    const { config, size, hasConfig } = searchParamsToBelt(beltToSearchParams(source, '100'));
    expect(config).toMatchObject({ ...source, lining: null });
    expect(size).toBe('100');
    expect(hasConfig).toBe(true);
  });

  it('accepte une chaîne de requête et convertit la largeur en nombre', () => {
    const { config } = searchParamsToBelt('?largeur=30&cuir=navy');
    expect(config.width).toBe(30);
    expect(config.leather).toBe('navy');
    expect(config.finish).toBe(DEFAULT_BELT.finish);
  });

  it('garde la base pour les valeurs inconnues et le signale', () => {
    const { config, size, hasConfig } = searchParamsToBelt('cuir=licorne&largeur=99&taille=93&autre=1');
    expect(config).toMatchObject({ leather: 'cognac', width: 35 });
    expect(size).toBeNull();
    expect(hasConfig).toBe(false);
  });

  it('part de la base fournie', () => {
    const { config } = searchParamsToBelt('boucle=noir', HERO_BELT);
    expect(config).toMatchObject({ leather: 'cognac', buckle: 'noir', monogram: 'DAG', monogramStyle: 'or' });
  });

  it('nettoie le monogramme et permet de le vider', () => {
    expect(searchParamsToBelt('mono=é!x9z').config.monogram).toBe('EX9');
    expect(searchParamsToBelt('mono=', HERO_BELT).config.monogram).toBe('');
  });
});

describe('atelierPath', () => {
  it('pointe vers l’Atelier nu sans configuration', () => {
    expect(atelierPath()).toBe('/atelier');
  });

  it('porte la configuration dans la requête', () => {
    expect(atelierPath({ leather: 'foret' })).toBe(
      '/atelier?cuir=foret&finition=lisse&boucle=brosse&couture=ton&largeur=35',
    );
  });
});
