/**
 * Vue du mode inspection : assemble la caméra d'inspection, la sélection (BVH), les modes de
 * rendu (rayons X, coupe), l'éclairage d'appoint, les étiquettes, la mise au point du
 * post-traitement et les miniatures d'inventaire.
 *
 * L'état de vue est lu dans le store (`inspection.xray`, `section`, `labels`, `selected`…),
 * seule source de vérité : l'orchestrateur (`Inspection`) et l'interface le modifient, la vue s'y
 * abonne et applique les changements (événementiel). Par image : suivi du plan de coupe, survol,
 * étiquettes (≤ 30 Hz), éclairage, mise au point, miniatures.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../../core/context';
import type { InspectionState } from '../../core/store';
import type { ObjectDef, ObjectParams } from '../../objects/types';
import { INSPECTION_VIEW, PEGBOARD, ROOM } from '../../world/layout';
import type { World } from '../../world/World';
import type { Assembly } from '../Assembly';
import type { DetailManager } from '../detail';
import type { KnollingLabel } from '../knollingPlan';
import type { PoseComposer } from '../poses';
import { InspectionCamera } from '../camera/InspectionCamera';
import type { ScreenInsets } from '../camera/types';
import { InspectionLabels } from '../labels/Labels';
import { Picker } from '../selection/Picker';
import { Selection } from '../selection/Selection';
import { Thumbnails } from '../thumbnails/Thumbnails';
import { MaterialModes } from './MaterialModes';
import { Section } from './Section';
import { StudioLights } from './StudioLights';
import { readUiInsets } from './uiInsets';

type AnyDef = ObjectDef<ObjectParams>;

/** Objet inspecté, tel que la vue en a besoin. */
export interface ViewSession {
  def: AnyDef;
  assembly: Assembly;
  composer: PoseComposer;
  detail: DetailManager;
  /** Bornes monde de l'objet au repos (à l'ouverture). */
  restBounds: THREE.Box3;
}

export interface InspectionViewHooks {
  knollingLabels: () => readonly KnollingLabel[];
  findDef: (id: string) => AnyDef | undefined;
  /** Objet ouvert ou en construction dans l'inspection (miniatures reportées). */
  inUse: (objectId: string) => boolean;
}

/** Intervalle de recalcul des bornes courantes de l'objet (s). */
const BOUNDS_INTERVAL = 0.2;

const _box = new THREE.Box3();
const _sphere = new THREE.Sphere();
const _inv = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _local = new THREE.Box3();

/**
 * Bornes de l'objet dans son propre repère (et non la boîte alignée monde d'un objet tourné,
 * plus grande) : boîtes locales de chaque pièce ramenées dans le repère de la racine.
 */
export function objectLocalBounds(assembly: Assembly, target: THREE.Box3): THREE.Box3 {
  target.makeEmpty();
  assembly.root.updateWorldMatrix(true, true);
  _inv.copy(assembly.root.matrixWorld).invert();
  for (const part of assembly.order) {
    if (part.localBox.isEmpty()) continue;
    _m.multiplyMatrices(_inv, part.node.matrixWorld);
    target.union(_local.copy(part.localBox).applyMatrix4(_m));
  }
  return target;
}

export class InspectionView {
  readonly camera: InspectionCamera;
  readonly picker: Picker;
  readonly selection: Selection;
  readonly materials = new MaterialModes();
  readonly section: Section;
  readonly lights: StudioLights;
  readonly labels: InspectionLabels;
  readonly thumbnails: Thumbnails;
  private session: ViewSession | null = null;
  private active = false;
  private lastVersion = -1;
  private boundsTimer = 0;
  private readonly bounds = new THREE.Sphere(new THREE.Vector3(), 0.1);
  private readonly unsubscribe: () => void;
  private readonly focus = { distance: 1, radius: 0.1 };
  /** Encarts publiés par l'interface (panneaux), relus à chaque image. */
  private readonly uiInsets: ScreenInsets = { left: 0, top: 0, right: 0, bottom: 0 };

