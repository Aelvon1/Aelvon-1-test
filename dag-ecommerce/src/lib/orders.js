// Commandes — logique pure (aucune dépendance React), stockage injecté pour les tests.
// Le site n'a pas de serveur : une commande confirmée est conservée dans le navigateur
// (localStorage, une seule clé, 10 commandes au plus) pour alimenter la page de confirmation.
import { cartTotals, sanitizeCart } from './cart';
import { roundMoney } from './pricing';

export const ORDERS_STORAGE_KEY = 'dag-orders-v1';
export const MAX_STORED_ORDERS = 10;

/** Seul statut possible tant qu'aucun paiement n'est branché : commande de démonstration, rien n'est prélevé. */
export const ORDER_STATUS_DEMO = 'demonstration';

// 32 signes sans 0/O ni 1/I : un numéro se dicte et se recopie sans hésitation.
const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_LENGTH = 6;
export const ORDER_ID_PATTERN = /^DAG-[2-9A-HJ-NP-Z]{6}$/;

/** Délais de livraison annoncés, en jours ouvrés, selon le pays de destination. */
export const DELIVERY_DELAYS = Object.freeze({
  FR: Object.freeze({ minDays: 3, maxDays: 5 }),
  BE: Object.freeze({ minDays: 5, maxDays: 7 }),
  CH: Object.freeze({ minDays: 5, maxDays: 7 }),
  LU: Object.freeze({ minDays: 5, maxDays: 7 }),
});

const CUSTOMER_FIELDS = ['email', 'firstName', 'lastName', 'phone', 'address', 'addressComplement', 'postalCode', 'city', 'country'];
const MAX_FIELD_LENGTH = 254;
const MAX_NOTE_LENGTH = 600;

/** Délai annoncé pour un pays (France par défaut) : { minDays, maxDays }. */
export function deliveryDelay(country) {
  return DELIVERY_DELAYS[String(country ?? '').toUpperCase()] ?? DELIVERY_DELAYS.FR;
}

/** Nombre aléatoire dans [0, 1) — tirage cryptographique quand le navigateur le permet. */
function defaultRandom() {
  try {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0] / 2 ** 32;
  } catch {
    return Math.random();
  }
}

/** localStorage, ou null s'il est inaccessible (navigation privée, cookies bloqués). */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Numéro de commande lisible : « DAG-7K2M9Q ». */
export function generateOrderId(random = defaultRandom) {
  let code = '';
  for (let i = 0; i < ID_LENGTH; i += 1) {
    const index = Math.min(ID_ALPHABET.length - 1, Math.max(0, Math.floor(random() * ID_ALPHABET.length)));
    code += ID_ALPHABET[index];
  }
  return `DAG-${code}`;
}

/** « dag-7k2m9q » → « DAG-7K2M9Q » ; renvoie '' si ce n'est pas un numéro de commande. */
export function normalizeOrderId(value) {
  const id = String(value ?? '')
    .trim()
    .toUpperCase();
  return ORDER_ID_PATTERN.test(id) ? id : '';
}

const text = (value, max = MAX_FIELD_LENGTH) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function sanitizeCustomer(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const customer = {};
  for (const field of CUSTOMER_FIELDS) customer[field] = text(source[field]);
  return customer;
}

/** Lignes de commande : celles du panier, validées, réduites à ce qu'un récapitulatif affiche. */
function snapshotItems(raw) {
  return sanitizeCart(raw).map((item) => ({
    cartItemId: item.cartItemId,
    productId: item.productId ?? null,
    slug: typeof item.slug === 'string' ? item.slug : null,
    name: item.name,
    subtitle: typeof item.subtitle === 'string' ? item.subtitle : '',
    price: roundMoney(item.price),
    quantity: item.quantity,
    selectedColor: {
      name: item.selectedColor.name,
      value: String(item.selectedColor.value ?? ''),
      hex: String(item.selectedColor.hex ?? ''),
    },
    selectedSize: String(item.selectedSize ?? ''),
    monogram: typeof item.monogram === 'string' ? item.monogram : '',
    monogramStyle: typeof item.monogramStyle === 'string' ? item.monogramStyle : 'marque',
    belt: item.belt,
    image: typeof item.image === 'string' && item.image ? item.image : null,
    custom: Boolean(item.custom),
  }));
}

const isAmount = (value) => Number.isFinite(value) && value >= 0;

/** Totaux fournis s'ils sont cohérents (nombres finis, positifs), sinon recalculés depuis les lignes. */
function sanitizeTotals(raw, items) {
  const computed = cartTotals(items);
  if (!raw || !isAmount(raw.subtotal) || !isAmount(raw.shipping) || !isAmount(raw.total)) return computed;
  return {
    subtotal: roundMoney(raw.subtotal),
    shipping: roundMoney(raw.shipping),
    total: roundMoney(raw.total),
    count: computed.count,
  };
}

/**
 * @typedef {Object} Order
 * @property {string} id         numéro lisible, « DAG-7K2M9Q »
 * @property {string} createdAt  date ISO 8601
 * @property {import('./cart').CartItem[]} items
 * @property {{ subtotal: number, shipping: number, total: number, count: number }} totals
 * @property {{ email: string, firstName: string, lastName: string, phone: string, address: string,
 *   addressComplement: string, postalCode: string, city: string, country: string }} customer
 * @property {string} giftNote
 * @property {string} status     ORDER_STATUS_DEMO tant qu'aucun paiement n'est branché
 */

