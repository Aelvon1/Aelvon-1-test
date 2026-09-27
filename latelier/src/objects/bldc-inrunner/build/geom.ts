/**
 * Boîte à outils géométrique du moteur (côté three.js).
 *
 * Toutes les fonctions travaillent en MILLIMÈTRES dans un `MeshBuilder` ; la conversion en mètres
 * se fait à la fin (`build()`). Principes :
 * - normales calculées analytiquement (profils, contours, tubes) : surfaces lisses, arêtes
 *   arrondies réellement modélisées (congés, chanfreins) plutôt que des normales moyennées ;
 * - orientation des triangles corrigée automatiquement d'après les normales (aucune face
 *   retournée, quel que soit le sens de parcours d'un profil) ;
 * - UV cohérents : u autour de la circonférence pour les révolutions (anisotropie de l'acier
 *   rectifié), abscisse curviligne pour les tubes et contours.
 */
import * as THREE from 'three/webgpu';
import { oriented, vertexNormals, circle, type P2 } from '../profile2d';

export const MM = 0.001;
export type V3 = [number, number, number];

/** Constructeur de maillage indexé avec groupes de matériaux. */
export class MeshBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  private readonly groups: number[][] = [[]];
  private current = 0;

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  /** Groupe (matériau) des triangles suivants. */
  setGroup(index: number): this {
    while (this.groups.length <= index) this.groups.push([]);
    this.current = index;
    return this;
  }

  vertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number, u = 0, v = 0): number {
    this.positions.push(px, py, pz);
    const l = Math.hypot(nx, ny, nz) || 1;
    this.normals.push(nx / l, ny / l, nz / l);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.groups[this.current]!.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** Nombre d'indices du groupe courant (pour les plages de dessin progressives). */
  indexCount(group = this.current): number {
    return this.groups[group]?.length ?? 0;
  }

  /** Ajoute un autre constructeur, transformé par `m` (positions) et sa matrice normale. */
  append(other: MeshBuilder, m?: THREE.Matrix4): void {
    const base = this.vertexCount;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const v = new THREE.Vector3();
    for (let i = 0; i < other.positions.length; i += 3) {
      v.set(other.positions[i]!, other.positions[i + 1]!, other.positions[i + 2]!);
      if (m) v.applyMatrix4(m);
      this.positions.push(v.x, v.y, v.z);
      v.set(other.normals[i]!, other.normals[i + 1]!, other.normals[i + 2]!);
      if (nm) v.applyMatrix3(nm).normalize();
      this.normals.push(v.x, v.y, v.z);
    }
    this.uvs.push(...other.uvs);
    other.groups.forEach((list, g) => {
      while (this.groups.length <= g) this.groups.push([]);
      const target = this.groups[g]!;
      for (const i of list) target.push(i + base);
    });
  }

  /**
   * Géométrie finale. `scale` : conversion d'unités (mm → m par défaut). L'orientation de
   * chaque triangle est alignée sur les normales de ses sommets.
   */
  build(scale = MM, fixOrientation = true): THREE.BufferGeometry {
    const P = this.positions;
    const N = this.normals;
    const all: number[] = [];
    const g = new THREE.BufferGeometry();
    let start = 0;
    this.groups.forEach((list, gi) => {
      if (fixOrientation) {
        for (let t = 0; t < list.length; t += 3) {
          const a = list[t]! * 3;
          const b = list[t + 1]! * 3;
          const c = list[t + 2]! * 3;
          const ux = P[b]! - P[a]!;
          const uy = P[b + 1]! - P[a + 1]!;
          const uz = P[b + 2]! - P[a + 2]!;
          const vx = P[c]! - P[a]!;
          const vy = P[c + 1]! - P[a + 1]!;
          const vz = P[c + 2]! - P[a + 2]!;
          const fx = uy * vz - uz * vy;
          const fy = uz * vx - ux * vz;
          const fz = ux * vy - uy * vx;
          const nx = N[a]! + N[b]! + N[c]!;
          const ny = N[a + 1]! + N[b + 1]! + N[c + 1]!;
          const nz = N[a + 2]! + N[b + 2]! + N[c + 2]!;
          if (fx * nx + fy * ny + fz * nz < 0) {
            const tmp = list[t + 1]!;
            list[t + 1] = list[t + 2]!;
            list[t + 2] = tmp;
          }
        }
      }
      if (list.length) g.addGroup(start, list.length, gi);
      for (const i of list) all.push(i);
      start += list.length;
    });
    const pos = new Float32Array(P.length);
    for (let i = 0; i < P.length; i++) pos[i] = P[i]! * scale;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uvs), 2));
    const count = this.vertexCount;
    g.setIndex(new THREE.BufferAttribute(count > 65535 ? new Uint32Array(all) : new Uint16Array(all), 1));
    if (this.groups.filter((l) => l.length).length <= 1) g.clearGroups();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// --- Repères ------------------------------------------------------------------------------------

