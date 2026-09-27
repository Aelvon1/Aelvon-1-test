/**
 * Miniatures animées de l'inventaire : pour chaque objet pas encore rendu, construction légère
 * (`Assembly`, qualité réduite, pièces au repos), 24 vues en tour complet dans une cible de rendu
 * (scène séparée, éclairage studio, fond transparent), lecture GPU asynchrone, planche de sprites
 * dans un canvas → URL blob → `store.inventory.thumbnails[id]`, puis libération de l'objet.
 *
 * Étalement : une vue rendue par image (juste avant le rendu principal, état du renderer
 * restauré), lectures GPU en parallèle (au plus 3 en vol), construction par tranches de 8 ms,
 * pipelines compilés en asynchrone (`compileAsync`) avant la première vue : aucune saccade.
 * Rendu à 2× puis réduction 2×2 sur le processeur (pas de MSAA sur ce chemin).
 * Un objet en cours d'inspection n'est pas rendu (matériaux et textures de même portée) : il est
 * reporté à la fermeture de l'inspection.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../../core/context';
import type { Thumbnail } from '../../core/store';
import type { ObjectDef, ObjectParams } from '../../objects/types';
import { Assembly } from '../Assembly';
import { fitDistance, orbitOffset } from '../camera/orbitMath';
import { downsample2x, frameOrigin, readbackRowBytes, sheetLayout, turntableAzimuth } from './spriteSheet';

type AnyDef = ObjectDef<ObjectParams>;

export const THUMBNAIL_FRAMES = 24;
export const THUMBNAIL_SIZE = 192;
/** Suréchantillonnage (le rendu se fait à 2 × 192 px). */
const SUPERSAMPLE = 2;
const THUMB_FOV = 30;
/** Lectures GPU simultanées au plus. */
const MAX_READBACKS = 3;

export interface ThumbnailOptions {
  ctx: AppContext;
  /** Définition d'un objet (identifiant public ou de développement). */
  findDef: (id: string) => AnyDef | undefined;
  /** L'objet est-il ouvert (ou en construction) dans l'inspection ? */
  inUse: (objectId: string) => boolean;
}

const _pos = new THREE.Vector3();
const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _clear = new THREE.Color();

export class Thumbnails {
  private readonly queue: string[] = [];
  private readonly deferred = new Set<string>();
  private readonly done = new Set<string>();
  private running = false;
  private disposed = false;
  private waiters: (() => void)[] = [];
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(THUMB_FOV, 1, 0.001, 20);
  private readonly key = new THREE.DirectionalLight(0xfff2e2, 2.4);
  private readonly fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  private readonly rim = new THREE.DirectionalLight(0xd6e6ff, 2.2);
  private readonly urls: string[] = [];

  constructor(private readonly o: ThumbnailOptions) {
    this.scene.name = 'Miniatures';
    this.scene.add(new THREE.HemisphereLight(0xf4efe6, 0x3a3630, 0.55));
    for (const light of [this.key, this.fill, this.rim]) this.scene.add(light, light.target);
  }

  /** Demande les miniatures manquantes (les objets déjà rendus ou en file sont ignorés). */
  request(objectIds: readonly string[]): void {
    const existing = this.o.ctx.store.getState().inventory.thumbnails;
    for (const id of objectIds) {
      if (existing[id] || this.done.has(id) || this.queue.includes(id) || this.deferred.has(id)) continue;
      this.queue.push(id);
    }
    if (!this.running && this.queue.length > 0) void this.run();
  }

  /** À appeler à chaque image (avant le rendu principal) : cadence le travail. */
  tick(): void {
    if (this.deferred.size > 0) {
      for (const id of [...this.deferred]) {
        if (this.o.inUse(id)) continue;
        this.deferred.delete(id);
        this.queue.push(id);
      }
      if (!this.running && this.queue.length > 0) void this.run();
    }
    const waiters = this.waiters;
    if (waiters.length === 0) return;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  private frame(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private async run(): Promise<void> {
    this.running = true;
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const id = this.queue.shift()!;
        if (this.o.inUse(id)) {
          this.deferred.add(id);
          continue;
        }
        try {
          const result = await this.renderObject(id);
          if (result === 'deferred') this.deferred.add(id);
          else this.done.add(id);
        } catch (error) {
          console.warn(`[Miniatures] « ${id} » : rendu impossible.`, error);
          this.done.add(id);
        }
        await this.frame();
      }
    } finally {
      this.running = false;
    }
  }

