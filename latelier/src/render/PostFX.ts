/**
 * Pipeline de post-traitement (TSL, `THREE.RenderPipeline`) : passe de scène MSAA, GTAO,
 * bloom HDR, profondeur de champ et assombrissement de l'arrière-plan en inspection, contours de
 * sélection, tone mapping AgX, étalonnage chaud/froid, vignettage, anticrénelage (SMAA/FXAA) et
 * grain animé.
 *
 * API publique (utilisée par l'application et l'inspection) : `init`, `setMode`, `setFocus`,
 * `setOutline`, `setBackgroundDim`, `update`, `dispose`. Ajouts : `setFocusAnchor` (mise au
 * point automatique tant que l'inspection n'appelle pas `setFocus`), `debugInfo`.
 *
 * Le graphe est construit pour un profil de qualité ; un changement de profil le reconstruit
 * proprement (anciennes ressources libérées). Tout le reste (modes, mise au point, contours) ne
 * touche que des uniformes : aucune recompilation, aucune allocation par image.
 */
import * as THREE from 'three/webgpu';
import type { Engine, FrameInfo } from '../core/Engine';
import type { QualityProfile } from '../core/quality';
import type { AppStore } from '../core/store';
import {
  DEFAULT_BACKGROUND_DIM,
  MODE_LOOKS,
  OUTLINE_KINDS,
  aoRadiusFor,
  blockedPulse,
  bokehPixels,
  buildConfigKey,
  computeFocusParams,
  damp,
  grainSeed,
  resolveBuildConfig,
  type FocusParams,
  type InspectionFocus,
  type ModeLook,
  type OutlineKind,
  type PostMode,
} from './postLogic';
import { PostPipeline, createPostUniforms } from './PostPipeline';

export type { InspectionFocus, OutlineKind, PostMode } from './postLogic';

/** Rayon supposé de l'objet pour la mise au point automatique (m). */
const AUTO_FOCUS_RADIUS = 0.18;
/** Vitesses d'amortissement (1/s). */
const LOOK_RATE = 3;
const FOCUS_RATE = 9;
const FADE_RATE = 4.5;

/** État lisible (tests automatisés, panneau de debug). */
export interface PostFXDebugInfo {
  mode: PostMode;
  config: string;
  focus: InspectionFocus | null;
  focusSource: 'explicit' | 'auto' | 'none';
  dofAmount: number;
  dofActive: boolean;
  dimAmount: number;
  outlineMeshes: number;
  vignette: number;
  bokehPx: number;
}

export class PostFX {
  protected pipeline: PostPipeline | null = null;
  protected mode: PostMode = 'home';
  private readonly uniforms = createPostUniforms();
  private readonly outlineLists: Record<OutlineKind, THREE.Object3D[]> = { hover: [], selected: [], blocked: [] };
  private unsubscribeQuality: (() => void) | null = null;

  /** `undefined` : jamais fourni (mise au point auto) ; `null` : désactivée explicitement. */
  private explicitFocus: InspectionFocus | null | undefined = undefined;
  private focusAnchor: THREE.Vector3 | null = null;
  private readonly focus: InspectionFocus = { distance: 1, radius: AUTO_FOCUS_RADIUS };
  private focusValid = false;
  private focusSource: PostFXDebugInfo['focusSource'] = 'none';
  private readonly focusParams: FocusParams = computeFocusParams({ distance: 1, radius: AUTO_FOCUS_RADIUS });
  private backgroundDim = DEFAULT_BACKGROUND_DIM;
  private dofAmount = 0;
  private dimAmount = 0;
  private aoRadius = aoRadiusFor('home', null);
  private readonly look: ModeLook = { ...MODE_LOOKS.home };
  private readonly bufferSize = new THREE.Vector2();
  private lastBokeh = 0;

  constructor(
    protected readonly engine: Engine,
    protected readonly store: AppStore,
  ) {}

