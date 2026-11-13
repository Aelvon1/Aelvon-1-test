// ---------------------------------------------------------------------------
// Atelier DAG — nuancier et options de fabrication.
// Source unique de vérité pour : le configurateur, les fiches produit et la
// scène 3D (src/three). Une ceinture est décrite par un `BeltConfig` fait
// uniquement d'identifiants ; `resolveBeltConfig` le traduit en valeurs
// concrètes (couleurs hex, largeur en mm…).
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BeltConfig
 * @property {string} leather        id de LEATHERS
 * @property {string} finish         id de FINISHES
 * @property {string} buckle         id de BUCKLES
 * @property {string} stitch         id de STITCHES
 * @property {30|35|38} width        largeur en mm (WIDTHS)
 * @property {string} [monogram]     0 à 3 caractères, déjà nettoyés
 * @property {string} [monogramStyle] id de MONOGRAM_STYLES
 * @property {string|null} [lining]  id de LEATHERS pour l'envers (réversible)
 */

export const LEATHERS = [
  { id: 'noir', name: 'Noir', hex: '#141312' },
  { id: 'ebene', name: 'Ébène', hex: '#2b1c15' },
  { id: 'marron', name: 'Marron', hex: '#4b2f22' },
  { id: 'cognac', name: 'Cognac', hex: '#8a4a24' },
  { id: 'tan', name: 'Tan', hex: '#b98a5a' },
  { id: 'navy', name: 'Bleu nuit', hex: '#1a2238' },
  { id: 'charbon', name: 'Gris charbon', hex: '#3a3a3c' },
  { id: 'bordeaux', name: 'Bordeaux', hex: '#4a1620' },
  { id: 'foret', name: 'Vert forêt', hex: '#1f3326' },
];

export const FINISHES = [
  { id: 'lisse', name: 'Lisse', description: 'Pleine fleur au grain fin, patine lumineuse.' },
  { id: 'graine', name: 'Grainé', description: 'Grain marqué, résiste aux marques du quotidien.' },
  { id: 'mat', name: 'Mat', description: 'Toucher velouté, aucun reflet.' },
];

export const BUCKLES = [
  { id: 'brosse', name: 'Acier brossé', hex: '#b9bbbe', surcharge: 0 },
  { id: 'poli', name: 'Acier poli', hex: '#e3e5e8', surcharge: 0 },
  { id: 'noir', name: 'Noir mat', hex: '#1c1c1e', surcharge: 0 },
  { id: 'antique', name: 'Acier antique', hex: '#6f675c', surcharge: 0 },
  { id: 'laiton', name: 'Laiton doré', hex: '#c9a96e', surcharge: 15 },
];

// hex === null → couture ton sur ton (prend la teinte du cuir, légèrement éclaircie)
// hex === false → aucune couture apparente (bords francs)
export const STITCHES = [
  { id: 'ton', name: 'Ton sur ton', hex: null },
  { id: 'ecru', name: 'Écru', hex: '#e6dcc8' },
  { id: 'or', name: 'Or', hex: '#c9a96e' },
  { id: 'noir', name: 'Noir', hex: '#141312' },
  { id: 'rouge', name: 'Rouge sellier', hex: '#8e1f1f' },
  { id: 'sans', name: 'Bords francs', hex: false },
];

// Espace insécable (\u00a0) entre le nombre et l'unité : « 35 mm » ne se coupe jamais en fin de ligne.
export const WIDTHS = [
  { id: 30, name: '30\u00a0mm', label: 'Habillée' },
  { id: 35, name: '35\u00a0mm', label: 'Classique' },
  { id: 38, name: '38\u00a0mm', label: 'Casual' },
];

export const MONOGRAM_STYLES = [
  { id: 'marque', name: 'Marquage à chaud', description: 'Empreinte ton sur ton, discrète.' },
  { id: 'or', name: 'Dorure or', description: 'Feuille dorée, posée à chaud.' },
  { id: 'argent', name: 'Dorure argent', description: 'Feuille argentée, posée à chaud.' },
];

