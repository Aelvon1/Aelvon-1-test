import { describe, expect, it } from 'vitest';
import { missingIds, savedProducts } from './wishlist';

describe('savedProducts', () => {
  it('garde l’ordre d’ajout', () => {
    expect(savedProducts([3, 1]).map((product) => product.name)).toEqual(['DAG Texture', 'DAG Essential']);
  });

  it('ne rend chaque modèle qu’une fois', () => {
    expect(savedProducts([3, 1, 1, 3, 1]).map((product) => product.id)).toEqual([3, 1]);
  });

  it('écarte les identifiants qui ne sont plus au catalogue', () => {
    expect(savedProducts([3, 1, 99, 1]).map((product) => product.id)).toEqual([3, 1]);
    expect(savedProducts([99])).toEqual([]);
    expect(savedProducts([])).toEqual([]);
  });
});

describe('missingIds', () => {
  it('rend tout quand la liste est vide', () => {
    expect(missingIds([3, 1], [])).toEqual([3, 1]);
  });

  it('laisse de côté les favoris remis entre-temps', () => {
    expect(missingIds([3, 1], [1])).toEqual([3]);
    expect(missingIds([1], [1])).toEqual([]);
    expect(missingIds([3, 1], [1, 5, 3])).toEqual([]);
  });

  it('ne rend chaque identifiant qu’une fois', () => {
    expect(missingIds([3, 1, 3], [])).toEqual([3, 1]);
  });
});
