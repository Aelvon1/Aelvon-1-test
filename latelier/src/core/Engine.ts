/**
 * Moteur de rendu : création du `WebGPURenderer` (repli automatique WebGL2), scène, caméra
 * unique, boucle d'animation, redimensionnement, résolution dynamique et statistiques.
 *
 * Les systèmes (décor, joueur, inspection…) s'enregistrent via `add()` avec une priorité :
 * ils sont mis à jour dans l'ordre croissant des priorités avant le rendu.
 */
import * as THREE from 'three/webgpu';
import { installWebGPUCompat } from './webgpuCompat';
import { QUALITY_PROFILES, type QualityProfile } from './quality';
import type { QualityPreset } from './settings';

/** Informations de temps transmises à chaque mise à jour. */
export interface FrameInfo {
  /** Durée de l'image (s), bornée à 0,1 s. */
  dt: number;
  /** Temps écoulé depuis le démarrage (s), éventuellement figé (captures). */
  time: number;
  /** Numéro d'image. */
  frame: number;
}

export interface Updatable {
  update(frame: FrameInfo): void;
}

/** Priorités de mise à jour conventionnelles. */
export const UpdatePriority = {
  input: -100,
  physics: -50,
  controllers: 0,
  world: 10,
  inspection: 20,
  audio: 80,
  render: 100,
} as const;

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  forceWebGL: boolean;
  quality: QualityPreset;
  /** Temps d'animation figé (captures reproductibles). */
  frozenTime?: number | null;
}

type RenderFn = () => void;

