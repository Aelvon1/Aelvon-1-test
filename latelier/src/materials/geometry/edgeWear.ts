/**
 * Attributs géométriques d'usure, lus par les masques TSL (`materials/tsl/wear.ts`) :
 * - `edgeWear` (float 0..1) : arêtes CONVEXES (angle dièdre), là où la peinture s'use ;
 * - `cavity`   (float 0..1) : plis CONCAVES, là où crasse et rouille s'accumulent ;
 * - `occlusion` (float, 1 = dégagé, 0 = enfoui) : occlusion ambiante par sommet (lancers de
 *   rayons sur un BVH), pour les recoins profonds (tiroirs, dessous d'étagères).
 *
 * Les valeurs sont PAR SOMMET : la géométrie doit être assez découpée (chanfreins, congés,
 * segments) pour que l'interpolation dessine une bande d'usure et non une face entière. Les
 * sommets dupliqués (arêtes vives, coutures d'UV) sont soudés par position le temps du calcul.
 * Calcul CPU (à faire une fois, à la construction ; résultat mis en cache avec la géométrie).
 */
import * as THREE from 'three/webgpu';
import { MeshBVH } from 'three-mesh-bvh';
import { mulberry32 } from '../../textures/generators/random';

export interface EdgeWearOptions {
  /** Angle dièdre (degrés) en dessous duquel une arête ne s'use pas (défaut 8). */
  minAngle?: number;
  /** Angle dièdre (degrés) donnant une usure maximale (défaut 40). */
  maxAngle?: number;
  /** Nombre de passes de diffusion vers les sommets voisins (élargit la bande, défaut 1). */
  spread?: number;
  /** Atténuation par passe de diffusion (défaut 0,6). */
  falloff?: number;
  /** Les bords libres (arêtes à une seule face) comptent comme des arêtes usées (défaut vrai). */
  boundaryAsEdge?: boolean;
  /** Tolérance de soudure des sommets (m, défaut 1e-6). */
  weldTolerance?: number;
}

export interface EdgeWearResult {
  /** Valeurs par sommet (même ordre que l'attribut `position`). */
  edgeWear: Float32Array;
  cavity: Float32Array;
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Soude les sommets par position ; retourne l'indice soudé de chaque sommet. */
export function weldByPosition(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, tolerance: number): {
  welded: Int32Array;
  count: number;
} {
  const inv = 1 / Math.max(tolerance, 1e-12);
  const map = new Map<string, number>();
  const welded = new Int32Array(position.count);
  let count = 0;
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * inv)},${Math.round(position.getY(i) * inv)},${Math.round(position.getZ(i) * inv)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = count++;
      map.set(key, id);
    }
    welded[i] = id;
  }
  return { welded, count };
}

/**
 * Calcule les valeurs d'usure d'arêtes et de creux (angle dièdre signé entre faces adjacentes).
 * Fonction pure (aucune modification de la géométrie) : voir `applyEdgeWear` pour l'écriture des
 * attributs.
 */
export function computeEdgeWear(geometry: THREE.BufferGeometry, options: EdgeWearOptions = {}): EdgeWearResult {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('computeEdgeWear : attribut « position » manquant.');
  const minAngle = ((options.minAngle ?? 8) * Math.PI) / 180;
  const maxAngle = ((options.maxAngle ?? 40) * Math.PI) / 180;
  const { welded, count } = weldByPosition(position, options.weldTolerance ?? 1e-6);
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : position.count / 3;
  const vertexOf = (t: number, k: number): number => (index ? index.getX(t * 3 + k) : t * 3 + k);

  // Positions soudées et normales de faces.
  const wp = new Float32Array(count * 3);
  for (let i = 0; i < position.count; i++) {
    const w = welded[i]!;
    wp[w * 3] = position.getX(i);
    wp[w * 3 + 1] = position.getY(i);
    wp[w * 3 + 2] = position.getZ(i);
  }
  const faceNormal = new Float32Array(triCount * 3);
  const faceVerts = new Int32Array(triCount * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const i0 = welded[vertexOf(t, 0)]!;
    const i1 = welded[vertexOf(t, 1)]!;
    const i2 = welded[vertexOf(t, 2)]!;
    faceVerts[t * 3] = i0;
    faceVerts[t * 3 + 1] = i1;
    faceVerts[t * 3 + 2] = i2;
    a.fromArray(wp, i0 * 3);
    b.fromArray(wp, i1 * 3).sub(a);
    c.fromArray(wp, i2 * 3).sub(a);
    b.cross(c);
    const len = b.length();
    if (len > 0) b.divideScalar(len);
    faceNormal[t * 3] = b.x;
    faceNormal[t * 3 + 1] = b.y;
    faceNormal[t * 3 + 2] = b.z;
  }

  // Arêtes → faces adjacentes.
  const edges = new Map<number, number[]>();
  const edgeKey = (i: number, j: number) => (i < j ? i * count + j : j * count + i);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const i = faceVerts[t * 3 + k]!;
      const j = faceVerts[t * 3 + ((k + 1) % 3)]!;
      if (i === j) continue;
      const key = edgeKey(i, j);
      const list = edges.get(key);
      if (list) list.push(t);
      else edges.set(key, [t]);
    }
  }

  const convex = new Float32Array(count);
  const concave = new Float32Array(count);
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const d = new THREE.Vector3();
  const boundary = options.boundaryAsEdge !== false;
  for (const [key, faces] of edges) {
    const i = Math.floor(key / count);
    const j = key - i * count;
    neighbors[i]!.push(j);
    neighbors[j]!.push(i);
    if (faces.length < 2) {
      if (boundary) {
        convex[i] = Math.max(convex[i]!, 1);
        convex[j] = Math.max(convex[j]!, 1);
      }
      continue;
    }
    const f1 = faces[0]!;
    const f2 = faces[1]!;
    n1.fromArray(faceNormal, f1 * 3);
    n2.fromArray(faceNormal, f2 * 3);
    const angle = Math.acos(Math.min(1, Math.max(-1, n1.dot(n2))));
    if (angle < 1e-4) continue;
    // Sommet de f2 hors de l'arête : sous le plan de f1 → arête convexe.
    let other = faceVerts[f2 * 3]!;
    for (let k = 0; k < 3; k++) {
      const v = faceVerts[f2 * 3 + k]!;
      if (v !== i && v !== j) other = v;
    }
    d.fromArray(wp, other * 3).sub(a.fromArray(wp, i * 3));
    const value = smooth(minAngle, maxAngle, angle);
    if (n1.dot(d) < 0) {
      convex[i] = Math.max(convex[i]!, value);
      convex[j] = Math.max(convex[j]!, value);
    } else {
      concave[i] = Math.max(concave[i]!, value);
      concave[j] = Math.max(concave[j]!, value);
    }
  }

  // Diffusion : la bande d'usure déborde un peu sur les sommets voisins.
  const falloff = options.falloff ?? 0.6;
  const spreadPass = (field: Float32Array) => {
    const next = new Float32Array(field);
    for (let v = 0; v < count; v++) {
      let best = field[v]!;
      for (const nb of neighbors[v]!) best = Math.max(best, field[nb]! * falloff);
      next[v] = best;
    }
    field.set(next);
  };
  for (let s = 0; s < (options.spread ?? 1); s++) {
    spreadPass(convex);
    spreadPass(concave);
  }

  const edgeWear = new Float32Array(position.count);
  const cavity = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    edgeWear[i] = convex[welded[i]!]!;
    cavity[i] = concave[welded[i]!]!;
  }
  return { edgeWear, cavity };
}

