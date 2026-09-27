/**
 * Tests du câblage `PostFX` sans GPU (Node, moteur factice) : reconstruction à chaud au
 * changement de profil, repli automatique quand la construction échoue (exception) ou quand le
 * GPU refuse un shader (erreur interceptée pendant le préchauffage), mise au point et contours
 * pilotés par uniformes, libération à la fermeture.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { QUALITY_PROFILES, type QualityProfile } from '../src/core/quality';
import type { QualityPreset } from '../src/core/settings';
import type { Engine, FrameInfo } from '../src/core/Engine';
import { createAppStore } from '../src/core/store';
import { PostFX } from '../src/render/PostFX';
import { PostPipeline } from '../src/render/PostPipeline';

/** `SMAANode` crée des `Image` (absentes de Node) : image factice. */
class FakeImage {
  src = '';
  onload: (() => void) | null = null;
}
const globals = globalThis as { Image?: unknown };
let previousImage: unknown;
beforeAll(() => {
  previousImage = globals.Image;
  globals.Image = FakeImage;
});
afterAll(() => {
  globals.Image = previousImage;
});
afterEach(() => {
  vi.restoreAllMocks();
});

type ScopeError = { message: string } | null;

interface FakeEngineOptions {
  /** Erreurs renvoyées par les dépilements successifs (null = aucune). */
  scopeErrors?: ScopeError[];
  /** Fait échouer la construction de l'AO (lecture du système de coordonnées). */
  failAo?: boolean;
  backend?: 'webgpu' | 'webgl2';
}

/** Moteur minimal : seules les propriétés lues par PostFX / PostPipeline sont fournies. */
function createFakeEngine(options: FakeEngineOptions = {}) {
  const listeners = new Set<(profile: QualityProfile) => void>();
  const scopeErrors = [...(options.scopeErrors ?? [])];
  const device = {
    pushed: 0,
    pushErrorScope(): void {
      this.pushed++;
    },
    popErrorScope(): Promise<ScopeError> {
      return Promise.resolve(scopeErrors.shift() ?? null);
    },
  };
  const renderer = {
    /** Lu uniquement à la construction de l'AO. */
    get coordinateSystem(): number {
      if (options.failAo) throw new Error('coordonnées refusées (test)');
      return THREE.WebGPUCoordinateSystem;
    },
    toneMapping: THREE.AgXToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    backend: { device },
    getDrawingBufferSize: (target: THREE.Vector2) => target.set(1920, 1080),
    debug: { onShaderError: null as unknown },
    render: vi.fn(),
  };
  const engine = {
    renderer,
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 60),
    reversedDepth: true,
    backend: options.backend ?? 'webgpu',
    quality: QUALITY_PROFILES.high,
    renderFn: () => undefined,
    onQualityChange(listener: (profile: QualityProfile) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setQuality(preset: QualityPreset) {
      engine.quality = QUALITY_PROFILES[preset];
      for (const listener of listeners) listener(engine.quality);
    },
  };
  return { engine, device, listeners, asEngine: engine as unknown as Engine };
}

function frame(time = 1, dt = 1 / 60): FrameInfo {
  return { time, dt, frame: 1 };
}

/** Laisse les promesses de dépilement se résoudre. */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

