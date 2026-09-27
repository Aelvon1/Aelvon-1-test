/**
 * ATmega328P en boîtier PDIP-28 : implantation interne (module PUR, sans three.js, testé).
 *
 * Repère : mm, repère LOCAL du boîtier vu de dessus, origine au centre, X le long du boîtier
 * (encoche de la broche 1 côté −X), Z en travers (broches 1–14 côté +Z, 15–28 côté −Z).
 *
 * Contenu :
 * - puce de 3,0 × 3,0 mm (typique) : 32 plots de liaison (8 par côté, comme la version
 *   TQFP-32 du même circuit) dont 28 câblés en DIP-28 ; les 4 plots d'angle des grands côtés
 *   (ADC6, ADC7, second VCC, second GND en TQFP) restent nus ;
 * - grille de connexion (leadframe) d'épaisseur 0,25 mm dans le plan de joint : îlot (paddle)
 *   de 3,5 × 3,5 mm tenu par deux barrettes de maintien (tie bars) qui affleurent aux extrémités
 *   du boîtier, et 28 doigts qui relient chaque patte extérieure à un point de soudure de fil ;
 * - fils de liaison : du plot de la puce (boule) au doigt (soudure en croissant).
 *
 * Tracé des doigts : lignes brisées orthogonales à congés (gravure chimique), imbriquées sans
 * croisement : les broches d'extrémité (1–4, 11–14, 15–18, 25–28) rejoignent les petits côtés de
 * la puce en longeant l'axe du boîtier (la plus éloignée au plus près de l'axe), les broches
 * centrales rejoignent les grands côtés. Approximation : un seul plan de grille (pas de
 * décalage vertical de l'îlot), trous d'ancrage des doigts omis.
 */

export type P2 = readonly [number, number];

/** Dimensions (mm, typiques). */
export const DIE = {
  /** Côté de la puce. */
  size: 3.0,
  /** Épaisseur après amincissement (typique 0,28–0,38 mm). */
  thickness: 0.3,
  /** Colle époxy chargée argent sous la puce. */
  attach: 0.025,
  /** Plot de liaison (ouverture de passivation) carré. */
  pad: 0.09,
  /** Distance du centre des plots au bord de la puce. */
  padInset: 0.12,
} as const;

export const LEADFRAME = {
  /** Épaisseur de la grille (alliage de cuivre C194, typique). */
  thickness: 0.25,
  /** Îlot (paddle) carré. */
  paddle: 3.5,
  /** Largeur courante des doigts. */
  finger: 0.25,
  /** Largeur des barrettes de maintien. */
  tieBar: 0.3,
  /** Flanc du boîtier (sortie des pattes), |z|. */
  flank: 3.5,
  /** Largeur de la patte à la sortie du boîtier. */
  leadWidth: 1.52,
  /** Longueur de l'élargissement doigt → patte avant le flanc. */
  taper: 0.22,
  /** Extrémités des barrettes : fond de l'encoche (−X) et face d'extrémité (+X). */
  tieBarEnds: [-16.85, 17.6] as const,
  /** Longueur argentée (dépôt localisé) au bout de chaque doigt. */
  silverLength: 0.45,
} as const;

/** Fils de liaison. */
export const WIRE = {
  /** Diamètre du fil d'or (1 mil). */
  diameter: 0.025,
  /** Portée horizontale du profil de référence (mm) ; chaque fil est étiré à sa portée. */
  referenceSpan: 1.05,
  /** Diamètre et hauteur de la boule (thermosonique). */
  ballDiameter: 0.065,
  ballHeight: 0.022,
  /** Hauteur de boucle au-dessus du plot. */
  loopHeight: 0.19,
} as const;

