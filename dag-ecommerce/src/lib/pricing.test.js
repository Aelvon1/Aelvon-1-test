import { describe, expect, it } from 'vitest';
import {
  ATELIER_BASE_PRICE,
  FREE_SHIPPING_THRESHOLD,
  MONOGRAM_PRICE,
  SHIPPING_COST,
  atelierPrice,
  catalogPrice,
  remainingForFreeShipping,
  roundMoney,
  sanitizeMonogram,
  shippingFor,
} from './pricing';

describe('sanitizeMonogram', () => {
  it('met en capitales, retire accents et symboles, limite à 3 caractères', () => {
    expect(sanitizeMonogram('a.d')).toBe('AD');
    expect(sanitizeMonogram('éàç')).toBe('EAC');
    expect(sanitizeMonogram('jean-paul')).toBe('JEA');
    expect(sanitizeMonogram('  x 7 ')).toBe('X7');
  });

  it('tolère les valeurs vides ou absentes', () => {
    expect(sanitizeMonogram('')).toBe('');
    expect(sanitizeMonogram(null)).toBe('');
    expect(sanitizeMonogram(undefined)).toBe('');
    expect(sanitizeMonogram('!?')).toBe('');
  });
});

describe('shippingFor', () => {
  it('est nul pour un panier vide', () => {
    expect(shippingFor(0)).toBe(0);
    expect(shippingFor(-5)).toBe(0);
    expect(shippingFor(NaN)).toBe(0);
  });

  it('facture le port sous le seuil et l’offre à partir du seuil', () => {
    expect(shippingFor(FREE_SHIPPING_THRESHOLD - 0.01)).toBe(SHIPPING_COST);
    expect(shippingFor(FREE_SHIPPING_THRESHOLD)).toBe(0);
    expect(shippingFor(250)).toBe(0);
  });
});

describe('remainingForFreeShipping', () => {
  it('donne le reste à atteindre, jamais négatif', () => {
    expect(remainingForFreeShipping(85)).toBe(15);
    expect(remainingForFreeShipping(100)).toBe(0);
    expect(remainingForFreeShipping(340)).toBe(0);
    expect(remainingForFreeShipping(undefined)).toBe(FREE_SHIPPING_THRESHOLD);
  });
});

describe('prix', () => {
  const product = { price: 89 };

  it('ajoute le monogramme au prix catalogue uniquement s’il est valide', () => {
    expect(catalogPrice(product)).toBe(89);
    expect(catalogPrice(product, { monogram: 'AD' })).toBe(89 + MONOGRAM_PRICE);
    expect(catalogPrice(product, { monogram: '--' })).toBe(89);
  });

  it('calcule le prix sur-mesure : base, supplément de boucle, monogramme', () => {
    expect(atelierPrice({ buckle: 'brosse' })).toBe(ATELIER_BASE_PRICE);
    expect(atelierPrice({ buckle: 'laiton' })).toBe(ATELIER_BASE_PRICE + 15);
    expect(atelierPrice({ buckle: 'laiton', monogram: 'DAG' })).toBe(ATELIER_BASE_PRICE + 15 + MONOGRAM_PRICE);
    expect(atelierPrice({ buckle: 'inconnue' })).toBe(ATELIER_BASE_PRICE);
    expect(atelierPrice()).toBe(ATELIER_BASE_PRICE);
  });

  it('arrondit au centime sans dérive flottante', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(85 + 7.9)).toBe(92.9);
    expect(roundMoney('abc')).toBe(0);
  });
});
