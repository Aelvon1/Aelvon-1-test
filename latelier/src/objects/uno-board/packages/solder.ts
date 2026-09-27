/**
 * Ménisques de soudure (congés concaves) — géométrie en m, repère « pastille » :
 * origine au centre de la pastille, sur la surface étamée (y = 0), X vers l'extérieur du
 * composant (côté « pointe » de la patte), Z latéral.
 *
 * - `filletRing` : congé autour d'un pied rectangulaire (patte en aile de mouette, terminaison
 *   de CMS, plot de QFN) : la brasure mouille toute la pastille (hauteur 0 au bord de la
 *   pastille) et remonte sur le pied (hauteurs différentes à la pointe, au talon et sur les côtés),
 *   profil concave h·(1 − s)².
 * - `thtFillet` : congé de révolution d'une broche traversante (« volcan » côté soudure,
 *   petit congé côté composants).
 */
import * as THREE from 'three/webgpu';
import { lathe, type P2 } from './geometry';

export interface FilletSpec {
  /** Pied : rectangle [x0, z0, x1, z1] (m, repère pastille). */
  foot: readonly [number, number, number, number];
  /** Pastille : rectangle [x0, z0, x1, z1] (m) contenant le pied. */
  pad: readonly [number, number, number, number];
  /** Hauteur de mouillage à la pointe (+X), au talon (−X) et sur les côtés (m). */
  hToe: number;
  hHeel: number;
  hSide: number;
}

/** Intersection d'un rayon (depuis c, direction d) avec le bord d'un rectangle qui contient c. */
function rayRect(
  cx: number,
  cz: number,
  dx: number,
  dz: number,
  r: readonly [number, number, number, number],
): number {
  let t = Infinity;
  if (dx > 1e-12) t = Math.min(t, (r[2] - cx) / dx);
  if (dx < -1e-12) t = Math.min(t, (r[0] - cx) / dx);
  if (dz > 1e-12) t = Math.min(t, (r[3] - cz) / dz);
  if (dz < -1e-12) t = Math.min(t, (r[1] - cz) / dz);
  return Math.max(0, t);
}

/**
 * Congé autour d'un pied : `segments` directions autour du pied, `rings` rangées radiales
 * (resserrées près du pied, où la courbure est la plus forte).
 */
export function filletRing(spec: FilletSpec, segments: number, rings: number): THREE.BufferGeometry {
  const [fx0, fz0, fx1, fz1] = spec.foot;
  const cx = (fx0 + fx1) / 2;
  const cz = (fz0 + fz1) / 2;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const cols = rings + 1;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    // Direction « carrée » (répartition plus régulière le long des côtés d'un rectangle).
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const tf = rayRect(cx, cz, dx, dz, spec.foot);
    const tp = Math.max(tf + 1e-6, rayRect(cx, cz, dx, dz, spec.pad));
    // Hauteur au bord du pied : pointe / talon / côtés, raccordés en douceur.
    const wx = Math.abs(dx) ** 4 / (Math.abs(dx) ** 4 + Math.abs(dz) ** 4 + 1e-12);
    const hEnd = dx >= 0 ? spec.hToe : spec.hHeel;
    const h = spec.hSide + (hEnd - spec.hSide) * wx;
    for (let k = 0; k <= rings; k++) {
      const s = (k / rings) ** 1.35;
      const t = tf + (tp - tf) * s;
      const y = h * (1 - s) * (1 - s);
      pos.push(cx + dx * t, y, cz + dz * t);
      uv.push(0.002, 0.002);
    }
  }
  for (let i = 0; i < segments; i++) {
    const i1 = (i + 1) % segments;
    for (let k = 0; k < rings; k++) {
      const a = i * cols + k;
      const b = i1 * cols + k;
      const c = i1 * cols + k + 1;
      const d = i * cols + k + 1;
      // Orientation : normale vers le haut et l'extérieur.
      index.push(a, b, c, a, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array<number>(pos.length).fill(0), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * Congé de révolution autour d'une broche traversante : de la pastille (rayon `padR`, y = 0) à la
 * broche (rayon `pinR`, hauteur `h`), profil concave. Orienté vers +Y (le côté soudure s'obtient
 * par une rotation de π autour de X).
 */
export function thtFillet(
  padR: number,
  pinR: number,
  h: number,
  segments: number,
  rows: number,
): THREE.BufferGeometry {
  const profile: P2[] = [];
  for (let k = 0; k <= rows; k++) {
    const s = 1 - (k / rows) ** 0.8; // 1 = bord de la pastille, 0 = contre la broche
    profile.push([pinR + (padR - pinR) * s, h * (1 - s) * (1 - s)]);
  }
  // Petit bourrelet contre la broche (la brasure l'entoure).
  profile.push([pinR * 0.92, h * 1.02]);
  return lathe(profile, segments);
}
