/**
 * Géométries procédurales des outils (m) : révolutions à cannelures, balayages de polygones à
 * facettes franches (clés six pans), tubes à rayon variable (poignées, câbles), profils extrudés
 * à épaisseur évolutive (mors de pinces, levier), lofts de sections (lame de tournevis plat).
 *
 * Toutes les fonctions sont pures (aucun état global) et produisent des géométries indexées ou
 * non indexées avec `position`, `normal`, `uv` ; les normales sont analytiques ou lissées selon
 * un angle de pli. Les UV des révolutions suivent la convention three (u = circonférence).
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/** Point de profil de révolution : [rayon, y]. Un point répété crée une arête vive. */
export type ProfilePoint = readonly [number, number];

export interface RevolveOptions {
  /** Nombre de cannelures (0 = révolution simple). */
  lobes?: number;
  /** Profondeur relative des cannelures (fraction du rayon). */
  lobeDepth?: number;
  /** Finesse des creux (exposant ; plus grand = creux plus étroits). */
  lobeSharpness?: number;
  /** Zone cannelée [y0, y1] (fondu sur `lobeFade`). Défaut : tout le profil. */
  lobeRange?: readonly [number, number];
  lobeFade?: number;
  /** Rayon relatif r(θ) personnalisé (multiplie le profil), prioritaire sur les cannelures. */
  radial?: (theta: number, y: number) => number;
  /** Déphasage angulaire (rad). */
  phase?: number;
}

const TAU = Math.PI * 2;

/**
 * Révolution d'un profil autour de Y (même repère que `LatheGeometry` : x = r·sin θ, z = r·cos θ).
 * Le profil va du bas vers le haut (y croissant) pour des normales extérieures.
 */
