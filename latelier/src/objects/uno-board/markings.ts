/**
 * Marquages des composants : textures `drawlist` haute résolution (mipmaps, anisotropie
 * maximale) plaquées sur le dessus des boîtiers, et matériaux TSL associés.
 *
 * Convention des textures (données linéaires) : canal R = marquage (gravure laser, encre),
 * canal G = zones brillantes (empreinte d'éjecteur, repère moulé de broche 1), canal B =
 * rainures (évent d'électrolytique). Le dessin est en mm, vu de dessus, haut de l'image = −Z
 * local du boîtier. Toutes les références sont des désignations techniques génériques ;
 * codes de date et lots fictifs ; aucun logo de fabricant.
 */
import * as THREE from 'three/webgpu';
import { color, float, mix, texture, uv } from 'three/tsl';
import type { MaterialFactory } from '../../materials/types';
import type { DrawOp, TextureRequest } from '../../textures/types';
import { OBJECT_ID } from './constants';

type Kind = 'epoxy' | 'resistor' | 'alu' | 'metal' | 'ceramic' | 'fuse' | 'diode';

export interface MarkingSpec {
  /** Dimensions de la face marquée (mm). */
  size: readonly [number, number];
  /** Densité (px/mm) au niveau Élevé. */
  density: number;
  kind: Kind;
  ops: readonly DrawOp[];
}

const R = '#f00';
const G = '#0f0';
const B = '#00f';
const K = 100; // facteur d'échelle des textes (voir artwork.ts)

/** Texte centré (x, y en mm, y vers le bas), hauteur de capitale `cap` mm. */
function text(
  t: string,
  x: number,
  y: number,
  cap: number,
  opts: {
    bold?: boolean;
    fill?: string;
    align?: 'left' | 'center' | 'right';
    rot?: number;
    font?: string;
  } = {},
): DrawOp[] {
  const px = (cap / 0.72) * K;
  const a = ((opts.rot ?? 0) * Math.PI) / 180;
  const c = Math.cos(a) / K;
  const s = Math.sin(a) / K;
  return [
    { op: 'save' },
    { op: 'transform', a: c, b: s, c: -s, d: c, e: x, f: y },
    {
      op: 'text',
      text: t,
      x: 0,
      y: 0,
      font: `${opts.bold ? 'bold ' : ''}${px.toFixed(1)}px ${opts.font ?? "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif"}`,
      fill: opts.fill ?? R,
      align: opts.align ?? 'center',
      baseline: 'middle',
    },
    { op: 'restore' },
  ];
}

const MONO = "'DejaVu Sans Mono', 'Liberation Mono', 'Courier New', monospace";

/** Code à 3 chiffres d'une résistance CMS (blanc sur fond noir). */
const resistorCode = (code: string, w: number, d: number): DrawOp[] =>
  text(code, w / 2, d / 2, d * 0.5, { font: MONO });

