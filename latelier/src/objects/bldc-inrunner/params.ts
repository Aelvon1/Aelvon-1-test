/**
 * Paramètres du moteur brushless inrunner et CALCULS PURS (sans three.js, testés) :
 * cotes dérivées du format, géométrie de la tôle, rotor, roulements, bobinage (spires, brins,
 * schéma), grandeurs électriques indicatives.
 *
 * Toutes les cotes sont en millimètres (lisibles comme sur un plan) ; la construction les
 * convertit en mètres. Repère du moteur : axe selon +X (arbre de sortie côté +X = avant),
 * origine au milieu du carter, angles θ mesurés de +Y vers +Z (y = r cos θ, z = r sin θ).
 */
import type { ObjectPreset, ParamSchema } from '../types';
import { signedArea, type P2 } from './profile2d';
import { laminationSlotPolygon, type LaminationSpec } from './lamination';
import { canContour } from './sections';

export const OBJECT_ID = 'bldc-inrunner';

export type FormatId = '2848' | '3650' | '3660';
export type SlotPoleId = '12-4' | '12-2' | '9-6';
export type LeadsId = 'tabs' | 'wires';
export type LaminationId = '0.2' | '0.35';
export type AnodizeId = 'blue' | 'red' | 'black' | 'silver';

export type BldcParams = {
  format: FormatId;
  kv: number;
  slotPole: SlotPoleId;
  sensors: boolean;
  leads: LeadsId;
  lamination: LaminationId;
  anodize: AnodizeId;
};

export const DEG = Math.PI / 180;

// --- Schéma de paramètres, préréglages ----------------------------------------------------------

export const DEFAULT_PARAMS: BldcParams = {
  format: '3650',
  kv: 4300,
  slotPole: '12-4',
  sensors: true,
  leads: 'tabs',
  lamination: '0.35',
  anodize: 'blue',
};

export const PARAM_SCHEMA: readonly ParamSchema[] = [
  {
    key: 'format',
    label: 'Format',
    kind: 'select',
    options: [
      { value: '2848', label: '2848 (Ø 28 × 48 mm)' },
      { value: '3650', label: '3650 (Ø 36 × 50 mm)' },
      { value: '3660', label: '3660 (Ø 36 × 60 mm)' },
    ],
    help: 'Diamètre × longueur du carter. Le paquet de tôles, le rotor et les roulements en découlent.',
  },
  {
    key: 'kv',
    label: 'KV',
    kind: 'number',
    min: 3000,
    max: 6000,
    step: 50,
    unit: 'tr/min/V',
    help: 'Vitesse à vide par volt. Un KV élevé s’obtient avec moins de spires d’un fil plus gros.',
  },
  {
    key: 'slotPole',
    label: 'Encoches / pôles',
    kind: 'select',
    options: [
      { value: '12-4', label: '12 encoches / 4 pôles (réparti, pas de 3)' },
      { value: '12-2', label: '12 encoches / 2 pôles (réparti, pas de 6)' },
      { value: '9-6', label: '9 encoches / 6 pôles (concentré sur dents)' },
    ],
  },
  {
    key: 'sensors',
    label: 'Capteurs à effet Hall',
    kind: 'boolean',
    help: 'Moteur « sensored » (démarrage doux).',
  },
  {
    key: 'leads',
    label: 'Sorties de phase',
    kind: 'select',
    options: [
      { value: 'tabs', label: 'Languettes à souder A/B/C' },
      { value: 'wires', label: 'Fils silicone + bullets 4 mm' },
    ],
  },
  {
    key: 'lamination',
    label: 'Épaisseur des tôles',
    kind: 'select',
    options: [
      { value: '0.2', label: '0,20 mm (haute fréquence)' },
      { value: '0.35', label: '0,35 mm (standard)' },
    ],
    help: 'Des tôles plus fines limitent les courants de Foucault aux fréquences élevées.',
  },
  {
    key: 'anodize',
    label: 'Anodisation',
    kind: 'select',
    options: [
      { value: 'blue', label: 'Bleu pétrole' },
      { value: 'red', label: 'Rouge' },
      { value: 'black', label: 'Noir' },
      { value: 'silver', label: 'Argent' },
    ],
  },
];

export const PRESETS: readonly ObjectPreset<BldcParams>[] = [
  { id: '3650', label: '3650 capteurs 4300 KV (défaut)', params: { ...DEFAULT_PARAMS } },
  {
    id: '2848',
    label: '2848 sans capteurs 4800 KV, fils',
    params: { format: '2848', kv: 4800, slotPole: '12-4', sensors: false, leads: 'wires', lamination: '0.2' },
  },
  {
    id: '3660',
    label: '3660 capteurs 3200 KV, arbre 5 mm',
    params: { format: '3660', kv: 3200, slotPole: '12-4', sensors: true, leads: 'tabs', anodize: 'black' },
  },
  {
    id: '3650-2p',
    label: '3650 2 pôles 5900 KV, fils',
    params: { format: '3650', kv: 5900, slotPole: '12-2', sensors: false, leads: 'wires', anodize: 'red' },
  },
  {
    id: '3650-96',
    label: '3650 9 encoches / 6 pôles 3000 KV',
    params: { format: '3650', kv: 3000, slotPole: '9-6', sensors: true, leads: 'tabs', anodize: 'silver' },
  },
];

