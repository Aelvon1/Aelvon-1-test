/** Assemble des classes CSS en ignorant les valeurs vides : cn('a', cond && 'b'). */
export function cn(...parts) {
  return parts.flat().filter(Boolean).join(' ');
}

// Utilitaires Tailwind qui fixent la propriété `display`.
const DISPLAY_UTILITIES = new Set([
  'hidden',
  'block',
  'inline',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'contents',
  'flow-root',
  'list-item',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-footer-group',
  'table-header-group',
  'table-row',
  'table-row-group',
]);

/**
 * Variantes d'une classe qui règle `display` (« sm:hover:hidden » → « sm:hover: », « flex » → « »),
 * ou null si la classe règle autre chose. Les deux-points entre crochets ou parenthèses
 * (« [&_a]:flex », « supports-[display:grid]:grid ») ne séparent pas une variante.
 */
function displayVariants(token) {
  let depth = 0;
  let cut = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === '[' || char === '(') depth += 1;
    else if (char === ']' || char === ')') depth -= 1;
    else if (char === ':' && depth === 0) cut = index + 1;
  }
  // « ! » de priorité : en fin (Tailwind 4) ou en tête (ancienne écriture)
  const utility = token.slice(cut).replace(/^!|!$/g, '');
  const sets = DISPLAY_UTILITIES.has(utility) || /^\[display:[^\]]+\]$/.test(utility);
  return sets ? token.slice(0, cut) : null;
}

const tokens = (value) => cn(value).split(/\s+/).filter(Boolean);

/**
 * Classes par défaut d'un composant, moins celles qui règlent `display` quand l'appelant en
 * fournit une pour les mêmes variantes : `className="hidden sm:inline-flex"` masque vraiment
 * un bouton dont le défaut est « inline-flex ». Sans cela, deux utilitaires `display` de même
 * rang se départagent par leur ordre dans la feuille de styles, pas par l'intention de l'appelant.
 * Une classe à variante (« sm:hidden ») s'applique déjà après le défaut sans variante : il est conservé.
 *
 *   cn(yieldDisplay('inline-flex items-center', className), className)
 *
 * @param {string|Array} defaults  classes du composant
 * @param {string|Array} [className]  classes de l'appelant
 * @returns {string} les classes par défaut à conserver
 */
export function yieldDisplay(defaults, className) {
  const claimed = new Set(tokens(className).map(displayVariants).filter((variants) => variants !== null));
  if (claimed.size === 0) return cn(defaults);
  return tokens(defaults)
    .filter((token) => !claimed.has(displayVariants(token)))
    .join(' ');
}
