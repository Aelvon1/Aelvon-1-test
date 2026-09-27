/**
 * Lot de géométrie statique fusionnée PAR MATÉRIAU.
 *
 * Chaque pièce du décor est ajoutée avec une clé de matériau et une matrice de placement ; à la
 * construction, toutes les pièces d'une même clé (et des mêmes réglages d'ombre) sont fusionnées
 * en une seule géométrie (`mergeGeometries`) → un appel de dessin par matériau.
 *
 * Normalisation de chaque pièce avant fusion :
 * - géométrie non indexée, attributs `position`, `normal`, `uv`, `edge` uniquement ;
 * - UV « boîte » en espace monde (1 unité UV = 1 m) : projection selon l'axe dominant de la
 *   normale, continue d'une pièce à l'autre, densité de texels constante ; décalage pseudo-aléatoire
 *   par pièce pour que deux planches voisines ne montrent pas la même portion de texture ;
 * - attribut `edge` (0..1) : 1 sur les biseaux des boîtes arrondies (normale locale en diagonale),
 *   0 sur les faces planes. Les matériaux du décor s'en servent pour éclaircir/écailler les arêtes.
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface BatchPieceOptions {
  /** Projection UV : `box` (monde, en mètres, défaut) ou `keep` (UV d'origine conservées). */
  uv?: 'box' | 'keep';
  /** Échelle des UV (défaut 1 : une unité par mètre). */
  uvScale?: number;
  /** Rotation de 90° des UV (ex. fil du bois vertical sur un montant). */
  uvRotate?: boolean;
  /** Calcul de l'usure des arêtes : `box` (normales locales en diagonale) ou `none`. */
  edge?: 'box' | 'none';
  castShadow?: boolean;
  receiveShadow?: boolean;
}

interface Bucket {
  material: string;
  castShadow: boolean;
  receiveShadow: boolean;
  geometries: THREE.BufferGeometry[];
}

/** Seuil de normalisation de l'usure : 1 − cos(45°). */
const EDGE_NORMALIZE = 1 / (1 - Math.SQRT1_2);

const _normal = new THREE.Vector3();

/** Hachage déterministe 0..1 (décalage des UV par pièce). */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class StaticBatch {
  private readonly buckets = new Map<string, Bucket>();
  private pieceCounter = 0;

  /** Nombre de pièces ajoutées (statistiques). */
  get pieceCount(): number {
    return this.pieceCounter;
  }

  /**
   * Ajoute une pièce. La géométrie est CONSOMMÉE (transformée puis libérée) : ne pas la réutiliser.
   * @param material identifiant de matériau (bibliothèque ou `world.*`)
   * @param geometry géométrie en repère local
   * @param matrix placement (repère monde du lot)
   */
  add(
    material: string,
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4 | null,
    options: BatchPieceOptions = {},
  ): void {
    const piece = normalizePiece(geometry, matrix, options, this.pieceCounter++);
    const castShadow = options.castShadow ?? true;
    const receiveShadow = options.receiveShadow ?? true;
    const key = `${material}|${castShadow ? 1 : 0}${receiveShadow ? 1 : 0}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, castShadow, receiveShadow, geometries: [] };
      this.buckets.set(key, bucket);
    }
    bucket.geometries.push(piece);
  }

  /**
   * Fusionne chaque groupe et crée un maillage par groupe.
   * @param resolve fournit le matériau pour une clé
   */
  build(resolve: (material: string) => THREE.Material, name = 'Lot statique'): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const bucket of this.buckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      for (const g of bucket.geometries) g.dispose();
      if (!merged) {
        console.warn(`[StaticBatch] Fusion impossible pour « ${bucket.material} ».`);
        continue;
      }
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, resolve(bucket.material));
      mesh.name = `${name} · ${bucket.material}`;
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }

  /** Libère les géométries en attente (construction interrompue). */
  dispose(): void {
    for (const bucket of this.buckets.values()) for (const g of bucket.geometries) g.dispose();
    this.buckets.clear();
  }
}

/** Prépare une pièce : non indexée, transformée, UV monde, attribut d'usure. */
export function normalizePiece(
  source: THREE.BufferGeometry,
  matrix: THREE.Matrix4 | null,
  options: BatchPieceOptions,
  seed: number,
): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  if (geometry !== source) source.dispose();
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

  const count = geometry.getAttribute('position').count;
  // Usure des arêtes calculée sur les normales LOCALES (avant rotation).
  const edge = new Float32Array(count);
  if ((options.edge ?? 'box') === 'box') {
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < count; i++) {
      _normal.fromBufferAttribute(normals, i);
      const m = Math.max(Math.abs(_normal.x), Math.abs(_normal.y), Math.abs(_normal.z));
      edge[i] = Math.min(1, Math.max(0, (1 - m) * EDGE_NORMALIZE));
    }
  }
  if (matrix) geometry.applyMatrix4(matrix);

  if ((options.uv ?? 'box') === 'box' || !geometry.getAttribute('uv')) {
    applyBoxUV(geometry, options.uvScale ?? 1, options.uvRotate ?? false, seed);
  }

  // Seuls les attributs communs sont conservés (condition de `mergeGeometries`).
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name);
  }
  geometry.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
  geometry.morphAttributes = {};
  geometry.clearGroups();
  return geometry;
}

/** Projection UV « boîte » en espace monde (mètres), décalée par pièce. */
export function applyBoxUV(geometry: THREE.BufferGeometry, scale: number, rotate: boolean, seed: number): void {
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  const du = hash01(seed * 2.17 + 0.5) * 7.3;
  const dv = hash01(seed * 3.91 + 1.5) * 5.9;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) {
      u = nx > 0 ? -z : z;
      v = y;
    } else if (ay >= az) {
      u = x;
      v = ny > 0 ? -z : z;
    } else {
      u = nz > 0 ? x : -x;
      v = y;
    }
    if (rotate) {
      const t = u;
      u = v;
      v = -t;
    }
    uv[i * 2] = u * scale + du;
    uv[i * 2 + 1] = v * scale + dv;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
