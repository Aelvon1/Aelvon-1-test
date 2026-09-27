/**
 * Tests du pipeline de post-traitement sans GPU (Node) :
 * - construction du graphe TSL pour chaque profil et chaque backend (aucune exception, passes
 *   présentes selon le profil) puis libération complète des cibles de rendu ;
 * - noms de nœuds valides en WGSL/GLSL (le nom « PostFX.aoBlurH » d'une cible produisait un
 *   shader invalide, donc un écran noir en Moyen et au-dessus) : analyse du graphe construit et
 *   des sources de src/render ;
 * - choix de la configuration de secours quand le GPU refuse une configuration.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { QUALITY_PROFILES } from '../src/core/quality';
import type { QualityPreset } from '../src/core/settings';
import { PostPipeline, createPostUniforms, type PostEngine } from '../src/render/PostPipeline';
import {
  buildConfigKey,
  isValidShaderIdentifier,
  resolveBuildConfig,
  safeBuildConfig,
  selectBuildConfig,
} from '../src/render/postLogic';

const PRESETS: readonly QualityPreset[] = ['low', 'medium', 'high', 'ultra'];
const BACKENDS = ['webgpu', 'webgl2'] as const;

/**
 * `SMAANode` charge ses tables (aire, recherche) dans des `Image` : Node n'en a pas. Une
 * image factice suffit, la construction du graphe ne les lit pas.
 */
class FakeImage {
  src = '';
  width = 1;
  height = 1;
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

/** Renderer minimal : le constructeur du pipeline ne lit que ces propriétés. */
function fakeEngine(backend: 'webgpu' | 'webgl2'): PostEngine {
  const renderer = {
    coordinateSystem: backend === 'webgpu' ? THREE.WebGPUCoordinateSystem : THREE.WebGLCoordinateSystem,
    toneMapping: THREE.AgXToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
  } as unknown as THREE.WebGPURenderer;
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 60);
  return { renderer, scene: new THREE.Scene(), camera, reversedDepth: true };
}

/**
 * Collecte tous les nœuds TSL atteignables depuis un objet (champs, tableaux, cartes) : le
 * graphe « enfant » de three s'arrête aux appels `Fn`, dont le corps n'est évalué qu'à la
 * compilation ; les nœuds conservés par le pipeline (cibles RTT, flous, passes) sont en revanche
 * tous référencés par un champ.
 */
function collectNodes(root: unknown): THREE.Node[] {
  const seen = new Set<object>();
  const nodes: THREE.Node[] = [];
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== 'object' || value === null || seen.has(value) || ArrayBuffer.isView(value)) continue;
    seen.add(value);
    if ((value as { isNode?: boolean }).isNode === true) nodes.push(value as THREE.Node);
    if (value instanceof Map) {
      for (const [key, item] of value) stack.push(key, item);
      continue;
    }
    for (const item of Object.values(value)) stack.push(item);
  }
  return nodes;
}

/** Espionne les libérations de cibles de rendu pendant `run`. */
function trackDisposedTargets<T>(run: () => T): { value: T; disposed: Set<unknown> } {
  const proto = THREE.RenderTarget.prototype;
  const originalDispose = proto.dispose;
  const disposed = new Set<unknown>();
  proto.dispose = function (this: THREE.RenderTarget) {
    disposed.add(this);
    originalDispose.call(this);
  };
  try {
    return { value: run(), disposed };
  } finally {
    proto.dispose = originalDispose;
  }
}

