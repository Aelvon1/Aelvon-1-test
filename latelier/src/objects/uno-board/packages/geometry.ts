/**
 * Primitives géométriques des boîtiers (unités : m, Y vers le haut) :
 * - `loftRoundedRect` : corps extrudé à section de rectangle arrondi variable (dépouille,
 *   chanfreins, arrondis d'arêtes) — boîtiers moulés, corps de passifs, isolants ;
 * - `sweepStrip` : bande de section rectangulaire arrondie balayée le long d'un profil plan
 *   (pattes en aile de mouette, pattes DIP à épaulement, bornes d'électrolytique) ;
 * - `annulus` : pastille annulaire (trou traversant, via) ;
 * - `lathe` : révolution d'un profil (fûts de métallisation, ménisques traversants, boîtiers ronds) ;
 * - utilitaires d'instanciation.
 *
 * Toutes les géométries sont indexées et portent `position`, `normal` et `uv` (fusion possible).
 * Aucun angle parfaitement vif : les sections et profils portent des congés.
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type P2 = readonly [number, number];

/** Section d'un loft : hauteur y, dimensions w (X) × d (Z), rayon d'angle r. */
export interface LoftSection {
  y: number;
  w: number;
  d: number;
  r: number;
  /** Décalage du centre de la section (X, Z). */
  ox?: number;
  oz?: number;
}

export interface LoftOptions {
  /** Segments par quart d'angle arrondi. */
  cornerSegments?: number;
  capTop?: boolean;
  capBottom?: boolean;
  /**
   * UV du dessus : planaires sur le rectangle englobant de la section haute (u selon +X,
   * v selon +Z). Les flancs et le dessous reçoivent un UV constant `sideUV` (zone vierge d'une
   * texture de marquage).
   */
  sideUV?: P2;
  /**
   * Dimensions (m) de la zone couverte par la texture sur le dessus (centrée) ; défaut : la
   * section haute. Permet de caler un marquage de taille physique connue.
   */
  uvSize?: P2;
  /**
   * Contour personnalisé d'une section (même nombre de points pour toutes les sections, sens
   * trigonométrique vu de dessus, étoilé depuis le centre) ; défaut : rectangle arrondi.
   */
  ring?: (w: number, d: number, r: number) => P2[];
}

/** Points d'un rectangle arrondi (sens trigonométrique vu de dessus, dans le plan XZ). */
export function roundedRectRing(w: number, d: number, r: number, segs: number): P2[] {
  const rr = Math.max(1e-6, Math.min(r, w / 2 - 1e-6, d / 2 - 1e-6));
  const hx = w / 2 - rr;
  const hz = d / 2 - rr;
  const pts: P2[] = [];
  // Coins : (+x,+z) → (−x,+z) → (−x,−z) → (+x,−z) ; angle mesuré de +X vers −Z (vu de dessus).
  const corners: [number, number, number][] = [
    [hx, -hz, 0],
    [-hx, -hz, Math.PI / 2],
    [-hx, hz, Math.PI],
    [hx, hz, (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let k = 0; k <= segs; k++) {
      const a = a0 + (k / segs) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cz - Math.sin(a) * rr]);
    }
  }
  return pts;
}

