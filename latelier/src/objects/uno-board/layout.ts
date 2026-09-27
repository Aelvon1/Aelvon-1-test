/**
 * Implantation de la carte « ATELIER-328 » : DONNÉES pures (repère carte, mm).
 *
 * - `COMPONENTS` : chaque composant (désignation, empreinte, position, rotation, valeur,
 *   bloc fonctionnel, réseau de chaque broche) ;
 * - `MOUNTING_HOLES`, `BOARD_OUTLINE` : trous de fixation Ø 3,2 mm et contour ;
 * - `NET_CLASSES` : largeur de piste par réseau (alimentations plus larges) ;
 * - `SILK_TEXTS` : textes de sérigraphie libres (libellés de broches, titres).
 *
 * L'architecture reprend celle d'une carte Uno R3 (matériel libre) : 16U2 en convertisseur
 * USB-série, 328P sur support, régulateur 5 V NCP1117, 3,3 V LP2985, commutation automatique
 * USB/VIN par comparateur LMV358 et transistor FDN340P. Sérigraphie générique « ATELIER-328 ».
 */
import type { FootprintId } from './footprints';

/** Blocs fonctionnels (sous-ensembles de l'arborescence des pièces). */
export type BlockId = 'power' | 'usb' | 'mcu' | 'ui' | 'io';

export interface ComponentPlacement {
  /** Désignation sérigraphiée (R1, C3, U1…). */
  ref: string;
  footprint: FootprintId;
  /** Centre / origine de l'empreinte (mm, repère carte). */
  x: number;
  y: number;
  /** Rotation (degrés, sens trigonométrique vu de dessus). */
  rot: number;
  /** Valeur affichée (ex. « 100 nF », « 1 kΩ »). */
  value: string;
  block: BlockId;
  /** Réseau de chaque broche (numéro → nom de réseau). « NC » = non connectée. */
  nets: Readonly<Record<string, string>>;
  /** Décalage de la désignation (remplace celui de l'empreinte) et rotation du texte (deg). */
  refAt?: readonly [number, number];
  refRot?: number;
  /** Pas de désignation sérigraphiée. */
  noRef?: boolean;
}

/** Réseau de masse (plan de masse sur les deux faces, non routé en pistes). */
export const GND = 'GND';
/** Broche non connectée. */
export const NC = 'NC';

const pins = (...nets: string[]): Record<string, string> =>
  Object.fromEntries(nets.map((n, i) => [String(i + 1), n]));

/** Contour de la carte (mm, sens trigonométrique) : petits chanfreins caractéristiques côté droit. */
export const BOARD_OUTLINE: readonly (readonly [number, number])[] = [
  [0, 0],
  [66.04, 0],
  [68.58, 2.54],
  [68.58, 37.85],
  [66.04, 40.39],
  [66.04, 51.82],
  [64.52, 53.34],
  [0, 53.34],
];
/** Rayon d'arrondi des angles du contour (mm) : aucun angle vif. */
export const OUTLINE_CORNER_RADIUS = 0.5;

/** Trous de fixation non métallisés Ø 3,2 mm. */
export const MOUNTING_HOLES: readonly { x: number; y: number; d: number }[] = [
  { x: 13.97, y: 2.54, d: 3.2 },
  { x: 15.24, y: 50.8, d: 3.2 },
  { x: 66.04, y: 7.62, d: 3.2 },
  { x: 66.04, y: 35.56, d: 3.2 },
];
/** Zone dégagée autour des trous de fixation (rayon, mm) : ni cuivre ni piste. */
export const MOUNTING_KEEPOUT = 2.3;

/** Largeur de piste par réseau (mm) ; défaut 0,2 mm (8 mil). */
export const NET_CLASSES: Readonly<Record<string, number>> = {
  PWRIN: 0.8,
  VIN: 0.6,
  '+5V': 0.45,
  XUSB: 0.6,
  USBVCC: 0.6,
  '+3V3': 0.35,
  UGND: 0.4,
};
export const DEFAULT_TRACE = 0.2;

/** Abscisse de la broche i (0 = première) d'une barrette dont la première broche est en x0. */
const hx = (x0: number, i: number): number => x0 + i * 2.54;