/** Normalise des paramètres (valeurs d'URL libres, types inattendus) avec repli sur le défaut. */
export function normalizeParams(raw: Partial<Record<keyof BldcParams, unknown>>): BldcParams {
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  const kvRaw = typeof raw.kv === 'number' ? raw.kv : Number(raw.kv);
  const kv = Number.isFinite(kvRaw) ? Math.min(6000, Math.max(3000, Math.round(kvRaw / 50) * 50)) : 4300;
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : fallback;
  return {
    format: pick(raw.format, ['2848', '3650', '3660'] as const, DEFAULT_PARAMS.format),
    kv,
    slotPole: pick(raw.slotPole, ['12-4', '12-2', '9-6'] as const, DEFAULT_PARAMS.slotPole),
    sensors: bool(raw.sensors, DEFAULT_PARAMS.sensors),
    leads: pick(raw.leads, ['tabs', 'wires'] as const, DEFAULT_PARAMS.leads),
    lamination: pick(raw.lamination, ['0.2', '0.35'] as const, DEFAULT_PARAMS.lamination),
    anodize: pick(raw.anodize, ['blue', 'red', 'black', 'silver'] as const, DEFAULT_PARAMS.anodize),
  };
}

// --- Données des formats -------------------------------------------------------------------------

/** Vis à six pans creux (ISO 4762). */
export interface ScrewSpec {
  name: string;
  d: number;
  pitch: number;
  headD: number;
  headH: number;
  length: number;
  /** Ouverture de la clé mâle (mm). */
  key: number;
  tool: 'hex-key-1.5' | 'hex-key-2';
}

/** Roulement rigide à billes blindé (ZZ). */
export interface BearingSpec {
  ref: string;
  d: number;
  D: number;
  B: number;
  ballD: number;
}

interface FormatSpec {
  id: FormatId;
  canOD: number;
  length: number;
  shaftD: number;
  finHeight: number;
  statorOD: number;
  flangeT: number;
  webDepth: number;
  airgap: number;
  sleeveT: number;
  shaftOut: number;
  screw: ScrewSpec;
  bearing: BearingSpec;
  pinion: { teeth: number; module: number; width: number; hubD: number; hubL: number; setScrewL: number };
  mountSpacing: number;
  /** Hauteur des têtes de bobines du bobinage de référence 12/4 (mm). */
  endTurnBase: number;
  /** Diamètre de brin préféré (mm). */
  strandPref: number;
  /** Tension nominale typique (V) pour les vitesses indicatives. */
  cells: number;
}

const M25: ScrewSpec = {
  name: 'M2,5',
  d: 2.5,
  pitch: 0.45,
  headD: 4.5,
  headH: 2.5,
  length: 6,
  key: 2,
  tool: 'hex-key-2',
};
const M2: ScrewSpec = {
  name: 'M2',
  d: 2,
  pitch: 0.4,
  headD: 3.8,
  headH: 2,
  length: 5,
  key: 1.5,
  tool: 'hex-key-1.5',
};

const FORMATS: Record<FormatId, FormatSpec> = {
  '2848': {
    id: '2848',
    canOD: 28,
    length: 48,
    shaftD: 3.175,
    finHeight: 0.6,
    statorOD: 21,
    flangeT: 2,
    webDepth: 1.3,
    airgap: 0.35,
    sleeveT: 0.2,
    shaftOut: 12,
    screw: M2,
    // R2-5ZZ : 1/8" × 5/16" × 9/64" (billes 3/64", nombre typique).
    bearing: { ref: 'R2-5ZZ', d: 3.175, D: 7.938, B: 3.571, ballD: 1.191 },
    pinion: { teeth: 16, module: 0.5, width: 5, hubD: 7.5, hubL: 3.5, setScrewL: 2 },
    mountSpacing: 16,
    endTurnBase: 3.9,
    strandPref: 0.35,
    cells: 2,
  },
  '3650': {
    id: '3650',
    canOD: 36,
    length: 50,
    shaftD: 3.175,
    finHeight: 0.8,
    statorOD: 27,
    flangeT: 2.5,
    webDepth: 1.5,
    airgap: 0.4,
    sleeveT: 0.25,
    shaftOut: 15,
    screw: M25,
    // R2-6ZZ : 1/8" × 3/8" × 5/32" (billes 1/16").
    bearing: { ref: 'R2-6ZZ', d: 3.175, D: 9.525, B: 3.967, ballD: 1.5875 },
    pinion: { teeth: 18, module: 0.6, width: 6, hubD: 8, hubL: 4, setScrewL: 2.5 },
    mountSpacing: 25,
    endTurnBase: 5,
    strandPref: 0.4,
    cells: 2,
  },
  '3660': {
    id: '3660',
    canOD: 36,
    length: 60,
    shaftD: 5,
    finHeight: 0.8,
    statorOD: 27,
    flangeT: 2.5,
    webDepth: 1.5,
    airgap: 0.4,
    sleeveT: 0.25,
    shaftOut: 17,
    screw: M25,
    // 685ZZ : 5 × 11 × 5 mm (billes 1/16", nombre typique).
    bearing: { ref: '685ZZ', d: 5, D: 11, B: 5, ballD: 1.5875 },
    pinion: { teeth: 15, module: 1, width: 7, hubD: 11, hubL: 5, setScrewL: 3 },
    mountSpacing: 25,
    endTurnBase: 5,
    strandPref: 0.4,
    cells: 4,
  },
};

