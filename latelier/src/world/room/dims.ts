/**
 * Cotes de détail de la coque (dérivées du plan `layout.ts`, qui reste la source des volumes et
 * emplacements partagés). Unités : mètres, repère monde.
 */
import { DOOR, ROOM, WINDOW } from '../layout';

export const SHELL = {
  /** Traits de sciage des dalles de béton (joints). */
  slabJointX: 0.4,
  slabJointZ: 0.15,
  slabGap: 0.003,
  /** Solives apparentes (portée nord-sud), entraxe 60 cm ; l'ampoule pend entre deux solives. */
  joistXs: [-2.1, -1.5, -0.9, -0.3, 0.3, 0.9, 1.5, 2.1] as const,
  joistWidth: 0.06,
  joistBottom: 2.55,
  /** Lisses d'appui des solives le long des murs nord et sud (affleurantes, étriers). */
  ledgerBottom: 2.55,
  ledgerThickness: 0.045,
  /** Couvre-joints des panneaux du plafond (z). */
  battenZs: [-0.85, 0.65] as const,
  baseboardHeight: 0.1,
  baseboardThickness: 0.02,
} as const;

/** Fenêtre à petits carreaux (mur ouest) : dormant, meneaux, vitre, appui, chambranle. */
export const WINDOW_DETAIL = {
  /** Profondeur du dormant dans l'épaisseur du mur (x min, x max). */
  frameX: [ROOM.minX - 0.16, ROOM.minX - 0.06] as const,
  frameWidth: 0.06,
  bottomRail: 0.075,
  /** Plan de la vitre. */
  glassX: ROOM.minX - 0.11,
  cols: 3,
  rows: 2,
  muntinWidth: 0.024,
  muntinX: [ROOM.minX - 0.135, ROOM.minX - 0.085] as const,
  casingWidth: 0.07,
  casingDepth: 0.016,
  sill: { x: [ROOM.minX - 0.06, ROOM.minX + 0.065] as const, y: [WINDOW.y[0] - 0.032, WINDOW.y[0]] as const },
} as const;

/** Porte métallique (mur sud), paumelles côté est, poignée côté ouest. */
export const DOOR_DETAIL = {
  jamb: 0.04,
  /** Épaisseur et position du vantail (z min, z max). */
  leafZ: [ROOM.maxZ + 0.05, ROOM.maxZ + 0.095] as const,
  leafBottom: 0.014,
  thresholdTop: 0.006,
  casingWidth: 0.07,
  casingDepth: 0.016,
  handleX: DOOR.x[0] + 0.1,
  handleY: 1.0,
} as const;

/** Réseau électrique apparent : conduits galvanisés, boîtes de dérivation. */
export const ELECTRIC = {
  conduitRadius: 0.011,
  /** Hauteur des conduits horizontaux le long des murs (sous les lisses). */
  wallRunY: 2.49,
  /** Hauteur des conduits sous plafond (entre les solives). */
  ceilingRunY: 2.665,
  /** Prise murale à droite de l'établi (tapis, lampe loupe). */
  outlet: [0.34, 1.02, ROOM.minZ + 0.02] as const,
} as const;
