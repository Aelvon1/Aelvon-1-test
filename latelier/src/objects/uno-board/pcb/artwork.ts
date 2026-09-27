/**
 * Illustration du circuit imprimé : une texture « channels » par face (générée dans le worker de
 * textures), décrite ici par des listes d'opérations de dessin (module pur, sans three.js).
 *
 * Canaux (repère carte → viewBox [0, 0, 68,58, 53,34] mm, Y du canevas vers le bas) :
 * - R : cuivre (pistes, pastilles, plans de masse avec dégagements, vias) ; trous en noir ;
 * - G : cuivre flouté → relief des pistes sous le vernis (dérivées dans le matériau) ;
 * - B : sérigraphie (textes, contours, repères), détourée autour des ouvertures ;
 * - A : ouvertures du vernis épargne (1 = cuivre à nu, étamé HASL).
 *
 * La face inférieure est dessinée « vue par transparence depuis le dessus » (même repère que la
 * face supérieure) ; ses textes sont retournés sur place pour se lire carte retournée.
 */
import type { ChannelsParams, DrawOp, TextureRequest } from '../../../textures/types';
import { BOARD_H, BOARD_W, OBJECT_ID } from '../constants';
import { FOOTPRINTS } from '../footprints';
import { COMPONENTS, GND, MOUNTING_HOLES, MOUNTING_KEEPOUT, SILK_TEXTS, type SilkText } from '../layout';
import { boardOutline, insetPolygon, type Pt } from './outline';
import { toBoard, type PlacedPad } from './pads';
import { DRC, type Routing } from './routing';

export type Face = 'top' | 'bottom';

/** Isolement du plan de masse autour du cuivre des autres réseaux (mm). */
const POUR_CLEARANCE = 0.3;
/** Élargissement des ouvertures du vernis autour des pastilles (mm). */
const MASK_EXPANSION = 0.05;
/** Épaisseur des traits de sérigraphie (mm). */
const SILK_LINE = 0.15;
/** Facteur d'échelle des textes (police dessinée en grand puis réduite : rendu robuste). */
const TEXT_SCALE = 100;
/** Rapport hauteur de capitale / corps de police (sans-serif). */
const CAP_RATIO = 0.72;

const WHITE = '#fff';
const BLACK = '#000';

/** Canevas : X = x carte, Y = H − y carte. */
const X = (x: number): number => x;
const Y = (y: number): number => BOARD_H - y;

/** Taille de texture (px) selon la qualité : 4096 px de large en Élevé/Ultra, 2048 en Bas. */
export function artworkSize(quality: 0 | 1 | 2 | 3, face: Face): { width: number; height: number } {
  const base = quality >= 2 ? 4096 : quality === 1 ? 3072 : 2048;
  // Face inférieure moins regardée : trois quarts de la résolution en Moyen et Élevé.
  const width = face === 'bottom' && quality > 0 && quality < 3 ? (base * 3) / 4 : base;
  return { width, height: Math.round((width * BOARD_H) / BOARD_W) };
}

/** Clé de texture (préfixée par l'identifiant de l'objet). */
export const artworkKey = (face: Face, quality: number): string => `${OBJECT_ID}/pcb.${face}.q${quality}`;

// --- Primitives ----------------------------------------------------------------------------------

/** Rectangle (arrondi) centré, tourné de `rot` rad (sens trigonométrique, repère carte). */
function rectOps(
  x: number,
  y: number,
  w: number,
  h: number,
  rot: number,
  style: { fill?: string; stroke?: string; lineWidth?: number; radius?: number },
): DrawOp[] {
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const rect: DrawOp = { op: 'rect', x: -w / 2, y: -h / 2, w, h, ...style };
  return [
    { op: 'save' },
    { op: 'transform', a: c, b: s, c: -s, d: c, e: X(x), f: Y(y) },
    rect,
    { op: 'restore' },
  ];
}

