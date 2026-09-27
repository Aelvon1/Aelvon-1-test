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
  /** Écart angulaire (degrés) en dessous duquel une surface ne s'use pas (défaut 8). */
  minAngle?: number;
  /** Écart angulaire (degrés) donnant une usure maximale (défaut 40). */
  maxAngle?: number;
  /**
   * Rayon de voisinage (m) : largeur de la bande d'usure autour d'une arête. Les voisins
   * directs (1-anneau) comptent toujours. Défaut : 3 % de la diagonale de la boîte englobante.
   */
  radius?: number;
  /** Passes de diffusion supplémentaires vers les voisins (adoucit la bande, défaut 0). */
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
export function weldByPosition(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  tolerance: number,
): {
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
 * Calcule les valeurs d'usure d'arêtes (convexes) et de creux (concaves).
 *
 * Méthode : normales de sommets soudés (moyenne des faces pondérée par l'aire), puis pour chaque
 * sommet, écart angulaire maximal avec les normales de ses voisins situés à moins de `radius`
 * (parcours du maillage). Le signe vient de la divergence des normales le long du déplacement :
 * (nⱼ − nᵢ)·(pⱼ − pᵢ) > 0 → convexe. Contrairement au seul angle dièdre entre faces voisines,
 * ce critère reconnaît aussi un congé finement segmenté (chaque segment ne tourne que de
 * quelques degrés). Fonction pure : voir `applyEdgeWear` pour l'écriture des attributs.
 */
export function computeEdgeWear(
  geometry: THREE.BufferGeometry,
  options: EdgeWearOptions = {},
): EdgeWearResult {
  const position = geometry.getAttribute('position');
  if (!position) throw new Error('computeEdgeWear : attribut « position » manquant.');
  const minAngle = ((options.minAngle ?? 8) * Math.PI) / 180;
  const maxAngle = ((options.maxAngle ?? 40) * Math.PI) / 180;
  const { welded, count } = weldByPosition(position, options.weldTolerance ?? 1e-6);
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : position.count / 3;
  const vertexOf = (t: number, k: number): number => (index ? index.getX(t * 3 + k) : t * 3 + k);

  // Positions soudées.
  const wp = new Float32Array(count * 3);
  for (let i = 0; i < position.count; i++) {
    const w = welded[i]!;
    wp[w * 3] = position.getX(i);
    wp[w * 3 + 1] = position.getY(i);
    wp[w * 3 + 2] = position.getZ(i);
  }
  let radius = options.radius;
  if (radius === undefined) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    radius = box ? box.min.distanceTo(box.max) * 0.03 : 0;
  }
  const radius2 = radius * radius;

  // Normales soudées (somme des normales de faces non normalisées = pondération par l'aire),
  // arêtes du maillage et nombre de faces par arête (bords libres).
  const wn = new Float32Array(count * 3);
  const edgeFaces = new Map<number, number>();
  const edgeKey = (i: number, j: number) => (i < j ? i * count + j : j * count + i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tri = [0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    tri[0] = welded[vertexOf(t, 0)]!;
    tri[1] = welded[vertexOf(t, 1)]!;
    tri[2] = welded[vertexOf(t, 2)]!;
    a.fromArray(wp, tri[0] * 3);
    b.fromArray(wp, tri[1] * 3).sub(a);
    c.fromArray(wp, tri[2] * 3).sub(a);
    b.cross(c);
    for (let k = 0; k < 3; k++) {
      const v = tri[k]!;
      wn[v * 3] = wn[v * 3]! + b.x;
      wn[v * 3 + 1] = wn[v * 3 + 1]! + b.y;
      wn[v * 3 + 2] = wn[v * 3 + 2]! + b.z;
      const i = tri[k]!;
      const j = tri[(k + 1) % 3]!;
      if (i === j) continue;
      const key = edgeKey(i, j);
      edgeFaces.set(key, (edgeFaces.get(key) ?? 0) + 1);
    }
  }
  for (let v = 0; v < count; v++) {
    const len = Math.hypot(wn[v * 3]!, wn[v * 3 + 1]!, wn[v * 3 + 2]!);
    if (len > 0) {
      wn[v * 3] = wn[v * 3]! / len;
      wn[v * 3 + 1] = wn[v * 3 + 1]! / len;
      wn[v * 3 + 2] = wn[v * 3 + 2]! / len;
    }
  }

  // Adjacence (listes compactes).
  const degree = new Int32Array(count);
  for (const key of edgeFaces.keys()) {
    const i = Math.floor(key / count);
    degree[i]!++;
    degree[key - i * count]!++;
  }
  const offsets = new Int32Array(count + 1);
  for (let v = 0; v < count; v++) offsets[v + 1] = offsets[v]! + degree[v]!;
  const adjacency = new Int32Array(offsets[count]!);
  const fill = offsets.slice(0, count);
  const convex = new Float32Array(count);
  const concave = new Float32Array(count);
  const boundary = options.boundaryAsEdge !== false;
  for (const [key, faces] of edgeFaces) {
    const i = Math.floor(key / count);
    const j = key - i * count;
    adjacency[fill[i]!++] = j;
    adjacency[fill[j]!++] = i;
    if (faces < 2 && boundary) {
      convex[i] = 1;
      convex[j] = 1;
    }
  }

  // Parcours limité au rayon : écart angulaire maximal signé.
  const stamp = new Int32Array(count).fill(-1);
  const stack: number[] = [];
  for (let v = 0; v < count; v++) {
    const px = wp[v * 3]!;
    const py = wp[v * 3 + 1]!;
    const pz = wp[v * 3 + 2]!;
    const nx = wn[v * 3]!;
    const ny = wn[v * 3 + 1]!;
    const nz = wn[v * 3 + 2]!;
    let bestConvex = 0;
    let bestConcave = 0;
    stamp[v] = v;
    stack.length = 0;
    // Le 1-anneau compte toujours, même au-delà du rayon.
    for (let k = offsets[v]!; k < offsets[v + 1]!; k++) {
      const u = adjacency[k]!;
      stamp[u] = v;
      stack.push(u);
    }
    while (stack.length) {
      const u = stack.pop()!;
      const dx = wp[u * 3]! - px;
      const dy = wp[u * 3 + 1]! - py;
      const dz = wp[u * 3 + 2]! - pz;
      const dnx = wn[u * 3]! - nx;
      const dny = wn[u * 3 + 1]! - ny;
      const dnz = wn[u * 3 + 2]! - nz;
      const dot = Math.min(1, Math.max(-1, nx * wn[u * 3]! + ny * wn[u * 3 + 1]! + nz * wn[u * 3 + 2]!));
      const angle = Math.acos(dot);
      const divergence = dnx * dx + dny * dy + dnz * dz;
      if (divergence > 0) bestConvex = Math.max(bestConvex, angle);
      else if (divergence < 0) bestConcave = Math.max(bestConcave, angle);
      for (let k = offsets[u]!; k < offsets[u + 1]!; k++) {
        const w = adjacency[k]!;
        if (stamp[w] === v) continue;
        const ex = wp[w * 3]! - px;
        const ey = wp[w * 3 + 1]! - py;
        const ez = wp[w * 3 + 2]! - pz;
        if (ex * ex + ey * ey + ez * ez > radius2) continue;
        stamp[w] = v;
        stack.push(w);
      }
    }
    convex[v] = Math.max(convex[v]!, smooth(minAngle, maxAngle, bestConvex));
    concave[v] = smooth(minAngle, maxAngle, bestConcave);
  }

  // Diffusion optionnelle : la bande déborde un peu sur les sommets voisins.
  const falloff = options.falloff ?? 0.6;
  const spreadPass = (field: Float32Array) => {
    const next = new Float32Array(field);
    for (let v = 0; v < count; v++) {
      let best = field[v]!;
      for (let k = offsets[v]!; k < offsets[v + 1]!; k++)
        best = Math.max(best, field[adjacency[k]!]! * falloff);
      next[v] = best;
    }
    field.set(next);
  };
  for (let s = 0; s < (options.spread ?? 0); s++) {
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
export function computeOcclusion(
  geometry: THREE.BufferGeometry,
  options: OcclusionOptions = {},
): Float32Array {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal)
    throw new Error('computeOcclusion : attributs « position » et « normal » requis.');
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
    t1.set(Math.abs(n.x) > 0.9 ? 0 : 1, Math.abs(n.x) > 0.9 ? 1 : 0, 0)
      .cross(n)
      .normalize();
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
export function applyOcclusion<G extends THREE.BufferGeometry>(
  geometry: G,
  options: OcclusionOptions = {},
): G {
  geometry.setAttribute('occlusion', new THREE.BufferAttribute(computeOcclusion(geometry, options), 1));
  return geometry;
}