describe('PostFX (moteur factice)', () => {
  it('construit le profil courant, préchauffe sous surveillance GPU et se reconstruit à chaud', () => {
    const warmup = vi.spyOn(PostPipeline.prototype, 'warmup').mockImplementation(() => undefined);
    const { engine, device, listeners, asEngine } = createFakeEngine();
    const postfx = new PostFX(asEngine, createAppStore());
    postfx.init();
    expect(postfx.debugInfo().config).toBe('msaa4|ao0.75x16|bloom|dof|smaa|grain');
    expect(warmup).toHaveBeenCalledTimes(1);
    expect(device.pushed).toBe(2);
    const dispose = vi.spyOn(PostPipeline.prototype, 'dispose');
    engine.setQuality('low');
    expect(postfx.debugInfo().config).toBe('msaa0|noao|nobloom|nodof|fxaa|nograin');
    expect(dispose).toHaveBeenCalledTimes(1);
    // Même structure : aucune reconstruction.
    engine.setQuality('low');
    expect(warmup).toHaveBeenCalledTimes(2);
    postfx.dispose();
    expect(listeners.size).toBe(0);
    expect(postfx.debugInfo().config).toBe('aucun');
  });

  it('se replie en configuration de secours si la construction lève une exception', () => {
    vi.spyOn(PostPipeline.prototype, 'warmup').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { asEngine } = createFakeEngine({ failAo: true });
    const postfx = new PostFX(asEngine, createAppStore());
    postfx.init();
    const info = postfx.debugInfo();
    // L'AO est refusée : secours sans AO/bloom/DOF, FXAA.
    expect(info.config).toBe('msaa0|noao|nobloom|nodof|fxaa|nograin');
    expect(info.failedConfigs).toEqual(['msaa4|ao0.75x16|bloom|dof|smaa|grain']);
    expect(error).toHaveBeenCalled();
    postfx.dispose();
  });

  it('se replie quand le GPU refuse un shader pendant le préchauffage', async () => {
    vi.spyOn(PostPipeline.prototype, 'warmup').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // 1er préchauffage : « internal » OK, « validation » en erreur ; ensuite plus d'erreur.
    const { asEngine } = createFakeEngine({ scopeErrors: [null, { message: 'WGSL invalide (test)' }] });
    const postfx = new PostFX(asEngine, createAppStore());
    postfx.init();
    expect(postfx.debugInfo().config).toBe('msaa4|ao0.75x16|bloom|dof|smaa|grain');
    await flushPromises();
    expect(postfx.debugInfo().config).toBe('msaa0|noao|nobloom|nodof|fxaa|nograin');
    expect(error.mock.calls.some((call) => String(call[0]).includes('WGSL invalide'))).toBe(true);
    postfx.dispose();
  });

  it('se replie quand WebGL 2 refuse de lier un programme (signalement synchrone)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { engine, asEngine } = createFakeEngine({ backend: 'webgl2' });
    let calls = 0;
    vi.spyOn(PostPipeline.prototype, 'warmup').mockImplementation(() => {
      // Premier préchauffage : un programme refusé, signalé par le crochet de three.
      if (calls++ > 0) return;
      const hook = engine.renderer.debug.onShaderError as (
        gl: unknown,
        program: unknown,
        vertex: unknown,
        fragment: unknown,
      ) => void;
      const gl = {
        getProgramInfoLog: () => 'ERREUR : 0:12 identifiant invalide',
        getShaderInfoLog: () => '',
      };
      hook(gl, {}, {}, {});
    });
    const postfx = new PostFX(asEngine, createAppStore());
    postfx.init();
    const info = postfx.debugInfo();
    expect(info.config).toBe('msaa0|noao|nobloom|nodof|fxaa|nograin');
    expect(info.failedConfigs).toEqual(['msaa0|ao0.75x16|bloom|dof|smaa|grain']);
    expect(error.mock.calls.some((call) => String(call[0]).includes('identifiant invalide'))).toBe(true);
    // Le crochet de three est rétabli après le préchauffage.
    expect(engine.renderer.debug.onShaderError).toBeNull();
    postfx.dispose();
  });

  it('pilote la mise au point, l’assombrissement et les contours sans reconstruction', () => {
    vi.spyOn(PostPipeline.prototype, 'warmup').mockImplementation(() => undefined);
    const { asEngine } = createFakeEngine();
    const store = createAppStore();
    const postfx = new PostFX(asEngine, store);
    postfx.init();
    const config = postfx.debugInfo().config;
    postfx.setMode('inspection');
    postfx.setFocus({ distance: 0.4, radius: 0.08 });
    postfx.settle();
    postfx.update(frame());
    let info = postfx.debugInfo();
    expect(info.focusSource).toBe('explicit');
    expect(info.dofActive).toBe(true);
    expect(info.dimAmount).toBeCloseTo(0.35);
    // Désactivation par le réglage : plus de flou, l'assombrissement reste.
    store.setState((s) => ({ settings: { ...s.settings, depthOfField: false } }));
    postfx.settle();
    postfx.update(frame(2));
    info = postfx.debugInfo();
    expect(info.dofActive).toBe(false);
    expect(info.dimAmount).toBeCloseTo(0.35);
    // Contours : comptés par maillage, vides = inactifs.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicNodeMaterial());
    postfx.setOutline('selected', [mesh]);
    expect(postfx.debugInfo().outlineMeshes).toBe(1);
    postfx.setOutline('selected', []);
    expect(postfx.debugInfo().outlineMeshes).toBe(0);
    // Sortie de l'inspection : effets éteints.
    postfx.setMode('exploration');
    postfx.settle();
    postfx.update(frame(3));
    info = postfx.debugInfo();
    expect(info.focus).toBeNull();
    expect(info.dimAmount).toBe(0);
    expect(info.config).toBe(config);
    postfx.dispose();
    mesh.geometry.dispose();
  });
});
