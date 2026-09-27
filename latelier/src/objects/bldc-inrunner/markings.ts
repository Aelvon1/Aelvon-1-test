/**
 * Textures de marquage (générateur `drawlist`, rastérisées dans le worker) : gravure laser du
 * carter, légende de la flasque arrière, faces du circuit capteurs, marquage des capteurs Hall.
 *
 * Marque INVENTÉE : « VELKOR » (emblème géométrique original). Les références de composants
 * sont génériques. Toutes les clés sont préfixées par l'identifiant de l'objet.
 * Coordonnées de dessin en millimètres (viewBox) ; la ligne 0 de l'image correspond à v = 0.
 */
import type * as THREE from 'three/webgpu';
import type { DrawOp, TextureService } from '../../textures/types';
import { OBJECT_ID, fr, type BldcDims } from './params';

const FONT = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";
const MONO = "'DejaVu Sans Mono', 'Liberation Mono', monospace";

/** Pixels par millimètre selon la qualité (marquages lisibles en vue macro). */
const pxPerMm = (quality: 0 | 1 | 2 | 3) => [28, 48, 80, 112][quality]!;

/** Taille de texture (puissance de deux la plus proche, bornée). */
const pow2 = (v: number, max: number) => Math.min(max, 2 ** Math.round(Math.log2(Math.max(64, v))));

const text = (
  t: string,
  x: number,
  y: number,
  size: number,
  opts: {
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
    mono?: boolean;
    fill?: string;
    spacing?: number;
  } = {},
): DrawOp => ({
  op: 'text',
  text: t,
  x,
  y,
  font: `${opts.bold ? 'bold ' : ''}${size}px ${opts.mono ? MONO : FONT}`,
  fill: opts.fill ?? '#ffffff',
  align: opts.align ?? 'left',
  baseline: 'alphabetic',
  letterSpacing: opts.spacing,
});

/** Emblème VELKOR : hexagone et trois pales (rotor stylisé), centré en (cx, cy), rayon r. */
function emblem(cx: number, cy: number, r: number, stroke: string): DrawOp[] {
  const hex: number[] = [];
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    hex.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  const ops: DrawOp[] = [
    { op: 'polyline', points: hex, stroke, lineWidth: r * 0.14, closed: true, lineJoin: 'round' },
  ];
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const p = (rr: number, da: number) => `${cx + rr * Math.cos(a + da)} ${cy + rr * Math.sin(a + da)}`;
    ops.push({
      op: 'path',
      d: `M ${p(r * 0.18, -0.5)} Q ${p(r * 0.62, -0.05)} ${p(r * 0.72, 0.55)} L ${p(r * 0.46, 0.62)} Q ${p(r * 0.4, 0.1)} ${p(r * 0.18, 0.5)} Z`,
      fill: stroke,
    });
  }
  ops.push({ op: 'circle', x: cx, y: cy, r: r * 0.16, stroke, lineWidth: r * 0.08 });
  return ops;
}

/** Dimensions de la zone gravée du carter (mm) : longueur axiale × développé. */
export function canLabelSize(d: BldcDims): { length: number; arc: number; halfAngle: number; x0: number } {
  const length = 2 * (d.tubeHalf - 3.2 * d.s);
  const halfAngle = d.label.halfAngle - 12 * (Math.PI / 180);
  return { length, arc: 2 * halfAngle * d.bodyR, halfAngle, x0: -length / 2 };
}