/** Matrice d'un repère : origine + axes (colonnes). */
export function basis(origin: V3, xAxis: V3, yAxis: V3, zAxis: V3): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    xAxis[0], yAxis[0], zAxis[0], origin[0],
    xAxis[1], yAxis[1], zAxis[1], origin[1],
    xAxis[2], yAxis[2], zAxis[2], origin[2],
    0, 0, 0, 1,
  );
}

/** Repère orthonormé dont l'axe X est `axis` (Y et Z complétés de façon stable). */
export function frameAlong(origin: V3, axis: V3, up: V3 = [0, 1, 0]): THREE.Matrix4 {
  const a = new THREE.Vector3(...axis).normalize();
  let u = new THREE.Vector3(...up);
  if (Math.abs(u.dot(a)) > 0.95) u = new THREE.Vector3(0, 0, 1);
  const y = u.sub(a.clone().multiplyScalar(u.dot(a))).normalize();
  const z = new THREE.Vector3().crossVectors(a, y);
  return basis(origin, [a.x, a.y, a.z], [y.x, y.y, y.z], [z.x, z.y, z.z]);
}

// --- Révolution -----------------------------------------------------------------------------------

/** Point de profil de révolution : abscisse axiale x, rayon r. */
export type RevPoint = readonly [x: number, r: number];

export interface RevolveOptions {
  segments: number;
  /** Angle de départ et amplitude (rad). Défaut : tour complet. */
  phi0?: number;
  sweep?: number;
  /** Échelle des u (1 = un tour complet). */
  uRepeat?: number;
}

/**
 * Révolution d'un profil (x, r) autour de l'axe X. Point = (x, r cos φ, r sin φ).
 * Normales : perpendiculaires au profil (côté gauche du sens de parcours : parcourir le profil
 * avec la matière à DROITE). Les arêtes vives doivent être arrondies dans le profil.
 */
export function revolve(mb: MeshBuilder, profile: readonly RevPoint[], opts: RevolveOptions): void {
  const n = profile.length;
  if (n < 2) return;
  const seg = Math.max(3, opts.segments);
  const phi0 = opts.phi0 ?? 0;
  const sweep = opts.sweep ?? Math.PI * 2;
  const full = Math.abs(sweep - Math.PI * 2) < 1e-9;
  const cols = full ? seg + 1 : seg + 1;
  // Normales du profil.
  const pn: P2[] = [];
  const len: number[] = [0];
  for (let i = 1; i < n; i++) len.push(len[i - 1]! + Math.hypot(profile[i]![0] - profile[i - 1]![0], profile[i]![1] - profile[i - 1]![1]));
  const total = len[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const a = profile[Math.max(0, i - 1)]!;
    const b = profile[Math.min(n - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dr = b[1] - a[1];
    const l = Math.hypot(dx, dr) || 1;
    pn.push([-dr / l, dx / l]);
  }
  const base = mb.vertexCount;
  const uRepeat = opts.uRepeat ?? 1;
  for (let j = 0; j < cols; j++) {
    const t = j / seg;
    const phi = phi0 + sweep * t;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    for (let i = 0; i < n; i++) {
      const [x, r] = profile[i]!;
      const [nx, nr] = pn[i]!;
      mb.vertex(x, r * c, r * s, nx, nr * c, nr * s, t * uRepeat, len[i]! / total);
    }
  }
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = base + j * n + i;
      const b = base + (j + 1) * n + i;
      const r0 = profile[i]![1];
      const r1 = profile[i + 1]![1];
      if (r0 < 1e-9 && r1 < 1e-9) continue;
      if (r0 < 1e-9) mb.tri(a, a + 1, b + 1);
      else if (r1 < 1e-9) mb.tri(a, a + 1, b);
      else mb.quad(a, a + 1, b + 1, b);
    }
  }
}

