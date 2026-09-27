/**
 * Séquenceur du démontage : pas à pas A → Z (suivant / précédent / aller à) et démontage libre.
 *
 * - État partagé : ensemble des pièces retirées + graphe de démontage des paramètres courants.
 * - Un geste = [retour du rangement éventuel] → approche de l'outil → mouvement de la pièce →
 *   retrait de l'outil, affiché par un `ToolPresenter` injectable (`setToolPresenter`).
 * - Une étape s'exécute par couches topologiques ; les pièces d'une couche partent en parallèle
 *   avec un léger décalage. « Aller à » enchaîne les étapes en accéléré.
 * - Après un retrait, la pièce reste en fin de course (`stay`), glisse vers son emplacement de
 *   rangement (`park`) ou disparaît en fondu (`hide`). Le remontage part de la position courante.
 * - Pendant une animation (occupé), une seule commande est mise en file (la dernière reçue).
 */
import * as THREE from 'three/webgpu';
import type { AudioApi, LoopHandle, SoundId } from '../audio/types';
import type { RemovedPlacementSetting } from '../core/settings';
import type { RemovalSpec, RemovedPlacement } from '../objects/types';
import type { Assembly, PartRuntime } from './Assembly';
import type { Blockage, DisassemblyGraph } from './graph';
import {
  createMotionSample,
  heatLoopFor,
  heatWindow,
  instanceProgress,
  motionCues,
  motionTiming,
  quarterTurnIndex,
  quarterTurnSound,
  removalProgress,
  sampleMotion,
  staggeredDuration,
  type MotionCue,
  type MotionTiming,
} from './motions';
import type { PartPose, PoseComposer } from './poses';
import {
  TOOL_APPROACH_SECONDS,
  TOOL_RETRACT_SECONDS,
  noopToolPresenter,
  type ToolPresenter,
} from './tools/presenter';

export type SequencerCommand =
  { kind: 'next' } | { kind: 'prev' } | { kind: 'goto'; index: number } | { kind: 'toggle'; partId: string };

/** Notifications du séquenceur vers l'orchestrateur (mise à jour du store, sons d'UI…). */
export interface SequencerListener {
  /** L'état (pièces retirées, animations, occupation) a changé. */
  onStateChange(): void;
  onStepStarted(index: number): void;
  onStepFinished(index: number): void;
  onBlocked(partId: string, blockage: Blockage, reinsert: boolean): void;
  onToolChange(toolId: string | null): void;
  /**
   * Demande de cadrage des pièces d'une étape (si le réglage est actif). `reinsert` : remontage
   * (les pièces rejoignent leur place dans l'objet, qui doit aussi être cadrée).
   */
  onFrameRequest(partIds: string[], reinsert: boolean): void;
}

export interface SequencerOptions {
  assembly: Assembly;
  composer: PoseComposer;
  graph: DisassemblyGraph;
  audio: AudioApi;
  /** Réglage utilisateur du placement des pièces retirées. */
  placementSetting: () => RemovedPlacementSetting;
  autoFrame: () => boolean;
  listener: SequencerListener;
}

/** Durées (s) des transitions de placement. */
export const PARK_SECONDS = 0.6;
export const HIDE_SECONDS = 0.4;
export const UNHIDE_SECONDS = 0.3;
/** Décalage entre pièces d'une même couche (s). */
const LAYER_STAGGER = 0.12;
/** Accélération du mode « aller à ». */
const GOTO_SPEED = 2.4;
/** Nombre maximal d'instances produisant leurs propres repères sonores. */
const MAX_SOUNDING_INSTANCES = 4;

interface GestureRun {
  part: PartRuntime;
  pose: PartPose;
  spec: RemovalSpec;
  direction: 1 | -1;
  toolId: string;
  presents: boolean;
  delay: number;
  /** Retour du rangement / réapparition avant le geste (remontage). */
  pre: number;
  approach: number;
  /** Durée du mouvement d'une instance et du geste complet (instances décalées). */
  single: number;
  motion: number;
  retract: number;
  timing: MotionTiming;
  stagger: number;
  count: number;
  elapsed: number;
  began: boolean;
  presenting: boolean;
  motionDone: boolean;
  finished: boolean;
  cues: MotionCue[];
  lastU: number[];
  quarters: number[];
  heat: LoopHandle | null;
}

interface PlanRun {
  stepIndex: number | null;
  layers: string[][];
  layerIndex: number;
  direction: 1 | -1;
  speed: number;
  gestures: GestureRun[];
  /** Pour « aller à » : index visé (enchaînement automatique). */
  gotoTarget: number | null;
}

