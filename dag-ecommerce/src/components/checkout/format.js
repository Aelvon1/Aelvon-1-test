// Petites aides de présentation partagées par la commande et sa confirmation.
import { formatDate } from '../../lib/format';
import { deliveryDelay, estimateDelivery } from '../../lib/orders';
import { countryName } from '../../lib/validation';

/** Espace insécable : devant ; : ! ? et entre un nombre et son unité, dans les chaînes JS. */
export const NBSP = String.fromCharCode(160);

/** « 1 article », « 3 articles ». */
export const countLabel = (count) => `${count}${NBSP}article${count > 1 ? 's' : ''}`;

/** « 3 à 5 jours ouvrés » — délai annoncé pour le pays de destination. */
export function delayLabel(country) {
  const { minDays, maxDays } = deliveryDelay(country);
  return `${minDays} à ${maxDays}${NBSP}jours ouvrés`;
}

/** « 18 novembre 2026 » découpé ; le premier du mois s'écrit « 1er ». */
function dateParts(date) {
  const [day, month, year] = formatDate(date).split(/\s+/);
  return { day: day === '1' ? '1er' : day, month, year };
}

/**
 * Fenêtre de dates en clair, sans répéter le mois ni l'année quand ils sont communs :
 * « du 18 au 20 novembre 2026 », « du 28 novembre au 2 décembre 2026 ».
 * @param {{ earliest: Date, latest: Date }|null} range  résultat de estimateDelivery
 * @returns {string} '' si la fenêtre est absente
 */
export function formatDateRange(range) {
  if (!range) return '';
  const from = dateParts(range.earliest);
  const to = dateParts(range.latest);
  const end = `${to.day}${NBSP}${to.month} ${to.year}`;
  if (from.year !== to.year) return `du ${from.day}${NBSP}${from.month} ${from.year} au ${end}`;
  if (from.month !== to.month) return `du ${from.day}${NBSP}${from.month} au ${end}`;
  if (from.day === to.day) return `le ${end}`;
  return `du ${from.day} au ${end}`;
}

/** Fenêtre de livraison estimée pour une commande passée à `date`, vers `country`. */
export const deliveryWindow = (date, country) => estimateDelivery(date, deliveryDelay(country));

/** Description d'un article sans coupure entre un nombre et son unité : « 38 mm », « 95 cm ». */
export const tidySubtitle = (subtitle) => String(subtitle ?? '').replace(/(\d) (?=(?:mm|cm)\b)/g, `$1${NBSP}`);

export const fullName = (customer) => [customer?.firstName, customer?.lastName].filter(Boolean).join(' ');

/** Adresse postale ligne à ligne : voie, complément, « 75003 Paris », pays. */
export function addressLines(customer = {}) {
  return [
    customer.address,
    customer.addressComplement,
    [customer.postalCode, customer.city].filter(Boolean).join(' '),
    countryName(customer.country),
  ].filter(Boolean);
}
