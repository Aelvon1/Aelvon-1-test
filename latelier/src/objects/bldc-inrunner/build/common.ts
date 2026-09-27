/**
 * Utilitaires communs aux constructions : cotes partagées (calculées une fois par chargement),
 * finesse selon la qualité, maillages et instances.
 */
import * as THREE from 'three/webgpu';
import type { BuildContext } from '../../types';
import { deriveDimensions, OBJECT_ID, type BldcDims, type BldcParams } from '../params';
import { buildWindingLayout, type WindingLayout } from '../windingLayout';
import { MM, type MeshBuilder } from './geom';

export type Ctx = BuildContext<BldcParams>;

/** Cotes dérivées (mises en cache dans `ctx.shared` pour tout le chargement). */
export function dims(ctx: Ctx): BldcDims {
  const cached = ctx.shared.bldcDims as BldcDims | undefined;
  if (cached) return cached;
  const d = deriveDimensions(ctx.params);
  ctx.shared.bldcDims = d;
  return d;
}

/** Tracé du bobinage (mis en cache). */
export function layout(ctx: Ctx): WindingLayout {
  const key = `bldcLayout${ctx.quality}`;
  const cached = ctx.shared[key] as WindingLayout | undefined;
  if (cached) return cached;
  const l = buildWindingLayout(dims(ctx), ctx.quality);
  ctx.shared[key] = l;
  return l;
}

/** Clé de cache de géométrie dépendant des paramètres qui modifient la forme. */
export function geoKey(ctx: Ctx, name: string, ...extra: (string | number | boolean)[]): string {
  const p = ctx.params;
  return [
    OBJECT_ID,
    name,
    p.format,
    p.slotPole,
    p.kv,
    p.sensors,
    p.leads,
    p.lamination,
    ctx.quality,
    ...extra,
  ].join('|');
}

/** Finesse angulaire selon la qualité. */
export const segs = (ctx: Ctx, base: number): number =>
  Math.max(8, Math.round(base * [0.5, 0.75, 1, 1.35][ctx.quality]!));

/** Maillage nommé. */
export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  name: string,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  return m;
}

/** Maillage instancié à partir d'une liste de matrices (repère de chaque instance = pivot). */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  matrices: readonly THREE.Matrix4[],
  name: string,
): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
  m.instanceMatrix.needsUpdate = true;
  m.name = name;
  m.computeBoundingBox();
  m.computeBoundingSphere();
  return m;
}

/** Géométrie partagée construite par un `MeshBuilder` (mm → m). */
export function cachedGeometry(ctx: Ctx, key: string, make: () => MeshBuilder): THREE.BufferGeometry {
  return ctx.geometry.get(key, () => make().build());
}

/** Matériau de l'anodisation choisie. */
export function anodized(ctx: Ctx): THREE.Material {
  return ctx.materials.get(`alu.anodized.${ctx.params.anodize}`);
}

/** Groupe nommé placé en (x, y, z) mm. */
export function group(name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x * MM, y * MM, z * MM);
  return g;
}