  init(): void {
    this.build(this.engine.quality);
    this.engine.renderFn = () => this.render();
    this.unsubscribeQuality = this.engine.onQualityChange((profile) => this.build(profile));
  }

  setMode(mode: PostMode): void {
    if (mode === this.mode) return;
    // Nouvelle inspection (ou sortie) : on repart de la mise au point automatique.
    if (mode === 'inspection' || this.mode === 'inspection') this.explicitFocus = undefined;
    this.mode = mode;
  }

  /** Profondeur de champ + assombrissement de l'arrière-plan (null = désactivé). */
  setFocus(focus: InspectionFocus | null): void {
    if (!focus) {
      this.explicitFocus = null;
      return;
    }
    if (!Number.isFinite(focus.distance) || !Number.isFinite(focus.radius)) return;
    this.explicitFocus = { distance: focus.distance, radius: focus.radius };
  }

  /**
   * Point de mise au point automatique en inspection (centre du tapis de l'établi) : utilisé
   * tant que l'inspection n'a pas fourni de mise au point avec `setFocus`.
   */
  setFocusAnchor(anchor: THREE.Vector3 | null): void {
    this.focusAnchor = anchor;
  }

  /** Objets à entourer (contour lumineux) selon leur rôle. Liste vide = aucun coût. */
  setOutline(kind: OutlineKind, objects: readonly THREE.Object3D[]): void {
    const list = this.outlineLists[kind];
    list.length = 0;
    for (const object of objects) list.push(object);
    this.pipeline?.outline.setObjects(kind, list);
  }

  /** Assombrissement de l'arrière-plan en inspection (0..1). */
  setBackgroundDim(amount: number): void {
    if (Number.isFinite(amount)) this.backgroundDim = Math.min(1, Math.max(0, amount));
  }

  update(frame: FrameInfo): void {
    const pipeline = this.pipeline;
    if (!pipeline) return;
    const { dt } = frame;
    const u = this.uniforms;
    const renderer = this.engine.renderer;
    const camera = this.engine.camera;
    renderer.getDrawingBufferSize(this.bufferSize);
    const height = Math.max(1, this.bufferSize.height);

    // --- Look du mode (vignettage, étalonnage, grain, bloom) ---
    const target = MODE_LOOKS[this.mode];
    const look = this.look;
    look.vignette = damp(look.vignette, target.vignette, LOOK_RATE, dt);
    look.splitTone = damp(look.splitTone, target.splitTone, LOOK_RATE, dt);
    look.grain = damp(look.grain, target.grain, LOOK_RATE, dt);
    look.bloom = damp(look.bloom, target.bloom, LOOK_RATE, dt);
    u.vignette.value = look.vignette;
    u.splitTone.value = look.splitTone;
    u.grain.value = pipeline.config.grain ? look.grain : 0;
    u.grainSeed.value = grainSeed(frame.time);
    u.bloomStrength.value = 0.32 * look.bloom;
    u.aspect.value = this.bufferSize.width / height;

    // --- Mise au point (inspection) ---
    const focusTarget = this.resolveFocusTarget(camera);
    if (focusTarget) {
      if (!this.focusValid) {
        this.focus.distance = focusTarget.distance;
        this.focus.radius = focusTarget.radius;
        this.focusValid = true;
      } else {
        this.focus.distance = damp(this.focus.distance, focusTarget.distance, FOCUS_RATE, dt);
        this.focus.radius = damp(this.focus.radius, focusTarget.radius, FOCUS_RATE, dt);
      }
    }
    const settings = this.store.getState().settings;
    const dofWanted = focusTarget !== null && pipeline.dof !== null && settings.depthOfField;
    this.dofAmount = damp(this.dofAmount, dofWanted ? 1 : 0, FADE_RATE, dt);
    this.dimAmount = damp(this.dimAmount, focusTarget ? this.backgroundDim : 0, FADE_RATE, dt);
    if (!focusTarget && this.dofAmount === 0 && this.dimAmount === 0) this.focusValid = false;

    const params = computeFocusParams(this.focus, this.focusParams);
    const dof = pipeline.dof;
    if (dof) {
      const active = this.dofAmount > 0.002;
      dof.enabled = active;
      u.dofOn.value = active ? 1 : 0;
      dof.focusDistance.value = params.distance;
      dof.band.value = params.band;
      dof.ramp.value = params.ramp;
      this.lastBokeh = bokehPixels(height, this.dofAmount);
      dof.bokehScale.value = this.lastBokeh;
    } else {
      u.dofOn.value = 0;
      this.lastBokeh = 0;
    }
    u.dimAmount.value = this.dimAmount > 0.001 ? this.dimAmount : 0;
    u.dimStart.value = params.dimStart;
    u.dimEnd.value = params.dimEnd;

    // --- Occlusion ambiante : rayon adapté à l'échelle (pièce ou objet) ---
    if (pipeline.ao) {
      this.aoRadius = damp(this.aoRadius, aoRadiusFor(this.mode, this.focusValid ? this.focus : null), FADE_RATE, dt);
      pipeline.ao.update(camera, this.aoRadius, this.bufferSize.width, height);
    }

    // --- Contours ---
    const outline = pipeline.outline;
    u.outlineOn.value = outline.active ? 1 : 0;
    outline.pulse.value = blockedPulse(frame.time);
  }

