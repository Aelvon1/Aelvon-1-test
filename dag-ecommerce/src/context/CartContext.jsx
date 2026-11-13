/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  addItem,
  cartTotals,
  createAtelierItem,
  createCatalogItem,
  loadCart,
  removeItem,
  saveCart,
  setQuantity,
} from '../lib/cart';

const CartContext = createContext(null);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => loadCart());
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    saveCart(cartItems);
  }, [cartItems]);

  /** Ajoute un produit du catalogue. options : { monogram, monogramStyle, quantity, silent } */
  const addToCart = useCallback((product, selectedColor, selectedSize, options = {}) => {
    const item = createCatalogItem(product, selectedColor, selectedSize, options);
    setCartItems((items) => addItem(items, item));
    if (!options.silent) setIsCartOpen(true);
    return item;
  }, []);

  /** Ajoute une ceinture de l'Atelier. options : { image, quantity, silent } */
  const addCustomBelt = useCallback((config, size, options = {}) => {
    const item = createAtelierItem(config, size, options);
    setCartItems((items) => addItem(items, item));
    if (!options.silent) setIsCartOpen(true);
    return item;
  }, []);

  const removeFromCart = useCallback((cartItemId) => {
    setCartItems((items) => removeItem(items, cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId, quantity) => {
    setCartItems((items) => setQuantity(items, cartItemId, quantity));
  }, []);

  const clearCart = useCallback(() => setCartItems([]), []);

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
      // compatibilité avec l'ancienne API
      getCartTotal: () => totals.subtotal,
      getCartCount: () => totals.count,
      isCartOpen,
      setIsCartOpen,
      openCart: () => setIsCartOpen(true),
      closeCart: () => setIsCartOpen(false),
    };
  }, [cartItems, isCartOpen, addToCart, addCustomBelt, removeFromCart, updateQuantity, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