/** Gravure laser du carter : marque, modèle, KV et configuration RÉELS des paramètres. */
export function canLabelTexture(
  textures: TextureService,
  d: BldcDims,
  quality: 0 | 1 | 2 | 3,
): THREE.Texture {
  const p = d.params;
  const { length: L, arc: H } = canLabelSize(d);
  const ppm = pxPerMm(quality);
  const width = pow2(L * ppm, quality >= 3 ? 4096 : 2048);
  const height = pow2(H * ppm, quality >= 3 ? 2048 : 1024);
  // Mise en page en rangées, tailles proportionnelles à la hauteur développée (24 mm en Ø 36).
  const k = H / 24;
  const w = d.winding;
  const sp = w.spec;
  const model = `VK-${p.format}`;
  const cfg = `${sp.slots}N${sp.poles}P`;
  const right = L - 1.2 * k;
  const serial = `S/N 2609-${String((p.kv * 7 + p.format.charCodeAt(1) * 13) % 10000).padStart(4, '0')}`;
  const ops: DrawOp[] = [
    // Micro-texte (lisible seulement au zoom macro).
    text('NE PAS DÉPASSER 60 000 TR/MIN · AIMANTS NdFeB 150 °C MAX', 1.2 * k, 2.4 * k, 0.55 * k, {
      spacing: 0.05 * k,
    }),
    // Rangée 1 : emblème, marque et gamme ; modèle et configuration à droite.
    ...emblem(4.2 * k, 7.6 * k, 2.9 * k, '#ffffff'),
    text('VELKOR', 8.2 * k, 9.2 * k, 3.5 * k, { bold: true, spacing: 0.28 * k }),
    text('BRUSHLESS INRUNNER', 8.4 * k, 11.5 * k, 1.1 * k, { spacing: 0.16 * k }),
    text(model, right, 7.6 * k, 1.9 * k, { bold: true, align: 'right' }),
    text(`${cfg}${p.sensors ? ' · SENSORED' : ''}`, right, 10.2 * k, 1.05 * k, { align: 'right' }),
    { op: 'rect', x: 1.2 * k, y: 13 * k, w: L - 2.4 * k, h: 0.12 * k, fill: '#ffffff' },
    // Rangée 2 : KV en grand ; caractéristiques et numéro de série à droite.
    text(`${p.kv} KV`, 1.2 * k, 19.6 * k, 4.6 * k, { bold: true }),
    text(`Ø ${fr(d.format.shaftD, 3)} mm · ${d.format.cells}–${d.format.cells * 2}S LiPo`, right, 15.9 * k, 0.9 * k, {
      align: 'right',
    }),
    text(`${fr(w.turns, 1)} T · ${w.strands} × Ø ${fr(w.strandD, 2)} mm`, right, 17.6 * k, 0.9 * k, { align: 'right' }),
    text(serial, right, 19.5 * k, 0.85 * k, { align: 'right', mono: true }),
    text('Ⓐ Ⓑ Ⓒ  ROTATION ↻', right, 22.4 * k, 0.55 * k, { align: 'right' }),
  ];
  return textures.get({
    key: `${OBJECT_ID}/can-label/${p.format}/${p.kv}/${p.slotPole}/${p.sensors ? 1 : 0}/${quality}`,
    generator: 'drawlist',
    width,
    height,
    params: { viewBox: [0, 0, L, H], ops },
    wrap: 'clamp',
    colorSpace: 'srgb',
  });
}

/**
 * Légende gravée de la flasque arrière (vue de l'arrière : x canvas = z, y canvas = −y).
 * Repères A/B/C des languettes, flèche de rotation, « HALL » au-dessus du connecteur.
 */
