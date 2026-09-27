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

/** Distance, le long d'un rayon (depuis c, direction d), jusqu'au bord d'un rectangle qui contient c. */
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
 * Congé autour d'un pied. Paramétrage par la normale (application de Gauss) du contour du pied
 * arrondi : chaque génératrice part du bord du pied, perpendiculairement à celui-ci, jusqu'au bord
 * de la pastille ; les angles du pied sont des arcs (congés d'angle lisses), les côtés droits des
 * surfaces réglées exactes (profil constant). `segments` règle la finesse des angles, `rings` celle
 * du profil concave (rangées resserrées près du pied, où la courbure est la plus forte).
 */
export function filletRing(spec: FilletSpec, segments: number, rings: number): THREE.BufferGeometry {
  const [fx0, fz0, fx1, fz1] = spec.foot;
  const cx = (fx0 + fx1) / 2;
  const cz = (fz0 + fz1) / 2;
  const rc = Math.max(1e-6, Math.min(0.25 * Math.min(fx1 - fx0, fz1 - fz0), 0.04e-3));
  const hx = Math.max(0, (fx1 - fx0) / 2 - rc);
  const hz = Math.max(0, (fz1 - fz0) / 2 - rc);
  const corner = Math.max(2, Math.round(segments / 5));
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const cols = rings + 1;
  let count = 0;
  // Quatre quarts : normale de 0 à 2π (de +X vers +Z), extrémités incluses (côtés droits entre deux).
  for (let q = 0; q < 4; q++) {
    const sx = q === 0 || q === 3 ? 1 : -1;
    const sz = q < 2 ? 1 : -1;
    for (let k = 0; k <= corner; k++) {
      const a = ((q + k / corner) * Math.PI) / 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const fx = cx + sx * hx + rc * nx;
      const fz = cz + sz * hz + rc * nz;
      const tp = Math.max(1e-7, rayRect(fx, fz, nx, nz, spec.pad));
      const wx = Math.abs(nx) ** 4 / (Math.abs(nx) ** 4 + Math.abs(nz) ** 4 + 1e-12);
      const hEnd = nx >= 0 ? spec.hToe : spec.hHeel;
      const h = spec.hSide + (hEnd - spec.hSide) * wx;
      for (let r = 0; r <= rings; r++) {
        const s = (r / rings) ** 1.35;
        const y = h * (1 - s) * (1 - s);
        pos.push(fx + nx * tp * s, y, fz + nz * tp * s);
        uv.push(0.002, 0.002);
      }
      count++;
    }
  }
  for (let i = 0; i < count; i++) {
    const i1 = (i + 1) % count;
    for (let r = 0; r < rings; r++) {
      const a = i * cols + r;
      const b = i1 * cols + r;
      const c = i1 * cols + r + 1;
      const d = i * cols + r + 1;
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
