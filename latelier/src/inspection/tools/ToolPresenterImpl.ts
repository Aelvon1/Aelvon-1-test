/**
 * Présentateur des outils 3D animés (implémentation de `ToolPresenter`).
 *
 * Pour chaque geste du séquenceur :
 * - le modèle de l'outil est construit une seule fois (cache par identifiant, préconstruction
 *   possible pendant les temps morts), ses matériaux lui sont propres (fondu sans toucher aux
 *   matériaux des objets) ;
 * - un « montage » est posé sur le point de travail et orienté : +Y = axe de sortie de la pièce
 *   (l'outil arrive du côté de la sortie et travaille le long de −Y), Z tourné vers la caméra ou
 *   aligné sur la pièce selon l'outil ; il suit le point de travail (et, pour les outils de
 *   préhension, la rotation de la pièce) ;
 * - l'animation propre à l'outil (`ToolDef.animate`) pose le modèle dans ce montage, puis le
 *   présentateur ajoute l'approche/le retrait (glissement le long du corps de l'outil, easing) et
 *   le fondu (opacité en tramage `alphaHash` : aucun tri de transparence, aucune recompilation).
 *
 * Aucune allocation par image : vecteurs et états réutilisés. `dispose()` libère géométries et
 * matériaux créés.
 */
import * as THREE from 'three/webgpu';
import type { AudioApi } from '../../audio/types';
import type { ToolAnimState, ToolBuildContext, ToolDef } from '../../objects/types';
import type { IdleQueue } from '../../core/scheduler';
import { easeInCubic, easeOutCubic } from '../easing';
import {
  TOOL_APPROACH_SECONDS,
  TOOL_RETRACT_SECONDS,
  type ToolFrameState,
  type ToolGesture,
  type ToolPresenter,
} from './presenter';
import { getTool } from './registry';
import { toolBehavior } from './catalog';
import { rigContext, type ToolBehavior, type ToolCue, type ToolRigContext } from './catalog/rig';
import { createPartShape, shapeFromSize, type PartProbe } from './partProbe';

/** Contexte de construction transmis aux outils (la qualité est facultative, cf. catalogue). */
export interface ToolBuildEnv extends ToolBuildContext {
  quality?: 0 | 1 | 2 | 3;
}

/** Compilation anticipée des shaders (sous-ensemble de `WebGPURenderer`). */
export interface ShaderCompiler {
  compileAsync(scene: THREE.Object3D, camera: THREE.Camera, targetScene?: THREE.Scene | null): Promise<void>;
}

export interface ToolPresenterOptions {
  /** Parent des outils affichés (la scène). */
  parent: THREE.Object3D;
  camera: THREE.Camera;
  build: ToolBuildEnv;
  audio?: AudioApi | null;
  probe?: PartProbe | null;
  /** Résolution d'un identifiant (défaut : registre des outils). */
  resolve?: (id: string) => ToolDef | undefined;
  /** File des temps morts (préconstruction). */
  idle?: IdleQueue | null;
  /** Compilation anticipée (facultative) des matériaux des outils préconstruits. */
  compiler?: ShaderCompiler | null;
  scene?: THREE.Scene | null;
  /** Appelé à la libération (désabonnements). */
  onDispose?: () => void;
}

interface CachedTool {
  def: ToolDef;
  behavior: ToolBehavior;
  mount: THREE.Group;
  model: THREE.Object3D;
  ctx: ToolRigContext;
  /** Matériaux du modèle (tous propres à l'outil) : fondu, libération. */
  materials: THREE.Material[];
  geometries: Set<THREE.BufferGeometry>;
  /** L'animation a levé une erreur : désactivée pour ce modèle. */
  animateFailed: boolean;
}

/** Présence de l'outil (0 = absent, 1 = au travail) selon l'approche et le retrait. */
export function toolPresence(approachK: number, retractK: number): number {
  return Math.min(easeOutCubic(approachK), 1 - easeInCubic(retractK));
}