  constructor(
    private readonly ctx: AppContext,
    world: World,
    hooks: InspectionViewHooks,
  ) {
    const scene = ctx.engine.scene;
    this.picker = new Picker(ctx.idle);
    this.picker.isGhost = (id) => this.materials.isGhost(id);
    this.section = new Section(scene);
    this.lights = new StudioLights(scene);
    const roomBounds = new THREE.Box3(
      new THREE.Vector3(ROOM.minX + 0.02, 0, PEGBOARD.z + 0.07),
      new THREE.Vector3(ROOM.maxX - 0.02, ROOM.height - 0.02, ROOM.maxZ - 0.02),
    );
    this.camera = new InspectionCamera({
      camera: ctx.engine.camera,
      canvas: ctx.engine.canvas,
      query: () => (this.session ? this.picker : null),
      floorY: world.bench.matCenter.y,
      roomBounds,
      reversedDepth: ctx.engine.reversedDepth,
      fov: INSPECTION_VIEW.fov,
      safeInsets: () => (readUiInsets(this.uiInsets) ? this.uiInsets : null),
    });
    this.selection = new Selection({
      ctx,
      camera: this.camera,
      picker: this.picker,
      proxyParent: this.section.group,
    });
    this.labels = new InspectionLabels(
      ctx.engine.camera,
      ctx.engine.canvas,
      this.picker,
      hooks.knollingLabels,
    );
    this.thumbnails = new Thumbnails({ ctx, findDef: hooks.findDef, inUse: hooks.inUse });
    this.unsubscribe = ctx.store.subscribe((state, previous) => {
      if (
        state.inspection !== previous.inspection ||
        state.settings.textScale !== previous.settings.textScale
      )
        this.onStore(state.inspection, previous.inspection);
    });
  }

  /** Parent de la racine de l'objet inspecté (groupe de coupe). */
  get objectParent(): THREE.Object3D {
    return this.section.group;
  }

  /** Branche un objet construit (avant l'activation de la caméra). */
  attach(session: ViewSession): void {
    this.detach();
    this.session = session;
    const { assembly, composer, detail } = session;
    this.picker.attach(assembly);
    this.materials.attach(assembly, composer);
    this.selection.attach(assembly);
    this.labels.attach(assembly, composer);
    detail.onChange = () => {
      this.picker.invalidate();
      this.materials.sync();
      this.labels.invalidate();
      this.camera.notifySceneChanged();
    };
    // Bornes au repos dans le repère de l'objet (position de coupe 0..1).
    this.section.setObject(assembly.root, objectLocalBounds(assembly, new THREE.Box3()));
    session.restBounds.getBoundingSphere(this.bounds);
    this.camera.objectCenter.copy(this.bounds.center);
    this.camera.objectRadius = this.bounds.radius;
    const view = session.def.presentation?.viewDirection ?? [0.3, 0.75, 1];
    this.lights.setSubject(
      this.bounds.center,
      this.bounds.radius,
      Math.atan2(view[0], view[2]) + assembly.root.rotation.y,
    );
    this.lastVersion = -1;
    this.boundsTimer = 0;
    this.onStore(this.ctx.store.getState().inspection, null);
  }

  /** Détache l'objet : matériaux d'origine restitués AVANT sa libération. */
  detach(): void {
    const s = this.session;
    if (!s) return;
    s.detail.onChange = null;
    this.materials.detach();
    this.selection.detach();
    this.labels.detach();
    this.picker.detach();
    this.section.setObject(null, null);
    this.session = null;
    this.ctx.postfx.setFocus(null);
  }

  /** Début de l'inspection (caméra active) : éclairage d'appoint, souris libérée. */
  activate(): void {
    this.active = true;
    this.lights.setActive(true);
    // Étiquettes restées actives depuis l'inspection précédente : réaffichées sans attendre un
    // changement du store.
    this.labels.setState(this.labelState(this.ctx.store.getState().inspection));
    if (this.ctx.input.pointerLocked) this.ctx.input.exitPointerLock();
  }

  /** Fin de l'inspection (retour vers la salle). */
  deactivate(): void {
    this.active = false;
    this.lights.setActive(false);
    this.ctx.postfx.setFocus(null);
    this.labels.setState({ ...this.labelState(this.ctx.store.getState().inspection), enabled: false });
  }