/** Nom de broche (fonction AVR et usage sur la carte). */
export const PIN_NAMES: Readonly<Record<number, string>> = {
  1: 'PC6 / RESET',
  2: 'PD0 / RXD (D0)',
  3: 'PD1 / TXD (D1)',
  4: 'PD2 / INT0 (D2)',
  5: 'PD3 / INT1 (D3)',
  6: 'PD4 / T0 (D4)',
  7: 'VCC',
  8: 'GND',
  9: 'PB6 / XTAL1',
  10: 'PB7 / XTAL2',
  11: 'PD5 / OC0B (D5)',
  12: 'PD6 / AIN0 (D6)',
  13: 'PD7 / AIN1 (D7)',
  14: 'PB0 / ICP1 (D8)',
  15: 'PB1 / OC1A (D9)',
  16: 'PB2 / SS (D10)',
  17: 'PB3 / MOSI (D11)',
  18: 'PB4 / MISO (D12)',
  19: 'PB5 / SCK (D13)',
  20: 'AVCC',
  21: 'AREF',
  22: 'GND',
  23: 'PC0 / ADC0 (A0)',
  24: 'PC1 / ADC1 (A1)',
  25: 'PC2 / ADC2 (A2)',
  26: 'PC3 / ADC3 (A3)',
  27: 'PC4 / SDA (A4)',
  28: 'PC5 / SCL (A5)',
};

export type DieSide = '-x' | '+x' | '-z' | '+z';

export interface BondPad {
  side: DieSide;
  x: number;
  z: number;
  /** Broche DIP câblée (absent : plot nu en DIP-28). */
  pin?: number;
  /** Nom du plot (fonction). */
  name: string;
}

export interface Finger {
  pin: number;
  /** Ligne brisée du doigt : de l'extrémité intérieure jusqu'au flanc du boîtier (|z| = 3,5). */
  path: P2[];
  /** Point de soudure du fil (croissant) sur le doigt. */
  stitch: P2;
  /** Plot de la puce relié. */
  pad: P2;
}

/** Abscisse de la broche n (1–28). */
export function pinX(pin: number): number {
  return pin <= 14 ? -16.51 + (pin - 1) * 2.54 : 16.51 - (pin - 15) * 2.54;
}

/** Côté du boîtier de la broche n : +1 (broches 1–14, +Z) ou −1. */
export const pinSide = (pin: number): 1 | -1 => (pin <= 14 ? 1 : -1);

// --- Quart de référence (x < 0, z > 0 : broches 1 à 7), symétrisé ensuite -----------------------

const H = DIE.size / 2 - DIE.padInset; // 1,38 : ligne des plots
/** Plots des petits côtés (|z|) et des grands côtés (|x|) dans le quart de référence. */
const SHORT_PADS = [0.3, 0.62, 0.94, 1.26];
const LONG_PADS = [0.16, 0.48, 0.8, 1.12];
/** Points de soudure (croissants) sur les doigts. */
const SHORT_STITCH_X = 2.35;
const SHORT_LEVELS = [0.45, 0.9, 1.35, 1.8];
const LONG_STITCH_Z = 2.3;
const LONG_STITCH_X = [1.5, 0.9, 0.3];
/** Paliers horizontaux des doigts des broches 5, 6, 7. */
const LONG_LEVELS = [2.42, 2.84, 3.26];
/** Retour du doigt au-delà du point de soudure (vers la puce). */
const STITCH_MARGIN = 0.14;

interface QuarterFinger {
  /** Rang dans le quart (0 = broche 1, … 6 = broche 7). */
  k: number;
  path: P2[];
  stitch: P2;
  pad: P2;
}

function quarterFingers(): QuarterFinger[] {
  const out: QuarterFinger[] = [];
  const flank = LEADFRAME.flank;
  // Broches 1 à 4 → petit côté −X ; la plus éloignée au plus près de l'axe.
  for (let k = 0; k < 4; k++) {
    const x = pinX(k + 1);
    const z = SHORT_LEVELS[k]!;
    out.push({
      k,
      path: [
        [-SHORT_STITCH_X + STITCH_MARGIN, z],
        [x, z],
        [x, flank],
      ],
      stitch: [-SHORT_STITCH_X, z],
      pad: [-H, SHORT_PADS[k]!],
    });
  }
  // Broches 5 à 7 → grand côté +Z ; paliers croissants vers le centre.
  for (let j = 0; j < 3; j++) {
    const k = 4 + j;
    const x = pinX(k + 1);
    const sx = -LONG_STITCH_X[j]!;
    const level = LONG_LEVELS[j]!;
    out.push({
      k,
      path: [
        [sx, LONG_STITCH_Z - STITCH_MARGIN],
        [sx, level],
        [x, level],
        [x, flank],
      ],
      stitch: [sx, LONG_STITCH_Z],
      pad: [-LONG_PADS[2 - j]!, H],
    });
  }
  return out;
}

