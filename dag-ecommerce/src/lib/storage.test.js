import { afterEach, describe, expect, it, vi } from 'vitest';
import { localStore, watchStorageKey } from './storage';

describe('localStore', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
  });

  it('rend le stockage local du navigateur', () => {
    expect(localStore()).toBe(globalThis.localStorage);
  });

  it('rend null quand son accès est refusé, sans lever d’erreur', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(() => localStore()).not.toThrow();
    expect(localStore()).toBeNull();
  });

  it('rend null quand il n’existe pas', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
    expect(localStore()).toBeNull();
  });
});

describe('watchStorageKey', () => {
  const storageEvent = (key) => new StorageEvent('storage', { key, newValue: '[]' });
  const pageShow = (persisted) => new PageTransitionEvent('pageshow', { persisted });

  it('prévient quand un autre onglet écrit la clé, ou vide le stockage', () => {
    const onChange = vi.fn();
    const stop = watchStorageKey('dag-test', onChange);
    window.dispatchEvent(storageEvent('dag-test'));
    expect(onChange).toHaveBeenCalledTimes(1);
    window.dispatchEvent(storageEvent(null));
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('ignore les autres clés', () => {
    const onChange = vi.fn();
    const stop = watchStorageKey('dag-test', onChange);
    window.dispatchEvent(storageEvent('autre-cle'));
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('prévient quand la page revient du cache de navigation, pas à son premier affichage', () => {
    const onChange = vi.fn();
    const stop = watchStorageKey('dag-test', onChange);
    window.dispatchEvent(pageShow(false));
    expect(onChange).not.toHaveBeenCalled();
    window.dispatchEvent(pageShow(true));
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('se désabonne', () => {
    const onChange = vi.fn();
    watchStorageKey('dag-test', onChange)();
    window.dispatchEvent(storageEvent('dag-test'));
    window.dispatchEvent(pageShow(true));
    expect(onChange).not.toHaveBeenCalled();
  });
});
