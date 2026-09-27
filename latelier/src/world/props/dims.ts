/**
 * Cotes de détail des accessoires, DÉRIVÉES du plan `layout.ts` (qui reste la source unique des
 * volumes et emplacements partagés : établi, tapis, étagères, servante, bureau, table RC,
 * emplacements ponctuels). Unités : mètres, repère monde (Y vers le haut, Z nord → sud).
 *
 * Ce module est PUR (aucune dépendance à three.js) : il est lu par les constructeurs de
 * géométrie, par les spécifications de collisions et par les tests.
 */
import {
  BENCH,
  ELECTRONICS_DESK,
  MAT,
  PEGBOARD,
  RC_TABLE,
  ROOM,
  RUG,
  SHELVES,
  SPOTS,
  TOOL_CART,
} from '../layout';

export type Vec2Tuple = readonly [number, number];
export type Vec3Tuple = readonly [number, number, number];

/** Hauteur du plateau de l'établi. */
export const BENCH_TOP = BENCH.topHeight;

/** Centre (x, z), lacet (rad) et encombrement [largeur X, hauteur, profondeur Z] d'un appareil posé. */
export interface Placement {
  center: Vec2Tuple;
  yaw: number;
  size: Vec3Tuple;
}

/**
 * Appareils et petits outils posés sur l'établi. Le tapis (zone `MAT`) reste DÉGAGÉ : l'objet
 * inspecté y est posé. Zone gauche (x < tapis) : soudage ; zone droite : mesure ; derrière le
 * tapis : casier à composants.
 */
export const BENCH_ITEMS = {
  /** Oscilloscope analogique, légèrement tourné vers le poste de travail. */
  scope: { center: [-0.225, -1.79], yaw: -0.12, size: [0.3, 0.155, 0.32] },
  /** Alimentation de laboratoire. */
  psu: { center: [0.07, -1.8], yaw: -0.2, size: [0.21, 0.115, 0.25] },
  /** Multimètre couché sur sa béquille, pointes branchées sur l'alimentation. */
  multimeter: { center: [0.035, -1.5], yaw: -0.32, size: [0.09, 0.045, 0.18] },
  /** Casier à tiroirs transparents (3 colonnes × 5 rangées), derrière le tapis. */
  drawerCabinet: { center: [-0.86, -1.9], yaw: 0, size: [0.3, 0.225, 0.134] },
  /** Station de soudage (bouton de réglage, voyant de chauffe). */
  solderStation: { center: [-1.17, -1.865], yaw: 0.08, size: [0.16, 0.105, 0.19] },
  /** Support de fer (spirale + éponge) devant la station. */
  ironHolder: { center: [-1.19, -1.6], yaw: 0.25, size: [0.1, 0.09, 0.14] },
  /** Station à air chaud (afficheur de température). */
  hotAir: { center: [-1.405, -1.865], yaw: 0.05, size: [0.2, 0.125, 0.22] },
  /** Berceau de la poignée à air chaud. */
  hotAirCradle: { center: [-1.46, -1.63], yaw: 0.45, size: [0.09, 0.06, 0.07] },
  /** Étau d'établi à l'angle avant gauche (mors en saillie du chant avant). */
  vise: { center: [-1.62, -1.35], yaw: 0, size: [0.13, 0.12, 0.26] },
  /** Dévidoir de bobine d'étain. */
  solderSpool: { center: [-1.345, -1.5], yaw: 0.3, size: [0.08, 0.1, 0.08] },
  /** Flacon de flux. */
  flux: { center: [-1.265, -1.425], yaw: 0.9, size: [0.05, 0.08, 0.05] },
  /** Pompe à dessouder couchée. */
  pump: { center: [-1.315, -1.325], yaw: 0.16, size: [0.2, 0.03, 0.03] },
  /** Bobine de tresse à dessouder. */
  braid: { center: [-1.47, -1.46], yaw: 0.4, size: [0.06, 0.02, 0.06] },
  /** Brucelles couchées au bord du tapis. */
  tweezers: { center: [-1.135, -1.43], yaw: 1.47, size: [0.012, 0.01, 0.12] },
} as const satisfies Record<string, Placement>;

/** Pas et origine des trous du panneau perforé (voir `PEGBOARD`). */
export const PEG = {
  spacing: PEGBOARD.holeSpacing,
  /** Nombre de trous complets en X et en Y. */
  cols: Math.floor((PEGBOARD.x[1] - PEGBOARD.x[0]) / PEGBOARD.holeSpacing),
  rows: Math.floor((PEGBOARD.y[1] - PEGBOARD.y[0]) / PEGBOARD.holeSpacing),
  /** Face avant du panneau. */
  z: PEGBOARD.z,
} as const;

/** Centre X du trou de colonne `i`. */
export function holeX(i: number): number {
  return PEGBOARD.x[0] + (i + 0.5) * PEGBOARD.holeSpacing;
}

/** Centre Y du trou de rangée `j`. */
export function holeY(j: number): number {
  return PEGBOARD.y[0] + (j + 0.5) * PEGBOARD.holeSpacing;
}