export class Engine {
  readonly renderer: THREE.WebGPURenderer;
  readonly scene = new THREE.Scene();
  /** Caméra unique, pilotée tour à tour par l'accueil, le joueur, les transitions et l'inspection. */
  readonly camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 60);
  readonly canvas: HTMLCanvasElement;
  backend: 'webgpu' | 'webgl2' = 'webgl2';
  maxAnisotropy = 1;
  quality: QualityProfile;

  /** Fonction de rendu (remplacée par le pipeline de post-traitement). */
  renderFn: RenderFn;

  private readonly updatables: { item: Updatable; priority: number }[] = [];
  private readonly resizeListeners = new Set<(width: number, height: number) => void>();
  private readonly qualityListeners = new Set<(profile: QualityProfile) => void>();
  private resizeObserver: ResizeObserver | null = null;
  private running = false;
  private lastTime = 0;
  private elapsed = 0;
  private frameCount = 0;
  private readonly frozenTime: number | null;
  /** Échelle de résolution dynamique (0.5..1). */
  private dynamicScale = 1;
  private dynamicEnabled = false;
  private readonly frameTimes: number[] = [];
  private statsAccumulator = 0;
  private statsFrames = 0;
  private onStats: ((stats: EngineStats) => void) | null = null;

  private constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.frozenTime = options.frozenTime ?? null;
    this.quality = QUALITY_PROFILES[options.quality];
    this.renderer = new THREE.WebGPURenderer({
      canvas: options.canvas,
      antialias: false,
      // Profondeur inversée (flottante) : précision quasi constante en échelle logarithmique, ce
      // qui supprime le scintillement de profondeur du macro (quelques mm) jusqu'à la pièce entière.
      reversedDepthBuffer: true,
      forceWebGL: options.forceWebGL,
      powerPreference: 'high-performance',
    });
    this.renderFn = () => this.renderer.render(this.scene, this.camera);
  }

  /** Crée et initialise le moteur (asynchrone : négociation WebGPU ou repli WebGL2). */
  static async create(options: EngineOptions): Promise<Engine> {
    installWebGPUCompat();
    const engine = new Engine(options);
    await engine.init();
    return engine;
  }

  private async init(): Promise<void> {
    const r = this.renderer;
    await r.init();
    const backend = r.backend as unknown as { isWebGPUBackend?: boolean };
    this.backend = backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    this.maxAnisotropy = Math.max(1, r.getMaxAnisotropy());
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // Les statistiques couvrent toutes les passes de l'image (réinitialisées manuellement).
    r.info.autoReset = false;
    this.scene.name = 'Scène';
    this.camera.name = 'Caméra';
    this.applyPixelRatio();
    this.observeResize();
  }

  get reversedDepth(): boolean {
    return this.renderer.reversedDepthBuffer === true;
  }

  /** Enregistre un système mis à jour à chaque image. Retourne la fonction de retrait. */
  add(item: Updatable, priority = 0): () => void {
    this.updatables.push({ item, priority });
    this.updatables.sort((a, b) => a.priority - b.priority);
    return () => {
      const index = this.updatables.findIndex((u) => u.item === item);
      if (index >= 0) this.updatables.splice(index, 1);
    };
  }

  onResize(listener: (width: number, height: number) => void): () => void {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  onQualityChange(listener: (profile: QualityProfile) => void): () => void {
    this.qualityListeners.add(listener);
    return () => this.qualityListeners.delete(listener);
  }

  setStatsListener(listener: ((stats: EngineStats) => void) | null): void {
    this.onStats = listener;
  }

  setQuality(preset: QualityPreset): void {
    if (this.quality.preset === preset) return;
    this.quality = QUALITY_PROFILES[preset];
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.applyPixelRatio();
    for (const listener of [...this.qualityListeners]) listener(this.quality);
  }

  setDynamicResolution(enabled: boolean): void {
    this.dynamicEnabled = enabled;
    if (!enabled) {
      this.dynamicScale = 1;
      this.applyPixelRatio();
    }
  }

  /** Taille du canvas en pixels CSS. */
  get size(): { width: number; height: number } {
    return {
      width: this.canvas.clientWidth || window.innerWidth,
      height: this.canvas.clientHeight || window.innerHeight,
    };
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    void this.renderer.setAnimationLoop((now: number) => this.tick(now));
  }

  stop(): void {
    this.running = false;
    void this.renderer.setAnimationLoop(null);
  }

  /** Rend une image immédiatement (captures, miniatures). */
  renderNow(): void {
    this.renderFn();
  }

  dispose(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }

  private tick(now: number): void {
    const dtRaw = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(dtRaw, 0), 0.1);
    this.elapsed += dt;
    this.frameCount++;
    const frame: FrameInfo = {
      dt,
      time: this.frozenTime ?? this.elapsed,
      frame: this.frameCount,
    };
    this.renderer.info.reset();
    for (const { item } of this.updatables) {
      try {
        item.update(frame);
      } catch (error) {
        console.error('[Engine] Erreur de mise à jour :', error);
      }
    }
    this.renderFn();
    this.trackPerformance(dtRaw);
  }

  private trackPerformance(dtRaw: number): void {
    const ms = dtRaw * 1000;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    this.statsAccumulator += dtRaw;
    this.statsFrames++;
    if (this.statsAccumulator >= 0.5) {
      const fps = this.statsFrames / this.statsAccumulator;
      const info = this.renderer.info.render;
      this.onStats?.({
        fps,
        frameMs: (this.statsAccumulator / this.statsFrames) * 1000,
        drawCalls: info.drawCalls,
        triangles: info.triangles,
        pixelRatio: this.renderer.getPixelRatio(),
      });
      this.statsAccumulator = 0;
      this.statsFrames = 0;
      if (this.dynamicEnabled) this.adjustDynamicResolution();
    }
  }

  /** Résolution dynamique : vise ~16,7 ms par image en ajustant l'échelle de pixels. */
  private adjustDynamicResolution(): void {
    if (this.frameTimes.length < 30) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 16;
    let next = this.dynamicScale;
    if (p90 > 18.5) next = Math.max(0.5, this.dynamicScale - 0.08);
    else if (p90 < 14 && this.dynamicScale < 1) next = Math.min(1, this.dynamicScale + 0.04);
    if (Math.abs(next - this.dynamicScale) > 0.001) {
      this.dynamicScale = next;
      this.applyPixelRatio();
    }
  }

  private applyPixelRatio(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio) * this.dynamicScale;
    this.renderer.setPixelRatio(ratio);
    const { width, height } = this.size;
    this.renderer.setSize(width, height, false);
  }

  private observeResize(): void {
    const apply = () => {
      const { width, height } = this.size;
      if (width === 0 || height === 0) return;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      for (const listener of [...this.resizeListeners]) listener(width, height);
    };
    this.resizeObserver = new ResizeObserver(apply);
    this.resizeObserver.observe(this.canvas);
    apply();
  }
}

export interface EngineStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  pixelRatio: number;
}