/** Course d'approche (m) selon la taille de la pièce. */
export function approachDistance(size: number, factor = 1): number {
  return Math.min(0.05, Math.max(0.015, 0.012 + 1.2 * size)) * factor;
}

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);

const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();
const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _q = new THREE.Quaternion();

export class ToolPresenterImpl implements ToolPresenter {
  /** Groupe racine des outils affichés. */
  readonly root = new THREE.Group();
  private readonly cache = new Map<string, CachedTool | null>();
  private active: CachedTool | null = null;
  private partId = '';
  private rigidFollow = false;
  private approach = 0.02;
  private opacity = -1;
  private cues: readonly ToolCue[] = [];
  private cueFired: boolean[] = [];
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private readonly anchor0 = new THREE.Vector3();
  private readonly baseQuat = new THREE.Quaternion();
  private readonly partQ0Inv = new THREE.Quaternion();
  private readonly shape = createPartShape();
  private readonly animState: ToolAnimState = {
    t: 0,
    motionT: 0,
    motion: 'translate',
    direction: 1,
    axis: new THREE.Vector3(0, 1, 0),
    anchor: new THREE.Vector3(),
    size: 0.01,
    spin: 0,
  };
  private readonly initialFrame: ToolFrameState = { t: 0, motionT: 0, spin: 0, anchor: new THREE.Vector3() };
  private disposed = false;

  constructor(private readonly o: ToolPresenterOptions) {
    this.root.name = 'Outils animés';
  }

  /** Identifiant de l'outil affiché (null hors geste). */
  get activeToolId(): string | null {
    return this.active?.def.id ?? null;
  }

  /** Modèle d'un outil déjà construit (débogage, captures). */
  modelOf(id: string): THREE.Object3D | null {
    return this.cache.get(id)?.model ?? null;
  }

  // --- ToolPresenter ------------------------------------------------------------------------

  begin(g: ToolGesture): void {
    if (this.disposed) return;
    this.end();
    const entry = this.obtain(g.toolId);
    if (!entry) return;
    this.active = entry;
    this.partId = g.partId;
    this.axis.copy(g.axis).normalize();
    this.anchor0.copy(g.anchor);

    // Dimensions de la pièce vues depuis le point de travail.
    const shape = this.shape;
    if (!this.o.probe?.describe(g.partId, this.axis, g.anchor, shape))
      shapeFromSize(g.size, this.axis, shape);

    // Repère de montage : Y = axe, Z vers la caméra (ou X aligné sur la pièce).
    _Y.copy(this.axis);
    this.o.camera.getWorldPosition(_cam).sub(g.anchor);
    _cam.addScaledVector(_Y, -_cam.dot(_Y));
    if (_cam.lengthSq() < 1e-10) _cam.copy(shape.shortDir);
    _cam.normalize();
    const roll = entry.behavior.roll;
    if (roll === 'camera') {
      _Z.copy(_cam);
      _X.crossVectors(_Y, _Z).normalize();
    } else {
      _X.copy(roll === 'partLong' ? shape.longDir : shape.shortDir);
      _X.addScaledVector(_Y, -_X.dot(_Y)).normalize();
      _Z.crossVectors(_X, _Y).normalize();
      if (_Z.dot(_cam) < 0) {
        _X.negate();
        _Z.negate();
      }
    }
    _basis.makeBasis(_X, _Y, _Z);
    this.baseQuat.setFromRotationMatrix(_basis);

    const ctx = entry.ctx;
    ctx.motion = g.motion;
    ctx.direction = g.direction;
    ctx.depth = shape.depth;
    ctx.halfX =
      Math.abs(shape.longDir.dot(_X)) * shape.longHalf + Math.abs(shape.shortDir.dot(_X)) * shape.shortHalf;
    ctx.halfZ =
      Math.abs(shape.longDir.dot(_Z)) * shape.longHalf + Math.abs(shape.shortDir.dot(_Z)) * shape.shortHalf;
    ctx.outwardX = 1;
    ctx.outwardZ = 0;
    if (shape.hasCenter) {
      _v.subVectors(g.anchor, shape.objectCenter);
      _v.addScaledVector(_Y, -_v.dot(_Y));
      const len = _v.length();
      if (len > 1e-5) {
        ctx.outwardX = _v.dot(_X) / len;
        ctx.outwardZ = _v.dot(_Z) / len;
      }
    }
    ctx.approachSeconds = TOOL_APPROACH_SECONDS;
    ctx.motionSeconds = Math.max(1e-3, g.motionDuration);
    ctx.retractSeconds = TOOL_RETRACT_SECONDS;
    ctx.seconds = 0;
    ctx.approachK = 0;
    ctx.retractK = 0;
    ctx.travel = 0;
    ctx.helpersVisible = true;

    // Suivi rigide : orientation de la pièce au début du geste.
    this.rigidFollow = false;
    if (entry.behavior.follow === 'rigid' && this.o.probe?.worldQuaternion(g.partId, this.partQ0Inv)) {
      this.partQ0Inv.invert();
      this.rigidFollow = true;
    }
    this.approach = approachDistance(g.size, entry.behavior.approach ?? 1);
    this.cues = entry.behavior.cues?.(g.motion, g.direction) ?? [];
    this.cueFired = this.cues.map(() => false);

    const s = this.animState;
    s.motion = g.motion;
    s.direction = g.direction;
    s.axis.copy(this.axis);
    s.size = g.size;

    if (!this.root.parent) this.o.parent.add(this.root);
    this.opacity = -1;
    this.o.audio?.play('tool.pickup', { position: g.anchor, volume: 0.6 });
    this.initialFrame.anchor.copy(g.anchor);
    this.update(this.initialFrame);
  }