interface PlacementTween {
  kind: 'park' | 'hide';
  from: number;
  to: number;
  elapsed: number;
  duration: number;
}

const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _size = new THREE.Vector3();

const METAL_PREFIXES = [
  'steel',
  'alu',
  'copper',
  'brass',
  'nickel',
  'gold',
  'tin',
  'solder',
  'metal',
  'magnet',
];

export class Sequencer {
  readonly removed = new Set<string>();
  private readonly placement = new Map<string, RemovedPlacement>();
  private readonly tweens = new Map<string, PlacementTween>();
  private readonly animating = new Set<string>();
  private run: PlanRun | null = null;
  private queued: SequencerCommand | null = null;
  private presenter: ToolPresenter = noopToolPresenter;
  private readonly frameState = { t: 0, motionT: 0, spin: 0, anchor: new THREE.Vector3() };
  private readonly anchorTmp = new THREE.Vector3();

  constructor(private readonly o: SequencerOptions) {}

  get graph(): DisassemblyGraph {
    return this.o.graph;
  }

  get busy(): boolean {
    return this.run !== null;
  }

  /** Index de l'étape en cours d'animation, ou null. */
  get playingStep(): number | null {
    return this.run?.stepIndex ?? null;
  }

  isAnimating(id: string): boolean {
    return this.animating.has(id);
  }

  /** Placement effectif d'une pièce une fois retirée. */
  effectivePlacement(part: PartRuntime): RemovedPlacement {
    const setting = this.o.placementSetting();
    if (setting !== 'auto') return setting;
    return part.def.removal?.after ?? this.o.assembly.def.removedPlacement ?? 'stay';
  }

  setToolPresenter(presenter: ToolPresenter | null): void {
    if (this.presenter !== presenter) this.presenter.end();
    this.presenter = presenter ?? noopToolPresenter;
  }

  // --- Commandes --------------------------------------------------------------------------

  /** Exécute une commande ; pendant une animation, elle est mise en file (1 au plus). */
  command(cmd: SequencerCommand): void {
    if (this.run) {
      this.queued = cmd;
      return;
    }
    switch (cmd.kind) {
      case 'next':
        this.startNext(1, null);
        break;
      case 'prev':
        this.startPrev(1, null);
        break;
      case 'goto':
        this.continueGoto(Math.max(0, Math.min(cmd.index, this.o.graph.steps.length)));
        break;
      case 'toggle':
        this.toggle(cmd.partId);
        break;
    }
  }

  private startNext(speed: number, gotoTarget: number | null): boolean {
    const plan = this.o.graph.planNext(this.removed);
    if (!plan || plan.layers.length === 0) return false;
    // Vérification (démontage libre partiel) : toutes les pièces de la première couche sont libres.
    for (const id of plan.layers[0]!) {
      const check = this.o.graph.canRemove(id, this.removed);
      if (!check.ok) {
        this.o.listener.onBlocked(id, check, false);
        return false;
      }
    }
    this.startRun({
      stepIndex: plan.stepIndex,
      layers: plan.layers,
      layerIndex: 0,
      direction: 1,
      speed,
      gestures: [],
      gotoTarget,
    });
    return true;
  }

  private startPrev(speed: number, gotoTarget: number | null): boolean {
    const plan = this.o.graph.planPrev(this.removed);
    if (!plan || plan.layers.length === 0) return false;
    for (const id of plan.layers[0]!) {
      const check = this.o.graph.canReinsert(id, this.removed);
      if (!check.ok) {
        this.o.listener.onBlocked(id, check, true);
        return false;
      }
    }
    this.startRun({
      stepIndex: plan.stepIndex,
      layers: plan.layers,
      layerIndex: 0,
      direction: -1,
      speed,
      gestures: [],
      gotoTarget,
    });
    return true;
  }

  /** Enchaîne les étapes jusqu'à ce que le curseur soit sur `target`. */
  private continueGoto(target: number): void {
    const graph = this.o.graph;
    const laterRemoved = graph.steps.some((s, i) => i >= target && s.parts.some((p) => this.removed.has(p)));
    if (laterRemoved) {
      this.startPrev(GOTO_SPEED, target);
      return;
    }
    if (graph.cursor(this.removed) < target) this.startNext(GOTO_SPEED, target);
  }

