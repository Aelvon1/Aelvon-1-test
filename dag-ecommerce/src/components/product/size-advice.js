// Conseil de taille du tiroir « Guide des tailles » : lecture de la saisie, écriture des longueurs,
// et ce qu'il reste à proposer quand la longueur idéale sort des tailles du modèle.
import { SIZES as ATELIER_SIZES } from '../../data/atelier';
import { WAIST_MAX_CM, recommendSize } from '../../lib/sizing';

const CM = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** 100.5 → « 100,5 » : une longueur en centimètres, écrite à la française. */
export const formatCm = (value) => CM.format(value);

/** Tour de taille saisi (« 85 », « 85,5 ») → nombre ; NaN si la saisie est vide ou n'est pas un nombre. */
export function parseWaist(text) {
  const entry = String(text ?? '').trim().replace(',', '.');
  return entry === '' ? Number.NaN : Number(entry);
}

/**
 * La saisie dépasse-t-elle déjà le plus grand tour de taille accepté ? Elle ne redeviendra pas
 * valide en tapant davantage : l'erreur peut s'afficher sans attendre. Une valeur trop petite, elle,
 * est peut-être inachevée (« 8 » avant « 85 ») et ne se juge qu'une fois la saisie terminée.
 */
export const waistTooLarge = (text) => parseWaist(text) > WAIST_MAX_CM;

/**
 * Taille conseillée pour un tour de taille parmi celles d'un modèle (voir recommendSize).
 * @param {number} waistCm
 * @param {string[]} sizes  tailles du modèle
 * @returns {{ size: string, ideal: number, exact: boolean, outOfRange: boolean, atelier: boolean } | null}
 *   atelier : la longueur idéale sort des tailles du modèle, mais l'Atelier la réalise
 */
export function sizeAdvice(waistCm, sizes) {
  const result = recommendSize(waistCm, sizes);
  if (!result) return null;
  const custom = result.outOfRange ? recommendSize(waistCm, ATELIER_SIZES) : null;
  return { ...result, atelier: Boolean(custom && !custom.outOfRange) };
}