/** Profil arrondi : congés (longueur de tangente) aux sommets marqués d'un rayon. */
export function roundedProfile(nodes: readonly (readonly [number, number, number?])[], maxStep = 0.2, steps = 5): RevPoint[] {
  const out: RevPoint[] = [];
  const n = nodes.length;
  const pts = nodes.map((p) => [p[0], p[1]] as const);
  const t: number[] = nodes.map((p, i) => {
    const r = p[2] ?? 0;
    if (r <= 0 || i === 0 || i === n - 1) return 0;
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    return Math.min(r, 0.45 * Math.hypot(b[0] - a[0], b[1] - a[1]), 0.45 * Math.hypot(c[0] - b[0], c[1] - b[1]));
  });
  const push = (x: number, r: number) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - x, last[1] - r) > 1e-7) out.push([x, Math.max(0, r)]);
  };
  for (let i = 0; i < n; i++) {
    const b = pts[i]!;
    if (t[i]! > 0) {
      const a = pts[i - 1]!;
      const c = pts[i + 1]!;
      const la = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const lc = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      const A: P2 = [b[0] + ((a[0] - b[0]) / la) * t[i]!, b[1] + ((a[1] - b[1]) / la) * t[i]!];
      const C: P2 = [b[0] + ((c[0] - b[0]) / lc) * t[i]!, b[1] + ((c[1] - b[1]) / lc) * t[i]!];
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        const w0 = (1 - u) * (1 - u);
        const w1 = 2 * (1 - u) * u;
        const w2 = u * u;
        push(w0 * A[0] + w1 * b[0] + w2 * C[0], w0 * A[1] + w1 * b[1] + w2 * C[1]);
      }
    } else {
      push(b[0], b[1]);
    }
    // Subdivision des segments longs (normales lissées correctement le long du profil).
    if (i < n - 1) {
      const c = pts[i + 1]!;
      const start = out[out.length - 1]!;
      const seg = Math.hypot(c[0] - start[0], c[1] - start[1]) - t[i + 1]!;
      const m = Math.floor(seg / maxStep);
      if (m > 1 && seg > 0) {
        const dx = (c[0] - start[0]) / Math.hypot(c[0] - start[0], c[1] - start[1]);
        const dr = (c[1] - start[1]) / Math.hypot(c[0] - start[0], c[1] - start[1]);
        for (let k = 1; k < m; k++) push(start[0] + (dx * seg * k) / m, start[1] + (dr * seg * k) / m);
      }
    }
  }
  return out;
}

// --- Faces planes percées -----------------------------------------------------------------------

export interface PlaneFrame {
  origin: V3;
  u: V3;
  v: V3;
  normal: V3;
}

/** Repère de plan perpendiculaire à X (face d'extrémité) : u = +Y, v = +Z. */
export const planeX = (x: number, normalSign: 1 | -1): PlaneFrame => ({
  origin: [x, 0, 0],
  u: [0, 1, 0],
  v: [0, 0, 1],
  normal: [normalSign, 0, 0],
});

/** Face plane (contour + trous) triangulée. `uv` : fonction des coordonnées 2D. */
export function planarFace(
  mb: MeshBuilder,
  outer: readonly P2[],
  holes: readonly (readonly P2[])[],
  f: PlaneFrame,
  uv: (p: P2) => P2 = (p) => [p[0], p[1]],
): void {
  const o = oriented(outer, true);
  const hs = holes.map((h) => oriented(h, false));
  const tris = THREE.ShapeUtils.triangulateShape(
    o.map(([x, y]) => new THREE.Vector2(x, y)),
    hs.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))),
  );
  const all = [...o, ...hs.flat()];
  const base = mb.vertexCount;
  for (const p of all) {
    const [a, b] = p;
    const [tu, tv] = uv(p);
    mb.vertex(
      f.origin[0] + a * f.u[0] + b * f.v[0],
      f.origin[1] + a * f.u[1] + b * f.v[1],
      f.origin[2] + a * f.u[2] + b * f.v[2],
      f.normal[0],
      f.normal[1],
      f.normal[2],
      tu,
      tv,
    );
  }
  for (const t of tris) mb.tri(base + t[0]!, base + t[1]!, base + t[2]!);
}

