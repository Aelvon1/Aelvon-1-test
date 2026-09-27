/**
 * Mode inspection et démontage : orchestrateur.
 *
 * - `open(objet, paramètres)` : état initial du store, transition caméra vers l'établi EN PARALLÈLE
 *   de la préparation/construction (tranches ≤ 8 ms), puis l'objet se pose sur le tapis.
 * - Relie le bus d'événements (`inspection:*`) et les raccourcis clavier au runtime : séquenceur
 *   (pas à pas, démontage libre), éclatement, vue rangée, sélection, masquage/isolation.
 * - Les commandes de VUE (cadrage, coupe, rayons X, étiquettes…) mettent à jour le store ; la
 *   vue (`view/InspectionView` : caméra d'inspection, sélection BVH, rayons X, coupe, étiquettes,
 *   éclairage d'appoint, miniatures) s'y abonne et applique le rendu correspondant.
 * - Remplit `store.inspection` intégralement (seule source de vérité pour l'interface).
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../core/context';
import type { FrameInfo } from '../core/Engine';
import { CameraTween, capturePose, poseLookingAt, type CameraPose } from '../core/cameraTween';
import {
  patchInspection,
  pushToast,
  type InspectionState,
  type PartDynamic,
  type PartStatic,
  type PartTreeNode,
  type StepSummary,
} from '../core/store';
import type { KeyInfo } from '../core/Input';
import type { AppEvents } from '../core/events';
import type { ObjectDef, ObjectParams } from '../objects/types';
import { getObjectDef } from '../objects/registry';
import { mergeParams, partQuantity } from '../objects/resolve';
import { INSPECTION_VIEW } from '../world/layout';
import type { World } from '../world/World';
import { Assembly, type PartRuntime } from './Assembly';
import { boxCorners, fitDistance } from './camera/orbitMath';
import type { InspectionCameraController } from './camera/types';
import { DetailManager } from './detail';
import { dropHeight } from './easing';
import { DisassemblyGraph, type Blockage } from './graph';
import { knollingWeight, KNOLLING_TRANSITION } from './knolling';
import { planKnolling, planParking, type KnollingLabel, type PlacementPlan } from './knollingPlan';
import { PoseComposer } from './poses';
import { Sequencer, type SequencerCommand } from './Sequencer';
import { noopToolPresenter, type ToolPresenter } from './tools/presenter';
import { toolDisplay } from './tools/registry';
import { createInspectionToolPresenter } from './tools/inspectionTools';
import { InspectionView, objectLocalBounds } from './view/InspectionView';

type AnyDef = ObjectDef<ObjectParams>;

/** Durée d'un éclatement complet 0 → 1 (s). */
const EXPLODE_SECONDS = 0.9;
/** Durée de la pose de l'objet sur le tapis (s) et hauteur de départ (m). */
const DROP_SECONDS = 0.5;
const DROP_HEIGHT = 0.035;
/** Durée du contour des pièces bloquantes (s). */
const BLOCKED_OUTLINE_SECONDS = 2.5;

interface KnollingRun {
  plan: PlacementPlan;
  rank: Map<string, number>;
  /** Cible : vue rangée active. */
  active: boolean;
  elapsed: number;
  /** Transition en cours. */
  running: boolean;
}

/** Tout ce qui dépend de l'objet ouvert (libéré d'un bloc). */
interface Session {
  def: AnyDef;
  params: ObjectParams;
  assembly: Assembly;
  graph: DisassemblyGraph;
  composer: PoseComposer;
  sequencer: Sequencer;
  detail: DetailManager;
  parking: PlacementPlan;
  knolling: KnollingRun | null;
  /** Taux d'éclatement réel (suit la cible du store). */
  explodeRate: number;
  drop: { elapsed: number; played: boolean } | null;
  hidden: Set<string>;
  /** Commande de démontage différée (sortie de la vue rangée en cours). */
  deferred: SequencerCommand | null;
  /** Données statiques des étapes (sans statut). */
  stepBase: Omit<StepSummary, 'status'>[];
  /** Bornes de l'objet au repos (monde) et rayon de sa sphère englobante. */
  restBounds: THREE.Box3;
  restRadius: number;
}

const _box = new THREE.Box3();
const _box2 = new THREE.Box3();
const _box3 = new THREE.Box3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _m3 = new THREE.Matrix4();

export class Inspection {
  private tween: CameraTween | null = null;
  private session: Session | null = null;
  /** Jeton d'ouverture : invalide une construction en cours quand un autre objet est demandé. */
  private openToken = 0;
  private camera: InspectionCameraController;
  /** Vue de l'inspection (caméra, sélection, rendu, étiquettes, miniatures). */
  readonly view: InspectionView;
  private toolPresenter: ToolPresenter = noopToolPresenter;
  private readonly disposers: (() => void)[] = [];
  private blockedTimer = 0;
  private devApplied = false;
  private rebuilding = false;
  /** Accélération des animations (`?animspeed=N`, développement : captures automatisées). */
  private readonly timeScale: number;
  /** Assemblage en cours de construction (libéré si l'inspection est fermée entre-temps). */
  private pendingAssembly: Assembly | null = null;
  /**
   * Cadrage demandé par le séquenceur (pas à pas avec `settings.autoFrameSteps`). La vue peut
   * remplacer ce comportement ; par défaut, la caméra temporaire cadre les pièces et leur course.
   */
  onFrameRequest: ((partIds: string[], reinsert: boolean) => void) | null = (ids, reinsert) =>
    this.frameParts(ids, true, reinsert);

