import { asset } from '../lib/assets';

// ---------------------------------------------------------------------------
// Catalogue DAG.
// Chaque coloris porte un `belt` (BeltConfig, voir data/atelier.js) : c'est lui
// qui pilote la scène 3D et les visuels pré-rendus de /public/renders.
// ---------------------------------------------------------------------------

/** Plans disponibles pour chaque coloris, dans l'ordre de la galerie. */
export const SHOTS = [
  { id: 'studio', label: 'Vue studio' },
  { id: 'boucle', label: 'La boucle' },
  { id: 'detail', label: 'Le cuir et la couture' },
];

const SIZES_STANDARD = ['85', '90', '95', '100', '105', '110'];

export const products = [
  {
    id: 1,
    slug: 'essential',
    name: 'DAG Essential',
    collection: 'Essential',
    badge: 'Iconique',
    tagline: 'L’intemporelle.',
    description: 'La ceinture intemporelle. Cuir pleine fleur, boucle classique, finition irréprochable.',
    longDescription:
      'Notre modèle emblématique. Confectionnée en cuir pleine fleur sélectionné, la DAG Essential incarne l’élégance discrète. Sa boucle en acier brossé et ses coutures précises garantissent une tenue parfaite, jour après jour. Conçue pour durer, elle accompagne toutes vos tenues avec sobriété.',
    details: [
      'Cuir pleine fleur, tannage lent',
      'Boucle en acier brossé, ardillon plein',
      'Couture sellier ton sur ton',
      'Cinq crans espacés de 2,5 cm',
    ],
    price: 89,
    material: 'Cuir pleine fleur',
    width: '35 mm',
    buckle: 'Acier brossé',
    colors: [
      { name: 'Noir', value: 'noir', hex: '#141312', belt: { leather: 'noir', finish: 'lisse', buckle: 'brosse', stitch: 'ton', width: 35 } },
      { name: 'Marron', value: 'marron', hex: '#4b2f22', belt: { leather: 'marron', finish: 'lisse', buckle: 'brosse', stitch: 'ton', width: 35 } },
      { name: 'Cognac', value: 'cognac', hex: '#8a4a24', belt: { leather: 'cognac', finish: 'lisse', buckle: 'brosse', stitch: 'ton', width: 35 } },
    ],
    sizes: SIZES_STANDARD,
    stock: true,
    featured: true,
  },
  {
    id: 2,
    slug: 'matte',
    name: 'DAG Matte',
    collection: 'Matte',
    badge: 'Nouveau',
    tagline: 'L’urbaine.',
    description: 'Look urbain, finition mate. La ceinture qui s’adapte à votre style moderne.',
    longDescription:
      'Pour un style plus contemporain. La DAG Matte adopte une boucle noire mate qui apporte une touche résolument urbaine. Son cuir au toucher velouté offre résistance et caractère, parfait pour un quotidien actif sans compromis sur l’élégance.',
    details: [
      'Cuir premium, finition mate veloutée',
      'Boucle en acier noir mat, traitement anti-rayures',
      'Couture ton sur ton',
      'Tranches teintées à la main',
    ],
    price: 95,
    material: 'Cuir premium finition mate',
    width: '35 mm',
    buckle: 'Acier noir mat',
    colors: [
      { name: 'Noir mat', value: 'noir-mat', hex: '#141312', belt: { leather: 'noir', finish: 'mat', buckle: 'noir', stitch: 'ton', width: 35 } },
      { name: 'Gris charbon', value: 'charbon', hex: '#3a3a3c', belt: { leather: 'charbon', finish: 'mat', buckle: 'noir', stitch: 'ton', width: 35 } },
    ],
    sizes: SIZES_STANDARD,
    stock: true,
    featured: true,
  },
  {
    id: 3,
    slug: 'texture',
    name: 'DAG Texture',
    collection: 'Texture',
    tagline: 'Le caractère.',
    description: 'Cuir grainé robuste. Pour un style casual et authentique.',
    longDescription:
      'Le caractère à l’état pur. La DAG Texture mise sur un cuir grainé expressif qui gagne en patine avec le temps. Plus robuste, elle est pensée pour un usage quotidien intensif tout en conservant une allure soignée. Idéale pour les tenues décontractées.',
    details: [
      'Cuir grainé italien, grain marqué',
      'Boucle en acier antique',
      'Couture contrastée écrue',
      'Largeur généreuse de 38 mm',
    ],
    price: 92,
    material: 'Cuir grainé italien',
    width: '38 mm',
    buckle: 'Acier antique',
    colors: [
      { name: 'Marron texturé', value: 'marron-texture', hex: '#4b2f22', belt: { leather: 'marron', finish: 'graine', buckle: 'antique', stitch: 'ecru', width: 38 } },
      { name: 'Noir texturé', value: 'noir-texture', hex: '#141312', belt: { leather: 'noir', finish: 'graine', buckle: 'antique', stitch: 'ton', width: 38 } },
      { name: 'Tan', value: 'tan', hex: '#b98a5a', belt: { leather: 'tan', finish: 'graine', buckle: 'antique', stitch: 'ecru', width: 38 } },
    ],
    sizes: SIZES_STANDARD,
    stock: true,
    featured: true,
  },
  {
    id: 4,
    slug: 'dress',
    name: 'DAG Dress',
    collection: 'Dress',
    tagline: 'L’habillée.',
    description: 'Fine et élégante. L’essentiel pour les occasions formelles.',
    longDescription:
      'La discrétion absolue pour vos tenues formelles. Plus fine (30 mm), la DAG Dress est pensée pour accompagner vos costumes avec élégance. Son cuir lisse et sa boucle ultra-propre garantissent une allure impeccable en toutes circonstances.',
    details: [
      'Cuir lisse premium, main souple',
      'Boucle en acier poli miroir',
      'Largeur fine de 30 mm, pensée pour le costume',
      'Couture ton sur ton, point serré',
    ],
    price: 99,
    material: 'Cuir lisse premium',
    width: '30 mm',
    buckle: 'Acier poli',
    colors: [
      { name: 'Noir', value: 'noir', hex: '#141312', belt: { leather: 'noir', finish: 'lisse', buckle: 'poli', stitch: 'ton', width: 30 } },
      { name: 'Marron foncé', value: 'ebene', hex: '#2b1c15', belt: { leather: 'ebene', finish: 'lisse', buckle: 'poli', stitch: 'ton', width: 30 } },
    ],
    sizes: ['85', '90', '95', '100', '105'],
    stock: true,
    featured: false,
  },
  {
    id: 5,
    slug: 'everyday',
    name: 'DAG Everyday',
    collection: 'Everyday',
    tagline: 'La polyvalente.',
    description: 'Polyvalente. La ceinture qui passe partout, tous les jours.',
    longDescription:
      'Le compromis parfait. La DAG Everyday est conçue pour s’adapter à toutes vos tenues, du jean brut au chino habillé. Ni trop fine, ni trop large, elle incarne l’équilibre entre élégance et praticité. Votre alliée du quotidien.',
    details: [
      'Cuir italien souple dès le premier jour',
      'Boucle en acier brossé',
      'Couture contrastée sur les coloris marron et bleu nuit',
      'Passe du jean brut au chino habillé',
    ],
    price: 85,
    material: 'Cuir italien',
    width: '35 mm',
    buckle: 'Acier brossé',
    colors: [
      { name: 'Noir', value: 'noir', hex: '#141312', belt: { leather: 'noir', finish: 'graine', buckle: 'brosse', stitch: 'ton', width: 35 } },
      { name: 'Marron', value: 'marron', hex: '#4b2f22', belt: { leather: 'marron', finish: 'graine', buckle: 'brosse', stitch: 'ecru', width: 35 } },
      { name: 'Navy', value: 'navy', hex: '#1a2238', belt: { leather: 'navy', finish: 'graine', buckle: 'brosse', stitch: 'ecru', width: 35 } },
    ],
    sizes: SIZES_STANDARD,
    stock: true,
    featured: false,
  },
  {
    id: 6,
    slug: 'reversible',
    name: 'DAG Reversible',
    collection: 'Essential',
    tagline: 'Deux en une.',
    description: 'Deux ceintures en une. Noir d’un côté, marron de l’autre.',
    longDescription:
      'L’intelligence pratique. Notre ceinture réversible offre deux looks en un seul accessoire. Un système de boucle ingénieux permet de passer du noir au marron en un geste. Parfaite pour les voyages ou pour simplifier votre garde-robe.',
    details: [
      'Double cuir pleine fleur, noir et marron',
      'Boucle pivotante en acier brossé',
      'Se retourne en un geste, sans outil',
      'Idéale en voyage : une ceinture, deux tenues',
    ],
    price: 105,
    material: 'Double cuir pleine fleur',
    width: '35 mm',
    buckle: 'Acier brossé pivotant',
    colors: [
      { name: 'Noir / Marron', value: 'noir-marron', hex: '#141312', hex2: '#4b2f22', belt: { leather: 'noir', finish: 'lisse', buckle: 'brosse', stitch: 'ton', width: 35, lining: 'marron' } },
    ],
    sizes: SIZES_STANDARD,
    stock: true,
    featured: true,
  },
];

