// Logique pure du panier (aucune dépendance React) — testable unitairement.
import { beltConfigKey, describeBelt, getLeather, normalizeBeltConfig } from '../data/atelier';
import { productImage } from '../data/products';
import { MAX_QUANTITY, atelierPrice, catalogPrice, roundMoney, sanitizeMonogram, shippingFor } from './pricing';

export const CART_STORAGE_KEY = 'dag-cart-v2';

/**
 * @typedef {Object} CartItem
 * @property {string} cartItemId  clé stable : même article + mêmes options = même ligne
 * @property {number|null} productId  null pour une création de l'Atelier
 * @property {string|null} slug
 * @property {string} name
 * @property {string} subtitle  ligne descriptive (coloris, taille…)
 * @property {number} price  prix unitaire, options comprises
 * @property {number} quantity
 * @property {{name: string, value: string, hex: string}} selectedColor
 * @property {string} selectedSize
 * @property {string} monogram
 * @property {string} monogramStyle
 * @property {import('../data/atelier').BeltConfig} belt
 * @property {string|null} image  miniature (URL ou data URL)
 * @property {boolean} custom  true pour une ceinture sur-mesure
 */

/** Ligne de panier pour un produit du catalogue. */
export function createCatalogItem(product, color, size, options = {}) {
  const monogram = sanitizeMonogram(options.monogram);
  const monogramStyle = monogram ? (options.monogramStyle ?? 'marque') : 'marque';
  const belt = normalizeBeltConfig({ ...color.belt, monogram, monogramStyle });
  return {
    cartItemId: ['p', product.id, color.value, size, monogram || '-', monogram ? monogramStyle : '-'].join('|'),
    productId: product.id,
    slug: product.slug,
    name: product.name,
    subtitle: `${color.name} · ${size} cm${monogram ? ` · Monogramme ${monogram}` : ''}`,
    price: catalogPrice(product, { monogram }),
    quantity: clampQuantity(options.quantity ?? 1),
    selectedColor: { name: color.name, value: color.value, hex: color.hex },
    selectedSize: String(size),
    monogram,
    monogramStyle,
    belt,
    image: productImage(product, color.value, 'studio'),
    custom: false,
  };
}

/** Ligne de panier pour une ceinture composée à l'Atelier. */
export function createAtelierItem(config, size, options = {}) {
  const belt = normalizeBeltConfig({ ...config, monogram: sanitizeMonogram(config?.monogram) });
  const leather = getLeather(belt.leather);
  return {
    cartItemId: ['a', beltConfigKey(belt), size].join('|'),
    productId: null,
    slug: null,
    name: 'DAG Sur-Mesure',
    subtitle: `${describeBelt(belt)} · ${size} cm${belt.monogram ? ` · Monogramme ${belt.monogram}` : ''}`,
    price: atelierPrice(belt),
    quantity: clampQuantity(options.quantity ?? 1),
    selectedColor: { name: leather.name, value: leather.id, hex: leather.hex },
    selectedSize: String(size),
    monogram: belt.monogram,
    monogramStyle: belt.monogramStyle,
    belt,
    image: options.image ?? null,
    custom: true,
  };
}

export function clampQuantity(quantity) {
  const n = Math.floor(Number(quantity));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, n));
}

/** Ajoute une ligne ; si elle existe déjà, cumule les quantités (plafonnées). */
export function addItem(items, item) {
  const existing = items.find((entry) => entry.cartItemId === item.cartItemId);
  if (!existing) return [...items, item];
  return items.map((entry) =>
    entry.cartItemId === item.cartItemId
      ? { ...entry, quantity: clampQuantity(entry.quantity + item.quantity), image: item.image ?? entry.image }
      : entry,
  );
}

/** Fixe la quantité d'une ligne ; une quantité < 1 retire la ligne. */
export function setQuantity(items, cartItemId, quantity) {
  if (!(Number(quantity) >= 1)) return removeItem(items, cartItemId);
  return items.map((entry) =>
    entry.cartItemId === cartItemId ? { ...entry, quantity: clampQuantity(quantity) } : entry,
  );
}

export function removeItem(items, cartItemId) {
  return items.filter((entry) => entry.cartItemId !== cartItemId);
}

export const cartCount = (items) => items.reduce((count, item) => count + item.quantity, 0);

export const cartSubtotal = (items) => roundMoney(items.reduce((total, item) => total + item.price * item.quantity, 0));

/** Sous-total, livraison et total d'un panier. */
export function cartTotals(items) {
  const subtotal = cartSubtotal(items);
  const shipping = shippingFor(subtotal);
  return { subtotal, shipping, total: roundMoney(subtotal + shipping), count: cartCount(items) };
}

/** Valide des données lues dans le stockage local ; écarte toute ligne malformée. */
export function sanitizeCart(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item) =>
        item &&
        typeof item.cartItemId === 'string' &&
        typeof item.name === 'string' &&
        Number.isFinite(item.price) &&
        item.price >= 0 &&
        Number.isFinite(item.quantity) &&
        item.selectedColor &&
        typeof item.selectedColor.name === 'string',
    )
    .map((item) => ({ ...item, quantity: clampQuantity(item.quantity), belt: normalizeBeltConfig(item.belt) }));
}

export function loadCart(storage = globalThis.localStorage) {
  try {
    return sanitizeCart(JSON.parse(storage?.getItem(CART_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveCart(items, storage = globalThis.localStorage) {
  try {
    storage?.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // stockage indisponible (navigation privée, quota) : le panier reste en mémoire
  }
}