/** Anneau plan (rayons r0 < r1, même échantillonnage angulaire que `revolve`). */
export function annulus(mb: MeshBuilder, x: number, r0: number, r1: number, segments: number, normalSign: 1 | -1): void {
  const base = mb.vertexCount;
  for (let j = 0; j <= segments; j++) {
    const phi = (j / segments) * Math.PI * 2;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    mb.vertex(x, r0 * c, r0 * s, normalSign, 0, 0, j / segments, 0);
    mb.vertex(x, r1 * c, r1 * s, normalSign, 0, 0, j / segments, 1);
  }
  for (let j = 0; j < segments; j++) {
    const a = base + j * 2;
    if (r0 > 1e-9) mb.quad(a, a + 1, a + 3, a + 2);
    else mb.tri(a, a + 1, a + 3);
  }
}

// --- Extrusion arrondie -------------------------------------------------------------------------

export interface ExtrudeOptions {
  /** Rayon d'arrondi (ou de chanfrein si `segments` = 1) aux deux extrémités. */
  round0?: number;
  round1?: number;
  segments?: number;
  capGroup?: number;
  sideGroup?: number;
  /** UV des faces : coordonnées 2D → UV (défaut : identité en mm). `side` = 0 début, 1 fin. */
  capUV?: (p: P2, side: 0 | 1) => P2;
  /** Faces de début/fin à omettre (pièces empilées). */
  skipCap0?: boolean;
  skipCap1?: boolean;
  /** Trous borgnes sur les faces : centre, rayon, profondeur, face (0 début, 1 fin), chanfrein. */
  blindHoles?: readonly { c: P2; r: number; depth: number; side: 0 | 1; chamfer?: number; segments?: number }[];
}

/**
 * Extrusion le long de Z (z0 → z1) d'un contour extérieur et de trous traversants, arêtes
 * arrondies aux deux bouts (normales analytiques). Les contours sont réorientés
 * automatiquement ; ils doivent être lisses (congés) là où l'arrondi est demandé.
 */