export function revolve(
  profile: readonly ProfilePoint[],
  segments: number,
  o: RevolveOptions = {},
): THREE.BufferGeometry {
  const P = profile.length;
  const S = Math.max(3, Math.round(segments));
  const positions = new Float32Array((S + 1) * P * 3);
  const uvs = new Float32Array((S + 1) * P * 2);
  // Abscisse curviligne du profil (coordonnée v).
  const arc = new Float64Array(P);
  for (let j = 1; j < P; j++) {
    const a = profile[j - 1]!;
    const b = profile[j]!;
    arc[j] = arc[j - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = arc[P - 1]! || 1;
  const lobes = o.lobes ?? 0;
  const depth = o.lobeDepth ?? 0.08;
  const sharp = o.lobeSharpness ?? 4;
  const range = o.lobeRange;
  const fade = o.lobeFade ?? 0.004;
  const phase = o.phase ?? 0;
  const lobeWeight = (y: number): number => {
    if (!range) return 1;
    const w0 = THREE.MathUtils.smoothstep(y, range[0], range[0] + fade);
    const w1 = 1 - THREE.MathUtils.smoothstep(y, range[1] - fade, range[1]);
    return Math.min(w0, w1);
  };
  for (let i = 0; i <= S; i++) {
    const theta = (i / S) * TAU + phase;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    for (let j = 0; j < P; j++) {
      const [r0, y] = profile[j]!;
      let k = 1;
      if (o.radial) k = o.radial(theta, y);
      else if (lobes > 0) {
        const groove = Math.pow(0.5 + 0.5 * Math.cos(lobes * theta), sharp);
        k = 1 - depth * groove * lobeWeight(y);
      }
      const r = r0 * k;
      const idx = i * P + j;
      positions[idx * 3] = r * sin;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = r * cos;
      uvs[idx * 2] = i / S;
      uvs[idx * 2 + 1] = arc[j]! / total;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j;
      const b = a + P;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, c, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  // Couture : normales moyennées entre la première et la dernière colonne.
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let j = 0; j < P; j++) {
    const a = j;
    const b = S * P + j;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  // Pôles (rayon nul) : normale axiale, sinon l'ombrage en étoile trahit la couture.
  for (let j = 0; j < P; j++) {
    if (profile[j]![0] > 1e-9) continue;
    const up = j === 0 ? -1 : j === P - 1 ? 1 : 0;
    if (up === 0) continue;
    for (let i = 0; i <= S; i++) n.setXYZ(i * P + j, 0, up, 0);
  }
  return g;
}

/** Repère d'une section de balayage. */
export interface SweepFrame {
  origin: THREE.Vector3;
  /** Tangente (direction d'avancement). */
  tangent: THREE.Vector3;
  /** Axes de la section (coordonnées x et y du polygone). */
  u: THREE.Vector3;
  v: THREE.Vector3;
  /** Échelle du polygone (chanfreins). */
  scale?: number;
  /** Inclinaison axiale de la normale (0 = paroi, 1 = chanfrein à 45°), signe = sens. */
  tilt?: number;
}

/**
 * Balayage d'un polygone convexe (sens trigonométrique dans le plan (u, v)) le long d'une suite
 * de repères. Chaque facette a ses propres sommets (arêtes vives), normales analytiques, bouchons
 * plats aux extrémités.
 */
export function sweepPolygon(
  polygon: readonly THREE.Vector2[],
  frames: readonly SweepFrame[],
  caps: { start?: boolean; end?: boolean } = { start: true, end: true },
): THREE.BufferGeometry {
  const K = polygon.length;
  const F = frames.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  // Longueur cumulée (coordonnée u des UV).
  const along: number[] = [0];
  for (let f = 1; f < F; f++) along.push(along[f - 1]! + frames[f]!.origin.distanceTo(frames[f - 1]!.origin));
  let perimeter = 0;
  for (let k = 0; k < K; k++) perimeter += polygon[k]!.distanceTo(polygon[(k + 1) % K]!);
  let around = 0;
  const point = (frame: SweepFrame, q: THREE.Vector2): THREE.Vector3 => {
    const s = frame.scale ?? 1;
    return p
      .copy(frame.origin)
      .addScaledVector(frame.u, q.x * s)
      .addScaledVector(frame.v, q.y * s);
  };
  for (let k = 0; k < K; k++) {
    const a = polygon[k]!;
    const b = polygon[(k + 1) % K]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const el = Math.hypot(ex, ey) || 1;
    // Normale extérieure 2D d'un polygone trigonométrique.
    const mx = ey / el;
    const my = -ex / el;
    const base = pos.length / 3;
    for (let f = 0; f < F; f++) {
      const fr = frames[f]!;
      nrm
        .copy(fr.u)
        .multiplyScalar(mx)
        .addScaledVector(fr.v, my)
        .addScaledVector(fr.tangent, fr.tilt ?? 0)
        .normalize();
      for (const q of [a, b]) {
        point(fr, q);
        pos.push(p.x, p.y, p.z);
        nor.push(nrm.x, nrm.y, nrm.z);
      }
      uv.push(along[f]!, around / perimeter, along[f]!, (around + el) / perimeter);
    }
    for (let f = 0; f < F - 1; f++) {
      const i0 = base + f * 2;
      idx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
    }
    around += el;
  }
  const cap = (fr: SweepFrame, sign: 1 | -1) => {
    const base = pos.length / 3;
    nrm.copy(fr.tangent).multiplyScalar(sign).normalize();
    for (const q of polygon) {
      point(fr, q);
      pos.push(p.x, p.y, p.z);
      nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(q.x, q.y);
    }
    for (let k = 1; k < K - 1; k++) idx.push(base, base + k, base + k + 1);
  };
  if (caps.start !== false) cap(frames[0]!, -1);
  if (caps.end !== false) cap(frames[F - 1]!, 1);
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  orientTriangles(g);
  return g;
}

/**
 * Remet les triangles dans le sens des normales déclarées (le sens dépend de l'orientation du
 * repère de balayage) : chaque triangle dont la normale géométrique s'oppose à la normale moyenne
 * de ses sommets est retourné.
 */
function orientTriangles(g: THREE.BufferGeometry): void {
  const index = g.getIndex()!;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const i0 = index.getX(t);
    const i1 = index.getX(t + 1);
    const i2 = index.getX(t + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1).sub(a);
    c.fromBufferAttribute(pos, i2).sub(a);
    b.cross(c);
    if (b.lengthSq() < 1e-30) continue;
    n.set(
      nor.getX(i0) + nor.getX(i1) + nor.getX(i2),
      nor.getY(i0) + nor.getY(i1) + nor.getY(i2),
      nor.getZ(i0) + nor.getZ(i1) + nor.getZ(i2),
    );
    if (b.dot(n) < 0) {
      index.setX(t + 1, i2);
      index.setX(t + 2, i1);
    }
  }
  index.needsUpdate = true;
}

/** Hexagone régulier de surplat `s` (plats sur les axes ±x), sens trigonométrique. */
export function hexagon(across: number): THREE.Vector2[] {
  const r = across / Math.sqrt(3);
  const out: THREE.Vector2[] = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    out.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
  }
  return out;
}

/** Rectangle centré (sens trigonométrique). */
export function rectangle(w: number, h: number): THREE.Vector2[] {
  return [
    new THREE.Vector2(-w / 2, -h / 2),
    new THREE.Vector2(w / 2, -h / 2),
    new THREE.Vector2(w / 2, h / 2),
    new THREE.Vector2(-w / 2, h / 2),
  ];
}

export interface TubeOptions {
  /** Rayon selon l'abscisse normalisée u ∈ [0, 1]. */
  radius: (u: number) => number;
  tubularSegments: number;
  radialSegments: number;
  /** Aplatissement de la section (rayon selon la binormale / rayon selon la normale). */
  aspect?: number;
  /** Cannelures longitudinales (poignées) : nombre et profondeur relative. */
  ribs?: number;
  ribDepth?: number;
  /** Repère fixe : axe de référence des sections (sinon repères de Frenet). */
  up?: THREE.Vector3;
  /** Alpha par sommet (fondu d'extrémité) : ajoute un attribut `color` RGBA. */
  alpha?: (u: number) => number;
}

/**
 * Tube à rayon variable le long d'une courbe (poignées, gaines, câbles). Les extrémités se
 * ferment d'elles-mêmes si le rayon y tend vers 0 (bouts arrondis).
 */
export function tubeAlong(curve: THREE.Curve<THREE.Vector3>, o: TubeOptions): THREE.BufferGeometry {
  const T = Math.max(1, Math.round(o.tubularSegments));
  const R = Math.max(3, Math.round(o.radialSegments));
  const aspect = o.aspect ?? 1;
  const frames = curve.computeFrenetFrames(T, false);
  const positions = new Float32Array((T + 1) * (R + 1) * 3);
  const uvs = new Float32Array((T + 1) * (R + 1) * 2);
  const colors = o.alpha ? new Float32Array((T + 1) * (R + 1) * 4) : null;
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const nx = new THREE.Vector3();
  const ny = new THREE.Vector3();
  for (let i = 0; i <= T; i++) {
    const u = i / T;
    curve.getPointAt(u, p);
    if (o.up) {
      curve.getTangentAt(u, tan);
      nx.crossVectors(o.up, tan);
      if (nx.lengthSq() < 1e-12) nx.copy(frames.normals[i]!);
      nx.normalize();
      ny.crossVectors(tan, nx).normalize();
    } else {
      nx.copy(frames.normals[i]!);
      ny.copy(frames.binormals[i]!);
    }
    const r = Math.max(0, o.radius(u));
    const alpha = o.alpha ? o.alpha(u) : 1;
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * TAU;
      let k = 1;
      if (o.ribs) k = 1 - (o.ribDepth ?? 0.06) * Math.pow(0.5 + 0.5 * Math.cos(o.ribs * a), 6);
      const cx = Math.cos(a) * r * k;
      const cy = Math.sin(a) * r * k * aspect;
      const idx = i * (R + 1) + j;
      positions[idx * 3] = p.x + nx.x * cx + ny.x * cy;
      positions[idx * 3 + 1] = p.y + nx.y * cx + ny.y * cy;
      positions[idx * 3 + 2] = p.z + nx.z * cx + ny.z * cy;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = j / R;
      if (colors) colors.set([1, 1, 1, alpha], idx * 4);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < T; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j;
      const b = (i + 1) * (R + 1) + j;
      // (T, N, B) direct : autour × le long = normale extérieure.
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i <= T; i++) {
    const a = i * (R + 1);
    const b = a + R;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  orientTriangles(g);
  return g;
}

export interface ExtrudeOptions {
  /** Épaisseur totale (Z), centrée sur z = 0. */
  depth: number;
  /** Arrondi des arêtes (m). */
  bevel?: number;
  bevelSegments?: number;
  curveSegments?: number;
  /** Facteur d'épaisseur selon (x, y) (effilement des mors, biseau d'un tranchant). */
  thickness?: (x: number, y: number) => number;
  /** Angle de pli des normales (rad). */
  crease?: number;
}

/** Profil plan (XY) extrudé en Z, arêtes arrondies, épaisseur éventuellement évolutive. */
export function extrudeOutline(outline: readonly THREE.Vector2[], o: ExtrudeOptions): THREE.BufferGeometry {
  const bevel = o.bevel ?? 0;
  const shape = new THREE.Shape(outline.map((v) => v.clone()));
  const core = Math.max(1e-5, o.depth - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: o.bevelSegments ?? 2,
    curveSegments: o.curveSegments ?? 8,
  });
  g.translate(0, 0, -core / 2);
  if (o.thickness) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * o.thickness(pos.getX(i), pos.getY(i)));
  }
  return creasedNormals(g, o.crease ?? Math.PI / 5);
}