  constructor(
    protected readonly ctx: AppContext,
    protected readonly world: World,
  ) {
    this.view = new InspectionView(ctx, world, {
      knollingLabels: () => this.getKnollingLabels(),
      findDef,
      inUse: (id) => {
        const def = findDef(id);
        const current = this.session?.def ?? this.pendingAssembly?.def ?? null;
        return def !== undefined && current !== null && current.id === def.id;
      },
    });
    this.camera = this.view.camera;
    // Outils 3D animés des gestes de démontage (module `tools`).
    this.setToolPresenter(createInspectionToolPresenter(ctx, () => this.assembly));
    const speed = Number(ctx.dev.raw.get('animspeed'));
    this.timeScale = import.meta.env.DEV && Number.isFinite(speed) && speed > 0 ? speed : 1;
    this.wireEvents();
    this.disposers.push(ctx.input.onKeyDown((key) => this.onKey(key)));
    if (import.meta.env.DEV) {
      const w = window as unknown as { __latelier?: Record<string, unknown> };
      if (w.__latelier) w.__latelier.inspection = this;
    }
  }

  // --- API publique -----------------------------------------------------------------------

  /** Assemblage de l'objet ouvert (null pendant la construction ou hors inspection). */
  get assembly(): Assembly | null {
    return this.session?.assembly.isBuilt ? this.session.assembly : null;
  }

  get sequencer(): Sequencer | null {
    return this.session?.sequencer ?? null;
  }

  get composer(): PoseComposer | null {
    return this.session?.composer ?? null;
  }

  /** Ancrages des étiquettes de noms de la vue rangée (vide hors vue rangée). */
  getKnollingLabels(): readonly KnollingLabel[] {
    const k = this.session?.knolling;
    return k && k.active ? k.plan.labels : [];
  }

  /** Branche l'affichage 3D des outils (fourni par le module `tools`). */
  setToolPresenter(presenter: ToolPresenter | null): void {
    this.toolPresenter = presenter ?? noopToolPresenter;
    this.session?.sequencer.setToolPresenter(this.toolPresenter);
  }

  /** Remplace la caméra d'inspection (module de vue). L'ancienne est libérée. */
  setCameraController(controller: InspectionCameraController): void {
    const wasActive = this.camera.active;
    this.camera.dispose();
    this.camera = controller;
    if (wasActive && this.session) this.activateCamera(this.session);
  }

  update(frame: FrameInfo): void {
    const dt = frame.dt * this.timeScale;
    if (this.tween && this.tween.update(dt)) this.tween = null;
    const s = this.session;
    if (!s || !s.assembly.isBuilt) {
      this.view.update(dt);
      return;
    }
    this.updateExplode(s, dt);
    this.updateKnolling(s, dt);
    s.sequencer.update(dt);
    this.updateDrop(s, dt);
    s.composer.apply();
    s.assembly.update(dt, frame.time);
    s.detail.update(dt, this.ctx.engine.camera);
    if (!this.tween) this.camera.update(dt);
    this.view.update(dt);
    if (this.blockedTimer > 0) {
      this.blockedTimer -= dt;
      if (this.blockedTimer <= 0) {
        this.ctx.postfx.setOutline('blocked', []);
        patchInspection(this.ctx.store, { blocked: null });
      }
    }
  }

  /** Ouvre l'inspection d'un objet : transition caméra et construction en parallèle. */
  async open(objectId: string, params?: ObjectParams): Promise<void> {
    const def = findDef(objectId);
    if (!def) throw new Error(`Objet inconnu : « ${objectId} ».`);
    const token = ++this.openToken;
    const previous = this.ctx.store.getState().inspection;
    this.disposeSession();
    this.camera.deactivate();
    const merged = mergeParams(def, params);
    this.ctx.store.setState({ inspection: this.initialState(def, merged, previous) });
    this.world.setInspectionMode({ active: true, neutral: previous?.neutralBackground ?? false });
    this.ctx.postfx.setMode('inspection');

    const to = poseLookingAt(this.world.bench.viewPosition, this.world.bench.matCenter, INSPECTION_VIEW.fov);
    const tweenDone = this.startTween(to, 1.6);
    try {
      const [session] = await Promise.all([this.createSession(def, merged, token), tweenDone]);
      if (!session || token !== this.openToken) return;
      this.startSession(session);
    } catch (error) {
      if (token === this.openToken) {
        this.disposeSession();
        this.ctx.store.setState({ inspection: null });
        this.world.setInspectionMode({ active: false, neutral: false });
      }
      throw error;
    }
  }

  /** Ferme l'inspection : retour caméra vers `returnPose`, puis libération. */
  async close(returnPose: CameraPose): Promise<void> {
    const token = ++this.openToken;
    this.camera.deactivate();
    this.view.deactivate();
    this.session?.sequencer.cancel();
    this.view.selection.showSelected(null, null);
    this.view.selection.showHover(null);
    this.ctx.postfx.setOutline('blocked', []);
    await this.startTween(returnPose, 1.3);
    // Un autre objet a été ouvert pendant le retour caméra : il ne doit pas être libéré.
    if (token !== this.openToken) return;
    this.disposeSession();
    this.ctx.store.setState({ inspection: null });
    this.world.setInspectionMode({ active: false, neutral: false });
  }