// --- Bobinage : schéma --------------------------------------------------------------------------

/** Bobine : phase (0 = A, 1 = B, 2 = C), encoche aller, encoche retour, dent (concentré). */
export interface CoilDef {
  phase: 0 | 1 | 2;
  go: number;
  ret: number;
  tooth: number | null;
}

export interface SlotPoleSpec {
  id: SlotPoleId;
  slots: number;
  poles: number;
  polePairs: number;
  kind: 'distributed' | 'concentrated';
  /** Pas de bobine (en encoches). */
  pitch: number;
  /** Couches par encoche (1 = une seule bobine par encoche, 2 = deux demi-encoches). */
  layers: 1 | 2;
  coils: CoilDef[];
  coilsPerPhase: number;
  /** Coefficient de bobinage (distribution × raccourcissement), fondamental. */
  windingFactor: number;
  /** Facteur de hauteur des têtes de bobines (réf. 12/4 = 1). */
  endTurnFactor: number;
}

const PHASE_BELTS: readonly { phase: 0 | 1 | 2; sign: 1 | -1 }[] = [
  { phase: 0, sign: 1 },
  { phase: 2, sign: -1 },
  { phase: 1, sign: 1 },
  { phase: 0, sign: -1 },
  { phase: 2, sign: 1 },
  { phase: 1, sign: -1 },
];

/** Schéma de bobinage cohérent avec la combinaison encoches/pôles. */
export function slotPoleSpec(id: SlotPoleId): SlotPoleSpec {
  if (id === '9-6') {
    const Q = 9;
    const p = 3;
    const coils: CoilDef[] = [];
    // Bobines concentrées : une par dent, séquence A B C (120° électriques entre dents).
    for (let k = 0; k < Q; k++)
      coils.push({ phase: (k % 3) as 0 | 1 | 2, go: (k - 1 + Q) % Q, ret: k, tooth: k });
    const pitchElec = (360 * p) / Q; // 120°
    return {
      id,
      slots: Q,
      poles: 2 * p,
      polePairs: p,
      kind: 'concentrated',
      pitch: 1,
      layers: 2,
      coils,
      coilsPerPhase: 3,
      windingFactor: Math.sin((pitchElec / 2) * DEG),
      endTurnFactor: 0.8,
    };
  }
  const Q = 12;
  const p = id === '12-4' ? 2 : 1;
  const pitch = Q / (2 * p);
  const coils: CoilDef[] = [];
  for (let s = 0; s < Q; s++) {
    const elec = ((((s * p * 360) / Q) % 360) + 360) % 360;
    const belt = PHASE_BELTS[Math.floor(elec / 60 + 1e-9) % 6]!;
    if (belt.sign === 1) coils.push({ phase: belt.phase, go: s, ret: (s + pitch) % Q, tooth: null });
  }
  // Distribution : q encoches par pôle et par phase, angle d'encoche α électrique.
  const q = Q / (2 * p * 3);
  const alpha = ((360 * p) / Q) * DEG;
  const kd = Math.sin((q * alpha) / 2) / (q * Math.sin(alpha / 2));
  return {
    id,
    slots: Q,
    poles: 2 * p,
    polePairs: p,
    kind: 'distributed',
    pitch,
    layers: 1,
    coils,
    coilsPerPhase: coils.length / 3,
    windingFactor: kd,
    endTurnFactor: p === 2 ? 1 : 1.6,
  };
}

// --- Brins -----------------------------------------------------------------------------------------

/** Diamètres normalisés de fil de cuivre émaillé (mm, cuivre nu). */
export const STRAND_DIAMETERS = [0.2, 0.25, 0.28, 0.3, 0.32, 0.35, 0.4, 0.45, 0.5, 0.56, 0.6] as const;

/** Diamètre extérieur d'un fil émaillé grade 2 (IEC 60317, ordre de grandeur). */
export const enamelledDiameter = (d: number): number => d + 0.028 + 0.035 * d;

/** Choix du fil : diamètre de brin et nombre de brins en parallèle pour une section visée. */
export function chooseStrands(
  targetArea: number,
  preferred: number,
): { d: number; count: number; area: number } {
  const areaOf = (d: number) => (Math.PI * d * d) / 4;
  let d: number = preferred;
  let count = Math.max(1, Math.round(targetArea / areaOf(d)));
  // Trop de brins : on grossit le fil ; trop peu : on l'affine (bobinage manuel multibrin).
  const list = STRAND_DIAMETERS as readonly number[];
  let i = list.indexOf(preferred);
  while (count > 14 && i < list.length - 1) {
    d = list[++i]!;
    count = Math.max(1, Math.round(targetArea / areaOf(d)));
  }
  while (count < 3 && i > 0) {
    d = list[--i]!;
    count = Math.max(1, Math.round(targetArea / areaOf(d)));
  }
  return { d, count, area: count * areaOf(d) };
}

