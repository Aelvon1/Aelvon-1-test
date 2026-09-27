/**
 * Chargeurs d'assets optionnels : modèles glTF (compression Draco ou Meshopt) et textures KTX2.
 *
 * Tout le contenu actuel est généré par le code ; ce module prépare l'arrivée d'assets externes
 * SANS modifier le moteur : un objet charge ses fichiers dans son `prepare()` (asynchrone), les
 * range dans `ctx.shared`, puis ses fonctions `build()` (synchrones) clonent les scènes chargées.
 *
 *   prepare: async (ctx) => {
 *     const gltf = await getAssetLoaders().loadGltf(new URL('./carter.glb', import.meta.url).href);
 *     ctx.shared.carter = gltf.scene;
 *   },
 *
 * Les décodeurs (Draco, Basis) sont servis sous `<base>/decoders/…` (plugin de `vite.config.ts`)
 * et ne sont téléchargés qu'au premier fichier compressé.
 */
import type * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class AssetLoaders {
  private gltfLoader: GLTFLoader | null = null;
  private ktx2Loader: KTX2Loader | null = null;
  private dracoLoader: DRACOLoader | null = null;
  private readonly base: string;

  constructor(private readonly renderer: THREE.WebGPURenderer) {
    this.base = `${import.meta.env.BASE_URL}decoders/`;
  }

  /** Chargeur KTX2 (transcodage Basis vers le format compressé supporté par le GPU). */
  ktx2(): KTX2Loader {
    if (!this.ktx2Loader) {
      this.ktx2Loader = new KTX2Loader().setTranscoderPath(`${this.base}basis/`);
      this.ktx2Loader.detectSupport(this.renderer);
    }
    return this.ktx2Loader;
  }

  /** Chargeur glTF configuré pour Draco, Meshopt et les textures KTX2 embarquées. */
  gltf(): GLTFLoader {
    if (!this.gltfLoader) {
      this.dracoLoader = new DRACOLoader().setDecoderPath(`${this.base}draco/`);
      this.gltfLoader = new GLTFLoader()
        .setDRACOLoader(this.dracoLoader)
        .setMeshoptDecoder(MeshoptDecoder)
        .setKTX2Loader(this.ktx2());
    }
    return this.gltfLoader;
  }

  loadGltf(url: string): Promise<GLTF> {
    return this.gltf().loadAsync(url);
  }

  loadKtx2(url: string): Promise<THREE.CompressedTexture> {
    return this.ktx2().loadAsync(url) as Promise<THREE.CompressedTexture>;
  }

  dispose(): void {
    this.dracoLoader?.dispose();
    this.ktx2Loader?.dispose();
  }
}

let instance: AssetLoaders | null = null;

/** Initialise les chargeurs (appelé par l'application une fois le renderer prêt). */
export function initAssetLoaders(renderer: THREE.WebGPURenderer): AssetLoaders {
  instance?.dispose();
  instance = new AssetLoaders(renderer);
  return instance;
}

/** Chargeurs partagés ; lève une erreur explicite s'ils ne sont pas initialisés (tests Node). */
export function getAssetLoaders(): AssetLoaders {
  if (!instance) throw new Error('Chargeurs d’assets non initialisés (initAssetLoaders).');
  return instance;
}
