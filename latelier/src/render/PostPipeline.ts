/**
 * Graphe TSL du rendu final pour UN profil de qualité (reconstruit à chaque changement de
 * profil, jamais à chaque image) :
 *
 *   scène (MSAA selon profil, HDR demi-flottant, profondeur inversée)
 *     ├─ GTAO + flou bilatéral ─────────────┐ (× occlusion)
 *     ├─ bloom (seuil HDR : lampes, LED, écrans)
 *     └─ profondeur de champ (inspection, activable) + assombrissement de l'arrière-plan
 *   → tone mapping AgX + sRGB → étalonnage chaud/froid + vignettage + calque des contours
 *   → anticrénelage (SMAA / FXAA / aucun) → grain animé + tramage → écran
 *
 * Les effets optionnels à l'exécution (profondeur de champ, assombrissement, contours) sont des
 * branches dynamiques sur uniformes et leurs passes sont suspendues quand ils sont inactifs :
 * aucun coût, aucune recompilation (donc aucune saccade) quand on change de mode.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  clamp,
  convertToTexture,
  float,
  luminance,
  mix,
  pass,
  renderOutput,
  smoothstep,
  sqrt,
  step,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { bloom as createBloom } from 'three/addons/tsl/display/BloomNode.js';
import type BloomNode from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import type { Engine } from '../core/Engine';
import type { PostBuildConfig, PostDebugView } from './postLogic';
import { AmbientOcclusion } from './nodes/ambientOcclusion';
import { InspectionDepthOfField } from './nodes/depthOfField';
import { SelectionOutlineNode } from './nodes/SelectionOutlineNode';
import { filmGrain, splitTone, vignetteFactor } from './nodes/grading';

/** Uniformes partagés par toutes les reconstructions (valeurs conservées d'un profil à l'autre). */
export function createPostUniforms() {
  return {
    /** Force de l'AO (0 = aucune occlusion). */
    aoStrength: uniform(0.9),
    /** Force du bloom. */
    bloomStrength: uniform(0.32),
    /** 1 = la profondeur de champ remplace l'image nette. */
    dofOn: uniform(0),
    /** Assombrissement de l'arrière-plan (0..1) et plage (m). */
    dimAmount: uniform(0),
    dimStart: uniform(1),
    dimEnd: uniform(2),
    /** Étalonnage chaud/froid (0..1). */
    splitTone: uniform(1),
    /** Vignettage (0..1) et rapport largeur/hauteur. */
    vignette: uniform(0.3),
    aspect: uniform(16 / 9),
    /** Amplitude du grain et graine animée. */
    grain: uniform(0),
    grainSeed: uniform(0),
    /** 1 = le calque des contours est composé. */
    outlineOn: uniform(0),
  };
}

export type PostUniforms = ReturnType<typeof createPostUniforms>;

/** Sous-ensemble du moteur utilisé par le graphe (permet un banc d'essai isolé). */
export type PostEngine = Pick<Engine, 'renderer' | 'scene' | 'camera' | 'reversedDepth'>;

interface Disposable {
  dispose(): void;
}

export class PostPipeline {
  readonly renderPipeline: THREE.RenderPipeline;
  readonly scenePass: THREE.PassNode;
  readonly ao: AmbientOcclusion | null = null;
  readonly bloom: BloomNode | null = null;
  readonly dof: InspectionDepthOfField | null = null;
  readonly outline: SelectionOutlineNode;
  private readonly disposables: Disposable[] = [];