/**
 * Disposition des brins dans la section d'un conducteur (anneaux concentriques serrés).
 * Retourne les centres (mm, repère du conducteur) pour un fil émaillé de diamètre `dOut`.
 */
export function strandLayout(count: number, dOut: number): P2[] {
  if (count <= 0) return [];
  if (count === 1) return [[0, 0]];
  /** Rayon d'un anneau de m brins jointifs. */
  const ringRadius = (m: number) => (m <= 1 ? 0 : dOut / (2 * Math.sin(Math.PI / m)));
  // Configurations à deux anneaux (cœur de n0 brins + couronne) : on garde la plus compacte.
  let best: { n0: number; r0: number; r1: number } | null = null;
  for (let n0 = 0; n0 <= Math.min(5, count - 1); n0++) {
    const m = count - n0;
    const r0 = n0 === 0 ? 0 : ringRadius(n0);
    const r1 = n0 === 0 ? ringRadius(m) : Math.max(r0 + dOut * 0.93, ringRadius(m));
    if (n0 === 0 && m > 6) continue;
    if (!best || r1 < best.r1 - 1e-9) best = { n0, r0, r1 };
  }
  const pts: P2[] = [];
  const { n0, r0, r1 } = best!;
  for (let k = 0; k < n0; k++) {
    const a = (2 * Math.PI * k) / n0;
    pts.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
  }
  const m = count - n0;
  for (let k = 0; k < m; k++) {
    const a = Math.PI / Math.max(3, m) + (2 * Math.PI * k) / m;
    pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]);
  }
  return pts;
}

/** Rayon du faisceau d'un conducteur (enveloppe des brins). */
export function bundleRadius(layout: readonly P2[], dOut: number): number {
  let r = 0;
  for (const p of layout) r = Math.max(r, Math.hypot(p[0], p[1]));
  return r + dOut / 2;
}

// --- Cotes dérivées ------------------------------------------------------------------------------

export interface StatorDims extends LaminationSpec {
  stackLength: number;
  x0: number;
  x1: number;
  lamThickness: number;
  lamCount: number;
  /** Pas axial d'une tôle (longueur / nombre). */
  lamPitch: number;
  /** Aire géométrique d'une encoche (sous les becs de dent), mm². */
  slotArea: number;
  /** Aire utile (à l'intérieur de l'isolant). */
  usableSlotArea: number;
  liner: number;
}

export interface WindingDims {
  spec: SlotPoleSpec;
  turnsExact: number;
  /** Spires par bobine (arrondi au demi-tour). */
  turns: number;
  /** KV obtenu avec le nombre de spires arrondi. */
  kvEffective: number;
  conductorsPerSlot: number;
  fillFactor: number;
  copperPerSlot: number;
  conductorArea: number;
  strandD: number;
  strandOuterD: number;
  strands: number;
  strandOffsets: P2[];
  bundleR: number;
  endTurnHeight: number;
  /** Longueur moyenne d'une spire (mm). */
  meanTurnLength: number;
  /** Longueur de fil par phase (mm). */
  wirePerPhase: number;
  phaseResistance: number;
  lineResistance: number;
  /** Constante de couple (N·m/A). */
  kt: number;
  /** Constante de FCEM (V/1000 tr/min). */
  keVperKrpm: number;
  /** Vitesse à vide indicative sous la tension nominale (tr/min). */
  noLoadRpm: number;
  nominalVoltage: number;
}

