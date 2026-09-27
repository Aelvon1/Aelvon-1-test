/**
 * Lot statique des accessoires : comme `StaticBatch` (fusion PAR MATÉRIAU, UV monde, attribut
 * d'usure `edge`), avec en plus un attribut de teinte par pièce `tint` (vec4) :
 * - matériaux teintés des accessoires (`world.props.paint`, `world.props.plastic`…) :
 *   rgb = couleur (linéaire), a = paramètre du matériau (usure, rugosité : voir `materials.ts`) ;
 * - afficheurs et voyants : x = identifiant, y = paramètre (voir `materials.ts`).
 * Des dizaines d'objets de couleurs différentes tiennent ainsi en UN appel de dessin par matériau.
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizePiece, type BatchPieceOptions } from '../geometry/StaticBatch';

/** Teinte (rgb linéaire + paramètre). */
export type Tint = readonly [number, number, number, number];

export const WHITE_TINT: Tint = [1, 1, 1, 0.5];

const _color = new THREE.Color();

/** Teinte depuis une couleur sRGB hexadécimale (convertie dans l'espace de travail linéaire). */
export function tint(hex: number, param = 0.5): Tint {
  _color.set(hex);
  return [_color.r, _color.g, _color.b, param];
}

/** Teinte brute (données non colorimétriques : identifiants d'afficheurs, de voyants). */
export function rawTint(x: number, y = 0, z = 0, w = 0): Tint {
  return [x, y, z, w];
}

export interface PropPieceOptions extends BatchPieceOptions {
  tint?: Tint;
}

interface Bucket {
  material: string;
  castShadow: boolean;
  receiveShadow: boolean;
  geometries: THREE.BufferGeometry[];
}

export class PropBatch {
  private readonly buckets = new Map<string, Bucket>();
  private pieces = 0;
  private vertices = 0;

  constructor(private readonly seedOffset = 0) {}

  /** Nombre de pièces ajoutées. */
  get pieceCount(): number {
    return this.pieces;
  }

  /** Nombre de sommets (non indexés) accumulés : triangles = sommets / 3. */
  get vertexCount(): number {
    return this.vertices;
  }

  /**
   * Ajoute une pièce (la géométrie est CONSOMMÉE). `matrix` : placement dans le repère monde.
   */
  add(
    material: string,
    geometry: THREE.BufferGeometry,
    matrix: THREE.Matrix4 | null,
    options: PropPieceOptions = {},
  ): void {
    const piece = normalizePiece(geometry, matrix, options, this.seedOffset + this.pieces++);
    const count = piece.getAttribute('position').count;
    const t = options.tint ?? WHITE_TINT;
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      data[i * 4] = t[0];
      data[i * 4 + 1] = t[1];
      data[i * 4 + 2] = t[2];
      data[i * 4 + 3] = t[3];
    }
    piece.setAttribute('tint', new THREE.BufferAttribute(data, 4));
    this.vertices += count;
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

  /** Fusionne chaque groupe (un maillage par matériau et réglage d'ombre). */
  build(resolve: (material: string) => THREE.Material, name: string): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const bucket of this.buckets.values()) {
      const merged = mergeGeometries(bucket.geometries, false);
      for (const g of bucket.geometries) g.dispose();
      if (!merged) {
        console.warn(`[PropBatch] Fusion impossible pour « ${bucket.material} ».`);
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

  dispose(): void {
    for (const bucket of this.buckets.values()) for (const g of bucket.geometries) g.dispose();
    this.buckets.clear();
  }
}