  /**
   * Transition caméra. Une transition en cours est terminée d'abord (sa promesse est résolue :
   * un appelant qui l'attend ne reste jamais bloqué).
   */
  private startTween(to: CameraPose, duration: number): Promise<void> {
    const camera = this.ctx.engine.camera;
    const from = capturePose(camera);
    this.tween?.update(Number.MAX_VALUE);
    this.tween = new CameraTween(camera, from, to, duration);
    return this.tween.done;
  }

  /** Génère les miniatures d'inventaire manquantes (étalées sur plusieurs images). */
  async renderThumbnails(objectIds: string[]): Promise<void> {
    this.view.thumbnails.request(objectIds);
  }

  dispose(): void {
    this.openToken++;
    this.disposeSession();
    this.camera.dispose();
    this.view.dispose();
    this.toolPresenter.dispose();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.tween = null;
  }

  // --- Construction -----------------------------------------------------------------------

  private initialState(def: AnyDef, params: ObjectParams, previous: InspectionState | null): InspectionState {
    return {
      objectId: def.id,
      objectName: def.name,
      params,
      paramSchema: def.paramSchema,
      presets: def.presets ?? [],
      tree: [],
      partStatic: {},
      parts: {},
      selected: null,
      hoveredId: null,
      mode: previous?.mode ?? 'step',
      steps: [],
      stepCursor: 0,
      playingStep: null,
      explode: 0,
      labels: previous?.labels ?? false,
      knolling: false,
      xray: previous?.xray ?? false,
      // Même objet (reconstruction) : réglages de coupe conservés ; autre objet : axe par défaut
      // tourné vers la vue initiale (activation reprise de l'inspection précédente).
      section:
        previous && previous.objectId === def.id
          ? previous.section
          : { ...defaultSection(def), enabled: previous?.section.enabled ?? false },
      isolatedId: null,
      neutralBackground: previous?.neutralBackground ?? false,
      busy: false,
      blocked: null,
      activeToolId: null,
      leftPanelOpen: previous?.leftPanelOpen ?? true,
      rightPanelOpen: previous?.rightPanelOpen ?? true,
      buildProgress: 0,
    };
  }

  /** Construit l'objet et son runtime ; retourne null si la construction a été abandonnée. */
  private async createSession(def: AnyDef, params: ObjectParams, token: number): Promise<Session | null> {
    const { ctx } = this;
    const assembly = new Assembly(def, params, {
      materials: ctx.materials,
      textures: ctx.textures,
      quality: ctx.engine.quality.level,
      maxAnisotropy: ctx.engine.maxAnisotropy,
      matCenter: this.world.bench.matCenter,
    });
    const graph = new DisassemblyGraph(
      assembly.resolved.parts,
      assembly.resolved.steps,
      new Set(assembly.resolved.allParts.map((p) => p.id)),
    );
    this.pendingAssembly = assembly;
    let lastPatch = 0;
    const ok = await assembly.build((value) => {
      const now = performance.now();
      if (token !== this.openToken || (now - lastPatch < 50 && value < 1)) return;
      lastPatch = now;
      patchInspection(ctx.store, { buildProgress: value });
    });
    if (this.pendingAssembly === assembly) this.pendingAssembly = null;
    if (!ok || token !== this.openToken) {
      assembly.dispose();
      return null;
    }
    const composer = new PoseComposer(assembly);
    const sequencer = new Sequencer({
      assembly,
      composer,
      graph,
      audio: ctx.audio,
      placementSetting: () => ctx.store.getState().settings.removedPlacement,
      autoFrame: () => ctx.store.getState().settings.autoFrameSteps,
      listener: {
        onStateChange: () => this.syncDynamic(),
        onStepStarted: (index) => ctx.bus.emit('inspection:stepStarted', { index }),
        onStepFinished: (index) => {
          ctx.bus.emit('inspection:stepFinished', { index });
          this.frameCompletion();
        },
        onBlocked: (partId, blockage, reinsert) => this.reportBlocked(partId, blockage, reinsert),
        onToolChange: (toolId) => patchInspection(ctx.store, { activeToolId: toolId }),
        onFrameRequest: (ids, reinsert) => this.onFrameRequest?.(ids, reinsert),
      },
    });
    const restBounds = assembly.objectBounds(new THREE.Box3());
    const session: Session = {
      def,
      params,
      assembly,
      graph,
      composer,
      sequencer,
      detail: new DetailManager(assembly, composer, ctx.idle),
      parking: planParking(assembly, graph, restBounds),
      restBounds,
      restRadius: restBounds.getBoundingSphere(new THREE.Sphere()).radius,
      knolling: null,
      explodeRate: 0,
      drop: null,
      hidden: new Set(),
      deferred: null,
      stepBase: graph.steps.map((step) => {
        const tool = toolDisplay(step.toolId);
        return {
          id: step.id,
          index: step.index,
          title: step.title,
          description: step.description,
          partIds: [...step.parts],
          toolId: step.toolId,
          toolName: tool?.name ?? null,
          toolIcon: tool?.icon ?? null,
          destructive: step.destructive,
        };
      }),
    };
    session.sequencer.setToolPresenter(this.toolPresenter);
    // Cibles de rangement (« park ») connues dès la construction.
    for (const [id, m] of session.parking.targets) composer.get(id)!.parkTarget = m;
    for (const [id, list] of session.parking.instanceTargets) composer.get(id)!.parkInstanceTargets = list;
    composer.setExplodeRate(0);
    composer.apply(true);
    return session;
  }