/** Géométrie indexée à partir de tableaux bruts. */
function makeGeometry(pos: number[], nor: number[], uv: number[], index: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/**
 * Corps « lofté » : sections successives (de bas en haut) reliées par des flancs lisses,
 * fermé par des faces planes en haut et en bas.
 */
export function loftRoundedRect(
  sections: readonly LoftSection[],
  options: LoftOptions = {},
): THREE.BufferGeometry {
  const segs = options.cornerSegments ?? 4;
  const sideUV = options.sideUV ?? [0.002, 0.002];
  const ringOf = options.ring ?? ((w: number, d: number, r: number) => roundedRectRing(w, d, r, segs));
  const rings = sections.map((s) =>
    ringOf(s.w, s.d, s.r).map(([x, z]) => [x + (s.ox ?? 0), s.y, z + (s.oz ?? 0)] as const),
  );
  const m = rings[0]!.length;
  const parts: THREE.BufferGeometry[] = [];

  // Flancs : grille lisse (normales moyennées).
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    for (const ring of rings) {
      for (const [x, y, z] of ring) {
        pos.push(x, y, z);
        uv.push(sideUV[0], sideUV[1]);
      }
    }
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let i = 0; i < m; i++) {
        const a = k * m + i;
        const b = k * m + ((i + 1) % m);
        const c = (k + 1) * m + ((i + 1) % m);
        const d = (k + 1) * m + i;
        // Anneau dans le sens trigonométrique vu de dessus : (a, b, c) oriente la normale vers l'extérieur.
        index.push(a, b, c, a, c, d);
      }
    }
    const side = makeGeometry(pos, new Array<number>(pos.length).fill(0), uv, index);
    side.computeVertexNormals();
    parts.push(side);
  }
  const cap = (ring: readonly (readonly [number, number, number])[], up: boolean, s: LoftSection) => {
    const uw = options.uvSize?.[0] ?? s.w;
    const ud = options.uvSize?.[1] ?? s.d;
    const pos: number[] = [];
    const nor: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    const cx = s.ox ?? 0;
    const cz = s.oz ?? 0;
    pos.push(cx, s.y, cz);
    nor.push(0, up ? 1 : -1, 0);
    if (up) uv.push(0.5, 0.5);
    else uv.push(sideUV[0], sideUV[1]);
    for (const [x, y, z] of ring) {
      pos.push(x, y, z);
      nor.push(0, up ? 1 : -1, 0);
      if (up) uv.push((x - cx) / uw + 0.5, (z - cz) / ud + 0.5);
      else uv.push(sideUV[0], sideUV[1]);
    }
    for (let i = 0; i < m; i++) {
      const a = 1 + i;
      const b = 1 + ((i + 1) % m);
      if (up) index.push(0, a, b);
      else index.push(0, b, a);
    }
    parts.push(makeGeometry(pos, nor, uv, index));
  };
  if (options.capTop !== false) cap(rings[rings.length - 1]!, true, sections[sections.length - 1]!);
  if (options.capBottom !== false) cap(rings[0]!, false, sections[0]!);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('loftRoundedRect : fusion impossible.');
  return merged;
}

/**
 * Sections d'un pavé aux arêtes arrondies : bas arrondi (rb), flanc (dépouille `draft` = retrait
 * en m au sommet), haut arrondi (rt). `w`, `d` = dimensions à la base, `r` = rayon des angles en plan.
 */
export function roundedBoxSections(
  w: number,
  d: number,
  h: number,
  opts: { r?: number; rt?: number; rb?: number; draft?: number; y0?: number; steps?: number } = {},
): LoftSection[] {
  const r = opts.r ?? Math.min(w, d) * 0.08;
  const rt = Math.min(opts.rt ?? Math.min(h * 0.3, r), h * 0.5);
  const rb = Math.min(opts.rb ?? rt * 0.5, h * 0.5);
  const draft = opts.draft ?? 0;
  const y0 = opts.y0 ?? 0;
  const steps = opts.steps ?? 3;
  const out: LoftSection[] = [];
  const push = (y: number, inset: number) => {
    const t = h > 0 ? (y - y0) / h : 0;
    const off = draft * t + inset;
    const s: LoftSection = { y, w: w - 2 * off, d: d - 2 * off, r: Math.max(1e-6, r - inset) };
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - y) < 1e-9) out[out.length - 1] = s;
    else out.push(s);
  };
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    push(y0 + rb * (1 - Math.cos(a)), rb * (1 - Math.sin(a)));
  }
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    push(y0 + h - rt + rt * Math.sin(a), rt * (1 - Math.cos(a)));
  }
  return out;
}

/** Pavé arrondi simple (corps de passif, pièce plastique) posé sur y0. */
export function roundedBox(
  w: number,
  d: number,
  h: number,
  opts: {
    r?: number;
    rt?: number;
    rb?: number;
    draft?: number;
    y0?: number;
    segs?: number;
    steps?: number;
    sideUV?: P2;
    uvSize?: P2;
  } = {},
): THREE.BufferGeometry {
  return loftRoundedRect(roundedBoxSections(w, d, h, opts), {
    cornerSegments: opts.segs ?? 3,
    ...(opts.sideUV ? { sideUV: opts.sideUV } : {}),
    ...(opts.uvSize ? { uvSize: opts.uvSize } : {}),
  });
}

