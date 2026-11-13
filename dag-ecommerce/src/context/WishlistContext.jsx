/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo } from 'react';
import { localStore } from '../lib/storage';
import { useStoredState } from './useStoredState';

const STORAGE_KEY = 'dag-wishlist-v1';
const WishlistContext = createContext(null);

function load() {
  try {
    const raw = JSON.parse(localStore()?.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id) => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

/** @returns {boolean} false si rien n'a pu être écrit : les favoris ne vivent alors qu'en mémoire */
function save(ids) {
  try {
    const storage = localStore();
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};

/** Favoris : liste d'identifiants produit, persistée en local et tenue à jour entre les onglets. */
export const WishlistProvider = ({ children }) => {
  const [ids, setIds] = useStoredState(STORAGE_KEY, load, save);

  const toggle = useCallback((productId) => {
    setIds((current) => (current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]));
  }, [setIds]);

  const value = useMemo(
    () => ({ ids, count: ids.length, has: (productId) => ids.includes(productId), toggle, clear: () => setIds([]) }),
    [ids, toggle, setIds],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};
