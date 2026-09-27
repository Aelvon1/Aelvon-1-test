/**
 * Implantation des faces avant des appareils, en coordonnées NORMALISÉES de la face
 * (u : 0 à gauche → 1 à droite ; v : 0 en haut → 1 en bas ; rayons en fraction de la largeur).
 * Partagée par la sérigraphie (atlas) et par la géométrie 3D (boutons, bornes, afficheurs) :
 * les deux restent alignées par construction. Module PUR.
 */

export type UV = readonly [number, number];
/** Rectangle [u, v, largeur, hauteur]. */
export type UVRect = readonly [number, number, number, number];

/** Face avant : taille en pixels dans l'atlas (référence 2048) et en mètres. */
export interface PanelSpec {
  px: readonly [number, number];
  meters: readonly [number, number];
}

export const PSU_PANEL = {
  px: [460, 252],
  meters: [0.21, 0.115],
  displayV: [0.07, 0.25, 0.32, 0.25],
  displayA: [0.45, 0.25, 0.32, 0.25],
  knobV: [0.2, 0.74],
  knobA: [0.5, 0.74],
  knobRadius: 0.058,
  ledCV: [0.86, 0.3],
  ledCC: [0.86, 0.43],
  terminals: [
    [0.7, 0.8],
    [0.8, 0.8],
    [0.9, 0.8],
  ],
  switch: [0.88, 0.1],
} as const;

export const SCOPE_PANEL = {
  px: [580, 300],
  meters: [0.3, 0.155],
  screen: [0.045, 0.1, 0.47, 0.72],
  bigKnobs: [
    [0.64, 0.34],
    [0.845, 0.34],
  ],
  bigKnobRadius: 0.05,
  smallKnobs: [
    [0.62, 0.66],
    [0.72, 0.66],
    [0.82, 0.66],
    [0.92, 0.66],
    [0.12, 0.92],
    [0.22, 0.92],
  ],
  smallKnobRadius: 0.022,
  bnc: [
    [0.62, 0.88],
    [0.74, 0.88],
    [0.9, 0.88],
  ],
  power: [0.95, 0.1],
  led: [0.88, 0.1],
} as const;

export const SOLDER_PANEL = {
  px: [330, 216],
  meters: [0.16, 0.105],
  knob: [0.33, 0.58],
  knobRadius: 0.12,
  led: [0.72, 0.3],
  switch: [0.88, 0.3],
  socket: [0.8, 0.72],
} as const;

export const HOTAIR_PANEL = {
  px: [410, 256],
  meters: [0.2, 0.125],
  display: [0.07, 0.2, 0.42, 0.28],
  knobs: [
    [0.19, 0.76],
    [0.41, 0.76],
  ],
  knobRadius: 0.058,
  outlet: [0.8, 0.68],
  switch: [0.88, 0.22],
  led: [0.66, 0.34],
} as const;

export const METER_PANEL = {
  px: [200, 400],
  meters: [0.078, 0.166],
  lcd: [0.1, 0.06, 0.8, 0.2],
  dial: [0.5, 0.6],
  dialRadius: 0.3,
  jacks: [
    [0.2, 0.905],
    [0.5, 0.905],
    [0.8, 0.905],
  ],
} as const;

export const RADIO_PANEL = {
  px: [720, 385],
  meters: [0.44, 0.235],
  grilles: [
    [0.165, 0.62],
    [0.835, 0.62],
  ],
  grilleRadius: 0.13,
  dial: [0.3, 0.08, 0.4, 0.17],
  knobs: [
    [0.2, 0.19],
    [0.8, 0.19],
  ],
  knobRadius: 0.035,
  cassette: [0.36, 0.43, 0.28, 0.45],
  led: [0.73, 0.33],
} as const;

/** Position locale (m) sur une face centrée : x à droite, y vers le haut. */
export function panelPoint(panel: PanelSpec, uv: UV): [number, number] {
  return [(uv[0] - 0.5) * panel.meters[0], (0.5 - uv[1]) * panel.meters[1]];
}

/** Rectangle normalisé → centre local (m) et taille (m). */
export function panelRect(panel: PanelSpec, r: UVRect): { center: [number, number]; size: [number, number] } {
  const [u, v, w, h] = r;
  return {
    center: panelPoint(panel, [u + w / 2, v + h / 2]),
    size: [w * panel.meters[0], h * panel.meters[1]],
  };
}

/** Rayon (fraction de la largeur) → mètres. */
export function panelRadius(panel: PanelSpec, r: number): number {
  return r * panel.meters[0];
}
