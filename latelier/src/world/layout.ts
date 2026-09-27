/**
 * Plan de l'atelier : SOURCE UNIQUE des dimensions et emplacements (m, repère monde).
 *
 * Origine au centre de la pièce, au sol. X : ouest (−) → est (+) ; Z : nord (−) → sud (+) ;
 * Y vers le haut. Salle de 5 m × 4 m = 20 m², 2,70 m sous plafond.
 *
 *            nord (z = −2) : établi + panneau perforé, servante, calendrier
 *   ouest    ┌──────────────────────────────────────────────┐
 *   fenêtre  │ [établi 2 m      ][servante]      [étagères] │  est
 *   (x=−2,5) │                                   [étagères] │ (x=+2,5)
 *            │            [tapis]                 [table RC]│
 *   coin     │ [bureau élec.]                               │
 *   élec.    │ [ventilateur]                  [porte ]      │
 *            └──────────────────────────────────────────────┘
 *                               sud (z = +2)
 */

export interface Box2 {
  /** x min, x max */
  x: readonly [number, number];
  /** z min, z max */
  z: readonly [number, number];
}

export const ROOM = {
  width: 5, // X
  depth: 4, // Z
  height: 2.7,
  minX: -2.5,
  maxX: 2.5,
  minZ: -2,
  maxZ: 2,
  wallThickness: 0.2,
} as const;

/** Établi (plateau). */
export const BENCH = {
  x: [-1.8, 0.2] as const,
  z: [-2.0, -1.25] as const,
  topHeight: 0.92,
  /** Plateau en lames de bois massif (4 lames le long de X). */
  topThickness: 0.06,
} as const;

/** Tapis antistatique (≥ 60 × 50 cm) posé sur l'établi : zone d'inspection des objets. */
export const MAT = {
  center: [-0.75, BENCH.topHeight + 0.003, -1.56] as const,
  /** Largeur (X) × profondeur (Z). */
  size: [0.66, 0.54] as const,
  thickness: 0.003,
} as const;

/**
 * Panneau perforé au-dessus de l'établi (sur le mur nord). `z` = FACE AVANT du panneau (6 mm
 * d'isorel sur tasseaux de 9 mm). Trous Ø 6,4 mm au pas de 25,4 mm : le trou (i, j) est centré en
 * x = x[0] + (i + 0,5) × holeSpacing, y = y[0] + (j + 0,5) × holeSpacing (crochets des outils).
 * Cadre bois de 25 mm tout autour, en saillie de 16 mm devant la face.
 */
export const PEGBOARD = {
  x: [-1.8, 0.2] as const,
  y: [1.08, 2.08] as const,
  z: -1.985,
  holeSpacing: 0.0254,
  holeDiameter: 0.0064,
} as const;

/** Fenêtre (mur ouest). */
export const WINDOW = { x: -2.5, z: [-1.25, -0.05] as const, y: [1.0, 2.0] as const } as const;

/** Porte fermée (mur sud). */
export const DOOR = { z: 2, x: [1.25, 2.1] as const, height: 2.05 } as const;

/** Étagères métalliques (mur est). */
export const SHELVES: Box2 & { height: number } = { x: [2.05, 2.5], z: [-1.95, -0.65], height: 1.9 };

/** Servante d'atelier à tiroirs (à droite de l'établi). */
export const TOOL_CART: Box2 & { height: number } = { x: [0.4, 1.05], z: [-1.97, -1.5], height: 0.9 };

/** Coin électronique : petit bureau contre le mur ouest, au sud de la fenêtre. */
export const ELECTRONICS_DESK: Box2 & { height: number } = { x: [-2.5, -1.85], z: [0.2, 1.35], height: 0.76 };

/** Petite table de la voiture radiocommandée (mur est). */
export const RC_TABLE: Box2 & { height: number } = { x: [2.0, 2.5], z: [-0.2, 0.7], height: 0.6 };

/** Vieux tapis au centre. */
export const RUG: Box2 = { x: [-1.1, 0.9], z: [-0.95, 0.95] };

/** Emplacements ponctuels (x, y, z). */
export const SPOTS = {
  stool: [-0.8, 0, -0.95] as const,
  fan: [-2.05, 0, 1.7] as const,
  extinguisher: [0.95, 0.35, 1.93] as const,
  trash: [0.55, 0, -1.2] as const,
  lightSwitch: [1.08, 1.25, 1.985] as const,
  pendantBulb: [0, 2.35, 0] as const,
  /** Centre du tube néon (réglette suspendue par chaînettes sous les solives, tube de 1,2 m selon X). */
  neonTube: [-0.8, 2.38, -1.55] as const,
  calendar: [0.65, 1.55, -1.985] as const,
  magnifierLampBase: [-1.62, BENCH.topHeight, -1.9] as const,
  radio: [-2.2, ELECTRONICS_DESK.height, 0.95] as const,
} as const;

/** Point d'apparition du joueur et orientation initiale (lacet, rad ; 0 = regarde vers −Z). */
export const SPAWN = { position: [0.95, 0, 1.25] as const, yaw: 0.55 } as const;

/** Joueur : hauteurs des yeux et vitesses. */
export const PLAYER = {
  eyeHeight: 1.68,
  crouchEyeHeight: 1.05,
  radius: 0.22,
  walkSpeed: 1.4,
  sprintSpeed: 2.3,
  crouchSpeed: 0.8,
  /** Passage libre minimal exigé (m). */
  minClearance: 0.9,
} as const;

/** Vue initiale de l'inspection : caméra devant et au-dessus du tapis. */
export const INSPECTION_VIEW = {
  /** Décalage de la caméra par rapport au centre du tapis. */
  offset: [0, 0.32, 0.42] as const,
  fov: 35,
} as const;
