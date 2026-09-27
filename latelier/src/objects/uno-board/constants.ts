/**
 * Constantes géométriques de la carte « ATELIER-328 » (format et architecture d'une carte
 * de développement Uno R3, matériel libre).
 *
 * Deux repères coexistent :
 * - repère CARTE (données de `layout.ts`, en mm) : origine au coin inférieur gauche, X vers la
 *   droite, Y vers le haut du plan de la carte, connecteur USB-B à gauche ;
 * - repère OBJET (three.js, en m) : Y vers le haut, carte posée à plat, centrée en X/Z.
 *   X objet = (X carte − 34,29) mm ; Z objet = −(Y carte − 26,67) mm.
 *
 * Empilement vertical (m) : les queues des broches traversantes reposent sur y = 0 ; la
 * sérigraphie inférieure est à 2,00 mm, puis vernis, cuivre inférieur, âme FR4, cuivre
 * supérieur, vernis et sérigraphie supérieurs.
 */

/** Identifiant de l'objet (préfixe obligatoire des textures et matériaux propres). */
export const OBJECT_ID = 'uno-board';

/** Largeur de la carte (mm) : 2,7 po. */
export const BOARD_W = 68.58;
/** Hauteur de la carte (mm) : 2,1 po. */
export const BOARD_H = 53.34;
/** Centre de la carte dans le repère carte (mm). */
export const BOARD_CX = BOARD_W / 2;
export const BOARD_CY = BOARD_H / 2;

/** Millimètre → mètre. */
export const MM = 0.001;

// --- Épaisseurs réelles (m) ------------------------------------------------------------------

/** Âme FR4 (stratifié verre-époxy) : 1,51 mm, soit ≈ 1,6 mm fini avec cuivre et vernis. */
export const T_CORE = 1.51e-3;
/** Cuivre 35 µm (1 oz/ft²). */
export const T_CU = 35e-6;
/** Vernis épargne ≈ 20 µm sur le cuivre. */
export const T_MASK = 20e-6;
/** Encre de sérigraphie ≈ 10 µm. */
export const T_SILK = 10e-6;
/** Étamage HASL moyen ≈ 12 µm (bombé). */
export const T_HASL = 12e-6;
/** Épaisseur de brasure sous un composant CMS (joint) ≈ 40 µm. */
export const T_JOINT = 40e-6;
/** Épaisseur de la métallisation des trous (fût de cuivre) ≈ 25 µm. */
export const T_PLATING = 25e-6;

/** Longueur des queues de broches traversantes sous la carte (typique, après coupe) : 2 mm. */
export const TAIL = 2.0e-3;

// --- Plans de référence (y, repère objet, m) -------------------------------------------------

/** Face extérieure de la sérigraphie inférieure. */
export const Y_SILK_B = TAIL;
/** Face extérieure du vernis inférieur. */
export const Y_MASK_B = Y_SILK_B + T_SILK;
/** Face extérieure du cuivre inférieur. */
export const Y_CU_B = Y_MASK_B + T_MASK;
/** Face inférieure de l'âme FR4. */
export const Y_CORE_B = Y_CU_B + T_CU;
/** Face supérieure de l'âme FR4. */
export const Y_CORE_T = Y_CORE_B + T_CORE;
/** Face extérieure du cuivre supérieur. */
export const Y_CU_T = Y_CORE_T + T_CU;
/** Face extérieure du vernis supérieur. */
export const Y_MASK_T = Y_CU_T + T_MASK;
/** Face extérieure de la sérigraphie supérieure. */
export const Y_SILK_T = Y_MASK_T + T_SILK;

/**
 * Repère LOCAL d'un composant : origine sur le plan du cuivre supérieur (`Y_CU_T`), au centre de
 * l'empreinte. Hauteurs locales utiles (m) :
 */
/** Dessus des pastilles étamées (surface de brasage). */
export const L_PAD_TOP = T_HASL;
/** Assise d'un composant CMS (dessous du boîtier). */
export const L_SMD_SEAT = T_HASL + T_JOINT;
/** Assise d'un composant traversant posé sur le vernis. */
export const L_THT_SEAT = T_MASK;
/** Surface des pastilles inférieures (étain), vers le bas. */
export const L_BOTTOM_PAD = Y_CU_B - T_HASL - Y_CU_T;
/** Extrémité des queues de broches (plan y = 0 de l'objet). */
export const L_TAIL_END = -Y_CU_T;

/** Conversion repère carte (mm) → repère objet (m) pour X. */
export const boardX = (x: number): number => (x - BOARD_CX) * MM;
/** Conversion repère carte (mm) → repère objet (m) pour Z. */
export const boardZ = (y: number): number => -(y - BOARD_CY) * MM;
/** Conversion d'un angle de rotation carte (degrés, sens trigonométrique vu de dessus) en rotation Y (rad). */
export const boardRot = (deg: number): number => (deg * Math.PI) / 180;
