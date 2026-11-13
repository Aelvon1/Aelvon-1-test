import { getBuckle } from '../data/atelier';

export const FREE_SHIPPING_THRESHOLD = 100;
export const SHIPPING_COST = 7.9;
export const MONOGRAM_PRICE = 12;
export const MAX_MONOGRAM_LENGTH = 3;
export const ATELIER_BASE_PRICE = 129;
export const MAX_QUANTITY = 10;

/** Garde lettres (A–Z, sans accent) et chiffres, en capitales, 3 caractères max. */
export function sanitizeMonogram(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_MONOGRAM_LENGTH);
}

/** Frais de port pour un sous-total donné (offerts dès FREE_SHIPPING_THRESHOLD). */
export function shippingFor(subtotal) {
  if (!(subtotal > 0)) return 0;
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
}

/** Montant restant avant la livraison offerte (0 si atteinte). */
export function remainingForFreeShipping(subtotal) {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - (Number(subtotal) || 0));
}

/** Prix d'une ceinture du catalogue, option monogramme comprise. */
export function catalogPrice(product, { monogram = '' } = {}) {
  return product.price + (sanitizeMonogram(monogram) ? MONOGRAM_PRICE : 0);
}

/** Prix d'une ceinture sur-mesure de l'Atelier. */
export function atelierPrice(config = {}) {
  const buckle = getBuckle(config.buckle);
  return ATELIER_BASE_PRICE + (buckle.surcharge ?? 0) + (sanitizeMonogram(config.monogram) ? MONOGRAM_PRICE : 0);
}

/** Arrondi monétaire sûr (évite 0.1 + 0.2). */
export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