  update(state: ToolFrameState): void {
    const e = this.active;
    if (!e) return;
    const ctx = e.ctx;
    const total = ctx.approachSeconds + ctx.motionSeconds + ctx.retractSeconds;
    const seconds = clamp01(state.t) * total;
    ctx.seconds = seconds;
    ctx.approachK = clamp01(seconds / ctx.approachSeconds);
    ctx.retractK = clamp01((seconds - ctx.approachSeconds - ctx.motionSeconds) / ctx.retractSeconds);
    ctx.travel = _v.subVectors(state.anchor, this.anchor0).dot(this.axis);

    const mount = e.mount;
    mount.position.copy(state.anchor);
    if (this.rigidFollow && this.o.probe?.worldQuaternion(this.partId, _q)) {
      mount.quaternion.copy(_q).multiply(this.partQ0Inv).multiply(this.baseQuat);
    } else mount.quaternion.copy(this.baseQuat);

    const model = e.model;
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    const s = this.animState;
    s.t = state.t;
    s.motionT = state.motionT;
    s.spin = state.spin;
    s.anchor.copy(state.anchor);
    if (e.def.animate && !e.animateFailed) {
      try {
        e.def.animate(model, s);
      } catch (error) {
        e.animateFailed = true;
        console.error(`[Outils] Animation de « ${e.def.id} » en échec :`, error);
      }
    }

    // Approche / retrait : glissement le long du corps de l'outil (+Y du modèle).
    const presence = toolPresence(ctx.approachK, ctx.retractK);
    _v.set(0, 1, 0).applyQuaternion(model.quaternion);
    model.position.addScaledVector(_v, (1 - presence) * this.approach);
    this.setOpacity(e, clamp01(presence * 1.6));

    // Repères sonores propres à l'outil.
    for (let i = 0; i < this.cues.length; i++) {
      if (this.cueFired[i]) continue;
      const cue = this.cues[i]!;
      if (state.motionT >= cue.at && (state.motionT > 0 || cue.at <= 0)) {
        this.cueFired[i] = true;
        this.o.audio?.play(cue.sound, { position: state.anchor, volume: cue.volume ?? 1 });
      }
    }
  }

  end(): void {
    const e = this.active;
    if (!e) return;
    e.mount.visible = false;
    this.active = null;
    this.opacity = -1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.end();
    this.disposed = true;
    for (const entry of this.cache.values()) if (entry) disposeEntry(entry);
    this.cache.clear();
    this.root.removeFromParent();
    this.o.onDispose?.();
  }