/**
 * Normales lissées sauf au-delà de l'angle de pli. `toCreasedNormals` regroupe les sommets par
 * position quantifiée au centième d'unité : la géométrie est donc traitée en millimètres.
 */
export function creasedNormals(g: THREE.BufferGeometry, crease: number): THREE.BufferGeometry {
  g.scale(1000, 1000, 1000);
  const out = toCreasedNormals(g, crease);
  out.scale(0.001, 0.001, 0.001);
  if (out !== g) g.dispose();
  return out;
}

/**
 * Loft de sections fermées de même nombre de points (lame de tournevis : cercle → rectangle).
 * Sections ordonnées du bas vers le haut ; bouchon plat optionnel sur la première section.
 */
export function loftRings(
  rings: readonly (readonly THREE.Vector3[])[],
  capStart: boolean,
): THREE.BufferGeometry {
  const N = rings[0]!.length;
  const M = rings.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < M; i++) {
    for (let j = 0; j <= N; j++) {
      const q = rings[i]![j % N]!;
      pos.push(q.x, q.y, q.z);
      uv.push(j / N, i / (M - 1));
    }
  }
  for (let i = 0; i < M - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j;
      const b = a + N + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < M; i++) {
    const a = i * (N + 1);
    const b = a + N;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
  // Sens des normales : vers l'extérieur (centre de chaque section).
  const center = new THREE.Vector3();
  for (const q of rings[0]!) center.add(q);
  center.divideScalar(N);
  const first = rings[0]![0]!.clone().sub(center);
  if (first.dot(new THREE.Vector3(n.getX(0), n.getY(0), n.getZ(0))) < 0) {
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  orientTriangles(g);
  if (capStart) {
    const cap = new THREE.BufferGeometry();
    const cp: number[] = [];
    const cn: number[] = [];
    const cu: number[] = [];
    const ci: number[] = [];
    const ring = rings[0]!;
    const normal = new THREE.Vector3().subVectors(rings[0]![0]!, rings[1]![0]!).normalize();
    // Normale du bouchon : direction de la première section vers l'extérieur du loft.
    const c = new THREE.Vector3();
    for (const q of ring) c.add(q);
    c.divideScalar(N);
    const c1 = new THREE.Vector3();
    for (const q of rings[1]!) c1.add(q);
    c1.divideScalar(N);
    normal.subVectors(c, c1).normalize();
    cp.push(c.x, c.y, c.z);
    cn.push(normal.x, normal.y, normal.z);
    cu.push(0.5, 0.5);
    for (let j = 0; j < N; j++) {
      const q = ring[j]!;
      cp.push(q.x, q.y, q.z);
      cn.push(normal.x, normal.y, normal.z);
      cu.push(0.5 + 0.5 * Math.cos((j / N) * TAU), 0.5 + 0.5 * Math.sin((j / N) * TAU));
    }
    for (let j = 0; j < N; j++) ci.push(0, 1 + j, 1 + ((j + 1) % N));
    cap.setIndex(ci);
    cap.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cap.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3));
    cap.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    orientTriangles(cap);
    const merged = mergeGeometries([g, cap]);
    cap.dispose();
    if (merged) {
      g.dispose();
      g = merged;
    }
  }
  return g;
}