export const MARKINGS: Readonly<Record<string, MarkingSpec>> = {
  // ATmega328P-PU (DIP-28) : dessus 35,1 × 6,6 mm (après arrondis).
  'u4.top': {
    size: [35.1, 6.6],
    density: 60,
    kind: 'epoxy',
    ops: [
      ...text('ATMEGA328P-PU', 17.8, 2.35, 1.25, { bold: true }),
      ...text('2331    1A7F3K', 17.8, 4.45, 1.0, { font: MONO }),
      // Empreintes d'éjecteur (brillantes) et repère moulé de la broche 1.
      { op: 'circle', x: 3.2, y: 3.3, r: 1.15, fill: G },
      { op: 'circle', x: 31.9, y: 3.3, r: 1.15, fill: G },
      { op: 'circle', x: 1.55, y: 5.2, r: 0.55, fill: G },
    ],
  },
  // ATmega16U2-MU (QFN-32) : 4,9 × 4,9 mm.
  'u3.top': {
    size: [4.9, 4.9],
    density: 220,
    kind: 'epoxy',
    ops: [
      { op: 'circle', x: 0.7, y: 0.7, r: 0.22, fill: R },
      ...text('MEGA16U2', 2.45, 1.75, 0.5, { bold: true }),
      ...text('MU  2318', 2.45, 2.6, 0.42, { font: MONO }),
      ...text('3K8C2F', 2.45, 3.4, 0.42, { font: MONO }),
    ],
  },
  // NCP1117 5 V (SOT-223) : 6,3 × 3,3 mm.
  'u1.top': {
    size: [6.3, 3.3],
    density: 140,
    kind: 'epoxy',
    ops: [
      ...text('1117-5.0', 3.15, 1.25, 0.85, { bold: true }),
      ...text('2330  G', 3.15, 2.35, 0.65, { font: MONO }),
    ],
  },
  // LP2985 3,3 V (SOT-23-5) : 2,8 × 1,5 mm, code de marquage.
  'u2.top': {
    size: [2.8, 1.5],
    density: 280,
    kind: 'epoxy',
    ops: [...text('LB3A', 1.4, 0.75, 0.55, { font: MONO, bold: true })],
  },
  // LMV358 (MSOP-8) : 2,9 × 2,9 mm.
  'u5.top': {
    size: [2.9, 2.9],
    density: 280,
    kind: 'epoxy',
    ops: [
      { op: 'circle', x: 0.45, y: 2.45, r: 0.16, fill: G },
      ...text('V358', 1.45, 1.15, 0.5, { bold: true }),
      ...text('2326', 1.45, 1.85, 0.4, { font: MONO }),
    ],
  },
  // FDN340P (SOT-23) : 2,8 × 1,2 mm.
  't1.top': {
    size: [2.8, 1.2],
    density: 280,
    kind: 'epoxy',
    ops: [...text('340', 1.4, 0.6, 0.55, { font: MONO, bold: true })],
  },
  // Diode M7 (SMA) : 4,1 × 2,4 mm, bande de cathode côté gauche (−X).
  'd1.top': {
    size: [4.1, 2.4],
    density: 200,
    kind: 'diode',
    ops: [
      { op: 'rect', x: 0.35, y: 0.1, w: 0.45, h: 2.2, fill: R },
      ...text('M7', 2.35, 1.2, 0.8, { bold: true }),
    ],
  },
  // Fusible réarmable 500 mA (1812) : 4,3 × 3,0 mm.
  'f1.top': {
    size: [4.3, 3.0],
    density: 160,
    kind: 'fuse',
    ops: [...text('050', 2.15, 1.2, 0.8, { font: MONO, bold: true }), ...text('R', 2.15, 2.2, 0.45)],
  },
  // Résonateur céramique 16 MHz (3 bornes) : 3,1 × 1,2 mm.
  'y2.top': {
    size: [3.1, 1.2],
    density: 260,
    kind: 'ceramic',
    ops: [...text('16.0M', 1.55, 0.6, 0.45, { font: MONO })],
  },
  // Quartz HC-49/S : dessus 10,9 × 4,5 mm (hippodrome).
  'y1.top': {
    size: [10.9, 4.5],
    density: 110,
    kind: 'metal',
    ops: [
      ...text('16.000', 5.45, 1.75, 1.2, { bold: true }),
      ...text('Q2318  HC-49/S', 5.45, 3.25, 0.6, { font: MONO }),
    ],
  },
  // Électrolytique 47 µF 25 V : disque Ø 6,1 mm (évent en croix, bande de polarité −).
  'pc.top': {
    size: [6.1, 6.1],
    density: 170,
    kind: 'alu',
    ops: [
      // Bande de polarité noire côté − (+X local), signes « − » en réserve (aluminium nu).
      { op: 'path', d: 'M 4.35 0.291 A 3.05 3.05 0 0 1 4.35 5.809 Z', fill: R },
      ...text('47', 2.3, 2.35, 1.05, { bold: true }),
      ...text('25V', 2.3, 3.95, 0.8, { bold: true }),
      { op: 'composite', mode: 'destination-out' },
      ...text('−', 5.05, 1.9, 0.9, { bold: true }),
      ...text('−', 5.05, 3.05, 0.9, { bold: true }),
      ...text('−', 5.05, 4.2, 0.9, { bold: true }),
      { op: 'composite', mode: 'lighter' },
      // Évent : croix emboutie (rainures).
      { op: 'polyline', points: [1.2, 1.2, 4.9, 4.9], stroke: B, lineWidth: 0.12, lineCap: 'round' },
      { op: 'polyline', points: [4.9, 1.2, 1.2, 4.9], stroke: B, lineWidth: 0.12, lineCap: 'round' },
    ],
  },
  // Résistances CMS 0603 : couche de protection noire 1,0 × 0,7 mm, code EIA à 3 chiffres.
  'r0603.103': { size: [1.0, 0.7], density: 400, kind: 'resistor', ops: resistorCode('103', 1.0, 0.7) },
  'r0603.102': { size: [1.0, 0.7], density: 400, kind: 'resistor', ops: resistorCode('102', 1.0, 0.7) },
  'r0603.105': { size: [1.0, 0.7], density: 400, kind: 'resistor', ops: resistorCode('105', 1.0, 0.7) },
  // Réseaux de 4 résistances (1206) : couche noire 2,4 × 1,0 mm.
  'rn.103': { size: [2.4, 1.0], density: 300, kind: 'resistor', ops: resistorCode('103', 2.4, 1.0) },
  'rn.102': { size: [2.4, 1.0], density: 300, kind: 'resistor', ops: resistorCode('102', 2.4, 1.0) },
  'rn.220': { size: [2.4, 1.0], density: 300, kind: 'resistor', ops: resistorCode('220', 2.4, 1.0) },
};