export interface BldcDims {
  params: BldcParams;
  format: FormatSpec;
  /** Échelle relative au format Ø 36. */
  s: number;
  length: number;
  half: number;
  // Carter
  canR: number;
  finHeight: number;
  bodyR: number;
  boreR: number;
  tubeHalf: number;
  fins: { angles: number[]; width: number };
  label: { center: number; halfAngle: number };
  /** Hauteur de l'axe au-dessus du tapis (moteur couché sur ses ailettes). */
  axisY: number;
  // Flasques
  flangeR: number;
  flangeT: number;
  spigotR: number;
  spigotInnerR: number;
  spigotDepth: number;
  /** |x| de la face intérieure du voile de flasque. */
  webX: number;
  /** |x| de l'épaulement (face extérieure) du logement de roulement. */
  shoulderX: number;
  bossR: number;
  /** |x| de l'extrémité intérieure du bossage de roulement. */
  bossEndX: number;
  shaftHoleR: number;
  pilotR: number;
  pilotH: number;
  screw: ScrewSpec & { pcdR: number; angles: number[]; holeDepth: number };
  mount: { r: number; angles: number[]; d: number; pitch: number };
  // Stator
  stator: StatorDims;
  // Rotor
  gap: number;
  rotorR: number;
  sleeveT: number;
  magnetOuterR: number;
  magnetInnerR: number;
  magnetX0: number;
  magnetX1: number;
  magnetGapAngle: number;
  yokeX0: number;
  yokeX1: number;
  yokeHubR: number;
  shaftR: number;
  shaftX0: number;
  shaftX1: number;
  flat: { depth: number; x0: number; x1: number; angle: number };
  // Roulements
  bearing: BearingSpec & { frontX: number; rearX: number; pitchR: number; ballCount: number };
  // Calage arrière (sur l'arbre, derrière le rotor)
  circlip: { d2: number; s: number; x: number; outerR: number };
  shims: { count: number; t: number; innerR: number; outerR: number; x: number[] };
  wave: { t: number; amplitude: number; waves: number; innerR: number; outerR: number; x: number };
  // Pignon
  pinion: {
    teeth: number;
    module: number;
    pitchR: number;
    tipR: number;
    rootR: number;
    width: number;
    hubR: number;
    hubL: number;
    x0: number;
    gearX0: number;
    gearX1: number;
    setScrewX: number;
    setScrewL: number;
  };
  // Capteurs
  hall: { angles: number[]; r0: number; r1: number; width: number; x0: number; x1: number };
  pcb: {
    rIn: number;
    rOut: number;
    a0: number;
    a1: number;
    t: number;
    /** x de la face extérieure (côté −X) et intérieure. */
    xOut: number;
    xIn: number;
    screwAngles: number[];
    screwR: number;
    recessDepth: number;
  };
  connector: { angle: number; r: number; width: number; depth: number; height: number; pitch: number };
  // Sorties de phase
  tabs: { z: number[]; y: number; x0: number; x1: number; eyeletX: number; width: number; t: number };
  block: { y0: number; y1: number; z: number; x0: number; x1: number };
  leadHoles: { y: number; z: number; r: number }[];
  // Bobinage
  winding: WindingDims;
  /** Angle de référence du bobinage (rad) : alignement des axes de phase sur les capteurs. */
  windingAngle0: number;
}

/** Hauteur des têtes de bobines (mm). */
const endTurnHeight = (f: FormatSpec, sp: SlotPoleSpec) => f.endTurnBase * sp.endTurnFactor;

/** Géométrie de tôle (sans longueur) pour un format et une combinaison encoches/pôles. */
function laminationGeometry(f: FormatSpec, sp: SlotPoleSpec): LaminationSpec & { rotorR: number } {
  const s = f.canOD / 36;
  const Ro = f.statorOD / 2;
  // Rapport d'alésage : un rotor 2 pôles est plus petit (culasse statorique plus épaisse).
  const split = sp.polePairs === 1 ? 0.48 : sp.polePairs === 2 ? 0.55 : 0.58;
  const Ri = (split * f.statorOD) / 2;
  const rotorR = Ri - f.airgap;
  // Culasse statorique : porte la moitié du flux d'un pôle (B entrefer ≈ 0,6 T moyen, B culasse ≈ 1,5 T).
  const yoke = Math.max(1.4 * s, (0.4 * Math.PI * 2 * rotorR) / (4 * sp.polePairs));
  // Dents : environ la moitié du pas d'encoche à l'alésage (induction de dent ≈ 1,6 T).
  const toothWidth = 0.52 * ((Math.PI * 2 * Ri) / sp.slots);
  return {
    slots: sp.slots,
    Ro,
    Ri,
    Rsb: Ro - yoke,
    toothWidth,
    tipHeight: 0.45 * s,
    wedgeHeight: 0.55 * s,
    slotOpening: (sp.slots === 9 ? 1.8 : 1.5) * s,
    slot0: 0,
    rotorR,
  };
}

/** Constante d'étalonnage des spires : 5 spires en 3650, 12/4, 4300 KV (référence). */
let turnsConstant: number | null = null;
function referenceTurnsConstant(): number {
  if (turnsConstant !== null) return turnsConstant;
  const f = FORMATS['3650'];
  const sp = slotPoleSpec('12-4');
  const lam = laminationGeometry(f, sp);
  const stack = stackLength(f, sp);
  turnsConstant = 5 * 4300 * sp.windingFactor * (2 * lam.rotorR) * stack * sp.coilsPerPhase;
  return turnsConstant;
}

/** Longueur de paquet = longueur du carter − flasques − têtes de bobines − jeux. */
function stackLength(f: FormatSpec, sp: SlotPoleSpec): number {
  const s = f.canOD / 36;
  const webX = f.length / 2 - f.flangeT - f.webDepth;
  const clearance = 1 * s;
  return 2 * (webX - clearance - endTurnHeight(f, sp));
}

/**
 * Spires par bobine pour un KV visé. La FCEM par spire vaut ω·kw·B·π·D·L/2 : elle ne dépend
 * PAS du nombre de pôles (flux par pôle ∝ 1/p, fréquence électrique ∝ p). Le KV impose donc les
 * spires en série par phase N·c : N ∝ 1 / (KV · kw · D · L · c).
 */