// Barrettes : D0 aligné sur A5 (x = 63,5 mm), écart non standard de 0,16 po entre D7 et D8.
const IOL_X0 = 45.72; // D7
const IOH_X0 = IOL_X0 - 4.064 - 9 * 2.54; // SCL (18,796 mm)
const POWER_X0 = 27.94;
const AD_X0 = 50.8;

/** Tous les composants de la carte. */
export const COMPONENTS: readonly ComponentPlacement[] = [
  // --- Étage d'alimentation ------------------------------------------------------------------
  {
    ref: 'X1',
    footprint: 'JACK2.1',
    x: 11.6,
    y: 7.8,
    rot: 0,
    value: 'Jack 2,1 mm',
    block: 'power',
    nets: pins('PWRIN', GND, GND),
    refAt: [2.4, 5.2],
  },
  {
    ref: 'D1',
    footprint: 'SMA',
    x: 19.5,
    y: 3.3,
    rot: 180,
    value: 'M7',
    block: 'power',
    nets: pins('VIN', 'PWRIN'),
    refAt: [0, -2.1],
  },
  {
    ref: 'U1',
    footprint: 'SOT223',
    x: 18.5,
    y: 9.6,
    rot: 0,
    value: 'NCP1117-5.0',
    block: 'power',
    nets: { '1': GND, '2': '+5V', '3': 'VIN', '4': '+5V' },
  },
  {
    ref: 'PC1',
    footprint: 'CP6.3',
    x: 15.5,
    y: 18.6,
    rot: 90,
    value: '47 µF 25 V',
    block: 'power',
    nets: pins('VIN', GND),
    refAt: [-4.0, 0],
    refRot: 90,
  },
  {
    ref: 'PC2',
    footprint: 'CP6.3',
    x: 22.6,
    y: 18.6,
    rot: 90,
    value: '47 µF 25 V',
    block: 'power',
    nets: pins('+5V', GND),
    refAt: [4.2, 0],
    refRot: 90,
  },
  {
    ref: 'U2',
    footprint: 'SOT23-5',
    x: 26.0,
    y: 10.9,
    rot: 0,
    value: 'LP2985-3.3',
    block: 'power',
    nets: pins('+5V', GND, '+5V', NC, '+3V3'),
    refAt: [0, 2.3],
  },
  {
    ref: 'C2',
    footprint: 'C0603',
    x: 26.0,
    y: 7.2,
    rot: 90,
    value: '1 µF',
    block: 'power',
    nets: pins('+3V3', GND),
    refAt: [1.3, 0],
    refRot: 90,
  },
  {
    ref: 'C3',
    footprint: 'C0603',
    x: 24.0,
    y: 7.2,
    rot: 90,
    value: '1 µF',
    block: 'power',
    nets: pins('+5V', GND),
    refAt: [-1.2, 0],
    refRot: 90,
  },
  {
    ref: 'C1',
    footprint: 'C0603',
    x: 13.2,
    y: 9.8,
    rot: 90,
    value: '100 nF',
    block: 'power',
    nets: pins('+5V', GND),
    refAt: [0, 2.3],
  },
  {
    ref: 'U5',
    footprint: 'MSOP8',
    x: 8.2,
    y: 16.8,
    rot: 0,
    value: 'LMV358',
    block: 'power',
    nets: pins('GATE_CMD', '+3V3', 'CMP', GND, 'D13', 'L13B', 'L13B', '+5V'),
  },
  {
    ref: 'R4',
    footprint: 'R0603',
    x: 3.6,
    y: 15.3,
    rot: 0,
    value: '10 kΩ',
    block: 'power',
    nets: pins('VIN', 'CMP'),
    refAt: [0, -1.25],
  },
  {
    ref: 'R5',
    footprint: 'R0603',
    x: 3.6,
    y: 17.3,
    rot: 0,
    value: '10 kΩ',
    block: 'power',
    nets: pins('CMP', GND),
  },
  {
    ref: 'T1',
    footprint: 'SOT23-3',
    x: 9.6,
    y: 22.6,
    rot: 0,
    value: 'FDN340P',
    block: 'power',
    nets: pins('GATE_CMD', '+5V', 'USBVCC'),
  },
  // --- Interface USB (ATmega16U2) --------------------------------------------------------------
  {
    ref: 'X2',
    footprint: 'USB-B',
    x: 10.1,
    y: 38.0,
    rot: 0,
    value: 'USB type B',
    block: 'usb',
    nets: pins('XUSB', 'USB_DM', 'USB_DP', 'UGND', 'UGND', 'UGND'),
    noRef: true,
  },
  {
    ref: 'F1',
    footprint: 'F1812',
    x: 4.8,
    y: 27.9,
    rot: 0,
    value: '500 mA',
    block: 'usb',
    nets: pins('XUSB', 'USBVCC'),
    refAt: [0, -2.5],
  },
  {
    ref: 'L1',
    footprint: 'L0805',
    x: 4.2,
    y: 23.6,
    rot: 90,
    value: 'BLM21',
    block: 'usb',
    nets: pins('UGND', GND),
    refAt: [-1.5, 0],
    refRot: 90,
  },
  {
    ref: 'Z1',
    footprint: 'R0603',
    x: 13.4,
    y: 26.9,
    rot: 90,
    value: 'CG0603MLC-05E',
    block: 'usb',
    nets: pins('USB_DM', 'UGND'),
    refAt: [0, -2.0],
  },
  {
    ref: 'Z2',
    footprint: 'R0603',
    x: 15.2,
    y: 26.9,
    rot: 90,
    value: 'CG0603MLC-05E',
    block: 'usb',
    nets: pins('USB_DP', 'UGND'),
    refAt: [0, -2.0],
  },
  {
    ref: 'RN3',
    footprint: 'RN4',
    x: 19.4,
    y: 26.4,
    rot: 0,
    value: '22 Ω',
    block: 'usb',
    nets: pins('USB_DP', 'USB_DM', NC, NC, NC, NC, 'RD_M', 'RD_P'),
    refAt: [0, -2.0],
  },
  {
    ref: 'Y1',
    footprint: 'HC49S',
    x: 13.2,
    y: 34.4,
    rot: 90,
    value: '16 MHz',
    block: 'usb',
    nets: pins('XT1', 'XT2'),
    refAt: [0, 0],
    noRef: true,
  },
  {
    ref: 'C7',
    footprint: 'C0603',
    x: 17.4,
    y: 30.9,
    rot: 0,
    value: '22 pF',
    block: 'usb',
    nets: pins('XT1', GND),
    refAt: [2.3, 0],
  },
  {
    ref: 'C12',
    footprint: 'C0603',
    x: 17.4,
    y: 29.3,
    rot: 0,
    value: '22 pF',
    block: 'usb',
    nets: pins('XT2', GND),
    refAt: [2.5, 0],
  },
  {
    ref: 'R1',
    footprint: 'R0603',
    x: 17.4,
    y: 32.5,
    rot: 0,
    value: '1 MΩ',
    block: 'usb',
    nets: pins('XT1', 'XT2'),
    refAt: [2.3, 0],
  },
  {
    ref: 'U3',
    footprint: 'QFN32',
    x: 21.6,
    y: 38.6,
    rot: 45,
    value: 'ATmega16U2-MU',
    block: 'usb',
    nets: {
      ...Object.fromEntries(Array.from({ length: 32 }, (_, i) => [String(i + 1), NC])),
      '1': 'XT1',
      '2': 'XT2',
      '3': GND,
      '4': '+5V',
      '8': 'RX16',
      '9': 'TX16',
      '10': 'RXLED',
      '11': 'TXLED',
      '13': 'DTR',
      '15': 'SCK2',
      '16': 'MOSI2',
      '17': 'MISO2',
      '24': 'RESET2',
      '27': 'UCAP',
      '28': 'UGND',
      '29': 'RD_P',
      '30': 'RD_M',
      '31': '+5V',
      '32': '+5V',
      '33': GND,
    },
    refAt: [0, -4.9],
    refRot: -45,
  },
  {
    ref: 'C9',
    footprint: 'C0603',
    x: 17.9,
    y: 44.2,
    rot: 0,
    value: '1 µF',
    block: 'usb',
    nets: pins('UCAP', GND),
    refAt: [0, -1.2],
  },
  {
    ref: 'C10',
    footprint: 'C0603',
    x: 26.8,
    y: 35.4,
    rot: 90,
    value: '100 nF',
    block: 'usb',
    nets: pins('+5V', GND),
    refAt: [1.3, 0],
    refRot: 90,
  },
  {
    ref: 'C11',
    footprint: 'C0603',
    x: 26.8,
    y: 41.6,
    rot: 90,
    value: '100 nF',
    block: 'usb',
    nets: pins('+5V', GND),
    refAt: [-1.3, 0],
    refRot: 90,
  },
  {
    ref: 'ICSP1',
    footprint: 'ICSP2x3',
    x: 13.3,
    y: 44.6,
    rot: 0,
    value: 'ICSP 2×3',
    block: 'usb',
    nets: pins('MISO2', '+5V', 'SCK2', 'MOSI2', 'RESET2', GND),
    noRef: true,
  },
  // --- Microcontrôleur ATmega328P --------------------------------------------------------------
  {
    ref: 'U4',
    footprint: 'DIP28',
    x: 46.99,
    y: 13.5,
    rot: 0,
    value: 'ATmega328P-PU',
    block: 'mcu',
    nets: pins(
      'RESET',
      'D0',
      'D1',
      'D2',
      'D3',
      'D4',
      '+5V',
      GND,
      'XTAL1',
      'XTAL2',
      'D5',
      'D6',
      'D7',
      'D8',
      'D9',
      'D10',
      'D11',
      'D12',
      'D13',
      '+5V',
      'AREF',
      GND,
      'A0',
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
    ),
    refAt: [-19.2, 0],
    refRot: 90,
  },
  {
    ref: 'Y2',
    footprint: 'RESONATOR3',
    x: 52.1,
    y: 6.4,
    rot: 0,
    value: '16 MHz',
    block: 'mcu',
    nets: pins('XTAL1', GND, 'XTAL2'),
    refAt: [0, -1.8],
  },
  {
    ref: 'R2',
    footprint: 'R0603',
    x: 56.3,
    y: 6.4,
    rot: 0,
    value: '1 MΩ',
    block: 'mcu',
    nets: pins('XTAL1', 'XTAL2'),
    refAt: [0, -1.25],
  },
  {
    ref: 'C4',
    footprint: 'C0603',
    x: 47.0,
    y: 6.4,
    rot: 0,
    value: '100 nF',
    block: 'mcu',
    nets: pins('+5V', GND),
    refAt: [0, -1.25],
  },
  {
    ref: 'C6',
    footprint: 'C0603',
    x: 50.2,
    y: 20.3,
    rot: 0,
    value: '100 nF',
    block: 'mcu',
    nets: pins('+5V', GND),
  },
  {
    ref: 'C8',
    footprint: 'C0603',
    x: 46.4,
    y: 20.3,
    rot: 0,
    value: '100 nF',
    block: 'mcu',
    nets: pins('AREF', GND),
  },
  {
    ref: 'C5',
    footprint: 'C0603',
    x: 31.8,
    y: 26.2,
    rot: 0,
    value: '100 nF',
    block: 'mcu',
    nets: pins('DTR', 'DTR_C'),
  },
  {
    ref: 'RN1',
    footprint: 'RN4',
    x: 34.2,
    y: 22.2,
    rot: 0,
    value: '10 kΩ',
    block: 'mcu',
    nets: pins('RESET', 'RESET2', NC, NC, NC, NC, '+5V', '+5V'),
    refAt: [0, -2.0],
  },
  {
    ref: 'RN4',
    footprint: 'RN4',
    x: 38.9,
    y: 22.2,
    rot: 0,
    value: '1 kΩ',
    block: 'mcu',
    nets: pins('D0', 'D1', NC, NC, NC, NC, 'RX16', 'TX16'),
    refAt: [0, -2.0],
  },
  {
    ref: 'ICSP',
    footprint: 'ICSP2x3',
    x: 64.0,
    y: 27.0,
    rot: 0,
    value: 'ICSP 2×3',
    block: 'mcu',
    nets: pins('D12', '+5V', 'D13', 'D11', 'RESET', GND),
    noRef: true,
  },
  // --- Signalisation et commande ---------------------------------------------------------------
  {
    ref: 'LED3',
    footprint: 'LED0805',
    x: 30.6,
    y: 46.2,
    rot: 0,
    value: 'L (jaune)',
    block: 'ui',
    nets: pins(GND, 'LED_L'),
    noRef: true,
  },
  {
    ref: 'LED1',
    footprint: 'LED0805',
    x: 30.6,
    y: 43.8,
    rot: 0,
    value: 'TX (jaune)',
    block: 'ui',
    nets: pins('TXL', '+5V'),
    noRef: true,
  },
  {
    ref: 'LED2',
    footprint: 'LED0805',
    x: 30.6,
    y: 41.4,
    rot: 0,
    value: 'RX (jaune)',
    block: 'ui',
    nets: pins('RXL', '+5V'),
    noRef: true,
  },
  {
    ref: 'RN2',
    footprint: 'RN4',
    x: 34.6,
    y: 44.0,
    rot: 90,
    value: '1 kΩ',
    block: 'ui',
    nets: pins('TXLED', 'RXLED', 'L13B', NC, NC, 'LED_L', 'RXL', 'TXL'),
    refAt: [2.2, 0],
    refRot: 90,
  },
  {
    ref: 'ON',
    footprint: 'LED0805',
    x: 59.4,
    y: 27.2,
    rot: 90,
    value: 'ON (verte)',
    block: 'ui',
    nets: pins(GND, 'LED_ON'),
    noRef: true,
  },
  {
    ref: 'R3',
    footprint: 'R0603',
    x: 57.3,
    y: 27.2,
    rot: 90,
    value: '1 kΩ',
    block: 'ui',
    nets: pins('+5V', 'LED_ON'),
    refAt: [0, -2.0],
  },
  {
    ref: 'SW1',
    footprint: 'SW6x3.5',
    x: 5.6,
    y: 50.4,
    rot: 0,
    value: 'Bouton RESET',
    block: 'ui',
    nets: pins('RESET', GND),
    noRef: true,
  },
  {
    ref: 'SJ1',
    footprint: 'SJ2',
    x: 35.8,
    y: 26.2,
    rot: 0,
    value: 'RESET-EN',
    block: 'ui',
    nets: pins('DTR_C', 'RESET'),
    noRef: true,
  },
  // --- Connecteurs d'extension -----------------------------------------------------------------
  {
    ref: 'POWER',
    footprint: 'HDR1x8',
    x: hx(POWER_X0, 3.5),
    y: 2.54,
    rot: 0,
    value: '1×8 femelle',
    block: 'io',
    nets: pins(NC, '+5V', 'RESET', '+3V3', '+5V', GND, GND, 'VIN'),
    noRef: true,
  },
  {
    ref: 'AD',
    footprint: 'HDR1x6',
    x: hx(AD_X0, 2.5),
    y: 2.54,
    rot: 0,
    value: '1×6 femelle',
    block: 'io',
    nets: pins('A0', 'A1', 'A2', 'A3', 'A4', 'A5'),
    noRef: true,
  },
  {
    ref: 'IOH',
    footprint: 'HDR1x10',
    x: hx(IOH_X0, 4.5),
    y: 50.8,
    rot: 0,
    value: '1×10 femelle',
    block: 'io',
    nets: pins('A5', 'A4', 'AREF', GND, 'D13', 'D12', 'D11', 'D10', 'D9', 'D8'),
    noRef: true,
  },
  {
    ref: 'IOL',
    footprint: 'HDR1x8',
    x: hx(IOL_X0, 3.5),
    y: 50.8,
    rot: 0,
    value: '1×8 femelle',
    block: 'io',
    nets: pins('D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'),
    noRef: true,
  },
];

