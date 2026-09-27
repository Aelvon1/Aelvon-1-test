/**
 * Outils de construction partagés par le moteur d'inspection, le banc de prévisualisation et
 * les tests : cache de géométries, contexte de construction, enregistrement des matériaux
 * propres à un objet, normalisation du résultat de `build`.
 */
import type * as THREE from 'three/webgpu';
import type { MaterialLibrary } from '../materials/types';
import type { TextureService } from '../textures/types';
import type {
  BuildContext,
  GeometryCache,
  ObjectDef,
  ObjectParams,
  PartBuild,
  PartDef,
  PrepareContext,
} from './types';

/** Cache de géométries d'un objet ; `dispose()` libère tout. */
export class SimpleGeometryCache implements GeometryCache {
  private readonly map = new Map<string, THREE.BufferGeometry>();

  get<G extends THREE.BufferGeometry>(key: string, factory: () => G): G {
    const existing = this.map.get(key);
    if (existing) return existing as G;
    const created = factory();
    created.userData.cached = true;
    this.map.set(key, created);
    return created;
  }

  get size(): number {
    return this.map.size;
  }

  dispose(): void {
    for (const g of this.map.values()) g.dispose();
    this.map.clear();
  }
}

/** Préfixe obligatoire des clés de textures et des matériaux propres à un objet. */
export const objectScope = (objectId: string): string => `${objectId}/`;

/**
 * Enregistre les matériaux déclarés par l'objet sous `<id objet>/<clé>` et, si la clé est libre,
 * sous `<clé>` (accès court). Retourne la liste des identifiants enregistrés.
 */
export function registerObjectMaterials(def: ObjectDef<ObjectParams>, library: MaterialLibrary): string[] {
  const ids: string[] = [];
  for (const [key, factory] of Object.entries(def.materials ?? {})) {
    const scoped = `${objectScope(def.id)}${key}`;
    library.register(scoped, factory, { replace: true });
    ids.push(scoped);
    if (!library.has(key)) {
      library.register(key, factory);
      ids.push(key);
    }
  }
  return ids;
}

export interface BuildServices {
  materials: MaterialLibrary;
  textures: TextureService;
  quality: 0 | 1 | 2 | 3;
  maxAnisotropy: number;
}

export function createPrepareContext<P extends ObjectParams>(
  params: P,
  services: BuildServices,
  shared: Record<string, unknown>,
  progress: (value: number, label?: string) => void = () => undefined,
): PrepareContext<P> {
  return {
    params,
    textures: services.textures,
    materials: services.materials,
    shared,
    quality: services.quality,
    maxAnisotropy: services.maxAnisotropy,
    progress,
  };
}

export function createBuildContext<P extends ObjectParams>(
  def: PartDef<P>,
  params: P,
  services: BuildServices,
  geometry: GeometryCache,
  shared: Record<string, unknown>,
): BuildContext<P> {
  return {
    params,
    def,
    materials: services.materials,
    textures: services.textures,
    geometry,
    shared,
    quality: services.quality,
    maxAnisotropy: services.maxAnisotropy,
  };
}

/** Normalise le résultat de `PartDef.build` en `PartBuild`. */
export function normalizeBuild(result: THREE.Object3D | PartBuild): PartBuild {
  return (result as THREE.Object3D).isObject3D === true
    ? { object: result as THREE.Object3D }
    : (result as PartBuild);
}