export function turnsForKv(
  kv: number,
  kw: number,
  rotorD: number,
  stack: number,
  coilsPerPhase: number,
): number {
  return referenceTurnsConstant() / (kv * kw * rotorD * stack * coilsPerPhase);
}

/** Arrondi au demi-tour (une demi-spire fait sortir le fil à l'autre extrémité), minimum 1. */
export const roundTurns = (n: number): number => Math.max(1, Math.round(n * 2) / 2);

/** Nombre de billes d'un roulement miniature (espacement ≈ 1,75 × Ø bille sur le cercle primitif). */
export const ballCount = (b: BearingSpec): number =>
  Math.floor((Math.PI * (b.d + b.D)) / 2 / (1.75 * b.ballD));

/** Nombre réel de tôles du paquet. */
export const laminationCount = (stack: number, thickness: number): number => Math.round(stack / thickness);

/** Cotes dérivées complètes. */
export function deriveDimensions(input: Partial<Record<keyof BldcParams, unknown>>): BldcDims {
  const params = normalizeParams(input);
  const f = FORMATS[params.format];
  const sp = slotPoleSpec(params.slotPole);
  const s = f.canOD / 36;
  const length = f.length;
  const half = length / 2;

  // --- Carter : tube à ailettes longitudinales, secteur lisse pour le marquage ---------------
  const canR = f.canOD / 2;
  const bodyR = canR - f.finHeight;
  const boreR = f.statorOD / 2;
  const flangeT = f.flangeT;
  const tubeHalf = half - flangeT;
  const finPitch = 15 * DEG;
  const label = { center: 55 * DEG, halfAngle: 52 * DEG };
  const finAngles: number[] = [];
  // Deux ailettes encadrent le bas (θ = 180°) : le moteur repose sur elles.
  for (let k = 0; k < 24; k++) {
    const a = Math.PI + finPitch / 2 + k * finPitch;
    const rel = Math.atan2(Math.sin(a - label.center), Math.cos(a - label.center));
    if (Math.abs(rel) > label.halfAngle) finAngles.push(a);
  }
  const finWidth = 1.5 * s;
  // Point le plus bas : sommets arrondis des deux ailettes du bas (le moteur repose dessus).
  const axisY = -Math.min(...canContour(bodyR, canR, finAngles, finWidth, 0.05).map((p) => p[0]));

  // --- Flasques ---------------------------------------------------------------------------------
  const webX = half - flangeT - f.webDepth;
  const spigotDepth = 2 * s;
  const spigotInnerR = boreR - 3.2 * s;
  const b = f.bearing;
  const shoulderX = half - 1.4 * s;
  const bossEndX = shoulderX - b.B - 0.2;
  const bossR = b.D / 2 + 0.7 * s;
  // Collerette légèrement en retrait des ailettes basses (le moteur repose sur ses ailettes).
  const flangeR = Math.min(bodyR + 0.4 * f.finHeight, axisY - 0.12);
  const screwPcd = (boreR + bodyR) / 2;
  const screw = {
    ...f.screw,
    pcdR: screwPcd,
    angles: [60 * DEG, 180 * DEG, 300 * DEG],
    holeDepth: f.screw.length - flangeT + 0.8,
  };
  const mount = { r: f.mountSpacing / 2, angles: [90 * DEG, 270 * DEG], d: 3, pitch: 0.5 };

  // --- Stator -----------------------------------------------------------------------------------
  const lam = laminationGeometry(f, sp);
  const stack = stackLength(f, sp);
  const lamThickness = params.lamination === '0.2' ? 0.2 : 0.35;
  const lamCount = laminationCount(stack, lamThickness);
  const liner = 0.15;
  const slotPoly = laminationSlotPolygon({ ...lam, slot0: 0 }, 0.05);
  const slotArea = Math.abs(signedArea(slotPoly));
  // Aire utile : on retire l'isolant (périmètre mouillé × épaisseur, hors ouverture).
  const wetPerimeter =
    2 * (lam.Rsb - lam.Ri - lam.tipHeight) + (2 * Math.PI * lam.Rsb) / sp.slots - lam.toothWidth;
  const usableSlotArea = Math.max(0.1, slotArea - wetPerimeter * liner);

  // --- Rotor ------------------------------------------------------------------------------------
  const rotorR = lam.rotorR;
  const sleeveT = f.sleeveT;
  const magnetOuterR = rotorR - sleeveT;
  const magnetT = 0.16 * 2 * rotorR;
  const magnetInnerR = magnetOuterR - magnetT;
  const shaftR = f.shaftD / 2;
  // Débord arrière de l'aimant : les capteurs lisent son champ de fuite en bout.
  const overhangRear = params.sensors ? 2 : 0.5;
  const magnetX0 = -stack / 2 - overhangRear;
  const magnetX1 = stack / 2 + 0.5;
  const yokeX0 = magnetX0 - 0.5;
  const yokeX1 = magnetX1 + 0.5;
  const frontBearingX = shoulderX - b.B / 2;
  const rearBearingX = -frontBearingX;
  const yokeHubR = Math.min(shaftR + 1.1 * s, b.d / 2 + (b.D - b.d) * 0.16);
  const shaftX0 = rearBearingX - b.B / 2 - 0.3;
  const shaftX1 = half + f.shaftOut;

  // --- Calage arrière : circlip DIN 471, cales, rondelle ondulée -------------------------------
  const circlipS = f.shaftD >= 4 ? 0.6 : 0.4;
  const bearingInnerFace = rearBearingX + b.B / 2;
  const waveT = 0.15;
  const waveAmp = 0.25;
  const wave = {
    t: waveT,
    amplitude: waveAmp,
    waves: 3,
    innerR: shaftR + 0.1,
    outerR: shaftR + (b.D - b.d) * 0.33,
    x: bearingInnerFace + waveAmp + waveT / 2 + 0.02,
  };
  const shimT = 0.1;
  const shimX0 = wave.x + waveAmp + waveT / 2 + 0.02 + shimT / 2;
  const shims = {
    count: 2,
    t: shimT,
    innerR: shaftR + 0.05,
    outerR: shaftR + (b.D - b.d) * 0.3,
    x: [shimX0, shimX0 + shimT + 0.01],
  };
  const circlip = {
    d2: f.shaftD - (f.shaftD >= 4 ? 0.2 : 0.2),
    s: circlipS,
    x: shims.x[1]! + shimT / 2 + circlipS / 2 + 0.03,
    outerR: shaftR + (f.shaftD >= 4 ? 1.9 : 1.45),
  };

  // --- Pignon -----------------------------------------------------------------------------------
  const pz = f.pinion.teeth;
  const pm = f.pinion.module;
  const pinionX0 = half + (f.shaftOut - f.pinion.width - f.pinion.hubL) * 0.3 + 1;
  const pinion = {
    teeth: pz,
    module: pm,
    pitchR: (pz * pm) / 2,
    tipR: (pz * pm) / 2 + pm,
    rootR: (pz * pm) / 2 - 1.25 * pm,
    width: f.pinion.width,
    hubR: f.pinion.hubD / 2,
    hubL: f.pinion.hubL,
    x0: pinionX0,
    gearX0: pinionX0 + f.pinion.hubL,
    gearX1: pinionX0 + f.pinion.hubL + f.pinion.width,
    setScrewX: pinionX0 + f.pinion.hubL / 2,
    setScrewL: f.pinion.setScrewL,
  };
  const flat = { depth: 0.22 * f.shaftD * 0.5 + 0.1, x0: half + 1.2, x1: shaftX1 - 0.6, angle: 0 };

  // --- Capteurs à effet Hall -------------------------------------------------------------------
  const p = sp.polePairs;
  const hallSpacing = (120 / p) * DEG;
  const hallAngles = [Math.PI - hallSpacing, Math.PI, Math.PI + hallSpacing];
  const hallR0 = bossR + 0.35;
  const hall = {
    angles: hallAngles,
    r0: hallR0,
    r1: hallR0 + 1.5,
    width: 3,
    x0: -webX - 0.2,
    x1: magnetX0 - 0.4,
  };
  const recessDepth = 1 * s;
  const pcbT = 0.8;
  const pcb = {
    rIn: b.D / 2 + 0.3,
    rOut: Math.min(12.8 * s, screwPcd - screw.headD / 2 - 0.35),
    a0: 48 * DEG,
    a1: 312 * DEG,
    t: pcbT,
    xOut: -half + recessDepth - pcbT,
    xIn: -half + recessDepth,
    screwAngles: [90 * DEG, 270 * DEG],
    screwR: 0,
    recessDepth,
  };
  pcb.screwR = (pcb.rIn + pcb.rOut) / 2 + 1.2 * s;
  const connector = {
    angle: Math.PI,
    r: pcb.rOut - 2.2 * s,
    width: 10.5,
    depth: 3.8,
    height: 4.5,
    pitch: 1.5,
  };

  // --- Sorties : languettes A/B/C sur un bornier en haut de la flasque arrière ------------------
  const tabY = 9.8 * s;
  const tabSpacing = 4.5 * s;
  const tabs = {
    z: [-tabSpacing, 0, tabSpacing],
    y: tabY,
    x0: -half - 1.5 * s,
    x1: -half - 1.5 * s - 5 * s,
    eyeletX: -half - 1.5 * s - 3.6 * s,
    width: 3 * s,
    t: 0.5,
  };
  // Trous de passage des sorties : sur un arc au milieu de la collerette de centrage.
  const holeR = (spigotInnerR + boreR) / 2;
  const leadHoles = tabs.z.map((z) => ({ y: Math.sqrt(holeR * holeR - z * z), z, r: 1.1 * s }));
  const block = {
    y0: tabY - 2.4 * s,
    y1: Math.max(...leadHoles.map((h) => h.y)) + leadHoles[0]!.r + 0.8 * s,
    z: 7 * s,
    x0: -half,
    x1: -half - 1.5 * s,
  };

  // --- Bobinage ---------------------------------------------------------------------------------
  const kw = sp.windingFactor;
  const turnsExact = turnsForKv(params.kv, kw, 2 * rotorR, stack, sp.coilsPerPhase);
  const turns = roundTurns(turnsExact);
  const kvEffective = (params.kv * turnsExact) / turns;
  const conductorsPerSlot = Math.ceil(turns) * sp.layers;
  const fillFactor = 0.36;
  const copperPerSlot = fillFactor * usableSlotArea;
  const conductorArea = copperPerSlot / conductorsPerSlot;
  const strands = chooseStrands(conductorArea, f.strandPref);
  const strandOuterD = enamelledDiameter(strands.d);
  const strandOffsets = strandLayout(strands.count, strandOuterD);
  const bundleR = bundleRadius(strandOffsets, strandOuterD);
  const et = endTurnHeight(f, sp);
  const rMid = (lam.Ri + lam.Rsb) / 2;
  const spanArc = (2 * Math.PI * rMid * sp.pitch) / sp.slots;
  const meanTurnLength = 2 * stack + 2 * (1.15 * spanArc + 1.2 * et);
  const wirePerPhase = sp.coilsPerPhase * turns * meanTurnLength + 70 * s;
  const rho = 0.0172; // Ω·mm²/m à 20 °C
  const phaseResistance = (rho * (wirePerPhase / 1000)) / strands.area;
  const nominalVoltage = f.cells * 3.7;
  const winding: WindingDims = {
    spec: sp,
    turnsExact,
    turns,
    kvEffective,
    conductorsPerSlot,
    fillFactor,
    copperPerSlot,
    conductorArea,
    strandD: strands.d,
    strandOuterD,
    strands: strands.count,
    strandOffsets,
    bundleR,
    endTurnHeight: et,
    meanTurnLength,
    wirePerPhase,
    phaseResistance,
    lineResistance: 2 * phaseResistance,
    kt: 60 / (2 * Math.PI * params.kv),
    keVperKrpm: 1000 / params.kv,
    noLoadRpm: params.kv * nominalVoltage,
    nominalVoltage,
  };

  // Angle de référence : l'axe de la phase A (1re bobine) tombe sur le capteur H1.
  const firstA = sp.coils.find((c) => c.phase === 0)!;
  const slotStep = (2 * Math.PI) / sp.slots;
  const axisOffset =
    sp.kind === 'concentrated'
      ? firstA.tooth! * slotStep
      : ((firstA.go + (firstA.go + sp.pitch)) / 2) * slotStep * (sp.id === '12-2' ? 1 : 1);
  // En 12/2, l'axe de phase est au milieu des deux bobines décalées d'une encoche.
  const axisA = sp.id === '12-2' ? axisOffset + slotStep / 2 : axisOffset;
  const windingAngle0 = hallAngles[0]! - axisA;
  const slot0 = sp.kind === 'concentrated' ? windingAngle0 + slotStep / 2 : windingAngle0;

  const stator: StatorDims = {
    ...lam,
    slot0,
    stackLength: stack,
    x0: -stack / 2,
    x1: stack / 2,
    lamThickness,
    lamCount,
    lamPitch: stack / lamCount,
    slotArea,
    usableSlotArea,
    liner,
  };

  const bearingPitchR = (b.d + b.D) / 4;
  return {
    params,
    format: f,
    s,
    length,
    half,
    canR,
    finHeight: f.finHeight,
    bodyR,
    boreR,
    tubeHalf,
    fins: { angles: finAngles, width: finWidth },
    label,
    axisY,
    flangeR,
    flangeT,
    spigotR: boreR - 0.01,
    spigotInnerR,
    spigotDepth,
    webX,
    shoulderX,
    bossR,
    bossEndX,
    shaftHoleR: shaftR + 1.2 * s,
    pilotR: 6.5 * s,
    pilotH: 1.2 * s,
    screw,
    mount,
    stator,
    gap: f.airgap,
    rotorR,
    sleeveT,
    magnetOuterR,
    magnetInnerR,
    magnetX0,
    magnetX1,
    magnetGapAngle: 0.5 / magnetOuterR,
    yokeX0,
    yokeX1,
    yokeHubR,
    shaftR,
    shaftX0,
    shaftX1,
    flat,
    bearing: {
      ...b,
      frontX: frontBearingX,
      rearX: rearBearingX,
      pitchR: bearingPitchR,
      ballCount: ballCount(b),
    },
    circlip,
    shims,
    wave,
    pinion,
    hall,
    pcb,
    connector,
    tabs,
    block,
    leadHoles,
    winding,
    windingAngle0,
  };
}

/** Centre angulaire (rad) de l'encoche `k`. */
export const slotAngle = (d: BldcDims, k: number): number =>
  d.stator.slot0 + (k * 2 * Math.PI) / d.stator.slots;

/** Libellés des phases (repère couleur du simulateur). */
export const PHASE_NAMES = ['A', 'B', 'C'] as const;
export const PHASE_COLORS_FR = ['jaune', 'rouge', 'bleu'] as const;

/** Format décimal français (virgule). */
export function fr(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}