/** Étagère métallique à cornières perforées (mur est). */
export const SHELF_UNIT = {
  x: SHELVES.x,
  z: SHELVES.z,
  height: SHELVES.height,
  /** Dessus des tablettes (m). */
  levels: [0.08, 0.6, 1.02, 1.42, 1.84] as const,
  /** Aile des cornières (m). */
  angle: 0.038,
  /** Épaisseur de tôle. */
  sheet: 0.0018,
} as const;

/** Servante d'atelier (tiroirs vers le sud, poignée de poussée côté est). */
export const CART = {
  x: TOOL_CART.x,
  z: TOOL_CART.z,
  height: TOOL_CART.height,
  /** Hauteur des roulettes. */
  casterHeight: 0.1,
  /** Hauteur des façades de tiroirs, de haut en bas. */
  drawers: [0.075, 0.075, 0.11, 0.15, 0.2] as const,
  /** Tiroir entrouvert (indice) et ouverture (m). */
  openDrawer: 1,
  openBy: 0.07,
  /** Poignée de poussée : saillie côté est. */
  handleOut: 0.055,
} as const;

/** Bureau du coin électronique (plateau bois, pieds métalliques, tiroir). */
export const DESK = {
  x: ELECTRONICS_DESK.x,
  z: ELECTRONICS_DESK.z,
  height: ELECTRONICS_DESK.height,
  topThickness: 0.028,
} as const;

/** Radio-cassette posée sur le bureau, face vers l'est (+X). */
export const RADIO = {
  /** Centre de la base. */
  base: SPOTS.radio,
  /** Largeur, hauteur du boîtier (poignée non comprise), profondeur. */
  size: [0.44, 0.2, 0.11] as const,
  /** Lacet : légère orientation vers le centre de la pièce. */
  yaw: -0.18,
} as const;

/** Table de la voiture radiocommandée. */
export const RC = {
  x: RC_TABLE.x,
  z: RC_TABLE.z,
  height: RC_TABLE.height,
  topThickness: 0.022,
} as const;

/** Ventilateur sur pied (orienté vers le centre de la pièce). */
export const FAN = {
  base: SPOTS.fan,
  baseRadius: 0.19,
  /** Hauteur de l'axe du rotor. */
  hubHeight: 1.18,
  guardRadius: 0.22,
  /** Lacet : le flux d'air (+Z local) vise le centre de la pièce. */
  yaw: Math.atan2(0 - SPOTS.fan[0], 0.2 - SPOTS.fan[2]),
  /** Rayon du volume de collision (tête comprise). */
  colliderRadius: 0.25,
  colliderHeight: 1.42,
} as const;

/** Tabouret d'atelier à roulettes. */
export const STOOL = {
  base: SPOTS.stool,
  seatRadius: 0.175,
  seatHeight: 0.56,
  starRadius: 0.27,
} as const;

/** Poubelle en tôle galvanisée. */
export const TRASH = { base: SPOTS.trash, radius: 0.15, height: 0.44 } as const;

/**
 * Extincteur sur son support mural (mur sud). `SPOTS.extinguisher` : x, bas du corps, z de
 * référence ; le corps est plaqué contre le mur (dos à 1,5 cm).
 */
export const EXTINGUISHER = {
  x: SPOTS.extinguisher[0],
  bottom: SPOTS.extinguisher[1],
  radius: 0.08,
  height: 0.47,
  /** Centre Z du corps. */
  z: ROOM.maxZ - 0.015 - 0.08,
} as const;

/** Vieux tapis (plat, franges sur les petits côtés est et ouest). */
export const RUG_DETAIL = {
  x: RUG.x,
  z: RUG.z,
  thickness: 0.007,
  fringe: 0.045,
} as const;

/** Affiches, calendrier et rangements muraux (centre, taille [largeur, hauteur]). */
export const WALL_ITEMS = {
  calendar: { center: SPOTS.calendar, size: [0.3, 0.46] as const },
  /** Affiche de rallye, mur nord entre la servante et les étagères. */
  posterRally: { center: [1.55, 1.58, ROOM.minZ] as const, size: [0.4, 0.56] as const },
  /** Code des couleurs des résistances, mur ouest au-dessus du bureau. */
  posterColors: { center: [ROOM.minX, 1.42, 0.78] as const, size: [0.48, 0.34] as const },
  /** Tableau des couples de serrage, mur sud. */
  posterTorque: { center: [-0.75, 1.5, ROOM.maxZ] as const, size: [0.36, 0.5] as const },
  /** Affiche de modélisme au-dessus de la table RC (mur est). */
  posterModel: { center: [ROOM.maxX, 1.4, 0.25] as const, size: [0.34, 0.48] as const },
  /** Crochets des rallonges (mur est, entre la table RC et l'angle sud). */
  cordHooks: { x: ROOM.maxX, y: 1.72, z: [1.05, 1.42, 1.72] as const },
} as const;

/** Rayon du tapis antistatique dégagé (contrôle : aucun accessoire ne doit y empiéter). */
export const MAT_CLEAR_ZONE = {
  x: [MAT.center[0] - MAT.size[0] / 2, MAT.center[0] + MAT.size[0] / 2] as const,
  z: [MAT.center[2] - MAT.size[1] / 2, MAT.center[2] + MAT.size[1] / 2] as const,
} as const;
