import { describe, expect, it } from 'vitest';
import { products } from '../data/products';
import {
  CART_STORAGE_KEY,
  addItem,
  cartCount,
  cartSubtotal,
  cartTotals,
  clampQuantity,
  createAtelierItem,
  createCatalogItem,
  loadCart,
  removeItem,
  sanitizeCart,
  saveCart,
  setQuantity,
} from './cart';
import { ATELIER_BASE_PRICE, MAX_QUANTITY, MONOGRAM_PRICE, SHIPPING_COST } from './pricing';

const essential = products.find((p) => p.slug === 'essential');
const everyday = products.find((p) => p.slug === 'everyday');
const [noir, marron] = essential.colors;

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    data,
  };
};

describe('createCatalogItem', () => {
  it('décrit la ligne à partir du produit, du coloris et de la taille', () => {
    const item = createCatalogItem(essential, noir, '95');
    expect(item).toMatchObject({
      productId: essential.id,
      slug: 'essential',
      name: 'DAG Essential',
      price: 89,
      quantity: 1,
      selectedSize: '95',
      monogram: '',
      custom: false,
    });
    expect(item.selectedColor).toEqual({ name: 'Noir', value: 'noir', hex: noir.hex });
    expect(item.subtitle).toBe('Noir · 95 cm');
    expect(item.image).toContain('renders/essential-noir-studio.webp');
    expect(item.belt.leather).toBe('noir');
  });

  it('intègre le monogramme au prix, au sous-titre, à la clé et à la ceinture', () => {
    const plain = createCatalogItem(essential, noir, '95');
    const engraved = createCatalogItem(essential, noir, '95', { monogram: 'a.d', monogramStyle: 'or' });
    expect(engraved.monogram).toBe('AD');
    expect(engraved.price).toBe(89 + MONOGRAM_PRICE);
    expect(engraved.subtitle).toContain('Monogramme AD');
    expect(engraved.belt).toMatchObject({ monogram: 'AD', monogramStyle: 'or' });
    expect(engraved.cartItemId).not.toBe(plain.cartItemId);
  });

  it('produit la même clé pour la même sélection et des clés distinctes sinon', () => {
    const a = createCatalogItem(essential, noir, '95');
    expect(createCatalogItem(essential, noir, '95').cartItemId).toBe(a.cartItemId);
    expect(createCatalogItem(essential, marron, '95').cartItemId).not.toBe(a.cartItemId);
    expect(createCatalogItem(essential, noir, '100').cartItemId).not.toBe(a.cartItemId);
    expect(createCatalogItem(everyday, everyday.colors[0], '95').cartItemId).not.toBe(a.cartItemId);
  });
});

describe('createAtelierItem', () => {
  it('chiffre et décrit une ceinture sur-mesure', () => {
    const item = createAtelierItem({ leather: 'bordeaux', finish: 'graine', buckle: 'laiton', stitch: 'or', width: 38, monogram: 'dag', monogramStyle: 'or' }, '100');
    expect(item.custom).toBe(true);
    expect(item.productId).toBeNull();
    expect(item.name).toBe('DAG Sur-Mesure');
    expect(item.price).toBe(ATELIER_BASE_PRICE + 15 + MONOGRAM_PRICE);
    expect(item.monogram).toBe('DAG');
    expect(item.selectedColor.name).toBe('Bordeaux');
    expect(item.subtitle).toContain('bordeaux');
    expect(item.subtitle).toContain('100 cm');
    expect(item.image).toBeNull();
  });

  it('distingue deux configurations et reconnaît deux configurations identiques', () => {
    const a = createAtelierItem({ leather: 'noir', buckle: 'poli' }, '90');
    const same = createAtelierItem({ leather: 'noir', buckle: 'poli' }, '90');
    const other = createAtelierItem({ leather: 'noir', buckle: 'noir' }, '90');
    expect(same.cartItemId).toBe(a.cartItemId);
    expect(other.cartItemId).not.toBe(a.cartItemId);
  });

  it('remplace les options inconnues par les valeurs par défaut', () => {
    const item = createAtelierItem({ leather: 'licorne', width: 99 }, '90');
    expect(item.belt.leather).toBe('noir');
    expect(item.belt.width).toBe(35);
  });
});