  // --- Construction ----------------------------------------------------------------------------

  /**
   * Préconstruit des outils pendant les temps morts (un outil par tâche), puis lance leur
   * compilation anticipée si un compilateur est fourni.
   */
  warmup(ids: Iterable<string>): void {
    const queue = this.o.idle;
    for (const id of new Set(ids)) {
      if (this.cache.has(id)) continue;
      const task = () => {
        if (this.disposed || this.cache.has(id)) return;
        const entry = this.obtain(id);
        if (entry) this.compile(entry);
      };
      if (queue) queue.push(task, -1);
      else task();
    }
  }

  /** Construit (une fois) le modèle d'un outil ; null si l'outil est inconnu ou en échec. */
  private obtain(id: string): CachedTool | null {
    const cached = this.cache.get(id);
    if (cached !== undefined) return cached;
    const def = (this.o.resolve ?? getTool)(id);
    if (!def) {
      console.warn(`[Outils] Aucun modèle 3D pour l'outil « ${id} » : rien n'est affiché.`);
      this.cache.set(id, null);
      return null;
    }
    let model: THREE.Object3D;
    try {
      model = def.build(this.o.build);
    } catch (error) {
      console.error(`[Outils] Construction de « ${id} » en échec :`, error);
      this.cache.set(id, null);
      return null;
    }
    const { materials, geometries } = this.adopt(model);
    const mount = new THREE.Group();
    mount.name = `Outil : ${def.name}`;
    mount.visible = false;
    mount.add(model);
    this.root.add(mount);
    const entry: CachedTool = {
      def,
      behavior: toolBehavior(id),
      mount,
      model,
      ctx: rigContext(model),
      materials,
      geometries,
      animateFailed: false,
    };
    this.cache.set(id, entry);
    return entry;
  }

  /**
   * Rend les matériaux du modèle propres à l'outil (les matériaux partagés de la bibliothèque
   * sont remplacés par des variantes) et active le fondu tramé.
   */
  private adopt(model: THREE.Object3D): {
    materials: THREE.Material[];
    geometries: Set<THREE.BufferGeometry>;
  } {
    const replaced = new Map<THREE.Material, THREE.Material>();
    const materials = new Set<THREE.Material>();
    const geometries = new Set<THREE.BufferGeometry>();
    const own = (m: THREE.Material): THREE.Material => {
      let out = replaced.get(m);
      if (out) return out;
      out = m;
      if (m.userData.shared === true) {
        const id: unknown = m.userData.libraryId;
        out =
          typeof id === 'string' && this.o.build.materials.has(id)
            ? this.o.build.materials.variant(id, { name: `${m.name} (outil)` })
            : m.clone();
      }
      if (!out.alphaHash) {
        out.alphaHash = true;
        out.needsUpdate = true;
      }
      replaced.set(m, out);
      materials.add(out);
      return out;
    };
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    });
    return { materials: [...materials], geometries };
  }

  private setOpacity(e: CachedTool, value: number): void {
    if (Math.abs(value - this.opacity) < 1e-3) return;
    this.opacity = value;
    for (const m of e.materials) m.opacity = value;
    e.mount.visible = value > 0.002;
  }

  /** Compilation anticipée (sans effet visible : le modèle est masqué juste après l'appel). */
  private compile(entry: CachedTool): void {
    const compiler = this.o.compiler;
    if (!compiler || entry === this.active) return;
    const culled: THREE.Object3D[] = [];
    entry.model.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    entry.mount.visible = true;
    try {
      void compiler.compileAsync(entry.mount, this.o.camera, this.o.scene ?? null).catch(() => undefined);
    } catch {
      // Compilation anticipée facultative : l'outil sera compilé à son premier affichage.
    }
    entry.mount.visible = false;
    for (const o of culled) o.frustumCulled = true;
  }
}

function disposeEntry(entry: CachedTool): void {
  entry.mount.removeFromParent();
  for (const g of entry.geometries) g.dispose();
  for (const m of entry.materials) m.dispose();
}