const scaleFor = (quality: 0 | 1 | 2 | 3): number => (quality >= 2 ? 1 : quality === 1 ? 0.75 : 0.5);

/** Requête de texture d'un marquage (clé préfixée). */
export function markingRequest(id: string, quality: 0 | 1 | 2 | 3): TextureRequest {
  const spec = MARKINGS[id];
  if (!spec) throw new Error(`Marquage inconnu : ${id}`);
  const k = spec.density * scaleFor(quality);
  const width = Math.max(64, Math.min(4096, Math.round(spec.size[0] * k)));
  const height = Math.max(32, Math.min(4096, Math.round(spec.size[1] * k)));
  return {
    key: `${OBJECT_ID}/mark.${id}.q${quality}`,
    generator: 'drawlist',
    width,
    height,
    params: {
      viewBox: [0, 0, spec.size[0], spec.size[1]],
      background: '#000',
      ops: [{ op: 'composite', mode: 'lighter' }, ...spec.ops],
    },
    colorSpace: 'linear',
    wrap: 'clamp',
    mipmaps: true,
    anisotropy: true,
  };
}

/** Clés des textures de marquage (attendues dans `prepare`). */
export const markingKeys = (quality: 0 | 1 | 2 | 3): string[] =>
  Object.keys(MARKINGS).map((id) => markingRequest(id, quality).key);

function markingMaterial(id: string, quality: 0 | 1 | 2 | 3): MaterialFactory {
  return (ctx) => {
    const spec = MARKINGS[id]!;
    const tex = ctx.textures.get(markingRequest(id, quality));
    const t = texture(tex, uv());
    const m = new THREE.MeshPhysicalNodeMaterial({ name: `Marquage ${id}` });
    switch (spec.kind) {
      case 'epoxy':
        // Résine noire semi-mate ; gravure laser plus claire et plus rugueuse ; zones moulées brillantes.
        m.colorNode = mix(color(0x151517), color(0x6a6b6e), t.r);
        m.roughnessNode = mix(float(0.55), float(0.85), t.r).mul(mix(float(1), float(0.5), t.g));
        m.metalness = 0;
        m.clearcoat = 0.15;
        m.clearcoatRoughness = 0.5;
        break;
      case 'resistor':
      case 'diode':
        // Vernis noir, encre blanche (ou grise pour la bande de cathode).
        m.colorNode = mix(
          color(spec.kind === 'diode' ? 0x1a1a1c : 0x0f0f10),
          color(spec.kind === 'diode' ? 0xb8b8b4 : 0xe9e9e4),
          t.r,
        );
        m.roughnessNode = mix(float(0.45), float(0.7), t.r);
        m.metalness = 0;
        break;
      case 'fuse':
        m.colorNode = mix(color(0x4f5a2e), color(0xe8e6da), t.r);
        m.roughnessNode = float(0.6);
        m.metalness = 0;
        break;
      case 'ceramic':
        m.colorNode = mix(color(0xcfc4a8), color(0x2a2a2a), t.r);
        m.roughnessNode = float(0.6);
        m.metalness = 0;
        break;
      case 'metal':
        // Boîtier métallique nickelé, marquage à l'encre noire.
        m.colorNode = mix(color(0xd4d6d8), color(0x1b1b1b), t.r);
        m.metalnessNode = mix(float(1), float(0), t.r);
        m.roughnessNode = mix(float(0.18), float(0.6), t.r);
        break;
      case 'alu':
        // Aluminium du godet, encre noire (valeur, bande −), rainures d'évent plus sombres.
        m.colorNode = mix(mix(color(0xcfd2d6), color(0x8d9197), t.b), color(0x121212), t.r);
        m.metalnessNode = mix(float(1), float(0), t.r);
        m.roughnessNode = mix(mix(float(0.28), float(0.5), t.b), float(0.55), t.r);
        break;
    }
    return m;
  };
}

/** Matériaux de marquage (toutes qualités) : `mark.<id>.q<n>`. */
export function markingMaterials(): Record<string, MaterialFactory> {
  const out: Record<string, MaterialFactory> = {};
  for (const id of Object.keys(MARKINGS))
    for (const q of [0, 1, 2, 3] as const) out[`mark.${id}.q${q}`] = markingMaterial(id, q);
  return out;
}
