/**
 * Primitives géométriques des intérieurs (unités : m, Y vers le haut), en complément de
 * `packages/geometry.ts` :
 * - `planarStrip` : bande plate horizontale suivant une ligne du plan XZ (doigts de grille de
 *   connexion, dépôts d'argent), largeur variable, arêtes arrondies ;
 * - `ringBetween` : couronne plane entre deux contours (bord d'un capot creux) ;
 * - `hollowLoft` : enveloppe creuse à paroi mince (capot de quartz) : flancs extérieurs, flancs
 *   intérieurs retournés et bord inférieur ;
 * - `wireTube` : tube le long d'une courbe (fils de liaison) ;
 * - `ellipsoid` : sphère aplatie (boule de fil, soudure en croissant, points de colle).
 *
 * Toutes les géométries portent `position`, `normal`, `uv` (fusion possible) et sont indexées.
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  flipIndex,
  loftRoundedRect,
  roundedRectRing,
  type LoftOptions,
  type LoftSection,
  type P2,
} from '../packages/geometry';

function makeGeometry(pos: number[], nor: number[], uv: number[], index: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/** Fusion (les géométries sources sont libérées). */
export function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  if (!merged) throw new Error('mergeAll : fusion impossible (attributs différents).');
  return merged;
}

/** Longueurs cumulées d'une ligne brisée. */
export function cumulative(path: readonly P2[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++)
    out.push(out[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]));
  return out;
}

/** Rééchantillonne une ligne brisée (pas maximal `step`), sommets d'origine conservés. */
export function densify(path: readonly P2[], step: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(path[path.length - 1]!);
  return out;
}

/**
 * Bande plate horizontale : ligne `path` dans le plan XZ (points (x, z), m), largeur
 * `widthAt(s, total)` dans le plan, épaisseur `thickness` selon Y centrée sur `y`. Section :
 * rectangle aux angles arrondis (`cornerR`) ; extrémités fermées.
 */
export function planarStrip(
  path: readonly P2[],
  widthAt: (s: number, total: number) => number,
  y: number,
  thickness: number,
  opts: { cornerR?: number; segs?: number } = {},
): THREE.BufferGeometry {
  const segs = opts.segs ?? 2;
  const n = path.length;
  const lengths = cumulative(path);
  const total = lengths[n - 1]!;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let m = 0;
  const rings: [number, number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(n - 1, i + 1)]!;
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    // Normale dans le plan (à gauche de la tangente, vue de dessus).
    const nx = -tz;
    const nz = tx;
    const w = widthAt(lengths[i]!, total);
    const cr = Math.min(opts.cornerR ?? thickness * 0.3, thickness / 2 - 1e-7, w / 2 - 1e-7);
    // (a, b) : a selon la largeur (normale dans le plan), b selon Y.
    const ring = roundedRectRing(w, thickness, cr, segs);
    m = ring.length;
    const pts: [number, number, number][] = [];
    for (const [a, b] of ring) {
      const p: [number, number, number] = [path[i]![0] + nx * a, y + b, path[i]![1] + nz * a];
      pos.push(p[0], p[1], p[2]);
      uv.push(lengths[i]! / Math.max(total, 1e-9), 0.5 + b / thickness);
      pts.push(p);
    }
    rings.push(pts);
  }
  for (let i = 0; i + 1 < n; i++) {
    for (let k = 0; k < m; k++) {
      const a = i * m + k;
      const b = i * m + ((k + 1) % m);
      const c = (i + 1) * m + ((k + 1) % m);
      const d = (i + 1) * m + k;
      index.push(a, b, c, a, c, d);
    }
  }
  const body = makeGeometry(pos, new Array<number>(pos.length).fill(0), uv, index);
  body.computeVertexNormals();
  // Orientation : le premier sommet (bord de largeur) doit avoir une normale sortante.
  {
    const nor = body.getAttribute('normal');
    const p0 = path[0]!;
    const dx = pos[0]! - p0[0];
    const dy = pos[1]! - y;
    const dz = pos[2]! - p0[1];
    if (dx * nor.getX(0) + dy * nor.getY(0) + dz * nor.getZ(0) < 0) flipIndex(body);
  }
  const parts: THREE.BufferGeometry[] = [body];
  for (const end of [0, n - 1]) {
    const ring = rings[end]!;
    const p = path[end]!;
    const q = path[end === 0 ? 1 : n - 2]!;
    const dl = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    const dir: [number, number, number] = [(p[0] - q[0]) / dl, 0, (p[1] - q[1]) / dl];
    const cpos: number[] = [p[0], y, p[1]];
    const cnor: number[] = [...dir];
    const cuv: number[] = [0.002, 0.002];
    for (const v of ring) {
      cpos.push(v[0], v[1], v[2]);
      cnor.push(...dir);
      cuv.push(0.002, 0.002);
    }
    const cidx: number[] = [];
    for (let k = 0; k < m; k++) cidx.push(0, 1 + k, 1 + ((k + 1) % m));
    const cap = makeGeometry(cpos, cnor, cuv, cidx);
    orientTo(cap, dir);
    parts.push(cap);
  }
  return mergeAll(parts);
}