// Longueurs en cm, mesurées de la boucle au trou central.
export const SIZES = ['80', '85', '90', '95', '100', '105', '110', '115', '120'];

export const DEFAULT_BELT = Object.freeze({
  leather: 'cognac',
  finish: 'lisse',
  buckle: 'brosse',
  stitch: 'ton',
  width: 35,
  monogram: '',
  monogramStyle: 'marque',
  lining: null,
});

/** Ceinture signature : celle du héros de la page d'accueil et des visuels de marque. */
export const HERO_BELT = Object.freeze({
  leather: 'cognac',
  finish: 'lisse',
  buckle: 'laiton',
  stitch: 'ton',
  width: 35,
  monogram: 'DAG',
  monogramStyle: 'or',
  lining: null,
});

const byId = (list, id) => list.find((entry) => String(entry.id) === String(id));

export const getLeather = (id) => byId(LEATHERS, id) ?? LEATHERS[0];
export const getFinish = (id) => byId(FINISHES, id) ?? FINISHES[0];
export const getBuckle = (id) => byId(BUCKLES, id) ?? BUCKLES[0];
export const getStitch = (id) => byId(STITCHES, id) ?? STITCHES[0];
export const getWidth = (id) => byId(WIDTHS, id) ?? WIDTHS[1];
export const getMonogramStyle = (id) => byId(MONOGRAM_STYLES, id) ?? MONOGRAM_STYLES[0];

/** Complète un BeltConfig partiel avec les valeurs par défaut et écarte les ids inconnus. */
export function normalizeBeltConfig(config = {}) {
  const merged = { ...DEFAULT_BELT, ...config };
  return {
    leather: getLeather(merged.leather).id,
    finish: getFinish(merged.finish).id,
    buckle: getBuckle(merged.buckle).id,
    stitch: getStitch(merged.stitch).id,
    width: getWidth(merged.width).id,
    monogram: typeof merged.monogram === 'string' ? merged.monogram : '',
    monogramStyle: getMonogramStyle(merged.monogramStyle).id,
    lining: merged.lining ? getLeather(merged.lining).id : null,
  };
}

/**
 * Traduit un BeltConfig en valeurs concrètes pour le rendu.
 * @param {Partial<BeltConfig>} config
 */
export function resolveBeltConfig(config = {}) {
  const c = normalizeBeltConfig(config);
  const leather = getLeather(c.leather);
  const stitch = getStitch(c.stitch);
  const buckle = getBuckle(c.buckle);
  return {
    ...c,
    leatherHex: leather.hex,
    liningHex: c.lining ? getLeather(c.lining).hex : leather.hex,
    buckleHex: buckle.hex,
    // null = ton sur ton, false = pas de couture, sinon couleur du fil
    stitchHex: stitch.hex,
    widthMm: c.width,
  };
}

/** Phrase courte décrivant une configuration, pour le panier et les récapitulatifs. */
export function describeBelt(config = {}) {
  const c = normalizeBeltConfig(config);
  const parts = [
    `Cuir ${getLeather(c.leather).name.toLowerCase()} ${getFinish(c.finish).name.toLowerCase()}`,
    `boucle ${getBuckle(c.buckle).name.toLowerCase()}`,
    c.stitch === 'sans' ? 'bords francs' : `couture ${getStitch(c.stitch).name.toLowerCase()}`,
    getWidth(c.width).name,
  ];
  if (c.lining) parts.push(`envers ${getLeather(c.lining).name.toLowerCase()}`);
  return parts.join(' · ');
}

/** Clé stable d'une configuration (égalité de deux ceintures sur-mesure). */
export function beltConfigKey(config = {}) {
  const c = normalizeBeltConfig(config);
  return [c.leather, c.finish, c.buckle, c.stitch, c.width, c.lining ?? '-', c.monogram || '-', c.monogram ? c.monogramStyle : '-'].join('.');
}