function padOps(p: PlacedPad, expand: number, color: string): DrawOp[] {
  if (p.shape === 'round') return [{ op: 'circle', x: X(p.x), y: Y(p.y), r: p.w / 2 + expand, fill: color }];
  const radius = p.shape === 'roundrect' ? Math.min(p.w, p.h) * 0.25 + expand : expand;
  return rectOps(p.x, p.y, p.w + 2 * expand, p.h + 2 * expand, p.rot, { fill: color, radius });
}

function polyOps(points: readonly number[], width: number, color: string): DrawOp {
  const pts: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pts.push(X(points[i]!), Y(points[i + 1]!));
  return {
    op: 'polyline',
    points: pts,
    stroke: color,
    lineWidth: width,
    lineCap: 'round',
    lineJoin: 'round',
  };
}

function pathD(poly: readonly Pt[]): string {
  return poly.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(4)} ${Y(y).toFixed(4)}`).join(' ') + ' Z';
}

/** Texte à hauteur de capitale `size` mm, tourné de `rot` degrés ; `mirror` pour la face inférieure. */
function textOps(
  text: string,
  x: number,
  y: number,
  size: number,
  opts: {
    rot?: number;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    mirror?: boolean;
    color?: string;
  },
): DrawOp[] {
  const phi = (-(opts.rot ?? 0) * Math.PI) / 180;
  const k = 1 / TEXT_SCALE;
  const sx = opts.mirror ? -k : k;
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const px = (size / CAP_RATIO) * TEXT_SCALE;
  return [
    { op: 'save' },
    { op: 'transform', a: c * sx, b: s * sx, c: -s * k, d: c * k, e: X(x), f: Y(y) },
    {
      op: 'text',
      text,
      x: 0,
      y: 0,
      font: `${opts.bold ? 'bold ' : ''}${px.toFixed(1)}px 'DejaVu Sans', 'Liberation Sans', Arial, sans-serif`,
      fill: opts.color ?? WHITE,
      align: opts.align ?? 'center',
      baseline: 'middle',
    },
    { op: 'restore' },
  ];
}

const padsOnFace = (pads: readonly PlacedPad[], face: Face): PlacedPad[] =>
  pads.filter((p) => p.drill !== undefined || face === 'top');

const layerOf = (face: Face): 0 | 1 => (face === 'top' ? 0 : 1);

// --- Canaux --------------------------------------------------------------------------------------

/** R : cuivre de la face. */
export function copperOps(routing: Routing, face: Face): DrawOp[] {
  const layer = layerOf(face);
  const pads = padsOnFace(routing.pads, face);
  const traces = routing.traces.filter((t) => t.layer === layer);
  const ops: DrawOp[] = [];
  // 1. Plan de masse : tout le contour, en retrait de 0,5 mm du bord.
  ops.push({ op: 'path', d: pathD(insetPolygon(boardOutline(), 0.5)), fill: WHITE });
  // 2. Dégagements autour du cuivre des autres réseaux, des trous et des trous de fixation.
  ops.push({ op: 'composite', mode: 'destination-out' });
  for (const p of pads) {
    if (p.net === GND) {
      // Pastille traversante de masse : anneau d'isolement puis rayons thermiques (étape 4).
      if (p.drill !== undefined) ops.push(...padOps(p, POUR_CLEARANCE, WHITE));
      continue;
    }
    ops.push(...padOps(p, POUR_CLEARANCE, WHITE));
  }
  for (const t of traces) if (t.net !== GND) ops.push(polyOps(t.points, t.width + 2 * POUR_CLEARANCE, WHITE));
  for (const v of routing.vias)
    if (v.net !== GND)
      ops.push({ op: 'circle', x: X(v.x), y: Y(v.y), r: DRC.viaDiameter / 2 + POUR_CLEARANCE, fill: WHITE });
  for (const h of MOUNTING_HOLES)
    ops.push({ op: 'circle', x: X(h.x), y: Y(h.y), r: MOUNTING_KEEPOUT, fill: WHITE });
  // 3. Aplatissement (fond noir opaque sous les bords adoucis).
  ops.push({ op: 'composite', mode: 'destination-over' }, { op: 'fill', color: BLACK });
  ops.push({ op: 'composite', mode: 'source-over' });
  // 4. Cuivre : pistes, rayons thermiques, pastilles, anneaux des vias.
  for (const t of traces) ops.push(polyOps(t.points, t.width, WHITE));
  for (const p of pads) {
    if (p.net !== GND || p.drill === undefined) continue;
    const r = Math.max(p.w, p.h) / 2 + POUR_CLEARANCE + 0.25;
    for (let k = 0; k < 4; k++) {
      const a = p.rot + (k * Math.PI) / 2;
      ops.push(polyOps([p.x, p.y, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r], 0.45, WHITE));
    }
  }
  for (const p of pads) ops.push(...padOps(p, 0, WHITE));
  for (const v of routing.vias)
    ops.push({ op: 'circle', x: X(v.x), y: Y(v.y), r: DRC.viaDiameter / 2, fill: WHITE });
  // 5. Trous (perçages) : aucun cuivre.
  for (const p of pads)
    if (p.drill !== undefined) ops.push({ op: 'circle', x: X(p.x), y: Y(p.y), r: p.drill / 2, fill: BLACK });
  for (const v of routing.vias)
    ops.push({ op: 'circle', x: X(v.x), y: Y(v.y), r: DRC.viaDrill / 2, fill: BLACK });
  for (const h of MOUNTING_HOLES) ops.push({ op: 'circle', x: X(h.x), y: Y(h.y), r: h.d / 2, fill: BLACK });
  return ops;
}

/** Ouvertures du vernis (blanc), élargies de `expand` mm. */
export function openingOps(routing: Routing, face: Face, expand = MASK_EXPANSION): DrawOp[] {
  const ops: DrawOp[] = [];
  for (const p of padsOnFace(routing.pads, face)) ops.push(...padOps(p, expand, WHITE));
  for (const v of routing.vias)
    ops.push({ op: 'circle', x: X(v.x), y: Y(v.y), r: DRC.viaDiameter / 2 + expand, fill: WHITE });
  for (const h of MOUNTING_HOLES)
    ops.push({ op: 'circle', x: X(h.x), y: Y(h.y), r: h.d / 2 + 0.2 + expand, fill: WHITE });
  if (face === 'top') {
    const sj = COMPONENTS.find((c) => c.ref === 'SJ1');
    if (sj)
      ops.push(
        ...rectOps(sj.x, sj.y, 1.5 + 2 * expand, 1.2 + 2 * expand, (sj.rot * Math.PI) / 180, {
          fill: WHITE,
          radius: 0.1,
        }),
      );
  }
  return ops;
}

/** Contours de corps, repères de polarité et désignations (face supérieure). */
function componentSilkOps(): DrawOp[] {
  const ops: DrawOp[] = [];
  for (const c of COMPONENTS) {
    const fp = FOOTPRINTS[c.footprint];
    const rot = (c.rot * Math.PI) / 180;
    if (fp.silkBody) {
      const [x0, y0, x1, y1] = fp.silkBody;
      if (c.footprint === 'CP6.3') {
        // Condensateur polarisé : deux coins chanfreinés côté +.
        const pts: [number, number][] = [
          [x0 + 1.2, y0],
          [x1, y0],
          [x1, y1],
          [x0 + 1.2, y1],
          [x0, y1 - 1.2],
          [x0, y0 + 1.2],
          [x0 + 1.2, y0],
        ];
        const flat: number[] = [];
        for (const [lx, ly] of pts) {
          const b = toBoard(c, lx, ly);
          flat.push(b.x, b.y);
        }
        ops.push(polyOps(flat, SILK_LINE, WHITE));
      } else if (c.footprint === 'DIP28') {
        // Contour du support avec l'encoche (repère de la broche 1) côté gauche.
        const r = 1.0;
        const pts: [number, number][] = [
          [x0, r],
          [x0, y1],
          [x1, y1],
          [x1, y0],
          [x0, y0],
          [x0, -r],
        ];
        for (let k = 0; k <= 12; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 12;
          pts.push([x0 + Math.cos(a) * r, Math.sin(a) * r]);
        }
        const flat: number[] = [];
        for (const [lx, ly] of pts) {
          const b = toBoard(c, lx, ly);
          flat.push(b.x, b.y);
        }
        ops.push(polyOps(flat, SILK_LINE, WHITE));
      } else {
        const center = toBoard(c, (x0 + x1) / 2, (y0 + y1) / 2);
        ops.push(
          ...rectOps(center.x, center.y, x1 - x0, y1 - y0, rot, { stroke: WHITE, lineWidth: SILK_LINE }),
        );
      }
    }
    if (fp.marker) {
      const m = toBoard(c, fp.marker.x, fp.marker.y);
      if (fp.marker.kind === 'dot') ops.push({ op: 'circle', x: X(m.x), y: Y(m.y), r: 0.22, fill: WHITE });
      else if (fp.marker.kind === 'plus') ops.push(...textOps('+', m.x, m.y, 1.1, { bold: true }));
      else if (fp.marker.kind === 'bar' && fp.silkBody) {
        const [, y0, , y1] = fp.silkBody;
        const a = toBoard(c, fp.marker.x, y0);
        const b = toBoard(c, fp.marker.x, y1);
        ops.push(polyOps([a.x, a.y, b.x, b.y], 0.3, WHITE));
      }
    }
    if (!c.noRef) {
      const [dx, dy] = c.refAt ?? fp.refOffset;
      const at = toBoard(c, dx, dy);
      // Désignation lisible : rotation propre (refRot) indépendante de celle du composant.
      const size = c.footprint === 'DIP28' ? 1.1 : 0.8;
      const b = c.refAt ? { x: c.x + dx, y: c.y + dy } : at;
      ops.push(...textOps(c.ref, b.x, b.y, size, { rot: c.refRot ?? 0, bold: true }));
    }
  }
  return ops;
}

function silkTextOps(texts: readonly SilkText[], face: Face): DrawOp[] {
  return texts
    .filter((t) => t.face === face)
    .flatMap((t) =>
      textOps(t.text, t.x, t.y, t.size, {
        rot: t.rot ?? 0,
        align: t.align ?? 'center',
        bold: t.bold ?? false,
        mirror: face === 'bottom',
      }),
    );
}

/** B : sérigraphie de la face, détourée autour des ouvertures du vernis. */
export function silkOps(routing: Routing, face: Face): DrawOp[] {
  const ops: DrawOp[] = [];
  if (face === 'top') ops.push(...componentSilkOps());
  ops.push(...silkTextOps(SILK_TEXTS, face));
  ops.push({ op: 'composite', mode: 'destination-out' });
  ops.push(...openingOps(routing, face, 0.12));
  ops.push({ op: 'composite', mode: 'destination-over' }, { op: 'fill', color: BLACK });
  ops.push({ op: 'composite', mode: 'source-over' });
  return ops;
}

/** Paramètres complets du générateur `channels` pour une face. */
export function artworkParams(routing: Routing, face: Face, width: number): ChannelsParams {
  const pxPerMm = width / BOARD_W;
  return {
    viewBox: [0, 0, BOARD_W, BOARD_H],
    r: { ops: copperOps(routing, face), background: BLACK },
    // Relief : cuivre flouté sur ≈ 0,07 mm (pente douce du vernis sur les pistes).
    g: { from: 'r', blur: Math.max(1.5, 0.07 * pxPerMm) },
    b: { ops: silkOps(routing, face), background: BLACK },
    a: { ops: openingOps(routing, face), background: BLACK },
  };
}

/** Requête de texture complète (clé préfixée, données linéaires, mipmaps, anisotropie maximale). */
export function artworkRequest(routing: Routing, face: Face, quality: 0 | 1 | 2 | 3): TextureRequest {
  const { width, height } = artworkSize(quality, face);
  return {
    key: artworkKey(face, quality),
    generator: 'channels',
    width,
    height,
    params: artworkParams(routing, face, width),
    colorSpace: 'linear',
    wrap: 'clamp',
    mipmaps: true,
    anisotropy: true,
  };
}
