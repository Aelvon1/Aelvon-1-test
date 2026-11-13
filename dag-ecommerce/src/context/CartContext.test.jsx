import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { products } from '../data/products';
import { CART_STORAGE_KEY, createCatalogItem } from '../lib/cart';
import { CartProvider, useCart } from './CartContext';

const essential = products.find((p) => p.slug === 'essential');
const matte = products.find((p) => p.slug === 'matte');
const essentialLine = () => createCatalogItem(essential, essential.colors[0], '95');
const matteLine = () => createCatalogItem(matte, matte.colors[0], '95');

const mount = () => renderHook(() => useCart(), { wrapper: CartProvider });
const storedCart = () => JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? 'null');
const names = (items) => items.map((item) => `${item.name} x${item.quantity}`);

/** Ce que fait un autre onglet : il écrit le panier, le navigateur prévient celui-ci. */
function writeFromAnotherTab(items) {
  const newValue = JSON.stringify(items);
  localStorage.setItem(CART_STORAGE_KEY, newValue);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY, newValue }));
  });
}

const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
});

describe('CartProvider — stockage', () => {
  it('lit le panier enregistré et enregistre chaque changement', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([essentialLine()]));
    const { result } = mount();
    expect(names(result.current.cartItems)).toEqual(['DAG Essential x1']);
    act(() => result.current.addToCart(matte, matte.colors[0], '95', { silent: true }));
    expect(names(storedCart())).toEqual(['DAG Essential x1', 'DAG Matte x1']);
    act(() => result.current.clearCart());
    expect(storedCart()).toEqual([]);
  });

  it('reste utilisable, panier en mémoire, quand l’accès à localStorage est refusé', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    const { result } = mount();
    expect(result.current.cartItems).toEqual([]);
    act(() => result.current.addToCart(essential, essential.colors[0], '95', { silent: true }));
    expect(names(result.current.cartItems)).toEqual(['DAG Essential x1']);
    expect(result.current.total).toBe(96.9);
    // rien n'est enregistré : relire le stockage ne doit pas effacer la seule copie du panier
    let upToDate;
    act(() => {
      upToDate = result.current.syncCart();
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(upToDate).toBe(true);
    expect(names(result.current.cartItems)).toEqual(['DAG Essential x1']);
  });

  it('garde le panier en mémoire quand l’écriture échoue (quota)', () => {
    const { result } = mount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    act(() => result.current.addToCart(essential, essential.colors[0], '95', { silent: true }));
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(names(result.current.cartItems)).toEqual(['DAG Essential x1']);
  });
});

describe('CartProvider — plusieurs onglets', () => {
  it('reprend le panier qu’un autre onglet vient d’enregistrer', () => {
    const { result } = mount();
    expect(result.current.cartItems).toEqual([]);
    writeFromAnotherTab([essentialLine()]);
    expect(names(result.current.cartItems)).toEqual(['DAG Essential x1']);
    expect(result.current.count).toBe(1);
  });

  it('n’efface pas l’article ajouté dans un autre onglet', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([essentialLine()]));
    const { result } = mount();
    writeFromAnotherTab([essentialLine(), matteLine()]);
    act(() => result.current.updateQuantity(essentialLine().cartItemId, 2));
    expect(names(storedCart())).toEqual(['DAG Essential x2', 'DAG Matte x1']);
  });

  it('se vide quand un autre onglet a passé la commande, ou vidé le stockage', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([essentialLine()]));
    const { result } = mount();
    writeFromAnotherTab([]);
    expect(result.current.cartItems).toEqual([]);

    writeFromAnotherTab([matteLine()]);
    expect(result.current.count).toBe(1);
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current.cartItems).toEqual([]);
  });

  it('ne réécrit pas ce qu’il vient de relire (deux onglets ne se renvoient pas la balle)', () => {
    // prix périmé : la relecture le corrige en mémoire, sans réécrire le stockage par-dessus l'autre onglet
    const stale = [{ ...essentialLine(), price: 1 }];
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stale));
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = mount();
    expect(result.current.subtotal).toBe(89);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY, newValue: JSON.stringify(stale) }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'autre-cle', newValue: '1' }));
    });
    expect(write).not.toHaveBeenCalled();
    expect(result.current.subtotal).toBe(89);
  });

  it('relit le panier après un retour depuis le cache de navigation', () => {
    const { result } = mount();
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([matteLine()]));
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(names(result.current.cartItems)).toEqual(['DAG Matte x1']);
  });

  it('syncCart signale un panier modifié ailleurs, et le remplace', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([essentialLine()]));
    const { result } = mount();
    let upToDate;
    act(() => {
      upToDate = result.current.syncCart();
    });
    expect(upToDate).toBe(true);

    // écriture qu'aucun événement n'a annoncée
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([]));
    act(() => {
      upToDate = result.current.syncCart();
    });
    expect(upToDate).toBe(false);
    expect(result.current.cartItems).toEqual([]);
    act(() => {
      upToDate = result.current.syncCart();
    });
    expect(upToDate).toBe(true);
  });

  it('syncCart reste vrai après un changement fait dans cet onglet', () => {
    const { result } = mount();
    act(() => result.current.addToCart(essential, essential.colors[0], '95', { monogram: 'AB', monogramStyle: 'or', quantity: 2, silent: true }));
    act(() => result.current.addCustomBelt({ leather: 'bordeaux', buckle: 'laiton', monogram: 'DAG' }, '100', { image: 'data:image/webp;base64,AAAA', silent: true }));
    let upToDate;
    act(() => {
      upToDate = result.current.syncCart();
    });
    expect(upToDate).toBe(true);
    expect(result.current.count).toBe(3);
  });
});
