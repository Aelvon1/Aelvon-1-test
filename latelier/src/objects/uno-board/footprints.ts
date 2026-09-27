/**
 * Empreintes (footprints) des composants : pastilles, perçages, encombrement (courtyard) et
 * repères de sérigraphie, dans le repère LOCAL de l'empreinte (mm, X à droite, Y vers le haut,
 * rotation 0). Module pur (aucune dépendance three.js) : utilisé par le routage, l'illustration
 * du circuit (textures), la géométrie 3D des pastilles et les tests.
 *
 * Les cotes suivent les recommandations usuelles (IPC-7351, fiches techniques des boîtiers) ;
 * les valeurs marquées « typique » sont des ordres de grandeur courants.
 */

export type PadShape = 'rect' | 'round' | 'roundrect';

export interface PadDef {
  /** Numéro de broche (chaîne : « 1 », « 33 » pour la pastille thermique…). */
  num: string;
  /** Centre de la pastille (mm, repère local). */
  x: number;
  y: number;
  /** Dimensions selon X et Y locaux (mm). Pour une pastille ronde : w = h = diamètre. */
  w: number;
  h: number;
  shape: PadShape;
  /** Diamètre de perçage (mm) : présent = trou traversant métallisé (pastille sur les 2 faces). */
  drill?: number;
  /**
   * Dégagement des boîtiers à pas fin : amorce de piste tracée depuis le centre de la pastille
   * dans la direction (dx, dy) sur `length` mm, le routage part de son extrémité.
   */
  fanout?: { dx: number; dy: number; length: number };
}

/** Rectangle local [x0, y0, x1, y1] (mm). */
export type Rect = readonly [number, number, number, number];

export type MarkerKind = 'dot' | 'bar' | 'plus' | 'notch';

export interface FootprintDef {
  id: FootprintId;
  pads: readonly PadDef[];
  /** Encombrement : aucun autre composant ne doit empiéter (vérifié par les tests). */
  courtyard: Rect;
  /** Contour du corps tracé en sérigraphie (null = pas de contour, ex. 0603). */
  silkBody: Rect | null;
  /** Repère de broche 1 / polarité en sérigraphie. */
  marker?: { kind: MarkerKind; x: number; y: number };
  /** Position par défaut de la désignation (R1, C3…) par rapport au centre (mm). */
  refOffset: readonly [number, number];
}

export type FootprintId =
  | 'R0603'
  | 'C0603'
  | 'L0805'
  | 'LED0805'
  | 'F1812'
  | 'RN4'
  | 'SOT23-3'
  | 'SOT23-5'
  | 'SOT223'
  | 'MSOP8'
  | 'QFN32'
  | 'SMA'
  | 'RESONATOR3'
  | 'CP6.3'
  | 'SW6x3.5'
  | 'HDR1x6'
  | 'HDR1x8'
  | 'HDR1x10'
  | 'ICSP2x3'
  | 'DIP28'
  | 'USB-B'
  | 'JACK2.1'
  | 'HC49S'
  | 'SJ2';

/** Pas standard des connecteurs (0,1 po). */
export const PITCH = 2.54;

const chip2 = (pitch: number, w: number, h: number): PadDef[] => [
  { num: '1', x: -pitch / 2, y: 0, w, h, shape: 'roundrect' },
  { num: '2', x: pitch / 2, y: 0, w, h, shape: 'roundrect' },
];

/** Barrette 1×N : broches le long de X, broche 1 à gauche (pastille carrée). */
function headerRow(n: number): PadDef[] {
  return Array.from({ length: n }, (_, i) => ({
    num: String(i + 1),
    x: (i - (n - 1) / 2) * PITCH,
    y: 0,
    w: 1.7,
    h: 1.7,
    shape: i === 0 ? ('rect' as const) : ('round' as const),
    drill: 1.0,
  }));
}

function header(id: 'HDR1x6' | 'HDR1x8' | 'HDR1x10', n: number): FootprintDef {
  const half = (n * PITCH) / 2;
  return {
    id,
    pads: headerRow(n),
    courtyard: [-half - 0.1, -1.37, half + 0.1, 1.37],
    silkBody: null,
    refOffset: [0, 2.2],
  };
}

