/**
 * Connecteurs traversants paramétriques : barrettes femelles 1×N (8,5 mm), barrette mâle 2×3
 * (ICSP), support DIP-28 à contacts estampés. Joints de soudure traversants (volcan côté soudure).
 *
 * Repère composant : origine au centre de l'empreinte sur le plan du cuivre supérieur, X le long
 * de la rangée, Z = −Y carte.
 */
import * as THREE from 'three/webgpu';
import { L_TAIL_END, L_THT_SEAT, MM } from '../constants';
import { FOOTPRINTS, PITCH, type FootprintId } from '../footprints';
import type { Ctx } from '../params';
import { loftRoundedRect, mat, mergeTransformed, roundedBox, roundedRectRing } from './geometry';
import type { ComponentModel, ModelMesh } from './model';
import { thtFillet } from './solder';

const base = (id: string) => (ctx: Ctx) => ctx.materials.get(id);

/** Broche carrée étamée à pointes chanfreinées, de y0 à y1 (m). */
export function squarePin(y0: number, y1: number, size = 0.64): THREE.BufferGeometry {
  const s = size * MM;
  const c = 0.16 * MM;
  const r = 0.03 * MM;
  return loftRoundedRect(
    [
      { y: y0, w: s * 0.45, d: s * 0.45, r },
      { y: y0 + c, w: s, d: s, r },
      { y: y1 - c, w: s, d: s, r },
      { y: y1, w: s * 0.45, d: s * 0.45, r },
    ],
    { cornerSegments: 2 },
  );
}

/** Joints traversants (dessous, et dessus si `top`) aux positions données (m, repère composant). */
export function thtJointMeshes(
  key: string,
  pins: readonly [number, number][],
  padR: number,
  pinR: number,
  opts: { bottomH?: number; top?: number | null } = {},
): ModelMesh[] {
  const out: ModelMesh[] = [];
  const bottomLocals = pins.map(([x, z]) => mat(x, 0, z, Math.PI, 0, 0));
  const topLocals = pins.map(([x, z]) => mat(x, 0, z));
  const hb = (opts.bottomH ?? 0.95) * MM;
  for (const lod of ['low', 'detail'] as const) {
    const fine = lod === 'detail';
    out.push({
      name: fine ? 'ménisques fins (côté soudure)' : 'ménisques (côté soudure)',
      key: `${key}.jb.${lod}.${padR}.${pinR}`,
      geometry: () => thtFillet(padR * MM, pinR * MM, hb, fine ? 40 : 14, fine ? 9 : 3),
      material: base('solder'),
      locals: bottomLocals,
      joint: 'bottom',
      lod,
    });
    if (opts.top)
      out.push({
        name: fine ? 'ménisques fins (côté composants)' : 'ménisques (côté composants)',
        key: `${key}.jt.${lod}.${padR}.${pinR}`,
        geometry: () =>
          thtFillet(padR * MM * 0.9, pinR * MM, (opts.top ?? 0.25) * MM, fine ? 36 : 12, fine ? 6 : 2),
        material: base('solder'),
        locals: topLocals,
        joint: 'top',
        lod,
      });
  }
  return out;
}

/** Positions (m, repère composant) des broches d'une empreinte. */
export function pinPositions(fp: FootprintId): [number, number][] {
  return FOOTPRINTS[fp].pads.filter((p) => p.drill !== undefined).map((p) => [p.x * MM, -p.y * MM]);
}

/**
 * Plaque percée extrudée verticalement (vue de dessus : contour et trous, en m dans le plan XZ),
 * chanfreins de `bevel` sur les arêtes haut et bas (y compris l'entrée des trous).
 */
export function perforatedBlock(
  outer: readonly THREE.Vector2[],
  holes: readonly (readonly THREE.Vector2[])[],
  y0: number,
  height: number,
  bevel: number,
): THREE.BufferGeometry {
  // Forme dans le plan XY de la forme : x = X, y = −Z (la rotation −π/2 autour de X rend Z = −y).
  const shape = new THREE.Shape(outer.map((v) => new THREE.Vector2(v.x, -v.y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((v) => new THREE.Vector2(v.x, -v.y))));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bevel, 0);
  g.computeVertexNormals();
  return g;
}