  private async renderObject(id: string): Promise<'ok' | 'deferred' | 'skipped'> {
    const { ctx } = this.o;
    const def = this.o.findDef(id);
    if (!def) return 'skipped';
    const engine = ctx.engine;
    const assembly = new Assembly(def, def.defaultParams, {
      materials: ctx.materials,
      textures: ctx.textures,
      // Construction légère : qualité réduite (moins de segments, textures plus petites).
      quality: Math.min(1, engine.quality.level) as 0 | 1,
      maxAnisotropy: engine.maxAnisotropy,
      matCenter: new THREE.Vector3(),
    });
    let rt: THREE.RenderTarget | null = null;
    try {
      if (!(await assembly.build())) return 'skipped';
      if (this.o.inUse(id) || this.disposed) return 'deferred';
      await ctx.textures.whenIdle();
      if (this.o.inUse(id) || this.disposed) return 'deferred';
      this.scene.add(assembly.root);
      assembly.objectBounds(_box).getBoundingSphere(_sphere);
      const layout = sheetLayout(THUMBNAIL_FRAMES, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
      const size = THUMBNAIL_SIZE * SUPERSAMPLE;
      rt = new THREE.RenderTarget(size, size, { depthBuffer: true, generateMipmaps: false });
      rt.texture.name = `Miniature ${id}`;
      const view = def.presentation?.viewDirection ?? [0.3, 0.75, 1];
      const startAzimuth = Math.atan2(view[0], view[2]) + (def.presentation?.rotationY ?? 0);
      const elevation = THREE.MathUtils.clamp(
        Math.atan2(view[1], Math.hypot(view[0], view[2])),
        THREE.MathUtils.degToRad(14),
        THREE.MathUtils.degToRad(38),
      );
      const distance = fitDistance(_sphere.radius, THUMB_FOV, 1, 1.06);
      this.camera.near = Math.max(1e-4, distance - _sphere.radius * 1.5);
      this.camera.far = distance + _sphere.radius * 1.5;
      this.camera.updateProjectionMatrix();
      this.scene.environment = engine.scene.environment;
      this.scene.environmentIntensity = 0.7;
      // Compilation asynchrone des pipelines (même cible que les vues).
      this.placeCamera(startAzimuth, elevation, distance);
      await this.withTarget(rt, () => engine.renderer.compileAsync(this.scene, this.camera));
      const pixels = new Uint8ClampedArray(layout.width * layout.height * 4);
      const flipY = engine.backend === 'webgl2';
      const inFlight: Promise<void>[] = [];
      for (let i = 0; i < THUMBNAIL_FRAMES; i++) {
        await this.frame();
        if (this.o.inUse(id) || this.disposed) return 'deferred';
        this.placeCamera(turntableAzimuth(i, THUMBNAIL_FRAMES, startAzimuth), elevation, distance);
        const target = rt;
        this.withTarget(target, () => engine.renderer.render(this.scene, this.camera));
        const origin = frameOrigin(layout, i);
        const read = engine.renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size).then((data) => {
          const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          const rowBytes =
            bytes.length >= size * size * 4 && engine.backend === 'webgpu'
              ? readbackRowBytes(size, 4, true)
              : size * 4;
          downsample2x(bytes, size, size, rowBytes, pixels, layout.width, origin.x, origin.y, flipY);
        });
        inFlight.push(read);
        if (inFlight.length >= MAX_READBACKS) await inFlight.shift();
      }
      await Promise.all(inFlight);
      const url = await toBlobUrl(pixels, layout.width, layout.height);
      if (!url) return 'skipped';
      this.urls.push(url);
      const thumb: Thumbnail = {
        url,
        frames: layout.frames,
        columns: layout.columns,
        frameWidth: layout.frameWidth,
        frameHeight: layout.frameHeight,
      };
      ctx.store.setState((s) => ({
        inventory: { ...s.inventory, thumbnails: { ...s.inventory.thumbnails, [id]: thumb } },
      }));
      return 'ok';
    } finally {
      assembly.root.removeFromParent();
      this.scene.environment = null;
      // Si l'inspection a ouvert le même objet entre-temps, ses matériaux et textures restent.
      assembly.dispose({ keepScope: this.o.inUse(id) });
      rt?.dispose();
    }
  }

  /** Éclairage studio fixe par rapport à la caméra (l'objet tourne, la lumière ne tourne pas). */
  private placeCamera(azimuth: number, elevation: number, distance: number): void {
    const c = _sphere.center;
    this.camera.position.copy(c).add(orbitOffset(azimuth, elevation, distance, _pos));
    this.camera.lookAt(c);
    this.camera.updateMatrixWorld();
    const r = Math.max(0.05, distance);
    this.key.position.copy(c).add(orbitOffset(azimuth + 0.75, elevation + 0.5, r, _pos));
    this.fill.position.copy(c).add(orbitOffset(azimuth - 1.1, 0.15, r, _pos));
    this.rim.position.copy(c).add(orbitOffset(azimuth + Math.PI + 0.4, 0.45, r, _pos));
    for (const light of [this.key, this.fill, this.rim]) {
      light.target.position.copy(c);
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
    }
  }

  /**
   * Exécute `fn` avec `rt` comme cible de SORTIE du renderer (tonalité AgX et encodage sRGB
   * appliqués comme à l'écran), fond transparent ; l'état du renderer est restauré ensuite.
   */
  private withTarget<T>(rt: THREE.RenderTarget, fn: () => T): T {
    const renderer = this.o.ctx.engine.renderer;
    const previousOutput = renderer.getOutputRenderTarget();
    const previousTarget = renderer.getRenderTarget();
    renderer.getClearColor(_clear);
    const previousAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(null);
    renderer.setOutputRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    try {
      return fn();
    } finally {
      renderer.setOutputRenderTarget(previousOutput);
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(_clear, previousAlpha);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.deferred.clear();
    this.tick();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.length = 0;
  }
}

/** Encode la planche en PNG (canvas hors écran si disponible) et retourne une URL blob. */
async function toBlobUrl(pixels: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
  const data = new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height);
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.putImageData(data, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return URL.createObjectURL(blob);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.putImageData(data, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}