  /** L'objet est construit et la caméra arrivée : pose sur le tapis, store complet, contrôles. */
  private startSession(session: Session): void {
    this.session = session;
    const failed = session.assembly.buildErrors;
    if (failed.length)
      pushToast(
        this.ctx.store,
        `${failed.length} pièce(s) n'ont pas pu être construites (voir la console).`,
        'error',
        6000,
      );
    const root = session.assembly.root;
    this.view.objectParent.add(root);
    session.drop = { elapsed: 0, played: false };
    this.fillStaticState(session);
    this.syncDynamic();
    this.view.attach(session);
    this.activateCamera(session);
    this.view.activate();
    if (!this.devApplied) {
      this.devApplied = true;
      this.applyDevParams(session);
    }
  }

  private activateCamera(session: Session): void {
    const assembly = session.assembly;
    const bounds = assembly.objectBounds(_box);
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const pres = session.def.presentation;
    const dirObj = pres?.viewDirection ?? [0.3, 0.75, 1];
    const direction = new THREE.Vector3(dirObj[0], dirObj[1], dirObj[2])
      .normalize()
      .applyQuaternion(assembly.root.quaternion);
    const camera = this.ctx.engine.camera;
    let distance = fitDistance(sphere.radius, INSPECTION_VIEW.fov, camera.aspect, 1.4);
    // Coins de la boîte de l'objet dans son propre repère (plus serrée que la boîte alignée monde
    // d'un objet tourné) : cadrage serré de la vue initiale dans la zone libre, visée au centre.
    assembly.root.updateWorldMatrix(true, false);
    const hull = boxCorners(objectLocalBounds(assembly, _box2), assembly.root.matrixWorld, []);
    const target = _box2.getCenter(new THREE.Vector3()).applyMatrix4(assembly.root.matrixWorld);
    const view = this.ctx.dev.view;
    let instant = false;
    if (!this.devApplied && view && view.length >= 3) {
      direction.set(view[0]!, view[1]!, view[2]!).normalize();
      if (view.length >= 4 && view[3]! > 0) distance = view[3]!;
      // `?viewtarget=x,y,z` : cible dans le repère de l'objet (captures macro reproductibles).
      const vt = (this.ctx.dev.raw.get('viewtarget') ?? '').split(',').map(Number);
      if (vt.length === 3 && vt.every(Number.isFinite)) {
        target.set(vt[0]!, vt[1]!, vt[2]!).applyMatrix4(assembly.root.matrixWorld);
      }
      instant = true;
    }
    this.camera.activate({
      target,
      direction,
      distance,
      // Rayon cadré : la vue initiale est recadrée dans la zone libre de l'écran (panneaux).
      radius: sphere.radius,
      hull,
      minDistance: pres?.minSurfaceDistance ?? 0.002,
      instant,
    });
  }

  private disposeSession(): void {
    this.pendingAssembly?.dispose();
    this.pendingAssembly = null;
    const s = this.session;
    if (!s) return;
    this.session = null;
    // La vue restitue d'abord les matériaux d'origine (rayons X, coupe) avant toute libération.
    this.view.detach();
    s.sequencer.dispose();
    s.detail.dispose();
    s.composer.dispose();
    s.assembly.dispose();
    this.ctx.postfx.setOutline('blocked', []);
    this.blockedTimer = 0;
  }

  /** Reconstruction avec d'autres paramètres (état de démontage remis à zéro). */
  private async rebuild(params: ObjectParams): Promise<void> {
    const current = this.ctx.store.getState().inspection;
    const def = this.session?.def ?? (current ? findDef(current.objectId) : undefined);
    if (!def || this.rebuilding || !current) return;
    this.rebuilding = true;
    const token = ++this.openToken;
    try {
      this.disposeSession();
      const merged = mergeParams(def, params);
      this.ctx.store.setState({ inspection: this.initialState(def, merged, current) });
      const session = await this.createSession(def, merged, token);
      if (session && token === this.openToken) this.startSession(session);
    } catch (error) {
      console.error('[Inspection] Reconstruction impossible :', error);
      pushToast(this.ctx.store, `Reconstruction impossible : ${(error as Error).message}`, 'error', 6000);
      patchInspection(this.ctx.store, { buildProgress: null });
    } finally {
      this.rebuilding = false;
    }
  }

  // --- Store ------------------------------------------------------------------------------

  private fillStaticState(session: Session): void {
    const { assembly, graph } = session;
    const params = assembly.params;
    const partStatic: Record<string, PartStatic> = {};
    for (const part of assembly.order) {
      const def = part.def;
      partStatic[part.id] = {
        id: part.id,
        name: def.name,
        parent: part.parentId,
        kind: def.kind ?? 'part',
        quantity: partQuantity(def, params),
        info: def.info,
        removable: graph.isRemovable(part.id),
        destructive: def.removal?.destructive === true,
        toolId: def.removal?.tool ?? null,
      };
    }
    const physical = (id: string): number => {
      const part = assembly.parts.get(id)!;
      const own = part.def.kind === 'assembly' && !part.def.build ? 0 : partQuantity(part.def, params);
      return own + part.children.reduce((sum, c) => sum + physical(c), 0);
    };
    const node = (id: string): PartTreeNode => {
      const part = assembly.parts.get(id)!;
      const kind = part.def.kind ?? 'part';
      return {
        id,
        name: part.def.name,
        kind,
        quantity: kind === 'assembly' ? physical(id) : partQuantity(part.def, params),
        children: part.children.map(node),
      };
    };
    const tree = assembly.order.filter((p) => !p.parentId).map((p) => node(p.id));
    patchInspection(this.ctx.store, { tree, partStatic, buildProgress: null });
  }