  constructor(
    engine: PostEngine,
    readonly config: PostBuildConfig,
    uniforms: PostUniforms,
    readonly debugView: PostDebugView = 'none',
  ) {
    const { renderer, scene, camera } = engine;
    const u = uniforms;

    // --- Passe de scène (HDR linéaire) ---
    this.scenePass = pass(scene, camera, { samples: config.msaaSamples });
    this.disposables.push(this.scenePass);
    const sceneColor = this.scenePass.getTextureNode('output');
    const viewZ = this.scenePass.getViewZNode();

    // --- Occlusion ambiante ---
    let lit: THREE.Node<'vec4'> = sceneColor;
    if (config.ao) {
      const ao = new AmbientOcclusion({
        scenePass: this.scenePass,
        camera,
        resolution: config.aoResolution,
        samples: config.aoSamples,
        reversedDepth: engine.reversedDepth,
        coordinateSystem: renderer.coordinateSystem,
      });
      this.ao = ao;
      this.disposables.push(ao);
      // Approximation : l'occlusion module toute la lumière (directe comprise), pas seulement
      // l'ambiante — force réduite (0,9) pour ne pas « salir » les zones éclairées.
      lit = vec4(sceneColor.rgb.mul(mix(float(1), ao.factor, u.aoStrength)), sceneColor.a);
    }

    // --- Bloom (sur la scène HDR avant AO : les sources lumineuses ne sont pas occultées) ---
    if (config.bloom) {
      const bloomNode = createBloom(sceneColor, u.bloomStrength, 0.45, 1.15);
      bloomNode.smoothWidth.value = 0.9;
      this.bloom = bloomNode;
      this.disposables.push(bloomNode);
    }

    // --- Profondeur de champ (inspection) ---
    if (config.dof) {
      const dof = new InspectionDepthOfField(lit, viewZ);
      this.dof = dof;
      this.disposables.push(dof);
    }

    // --- Composite HDR : profondeur de champ, bloom, assombrissement de l'arrière-plan ---
    const bloomNode = this.bloom;
    const dofNode = this.dof?.node ?? null;
    const hdr = Fn(() => {
      const color = vec4(0).toVar();
      if (dofNode) {
        If(u.dofOn.greaterThan(0.5), () => {
          color.assign(dofNode);
        }).Else(() => {
          color.assign(lit);
        });
      } else {
        color.assign(lit);
      }
      if (bloomNode) color.assign(vec4(color.rgb.add(bloomNode.rgb), color.a));
      If(u.dimAmount.greaterThan(0.001), () => {
        const factor = smoothstep(u.dimStart, u.dimEnd, viewZ.negate()).mul(u.dimAmount);
        color.assign(vec4(color.rgb.mul(factor.oneMinus()), color.a));
      });
      return color;
    })();

    // --- Tone mapping AgX + sRGB (réglages du renderer), puis étalonnage en espace d'affichage ---
    const display = renderOutput(hdr, renderer.toneMapping, renderer.outputColorSpace);
    this.outline = new SelectionOutlineNode(scene, camera, this.scenePass);
    this.disposables.push(this.outline);
    const outlineNode = this.outline;
    const graded = Fn(() => {
      const color = splitTone(display.rgb, u.splitTone).mul(vignetteFactor(u.aspect, u.vignette)).toVar();
      If(u.outlineOn.greaterThan(0.5), () => {
        const overlay = vec4(outlineNode).toVar();
        color.assign(color.mul(overlay.a.oneMinus()).add(overlay.rgb));
      });
      return vec4(color, 1);
    })();

    // --- Anticrénelage (après tone mapping : SMAA/FXAA attendent une image sRGB) puis grain
    // (après l'anticrénelage, sinon il serait lissé comme un bord) + tramage anti-bandes ---
    const grainAmount = config.grain ? u.grain : float(0);
    const withGrain = (source: THREE.Node<'vec4'>): THREE.Node<'vec4'> =>
      Fn(() => {
        const color = vec4(source).toVar();
        return vec4(filmGrain(color.rgb, grainAmount, u.grainSeed), 1);
      })();
    let output: THREE.Node;
    if (config.antialias === 'smaa') {
      const node = smaa(graded);
      this.disposables.push(node, node.textureNode);
      output = withGrain(node.getTextureNode());
    } else if (config.antialias === 'fxaa') {
      if (config.grain) {
        // Grain après FXAA : une passe intermédiaire (profil sans grain par défaut en Bas).
        const node = fxaa(graded);
        const resolved = convertToTexture(node);
        this.disposables.push(node, node.textureNode, resolved);
        output = withGrain(resolved);
      } else {
        // Tramage seul, AVANT FXAA (±½ niveau : sous le seuil de détection des bords).
        const node = fxaa(withGrain(graded));
        this.disposables.push(node, node.textureNode);
        output = node;
      }
    } else {
      output = withGrain(graded);
    }

    // --- Vues de contrôle (développement) : remplacent la sortie ---
    if (debugView !== 'none') {
      const shade = sqrt(clamp(luminance(sceneColor.rgb), 0, 1))
        .mul(0.7)
        .add(0.3);
      if (debugView === 'ao') {
        output = this.ao ? vec4(vec3(this.ao.factor), 1) : vec4(1);
      } else if (debugView === 'aoraw') {
        output = this.ao ? vec4(vec3(this.ao.rawFactor), 1) : vec4(1);
      } else if (debugView === 'aodepth') {
        output = this.ao ? vec4(vec3(clamp(this.ao.resolvedViewZ.negate().div(6), 0, 1)), 1) : vec4(0);
      } else if (debugView === 'depth') {
        // Distance linéaire 0..6 m (contrôle de la profondeur inversée).
        output = vec4(vec3(clamp(viewZ.negate().div(6), 0, 1)), 1);
      } else {
        // Mise au point : vert = zone nette, bleu = avant-plan flou, rouge = arrière-plan
        // (flou + assombrissement).
        const dof = this.dof;
        const distance = viewZ.negate();
        const delta = dof ? distance.sub(dof.focusDistance) : distance.sub(u.dimStart);
        const band = dof ? dof.band : float(0);
        const sharp = step(abs(delta), band);
        const near = step(delta, band.negate());
        const far = smoothstep(u.dimStart, u.dimEnd, distance).max(step(band, delta).mul(0.35));
        output = vec4(vec3(far, sharp, near).mul(shade), 1);
      }
    }

    this.renderPipeline = new THREE.RenderPipeline(renderer, output);
    this.renderPipeline.outputColorTransform = false;
  }

  render(): void {
    this.renderPipeline.render();
  }

  /**
   * Préchauffage : rend une image avec toutes les passes optionnelles actives (flou nul) pour
   * compiler leurs shaders maintenant plutôt qu'à la première utilisation.
   */
  warmup(uniforms: PostUniforms): void {
    const dofOn = uniforms.dofOn.value;
    if (this.dof) {
      this.dof.enabled = true;
      uniforms.dofOn.value = 1;
    }
    this.render();
    if (this.dof) this.dof.enabled = false;
    uniforms.dofOn.value = dofOn;
  }

  dispose(): void {
    this.renderPipeline.dispose();
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
  }
}