export function rearLegendTexture(
  textures: TextureService,
  d: BldcDims,
  quality: 0 | 1 | 2 | 3,
): { texture: THREE.Texture; half: number } {
  const half = d.flangeR;
  const size = pow2(2 * half * pxPerMm(quality) * 0.6, 2048);
  const k = d.s;
  const ops: DrawOp[] = [];
  const toCanvas = (y: number, z: number): [number, number] => [z + half, -y + half];
  const names = ['A', 'B', 'C'];
  d.tabs.z.forEach((z, i) => {
    const [cx, cy] = toCanvas(d.block.y1 + 1.6 * k, z);
    ops.push(text(names[i]!, cx, cy + 0.6 * k, 1.8 * k, { bold: true, align: 'center' }));
  });
  if (d.params.sensors) {
    const [cx, cy] = toCanvas(-(d.connector.r - d.connector.depth / 2 - 1.9 * k), 0);
    ops.push(text('HALL 5V', cx, cy, 1.1 * k, { align: 'center', bold: true }));
  }
  // Flèche de sens de rotation (anti-horaire vu de l'arrière = horaire vu côté arbre).
  const r = half - 1.3 * k;
  const a0 = (200 * Math.PI) / 180;
  const a1 = (250 * Math.PI) / 180;
  const pts: number[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = a0 + ((a1 - a0) * i) / 16;
    const [cx, cy] = toCanvas(r * Math.cos(a), r * Math.sin(a));
    pts.push(cx, cy);
  }
  ops.push({ op: 'polyline', points: pts, stroke: '#ffffff', lineWidth: 0.28 * k, lineCap: 'round' });
  const [ex, ey] = [pts[pts.length - 2]!, pts[pts.length - 1]!];
  ops.push({ op: 'circle', x: ex, y: ey, r: 0.45 * k, fill: '#ffffff' });
  return {
    texture: textures.get({
      key: `${OBJECT_ID}/rear-legend/${d.params.format}/${d.params.sensors ? 1 : 0}/${quality}`,
      generator: 'drawlist',
      width: size,
      height: size,
      params: { viewBox: [0, 0, 2 * half, 2 * half], ops },
      wrap: 'clamp',
    }),
    half,
  };
}

/**
 * Faces du circuit capteurs (vernis épargne vert foncé, cuivre sous vernis, pastilles dorées,
 * sérigraphie). `side` : face extérieure (vers l'arrière, connecteur) ou intérieure (capteurs).
 * Repère canvas : extérieur (x = z, y = −y) ; intérieur (x = −z, y = −y) ; centré sur l'axe.
 */
