// Trouveur de taille — logique pure. La règle (tour de taille + 15 cm) et l'arrondi vivent
// dans lib/sizing.js ; ici, on lit la saisie du visiteur et on décrit le résultat à afficher.
import { SIZES } from '../../data/atelier';
import { products } from '../../data/products';
import { TROUSER_SIZES_FR, WAIST_MAX_CM, WAIST_MIN_CM, inchesToCm, recommendSize } from '../../lib/sizing';

export const FINDER_MODES = [
  { value: 'cm', label: 'Centimètres', hint: 'tour de taille' },
  { value: 'pantalon', label: 'Pantalon', hint: 'taille française' },
  { value: 'pouces', label: 'Pouces', hint: 'tour de taille' },
];

const CM_PER_INCH = 2.54;
/** Bornes du tour de taille en pouces, à l'intérieur des bornes en centimètres. */
export const INCH_MIN = Math.ceil(WAIST_MIN_CM / CM_PER_INCH);
export const INCH_MAX = Math.floor(WAIST_MAX_CM / CM_PER_INCH);

export const FINDER_DEFAULTS = Object.freeze({ mode: 'cm', cm: '85', trouser: '42', inches: '33' });

/** Tailles proposées par au moins un modèle de la collection, en ordre croissant. */
export const COLLECTION_SIZES = [...new Set(products.flatMap((product) => product.sizes))].sort((a, b) => Number(a) - Number(b));
/** Toutes les longueurs réalisées (collection et Atelier). */
export const ALL_SIZES = SIZES;

/** « 85 », « 85,5 », « 85.5 » → nombre ; saisie vide ou illisible → NaN. */
export function parseMeasure(text) {
  const value = String(text ?? '')
    .trim()
    .replace(',', '.');
  return value === '' ? NaN : Number(value);
}

/** Ne garde que chiffres et séparateur décimal (la saisie reste une chaîne). */
export const cleanMeasure = (text) =>
  String(text ?? '')
    .replace(/[^0-9.,]/g, '')
    .slice(0, 5);

/** Borne une valeur dans [min, max] ; une valeur illisible prend `fallback`. */
export function clampMeasure(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Pas des boutons + / − et des flèches du clavier : l'entier voisin, borné dans [min, max].
 * Depuis une décimale, on rejoint l'entier le plus proche dans le sens demandé (« 85,5 » : 86 ou 85).
 * @param {string} value  saisie en cours
 * @param {1|-1} direction  1 : ajouter · -1 : retirer
 * @returns {number} une saisie illisible prend `fallback`
 */
export function stepMeasure(value, direction, min, max, fallback = min) {
  const base = parseMeasure(value);
  const next = direction > 0 ? Math.floor(base) + 1 : Math.ceil(base) - 1;
  return clampMeasure(next, min, max, fallback);
}

/**
 * Où trouver une longueur : dans la collection (et sur quels modèles) ou seulement à l'Atelier.
 * @returns {{ inCollection: boolean, models: object[], missing: object[] }}
 */
export function sizeAvailability(size) {
  const key = String(size);
  const models = products.filter((product) => product.sizes.includes(key));
  const missing = products.filter((product) => !product.sizes.includes(key));
  return { inCollection: models.length > 0, models, missing };
}

/**
 * Lit la saisie et décrit le résultat.
 * @param {{ mode: 'cm'|'pantalon'|'pouces', cm: string, trouser: string, inches: string }} state
 * @returns {{
 *   status: 'empty'|'invalid'|'out'|'exact'|'near', waist: number|null, entered: number|null,
 *   size: string|null, ideal: number|null, direction: 'short'|'long'|null,
 *   availability: ReturnType<typeof sizeAvailability>|null
 * }}
 *   empty : rien de saisi, ou saisie encore incomplète (aucune mesure retenue : waist et entered valent null) ·
 *   invalid : mesure hors des repères de la maison · out : longueur idéale hors
 *   de nos tailles (direction « short » : la plus grande taille sera juste ; « long » : la plus petite
 *   sera un peu longue) · exact : la longueur idéale existe · near : arrondie à la taille la plus proche
 *   entered : valeur saisie dans son unité (cm, taille de pantalon, pouces)
 */
export function finderResult(state) {
  const { mode } = state;
  let entered = null;
  let waist = null;

  if (mode === 'pantalon') {
    const entry = TROUSER_SIZES_FR.find((item) => item.fr === state.trouser);
    entered = entry ? Number(entry.fr) : null;
    waist = entry ? entry.waist : null;
  } else if (mode === 'pouces') {
    const inches = parseMeasure(state.inches);
    entered = Number.isFinite(inches) ? inches : null;
    waist = entered == null ? null : inchesToCm(entered);
  } else {
    const cm = parseMeasure(state.cm);
    entered = Number.isFinite(cm) ? cm : null;
    waist = entered;
  }

  const blank = { waist, entered, size: null, ideal: null, direction: null, availability: null };
  const empty = { ...blank, waist: null, entered: null, status: 'empty' };
  const typed = mode === 'pantalon' ? state.trouser : String(mode === 'pouces' ? state.inches : state.cm).trim();
  if (!typed) return empty;
  // Saisie en cours : « 8 » ou « 10 » peuvent encore devenir 85 ou 105 — on attend la suite sans rien signaler,
  // et sans rien retenir : « 3 » n'est pas encore une mesure à convertir.
  if (mode !== 'pantalon' && entered != null && /^\d+$/.test(typed)) {
    const [min, max] = mode === 'pouces' ? [INCH_MIN, INCH_MAX] : [WAIST_MIN_CM, WAIST_MAX_CM];
    if (entered < min && entered * 10 <= max) return empty;
  }

  const recommendation = waist == null ? null : recommendSize(waist, ALL_SIZES);
  if (!recommendation) return { ...blank, status: 'invalid' };

  const { size, ideal, exact, outOfRange } = recommendation;
  const base = { waist, entered, size, ideal, availability: sizeAvailability(size) };
  if (outOfRange) return { ...base, status: 'out', direction: ideal > Number(size) ? 'short' : 'long' };
  return { ...base, status: exact ? 'exact' : 'near', direction: null };
}
