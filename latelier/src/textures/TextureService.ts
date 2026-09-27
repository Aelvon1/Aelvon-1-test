/**
 * Service de textures procédurales (côté thread principal).
 *
 * Répartit les requêtes sur un petit pool de workers et retourne immédiatement une
 * `DataTexture` vide (version 0 : le renderer utilise sa texture par défaut tant que les
 * pixels ne sont pas arrivés). À réception, l'image est remplacée et `needsUpdate` levé ;
 * les mipmaps sont générées par le GPU et le filtrage anisotrope est réglé au maximum.
 */
import * as THREE from 'three/webgpu';
import type { TextureRequest, TextureService } from './types';

interface Pending {
  texture: THREE.DataTexture;
  resolve: (texture: THREE.Texture) => void;
  reject: (error: Error) => void;
  promise: Promise<THREE.Texture>;
  started: number;
}

interface WorkerResponse {
  id: number;
  data?: Uint8ClampedArray;
  width?: number;
  height?: number;
  error?: string;
}

export class WorkerTextureService implements TextureService {
  private readonly workers: Worker[] = [];
  private readonly load: number[] = [];
  private readonly byKey = new Map<string, THREE.DataTexture>();
  private readonly promises = new Map<string, Promise<THREE.Texture>>();
  private readonly pendingById = new Map<number, Pending & { key: string; worker: number }>();
  private readonly idleWaiters: (() => void)[] = [];
  private nextId = 1;

  constructor(
    readonly maxAnisotropy: number,
    workerCount = defaultWorkerCount(),
  ) {
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(new URL('./texture.worker.ts', import.meta.url), {
        type: 'module',
        name: `textures-${i}`,
      });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.onMessage(event.data);
      worker.onerror = (event) => console.error('[TextureService] Erreur du worker :', event.message);
      this.workers.push(worker);
      this.load.push(0);
    }
  }

  get(request: TextureRequest): THREE.Texture {
    const cached = this.byKey.get(request.key);
    if (cached) return cached;

    const texture = new THREE.DataTexture(null, 1, 1);
    texture.name = request.key;
    texture.colorSpace = request.colorSpace === 'linear' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    const wrap =
      request.wrap === 'clamp'
        ? THREE.ClampToEdgeWrapping
        : request.wrap === 'mirror'
          ? THREE.MirroredRepeatWrapping
          : THREE.RepeatWrapping;
    texture.wrapS = wrap;
    texture.wrapT = wrap;
    const mipmaps = request.mipmaps !== false;
    texture.generateMipmaps = mipmaps;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.anisotropy = request.anisotropy === false ? 1 : this.maxAnisotropy;
    texture.flipY = false;
    texture.unpackAlignment = 4;
    this.byKey.set(request.key, texture);

    const id = this.nextId++;
    const worker = this.pickWorker();
    let resolve!: (t: THREE.Texture) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<THREE.Texture>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Évite les rejets non gérés : l'erreur est journalisée dans onMessage.
    promise.catch(() => undefined);
    this.promises.set(request.key, promise);
    this.pendingById.set(id, {
      texture,
      resolve,
      reject,
      promise,
      started: performance.now(),
      key: request.key,
      worker,
    });
    this.load[worker] = (this.load[worker] ?? 0) + request.width * request.height;
    this.workers[worker]!.postMessage({
      id,
      generator: request.generator,
      width: Math.max(1, Math.round(request.width)),
      height: Math.max(1, Math.round(request.height)),
      params: request.params ?? {},
      seed: request.seed ?? hashString(request.key),
    });
    return texture;
  }

  ready(key: string): Promise<THREE.Texture> {
    return this.promises.get(key) ?? Promise.reject(new Error(`Texture inconnue : « ${key} ».`));
  }

  whenIdle(): Promise<void> {
    if (this.pendingById.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  pending(): number {
    return this.pendingById.size;
  }

  disposeScope(prefix: string): void {
    for (const [key, texture] of [...this.byKey]) {
      if (!key.startsWith(prefix)) continue;
      texture.dispose();
      this.byKey.delete(key);
      this.promises.delete(key);
    }
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    for (const texture of this.byKey.values()) texture.dispose();
    this.byKey.clear();
  }

  private pickWorker(): number {
    let best = 0;
    for (let i = 1; i < this.load.length; i++) if ((this.load[i] ?? 0) < (this.load[best] ?? 0)) best = i;
    return best;
  }

  private onMessage(message: WorkerResponse): void {
    const pending = this.pendingById.get(message.id);
    if (!pending) return;
    this.pendingById.delete(message.id);
    const w = message.width ?? 1;
    const h = message.height ?? 1;
    this.load[pending.worker] = Math.max(0, (this.load[pending.worker] ?? 0) - w * h);

    if (message.error || !message.data) {
      const error = new Error(message.error ?? 'Réponse vide du worker de textures.');
      console.error(`[TextureService] « ${pending.key} » :`, error.message);
      pending.reject(error);
    } else if (this.byKey.get(pending.key) === pending.texture) {
      const texture = pending.texture;
      texture.image = { data: new Uint8Array(message.data.buffer), width: w, height: h };
      texture.needsUpdate = true;
      pending.resolve(texture);
    } else {
      // Texture libérée entre-temps (changement d'objet) : on ignore le résultat.
      pending.reject(new Error(`Texture « ${pending.key} » libérée avant la fin de sa génération.`));
    }

    if (this.pendingById.size === 0) {
      const waiters = this.idleWaiters.splice(0);
      for (const waiter of waiters) waiter();
    }
  }
}

function defaultWorkerCount(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(3, cores - 1));
}

/** Hachage de chaîne → graine 32 bits (FNV-1a). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