describe('construction du pipeline par profil', () => {
  for (const backend of BACKENDS) {
    for (const preset of PRESETS) {
      it(`${preset} / ${backend} : passes conformes au profil, noms valides`, () => {
        const config = resolveBuildConfig(QUALITY_PROFILES[preset], backend);
        const pipeline = new PostPipeline(fakeEngine(backend), config, createPostUniforms());
        try {
          expect(pipeline.ao !== null).toBe(config.ao);
          expect(pipeline.bloom !== null).toBe(config.bloom);
          expect(pipeline.dof !== null).toBe(config.dof);
          expect(pipeline.outline.active).toBe(false);
          expect(pipeline.renderPipeline.outputColorTransform).toBe(false);
          const nodes = collectNodes(pipeline);
          expect(nodes.length).toBeGreaterThan(30);
          const invalid = nodes
            .map((node) => node.name)
            .filter((name) => typeof name === 'string' && name !== '' && !isValidShaderIdentifier(name));
          expect(invalid).toEqual([]);
        } finally {
          pipeline.dispose();
        }
      });
    }
  }

  it('libère toutes les cibles de rendu de l’AO, du bloom, de la profondeur de champ et des contours', () => {
    const config = resolveBuildConfig(QUALITY_PROFILES.ultra, 'webgpu');
    const { value: pipeline, disposed } = trackDisposedTargets(() => {
      const p = new PostPipeline(fakeEngine('webgpu'), config, createPostUniforms());
      p.dispose();
      return p;
    });
    const ao = pipeline.ao!;
    // Cibles internes connues (propriétés privées de three lues pour le test uniquement).
    const internals = (node: unknown, keys: string[]): unknown[] =>
      keys.map((key) => (node as Record<string, unknown>)[key]).filter((v) => v !== undefined);
    const expected = [
      pipeline.scenePass.renderTarget,
      ...internals(ao.gtao, ['_aoRenderTarget']),
      ...internals(pipeline.bloom, ['_renderTargetBright']),
      ...internals(pipeline.dof?.node, ['_CoCRT', '_compositeRT']),
      ...internals(pipeline.outline, ['maskTarget', 'softTargetA', 'softTargetB', 'overlayTarget']),
    ];
    expect(expected.length).toBeGreaterThanOrEqual(9);
    for (const target of expected) expect(disposed.has(target)).toBe(true);
  });

  it('reconstruit sans erreur d’un profil à l’autre (changement de qualité à chaud)', () => {
    const engine = fakeEngine('webgpu');
    const uniforms = createPostUniforms();
    let current: PostPipeline | null = null;
    for (const preset of ['low', 'high', 'medium', 'ultra', 'low'] as const) {
      const next = new PostPipeline(engine, resolveBuildConfig(QUALITY_PROFILES[preset]), uniforms);
      current?.dispose();
      current = next;
    }
    expect(current?.config.antialias).toBe('fxaa');
    current?.dispose();
  });
});

describe('noms de nœuds dans les sources', () => {
  const root = join(__dirname, '..', 'src', 'render');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) files.push(path);
    }
  };
  walk(root);

  it('n’utilise que des identifiants valides pour setName / label', () => {
    expect(files.length).toBeGreaterThan(3);
    const offenders: string[] = [];
    const pattern = /\.(?:setName|label)\(\s*(['"`])([^'"`]*)\1/g;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const name = match[2] ?? '';
        if (!isValidShaderIdentifier(name)) offenders.push(`${file} : « ${name} »`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('détecte un nœud mal nommé dans un graphe', () => {
    const holder = { blur: uniform(1).setName('PostFX.aoBlurH') };
    const names = collectNodes(holder).map((node) => node.name);
    expect(names).toContain('PostFX.aoBlurH');
    expect(names.every(isValidShaderIdentifier)).toBe(false);
  });

  it('reconnaît les identifiants invalides', () => {
    expect(isValidShaderIdentifier('aoBlurH')).toBe(true);
    expect(isValidShaderIdentifier('ao_blur_2')).toBe(true);
    expect(isValidShaderIdentifier('PostFX.aoBlurH')).toBe(false);
    expect(isValidShaderIdentifier('2pass')).toBe(false);
    expect(isValidShaderIdentifier('__reserved')).toBe(false);
    expect(isValidShaderIdentifier('flou ao')).toBe(false);
  });
});

describe('repli en cas de refus du GPU', () => {
  const requested = resolveBuildConfig(QUALITY_PROFILES.high);

  it('construit la configuration demandée tant qu’elle n’a pas échoué', () => {
    expect(selectBuildConfig(requested, new Set())).toBe(requested);
  });

  it('passe en configuration de secours, puis sans post-traitement', () => {
    const failed = new Set([buildConfigKey(requested)]);
    const safe = selectBuildConfig(requested, failed);
    expect(safe).toMatchObject({ msaaSamples: 0, ao: false, bloom: false, dof: false, antialias: 'fxaa' });
    failed.add(buildConfigKey(safeBuildConfig(requested)));
    expect(selectBuildConfig(requested, failed)).toBeNull();
  });

  it('la configuration de secours a une clé distincte (pas de boucle de reconstruction)', () => {
    for (const preset of PRESETS) {
      const config = resolveBuildConfig(QUALITY_PROFILES[preset]);
      const safe = safeBuildConfig(config);
      if (buildConfigKey(config) === buildConfigKey(safe)) {
        // Bas est déjà la configuration de secours : un échec mène directement au rendu direct.
        expect(selectBuildConfig(config, new Set([buildConfigKey(config)]))).toBeNull();
      } else {
        expect(buildConfigKey(safe)).not.toBe(buildConfigKey(config));
      }
    }
  });
});