// --- Balayage (pattes) -------------------------------------------------------------------------

/** Polyligne plane avec congés de rayon `r` aux sommets intérieurs (profils de pattes pliées). */
export function filletPath(points: readonly P2[], r: number, segs = 6): P2[] {
  if (points.length < 3 || r <= 0) return [...points];
  const out: P2[] = [points[0]!];
  for (let i = 1; i + 1 < points.length; i++) {
    const p = points[i]!;
    const a = points[i - 1]!;
    const b = points[i + 1]!;
    const u = unit([a[0] - p[0], a[1] - p[1]]);
    const v = unit([b[0] - p[0], b[1] - p[1]]);
    const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
    const ang = Math.acos(cos);
    if (ang < 1e-3 || Math.PI - ang < 1e-3) {
      out.push(p);
      continue;
    }
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const rr = Math.min(r, Math.tan(ang / 2) * Math.min(la, lb) * 0.49);
    const t = rr / Math.tan(ang / 2);
    const bis = unit([u[0] + v[0], u[1] + v[1]]);
    const cd = rr / Math.sin(ang / 2);
    const c: P2 = [p[0] + bis[0] * cd, p[1] + bis[1] * cd];
    const p0: P2 = [p[0] + u[0] * t, p[1] + u[1] * t];
    const p1: P2 = [p[0] + v[0] * t, p[1] + v[1] * t];
    const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
    let a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    for (let k = 0; k <= segs; k++) {
      const ang2 = a0 + ((a1 - a0) * k) / segs;
      out.push([c[0] + Math.cos(ang2) * rr, c[1] + Math.sin(ang2) * rr]);
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

function unit(v: P2): P2 {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/**
 * Bande balayée le long d'un profil plan (plan XY : X = sortie de patte, Y = hauteur ; la
 * largeur est selon Z). Section : rectangle arrondi épaisseur × largeur(s), s = abscisse
 * curviligne (m) depuis le début du profil.
 */
export function sweepStrip(
  path: readonly P2[],
  thickness: number,
  widthAt: (s: number, total: number) => number,
  opts: { cornerR?: number; segs?: number; caps?: boolean } = {},
): THREE.BufferGeometry {
  const segs = opts.segs ?? 2;
  const n = path.length;
  const lengths = [0];
  for (let i = 1; i < n; i++)
    lengths.push(lengths[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]));
  const total = lengths[n - 1]!;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let m = 0;
  for (let i = 0; i < n; i++) {
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(n - 1, i + 1)]!;
    const t = unit([next[0] - prev[0], next[1] - prev[1]]);
    const nrm: P2 = [-t[1], t[0]];
    const w = widthAt(lengths[i]!, total);
    const cr = Math.min(opts.cornerR ?? thickness * 0.3, thickness / 2 - 1e-6, w / 2 - 1e-6);
    const ring = roundedRectRing(thickness, w, cr, segs); // (a = épaisseur selon la normale, b = largeur selon Z)
    m = ring.length;
    for (const [a, b] of ring) {
      pos.push(path[i]![0] + nrm[0] * a, path[i]![1] + nrm[1] * a, b);
      uv.push(0.002, 0.002);
    }
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
  // Contrôle d'orientation : la normale du premier sommet doit s'éloigner de l'axe du profil.
  orientOutward(body, path);
  if (opts.caps === false) return body;
  const capsGeo: THREE.BufferGeometry[] = [body];
  for (const end of [0, n - 1]) {
    const cpos: number[] = [];
    const cnor: number[] = [];
    const cuv: number[] = [];
    const cidx: number[] = [];
    const p = path[end]!;
    const q = path[end === 0 ? 1 : n - 2]!;
    const dir = unit([p[0] - q[0], p[1] - q[1]]); // vers l'extérieur de la bande
    cpos.push(p[0], p[1], 0);
    cnor.push(dir[0], dir[1], 0);
    cuv.push(0.002, 0.002);
    for (let k = 0; k < m; k++) {
      const src = (end * m + k) * 3;
      cpos.push(pos[src]!, pos[src + 1]!, pos[src + 2]!);
      cnor.push(dir[0], dir[1], 0);
      cuv.push(0.002, 0.002);
    }
    for (let k = 0; k < m; k++) cidx.push(0, 1 + k, 1 + ((k + 1) % m));
    const capGeo = makeGeometry(cpos, cnor, cuv, cidx);
    orientFaces(capGeo, [dir[0], dir[1], 0]);
    capsGeo.push(capGeo);
  }
  const merged = mergeGeometries(capsGeo, false);
  for (const g of capsGeo) g.dispose();
  if (!merged) throw new Error('sweepStrip : fusion impossible.');
  return merged;
}

/** Retourne les triangles d'une géométrie si leur normale géométrique s'oppose à `want`. */
function orientFaces(g: THREE.BufferGeometry, want: readonly [number, number, number]): void {
  const idx = g.getIndex()!;
  const p = g.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  a.fromBufferAttribute(p, idx.getX(0));
  b.fromBufferAttribute(p, idx.getX(1));
  c.fromBufferAttribute(p, idx.getX(2));
  const nrm = b.sub(a).cross(c.sub(a));
  if (nrm.x * want[0] + nrm.y * want[1] + nrm.z * want[2] < 0) flipIndex(g);
}

/** Inverse l'ordre de tous les triangles (et les normales). */
export function flipIndex(g: THREE.BufferGeometry): void {
  const idx = g.getIndex()!;
  for (let i = 0; i < idx.count; i += 3) {
    const t = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, t);
  }
  idx.needsUpdate = true;
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  n.needsUpdate = true;
}

/** Oriente une bande balayée vers l'extérieur (sinon retourne ses faces). */
function orientOutward(g: THREE.BufferGeometry, path: readonly P2[]): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  // Sommet 0 : sur l'anneau du point 0 du profil.
  const p0 = path[0]!;
  const dx = pos.getX(0) - p0[0];
  const dy = pos.getY(0) - p0[1];
  const dz = pos.getZ(0);
  if (dx * nor.getX(0) + dy * nor.getY(0) + dz * nor.getZ(0) < 0) flipIndex(g);
}

// --- Révolution ----------------------------------------------------------------------------------

/**
 * Révolution d'un profil (r, y) autour de Y. Profil de bas en haut ; la surface est orientée
 * vers l'extérieur si le profil tourne dans le sens (r croissant en montant côté extérieur).
 */
export function lathe(
  profile: readonly P2[],
  segments: number,
  opts: { flip?: boolean; uvU?: boolean } = {},
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const m = profile.length;
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    for (let k = 0; k < m; k++) {
      const [r, y] = profile[k]!;
      pos.push(r * c, y, -r * sn);
      // u autour de la circonférence (anisotropie éventuelle), v le long du profil.
      uv.push(opts.uvU ? s / segments : 0.002, opts.uvU ? k / (m - 1) : 0.002);
    }
  }
  for (let s = 0; s < segments; s++) {
    for (let k = 0; k + 1 < m; k++) {
      const a = s * m + k;
      const b = (s + 1) * m + k;
      const c = (s + 1) * m + k + 1;
      const d = s * m + k + 1;
      if (opts.flip) index.push(a, c, b, a, d, c);
      else index.push(a, b, c, a, c, d);
    }
  }
  const g = makeGeometry(pos, new Array<number>(pos.length).fill(0), uv, index);
  g.computeVertexNormals();
  // Raccord de couture : normales moyennées entre la première et la dernière génératrice.
  const nor = g.getAttribute('normal');
  for (let k = 0; k < m; k++) {
    const i0 = k;
    const i1 = segments * m + k;
    const x = nor.getX(i0) + nor.getX(i1);
    const y = nor.getY(i0) + nor.getY(i1);
    const z = nor.getZ(i0) + nor.getZ(i1);
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(i0, x / l, y / l, z / l);
    nor.setXYZ(i1, x / l, y / l, z / l);
  }
  return g;
}