  /** Démontage libre : retire la pièce, ou la remonte si elle est déjà retirée. */
  private toggle(partId: string): void {
    const graph = this.o.graph;
    const reinsert = this.removed.has(partId);
    const check = reinsert ? graph.canReinsert(partId, this.removed) : graph.canRemove(partId, this.removed);
    if (!check.ok) {
      this.o.listener.onBlocked(partId, check, reinsert);
      return;
    }
    this.startRun({
      stepIndex: null,
      layers: [[partId]],
      layerIndex: 0,
      direction: reinsert ? -1 : 1,
      speed: 1,
      gestures: [],
      gotoTarget: null,
    });
  }

  private startRun(run: PlanRun): void {
    this.run = run;
    if (run.stepIndex !== null) {
      this.o.listener.onStepStarted(run.stepIndex);
      if (this.o.autoFrame()) {
        const step = this.o.graph.steps[run.stepIndex];
        // Remontage : toutes les pièces de l'étape (leurs places dans l'objet sont cadrées, et une
        // pièce focalisée peut revenir dans un parent qui revient lui aussi).
        const reinsert = run.direction === -1;
        if (step)
          this.o.listener.onFrameRequest(
            step.focus.length && !reinsert ? [...step.focus] : [...step.parts],
            reinsert,
          );
      }
    }
    this.startLayer();
    this.o.listener.onStateChange();
  }

  private startLayer(): void {
    const run = this.run!;
    const ids = run.layers[run.layerIndex] ?? [];
    run.gestures = ids
      .map((id, i) => this.createGesture(id, run.direction, i * LAYER_STAGGER, i === 0))
      .filter((g): g is GestureRun => g !== null);
    for (const g of run.gestures) this.animating.add(g.part.id);
  }

  private createGesture(id: string, direction: 1 | -1, delay: number, lead: boolean): GestureRun | null {
    const part = this.o.assembly.parts.get(id);
    const pose = this.o.composer.get(id);
    const spec = part?.def.removal;
    if (!part || !pose || !spec) return null;
    const step = this.o.graph.steps[this.o.graph.stepIndexOf(id) ?? -1];
    const toolId = spec.tool ?? step?.toolId ?? 'hands';
    const count = part.instanced?.count ?? 1;
    const stagger = part.instanced ? (spec.stagger ?? 0) : 0;
    const single = motionTiming(spec, direction).total;
    let pre = 0;
    if (direction === -1) {
      const placed = this.placement.get(id);
      if (placed === 'park' && pose.parkWeight > 0) pre = PARK_SECONDS * pose.parkWeight;
      if (placed === 'hide' && pose.placementOpacity < 1) pre = UNHIDE_SECONDS;
    }
    return {
      part,
      pose,
      spec,
      direction,
      toolId,
      presents: lead,
      delay,
      pre,
      approach: TOOL_APPROACH_SECONDS,
      single,
      motion: staggeredDuration(single, count, stagger),
      retract: TOOL_RETRACT_SECONDS,
      timing: motionTiming(spec, direction),
      stagger,
      count,
      elapsed: 0,
      began: false,
      presenting: false,
      motionDone: false,
      finished: false,
      cues: motionCues(spec, direction),
      lastU: new Array<number>(count).fill(0),
      quarters: new Array<number>(count).fill(0),
      heat: null,
    };
  }

  // --- Boucle -----------------------------------------------------------------------------

  update(dt: number): void {
    this.updateTweens(dt);
    const run = this.run;
    if (!run) return;
    const step = dt * run.speed;
    let allDone = true;
    for (const g of run.gestures) {
      if (!g.finished) this.advanceGesture(g, step);
      if (!g.finished) allDone = false;
    }
    if (!allDone) return;
    run.layerIndex++;
    if (run.layerIndex < run.layers.length) {
      // Couche suivante : on revérifie le graphe (sécurité en cas d'état incohérent).
      const ids = run.layers[run.layerIndex]!;
      const blocked = ids.find((id) =>
        run.direction === 1
          ? !this.o.graph.canRemove(id, this.removed).ok
          : !this.o.graph.canReinsert(id, this.removed).ok,
      );
      if (!blocked) {
        this.startLayer();
        this.o.listener.onStateChange();
        return;
      }
    }
    this.finishRun();
  }

  private finishRun(): void {
    const run = this.run!;
    this.run = null;
    if (run.stepIndex !== null) this.o.listener.onStepFinished(run.stepIndex);
    this.o.listener.onStateChange();
    if (run.gotoTarget !== null && !this.queued) {
      this.continueGoto(run.gotoTarget);
      if (this.run) this.o.listener.onStateChange();
      return;
    }
    const queued = this.queued;
    this.queued = null;
    if (queued) this.command(queued);
  }