/** Retourne les triangles si la normale géométrique du premier s'oppose à `want`. */
function orientTo(g: THREE.BufferGeometry, want: readonly [number, number, number]): void {
  const idx = g.getIndex()!;
  const p = g.getAttribute('position');
  const a = new THREE.Vector3().fromBufferAttribute(p, idx.getX(0));
  const b = new THREE.Vector3().fromBufferAttribute(p, idx.getX(1));
  const c = new THREE.Vector3().fromBufferAttribute(p, idx.getX(2));
  const nrm = b.sub(a).cross(c.sub(a));
  if (nrm.x * want[0] + nrm.y * want[1] + nrm.z * want[2] < 0) {
    const t = Array.from(idx.array as ArrayLike<number>);
    for (let i = 0; i < t.length; i += 3) {
      idx.setX(i + 1, t[i + 2]!);
      idx.setX(i + 2, t[i + 1]!);
    }
    idx.needsUpdate = true;
  }
}

/**
 * Couronne plane horizontale entre deux contours de même nombre de points (plan XZ, m, même
 * sens), à la hauteur `y`, normale vers le haut (`up`) ou vers le bas.
 */
export function ringBetween(
  outer: readonly P2[],
  inner: readonly P2[],
  y: number,
  up: boolean,
): THREE.BufferGeometry {
  const m = outer.length;
  if (inner.length !== m) throw new Error('ringBetween : contours de tailles différentes.');
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const [x, z] of outer) {
    pos.push(x, y, z);
    nor.push(0, up ? 1 : -1, 0);
    uv.push(0.002, 0.002);
  }
  for (const [x, z] of inner) {
    pos.push(x, y, z);
    nor.push(0, up ? 1 : -1, 0);
    uv.push(0.002, 0.002);
  }
  for (let i = 0; i < m; i++) {
    const a = i;
    const b = (i + 1) % m;
    index.push(a, b, m + b, a, m + b, m + i);
  }
  const g = makeGeometry(pos, nor, uv, index);
  orientTo(g, [0, up ? 1 : -1, 0]);
  return g;
}

/**
 * Enveloppe creuse à paroi mince, ouverte en bas : sections extérieures et intérieures (même
 * nombre de sections non requis, même contour), bord inférieur plat. UV du dessus extérieur
 * selon `outerOptions` (marquage).
 */
export function hollowLoft(
  outer: readonly LoftSection[],
  inner: readonly LoftSection[],
  segs: number,
  outerOptions: LoftOptions = {},
): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const o = loftRoundedRect(outer, { cornerSegments: segs, ...outerOptions, capBottom: false });
  const i = loftRoundedRect(inner, { cornerSegments: segs, capBottom: false });
  flipIndex(i);
  const o0 = outer[0]!;
  const i0 = inner[0]!;
  const rim = ringBetween(
    roundedRectRing(o0.w, o0.d, o0.r, segs),
    roundedRectRing(i0.w, i0.d, i0.r, segs),
    o0.y,
    false,
  );
  return { outer: mergeAll([o, rim]), inner: i };
}

/** Tube (section circulaire) le long d'une courbe ; extrémités ouvertes (cachées par les soudures). */
export function wireTube(
  points: readonly THREE.Vector3[],
  radius: number,
  segments: number,
  radial: number,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([...points], false, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, radial, false);
}

/** Ellipsoïde (demi-axes rx, ry, rz) centré à l'origine. */
export function ellipsoid(rx: number, ry: number, rz: number, w = 16, h = 8): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  // Normales d'un ellipsoïde : gradient de (x/rx)² + (y/ry)² + (z/rz)².
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const nx = p.getX(i) / (rx * rx);
    const ny = p.getY(i) / (ry * ry);
    const nz = p.getZ(i) / (rz * rz);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}

/** Contour (plan XZ) d'un rectangle arrondi, m. */
export const rectRing = (w: number, d: number, r: number, segs = 3): P2[] => roundedRectRing(w, d, r, segs);