/**
 * Pastille annulaire (anneau de cuivre étamé autour d'un trou) : contour extérieur rond ou carré
 * (rayon/demi-côté `outer`), trou `inner`, épaisseur `h`, léger bombé de l'étamage `crown`.
 */
export function annulus(
  outer: number,
  inner: number,
  h: number,
  crown: number,
  square = false,
  segments = 32,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  // Profil radial (du trou vers l'extérieur) : bord du trou, sommet bombé, bord extérieur.
  const rows: [number, number][] = [
    [0, 0],
    [0, h],
    [0.2, h + crown * 0.8],
    [0.5, h + crown],
    [0.8, h + crown * 0.8],
    [1, h],
    [1, 0],
  ];
  const ring = segments;
  for (let s = 0; s < ring; s++) {
    const a = (s / ring) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    // Rayon extérieur : cercle, ou carré aux angles adoucis (superellipse d'exposant 10).
    const ro = square ? outer / (Math.abs(c) ** 10 + Math.abs(sn) ** 10) ** 0.1 : outer;
    for (const [t, y] of rows) {
      const r = inner + (ro - inner) * t;
      pos.push(r * c, y, -r * sn);
      nor.push(0, 1, 0);
      uv.push(0.002, 0.002);
    }
  }
  const m = rows.length;
  for (let s = 0; s < ring; s++) {
    const s1 = (s + 1) % ring;
    for (let k = 0; k + 1 < m; k++) {
      const a = s * m + k;
      const b = s1 * m + k;
      const c = s1 * m + k + 1;
      const d = s * m + k + 1;
      index.push(a, c, b, a, d, c);
    }
  }
  const g = makeGeometry(pos, nor, uv, index);
  g.computeVertexNormals();
  return g;
}