/** Fusionne des géométries de mêmes attributs (libère les sources). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const normalized = parts.map((p) => (p.index ? p : indexed(p)));
  const merged = mergeGeometries(normalized);
  if (!merged) throw new Error('Outils : fusion de géométries impossible (attributs incompatibles).');
  for (const p of parts) p.dispose();
  for (const p of normalized) if (!parts.includes(p)) p.dispose();
  return merged;
}

/** Ajoute un index trivial à une géométrie non indexée (fusion homogène). */
function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  const out = g.clone();
  const idx = new Array<number>(count);
  for (let i = 0; i < count; i++) idx[i] = i;
  out.setIndex(idx);
  return out;
}

/** Ne garde que position/normal/uv (fusion de géométries d'origines diverses). */
export function basicAttributes(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

/** Cylindre (axe Y) de base y0 à y1, bouchons plats — raccourci fréquent. */
export function cylinder(r: number, y0: number, y1: number, segments = 24): THREE.BufferGeometry {
  return revolve(
    [
      [0, y0],
      [r, y0],
      [r, y0],
      [r, y1],
      [r, y1],
      [0, y1],
    ],
    segments,
  );
}

/** Symétrie par rapport au plan YZ, triangles remis dans le bon sens. */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.clone();
  out.scale(-1, 1, 1);
  const index = out.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
  } else {
    const attrs = Object.values(out.attributes);
    for (let i = 0; i < out.getAttribute('position').count; i += 3) {
      for (const attr of attrs) {
        for (let c = 0; c < attr.itemSize; c++) {
          const a = attr.getComponent(i + 1, c);
          attr.setComponent(i + 1, c, attr.getComponent(i + 2, c));
          attr.setComponent(i + 2, c, a);
        }
      }
    }
  }
  return out;
}
