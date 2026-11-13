// Logique pure de l'Atelier (aucune dépendance React) : état initial, brouillon local,
// paramètres d'URL, détail du prix. Testée dans atelier-state.test.js.
import {
  BUCKLES,
  DEFAULT_BELT,
  FINISHES,
  LEATHERS,
  MONOGRAM_STYLES,
  SIZES,
  STITCHES,
  WIDTHS,
  beltConfigKey,
  getBuckle,
  normalizeBeltConfig,
} from '../../data/atelier';
import { ATELIER_PARAMS, beltToSearchParams, searchParamsToBelt } from '../../lib/atelier-url';
import { ATELIER_BASE_PRICE, MONOGRAM_PRICE, sanitizeMonogram } from '../../lib/pricing';

export const DRAFT_KEY = 'dag-atelier-v1';
export const SURFACES = ['noir', 'ivoire'];
export const DEFAULT_SURFACE = 'noir';

const NBSP = '\xa0';

const OPTION_LISTS = {
  leather: LEATHERS,
  finish: FINISHES,
  buckle: BUCKLES,
  stitch: STITCHES,
  width: WIDTHS,
  monogramStyle: MONOGRAM_STYLES,
};

/**
 * Configuration complète et sûre : un id inconnu reprend la valeur de la ceinture par défaut,
 * le monogramme est nettoyé, l'envers (réversible, hors Atelier) est retiré.
 */
export function cleanConfig(config) {
  const known = {};
  for (const [field, list] of Object.entries(OPTION_LISTS)) {
    const value = config?.[field];
    if (list.some((entry) => String(entry.id) === String(value))) known[field] = value;
  }
  return normalizeBeltConfig({ ...known, monogram: sanitizeMonogram(config?.monogram), lining: null });
}

/** Les cinq choix de fabrication, sans le monogramme : ce qui fait « le même modèle ». */
export function sameLook(a, b) {
  const strip = (config) => beltConfigKey({ ...config, monogram: '', lining: null });
  return strip(a) === strip(b);
}

export const isDefaultLook = (config) => sameLook(config, DEFAULT_BELT);

/** Stockage local du navigateur, ou null s'il est inaccessible (navigation privée, réglages). */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Lit le brouillon enregistré. Tout ce qui est absent ou invalide vaut null / false.
 * @returns {{ config: object|null, size: string|null, surface: string|null, hintSeen: boolean }}
 */
export function readDraft(storage) {
  const empty = { config: null, size: null, surface: null, hintSeen: false };
  try {
    const raw = JSON.parse(storage?.getItem(DRAFT_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
    return {
      config: raw.config && typeof raw.config === 'object' ? cleanConfig(raw.config) : null,
      size: SIZES.includes(String(raw.size)) ? String(raw.size) : null,
      surface: SURFACES.includes(raw.surface) ? raw.surface : null,
      hintSeen: raw.hintSeen === true,
    };
  } catch {
    return empty;
  }
}

/** Complète le brouillon enregistré avec `patch`. Renvoie false si l'écriture a échoué. */
export function saveDraft(storage, patch) {
  try {
    if (!storage) return false;
    storage.setItem(DRAFT_KEY, JSON.stringify({ ...readDraft(storage), ...patch }));
    return true;
  } catch {
    return false;
  }
}

/**
 * État d'ouverture de l'Atelier. L'URL l'emporte sur le brouillon ; sans paramètre valide, le
 * brouillon est repris ; sinon la ceinture par défaut.
 * La taille n'est jamais écrite dans l'URL par l'Atelier (un lien partagé ne doit pas imposer la
 * taille de son auteur) : elle est lue si un lien la porte, et reprise du brouillon quand l'URL
 * décrit exactement la ceinture du brouillon (rechargement de la page).
 * @param {URLSearchParams|string} search
 * @param {ReturnType<typeof readDraft>} [draft]
 * @returns {{ config: object, size: string|null, surface: string, hintSeen: boolean, source: 'url'|'draft'|'default' }}
 */
export function resolveInitialState(search, draft = readDraft(null)) {
  const url = searchParamsToBelt(search);
  const shared = { surface: draft.surface ?? DEFAULT_SURFACE, hintSeen: draft.hintSeen };

  if (url.hasConfig) {
    const config = cleanConfig(url.config);
    const sameAsDraft = draft.config != null && beltConfigKey(draft.config) === beltConfigKey(config);
    return { ...shared, config, size: url.size ?? (sameAsDraft ? draft.size : null), source: 'url' };
  }
  if (draft.config) return { ...shared, config: draft.config, size: url.size ?? draft.size, source: 'draft' };
  return { ...shared, config: cleanConfig(DEFAULT_BELT), size: url.size, source: 'default' };
}

/**
 * Paramètres d'URL avec la ceinture `config` : les paramètres de l'Atelier sont remplacés
 * (taille comprise, voir resolveInitialState), les autres (suivi de campagne…) sont conservés.
 * @param {URLSearchParams|string} current
 * @returns {URLSearchParams}
 */
export function withBeltParams(current, config) {
  const next = new URLSearchParams(current);
  for (const name of Object.values(ATELIER_PARAMS)) next.delete(name);
  for (const [name, value] of beltToSearchParams(cleanConfig(config))) next.set(name, value);
  return next;
}

// Cadrage qui montre le mieux chaque réglage.
const VIEW_FOR_FIELD = {
  leather: 'cuir',
  finish: 'cuir',
  buckle: 'boucle',
  stitch: 'couture',
  width: 'full',
  monogram: 'monogramme',
  monogramStyle: 'monogramme',
};

/** Cadrage à adopter après la modification de `field` (vue d'ensemble s'il n'y a rien à montrer de près). */
export function viewForEdit(field, config) {
  const view = VIEW_FOR_FIELD[field] ?? 'full';
  return view === 'monogramme' && !sanitizeMonogram(config?.monogram) ? 'full' : view;
}

/**
 * Détail du prix d'une composition ; la somme des lignes vaut atelierPrice(config).
 * @returns {Array<{ id: 'base'|'buckle'|'monogram', label: string, amount: number }>}
 */
export function priceLines(config) {
  const c = cleanConfig(config);
  const buckle = getBuckle(c.buckle);
  const lines = [{ id: 'base', label: 'Ceinture sur-mesure', amount: ATELIER_BASE_PRICE }];
  if (buckle.surcharge > 0) lines.push({ id: 'buckle', label: `Boucle ${buckle.name.toLowerCase()}`, amount: buckle.surcharge });
  if (c.monogram) lines.push({ id: 'monogram', label: `Monogramme ${c.monogram}`, amount: MONOGRAM_PRICE });
  return lines;
}

/** « 35 mm » → espace insécable entre le nombre et son unité. */
export const nbspUnits = (text) => String(text ?? '').replace(/(\d) (mm|cm)\b/g, `$1${NBSP}$2`);
