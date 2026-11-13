// Chapitre « Anatomie » : textes, cadrages 3D et visuels fixes de repli.
// Tout ce qui est chiffré ou nommé vient du nuancier (data/atelier.js) et du catalogue.
import {
  BUCKLES,
  FINISHES,
  HERO_BELT,
  LEATHERS,
  MONOGRAM_STYLES,
  STITCHES,
  getBuckle,
  getFinish,
  getLeather,
  getMonogramStyle,
  getStitch,
  normalizeBeltConfig,
} from '../../data/atelier';
import { findColor, findProduct, productImage } from '../../data/products';
import { asset } from '../../lib/assets';
import { MAX_MONOGRAM_LENGTH } from '../../lib/pricing';
import { compter, enLettres, enumerer } from './texte';

export const POSTER_HERO = asset('renders/poster-hero.webp');

export const INTRO = {
  eyebrow: 'Anatomie',
  title: 'Une ceinture,\nvue de *près*.',
  lead: 'Quatre détails, un par un.',
};

/** Rendu du catalogue servant de visuel fixe, avec la ceinture qu'il montre. */
function still(slug, colorValue, shot, alt, position) {
  const product = findProduct(slug);
  const color = findColor(product, colorValue);
  return {
    src: productImage(product, color.value, shot),
    belt: color.belt,
    caption: `${product.name}, ${color.name.toLowerCase()}`,
    alt,
    position,
  };
}

/**
 * Les quatre chapitres. `view` : cadrage de la scène 3D · `still` : visuel fixe affiché quand la
 * scène n'est pas disponible (ou que l'utilisateur préfère moins d'animations).
 */
export const CHAPTERS = [
  {
    id: 'cuir',
    view: 'cuir',
    title: 'Le cuir',
    text: `Un cuir pleine fleur, choisi pour son grain régulier. ${enumerer(FINISHES.map((finish) => finish.name), 'ou')}, il se patine à mesure qu’il est porté.`,
    still: still('essential', 'cognac', 'detail', 'Le grain d’un cuir cognac pleine fleur et sa couture, vus de près', 'bottom'),
  },
  {
    id: 'couture',
    view: 'couture',
    title: 'La couture',
    text: 'Une couture sellier, à distance constante du bord. Le point est serré, régulier. Les tranches sont poncées, teintées, puis lissées.',
    still: still('texture', 'marron-texture', 'detail', 'Couture écrue le long d’un cuir grainé marron'),
  },
  {
    id: 'boucle',
    view: 'boucle',
    title: 'La boucle',
    text: 'Acier brossé, poli, antique ou noir mat\xa0; laiton doré à l’Atelier. L’ardillon est plein et tombe juste dans chaque cran. La boucle se monte en dernier, quand le cuir est prêt.',
    still: still('essential', 'cognac', 'boucle', 'Boucle en acier brossé montée sur un cuir cognac'),
  },
  {
    id: 'monogramme',
    view: 'monogramme',
    title: 'Le monogramme',
    text: `Vos initiales, jusqu’à ${enLettres(MAX_MONOGRAM_LENGTH)} caractères. Marquées à chaud ou dorées à la feuille.`,
    still: {
      src: POSTER_HERO,
      belt: HERO_BELT,
      caption: 'Ceinture de l’Atelier, cognac',
      alt: 'Ceinture en cuir cognac roulée, boucle en laiton doré, marquée des initiales DAG à la dorure or',
      dark: true,
    },
  },
];

/**
 * Ligne de données d'un chapitre pour une ceinture donnée : ce que l'on voit, et ce que l'on peut choisir.
 * @param {string} id      identifiant du chapitre
 * @param {object} belt    BeltConfig de la ceinture affichée
 * @returns {Array<{ label: string, value: string }>}
 */
export function chapterFacts(id, belt) {
  const c = normalizeBeltConfig(belt);
  const threads = STITCHES.filter((stitch) => stitch.hex !== false);
  switch (id) {
    case 'cuir':
      return [
        { label: 'Ici', value: `${getLeather(c.leather).name}, ${getFinish(c.finish).name.toLowerCase()}` },
        { label: 'Au choix', value: `${compter(LEATHERS.length, 'teintes')}, ${compter(FINISHES.length, 'finitions')}` },
      ];
    case 'couture':
      return [
        { label: 'Ici', value: getStitch(c.stitch).name },
        { label: 'Au choix', value: `${compter(threads.length, 'fils')}, ou bords francs` },
      ];
    case 'boucle':
      return [
        { label: 'Ici', value: getBuckle(c.buckle).name },
        { label: 'Au choix', value: compter(BUCKLES.length, 'boucles') },
      ];
    case 'monogramme':
      return [
        {
          label: 'Ici',
          value: c.monogram ? `${c.monogram}, ${getMonogramStyle(c.monogramStyle).name.toLowerCase()}` : 'Sans monogramme',
        },
        { label: 'Au choix', value: enumerer(MONOGRAM_STYLES.map((style) => style.name)) },
      ];
    default:
      return [];
  }
}