/** Broche obtenue par symétrie d'une broche du quart de référence (k = 0..6). */
function mirroredPin(k: number, mx: boolean, mz: boolean): number {
  const p = k + 1;
  if (!mx && !mz) return p;
  if (mx && !mz) return 15 - p;
  if (!mx && mz) return 29 - p;
  return 14 + p;
}

const mirror = (v: P2, mx: boolean, mz: boolean): P2 => [mx ? -v[0] : v[0], mz ? -v[1] : v[1]];

let fingersCache: Finger[] | null = null;

/** Les 28 doigts de la grille (ordre des broches 1 → 28). */
export function fingers(): Finger[] {
  if (fingersCache) return fingersCache;
  const q = quarterFingers();
  const out: Finger[] = [];
  for (const mx of [false, true])
    for (const mz of [false, true])
      for (const f of q)
        out.push({
          pin: mirroredPin(f.k, mx, mz),
          path: f.path.map((p) => mirror(p, mx, mz)),
          stitch: mirror(f.stitch, mx, mz),
          pad: mirror(f.pad, mx, mz),
        });
  out.sort((a, b) => a.pin - b.pin);
  fingersCache = out;
  return out;
}

/** Les 32 plots de la puce (câblés ou nus). */
export function bondPads(): BondPad[] {
  const pads: BondPad[] = [];
  const byPos = new Map<string, number>();
  for (const f of fingers()) byPos.set(`${f.pad[0].toFixed(3)},${f.pad[1].toFixed(3)}`, f.pin);
  const add = (side: DieSide, x: number, z: number, spare: string) => {
    const pin = byPos.get(`${x.toFixed(3)},${z.toFixed(3)}`);
    const pad: BondPad = { side, x, z, name: pin ? PIN_NAMES[pin]! : spare };
    if (pin) pad.pin = pin;
    pads.push(pad);
  };
  // Plots nus (fonctions présentes seulement en TQFP-32) : angles des grands côtés.
  const spare: Record<string, string> = {
    '-1,1': 'ADC6 (TQFP)',
    '1,1': 'ADC7 (TQFP)',
    '-1,-1': 'GND (TQFP)',
    '1,-1': 'VCC (TQFP)',
  };
  for (const sz of [1, -1] as const)
    for (const x of [...LONG_PADS.map((v) => -v), ...LONG_PADS])
      add(sz === 1 ? '+z' : '-z', x, sz * H, spare[`${Math.sign(x)},${sz}`] ?? 'NC');
  for (const sx of [1, -1] as const)
    for (const z of [...SHORT_PADS.map((v) => -v), ...SHORT_PADS]) add(sx === 1 ? '+x' : '-x', sx * H, z, 'NC');
  return pads;
}

/** Fil de liaison : du plot (boule) au doigt (croissant). */
export interface BondWire {
  pin: number;
  pad: P2;
  stitch: P2;
  /** Portée horizontale (mm). */
  span: number;
  /** Direction (rad) : angle du vecteur plot → doigt dans le plan (x, z), atan2(−dz, dx). */
  heading: number;
}

export function bondWires(): BondWire[] {
  return fingers().map((f) => {
    const dx = f.stitch[0] - f.pad[0];
    const dz = f.stitch[1] - f.pad[1];
    return { pin: f.pin, pad: f.pad, stitch: f.stitch, span: Math.hypot(dx, dz), heading: Math.atan2(-dz, dx) };
  });
}

/** Barrettes de maintien de l'îlot (lignes, largeur `LEADFRAME.tieBar`). */
export function tieBars(): P2[][] {
  const half = LEADFRAME.paddle / 2 - 0.05;
  return [
    [
      [-half, 0],
      [LEADFRAME.tieBarEnds[0], 0],
    ],
    [
      [half, 0],
      [LEADFRAME.tieBarEnds[1], 0],
    ],
  ];
}

/** Largeur d'un doigt à l'abscisse curviligne s (élargissement jusqu'à la patte au flanc). */
export function fingerWidth(s: number, total: number): number {
  const k = Math.min(1, Math.max(0, (s - (total - LEADFRAME.taper)) / LEADFRAME.taper));
  const e = k * k * (3 - 2 * k);
  return LEADFRAME.finger + (LEADFRAME.leadWidth - LEADFRAME.finger) * e;
}

