/**
 * Atlas des décalques des accessoires : toutes les sérigraphies, affiches, étiquettes et
 * silhouettes dans UNE texture (générateur `drawlist`, rastérisée dans le worker) → un seul
 * matériau et un seul appel de dessin pour tous les décalques du décor.
 *
 * Empaquetage par étagères (régions triées par hauteur décroissante), marge de 6 px entre
 * régions (limite le débordement des niveaux de mipmap). Module PUR : les rectangles sont
 * calculés sans GPU (tests).
 */
import type { DrawListParams, DrawOp } from '../../../textures/types';
import { regionDefs, type RegionDef } from './regions';

/** Taille de référence de l'atlas (px) : les coordonnées de dessin sont exprimées dans ce repère. */
export const ATLAS_SIZE = 2048;
const PADDING = 6;

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasLayout {
  rects: Map<string, AtlasRect>;
  /** Hauteur utilisée (px). */
  usedHeight: number;
}

let cachedDefs: RegionDef[] | null = null;
let cachedLayout: AtlasLayout | null = null;

function defs(): RegionDef[] {
  cachedDefs ??= regionDefs();
  return cachedDefs;
}

/** Empaquetage (déterministe) des régions. */
export function atlasLayout(): AtlasLayout {
  if (cachedLayout) return cachedLayout;
  const sorted = [...defs()].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
  const rects = new Map<string, AtlasRect>();
  let x = PADDING;
  let y = PADDING;
  let shelf = 0;
  for (const d of sorted) {
    if (x + d.w + PADDING > ATLAS_SIZE) {
      x = PADDING;
      y += shelf + PADDING;
      shelf = 0;
    }
    if (rects.has(d.name)) throw new Error(`Région d'atlas en double : « ${d.name} ».`);
    rects.set(d.name, { x, y, w: d.w, h: d.h });
    x += d.w + PADDING;
    shelf = Math.max(shelf, d.h);
  }
  cachedLayout = { rects, usedHeight: y + shelf + PADDING };
  return cachedLayout;
}

/** Rectangle d'une région (erreur explicite si inconnue). */
export function atlasRect(name: string): AtlasRect {
  const r = atlasLayout().rects.get(name);
  if (!r) throw new Error(`Région d'atlas inconnue : « ${name} ».`);
  return r;
}

/**
 * UV de l'atlas pour un point (s, t) d'une région, s de gauche à droite, t de BAS en HAUT
 * (convention des UV). Le générateur `drawlist` écrit la rangée 0 de l'image (haut du canevas)
 * en v = 0 : le haut de la région correspond donc au plus petit v.
 */
export function atlasUV(r: AtlasRect, s: number, t: number): [number, number] {
  return [(r.x + s * r.w) / ATLAS_SIZE, (r.y + (1 - t) * r.h) / ATLAS_SIZE];
}

/** Paramètres du générateur `drawlist` (toutes les régions translatées à leur place). */
export function atlasDrawParams(): DrawListParams {
  const layout = atlasLayout();
  const ops: DrawOp[] = [];
  for (const d of defs()) {
    const r = layout.rects.get(d.name)!;
    ops.push({ op: 'save' }, { op: 'transform', a: 1, b: 0, c: 0, d: 1, e: r.x, f: r.y });
    ops.push(...d.draw());
    ops.push({ op: 'restore' });
  }
  // Grain d'impression commun (léger).
  ops.push({ op: 'noise', amount: 0.035, seed: 17, mono: true });
  return { viewBox: [0, 0, ATLAS_SIZE, ATLAS_SIZE], ops };
}
