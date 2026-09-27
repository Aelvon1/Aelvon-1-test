/**
 * Services factices pour construire des objets sous Node (tests) : textures vides immédiates
 * et bibliothèque de matériaux de base.
 */
import * as THREE from 'three/webgpu';
import type { TextureRequest, TextureService } from '../../src/textures/types';
import { MaterialLibraryImpl } from '../../src/materials/MaterialLibrary';
import { registerBaseMaterials } from '../../src/materials/library';
import type { BuildServices } from '../../src/objects/buildSupport';

export class FakeTextureService implements TextureService {
  readonly maxAnisotropy = 16;
  readonly requests: TextureRequest[] = [];
  private readonly map = new Map<string, THREE.Texture>();

  get(request: TextureRequest): THREE.Texture {
    this.requests.push(request);
    let t = this.map.get(request.key);
    if (!t) {
      t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
      t.name = request.key;
      this.map.set(request.key, t);
    }
    return t;
  }
  ready(key: string): Promise<THREE.Texture> {
    const t = this.map.get(key);
    return t ? Promise.resolve(t) : Promise.reject(new Error(`Texture inconnue : ${key}`));
  }
  whenIdle(): Promise<void> {
    return Promise.resolve();
  }
  pending(): number {
    return 0;
  }
  disposeScope(prefix: string): void {
    for (const key of [...this.map.keys()]) if (key.startsWith(prefix)) this.map.delete(key);
  }
}

export function createFakeServices(): BuildServices & { textures: FakeTextureService } {
  const textures = new FakeTextureService();
  const materials = new MaterialLibraryImpl({ textures, quality: 2, maxAnisotropy: 16 });
  registerBaseMaterials(materials);
  return { materials, textures, quality: 2, maxAnisotropy: 16 };
}
