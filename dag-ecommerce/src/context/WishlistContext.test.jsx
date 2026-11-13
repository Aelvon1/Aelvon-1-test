import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WishlistProvider, useWishlist } from './WishlistContext';

const KEY = 'dag-wishlist-v1';
const mount = () => renderHook(() => useWishlist(), { wrapper: WishlistProvider });
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

function writeFromAnotherTab(ids) {
  const newValue = JSON.stringify(ids);
  localStorage.setItem(KEY, newValue);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue }));
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
});

describe('WishlistProvider', () => {
  it('lit les favoris enregistrés et enregistre chaque changement', () => {
    localStorage.setItem(KEY, '[1, "x", 2.5, 3]');
    const { result } = mount();
    expect(result.current.ids).toEqual([1, 3]);
    act(() => result.current.toggle(2));
    expect(localStorage.getItem(KEY)).toBe('[1,3,2]');
    act(() => result.current.toggle(1));
    expect(result.current.has(1)).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('[3,2]');
  });

  it('n’efface pas le favori ajouté dans un autre onglet', () => {
    const { result } = mount();
    writeFromAnotherTab([1]);
    expect(result.current.ids).toEqual([1]);
    act(() => result.current.toggle(2));
    expect(localStorage.getItem(KEY)).toBe('[1,2]');
    expect(result.current.count).toBe(2);
  });

  it('reste utilisable, favoris en mémoire, quand l’accès à localStorage est refusé', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    const { result } = mount();
    act(() => result.current.toggle(4));
    expect(result.current.ids).toEqual([4]);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(result.current.ids).toEqual([4]);
  });
});