/** Accès par désignation. */
export const COMPONENT_BY_REF: ReadonlyMap<string, ComponentPlacement> = new Map(
  COMPONENTS.map((c) => [c.ref, c]),
);

export function component(ref: string): ComponentPlacement {
  const c = COMPONENT_BY_REF.get(ref);
  if (!c) throw new Error(`Composant inconnu : ${ref}`);
  return c;
}

/** Abscisses des barrettes (utiles aux libellés). */
export const HEADER_ORIGINS = { IOL_X0, IOH_X0, POWER_X0, AD_X0 } as const;

// --- Sérigraphie libre ---------------------------------------------------------------------------

export interface SilkText {
  text: string;
  x: number;
  y: number;
  /** Hauteur de caps (mm). */
  size: number;
  /** Rotation (deg, sens trigonométrique). */
  rot?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  face: 'top' | 'bottom';
}

const IOH_LABELS = ['SCL', 'SDA', 'AREF', 'GND', '13', '12', '~11', '~10', '~9', '8'];
const IOL_LABELS = ['7', '~6', '~5', '4', '~3', '2', 'TX→1', 'RX←0'];
const POWER_LABELS = ['', 'IOREF', 'RESET', '3.3V', '5V', 'GND', 'GND', 'VIN'];
const AD_LABELS = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];

