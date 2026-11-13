/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  CART_STORAGE_KEY,
  addItem,
  cartTotals,
  createAtelierItem,
  createCatalogItem,
  loadCart,
  removeItem,
  saveCart,
  setQuantity,
} from '../lib/cart';
import { useStoredState } from './useStoredState';

const CartContext = createContext(null);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  // Le panier vit dans le stockage local, partagé par tous les onglets : il est relu dès qu'un autre
  // onglet l'enregistre. syncCart() le relit sur demande (voir la confirmation de commande).
  const [cartItems, setCartItems, syncCart] = useStoredState(CART_STORAGE_KEY, loadCart, saveCart);
  const [isCartOpen, setIsCartOpen] = useState(false);

  /** Ajoute un produit du catalogue. options : { monogram, monogramStyle, quantity, silent } */
  const addToCart = useCallback((product, selectedColor, selectedSize, options = {}) => {
    const item = createCatalogItem(product, selectedColor, selectedSize, options);
    setCartItems((items) => addItem(items, item));
    if (!options.silent) setIsCartOpen(true);
    return item;
  }, [setCartItems]);

  /** Ajoute une ceinture de l'Atelier. options : { image, quantity, silent } */
  const addCustomBelt = useCallback((config, size, options = {}) => {
    const item = createAtelierItem(config, size, options);
    setCartItems((items) => addItem(items, item));
    if (!options.silent) setIsCartOpen(true);
    return item;
  }, [setCartItems]);

  const removeFromCart = useCallback((cartItemId) => {
    setCartItems((items) => removeItem(items, cartItemId));
  }, [setCartItems]);

  const updateQuantity = useCallback((cartItemId, quantity) => {
    setCartItems((items) => setQuantity(items, cartItemId, quantity));
  }, [setCartItems]);

  const clearCart = useCallback(() => setCartItems([]), [setCartItems]);

  const value = useMemo(() => {
    const totals = cartTotals(cartItems);
    return {
      cartItems,
      ...totals, // subtotal, shipping, total, count
      addToCart,
      addCustomBelt,
      removeFromCart,
      updateQuantity,
      clearCart,
      // relit le panier enregistré ; false s'il n'était plus celui affiché (modifié ou commandé dans un autre onglet)
      syncCart,
      // compatibilité avec l'ancienne API
      getCartTotal: () => totals.subtotal,
      getCartCount: () => totals.count,
      isCartOpen,
      setIsCartOpen,
      openCart: () => setIsCartOpen(true),
      closeCart: () => setIsCartOpen(false),
    };
  }, [cartItems, isCartOpen, addToCart, addCustomBelt, removeFromCart, updateQuantity, clearCart, syncCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
