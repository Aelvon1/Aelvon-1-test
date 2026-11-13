// Aides partagées par la boutique, la fiche produit et les favoris.
// Aucune donnée ici : tout est dérivé de data/products.js, data/atelier.js et lib/pricing.js.
import { productPath, products } from '../../data/products';

/** Paramètre d'URL qui porte le coloris choisi (« ?couleur=cognac »). */
export const COLOR_PARAM = 'couleur';
// ancien nom, encore écrit par la tuile du design system : lu, jamais écrit
const LEGACY_COLOR_PARAM = 'coloris';

/** Coloris demandé par l'URL (ou null). */
export function readColorParam(searchParams) {
  return searchParams.get(COLOR_PARAM) ?? searchParams.get(LEGACY_COLOR_PARAM);
}

/** Copie de `searchParams` avec le coloris posé (le premier coloris, par défaut, n'est pas écrit). */
export function withColorParam(searchParams, product, colorValue) {
  const next = new URLSearchParams(searchParams);
  next.delete(LEGACY_COLOR_PARAM);
  if (!colorValue || colorValue === product.colors[0].value) next.delete(COLOR_PARAM);
  else next.set(COLOR_PARAM, colorValue);
  return next;
}

/** Lien vers la fiche d'un produit, dans le coloris voulu. */
export function productUrl(product, colorValue) {
  const query = withColorParam('', product, colorValue).toString();
  return query ? `${productPath(product)}?${query}` : productPath(product);
}

/** Paramètre d'URL d'une collection (« ?collection=essential », comme dans le pied de page). */
export const collectionSlug = (name) => String(name).toLowerCase();

export const collectionUrl = (name) => `/shop?collection=${encodeURIComponent(collectionSlug(name))}`;

/** Tris proposés par la boutique ; le premier est celui par défaut (absent de l'URL). */
export const SORTS = [
  { value: 'selection', label: 'Sélection de la maison' },
  { value: 'prix-croissant', label: 'Prix croissant' },
  { value: 'prix-decroissant', label: 'Prix décroissant' },
];

export const SORT_PARAM = 'tri';

/** Trie sans muter. « selection » : les modèles phares d'abord, puis l'ordre du catalogue. */
export function sortProducts(list, sort) {
  const sorted = [...list];
  if (sort === 'prix-croissant') return sorted.sort((a, b) => a.price - b.price || a.id - b.id);
  if (sort === 'prix-decroissant') return sorted.sort((a, b) => b.price - a.price || a.id - b.id);
  return sorted.sort((a, b) => Number(b.featured) - Number(a.featured) || a.id - b.id);
}

/** Jusqu'à `limit` autres modèles : même collection d'abord, puis les modèles phares, puis le reste. */
export function relatedProducts(product, limit = 3) {
  const others = products.filter((entry) => entry.id !== product.id);
  const rank = (entry) => (entry.collection === product.collection ? 0 : entry.featured ? 1 : 2);
  return others.sort((a, b) => rank(a) - rank(b) || a.id - b.id).slice(0, limit);
}

const WORDS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf', 'vingt',
];

/** 6 → « six » (en toutes lettres jusqu'à vingt, en chiffres au-delà). */
export function numberWord(n, { feminine = false } = {}) {
  if (n === 1 && feminine) return 'une';
  return WORDS[n] ?? String(n);
}

export const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** « 1 modèle », « 6 modèles ». */
export const countLabel = (n, singular, plural = `${singular}s`) => `${n}\xa0${n > 1 ? plural : singular}`;

/** « six modèles » — en toutes lettres. */
export const countWords = (n, singular, plural = `${singular}s`, options) =>
  `${numberWord(n, options)} ${n > 1 ? plural : singular}`;

/** « 85 à 110 cm » pour la liste de tailles d'un modèle. */
export function sizeRange(sizes) {
  const values = sizes.map(Number).sort((a, b) => a - b);
  return `${values[0]} à ${values[values.length - 1]}\xa0cm`;
}

/**
 * Données structurées schema.org d'un produit.
 * @param {object} product  entrée de data/products.js
 * @param {{ url: string, images: string[] }} context  URL absolue de la fiche et de ses visuels
 */
export function productJsonLd(product, { url, images }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.longDescription ?? product.description,
    image: images,
    brand: { '@type': 'Brand', name: 'DAG' },
    category: 'Ceintures',
    material: product.material,
    color: product.colors.map((color) => color.name).join(', '),
    offers: {
      '@type': 'Offer',
      url,
      price: product.price.toFixed(2),
      priceCurrency: 'EUR',
      availability: product.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'FR',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnFees: 'https://schema.org/FreeReturn',
      },
    },
  };
}