describe('opérations sur le panier', () => {
  const a = createCatalogItem(essential, noir, '95');
  const b = createCatalogItem(essential, marron, '95');

  it('ajoute une nouvelle ligne sans muter le panier', () => {
    const items = [a];
    const next = addItem(items, b);
    expect(next).toHaveLength(2);
    expect(items).toHaveLength(1);
  });

  it('cumule les quantités d’une ligne identique, dans la limite du plafond', () => {
    let items = addItem([a], createCatalogItem(essential, noir, '95', { quantity: 2 }));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    items = addItem(items, createCatalogItem(essential, noir, '95', { quantity: 50 }));
    expect(items[0].quantity).toBe(MAX_QUANTITY);
  });

  it('fixe une quantité, et retire la ligne sous 1', () => {
    expect(setQuantity([a, b], a.cartItemId, 4)[0].quantity).toBe(4);
    expect(setQuantity([a, b], a.cartItemId, 0)).toEqual([b]);
    expect(setQuantity([a, b], a.cartItemId, 999)[0].quantity).toBe(MAX_QUANTITY);
    expect(setQuantity([a, b], 'inconnu', 3)).toEqual([a, b]);
  });

  it('retire une ligne', () => {
    expect(removeItem([a, b], b.cartItemId)).toEqual([a]);
  });

  it('borne les quantités invalides', () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-3)).toBe(1);
    expect(clampQuantity(2.9)).toBe(2);
    expect(clampQuantity('abc')).toBe(1);
    expect(clampQuantity(Infinity)).toBe(1);
  });
});

describe('totaux', () => {
  it('compte les articles et additionne les lignes', () => {
    const items = [createCatalogItem(essential, noir, '95', { quantity: 2 }), createCatalogItem(everyday, everyday.colors[0], '90')];
    expect(cartCount(items)).toBe(3);
    expect(cartSubtotal(items)).toBe(89 * 2 + 85);
  });

  it('applique les frais de port sous le seuil et les offre au-delà', () => {
    const one = [createCatalogItem(everyday, everyday.colors[0], '90')];
    expect(cartTotals(one)).toEqual({ subtotal: 85, shipping: SHIPPING_COST, total: 92.9, count: 1 });
    const two = [createCatalogItem(everyday, everyday.colors[0], '90', { quantity: 2 })];
    expect(cartTotals(two)).toEqual({ subtotal: 170, shipping: 0, total: 170, count: 2 });
    expect(cartTotals([])).toEqual({ subtotal: 0, shipping: 0, total: 0, count: 0 });
  });
});

describe('persistance', () => {
  it('relit ce qui a été enregistré', () => {
    const storage = memoryStorage();
    const items = [createCatalogItem(essential, noir, '95', { monogram: 'AD' })];
    saveCart(items, storage);
    expect(loadCart(storage)).toEqual(items);
  });

  it('écarte les données corrompues ou d’un ancien format', () => {
    expect(loadCart(memoryStorage({ [CART_STORAGE_KEY]: '{pas du json' }))).toEqual([]);
    expect(loadCart(memoryStorage({ [CART_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
    expect(loadCart(memoryStorage())).toEqual([]);
    const valid = createCatalogItem(essential, noir, '95');
    const dirty = [valid, null, { name: 'sans clé' }, { ...valid, cartItemId: 'x', price: 'gratuit' }, { ...valid, cartItemId: 'y', quantity: 400 }];
    const clean = sanitizeCart(dirty);
    expect(clean.map((item) => item.cartItemId)).toEqual([valid.cartItemId, 'y']);
    expect(clean[1].quantity).toBe(MAX_QUANTITY);
  });

  it('ne lève pas d’erreur si le stockage est indisponible', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadCart(broken)).toEqual([]);
    expect(() => saveCart([], broken)).not.toThrow();
    expect(loadCart(null)).toEqual([]);
  });
});