// --- Vérifications géométriques (tests) --------------------------------------------------------

function segDist(a: P2, b: P2, c: P2, d: P2): number {
  const cross = (o: P2, p: P2, q: P2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}

export function pointSeg(p: P2, a: P2, b: P2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}

/**
 * Isolement minimal (mm) entre les doigts deux à deux et entre chaque doigt et l'îlot / les
 * barrettes, hors zone d'élargissement au flanc (où l'écart est de 2,54 − 1,52 mm).
 */
export function leadframeClearance(): number {
  const list = fingers();
  const inner = (path: P2[]): P2[] => {
    // Coupe la ligne avant l'élargissement.
    const last = path[path.length - 1]!;
    const prev = path[path.length - 2]!;
    const cut: P2 = [last[0], last[1] - Math.sign(last[1]) * (LEADFRAME.taper + 0.02)];
    return [...path.slice(0, -1), Math.abs(cut[1]) > Math.abs(prev[1]) ? cut : prev];
  };
  const half = LEADFRAME.finger / 2;
  let min = Infinity;
  const polyDist = (p: P2[], q: P2[]) => {
    let m = Infinity;
    for (let i = 0; i + 1 < p.length; i++)
      for (let j = 0; j + 1 < q.length; j++) m = Math.min(m, segDist(p[i]!, p[i + 1]!, q[j]!, q[j + 1]!));
    return m;
  };
  for (let i = 0; i < list.length; i++) {
    const a = inner(list[i]!.path);
    for (let j = i + 1; j < list.length; j++) min = Math.min(min, polyDist(a, inner(list[j]!.path)) - 2 * half);
    for (const bar of tieBars()) min = Math.min(min, polyDist(a, bar) - half - LEADFRAME.tieBar / 2);
    // Îlot : distance du doigt au carré de l'îlot.
    const P = LEADFRAME.paddle / 2;
    for (const p of a) {
      const dx = Math.max(0, Math.abs(p[0]) - P);
      const dz = Math.max(0, Math.abs(p[1]) - P);
      min = Math.min(min, Math.hypot(dx, dz) - half);
    }
  }
  return min;
}

// --- Plan de la puce (texture) ------------------------------------------------------------------

export type BlockKind = 'flash' | 'sram' | 'eeprom' | 'logic' | 'analog' | 'adc' | 'osc';

export interface DieBlock {
  kind: BlockKind;
  /** Rectangle [x0, z0, x1, z1] en mm, repère de la puce (origine au centre). */
  rect: readonly [number, number, number, number];
  label: string;
}

/**
 * Plan (floorplan) plausible de la puce : Flash 32 Ko (le plus grand bloc), SRAM 2 Ko,
 * EEPROM 1 Ko, cœur AVR et périphériques en cellules standard, CAN à capacités commutées,
 * oscillateurs / référence de tension / détecteur de baisse de tension. Approximation : plan
 * inventé (proportions typiques d'un microcontrôleur 0,35 µm), pas le dessin réel du circuit.
 */
export const DIE_BLOCKS: readonly DieBlock[] = [
  { kind: 'flash', rect: [-1.1, -1.12, 1.1, -0.12], label: 'Flash 32 Ko' },
  { kind: 'eeprom', rect: [-1.1, -0.02, -0.6, 0.44], label: 'EEPROM 1 Ko' },
  { kind: 'logic', rect: [-0.5, -0.02, 0.12, 0.44], label: 'Décodage et bus' },
  { kind: 'sram', rect: [0.22, -0.02, 1.1, 0.5], label: 'SRAM 2 Ko' },
  { kind: 'logic', rect: [-1.1, 0.56, 0.35, 1.12], label: 'Cœur AVR et périphériques' },
  { kind: 'osc', rect: [0.45, 0.58, 1.1, 0.72], label: 'Oscillateurs, référence, BOD' },
  { kind: 'adc', rect: [0.45, 0.8, 1.1, 1.12], label: 'CAN 10 bits' },
];

/** Zone du cœur (à l'intérieur de l'anneau d'entrées-sorties), mm. */
export const DIE_CORE = 1.15;