/**
 * Construit une commande à partir du panier et des coordonnées saisies. Ne l'enregistre pas.
 * @param {{ items: object[], totals?: object, customer: object, giftNote?: string }} input
 * @param {{ now?: Date|string|number, random?: () => number, taken?: string[] }} [options]
 *   now : date de la commande · random : source d'aléa du numéro · taken : numéros déjà attribués, à éviter
 * @returns {Order|null} null si le panier ne contient aucune ligne valide
 */
export function createOrder({ items, totals, customer, giftNote = '' } = {}, { now = new Date(), random = defaultRandom, taken = [] } = {}) {
  const lines = snapshotItems(items);
  if (lines.length === 0) return null;

  let id = generateOrderId(random);
  for (let attempt = 0; attempt < 24 && taken.includes(id); attempt += 1) id = generateOrderId(random);

  const date = new Date(now);
  return {
    id,
    createdAt: (Number.isNaN(date.getTime()) ? new Date() : date).toISOString(),
    items: lines,
    totals: sanitizeTotals(totals, lines),
    customer: sanitizeCustomer(customer),
    giftNote: text(giftNote, MAX_NOTE_LENGTH),
    status: ORDER_STATUS_DEMO,
  };
}

/** Valide une commande relue (stockage, état de navigation) ; renvoie null si elle est inexploitable. */
export function sanitizeOrder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = normalizeOrderId(raw.id);
  if (!id) return null;
  if (typeof raw.createdAt !== 'string' || Number.isNaN(new Date(raw.createdAt).getTime())) return null;
  const items = snapshotItems(raw.items);
  if (items.length === 0) return null;
  return {
    id,
    createdAt: new Date(raw.createdAt).toISOString(),
    items,
    totals: sanitizeTotals(raw.totals, items),
    customer: sanitizeCustomer(raw.customer),
    giftNote: text(raw.giftNote, MAX_NOTE_LENGTH),
    status: typeof raw.status === 'string' && raw.status ? raw.status : ORDER_STATUS_DEMO,
  };
}

const byMostRecent = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

/** Commandes enregistrées, de la plus récente à la plus ancienne. Ne lève jamais d'erreur. */
export function listOrders(storage = defaultStorage()) {
  try {
    const raw = JSON.parse(storage?.getItem(ORDERS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw
      .map(sanitizeOrder)
      .filter((order) => {
        if (!order || seen.has(order.id)) return false;
        seen.add(order.id);
        return true;
      })
      .sort(byMostRecent)
      .slice(0, MAX_STORED_ORDERS);
  } catch {
    return [];
  }
}

/** Retrouve une commande par son numéro (casse et espaces de bord tolérés), ou null. */
export function getOrder(id, storage = defaultStorage()) {
  const key = normalizeOrderId(id);
  if (!key) return null;
  return listOrders(storage).find((order) => order.id === key) ?? null;
}

/** Copie allégée d'une commande : sans les vignettes embarquées (data URL) des créations de l'Atelier, les seules à peser. */
export const withoutEmbeddedImages = (order) => ({
  ...order,
  items: order.items.map((item) => (item.image?.startsWith('data:') ? { ...item, image: null } : item)),
});

/**
 * Enregistre une commande (les MAX_STORED_ORDERS plus récentes sont conservées).
 * Si la place manque, les vignettes embarquées sont abandonnées — le dessin de la ceinture
 * les remplace à l'affichage. Ne lève jamais d'erreur.
 * @returns {boolean} true si la commande est enregistrée
 */
export function saveOrder(order, storage = defaultStorage()) {
  const clean = sanitizeOrder(order);
  if (!clean || !storage) return false;
  const others = listOrders(storage).filter((entry) => entry.id !== clean.id);
  const orders = [clean, ...others].sort(byMostRecent).slice(0, MAX_STORED_ORDERS);
  const attempts = [orders, orders.map(withoutEmbeddedImages), [withoutEmbeddedImages(clean)]];
  for (const attempt of attempts) {
    try {
      storage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(attempt));
      return true;
    } catch {
      // quota dépassé ou stockage refusé : on réessaie plus léger
    }
  }
  return false;
}

const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

/** Ajoute des jours ouvrés (lundi à vendredi) à une date. Les jours fériés ne sont pas pris en compte. */
export function addWorkingDays(from, days) {
  const date = new Date(from);
  // midi : à l'abri des changements d'heure quand on avance de jour en jour
  date.setHours(12, 0, 0, 0);
  let remaining = Math.max(0, Math.floor(Number(days) || 0));
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (!isWeekend(date)) remaining -= 1;
  }
  return date;
}

/**
 * Fenêtre de livraison estimée : au plus tôt et au plus tard, en jours ouvrés après la commande
 * (3 et 5 par défaut ; les week-ends ne comptent pas).
 * @param {Date|string|number} createdAt
 * @param {{ minDays?: number, maxDays?: number }} [delay]  voir deliveryDelay(pays)
 * @returns {{ earliest: Date, latest: Date }|null} null si la date est invalide
 */
export function estimateDelivery(createdAt, { minDays = 3, maxDays = 5 } = {}) {
  const start = new Date(createdAt);
  if (createdAt == null || Number.isNaN(start.getTime())) return null;
  return {
    earliest: addWorkingDays(start, minDays),
    latest: addWorkingDays(start, Math.max(minDays, maxDays)),
  };
}