  /** Synchronise l'état dynamique (pièces, étapes, occupation) avec le store. */
  private syncDynamic(): void {
    const s = this.session;
    if (!s) return;
    const state = this.ctx.store.getState().inspection;
    if (!state) return;
    const removed = s.sequencer.removed;
    const parts: Record<string, PartDynamic> = {};
    for (const part of s.assembly.order) {
      parts[part.id] = {
        removed: removed.has(part.id),
        hidden: s.composer.get(part.id)?.userHidden ?? false,
        animating: s.sequencer.isAnimating(part.id),
      };
    }
    const steps: StepSummary[] = s.stepBase.map((base) => ({
      ...base,
      status: s.graph.stepStatus(base.index, removed),
    }));
    patchInspection(this.ctx.store, {
      parts,
      steps,
      stepCursor: s.graph.cursor(removed),
      playingStep: s.sequencer.playingStep,
      busy: s.sequencer.busy,
    });
  }

  // --- Événements ------------------------------------------------------------------------

  private wireEvents(): void {
    const { bus, store } = this.ctx;
    const on = <K extends keyof AppEvents>(type: K, handler: (payload: AppEvents[K]) => void) =>
      this.disposers.push(bus.on(type, handler));

    on('inspection:mode', ({ mode }) => patchInspection(store, { mode }));
    on('inspection:step', (cmd) => this.disassemblyCommand(cmd));
    on('inspection:toggleRemove', ({ partId }) => this.disassemblyCommand({ kind: 'toggle', partId }));
    on('inspection:resetObject', () => {
      const s = this.session;
      if (!s) return;
      s.deferred = null;
      s.sequencer.reset();
      patchInspection(store, { blocked: null });
    });
    on('inspection:explode', ({ value, animate }) => {
      const v = Math.min(1, Math.max(0, value));
      patchInspection(store, { explode: v });
      if (animate === false && this.session) {
        this.session.explodeRate = v;
        this.session.composer.setExplodeRate(v);
      }
    });
    on('inspection:toggleExplode', () => {
      const current = store.getState().inspection;
      if (current) patchInspection(store, { explode: current.explode > 0.5 ? 0 : 1 });
    });
    on('inspection:select', ({ partId, instance }) => this.select(partId, instance ?? null));
    on('inspection:hover', ({ partId }) => {
      const current = store.getState().inspection;
      if (!current) return;
      const id = partId && this.assembly?.parts.has(partId) ? partId : null;
      if (current.hoveredId !== id) patchInspection(store, { hoveredId: id });
      this.view.selection.showHover(id);
    });
    on('inspection:frame', ({ partId }) => {
      const selected = store.getState().inspection?.selected ?? null;
      const id = partId ?? selected?.partId ?? null;
      const a = this.assembly;
      const inst = a && id ? a.parts.get(id)?.instanced : null;
      if (a && id && inst && selected?.partId === id && selected.instance !== null) {
        // Instance sélectionnée (vis, bille, tôle…) : cadrage de cette seule instance.
        _box.copy(inst.instanceBox).applyMatrix4(a.instanceWorldMatrix(id, selected.instance, _m));
        this.camera.frameBox(_box);
      } else if (id) this.frameParts([id], false);
      else if (a) this.camera.frameBox(a.objectBounds(_box));
    });
    on('inspection:resetView', () => this.camera.resetView());
    on('inspection:setHidden', ({ partId, hidden }) => this.setHidden(partId, hidden));
    on('inspection:isolate', ({ partId }) => {
      this.isolate(partId);
      if (partId && this.assembly?.parts.has(partId)) this.frameParts([partId], false);
    });
    on('inspection:showAll', () => {
      this.session?.hidden.clear();
      patchInspection(store, { isolatedId: null });
      this.applyHidden();
    });
    on('inspection:labels', ({ enabled }) => patchInspection(store, { labels: enabled }));
    on('inspection:knolling', ({ enabled }) => this.setKnolling(enabled, false));
    on('inspection:xray', ({ enabled }) => patchInspection(store, { xray: enabled }));
    on('inspection:section', (patch) => {
      const current = store.getState().inspection;
      if (!current) return;
      const section = { ...current.section };
      if (patch.enabled !== undefined) section.enabled = patch.enabled;
      if (patch.axis !== undefined) section.axis = patch.axis;
      if (patch.position !== undefined) section.position = Math.min(1, Math.max(0, patch.position));
      if (patch.flip !== undefined) section.flip = patch.flip;
      patchInspection(store, { section });
    });
    on('inspection:neutralBackground', ({ enabled }) => {
      patchInspection(store, { neutralBackground: enabled });
      if (store.getState().inspection) this.world.setInspectionMode({ active: true, neutral: enabled });
    });
    on('inspection:panels', ({ left, right }) => {
      const patch: Partial<InspectionState> = {};
      if (left !== undefined) patch.leftPanelOpen = left;
      if (right !== undefined) patch.rightPanelOpen = right;
      patchInspection(store, patch);
    });
    on('inspection:params', ({ params }) => void this.rebuild(params));
  }

