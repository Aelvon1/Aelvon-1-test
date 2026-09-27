/**
 * Implémentation de la bibliothèque de matériaux : fabriques enregistrées par identifiant,
 * instances partagées créées à la demande, variantes non partagées, libération par portée.
 */
import * as THREE from 'three/webgpu';
import type { MaterialFactory, MaterialFactoryContext, MaterialLibrary, MaterialOverrides } from './types';

export class MaterialLibraryImpl implements MaterialLibrary {
  private readonly factories = new Map<string, MaterialFactory>();
  private readonly instances = new Map<string, THREE.Material>();

  constructor(private readonly ctx: MaterialFactoryContext) {}

  register(id: string, factory: MaterialFactory, options?: { replace?: boolean }): void {
    if (this.factories.has(id) && !options?.replace) {
      throw new Error(`Matériau déjà enregistré : « ${id} ».`);
    }
    this.factories.set(id, factory);
    const existing = this.instances.get(id);
    if (existing) {
      existing.dispose();
      this.instances.delete(id);
    }
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  get(id: string): THREE.Material {
    const cached = this.instances.get(id);
    if (cached) return cached;
    const factory = this.factories.get(id);
    if (!factory)
      throw new Error(`Matériau inconnu : « ${id} ». Identifiants disponibles : ${this.ids().join(', ')}`);
    const material = factory(this.ctx);
    if (!material.name) material.name = id;
    material.userData.libraryId = id;
    material.userData.shared = true;
    this.instances.set(id, material);
    return material;
  }

  variant(id: string, overrides: MaterialOverrides): THREE.Material {
    const base = this.get(id);
    const material = base.clone();
    material.name = overrides.name ?? `${id} (variante)`;
    material.userData = { ...base.userData, shared: false, variantOf: id };
    const m = material as THREE.MeshPhysicalNodeMaterial;
    if (overrides.color !== undefined && 'color' in m) m.color = new THREE.Color(overrides.color);
    if (overrides.map !== undefined && 'map' in m) m.map = overrides.map;
    if (overrides.normalMap !== undefined && 'normalMap' in m) m.normalMap = overrides.normalMap;
    if (overrides.roughness !== undefined && 'roughness' in m) m.roughness = overrides.roughness;
    if (overrides.metalness !== undefined && 'metalness' in m) m.metalness = overrides.metalness;
    if (overrides.emissive !== undefined && 'emissive' in m) m.emissive = new THREE.Color(overrides.emissive);
    if (overrides.emissiveIntensity !== undefined && 'emissiveIntensity' in m)
      m.emissiveIntensity = overrides.emissiveIntensity;
    if (overrides.opacity !== undefined) material.opacity = overrides.opacity;
    if (overrides.transparent !== undefined) material.transparent = overrides.transparent;
    if (overrides.side !== undefined) material.side = overrides.side;
    material.needsUpdate = true;
    return material;
  }

  disposeScope(prefix: string): void {
    for (const id of [...this.factories.keys()]) {
      if (!id.startsWith(prefix)) continue;
      this.instances.get(id)?.dispose();
      this.instances.delete(id);
      this.factories.delete(id);
    }
  }

  ids(): string[] {
    return [...this.factories.keys()].sort();
  }
}