/** QFN-32 5 × 5 mm, pas 0,5 mm : 8 pastilles par côté, sens trigonométrique, broche 1 en haut à gauche. */
function qfn32Pads(): PadDef[] {
  const pads: PadDef[] = [];
  const c = 2.45; // centre des pastilles (bord du boîtier à 2,5 mm)
  const L = 0.85;
  const W = 0.28;
  for (let i = 0; i < 32; i++) {
    const side = Math.floor(i / 8);
    const k = i % 8;
    const t = 1.75 - k * 0.5; // position le long du côté
    // Amorces décalées (courte / longue) pour éloigner les points de départ du routage.
    const length = k % 2 === 0 ? 0.55 : 1.15;
    if (side === 0)
      pads.push({ num: String(i + 1), x: -c, y: t, w: L, h: W, shape: 'rect', fanout: { dx: -1, dy: 0, length } });
    else if (side === 1)
      pads.push({ num: String(i + 1), x: -t, y: -c, w: W, h: L, shape: 'rect', fanout: { dx: 0, dy: -1, length } });
    else if (side === 2)
      pads.push({ num: String(i + 1), x: c, y: -t, w: L, h: W, shape: 'rect', fanout: { dx: 1, dy: 0, length } });
    else pads.push({ num: String(i + 1), x: t, y: c, w: W, h: L, shape: 'rect', fanout: { dx: 0, dy: 1, length } });
  }
  pads.push({ num: '33', x: 0, y: 0, w: 3.3, h: 3.3, shape: 'rect' });
  return pads;
}

/** MSOP-8 : pas 0,65 mm, broches 1–4 en bas (gauche → droite), 5–8 en haut (droite → gauche). */
function msop8Pads(): PadDef[] {
  const xs = [-0.975, -0.325, 0.325, 0.975];
  const pads: PadDef[] = [];
  xs.forEach((x, i) =>
    pads.push({
      num: String(i + 1),
      x,
      y: -2.2,
      w: 0.42,
      h: 1.2,
      shape: 'roundrect',
      fanout: { dx: 0, dy: -1, length: i % 2 === 0 ? 0.5 : 1.1 },
    }),
  );
  [...xs].reverse().forEach((x, i) =>
    pads.push({
      num: String(i + 5),
      x,
      y: 2.2,
      w: 0.42,
      h: 1.2,
      shape: 'roundrect',
      fanout: { dx: 0, dy: 1, length: i % 2 === 0 ? 0.5 : 1.1 },
    }),
  );
  return pads;
}

/** DIP-28 (0,3 po) : broches 1–14 rangée basse (gauche → droite), 15–28 rangée haute (droite → gauche). */
function dip28Pads(): PadDef[] {
  const pads: PadDef[] = [];
  for (let i = 0; i < 14; i++)
    pads.push({
      num: String(i + 1),
      x: -16.51 + i * PITCH,
      y: -3.81,
      w: 1.6,
      h: 1.6,
      shape: i === 0 ? 'rect' : 'round',
      drill: 0.9,
    });
  for (let i = 0; i < 14; i++)
    pads.push({ num: String(i + 15), x: 16.51 - i * PITCH, y: 3.81, w: 1.6, h: 1.6, shape: 'round', drill: 0.9 });
  return pads;
}

/** Réseau de 4 résistances 1206 (type « CAY16 ») : R_A = 1–8, R_B = 2–7, R_C = 3–6, R_D = 4–5. */
function rn4Pads(): PadDef[] {
  const xs = [-1.2, -0.4, 0.4, 1.2];
  const pads: PadDef[] = [];
  xs.forEach((x, i) => pads.push({ num: String(i + 1), x, y: -0.85, w: 0.5, h: 0.8, shape: 'roundrect' }));
  [...xs]
    .reverse()
    .forEach((x, i) => pads.push({ num: String(i + 5), x, y: 0.85, w: 0.5, h: 0.8, shape: 'roundrect' }));
  return pads;
}