/** Contour de rectangle arrondi (m) dans le plan XZ, centré en (cx, cz). */
export function rrect(w: number, d: number, r: number, cx = 0, cz = 0, segs = 3): THREE.Vector2[] {
  return roundedRectRing(w, d, r, segs).map(([x, z]) => new THREE.Vector2(x + cx, z + cz));
}

// --- Barrette femelle 1×N ----------------------------------------------------------------------

const FEMALE_H = 8.5;

/** Contact à double lame (fourche) visible dans l'ouverture, pointes rapprochées. */
function forkContact(): THREE.BufferGeometry {
  const blade = (side: 1 | -1) =>
    loftRoundedRect(
      [
        { y: 1.2 * MM, w: 0.8 * MM, d: 0.14 * MM, r: 0.03 * MM, oz: side * 0.36 * MM },
        { y: 5.2 * MM, w: 0.8 * MM, d: 0.14 * MM, r: 0.03 * MM, oz: side * 0.36 * MM },
        { y: 6.6 * MM, w: 0.75 * MM, d: 0.14 * MM, r: 0.03 * MM, oz: side * 0.12 * MM },
        { y: 7.3 * MM, w: 0.7 * MM, d: 0.14 * MM, r: 0.03 * MM, oz: side * 0.3 * MM },
      ],
      { cornerSegments: 1 },
    );
  const a = blade(1);
  const b = blade(-1);
  const merged = mergeTransformed([
    { geometry: a, matrix: new THREE.Matrix4() },
    { geometry: b, matrix: new THREE.Matrix4() },
  ]);
  a.dispose();
  b.dispose();
  return merged;
}

/** Barrette femelle 1×N au pas de 2,54 mm (PBT noir, contacts étamés, queues carrées). */
export function femaleHeaderModel(fp: 'HDR1x6' | 'HDR1x8' | 'HDR1x10'): ComponentModel {
  const n = FOOTPRINTS[fp].pads.length;
  const pins = pinPositions(fp);
  const len = n * PITCH - 0.08;
  const meshes: ModelMesh[] = [
    {
      name: 'corps',
      key: `hdrF${n}.body`,
      geometry: () =>
        perforatedBlock(
          rrect(len * MM, 2.5 * MM, 0.12 * MM),
          pins.map(([x, z]) => rrect(1.02 * MM, 1.02 * MM, 0.1 * MM, x, z, 2)),
          L_THT_SEAT,
          FEMALE_H * MM,
          0.18 * MM,
        ),
      material: base('plastic.pbt.black'),
    },
    {
      name: 'contacts',
      key: 'hdrF.contact',
      geometry: forkContact,
      material: base('tin'),
      locals: pins.map(([x, z]) => mat(x, 0, z)),
    },
    {
      name: 'queues',
      key: 'hdrF.tail',
      geometry: () => squarePin(L_TAIL_END, 1.4 * MM),
      material: base('tin'),
      locals: pins.map(([x, z]) => mat(x, 0, z)),
    },
    ...thtJointMeshes('hdrF', pins, 0.85, 0.42),
  ];
  return { meshes };
}

// --- Barrette mâle 2×3 (ICSP) ------------------------------------------------------------------

export function icspModel(): ComponentModel {
  const pins = pinPositions('ICSP2x3');
  const meshes: ModelMesh[] = [
    {
      name: 'embase',
      key: 'icsp.base',
      geometry: () =>
        roundedBox(5.08 * MM, 7.62 * MM, 2.5 * MM, {
          r: 0.25 * MM,
          rt: 0.25 * MM,
          rb: 0.08 * MM,
          y0: L_THT_SEAT,
        }),
      material: base('plastic.black'),
    },
    {
      name: 'broches',
      key: 'icsp.pin',
      geometry: () => squarePin(L_TAIL_END, 8.5 * MM),
      material: base('tin'),
      locals: pins.map(([x, z]) => mat(x, 0, z)),
    },
    ...thtJointMeshes('icsp', pins, 0.8, 0.42),
  ];
  return { meshes };
}

// --- Support DIP-28 ------------------------------------------------------------------------------

const SOCKET_H = 3.2;