  /** Raccourcis clavier de l'inspection : émettent les mêmes événements que l'interface. */
  private onKey(key: KeyInfo): void {
    if (this.ctx.machine.phase !== 'inspection' || key.inTextField || key.repeat) return;
    if (key.ctrl || key.meta || key.alt) return;
    const { bus, store } = this.ctx;
    const state = store.getState().inspection;
    if (!state) return;
    const selected = state.selected?.partId ?? null;
    if (key.code === 'Space' || key.code === 'ArrowRight') {
      key.preventDefault();
      bus.emit('inspection:step', { kind: 'next' });
      return;
    }
    if (key.code === 'ArrowLeft') {
      key.preventDefault();
      bus.emit('inspection:step', { kind: 'prev' });
      return;
    }
    switch (key.key) {
      case 'x':
        bus.emit('inspection:toggleExplode');
        break;
      case 'k':
        bus.emit('inspection:knolling', { enabled: !state.knolling });
        break;
      case 'l':
        bus.emit('inspection:labels', { enabled: !state.labels });
        break;
      case 'f':
        bus.emit('inspection:frame', selected ? { partId: selected } : {});
        break;
      case 'r':
        bus.emit('inspection:resetView');
        break;
      case 'i':
        bus.emit('inspection:isolate', { partId: state.isolatedId ? null : selected });
        break;
      case 'h':
        if (key.shift) bus.emit('inspection:showAll');
        else if (selected) bus.emit('inspection:setHidden', { partId: selected, hidden: true });
        break;
      case 'c':
        bus.emit('inspection:section', { enabled: !state.section.enabled });
        break;
    }
  }

  private disassemblyCommand(cmd: SequencerCommand): void {
    const s = this.session;
    if (!s || !s.assembly.isBuilt) return;
    if (s.knolling?.active || s.knolling?.running) {
      // La vue rangée se referme d'abord, puis la commande s'exécute.
      s.deferred = cmd;
      if (s.knolling.active) this.setKnolling(false, false);
      return;
    }
    s.sequencer.command(cmd);
  }

  private reportBlocked(partId: string, blockage: Blockage, reinsert: boolean): void {
    const s = this.session;
    const { store, bus, postfx } = this.ctx;
    if (!s) return;
    const nameOf = (id: string) => s.assembly.parts.get(id)?.def.name ?? id;
    if (blockage.blockers.length === 0) {
      pushToast(store, blockage.reason ?? 'Opération impossible.', 'warning');
      return;
    }
    const names = blockage.blockers.map(nameOf).join(', ');
    const message =
      reinsert && blockage.reason === 'Remonter d’abord'
        ? `Remonter d'abord : ${names}`
        : `Bloqué par : ${names}`;
    patchInspection(store, { blocked: { partId, blockers: [...blockage.blockers] } });
    bus.emit('inspection:blocked', { partId, blockers: [...blockage.blockers] });
    pushToast(store, message, 'warning');
    this.ctx.audio.play('ui.error');
    postfx.setOutline(
      'blocked',
      blockage.blockers.flatMap((id) => s.assembly.meshesOf(id, true)),
    );
    this.blockedTimer = BLOCKED_OUTLINE_SECONDS;
  }

  private select(partId: string | null, instance: number | null): void {
    const a = this.assembly;
    if (!a || !partId || !a.parts.has(partId)) {
      patchInspection(this.ctx.store, { selected: null });
      this.view.selection.showSelected(null, null);
      return;
    }
    const part = a.parts.get(partId)!;
    const inst = part.instanced && instance !== null && instance < part.instanced.count ? instance : null;
    patchInspection(this.ctx.store, {
      selected: {
        partId,
        instance: inst,
        instanceLabel: inst !== null ? a.instanceLabelOf(partId, inst) : null,
      },
    });
    this.view.selection.showSelected(partId, inst);
  }

  // --- Masquage / isolation ---------------------------------------------------------------

  private setHidden(partId: string, hidden: boolean): void {
    const s = this.session;
    if (!s || !s.assembly.parts.has(partId)) return;
    const subtree = s.assembly.subtreeIds(partId);
    for (const id of subtree) {
      if (hidden) s.hidden.add(id);
      else s.hidden.delete(id);
    }
    this.applyHidden();
    // Une pièce masquée ne reste ni sélectionnée ni survolée.
    const state = this.ctx.store.getState().inspection;
    if (hidden && state?.selected && subtree.includes(state.selected.partId)) this.select(null, null);
    if (hidden && state?.hoveredId && subtree.includes(state.hoveredId))
      this.ctx.bus.emit('inspection:hover', { partId: null });
  }

  private isolate(partId: string | null): void {
    const s = this.session;
    if (!s) return;
    patchInspection(this.ctx.store, { isolatedId: partId && s.assembly.parts.has(partId) ? partId : null });
    this.applyHidden();
  }

  /** Visibilité effective : masquage utilisateur + isolation (le sous-arbre isolé reste visible). */
  private applyHidden(): void {
    const s = this.session;
    if (!s) return;
    const isolated = this.ctx.store.getState().inspection?.isolatedId ?? null;
    const keep = isolated ? new Set(s.assembly.subtreeIds(isolated)) : null;
    for (const part of s.assembly.order) {
      const pose = s.composer.get(part.id)!;
      pose.userHidden = s.hidden.has(part.id) || (keep !== null && !keep.has(part.id));
      s.composer.refreshVisibility(part.id);
    }
    this.syncDynamic();
  }

  // --- Cadrage ----------------------------------------------------------------------------