export const collections = [
  { name: 'Essential', description: 'Les intemporels qui forment la base d’une garde-robe maîtrisée.' },
  { name: 'Matte', description: 'Look urbain et moderne avec finitions mates.' },
  { name: 'Texture', description: 'Caractère et robustesse pour un style casual authentique.' },
  { name: 'Dress', description: 'Élégance discrète pour les occasions formelles.' },
  { name: 'Everyday', description: 'Polyvalence maximale pour le quotidien.' },
];

/** Retrouve un produit par id numérique ou par slug (paramètre d'URL). */
export function findProduct(param) {
  if (param == null) return undefined;
  const key = String(param).toLowerCase();
  return products.find((p) => String(p.id) === key || p.slug === key);
}

export const productPath = (product) => `/product/${product.slug}`;

export function findColor(product, value) {
  return product.colors.find((c) => c.value === value) ?? product.colors[0];
}

/**
 * URL d'un visuel pré-rendu : /renders/{slug}-{coloris}-{plan}.webp
 * (générés par `npm run renders`, voir scripts/render-products.mjs).
 */
export function productImage(product, colorValue, shot = 'studio') {
  const color = findColor(product, colorValue);
  return asset(`renders/${product.slug}-${color.value}-${shot}.webp`);
}

/** Galerie complète d'un coloris, dans l'ordre de SHOTS. */
export function productGallery(product, colorValue) {
  return SHOTS.map((shot) => ({
    ...shot,
    src: productImage(product, colorValue, shot.id),
    alt: `${product.name} ${findColor(product, colorValue).name} — ${shot.label.toLowerCase()}`,
  }));
}

/** Toutes les variantes (produit × coloris) du catalogue — sert au script de rendu. */
export function allVariants() {
  return products.flatMap((product) =>
    product.colors.map((color) => ({ slug: product.slug, color: color.value, belt: color.belt })),
  );
}