export function extrude(
  mb: MeshBuilder,
  outer: readonly P2[],
  holes: readonly (readonly P2[])[],
  z0: number,
  z1: number,
  opts: ExtrudeOptions = {},
): void {
  const contours = [oriented(outer, true), ...holes.map((h) => oriented(h, false))];
  const seg = Math.max(1, opts.segments ?? 3);
  const r0 = Math.max(0, opts.round0 ?? 0);
  const r1 = Math.max(0, opts.round1 ?? 0);
  const capUV = opts.capUV ?? ((p: P2) => p);
  // Anneaux d'arrondi : β de 0 (face) à π/2 (flanc).
  const rings: { inset: number; z: number; nz: number; nside: number }[] = [];
  const addEnd = (r: number, start: boolean) => {
    const steps = r > 0 ? seg : 0;
    for (let k = 0; k <= steps; k++) {
      const beta = steps === 0 ? Math.PI / 2 : ((start ? k : steps - k) / steps) * (Math.PI / 2);
      const inset = r * (1 - Math.sin(beta));
      const dz = r * (1 - Math.cos(beta));
      rings.push({
        inset,
        z: start ? z0 + dz : z1 - dz,
        nz: (start ? -1 : 1) * Math.cos(beta),
        nside: Math.sin(beta),
      });
    }
  };
  addEnd(r0, true);
  addEnd(r1, false);
  mb.setGroup(opts.sideGroup ?? 0);
  const insetContours: P2[][][] = [[], []];
  for (const pts of contours) {
    const { normals, miter } = vertexNormals(pts);
    const n = pts.length;
    // Abscisse curviligne (u).
    const s: number[] = [0];
    for (let i = 1; i <= n; i++) {
      const a = pts[i - 1]!;
      const b = pts[i % n]!;
      s.push(s[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const base = mb.vertexCount;
    rings.forEach((ring) => {
      for (let i = 0; i <= n; i++) {
        const ii = i % n;
        const p = pts[ii]!;
        const nn = normals[ii]!;
        const k = ring.inset * miter[ii]!;
        mb.vertex(
          p[0] - nn[0] * k,
          p[1] - nn[1] * k,
          ring.z,
          nn[0] * ring.nside,
          nn[1] * ring.nside,
          ring.nz,
          s[i]!,
          ring.z - z0,
        );
      }
    });
    for (let rI = 0; rI < rings.length - 1; rI++) {
      for (let i = 0; i < n; i++) {
        const a = base + rI * (n + 1) + i;
        const b = base + (rI + 1) * (n + 1) + i;
        mb.quad(a, a + 1, b + 1, b);
      }
    }
    const first = rings[0]!;
    const last = rings[rings.length - 1]!;
    insetContours[0]!.push(pts.map((p, i) => [p[0] - normals[i]![0] * first.inset * miter[i]!, p[1] - normals[i]![1] * first.inset * miter[i]!] as P2));
    insetContours[1]!.push(pts.map((p, i) => [p[0] - normals[i]![0] * last.inset * miter[i]!, p[1] - normals[i]![1] * last.inset * miter[i]!] as P2));
  }
  // Faces (avec trous borgnes éventuels).
  mb.setGroup(opts.capGroup ?? 0);
  for (const sideIdx of [0, 1] as const) {
    if ((sideIdx === 0 && opts.skipCap0) || (sideIdx === 1 && opts.skipCap1)) continue;
    const [o, ...h] = insetContours[sideIdx]!;
    const blind = (opts.blindHoles ?? []).filter((b) => b.side === sideIdx);
    const extraHoles = blind.map((b) => circle(b.c[0], b.c[1], b.r + (b.chamfer ?? 0), b.segments ?? 24));
    const z = sideIdx === 0 ? z0 : z1;
    planarFace(mb, o!, [...h, ...extraHoles], { origin: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, sideIdx === 0 ? -1 : 1] }, (p) =>
      capUV(p, sideIdx),
    );
    for (const b of blind) {
      const ch = b.chamfer ?? 0;
      const into = sideIdx === 0 ? 1 : -1;
      // Paroi du trou (normales vers l'axe du trou), chanfrein d'entrée, fond conique (foret 118°).
      const tipDepth = b.r / Math.tan((59 * Math.PI) / 180);
      const prof: RevPoint[] = [
        [0, b.r + ch],
        [ch, b.r],
        [b.depth, b.r],
        [b.depth + tipDepth, 0],
      ];
      const hb = new MeshBuilder();
      revolveInner(hb, prof, b.segments ?? 24);
      mb.append(hb, basis([b.c[0], b.c[1], z], [0, 0, into], [1, 0, 0], [0, into, 0]));
    }
  }
}

/** Révolution à normales tournées vers l'axe (paroi intérieure d'un trou). */
export function revolveInner(mb: MeshBuilder, profile: readonly RevPoint[], segments: number): void {
  const start = mb.vertexCount;
  revolve(mb, profile, { segments });
  // Les profils de trous sont décrits de l'entrée vers le fond : on force la normale vers l'axe.
  for (let i = start; i < mb.vertexCount; i++) {
    const y = mb.positions[i * 3 + 1]!;
    const z = mb.positions[i * 3 + 2]!;
    const ny = mb.normals[i * 3 + 1]!;
    const nz = mb.normals[i * 3 + 2]!;
    if (ny * y + nz * z > 0) {
      mb.normals[i * 3] = -mb.normals[i * 3]!;
      mb.normals[i * 3 + 1] = -ny;
      mb.normals[i * 3 + 2] = -nz;
    }
  }
}

// --- Tubes ---------------------------------------------------------------------------------------

/** Repères de transport parallèle le long d'une polyligne (n × 3). */
export function transportFrames(points: ArrayLike<number>, count: number): { T: V3[]; N: V3[]; B: V3[] } {
  const T: V3[] = [];
  const N: V3[] = [];
  const B: V3[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(count - 1, i + 1);
    let tx = points[b * 3]! - points[a * 3]!;
    let ty = points[b * 3 + 1]! - points[a * 3 + 1]!;
    let tz = points[b * 3 + 2]! - points[a * 3 + 2]!;
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l;
    ty /= l;
    tz /= l;
    T.push([tx, ty, tz]);
  }
  // Normale initiale : perpendiculaire à T, la plus stable possible.
  const t0 = T[0]!;
  const ref: V3 = Math.abs(t0[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let n = cross(t0, ref);
  n = normalize(n);
  for (let i = 0; i < count; i++) {
    const t = T[i]!;
    if (i > 0) {
      // Projection de la normale précédente sur le plan normal courant.
      const d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
      n = normalize([n[0] - d * t[0], n[1] - d * t[1], n[2] - d * t[2]]);
    }
    N.push(n);
    B.push(normalize(cross(t, n)));
  }
  return { T, N, B };
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export interface TubeOptions {
  radialSegments: number;
  /** Rayon par anneau (sinon `radius`). */
  radii?: ArrayLike<number>;
  radius?: number;
  /** Profil de section non circulaire (fermé, sens trigonométrique), multiplié par le rayon. */
  profile?: readonly P2[];
  capStart?: boolean;
  capEnd?: boolean;
  /** Repères imposés (sinon transport parallèle). */
  frames?: { N: V3[]; B: V3[] };
  /** Longueur réelle d'une unité de v (UV) : v = abscisse / vScale. */
  vScale?: number;
}

/**
 * Tube le long d'une polyligne. Indices ordonnés par segment (anneau i → i+1) : une plage de
 * dessin `6 × radialSegments × k` montre exactement les k premiers segments (débobinage).
 */
export function tube(mb: MeshBuilder, points: ArrayLike<number>, count: number, opts: TubeOptions): { indicesPerSegment: number } {
  const radial = opts.profile ? opts.profile.length : Math.max(3, opts.radialSegments);
  const frames = opts.frames ?? transportFrames(points, count);
  const prof: P2[] =
    opts.profile?.slice() ??
    Array.from({ length: radial }, (_, j) => [Math.cos((j / radial) * Math.PI * 2), Math.sin((j / radial) * Math.PI * 2)] as P2);
  const profNormals = opts.profile ? vertexNormals(oriented(prof, true)).normals : prof;
  const base = mb.vertexCount;
  let s = 0;
  const vScale = opts.vScale ?? 1;
  for (let i = 0; i < count; i++) {
    if (i > 0)
      s += Math.hypot(
        points[i * 3]! - points[(i - 1) * 3]!,
        points[i * 3 + 1]! - points[(i - 1) * 3 + 1]!,
        points[i * 3 + 2]! - points[(i - 1) * 3 + 2]!,
      );
    const r = opts.radii ? opts.radii[i]! : (opts.radius ?? 1);
    const N = frames.N[i]!;
    const B = frames.B[i]!;
    const px = points[i * 3]!;
    const py = points[i * 3 + 1]!;
    const pz = points[i * 3 + 2]!;
    for (let j = 0; j <= radial; j++) {
      const jj = j % radial;
      const [a, b] = prof[jj]!;
      const [na, nb] = profNormals[jj]!;
      mb.vertex(
        px + r * (a * N[0] + b * B[0]),
        py + r * (a * N[1] + b * B[1]),
        pz + r * (a * N[2] + b * B[2]),
        na * N[0] + nb * B[0],
        na * N[1] + nb * B[1],
        na * N[2] + nb * B[2],
        j / radial,
        s / vScale,
      );
    }
  }
  for (let i = 0; i < count - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * (radial + 1) + j;
      const b = a + radial + 1;
      mb.quad(a, b, b + 1, a + 1);
    }
  }
  const cap = (i: number, sign: 1 | -1) => {
    const T = frames.N[i]!;
    const Bv = frames.B[i]!;
    const tx = T[1] * Bv[2] - T[2] * Bv[1];
    const ty = T[2] * Bv[0] - T[0] * Bv[2];
    const tz = T[0] * Bv[1] - T[1] * Bv[0];
    const r = opts.radii ? opts.radii[i]! : (opts.radius ?? 1);
    const c = mb.vertex(points[i * 3]!, points[i * 3 + 1]!, points[i * 3 + 2]!, sign * tx, sign * ty, sign * tz, 0.5, 0.5);
    const ring: number[] = [];
    for (let j = 0; j < radial; j++) {
      const [a, b] = prof[j]!;
      ring.push(
        mb.vertex(
          points[i * 3]! + r * (a * T[0] + b * Bv[0]),
          points[i * 3 + 1]! + r * (a * T[1] + b * Bv[1]),
          points[i * 3 + 2]! + r * (a * T[2] + b * Bv[2]),
          sign * tx,
          sign * ty,
          sign * tz,
          0.5 + a * 0.5,
          0.5 + b * 0.5,
        ),
      );
    }
    for (let j = 0; j < radial; j++) mb.tri(c, ring[j]!, ring[(j + 1) % radial]!);
  };
  if (opts.capStart) cap(0, -1);
  if (opts.capEnd) cap(count - 1, 1);
  return { indicesPerSegment: radial * 6 };
}

// --- Filetages hélicoïdaux ------------------------------------------------------------------------

export interface ThreadOptions {
  /** Rayon du sommet (vis) ou du fond (écrou) du filet. */
  majorR: number;
  pitch: number;
  /** Étendue axiale (z0 < z1) le long de Z. */
  z0: number;
  z1: number;
  /** Filetage intérieur (taraudage) : normales vers l'axe. */
  internal?: boolean;
  segmentsPerTurn: number;
  /** Échantillons du profil sur un pas. */
  profileSamples?: number;
  /** Rayon maximal en fonction de z (chanfrein d'entrée, sortie de filet). */
  envelope?: (z: number) => number;
  /** Rayon minimal en fonction de z. */
  floor?: (z: number) => number;
}

/**
 * Profil ISO (60°) d'un filet sur un pas, ζ ∈ [0, 1) : rayon relatif (0 = fond, 1 = sommet),
 * sommets et fonds arrondis.
 */
export function isoThreadProfile(zeta: number): number {
  // Fond de largeur p/4 centré en 0,5 ; sommet de largeur p/8 centré en 0 ; flancs linéaires.
  const z = ((zeta % 1) + 1) % 1;
  const d = Math.abs(z - 0.5); // 0 au fond, 0,5 au sommet
  const rootHalf = 0.125;
  const crestHalf = 0.0625;
  const t = Math.min(1, Math.max(0, (d - rootHalf) / (0.5 - crestHalf - rootHalf)));
  // Lissage des raccords (fond rond, sommet légèrement arrondi).
  return t * t * (3 - 2 * t) * 0.35 + t * 0.65;
}

/**
 * Surface filetée hélicoïdale RÉELLE (profil ISO balayé le long de l'hélice) autour de l'axe Z.
 * Le ruban hélicoïdal est continu d'un tour au suivant ; les extrémités sont bornées par
 * `envelope`/`floor` (chanfrein, sortie de filet).
 */
export function threadSurface(mb: MeshBuilder, o: ThreadOptions): void {
  const h = 0.6134 * o.pitch; // hauteur du filet de vis ISO (17/24 H)
  const minorR = o.internal ? o.majorR - 0.5413 * o.pitch : o.majorR - h;
  const M = o.profileSamples ?? 12;
  const turns = (o.z1 - o.z0) / o.pitch + 2;
  const K = Math.max(4, Math.ceil(turns * o.segmentsPerTurn));
  const thetaStart = -2 * Math.PI;
  const radiusAt = (zeta: number) => {
    const f = isoThreadProfile(zeta);
    // Vis : sommet au grand rayon ; taraudage : sommet (vers l'axe) au petit rayon.
    return o.internal ? o.majorR - (o.majorR - minorR) * f : minorR + (o.majorR - minorR) * f;
  };
  const clampR = (r: number, z: number) => {
    let rr = r;
    if (o.envelope) rr = Math.min(rr, o.envelope(z));
    if (o.floor) rr = Math.max(rr, o.floor(z));
    return rr;
  };
  const pos = (theta: number, zeta: number): V3 => {
    const z = o.z0 + (o.pitch * theta) / (2 * Math.PI) + zeta * o.pitch;
    const zc = Math.min(o.z1, Math.max(o.z0, z));
    const r = clampR(radiusAt(zeta), zc);
    return [r * Math.cos(theta), r * Math.sin(theta), zc];
  };
  const base = mb.vertexCount;
  const eps = 1e-3;
  for (let k = 0; k <= K; k++) {
    const theta = thetaStart + (k / o.segmentsPerTurn) * 2 * Math.PI;
    for (let j = 0; j <= M; j++) {
      const zeta = j / M;
      const p = pos(theta, zeta);
      // Normale : produit vectoriel des dérivées partielles (différences finies).
      const pt = pos(theta + eps, zeta);
      const pz = pos(theta, zeta + eps * 0.5);
      const ax = pt[0] - p[0];
      const ay = pt[1] - p[1];
      const az = pt[2] - p[2];
      const bx = pz[0] - p[0];
      const by = pz[1] - p[1];
      const bz = pz[2] - p[2];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      // Orientation : vers l'extérieur (vis) ou vers l'axe (taraudage).
      const radial = nx * p[0] + ny * p[1];
      if ((radial < 0) !== !!o.internal) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      if (Math.hypot(nx, ny, nz) < 1e-12) {
        nx = o.internal ? -p[0] : p[0];
        ny = o.internal ? -p[1] : p[1];
        nz = 0;
      }
      mb.vertex(p[0], p[1], p[2], nx, ny, nz, k / o.segmentsPerTurn, (theta / (2 * Math.PI)) + zeta);
    }
  }
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < M; j++) {
      const a = base + k * (M + 1) + j;
      const b = a + M + 1;
      mb.quad(a, a + 1, b + 1, b);
    }
  }
}

// --- Surfaces paramétriques ------------------------------------------------------------------------

/**
 * Grille paramétrique (u, v) ∈ [0,1]² → point. Normales par différences finies, orientées selon
 * `outward(p, n)` si fourni (retourne vrai si la normale doit être inversée).
 */
export function gridSurface(
  mb: MeshBuilder,
  nu: number,
  nv: number,
  fn: (u: number, v: number) => V3,
  opts: { wrapU?: boolean; flip?: (p: V3, n: V3) => boolean; uvScale?: P2 } = {},
): void {
  const base = mb.vertexCount;
  const du = 1e-4;
  const scale = opts.uvScale ?? [1, 1];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const p = fn(u, v);
      const pu = fn(opts.wrapU ? (u + du) % 1 : Math.min(1, u + du), v);
      const pm = fn(opts.wrapU ? (u - du + 1) % 1 : Math.max(0, u - du), v);
      const pv = fn(u, Math.min(1, v + du));
      const pw = fn(u, Math.max(0, v - du));
      const ax = pu[0] - pm[0];
      const ay = pu[1] - pm[1];
      const az = pu[2] - pm[2];
      const bx = pv[0] - pw[0];
      const by = pv[1] - pw[1];
      const bz = pv[2] - pw[2];
      let n: V3 = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      if (opts.flip?.(p, n)) n = [-n[0], -n[1], -n[2]];
      mb.vertex(p[0], p[1], p[2], n[0], n[1], n[2], u * scale[0], v * scale[1]);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i;
      const b = a + nu + 1;
      mb.quad(a, a + 1, b + 1, b);
    }
  }
}

