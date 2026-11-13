// Petites aides de rédaction de la page d'accueil : les nombres viennent des données, jamais du texte.

const MOTS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze'];

/** 6 → « six » ; au-delà de douze, le nombre reste en chiffres. */
export const enLettres = (n) => MOTS[n] ?? String(n);

export const capitale = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1);

/** 1 → « 01 ». */
export const deuxChiffres = (n) => String(n).padStart(2, '0');

/**
 * « Lisse, grainé, mat » — ou « Lisse, grainé ou mat » avec `liaison`. Minuscules, initiale exceptée.
 * @param {string[]} noms
 * @param {string} [liaison]  mot placé avant le dernier nom (« ou », « et »)
 */
export function enumerer(noms, liaison) {
  const mots = noms.map((nom) => nom.toLowerCase());
  const dernier = liaison && mots.length > 1 ? mots.pop() : null;
  return capitale(dernier ? `${mots.join(', ')} ${liaison} ${dernier}` : mots.join(', '));
}

/** « 9 teintes » : le nombre et son nom restent sur la même ligne. */
export const compter = (n, nom) => `${n}\xa0${nom}`;