  private advanceGesture(g: GestureRun, dt: number): void {
    g.elapsed += dt;
    const local = g.elapsed - g.delay;
    if (local < 0) return;
    if (!g.began) {
      g.began = true;
      if (g.pre > 0) this.startReturn(g);
    }
    const tApproach = g.pre;
    const tMotion = tApproach + g.approach;
    const tRetract = tMotion + g.motion;
    const tEnd = tRetract + g.retract;
    if (local >= tApproach && g.presents && !g.presenting) this.beginTool(g);

    if (local >= tMotion && !g.motionDone) {
      const elapsedMotion = Math.min(local - tMotion, g.motion);
      this.applyGestureMotion(g, elapsedMotion);
      if (local - tMotion >= g.motion) this.completeMotion(g);
    }
    if (g.presenting) {
      this.frameState.t = Math.min(1, (local - tApproach) / Math.max(1e-6, tEnd - tApproach));
      this.frameState.motionT = Math.min(1, Math.max(0, (local - tMotion) / Math.max(1e-6, g.motion)));
      this.frameState.spin = g.pose.instanceMotion ? g.pose.instanceMotion[0]!.spin : g.pose.motion.spin;
      this.workPoint(g.part, g.pose, this.frameState.anchor);
      this.presenter.update(this.frameState);
    }
    if (local >= tEnd) {
      if (g.presenting) {
        this.presenter.end();
        g.presenting = false;
        this.o.listener.onToolChange(null);
      }
      g.finished = true;
    }
  }

  private beginTool(g: GestureRun): void {
    g.presenting = true;
    const part = g.part;
    part.node.updateWorldMatrix(true, false);
    const parent = part.node.parent;
    if (parent) parent.getWorldQuaternion(_q);
    else _q.identity();
    const axis = new THREE.Vector3().copy(g.pose.axis).applyQuaternion(_q).normalize();
    const anchor = this.workPoint(part, g.pose, new THREE.Vector3());
    this.presenter.begin({
      toolId: g.toolId,
      partId: part.id,
      motion: g.spec.motion,
      direction: g.direction,
      axis,
      anchor,
      size: this.sizeOf(part),
      motionDuration: g.motion,
    });
    this.o.listener.onToolChange(g.toolId);
  }

  /** Rayon de la sphère englobante (m) d'une pièce ou d'une de ses instances. */
  private sizeOf(part: PartRuntime): number {
    const box = part.instanced
      ? part.instanced.instanceBox
      : part.localBox.isEmpty()
        ? part.subtreeBox
        : part.localBox;
    if (box.isEmpty()) return 0.01;
    box.getSize(_size).multiply(part.restWorldScale);
    return _size.length() / 2;
  }

  /**
   * Point de travail monde : ancrage explicite, sinon centre de la face de sortie (centre de la
   * boîte décalé de sa demi-épaisseur le long de l'axe). Pièces instanciées : instance 0.
   */
  workPoint(part: PartRuntime, pose: PartPose, target: THREE.Vector3): THREE.Vector3 {
    const assembly = this.o.assembly;
    if (part.anchorExplicit && !part.instanced) return assembly.anchorWorld(part.id, target);
    const box = part.instanced
      ? part.instanced.instanceBox
      : part.localBox.isEmpty()
        ? part.subtreeBox
        : part.localBox;
    if (part.instanced) assembly.instanceCenterWorld(part.id, 0, target);
    else {
      part.node.updateWorldMatrix(true, false);
      box.getCenter(target).applyMatrix4(part.node.matrixWorld);
    }
    if (box.isEmpty()) return target;
    box.getSize(_size).multiply(part.restWorldScale);
    const axisLocal = part.instanced
      ? pose.axisNode
      : _axis.copy(pose.axis).applyQuaternion(_q.copy(part.restQuaternion).invert());
    const half =
      0.5 *
      (Math.abs(axisLocal.x) * _size.x + Math.abs(axisLocal.y) * _size.y + Math.abs(axisLocal.z) * _size.z);
    const parent = part.node.parent;
    if (parent) parent.getWorldQuaternion(_q);
    else _q.identity();
    _v.copy(pose.axis).applyQuaternion(_q);
    return target.addScaledVector(_v, half);
  }