  /**
   * Cadre des pièces ; `withTravel` inclut leur course de retrait (pas à pas). `reinsert`
   * (remontage) : c'est la place de chaque pièce dans son parent (pose de repos, parent tel qu'il
   * est maintenant) et l'entrée de sa course qui sont cadrées, et non sa position actuelle
   * (rangée au bord du tapis, vide une fois la pièce remontée) : la pièce revient dans le champ,
   * le geste de remontage se fait au centre.
   */
  private frameParts(ids: readonly string[], withTravel: boolean, reinsert = false): void {
    const a = this.assembly;
    const s = this.session;
    if (!a || !s) return;
    _box2.makeEmpty();
    const moving = new Set(ids);
    for (const id of ids) {
      a.worldBounds(id, _box);
      if (_box.isEmpty()) continue;
      if (!(withTravel && reinsert)) _box2.union(_box);
      const part = a.parts.get(id);
      const removal = part?.def.removal;
      if (withTravel && reinsert && part) {
        // Place de repos : relative au plus proche ancêtre qui ne revient pas avec l'étape (posé
        // dans l'objet, ou resté rangé), en composant les poses de repos de la chaîne.
        const chain: PartRuntime[] = [part];
        let anchor = part.parentId ? a.parts.get(part.parentId) : undefined;
        while (anchor && moving.has(anchor.id)) {
          chain.push(anchor);
          anchor = anchor.parentId ? a.parts.get(anchor.parentId) : undefined;
        }
        const anchorNode = anchor ? anchor.node : a.root;
        anchorNode.updateWorldMatrix(true, false);
        _m.copy(anchorNode.matrixWorld);
        for (let k = chain.length - 1; k >= 0; k--) {
          const c = chain[k]!;
          _m.multiply(_m2.compose(c.restPosition, c.restQuaternion, c.restScale));
        }
        const local = part.subtreeBox.isEmpty() ? part.localBox : part.subtreeBox;
        if (local.isEmpty()) _box2.union(_box);
        else {
          _box3.copy(local).applyMatrix4(_m);
          _box2.union(_box3);
          if (removal) {
            // Entrée de la course : axe de retrait dans le repère du parent au repos.
            _m2
              .copy(_m)
              .multiply(_m3.compose(part.restPosition, part.restQuaternion, part.restScale).invert());
            _v.set(removal.axis[0], removal.axis[1], removal.axis[2]).normalize().transformDirection(_m2);
            _box2.union(_box3.translate(_v.multiplyScalar(removal.distance)));
          }
        }
      } else if (withTravel && removal && part) {
        // Écartement des instances (tôles, billes) : toute son étendue est cadrée (repère du
        // nœud de la pièce, comme dans `PoseComposer`), avant la course de retrait.
        const spread = removal.spread;
        const count = part.instanced?.count ?? 0;
        if (spread && count > 1) {
          part.node.updateWorldMatrix(true, false);
          if (spread.mode === 'linear') {
            _v2.setFromMatrixPosition(part.node.matrixWorld);
            _v.set(spread.step[0], spread.step[1], spread.step[2])
              .multiplyScalar(count - 1)
              .applyMatrix4(part.node.matrixWorld)
              .sub(_v2);
            _box2.union(_box3.copy(_box).translate(_v));
          } else {
            _box2.union(
              _box3.copy(_box).expandByScalar(spread.distance * part.node.matrixWorld.getMaxScaleOnAxis()),
            );
          }
        }
        const parent = part.node.parent;
        _v.set(removal.axis[0], removal.axis[1], removal.axis[2]).normalize();
        if (parent) _v.applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()));
        _box.translate(_v.multiplyScalar(removal.distance));
        _box2.union(_box);
      }
    }
    if (_box2.isEmpty()) return;
    if (withTravel) {
      // Contexte minimal : au moins la moitié de l'objet (au repos) autour des pièces.
      const sphere = _box2.getBoundingSphere(new THREE.Sphere());
      if (sphere.radius < s.restRadius * 0.5) _box2.expandByScalar(s.restRadius * 0.5 - sphere.radius);
    }
    this.camera.frameBox(_box2);
  }

  /**
   * Démontage pas à pas terminé (dernière étape jouée, cadrage automatique actif) : vue d'ensemble
   * de l'objet et de TOUTES les pièces rangées, destinations de rangement comprises (les
   * dernières pièces sont encore en vol vers leur emplacement).
   */
  private frameCompletion(): void {
    const s = this.session;
    const a = this.assembly;
    if (!s || !a || !this.ctx.store.getState().settings.autoFrameSteps) return;
    if (s.graph.cursor(s.sequencer.removed) < s.graph.steps.length) return;
    a.objectBounds(_box2);
    for (const id of s.sequencer.removed) {
      const pose = s.composer.get(id);
      if (!pose || s.sequencer.effectivePlacement(pose.part) !== 'park') continue;
      if (pose.parkInstanceTargets) {
        for (const m of pose.parkInstanceTargets) _box2.expandByPoint(_v.setFromMatrixPosition(m));
      } else if (pose.parkTarget) _box2.expandByPoint(_v.setFromMatrixPosition(pose.parkTarget));
    }
    if (!_box2.isEmpty()) this.camera.frameBox(_box2);
  }

  // --- Éclatement, vue rangée, pose -------------------------------------------------------

  private updateExplode(s: Session, dt: number): void {
    const target = this.ctx.store.getState().inspection?.explode ?? 0;
    if (s.explodeRate === target) return;
    const step = dt / EXPLODE_SECONDS;
    s.explodeRate =
      target > s.explodeRate
        ? Math.min(target, s.explodeRate + step)
        : Math.max(target, s.explodeRate - step);
    s.composer.setExplodeRate(s.explodeRate);
  }

  /** Active/désactive la vue rangée (animation décalée ~1,2 s ; `instant` pour les captures). */
  private setKnolling(enabled: boolean, instant: boolean): void {
    const s = this.session;
    if (!s || !s.assembly.isBuilt) {
      patchInspection(this.ctx.store, { knolling: enabled });
      return;
    }
    if (enabled && s.sequencer.busy) {
      pushToast(this.ctx.store, 'Vue rangée disponible après l’animation en cours.', 'info');
      return;
    }
    patchInspection(this.ctx.store, { knolling: enabled });
    if (!s.knolling) {
      if (!enabled) return;
      const plan = planKnolling(s.assembly, s.graph);
      if (!plan.fits)
        console.warn('[Inspection] Vue rangée : place insuffisante sur l’établi, chevauchements possibles.');
      s.knolling = {
        plan,
        rank: new Map(plan.order.map((id, i) => [id, i] as const)),
        active: false,
        elapsed: 0,
        running: false,
      };
      for (const [id, m] of plan.targets) s.composer.get(id)!.knollTarget = m;
      for (const [id, list] of plan.instanceTargets) s.composer.get(id)!.knollInstanceTargets = list;
    }
    const k = s.knolling;
    if (k.active === enabled && !instant) return;
    // Cadrage : toute la vue rangée, ou l'objet au repos au retour.
    this.camera.frameBox(enabled ? k.plan.bounds : s.restBounds);
    // Reprise d'une transition interrompue : on repart du point symétrique.
    const total = KNOLLING_TRANSITION.total;
    k.elapsed = k.running ? Math.max(0, total - k.elapsed) : 0;
    k.active = enabled;
    k.running = true;
    if (instant) k.elapsed = total;
    this.ctx.audio.play('ui.click');
  }

  private updateKnolling(s: Session, dt: number): void {
    const k = s.knolling;
    if (!k || !k.running) return;
    k.elapsed += dt;
    const n = k.plan.order.length;
    for (const [id, rank] of k.rank) {
      const pose = s.composer.get(id);
      if (!pose) continue;
      // Entrée : de la première à la dernière pièce ; sortie : ordre inverse.
      const weight = k.active
        ? knollingWeight(k.elapsed, rank, n)
        : 1 - knollingWeight(k.elapsed, n - 1 - rank, n);
      if (weight !== pose.knollWeight) {
        pose.knollWeight = weight;
        s.composer.markDirty(id);
      }
    }
    s.composer.refreshAllVisibility();
    if (k.elapsed >= KNOLLING_TRANSITION.total) {
      k.running = false;
      if (!k.active && s.deferred) {
        const cmd = s.deferred;
        s.deferred = null;
        s.sequencer.command(cmd);
      }
    }
  }

  private updateDrop(s: Session, dt: number): void {
    const d = s.drop;
    if (!d) return;
    d.elapsed += dt;
    const u = Math.min(1, d.elapsed / DROP_SECONDS);
    const root = s.assembly.root;
    root.position.y = this.world.bench.matCenter.y + DROP_HEIGHT * dropHeight(u);
    if (!d.played && u >= 0.62) {
      d.played = true;
      this.ctx.audio.play('part.drop.plastic', { position: root.position, volume: 0.9 });
    }
    s.composer.markDirty();
    if (u >= 1) s.drop = null;
  }

  // --- Paramètres de développement --------------------------------------------------------

  private applyDevParams(s: Session): void {
    const dev = this.ctx.dev;
    const { store } = this.ctx;
    if (dev.steps !== null && dev.steps > 0) s.sequencer.applyStepsInstant(Math.floor(dev.steps));
    if (dev.explode !== null) {
      const v = Math.min(1, Math.max(0, dev.explode));
      patchInspection(store, { explode: v });
      s.explodeRate = v;
      s.composer.setExplodeRate(v);
    }
    if (dev.knolling) {
      this.setKnolling(true, true);
      this.updateKnolling(s, 0);
    }
    if (dev.select) this.select(dev.select, null);
    if (dev.labels) patchInspection(store, { labels: true });
    if (dev.xray) patchInspection(store, { xray: true });
    if (dev.section)
      patchInspection(store, {
        section: { enabled: true, axis: dev.section.axis, position: dev.section.position, flip: false },
      });
    if (dev.neutral) {
      patchInspection(store, { neutralBackground: true });
      this.world.setInspectionMode({ active: true, neutral: true });
    }
    if (dev.steps !== null || dev.explode !== null || dev.knolling) {
      // Capture reproductible : pas d'animation de pose.
      s.drop = null;
      s.assembly.root.position.y = this.world.bench.matCenter.y;
    }
    s.composer.markDirty();
    s.composer.apply();
  }
}

/**
 * Coupe par défaut d'un objet : axe (repère de l'objet) le plus aligné sur la direction de la vue
 * initiale, sens choisi pour que la face coupée soit tournée vers la caméra (côté conservé :
 * coordonnées inférieures à la coupe, face de coupe vers +axe si `flip` est faux).
 */
export function defaultSection(def: AnyDef): InspectionState['section'] {
  const d = def.presentation?.viewDirection ?? [0.3, 0.75, 1];
  const abs = d.map(Math.abs);
  const i = abs[2]! >= abs[0]! && abs[2]! >= abs[1]! ? 2 : abs[1]! >= abs[0]! ? 1 : 0;
  return { enabled: false, axis: (['x', 'y', 'z'] as const)[i]!, position: 0.5, flip: d[i]! < 0 };
}

/** Définition d'objet ; les objets de développement (dossiers « _x ») répondent aussi à « _x ». */
function findDef(objectId: string): AnyDef | undefined {
  return getObjectDef(objectId) ?? (objectId.startsWith('_') ? getObjectDef(objectId.slice(1)) : undefined);
}
