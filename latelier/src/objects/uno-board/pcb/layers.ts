/**
 * Géométrie des couches du circuit imprimé (repère objet, m) :
 * - âme FR4 extrudée avec TOUS les perçages (trous métallisés, vias, trous de fixation) ;
 * - feuilles minces (cuivre, vernis, sérigraphie) : une surface au niveau de la face extérieure
 *   de chaque couche, découpée par la texture d'illustration (les trous y sont transparents) ;
 * - pastilles étamées (HASL) en relief, instanciées par forme ;
 * - fûts de métallisation instanciés.
 */
import * as THREE from 'three/webgpu';
import {
  BOARD_CX,
  BOARD_CY,
  BOARD_H,
  BOARD_W,
  MM,
  T_CORE,
  T_CU,
  T_HASL,
  T_PLATING,
  Y_CORE_B,
  Y_CORE_T,
  Y_CU_B,
  Y_CU_T,
  boardX,
  boardZ,
} from '../constants';
import { MOUNTING_HOLES } from '../layout';
import { annulus, flipIndex, lathe, loftRoundedRect, mat } from '../packages/geometry';
import { boardOutline, type Pt } from './outline';
import type { PlacedPad } from './pads';
import { DRC, type Routing } from './routing';

/** Trou (mm, repère carte). */
export interface Hole {
  x: number;
  y: number;
  d: number;
  plated: boolean;
}

/** Tous les perçages de la carte. */
export function allHoles(routing: Routing): Hole[] {
  const holes: Hole[] = [];
  for (const p of routing.pads) if (p.drill !== undefined) holes.push({ x: p.x, y: p.y, d: p.drill, plated: true });
  for (const v of routing.vias) holes.push({ x: v.x, y: v.y, d: DRC.viaDrill, plated: true });
  for (const h of MOUNTING_HOLES) holes.push({ x: h.x, y: h.y, d: h.d, plated: false });
  return holes;
}

/** Point du contour en coordonnées de forme (m) : x = X objet, y = −Z objet. */
const shapePt = ([x, y]: Pt): THREE.Vector2 => new THREE.Vector2((x - BOARD_CX) * MM, (y - BOARD_CY) * MM);

/** Âme FR4 extrudée (épaisseur T_CORE) avec chanfreins de 30 µm et tous les perçages. */
export function coreGeometry(routing: Routing): THREE.BufferGeometry {
  const shape = new THREE.Shape(boardOutline(6).map(shapePt));
  for (const h of allHoles(routing)) {
    const r = (h.d / 2) * MM;
    const n = Math.max(12, Math.min(64, Math.round(h.d * 14)));
    const pts: THREE.Vector2[] = [];
    for (let k = 0; k < n; k++) {
      const a = (-k / n) * Math.PI * 2; // sens horaire (trou)
      pts.push(new THREE.Vector2((h.x - BOARD_CX) * MM + Math.cos(a) * r, (h.y - BOARD_CY) * MM + Math.sin(a) * r));
    }
    shape.holes.push(new THREE.Path(pts));
  }
  const bevel = 0.03 * MM;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: T_CORE - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  // Plan XY de la forme → plan XZ de l'objet, extrusion selon +Y.
  g.rotateX(-Math.PI / 2);
  g.translate(0, Y_CORE_B + bevel, 0);
  g.computeVertexNormals();
  return g;
}

/**
 * Feuille mince horizontale au niveau `y` (face orientée vers le haut, ou vers le bas si
 * `down`) ; UV : u = X carte / largeur, v = 1 − Y carte / hauteur (ligne 0 de la texture en haut).
 */
export function sheetGeometry(y: number, down = false): THREE.BufferGeometry {
  const shape = new THREE.Shape(boardOutline(8).map(shapePt));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const xb = pos.getX(i) / MM + BOARD_CX;
    const yb = -pos.getZ(i) / MM + BOARD_CY;
    uv.setXY(i, xb / BOARD_W, 1 - yb / BOARD_H);
  }
  uv.needsUpdate = true;
  if (down) flipIndex(g);
  return g;
}

/** Clé de regroupement des pastilles de même forme (instanciation). */
export function padKey(p: PlacedPad): string {
  return `${p.shape}:${p.w.toFixed(3)}x${p.h.toFixed(3)}:${p.drill?.toFixed(2) ?? 'smd'}`;
}

/** Pastille CMS étamée : cuivre 35 µm + bombé HASL (repère local, centrée, posée sur l'âme). */
export function smdPadGeometry(p: PlacedPad): THREE.BufferGeometry {
  const w = p.w * MM;
  const d = p.h * MM;
  const r = p.shape === 'roundrect' ? Math.min(w, d) * 0.25 : 0.02 * MM;
  const c = 0.03 * MM;
  return loftRoundedRect(
    [
      { y: Y_CORE_T, w, d, r },
      { y: Y_CU_T, w, d, r },
      { y: Y_CU_T + T_HASL * 0.7, w: w - 2 * c, d: d - 2 * c, r: Math.max(1e-6, r - c) },
      { y: Y_CU_T + T_HASL, w: w - 6 * c, d: d - 6 * c, r: Math.max(1e-6, r - 3 * c) },
    ],
    { cornerSegments: 3 },
  );
}

/** Pastille traversante annulaire (face supérieure ; la face inférieure est retournée). */
export function thtPadGeometry(p: PlacedPad): THREE.BufferGeometry {
  const outer = (Math.max(p.w, p.h) / 2) * MM;
  const inner = ((p.drill ?? 0) / 2) * MM - T_PLATING;
  return annulus(outer, inner, T_CU, T_HASL, p.shape === 'rect', 40);
}

/** Anneau de via (face supérieure). */
export function viaRingGeometry(): THREE.BufferGeometry {
  return annulus((DRC.viaDiameter / 2) * MM, (DRC.viaDrill / 2) * MM - T_PLATING, T_CU, T_HASL * 0.8, false, 20);
}

/**
 * Matrice d'une pastille au point (x, y) carte, hauteur `y0` (m). Face inférieure : retournée
 * (rotation de π autour de X), la géométrie s'étend alors vers le bas.
 */
export function padMatrix(p: { x: number; y: number; rot?: number }, bottom: boolean, y0: number): THREE.Matrix4 {
  return mat(boardX(p.x), y0, boardZ(p.y), bottom ? Math.PI : 0, p.rot ?? 0, 0);
}

/** Fût unitaire (perçage de référence 1 mm) : paroi intérieure métallisée, du cuivre inférieur au supérieur. */
export function barrelGeometry(): THREE.BufferGeometry {
  const r = 0.5 * MM - T_PLATING;
  const y0 = Y_CU_B - T_HASL * 0.5;
  const y1 = Y_CU_T + T_HASL * 0.5;
  return lathe(
    [
      [r + 0.04 * MM, y0],
      [r, y0 + 0.03 * MM],
      [r, y1 - 0.03 * MM],
      [r + 0.04 * MM, y1],
    ],
    24,
    { flip: true },
  );
}

/** Matrice d'un fût pour un perçage `d` (mm) : fût de référence (1 mm) mis à l'échelle en X/Z. */
export function barrelMatrix(h: { x: number; y: number; d: number }): THREE.Matrix4 {
  return mat(boardX(h.x), 0, boardZ(h.y), 0, 0, 0, h.d, 1, h.d);
}
