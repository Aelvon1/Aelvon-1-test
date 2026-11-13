/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'dag-wishlist-v1';
const WishlistContext = createContext(null);

function load() {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id) => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};

/** Favoris : liste d'identifiants produit, persistée en local. */
export const WishlistProvider = ({ children }) => {
  const [ids, setIds] = useState(load);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // stockage indisponible : les favoris restent en mémoire
    }
  }, [ids]);

  const toggle = useCallback((productId) => {
    setIds((current) => (current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]));
  }, []);

  const value = useMemo(
    () => ({ ids, count: ids.length, has: (productId) => ids.includes(productId), toggle, clear: () => setIds([]) }),
    [ids, toggle],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};