export const FOOTPRINTS: Readonly<Record<FootprintId, FootprintDef>> = {
  R0603: {
    id: 'R0603',
    pads: chip2(1.6, 0.85, 0.95),
    courtyard: [-1.45, -0.75, 1.45, 0.75],
    silkBody: null,
    refOffset: [0, 1.25],
  },
  C0603: {
    id: 'C0603',
    pads: chip2(1.6, 0.85, 0.95),
    courtyard: [-1.45, -0.75, 1.45, 0.75],
    silkBody: null,
    refOffset: [0, 1.25],
  },
  L0805: {
    id: 'L0805',
    pads: chip2(2.0, 1.0, 1.35),
    courtyard: [-1.75, -0.9, 1.75, 0.9],
    silkBody: null,
    refOffset: [0, 1.4],
  },
  LED0805: {
    id: 'LED0805',
    pads: chip2(2.0, 1.0, 1.35),
    courtyard: [-1.75, -0.9, 1.75, 0.9],
    silkBody: [-1.0, -0.62, 1.0, 0.62],
    marker: { kind: 'bar', x: -1.62, y: 0 },
    refOffset: [0, 1.4],
  },
  F1812: {
    id: 'F1812',
    pads: chip2(4.6, 1.2, 3.4),
    courtyard: [-3.1, -1.95, 3.1, 1.95],
    silkBody: [-2.25, -1.6, 2.25, 1.6],
    refOffset: [0, 2.5],
  },
  RN4: {
    id: 'RN4',
    pads: rn4Pads(),
    courtyard: [-1.9, -1.5, 1.9, 1.5],
    silkBody: null,
    refOffset: [0, 2.0],
  },
  'SOT23-3': {
    id: 'SOT23-3',
    pads: [
      { num: '1', x: -0.95, y: -1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
      { num: '2', x: 0.95, y: -1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
      { num: '3', x: 0, y: 1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
    ],
    courtyard: [-1.7, -1.75, 1.7, 1.75],
    silkBody: [-1.45, -0.65, 1.45, 0.65],
    refOffset: [0, 2.3],
  },
  'SOT23-5': {
    id: 'SOT23-5',
    pads: [
      { num: '1', x: -0.95, y: -1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
      { num: '2', x: 0, y: -1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
      { num: '3', x: 0.95, y: -1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
      { num: '4', x: 0.95, y: 1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
      { num: '5', x: -0.95, y: 1.1, w: 0.6, h: 1.0, shape: 'roundrect' },
    ],
    courtyard: [-1.8, -1.75, 1.8, 1.75],
    silkBody: [-1.45, -0.8, 1.45, 0.8],
    marker: { kind: 'dot', x: -1.75, y: -1.5 },
    refOffset: [0, 2.3],
  },
  SOT223: {
    id: 'SOT223',
    pads: [
      { num: '1', x: -2.3, y: -3.15, w: 1.0, h: 2.0, shape: 'roundrect' },
      { num: '2', x: 0, y: -3.15, w: 1.0, h: 2.0, shape: 'roundrect' },
      { num: '3', x: 2.3, y: -3.15, w: 1.0, h: 2.0, shape: 'roundrect' },
      { num: '4', x: 0, y: 3.15, w: 3.3, h: 2.0, shape: 'roundrect' },
    ],
    courtyard: [-3.6, -4.35, 3.6, 4.35],
    silkBody: [-3.35, -1.85, 3.35, 1.85],
    refOffset: [-4.6, 0],
  },
  MSOP8: {
    id: 'MSOP8',
    pads: msop8Pads(),
    courtyard: [-1.9, -3.0, 1.9, 3.0],
    silkBody: [-1.55, -1.55, 1.55, 1.55],
    marker: { kind: 'dot', x: -1.15, y: -1.15 },
    refOffset: [2.9, 0],
  },
  QFN32: {
    id: 'QFN32',
    pads: qfn32Pads(),
    courtyard: [-3.1, -3.1, 3.1, 3.1],
    silkBody: [-2.6, -2.6, 2.6, 2.6],
    marker: { kind: 'dot', x: -3.05, y: 3.05 },
    refOffset: [0, -4.4],
  },
  SMA: {
    id: 'SMA',
    pads: [
      { num: '1', x: -2.1, y: 0, w: 1.6, h: 1.9, shape: 'roundrect' },
      { num: '2', x: 2.1, y: 0, w: 1.6, h: 1.9, shape: 'roundrect' },
    ],
    courtyard: [-3.2, -1.65, 3.2, 1.65],
    silkBody: [-2.2, -1.35, 2.2, 1.35],
    marker: { kind: 'bar', x: -1.3, y: 0 },
    refOffset: [0, 2.2],
  },
  RESONATOR3: {
    id: 'RESONATOR3',
    pads: [
      { num: '1', x: -1.2, y: 0, w: 0.6, h: 1.9, shape: 'roundrect' },
      { num: '2', x: 0, y: 0, w: 0.6, h: 1.9, shape: 'roundrect' },
      { num: '3', x: 1.2, y: 0, w: 0.6, h: 1.9, shape: 'roundrect' },
    ],
    courtyard: [-1.9, -1.2, 1.9, 1.2],
    silkBody: null,
    refOffset: [0, 1.9],
  },
  'CP6.3': {
    id: 'CP6.3',
    pads: [
      { num: '1', x: -2.7, y: 0, w: 3.5, h: 1.6, shape: 'roundrect' },
      { num: '2', x: 2.7, y: 0, w: 3.5, h: 1.6, shape: 'roundrect' },
    ],
    courtyard: [-4.6, -3.5, 4.6, 3.5],
    silkBody: [-3.4, -3.4, 3.4, 3.4],
    marker: { kind: 'plus', x: -3.9, y: 2.4 },
    refOffset: [0, 4.2],
  },
  'SW6x3.5': {
    id: 'SW6x3.5',
    pads: [
      { num: '1', x: -3.95, y: 0, w: 1.6, h: 1.4, shape: 'roundrect' },
      { num: '2', x: 3.95, y: 0, w: 1.6, h: 1.4, shape: 'roundrect' },
    ],
    courtyard: [-4.95, -1.95, 4.95, 1.95],
    silkBody: [-3.1, -1.85, 3.1, 1.85],
    refOffset: [0, -2.6],
  },
  HDR1x6: header('HDR1x6', 6),
  HDR1x8: header('HDR1x8', 8),
  HDR1x10: header('HDR1x10', 10),
  ICSP2x3: {
    id: 'ICSP2x3',
    pads: [
      { num: '1', x: -1.27, y: 2.54, w: 1.6, h: 1.6, shape: 'rect', drill: 1.0 },
      { num: '2', x: 1.27, y: 2.54, w: 1.6, h: 1.6, shape: 'round', drill: 1.0 },
      { num: '3', x: -1.27, y: 0, w: 1.6, h: 1.6, shape: 'round', drill: 1.0 },
      { num: '4', x: 1.27, y: 0, w: 1.6, h: 1.6, shape: 'round', drill: 1.0 },
      { num: '5', x: -1.27, y: -2.54, w: 1.6, h: 1.6, shape: 'round', drill: 1.0 },
      { num: '6', x: 1.27, y: -2.54, w: 1.6, h: 1.6, shape: 'round', drill: 1.0 },
    ],
    courtyard: [-2.64, -3.91, 2.64, 3.91],
    silkBody: [-2.64, -3.91, 2.64, 3.91],
    marker: { kind: 'dot', x: -3.25, y: 2.54 },
    refOffset: [0, 4.7],
  },
  DIP28: {
    id: 'DIP28',
    pads: dip28Pads(),
    courtyard: [-17.6, -5.15, 17.6, 5.15],
    silkBody: [-17.55, -5.1, 17.55, 5.1],
    marker: { kind: 'notch', x: -17.55, y: 0 },
    refOffset: [-15.2, 6.0],
  },
  'USB-B': {
    id: 'USB-B',
    // Repère : origine au centre de la face ARRIÈRE du connecteur, ouverture vers −X.
    pads: [
      { num: '1', x: -2.2, y: -1.25, w: 1.6, h: 1.6, shape: 'rect', drill: 0.92 },
      { num: '2', x: -2.2, y: 1.25, w: 1.6, h: 1.6, shape: 'round', drill: 0.92 },
      { num: '3', x: -4.2, y: 1.25, w: 1.6, h: 1.6, shape: 'round', drill: 0.92 },
      { num: '4', x: -4.2, y: -1.25, w: 1.6, h: 1.6, shape: 'round', drill: 0.92 },
      { num: '5', x: -7.2, y: -6.02, w: 3.0, h: 3.0, shape: 'round', drill: 2.3 },
      { num: '6', x: -7.2, y: 6.02, w: 3.0, h: 3.0, shape: 'round', drill: 2.3 },
    ],
    courtyard: [-16.4, -7.6, 0.1, 7.6],
    silkBody: null,
    refOffset: [2.0, 5.0],
  },
  'JACK2.1': {
    id: 'JACK2.1',
    // Repère : origine au centre de la face arrière du jack, ouverture vers −X.
    pads: [
      { num: '1', x: -1.2, y: 0, w: 3.0, h: 3.0, shape: 'round', drill: 1.6 },
      { num: '2', x: -7.2, y: 0, w: 3.0, h: 3.0, shape: 'round', drill: 1.6 },
      { num: '3', x: -4.2, y: -4.7, w: 3.0, h: 3.0, shape: 'round', drill: 1.6 },
    ],
    courtyard: [-13.6, -6.3, 0.1, 4.6],
    silkBody: null,
    refOffset: [2.2, 3.5],
  },
  HC49S: {
    id: 'HC49S',
    pads: [
      { num: '1', x: -2.44, y: 0, w: 1.5, h: 1.5, shape: 'round', drill: 0.8 },
      { num: '2', x: 2.44, y: 0, w: 1.5, h: 1.5, shape: 'round', drill: 0.8 },
    ],
    courtyard: [-5.8, -2.6, 5.8, 2.6],
    silkBody: [-5.75, -2.55, 5.75, 2.55],
    refOffset: [0, 3.3],
  },
  SJ2: {
    id: 'SJ2',
    pads: [
      { num: '1', x: -0.45, y: 0, w: 0.6, h: 1.0, shape: 'rect' },
      { num: '2', x: 0.45, y: 0, w: 0.6, h: 1.0, shape: 'rect' },
    ],
    courtyard: [-1.0, -0.7, 1.0, 0.7],
    silkBody: [-0.95, -0.7, 0.95, 0.7],
    refOffset: [0, -1.4],
  },
};