  /** Écrit l'échantillon de mouvement du geste (toutes instances) et déclenche les sons. */
  private applyGestureMotion(g: GestureRun, elapsedMotion: number): void {
    const pose = g.pose;
    // Position des sons : point de travail de l'image précédente (évite un calcul par instance).
    const anchor = this.anchorTmp;
    this.workPoint(g.part, pose, anchor);
    for (let i = 0; i < g.count; i++) {
      const u = g.part.instanced
        ? instanceProgress(elapsedMotion, g.single, i, g.stagger)
        : Math.min(1, elapsedMotion / Math.max(1e-6, g.single));
      const target = pose.instanceMotion ? pose.instanceMotion[i]! : pose.motion;
      sampleMotion(g.spec, u, g.direction, target, g.timing);
      if (i >= MAX_SOUNDING_INSTANCES && i > 0) {
        g.lastU[i] = u;
        continue;
      }
      // Repères sonores franchis depuis l'image précédente.
      const prev = g.lastU[i]!;
      for (const cue of g.cues) if (cue.at > prev && cue.at <= u) this.play(cue.sound, anchor);
      if (g.spec.motion === 'unscrew') {
        const quarter = quarterTurnIndex(
          g.direction === 1 ? target.spin : (g.spec.turns ?? 0) * 2 * Math.PI - target.spin,
        );
        if (quarter > g.quarters[i]!) {
          g.quarters[i] = quarter;
          this.play(quarterTurnSound(g.direction), anchor, 0.55);
        }
      }
      if (i === 0) this.updateHeat(g, u, anchor);
      g.lastU[i] = u;
    }
    const overall = Math.min(1, elapsedMotion / Math.max(1e-6, g.motion));
    this.callRemovalHook(g.part, removalProgress(overall, g.direction), g.direction);
    this.o.composer.markDirty(g.part.id);
  }

  private updateHeat(g: GestureRun, u: number, anchor: THREE.Vector3): void {
    const window = heatWindow(g.spec, g.direction);
    if (!window) return;
    const inside = u >= window.from && u < window.to;
    if (inside && !g.heat) {
      g.heat = this.o.audio.loop(heatLoopFor(g.toolId), { position: anchor, volume: 0.8 });
    }
    if (g.heat) {
      const k = (u - window.from) / Math.max(1e-6, window.to - window.from);
      g.heat.setIntensity(Math.min(1, Math.max(0, k)));
      g.heat.setPosition(anchor);
      if (!inside) {
        g.heat.stop(0.25);
        g.heat = null;
      }
    }
  }

  private callRemovalHook(part: PartRuntime, t: number, direction: 1 | -1): void {
    const hook = part.hooks?.onRemovalProgress;
    if (!hook || !part.def.removal) return;
    try {
      hook(t, { motion: part.def.removal.motion, direction });
    } catch (error) {
      console.error(`[Sequencer] hook onRemovalProgress de « ${part.id} » :`, error);
    }
  }

  private completeMotion(g: GestureRun): void {
    g.motionDone = true;
    g.heat?.stop(0.2);
    g.heat = null;
    const id = g.part.id;
    this.applyGestureMotion(g, g.motion);
    if (g.direction === 1) {
      this.removed.add(id);
      const placement = this.effectivePlacement(g.part);
      this.placement.set(id, placement);
      if (placement === 'park') this.startTween(id, 'park', 1, PARK_SECONDS);
      else if (placement === 'hide') this.startTween(id, 'hide', 0, HIDE_SECONDS);
    } else {
      this.removed.delete(id);
      this.placement.delete(id);
      this.resetPose(g.pose);
    }
    this.animating.delete(id);
    this.o.listener.onStateChange();
  }

  /** Remontage : retour depuis l'emplacement de rangement ou réapparition. */
  private startReturn(g: GestureRun): void {
    const placed = this.placement.get(g.part.id);
    if (placed === 'park') this.startTween(g.part.id, 'park', 0, g.pre);
    else if (placed === 'hide') this.startTween(g.part.id, 'hide', 1, g.pre);
  }

  private resetPose(pose: PartPose): void {
    Object.assign(pose.motion, createMotionSample());
    pose.instanceMotion?.forEach((m) => Object.assign(m, createMotionSample()));
    pose.parkWeight = 0;
    pose.placementOpacity = 1;
    this.tweens.delete(pose.part.id);
    this.o.composer.refreshVisibilityDeep(pose.part.id);
    this.o.composer.markDirty(pose.part.id);
  }

  private startTween(id: string, kind: 'park' | 'hide', to: number, duration: number): void {
    const pose = this.o.composer.get(id);
    if (!pose) return;
    const from = kind === 'park' ? pose.parkWeight : pose.placementOpacity;
    this.tweens.set(id, { kind, from, to, elapsed: 0, duration: Math.max(1e-3, duration) });
  }