/** Contour du support avec encoche de repérage (broche 1) côté −X. */
function socketOutline(): THREE.Vector2[] {
  const w = 35.0;
  const d = 10.1;
  const pts = rrect(w * MM, d * MM, 0.3 * MM, 0, 0, 3);
  // Insère l'encoche (demi-cercle de 0,9 mm, rentrant dans le corps) au milieu du petit côté
  // gauche (x = −w/2), parcouru dans le sens des z croissants.
  const out: THREE.Vector2[] = [];
  const x0 = (-w / 2) * MM;
  const r = 0.9 * MM;
  let inserted = false;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    out.push(p);
    if (!inserted && Math.abs(p.x - x0) < 1e-9 && Math.abs(q.x - x0) < 1e-9 && p.y < 0 && q.y > 0) {
      for (let k = 0; k <= 12; k++) {
        const a = -Math.PI / 2 + (k / 12) * Math.PI;
        out.push(new THREE.Vector2(x0 + Math.cos(a) * r, Math.sin(a) * r));
      }
      inserted = true;
    }
  }
  return out;
}

/** Contact estampé du support (deux lames visibles dans l'ouverture). */
function socketContact(): THREE.BufferGeometry {
  const blade = (side: 1 | -1) =>
    loftRoundedRect(
      [
        { y: 0.6 * MM, w: 0.9 * MM, d: 0.12 * MM, r: 0.03 * MM, ox: side * 0.33 * MM },
        { y: 2.0 * MM, w: 0.9 * MM, d: 0.12 * MM, r: 0.03 * MM, ox: side * 0.2 * MM },
        { y: 2.75 * MM, w: 0.85 * MM, d: 0.12 * MM, r: 0.03 * MM, ox: side * 0.38 * MM },
      ],
      { cornerSegments: 1 },
    );
  const a = blade(1);
  const b = blade(-1);
  const merged = mergeTransformed([
    { geometry: a, matrix: new THREE.Matrix4().makeRotationY(Math.PI / 2) },
    { geometry: b, matrix: new THREE.Matrix4().makeRotationY(Math.PI / 2) },
  ]);
  a.dispose();
  b.dispose();
  return merged;
}

/** Queue plate de contact (0,5 × 0,25 mm) à pointe chanfreinée. */
function flatTail(): THREE.BufferGeometry {
  const r = 0.03 * MM;
  return loftRoundedRect(
    [
      { y: L_TAIL_END, w: 0.25 * MM, d: 0.14 * MM, r },
      { y: L_TAIL_END + 0.25 * MM, w: 0.5 * MM, d: 0.25 * MM, r },
      { y: 0.9 * MM, w: 0.5 * MM, d: 0.25 * MM, r },
      { y: 1.3 * MM, w: 1.0 * MM, d: 0.25 * MM, r },
    ],
    { cornerSegments: 1 },
  );
}

/** Support DIP-28 (0,3 po) à contacts estampés double lame, cadre ajouré. */
export function dipSocketModel(): ComponentModel {
  const pins = pinPositions('DIP28');
  const meshes: ModelMesh[] = [
    {
      name: 'corps',
      key: 'dip28socket.body',
      geometry: () =>
        perforatedBlock(
          socketOutline(),
          [
            rrect(29.5 * MM, 2.6 * MM, 0.3 * MM),
            ...pins.map(([x, z]) => rrect(1.0 * MM, 1.5 * MM, 0.15 * MM, x, z, 2)),
          ],
          L_THT_SEAT,
          SOCKET_H * MM,
          0.15 * MM,
        ),
      material: base('plastic.pbt.black'),
    },
    {
      name: 'contacts',
      key: 'dip28socket.contact',
      geometry: socketContact,
      material: base('tin'),
      locals: pins.map(([x, z]) => mat(x, 0, z)),
    },
    {
      name: 'queues',
      key: 'dip28socket.tail',
      geometry: flatTail,
      material: base('tin'),
      locals: pins.map(([x, z]) => mat(x, 0, z)),
    },
    ...thtJointMeshes('dip28', pins, 0.8, 0.3, { bottomH: 0.8 }),
  ];
  return { meshes };
}

/** Hauteur du dessus du support (m, repère composant) : assise du DIP. */
export const SOCKET_TOP = L_THT_SEAT + SOCKET_H * MM;