/** Sphère UV (billes, gouttes) centrée à l'origine. */
export function sphere(mb: MeshBuilder, r: number, seg: number, rings: number, squash: V3 = [1, 1, 1]): void {
  const base = mb.vertexCount;
  for (let j = 0; j <= rings; j++) {
    const v = j / rings;
    const th = v * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const ph = u * Math.PI * 2;
      const nx = Math.sin(th) * Math.cos(ph);
      const ny = Math.cos(th);
      const nz = Math.sin(th) * Math.sin(ph);
      mb.vertex(r * nx * squash[0], r * ny * squash[1], r * nz * squash[2], nx / squash[0], ny / squash[1], nz / squash[2], u, v);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i;
      const b = a + seg + 1;
      if (j !== 0) mb.tri(a, b, a + 1);
      if (j !== rings - 1) mb.tri(a + 1, b, b + 1);
    }
  }
}

/** Boîte à arêtes arrondies (extrusion d'un rectangle arrondi le long de Z, faces arrondies). */
export function roundedBox(mb: MeshBuilder, w: number, h: number, d: number, r: number, rz: number, maxStep = 0.1): void {
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw * 0.95, hh * 0.95);
  const pts: P2[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    const n = Math.max(2, Math.ceil(((Math.PI / 2) * rr) / maxStep));
    for (let k = 0; k <= n; k++) {
      const a = a0 + (k / n) * (Math.PI / 2);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  };
  corner(hw - rr, -hh + rr, -Math.PI / 2);
  corner(hw - rr, hh - rr, 0);
  corner(-hw + rr, hh - rr, Math.PI / 2);
  corner(-hw + rr, -hh + rr, Math.PI);
  extrude(mb, pts, [], -d / 2, d / 2, { round0: rz, round1: rz, segments: 3 });
}