  private updateTweens(dt: number): void {
    if (this.tweens.size === 0) return;
    const speed = this.run?.speed ?? 1;
    for (const [id, tw] of this.tweens) {
      const pose = this.o.composer.get(id);
      if (!pose) {
        this.tweens.delete(id);
        continue;
      }
      tw.elapsed += dt * speed;
      const k = Math.min(1, tw.elapsed / tw.duration);
      const value = tw.from + (tw.to - tw.from) * k;
      if (tw.kind === 'park') pose.parkWeight = value;
      else {
        pose.placementOpacity = value;
        this.o.composer.refreshVisibilityDeep(id);
      }
      this.o.composer.markDirty(id);
      if (k >= 1) {
        this.tweens.delete(id);
        if (tw.kind === 'park' && tw.to === 1)
          this.play(this.dropSound(pose.part), this.o.assembly.anchorWorld(id, _v));
      }
    }
  }

  /** Son de dépose selon la matière et la taille de la pièce. */
  private dropSound(part: PartRuntime): SoundId {
    if (this.sizeOf(part) < 0.006) return 'part.drop.small';
    const material = part.ownMeshes[0]?.material;
    const m = Array.isArray(material) ? material[0] : material;
    const id = String(m?.userData.variantOf ?? m?.userData.libraryId ?? part.def.material ?? '');
    const scoped = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
    return METAL_PREFIXES.some((p) => scoped.startsWith(p)) ? 'part.drop.metal' : 'part.drop.plastic';
  }

  private play(sound: SoundId, position: THREE.Vector3, volume = 1): void {
    this.o.audio.play(sound, { position, volume });
  }

  // --- Opérations instantanées --------------------------------------------------------------

  /** Applique immédiatement les `n` prochaines étapes (paramètres de développement, tests). */
  applyStepsInstant(n: number): void {
    this.cancel();
    for (let k = 0; k < n; k++) {
      const plan = this.o.graph.planNext(this.removed);
      if (!plan) break;
      for (const layer of plan.layers) for (const id of layer) this.removeInstant(id);
    }
    this.o.listener.onStateChange();
  }

  private removeInstant(id: string): void {
    const part = this.o.assembly.parts.get(id);
    const pose = this.o.composer.get(id);
    const spec = part?.def.removal;
    if (!part || !pose || !spec) return;
    if (pose.instanceMotion) for (const m of pose.instanceMotion) sampleMotion(spec, 1, 1, m);
    else sampleMotion(spec, 1, 1, pose.motion);
    this.callRemovalHook(part, 1, 1);
    this.tweens.delete(id);
    this.removed.add(id);
    const placement = this.effectivePlacement(part);
    this.placement.set(id, placement);
    if (placement === 'park') pose.parkWeight = 1;
    if (placement === 'hide') {
      pose.placementOpacity = 0;
      this.o.composer.refreshVisibilityDeep(id);
    }
    this.o.composer.markDirty(id);
  }

  /** Interrompt l'animation en cours (l'état des pièces déjà traitées est conservé). */
  cancel(): void {
    const run = this.run;
    if (run) {
      for (const g of run.gestures) {
        g.heat?.stop(0.1);
        g.heat = null;
        if (g.presenting) this.presenter.end();
        if (!g.motionDone && g.began) {
          // Geste interrompu : la pièce revient à son état d'avant le geste.
          const wasRemoved = this.removed.has(g.part.id);
          if (!wasRemoved) this.resetPose(g.pose);
          else this.removeInstant(g.part.id);
        }
        this.animating.delete(g.part.id);
      }
      this.o.listener.onToolChange(null);
    }
    this.run = null;
    this.queued = null;
  }

  /** Remet l'objet entièrement assemblé (instantané). */
  reset(): void {
    this.cancel();
    for (const id of this.removed) {
      const part = this.o.assembly.parts.get(id);
      if (part) this.callRemovalHook(part, 0, -1);
    }
    this.removed.clear();
    this.placement.clear();
    this.tweens.clear();
    this.animating.clear();
    this.o.composer.resetAll();
    this.o.listener.onStateChange();
  }

  /** Vrai tant qu'une transition de placement est en cours. */
  get hasTweens(): boolean {
    return this.tweens.size > 0;
  }

  dispose(): void {
    this.cancel();
    this.presenter.end();
    this.tweens.clear();
  }
}
