import {
  BUCKLES,
  DEFAULT_BELT,
  FINISHES,
  LEATHERS,
  MONOGRAM_STYLES,
  SIZES,
  STITCHES,
  WIDTHS,
  normalizeBeltConfig,
} from '../data/atelier';
import { sanitizeMonogram } from './pricing';

// ---------------------------------------------------------------------------
// Une configuration de l'Atelier tient dans l'URL : /atelier?cuir=cognac&boucle=laiton…
// Ce module est le seul à connaître le nom des paramètres. Les autres pages
// passent par `atelierPath(config)` pour ouvrir l'Atelier sur une ceinture donnée.
// ---------------------------------------------------------------------------

export const ATELIER_PARAMS = Object.freeze({
  leather: 'cuir',
  finish: 'finition',
  buckle: 'boucle',
  stitch: 'couture',
  width: 'largeur',
  monogram: 'mono',
  monogramStyle: 'style',
  size: 'taille',
});

const OPTION_LISTS = {
  leather: LEATHERS,
  finish: FINISHES,
  buckle: BUCKLES,
  stitch: STITCHES,
  width: WIDTHS,
  monogramStyle: MONOGRAM_STYLES,
};

const findOption = (key, raw) => OPTION_LISTS[key].find((entry) => String(entry.id) === String(raw));

/**
 * Sérialise une configuration (et, si elle est connue, une taille).
 * Le monogramme et son style ne sont écrits que s'il y a un monogramme.
 * @returns {URLSearchParams}
 */
export function beltToSearchParams(config = {}, size) {
  const c = normalizeBeltConfig(config);
  const params = new URLSearchParams();
  params.set(ATELIER_PARAMS.leather, c.leather);
  params.set(ATELIER_PARAMS.finish, c.finish);
  params.set(ATELIER_PARAMS.buckle, c.buckle);
  params.set(ATELIER_PARAMS.stitch, c.stitch);
  params.set(ATELIER_PARAMS.width, String(c.width));
  const monogram = sanitizeMonogram(c.monogram);
  if (monogram) {
    params.set(ATELIER_PARAMS.monogram, monogram);
    params.set(ATELIER_PARAMS.monogramStyle, c.monogramStyle);
  }
  if (size != null && SIZES.includes(String(size))) params.set(ATELIER_PARAMS.size, String(size));
  return params;
}

/**
 * Lit une configuration depuis des paramètres d'URL. Les valeurs absentes ou
 * inconnues gardent celles de `base` : un lien abîmé n'ouvre jamais une ceinture incohérente.
 * @param {URLSearchParams|string} input
 * @param {object} [base] configuration de départ (DEFAULT_BELT par défaut)
 * @returns {{ config: object, size: string|null, hasConfig: boolean }}
 *   `hasConfig` : au moins un paramètre valide de l'Atelier était présent.
 */
export function searchParamsToBelt(input, base = DEFAULT_BELT) {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input ?? '');
  const config = { ...normalizeBeltConfig(base) };
  let hasConfig = false;

  for (const key of Object.keys(OPTION_LISTS)) {
    const raw = params.get(ATELIER_PARAMS[key]);
    if (raw == null) continue;
    const option = findOption(key, raw);
    if (!option) continue;
    config[key] = option.id;
    hasConfig = true;
  }

  const rawMonogram = params.get(ATELIER_PARAMS.monogram);
  if (rawMonogram != null) {
    config.monogram = sanitizeMonogram(rawMonogram);
    hasConfig = hasConfig || config.monogram !== '';
  }

  const rawSize = params.get(ATELIER_PARAMS.size);
  const size = rawSize != null && SIZES.includes(rawSize) ? rawSize : null;

  return { config, size, hasConfig };
}

/** Lien vers l'Atelier, ouvert sur `config` si elle est fournie. */
export function atelierPath(config, size) {
  if (!config) return '/atelier';
  return `/atelier?${beltToSearchParams(config, size).toString()}`;
}