function pinLabels(
  labels: readonly string[],
  x0: number,
  y: number,
  rot: number,
  align: 'left' | 'right',
  face: 'top' | 'bottom',
): SilkText[] {
  return labels
    .map((text, i) => ({ text, x: hx(x0, i), y, size: 0.95, rot, align, face }))
    .filter((t) => t.text.length > 0);
}

/** Textes de sérigraphie (hors désignations des composants, générées depuis `COMPONENTS`). */
export const SILK_TEXTS: readonly SilkText[] = [
  // Face supérieure : libellés de broches verticaux, lus depuis le bord.
  ...pinLabels(IOH_LABELS, IOH_X0, 48.6, 90, 'right', 'top'),
  ...pinLabels(IOL_LABELS, IOL_X0, 48.6, 90, 'right', 'top'),
  ...pinLabels(POWER_LABELS, POWER_X0, 4.6, 90, 'left', 'top'),
  ...pinLabels(AD_LABELS, AD_X0, 4.6, 90, 'left', 'top'),
  { text: 'DIGITAL (PWM~)', x: 54.6, y: 43.9, size: 1.2, bold: true, align: 'center', face: 'top' },
  { text: 'ATELIER-328', x: 47.5, y: 33.4, size: 3.4, bold: true, align: 'center', face: 'top' },
  { text: 'CARTE DE DÉVELOPPEMENT · R3', x: 47.5, y: 30.2, size: 1.05, align: 'center', face: 'top' },
  { text: 'MATÉRIEL LIBRE', x: 47.5, y: 28.4, size: 0.9, align: 'center', face: 'top' },
  { text: 'L', x: 28.3, y: 46.2, size: 0.95, align: 'right', face: 'top' },
  { text: 'TX', x: 28.3, y: 43.8, size: 0.95, align: 'right', face: 'top' },
  { text: 'RX', x: 28.3, y: 41.4, size: 0.95, align: 'right', face: 'top' },
  { text: 'ON', x: 59.4, y: 29.9, size: 0.95, align: 'center', face: 'top' },
  { text: 'RESET', x: 5.6, y: 47.4, size: 0.95, align: 'center', face: 'top' },
  { text: 'RESET-EN', x: 35.8, y: 24.3, size: 0.75, align: 'center', face: 'top' },
  { text: 'ICSP', x: 64.0, y: 31.8, size: 0.95, align: 'center', face: 'top' },
  { text: 'ICSP', x: 17.6, y: 47.6, size: 0.95, align: 'center', face: 'top' },
  { text: 'USB', x: 1.6, y: 45.8, size: 0.9, align: 'left', face: 'top' },
  // Face inférieure : mêmes conventions (repère carte) ; l'illustration retourne chaque texte
  // sur place pour qu'il se lise carte retournée.
  ...pinLabels(IOH_LABELS, IOH_X0, 48.6, 90, 'right', 'bottom'),
  ...pinLabels(IOL_LABELS, IOL_X0, 48.6, 90, 'right', 'bottom'),
  ...pinLabels(POWER_LABELS, POWER_X0, 4.6, 90, 'left', 'bottom'),
  ...pinLabels(AD_LABELS, AD_X0, 4.6, 90, 'left', 'bottom'),
  { text: 'ATELIER-328', x: 34.3, y: 32.5, size: 3.0, bold: true, align: 'center', face: 'bottom' },
  { text: 'Carte de développement libre', x: 34.3, y: 29.0, size: 1.0, align: 'center', face: 'bottom' },
  { text: 'FR4 1,6 mm · 2 couches · HASL', x: 34.3, y: 27.0, size: 0.9, align: 'center', face: 'bottom' },
  { text: 'LOT 2331-A', x: 34.3, y: 24.6, size: 0.9, align: 'center', face: 'bottom' },
  { text: 'POWER', x: 24.8, y: 2.54, size: 1.0, bold: true, align: 'right', face: 'bottom' },
  { text: 'ANALOG IN', x: 57.15, y: 7.1, size: 1.0, bold: true, align: 'center', face: 'bottom' },
  { text: 'DIGITAL (PWM~)', x: 54.6, y: 43.9, size: 1.1, bold: true, align: 'center', face: 'bottom' },
];