  /** À chaque image (après la caméra). */
  update(dt: number): void {
    this.thumbnails.tick();
    // Point principal décalé vers la zone libre (et retour à zéro hors inspection) avant tout
    // calcul dépendant de la projection (survol, étiquettes).
    this.camera.updateViewOffset(dt);
    const camera = this.ctx.engine.camera;
    this.lights.update(dt, camera);
    const s = this.session;
    if (!s) return;
    this.section.update(dt);
    this.picker.clipPlane = this.section.enabled ? this.section.plane : null;
    this.picker.clipBounds.copy(this.section.worldBounds);
    const version = s.composer.version;
    if (version !== this.lastVersion) {
      this.lastVersion = version;
      this.camera.notifySceneChanged();
      this.selection.notifySceneChanged();
    }
    this.boundsTimer -= dt;
    if (this.boundsTimer <= 0) {
      this.boundsTimer = BOUNDS_INTERVAL;
      this.refreshBounds(s);
    }
    this.selection.update(dt);
    this.labels.update(dt);
    if (this.active && this.camera.active) {
      this.focus.distance = camera.position.distanceTo(this.camera.target);
      this.focus.radius = this.bounds.radius;
      this.ctx.postfx.setFocus(this.focus);
    }
  }

  /** Bornes courantes (éclatement, rangement) : limites de la caméra, projecteurs, flou. */
  private refreshBounds(s: ViewSession): void {
    s.assembly.objectBounds(_box);
    if (_box.isEmpty()) return;
    _box.getBoundingSphere(_sphere);
    this.bounds.copy(_sphere);
    this.camera.objectCenter.copy(_sphere.center);
    this.camera.objectRadius = _sphere.radius;
    this.lights.setSubject(_sphere.center, _sphere.radius);
  }

  // --- Store ------------------------------------------------------------------------------

  private labelState(state: InspectionState | null): Parameters<InspectionLabels['setState']>[0] {
    return {
      enabled: this.active && (state?.labels ?? false),
      selectedId: state?.selected?.partId ?? null,
      selectedInstance: state?.selected?.instance ?? null,
      xray: state?.xray ?? false,
      knolling: state?.knolling ?? false,
      explode: state?.explode ?? 0,
      leftPanelOpen: state?.leftPanelOpen ?? false,
      rightPanelOpen: state?.rightPanelOpen ?? false,
      textScale: this.ctx.store.getState().settings.textScale,
    };
  }

  private onStore(state: InspectionState | null, previous: InspectionState | null): void {
    const s = this.session;
    if (!s || !state) return;
    const selected = state.selected?.partId ?? null;
    const selectionChanged = selected !== (previous?.selected?.partId ?? null);
    if (state.xray !== previous?.xray || (state.xray && selectionChanged)) {
      const solid = new Set(selected ? s.assembly.subtreeIds(selected) : []);
      this.materials.setXray(state.xray, solid);
      this.selection.notifySceneChanged();
      this.camera.notifySceneChanged();
    }
    const sec = state.section;
    const prevSec = previous?.section;
    if (
      !prevSec ||
      sec.enabled !== prevSec.enabled ||
      sec.axis !== prevSec.axis ||
      sec.position !== prevSec.position ||
      sec.flip !== prevSec.flip
    ) {
      this.section.setState(sec);
      this.materials.setSection(sec.enabled);
      this.picker.clipPlane = this.section.enabled ? this.section.plane : null;
      this.selection.notifySceneChanged();
      this.camera.notifySceneChanged();
      this.labels.invalidate();
    }
    if (state.parts !== previous?.parts || state.isolatedId !== previous?.isolatedId) {
      this.labels.invalidate();
      this.selection.notifySceneChanged();
      this.camera.notifySceneChanged();
    }
    this.labels.setState(this.labelState(state));
  }

  dispose(): void {
    this.unsubscribe();
    this.detach();
    this.camera.dispose();
    this.selection.dispose();
    this.labels.dispose();
    this.thumbnails.dispose();
    this.materials.dispose();
    this.section.dispose();
    this.lights.dispose();
    this.picker.dispose();
  }
}
