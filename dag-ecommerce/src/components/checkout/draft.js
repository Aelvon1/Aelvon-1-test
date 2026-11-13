// Brouillon du formulaire de commande : conservé le temps de l'onglet (sessionStorage),
// pour qu'un rechargement n'efface pas la saisie. Effacé dès la commande confirmée.
import { sanitizeCheckoutValues } from '../../lib/validation';

export const CHECKOUT_DRAFT_KEY = 'dag-checkout-v1';

function sessionStore() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ values: Record<string, string>, gift: boolean }}
 *   values : champs du formulaire (validés à la relecture) · gift : case « C'est un cadeau »
 */
export function loadDraft(storage = sessionStore()) {
  let raw = null;
  try {
    raw = JSON.parse(storage?.getItem(CHECKOUT_DRAFT_KEY) ?? 'null');
  } catch {
    // brouillon illisible ou stockage refusé : on repart d'un formulaire vide
  }
  return { values: sanitizeCheckoutValues(raw?.values), gift: raw?.gift === true };
}

export function saveDraft(draft, storage = sessionStore()) {
  try {
    storage?.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ values: draft.values, gift: Boolean(draft.gift) }));
  } catch {
    // stockage indisponible : la saisie reste en mémoire
  }
}

export function clearDraft(storage = sessionStore()) {
  try {
    storage?.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    // rien à effacer
  }
}