export function pcbTexture(
  textures: TextureService,
  d: BldcDims,
  side: 'outer' | 'inner',
  quality: 0 | 1 | 2 | 3,
): { texture: THREE.Texture; half: number } {
  const half = d.pcb.rOut + 0.4;
  const size = pow2(2 * half * pxPerMm(quality) * 0.7, 2048);
  const k = d.s;
  const mask = '#15472f';
  const trace = '#246b45';
  const pad = '#d9b25c';
  const silk = '#f1f1ea';
  const map = (y: number, z: number): [number, number] => [(side === 'outer' ? z : -z) + half, -y + half];
  const polar = (r: number, a: number) => map(r * Math.cos(a), r * Math.sin(a));
  const ops: DrawOp[] = [{ op: 'fill', color: mask }];
  const hallR = (d.hall.r0 + d.hall.r1) / 2;
  const connY = -d.connector.r;
  // Pistes (cuivre sous vernis) : rail d'alimentation en arc + liaisons capteurs → connecteur.
  const rail: number[] = [];
  const rr = d.pcb.rOut - 1.1 * k;
  for (let i = 0; i <= 40; i++) {
    const a = d.pcb.a0 + 0.12 + ((d.pcb.a1 - d.pcb.a0 - 0.24) * i) / 40;
    rail.push(...polar(rr, a));
  }
  ops.push({ op: 'polyline', points: rail, stroke: trace, lineWidth: 0.5 * k, lineCap: 'round' });
  d.hall.angles.forEach((a, i) => {
    const pts: number[] = [];
    const start = polar(hallR + 0.9, a);
    const mid = polar((hallR + d.pcb.rOut) / 2, a + (i - 1) * 0.08);
    const [cx, cy] = map(connY, (i - 1) * d.connector.pitch * 1.3);
    pts.push(...start, ...mid, cx, cy);
    ops.push({
      op: 'polyline',
      points: pts,
      stroke: trace,
      lineWidth: 0.3 * k,
      lineCap: 'round',
      lineJoin: 'round',
    });
  });
  // Pastilles des capteurs (3 broches au pas de 1,27 mm) et du connecteur (6 broches au pas de 1,5 mm).
  for (const a of d.hall.angles) {
    for (let j = -1; j <= 1; j++) {
      const t = j * 1.27;
      const [cx, cy] = map(hallR * Math.cos(a) - t * Math.sin(a), hallR * Math.sin(a) + t * Math.cos(a));
      ops.push({ op: 'circle', x: cx, y: cy, r: 0.42, fill: pad });
      ops.push({ op: 'circle', x: cx, y: cy, r: 0.18, fill: '#1a1a14' });
    }
  }
  if (side === 'outer') {
    for (let j = 0; j < 6; j++) {
      const z = (j - 2.5) * d.connector.pitch;
      const [cx, cy] = map(connY, z);
      ops.push({ op: 'rect', x: cx - 0.45, y: cy - 0.6, w: 0.9, h: 1.2, radius: 0.2, fill: pad });
    }
    const labels = ['GND', 'TEMP', 'C', 'B', 'A', '+5V'];
    labels.forEach((l, j) => {
      const [cx, cy] = map(connY + d.connector.depth / 2 + 1.1 * k, (j - 2.5) * d.connector.pitch);
      ops.push(text(l, cx, cy, 0.62 * k, { align: 'center', fill: silk }));
    });
    const [tx, ty] = map(-d.pcb.rIn - 2.2 * k, 0);
    ops.push(text('VK-HS3 REV B', tx, ty, 0.9 * k, { align: 'center', fill: silk, bold: true }));
    const [sx, sy] = map(-d.pcb.rIn - 3.4 * k, 0);
    ops.push(text('2609  ⚠ ESD', sx, sy, 0.55 * k, { align: 'center', fill: silk }));
    ops.push(...emblem(...map(d.pcb.rIn + 2.2 * k, -6.4 * k), 1.1 * k, silk));
  } else {
    d.hall.angles.forEach((a, i) => {
      const [cx, cy] = polar(hallR + 2.3 * k, a);
      ops.push(text(`H${i + 1}`, cx, cy + 0.3, 0.9 * k, { align: 'center', fill: silk, bold: true }));
      // Contour du boîtier en sérigraphie.
      const c = polar(hallR, a);
      ops.push({ op: 'circle', x: c[0], y: c[1], r: 1.9, stroke: silk, lineWidth: 0.12 });
    });
  }
  // Trous de fixation cuivrés.
  for (const a of d.pcb.screwAngles) {
    const [cx, cy] = polar(d.pcb.screwR, a);
    ops.push({ op: 'circle', x: cx, y: cy, r: 1.9 * k, fill: pad });
    ops.push({ op: 'circle', x: cx, y: cy, r: 1.2 * k, fill: '#101010' });
  }
  ops.push({ op: 'noise', amount: 0.035, scale: 1 });
  return {
    texture: textures.get({
      key: `${OBJECT_ID}/pcb-${side}/${d.params.format}/${d.params.slotPole}/${quality}`,
      generator: 'drawlist',
      width: size,
      height: size,
      params: { viewBox: [0, 0, 2 * half, 2 * half], ops },
      wrap: 'clamp',
    }),
    half,
  };
}

/** Face marquée d'un capteur Hall (boîtier SIP-3) : code produit et date, 3 × 4 mm. */
export function hallMarkTexture(textures: TextureService, quality: 0 | 1 | 2 | 3): THREE.Texture {
  const w = 4;
  const h = 3;
  const ppm = pxPerMm(quality) * 1.5;
  return textures.get({
    key: `${OBJECT_ID}/hall-mark/${quality}`,
    generator: 'drawlist',
    width: pow2(w * ppm, 1024),
    height: pow2(h * ppm, 1024),
    params: {
      viewBox: [0, 0, w, h],
      ops: [
        { op: 'fill', color: '#000000' },
        text('41F', w / 2, h * 0.47, 1.05, { align: 'center', bold: true, mono: true }),
        text('2619', w / 2, h * 0.84, 0.72, { align: 'center', mono: true }),
        { op: 'circle', x: 0.55, y: 0.55, r: 0.2, fill: '#ffffff' },
      ],
    },
    colorSpace: 'linear',
    wrap: 'clamp',
  });
}