/** Calcule et écrit les attributs `edgeWear` et `cavity` sur la géométrie (retournée). */
export function applyEdgeWear<G extends THREE.BufferGeometry>(geometry: G, options: EdgeWearOptions = {}): G {
  const { edgeWear, cavity } = computeEdgeWear(geometry, options);
  geometry.setAttribute('edgeWear', new THREE.BufferAttribute(edgeWear, 1));
  geometry.setAttribute('cavity', new THREE.BufferAttribute(cavity, 1));
  return geometry;
}

export interface OcclusionOptions {
  /** Rayons par sommet (défaut 24). */
  samples?: number;
  /** Portée des rayons (m) : au-delà, un obstacle n'occulte plus (défaut 0,05). */
  radius?: number;
  /** Décalage de départ le long de la normale (m, défaut 1e-4). */
  bias?: number;
  seed?: number;
}

/**
 * Occlusion ambiante par sommet (1 = dégagé, 0 = enfoui) par lancers de rayons dans l'hémisphère
 * (distribution en cosinus) sur un BVH de la géométrie elle-même. Coût : sommets × `samples`
 * lancers — à réserver aux pièces de décor (quelques milliers de sommets).
 * Nécessite l'attribut `normal`. La géométrie d'entrée n'est pas modifiée (BVH sur une copie).
 */
export function computeOcclusion(geometry: THREE.BufferGeometry, options: OcclusionOptions = {}): Float32Array {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) throw new Error('computeOcclusion : attributs « position » et « normal » requis.');
  const samples = Math.max(1, Math.round(options.samples ?? 24));
  const radius = options.radius ?? 0.05;
  const bias = options.bias ?? 1e-4;
  const proxy = new THREE.BufferGeometry();
  proxy.setAttribute('position', position.clone());
  const index = geometry.getIndex();
  if (index) proxy.setIndex(index.clone());
  const bvh = new MeshBVH(proxy);
  const rand = mulberry32(options.seed ?? 1234);
  const out = new Float32Array(position.count);
  const ray = new THREE.Ray();
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const dir = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    n.set(normal.getX(i), normal.getY(i), normal.getZ(i)).normalize();
    // Repère tangent arbitraire autour de la normale.
    t1.set(Math.abs(n.x) > 0.9 ? 0 : 1, Math.abs(n.x) > 0.9 ? 1 : 0, 0).cross(n).normalize();
    t2.crossVectors(n, t1);
    let hits = 0;
    for (let s = 0; s < samples; s++) {
      const u = rand();
      const phi = rand() * Math.PI * 2;
      const r = Math.sqrt(u);
      dir
        .copy(t1)
        .multiplyScalar(r * Math.cos(phi))
        .addScaledVector(t2, r * Math.sin(phi))
        .addScaledVector(n, Math.sqrt(1 - u));
      ray.origin.set(position.getX(i), position.getY(i), position.getZ(i)).addScaledVector(n, bias);
      ray.direction.copy(dir);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, radius);
      if (hit) hits++;
    }
    out[i] = 1 - hits / samples;
  }
  proxy.dispose();
  return out;
}

/** Calcule et écrit l'attribut `occlusion` sur la géométrie (retournée). */
export function applyOcclusion<G extends THREE.BufferGeometry>(geometry: G, options: OcclusionOptions = {}): G {
  geometry.setAttribute('occlusion', new THREE.BufferAttribute(computeOcclusion(geometry, options), 1));
  return geometry;
}