// --- Instanciation -----------------------------------------------------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/** Matrice de placement : position (m), rotation Euler XYZ (rad), échelle. */
export function mat(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
): THREE.Matrix4 {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Maillage instancié à partir de matrices (bornes calculées pour le découpage de vue). */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: readonly THREE.Matrix4[],
  name: string,
): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
  im.name = name;
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  if (matrices.length === 0) {
    im.count = 0;
    im.setMatrixAt(0, _m.identity());
  }
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.computeBoundingBox();
  return im;
}

/** Maillage simple ou instancié selon le nombre de placements. */
export function meshOrInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: readonly THREE.Matrix4[],
  name: string,
): THREE.Mesh {
  if (matrices.length === 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.applyMatrix4(matrices[0]!);
    return mesh;
  }
  return instanced(geometry, material, matrices, name);
}

/** Fusionne des géométries transformées (copies) en une seule. */
export function mergeTransformed(
  items: readonly { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[],
): THREE.BufferGeometry {
  const copies = items.map((it) => it.geometry.clone().applyMatrix4(it.matrix));
  const merged = mergeGeometries(copies, false);
  for (const c of copies) c.dispose();
  if (!merged) throw new Error('mergeTransformed : fusion impossible.');
  return merged;
}

/**
 * Recalcule les UV d'une géométrie : faces orientées vers le haut → projection planaire sur une
 * zone (w × d, m) centrée en (cx, cz) ; autres faces → UV constant (zone vierge de la texture).
 * Géométrie non indexée ou indexée acceptée (les sommets partagés prennent la projection haute).
 */
export function remapTopUV(
  g: THREE.BufferGeometry,
  w: number,
  d: number,
  cx = 0,
  cz = 0,
  sideUV: P2 = [0.002, 0.002],
): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    if (nor.getY(i) > 0.9) {
      uvs[i * 2] = (pos.getX(i) - cx) / w + 0.5;
      uvs[i * 2 + 1] = (pos.getZ(i) - cz) / d + 0.5;
    } else {
      uvs[i * 2] = sideUV[0];
      uvs[i * 2 + 1] = sideUV[1];
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

/** Disque plat horizontal (normale +Y) de rayon r à la hauteur y, UV planaires sur un carré de côté `uvSize`. */
export function flatDisk(r: number, y: number, uvSize: number, segments = 48): THREE.BufferGeometry {
  const pos: number[] = [0, y, 0];
  const nor: number[] = [0, 1, 0];
  const uv: number[] = [0.5, 0.5];
  const index: number[] = [];
  for (let s = 0; s < segments; s++) {
    const a = (s / segments) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = -Math.sin(a) * r;
    pos.push(x, y, z);
    nor.push(0, 1, 0);
    uv.push(x / uvSize + 0.5, z / uvSize + 0.5);
  }
  for (let s = 0; s < segments; s++) index.push(0, 1 + s, 1 + ((s + 1) % segments));
  return makeGeometry(pos, nor, uv, index);
}