  /** Informations d'état (tests, debug). */
  debugInfo(): PostFXDebugInfo {
    return {
      mode: this.mode,
      config: this.pipeline ? buildConfigKey(this.pipeline.config) : 'aucun',
      focus: this.focusValid ? { ...this.focus } : null,
      focusSource: this.focusSource,
      dofAmount: this.dofAmount,
      dofActive: this.pipeline?.dof?.enabled ?? false,
      dimAmount: this.dimAmount,
      outlineMeshes: this.pipeline?.outline.meshCount ?? 0,
      vignette: this.look.vignette,
      bokehPx: this.lastBokeh,
    };
  }

  dispose(): void {
    this.unsubscribeQuality?.();
    this.unsubscribeQuality = null;
    this.pipeline?.dispose();
    this.pipeline = null;
    const engine = this.engine;
    engine.renderFn = () => engine.renderer.render(engine.scene, engine.camera);
  }

  private render(): void {
    if (this.pipeline) this.pipeline.render();
    else this.engine.renderer.render(this.engine.scene, this.engine.camera);
  }

  /** (Re)construit le graphe pour un profil ; ne fait rien si la structure est inchangée. */
  private build(profile: QualityProfile): void {
    const config = resolveBuildConfig(profile);
    const previous = this.pipeline;
    if (previous && buildConfigKey(previous.config) === buildConfigKey(config)) return;
    const next = new PostPipeline(this.engine, config, this.uniforms);
    for (const kind of OUTLINE_KINDS) next.outline.setObjects(kind, this.outlineLists[kind]);
    this.pipeline = next;
    previous?.dispose();
    try {
      next.warmup(this.uniforms);
    } catch (error) {
      console.warn('[PostFX] Préchauffage incomplet :', error);
    }
  }

  private resolveFocusTarget(camera: THREE.Camera): InspectionFocus | null {
    if (this.mode !== 'inspection' || this.explicitFocus === null) {
      this.focusSource = 'none';
      return null;
    }
    if (this.explicitFocus) {
      this.focusSource = 'explicit';
      return this.explicitFocus;
    }
    if (!this.focusAnchor) {
      this.focusSource = 'none';
      return null;
    }
    this.focusSource = 'auto';
    // Réutilise l'objet de travail : pas d'allocation par image.
    autoFocus.distance = camera.position.distanceTo(this.focusAnchor);
    autoFocus.radius = AUTO_FOCUS_RADIUS;
    return autoFocus;
  }
}

const autoFocus: InspectionFocus = { distance: 1, radius: AUTO_FOCUS_RADIUS };
