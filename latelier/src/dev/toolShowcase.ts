/**
 * Banc des outils (développement) : `?tools=1`.
 *
 * - Rangée : tous les outils du catalogue couchés sur l'établi (pointe vers l'opérateur), chacun
 *   avec sa plaquette de nom.
 * - Poste de démonstration au premier plan : chaque outil réalise son geste en boucle sur une
 *   pièce factice adaptée (vis, soudure, roulement, circuit intégré…), à tour de rôle, avec le
 *   VRAI présentateur (`ToolPresenterImpl`) : la pièce suit le mouvement du moteur
 *   (`sampleMotion`) et l'outil la suit. L'outil en démonstration disparaît de la rangée.
 *
 * Paramètres complémentaires :
 * - `tool=<id>`  : ne démontrer que cet outil (défaut : tous, à tour de rôle) ;
 * - `t=0..1`     : fige le geste à cette progression (captures reproductibles) ;
 * - `dir=-1`     : geste de remontage ;
 * - `cam=stage|row` : cadrage initial (défaut : poste) ; `view=dx,dy,dz,distance` le complète ;
 * - `speed=k`    : vitesse de lecture ;
 * - `row=0`      : sans la rangée d'outils (captures du poste plus légères) ;
 * - `post=0`     : rendu direct, sans post-traitement.
 */
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AppContext } from '../core/context';
import type { MotionKind, ToolAnimState, Vec3 } from '../objects/types';
import type { World } from '../world/World';
import { BENCH, MAT } from '../world/layout';
import { createMotionSample, motionTiming, sampleMotion, type MotionSpec } from '../inspection/motions';
import { perpendicularTo } from '../inspection/poses';
import { TOOL_IDS, type ToolId } from '../inspection/tools/ids';
import { getTool, TOOL_NAMES } from '../inspection/tools/registry';
import {
  TOOL_APPROACH_SECONDS,
  TOOL_RETRACT_SECONDS,
  type ToolFrameState,
} from '../inspection/tools/presenter';
import { ToolPresenterImpl } from '../inspection/tools/ToolPresenterImpl';
import { describeOrientedBox, type PartProbe, type PartShape } from '../inspection/tools/partProbe';

export interface ToolShowcaseHandle {
  root: THREE.Group;
  presenter: ToolPresenterImpl;
  controls: OrbitControls;
  /** Outil en démonstration. */
  current(): ToolId;
  /** Démontre un outil (captures automatisées) ; le cadrage « poste » suit sa distance. */
  select(id: ToolId): void;
  /** Fige le geste à la progression `t` (0..1), ou reprend la lecture (null). */
  freeze(t: number | null): void;
  dispose(): void;
}

/** Pièce factice d'une démonstration. */
interface DemoPart {
  /** Nœud animé (origine = pivot, sur l'axe). */
  node: THREE.Object3D;
  /** Boîte de la pièce (repère du nœud). */
  box: THREE.Box3;
  /** Décor fixe (support, arbre, circuit). */
  fixtures: THREE.Object3D[];
}

interface DemoSpec {
  part: string;
  motion: MotionSpec & { motion: MotionKind };
  axis: Vec3;
  /** Distance de caméra (m) du cadrage « poste ». */
  view: number;
}

const DEMOS: Record<ToolId, DemoSpec> = {
  'hex-key-1.5': {
    part: 'screw.socket',
    motion: { motion: 'unscrew', distance: 0.009, turns: 6, pitch: 0.0005 },
    axis: [0, 1, 0],
    view: 0.16,
  },
  'hex-key-2': {
    part: 'screw.socket',
    motion: { motion: 'unscrew', distance: 0.009, turns: 6, pitch: 0.0005 },
    axis: [0, 1, 0],
    view: 0.17,
  },
  'hex-key-2.5': {
    part: 'screw.socket',
    motion: { motion: 'unscrew', distance: 0.009, turns: 6, pitch: 0.0005 },
    axis: [0, 1, 0],
    view: 0.18,
  },
  'screwdriver-phillips': {
    part: 'screw.phillips',
    motion: { motion: 'unscrew', distance: 0.01, turns: 6, pitch: 0.0005 },
    axis: [0, 1, 0],
    view: 0.34,
  },
  'screwdriver-flat': {
    part: 'screw.slotted',
    motion: { motion: 'unscrew', distance: 0.01, turns: 6, pitch: 0.0005 },
    axis: [0, 1, 0],
    view: 0.34,
  },
  'screwdriver-precision': {
    part: 'screw.phillips',
    motion: { motion: 'unscrew', distance: 0.008, turns: 5, pitch: 0.00045 },
    axis: [0, 1, 0],
    view: 0.26,
  },
  'pliers-flat': {
    part: 'pin',
    motion: { motion: 'translate', distance: 0.012 },
    axis: [0, 1, 0],
    view: 0.26,
  },
  'pliers-circlip': {
    part: 'circlip',
    motion: { motion: 'lift', distance: 0.01 },
    axis: [0, 1, 0],
    view: 0.24,
  },
  'cutter-flush': { part: 'wire', motion: { motion: 'cut', distance: 0.006 }, axis: [0, 1, 0], view: 0.22 },
  'bearing-puller': {
    part: 'bearing',
    motion: { motion: 'pressOut', distance: 0.008 },
    axis: [0, 1, 0],
    view: 0.2,
  },
  'arbor-press': {
    part: 'shaft',
    motion: { motion: 'pressOut', distance: 0.014 },
    axis: [1, 0, 0],
    view: 0.5,
  },
  mallet: { part: 'cap', motion: { motion: 'unclip', distance: 0.008 }, axis: [0, 1, 0], view: 0.42 },
  'soldering-iron': {
    part: 'tht',
    motion: { motion: 'desolder', distance: 0.012 },
    axis: [0, 1, 0],
    view: 0.3,
  },
  'desolder-pump': {
    part: 'led',
    motion: { motion: 'desolder', distance: 0.012 },
    axis: [0, 1, 0],
    view: 0.32,
  },
  'desolder-braid': {
    part: 'smd',
    motion: { motion: 'desolder', distance: 0.006 },
    axis: [0, 1, 0],
    view: 0.16,
  },
  'hot-air': { part: 'soic', motion: { motion: 'desolder', distance: 0.01 }, axis: [0, 1, 0], view: 0.32 },
  tweezers: {
    part: 'capacitor',
    motion: { motion: 'translate', distance: 0.012 },
    axis: [0, 1, 0],
    view: 0.14,
  },
  'ic-extractor': { part: 'dip', motion: { motion: 'lift', distance: 0.012 }, axis: [0, 1, 0], view: 0.16 },
  scalpel: { part: 'sticker', motion: { motion: 'peel', distance: 0.008 }, axis: [0, 1, 0], view: 0.22 },
  spudger: { part: 'cover', motion: { motion: 'unclip', distance: 0.01 }, axis: [0, 1, 0], view: 0.24 },
  hands: { part: 'block', motion: { motion: 'translate', distance: 0.03 }, axis: [0, 1, 0], view: 0.2 },
};

/** Pauses (s) avant et après chaque geste. */
const PRE = 0.35;
const POST = 0.6;

export async function startToolShowcase(ctx: AppContext, _world: World): Promise<ToolShowcaseHandle> {
  const q = ctx.dev.raw;
  const { engine, materials, textures } = ctx;
  const geometries: THREE.BufferGeometry[] = [];
  const ownMaterials: THREE.Material[] = [];
  const root = new THREE.Group();
  root.name = 'Banc des outils';
  engine.scene.add(root);
  const benchY = BENCH.topHeight;
  const matY = MAT.center[1] + MAT.thickness / 2;
  const onMat = (x: number, z: number): boolean =>
    Math.abs(x - MAT.center[0]) < MAT.size[0] / 2 && Math.abs(z - MAT.center[2]) < MAT.size[1] / 2;

  // --- Rangée d'outils couchés ------------------------------------------------------------------
  const buildCtx = { materials, textures, quality: engine.quality.level };
  const rowTools = new Map<ToolId, THREE.Object3D>();
  const lying = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const zTips = -1.64;
  let cursor = -1.47;
  const box = new THREE.Box3();
  const rest: ToolAnimState = {
    t: 0.5,
    motionT: 0,
    motion: 'translate',
    direction: -1,
    axis: new THREE.Vector3(0, 1, 0),
    anchor: new THREE.Vector3(),
    size: 0.005,
    spin: 0,
  };
  const labelGeo = new THREE.PlaneGeometry(0.084, 0.0185);
  geometries.push(labelGeo);
  const labelMaterials = new Map<ToolId, THREE.MeshBasicNodeMaterial>();
  // `row=0` : pas de rangée (captures du poste plus légères).
  const showRow = q.get('row') !== '0';
  TOOL_IDS.forEach((id, i) => {
    const def = getTool(id);
    if (!def) return;
    // Plaquette de nom (générateur `label` du worker de textures), en quinconce.
    const map = textures.get({
      key: `dev/tools/${id}`,
      generator: 'label',
      width: 512,
      height: 112,
      params: {
        style: 'plate',
        title: TOOL_NAMES[id],
        subtitle: '',
        paper: '#e9e1c8',
        ink: '#1f1d1a',
        aging: 0.1,
      },
      colorSpace: 'srgb',
      wrap: 'clamp',
    });
    const labelMat = new THREE.MeshBasicNodeMaterial({ map, transparent: true });
    labelMaterials.set(id, labelMat);
    ownMaterials.push(labelMat);
    if (!showRow) return;
    const model = def.build(buildCtx);
    def.animate?.(model, rest);
    const holder = new THREE.Group();
    holder.name = `Rangée : ${def.name}`;
    holder.add(model);
    holder.quaternion.copy(lying);
    // Couchés sur l'établi : câbles masqués (ils traverseraient le plateau), fondus actifs.
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name === 'câble') mesh.visible = false;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) m.alphaHash = true;
    });
    holder.updateMatrixWorld(true);
    visibleBox(holder, box);
    const width = box.max.x - box.min.x;
    const x = cursor - box.min.x;
    cursor += width + 0.022;
    const y = (onMat(x, zTips - 0.1) ? matY : benchY) - box.min.y + 0.0002;
    holder.position.set(x, y, zTips);
    root.add(holder);
    rowTools.set(id, holder);
    collectOwned(model, geometries, ownMaterials);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2 + 0.45;
    label.position.set(x + (box.min.x + box.max.x) / 2, benchY + 0.012, zTips + (i % 2 === 0 ? 0.03 : 0.056));
    root.add(label);
  });

  // --- Poste de démonstration ------------------------------------------------------------------
  const stage = new THREE.Group();
  stage.name = 'Poste de démonstration';
  const stageCenter = new THREE.Vector3(MAT.center[0] + 0.12, matY, -1.4);
  stage.position.copy(stageCenter);
  root.add(stage);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.07), materials.get('alu.machined'));
  plate.position.y = 0.004;
  plate.receiveShadow = true;
  plate.castShadow = true;
  geometries.push(plate.geometry);
  stage.add(plate);
  const stageLabel = new THREE.Mesh(
    labelGeo,
    labelMaterials.get('hands') ?? new THREE.MeshBasicNodeMaterial(),
  );
  // Plaquette derrière le poste (hors champ des gros plans), inclinée vers l'opérateur.
  stageLabel.rotation.x = -Math.PI / 2 + 0.9;
  stageLabel.position.set(0, 0.012, -0.06);
  stage.add(stageLabel);
  const top = 0.008;
  const factory = new DemoFactory(materials, geometries, top);

  const probe = new DemoProbe(stage);
  const presenter = new ToolPresenterImpl({
    parent: engine.scene,
    camera: engine.camera,
    build: buildCtx,
    audio: ctx.audio,
    probe,
  });

  // --- Lumières d'appoint --------------------------------------------------------------------------
  const key = new THREE.SpotLight(0xfff1dd, 10, 3, Math.PI / 5, 0.6, 1.5);
  key.position.copy(stageCenter).add(new THREE.Vector3(0.35, 0.75, 0.55));
  key.target.position.copy(stageCenter);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.camera.near = 0.2;
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6);
  fill.position.copy(stageCenter).add(new THREE.Vector3(-0.8, 0.6, 0.9));
  fill.target.position.copy(stageCenter);
  engine.scene.add(key, key.target, fill, fill.target);
  if (q.get('post') === '0') engine.renderFn = () => engine.renderer.render(engine.scene, engine.camera);

  // --- Caméra ---------------------------------------------------------------------------------------
  const camera = engine.camera;
  const view = ctx.dev.view;
  const rowView = q.get('cam') === 'row';
  const rowCenter = new THREE.Vector3((-1.47 + cursor) / 2, benchY + 0.02, zTips - 0.08);
  const target = rowView ? rowCenter : stageCenter.clone().add(new THREE.Vector3(0, 0.025, 0));
  const dir =
    view && view.length >= 3
      ? new THREE.Vector3(view[0], view[1], view[2]).normalize()
      : rowView
        ? new THREE.Vector3(0, 0.9, 0.75).normalize()
        : new THREE.Vector3(0.45, 0.55, 1).normalize();
  const firstTool = q.get('tool');
  const firstView =
    firstTool && firstTool in DEMOS ? DEMOS[firstTool as ToolId].view : DEMOS[TOOL_IDS[0]].view;
  const distance = view && view.length >= 4 ? view[3]! : rowView ? 1.8 : firstView;
  camera.fov = 35;
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  const controls = new OrbitControls(camera, engine.canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.zoomToCursor = true;
  controls.minDistance = 0.01;
  controls.update();

  // --- Boucle de démonstration ---------------------------------------------------------------------
  const only = q.get('tool');
  let sequence: ToolId[] =
    only && (TOOL_IDS as readonly string[]).includes(only) ? [only as ToolId] : [...TOOL_IDS];
  let frozen: number | null =
    q.get('t') !== null && Number.isFinite(Number(q.get('t'))) ? Number(q.get('t')) : null;
  const direction: 1 | -1 = q.get('dir') === '-1' ? -1 : 1;
  const speedParam = Number(q.get('speed'));
  const speed = Number.isFinite(speedParam) && speedParam > 0 ? speedParam : 1;
  const sample = createMotionSample();
  const axis = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const frame: ToolFrameState = { t: 0, motionT: 0, spin: 0, anchor: new THREE.Vector3() };
  let index = 0;
  let elapsed = 0;
  let begun = false;
  let demo: DemoPart | null = null;
  let spec: DemoSpec = DEMOS[sequence[0]!];
  let motionSeconds = 1;

  const setupDemo = (id: ToolId) => {
    presenter.end();
    if (demo) {
      stage.remove(demo.node, ...demo.fixtures);
      demo = null;
    }
    spec = DEMOS[id];
    demo = factory.create(spec.part);
    stage.add(demo.node, ...demo.fixtures);
    probe.part = demo;
    axis.set(spec.axis[0], spec.axis[1], spec.axis[2]).normalize();
    perpendicularTo(axis, perp);
    motionSeconds = motionTiming(spec.motion, direction).total;
    for (const [tid, holder] of rowTools) holder.visible = tid !== id;
    const labelMat = labelMaterials.get(id);
    if (labelMat) stageLabel.material = labelMat;
    elapsed = 0;
    begun = false;
    poseDemo(0);
  };

  /** Pose la pièce factice pour la progression `u` du mouvement (comme `PoseComposer`). */
  const poseDemo = (u: number) => {
    if (!demo) return;
    sampleMotion(spec.motion, u, direction, sample);
    const node = demo.node;
    const restPos = node.userData.restPosition as THREE.Vector3;
    node.position.copy(restPos).addScaledVector(axis, sample.offset).addScaledVector(perp, sample.lateral);
    qa.setFromAxisAngle(axis, sample.spin);
    qb.setFromAxisAngle(perp, sample.tilt);
    node.quaternion.identity().premultiply(qb).premultiply(qa);
    node.updateMatrixWorld(true);
  };

  /** Point de travail : centre de la face de sortie de la boîte (comme le séquenceur). */
  const boxSize = new THREE.Vector3();
  const workPoint = (target: THREE.Vector3): THREE.Vector3 => {
    const part = demo!;
    part.box.getCenter(target).applyMatrix4(part.node.matrixWorld);
    const size = part.box.getSize(boxSize);
    const half = 0.5 * (Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y + Math.abs(axis.z) * size.z);
    return target.addScaledVector(axis, half);
  };

  setupDemo(sequence[0]!);
  const total = () => TOOL_APPROACH_SECONDS + motionSeconds + TOOL_RETRACT_SECONDS;

  const removeUpdate = engine.add({
    update: (f) => {
      if (!demo) return;
      if (frozen === null) elapsed += f.dt * speed;
      const g = total();
      const local = frozen === null ? elapsed - PRE : THREE.MathUtils.clamp(frozen, 0, 1) * g;
      if (local >= 0 && !begun) {
        begun = true;
        poseDemo(0);
        const anchor = workPoint(new THREE.Vector3());
        const size = demo.box.getBoundingSphere(new THREE.Sphere()).radius;
        presenter.begin({
          toolId: sequence[index]!,
          partId: 'démo',
          motion: spec.motion.motion,
          direction,
          axis: axis.clone(),
          anchor,
          size,
          motionDuration: motionSeconds,
        });
      }
      if (begun && local <= g + 1e-6) {
        const motionT = THREE.MathUtils.clamp((local - TOOL_APPROACH_SECONDS) / motionSeconds, 0, 1);
        poseDemo(motionT);
        frame.t = THREE.MathUtils.clamp(local / g, 0, 1);
        frame.motionT = motionT;
        frame.spin = sample.spin;
        workPoint(frame.anchor);
        presenter.update(frame);
      }
      if (frozen === null && local > g) {
        presenter.end();
        if (local > g + POST) {
          index = (index + 1) % sequence.length;
          setupDemo(sequence[index]!);
        }
      }
      controls.update();
      const d = engine.camera.position.distanceTo(controls.target);
      engine.camera.near = Math.max(1e-4, d * 0.02);
      engine.camera.far = Math.max(10, d * 200);
      engine.camera.updateProjectionMatrix();
    },
  });

  console.info(`[banc des outils] ${rowTools.size} outils, démonstration : ${sequence.join(', ')}.`);
  const handle: ToolShowcaseHandle = {
    root,
    presenter,
    controls,
    current: () => sequence[index]!,
    select: (id) => {
      if (!sequence.includes(id)) sequence = [id];
      index = sequence.indexOf(id);
      setupDemo(id);
      if (!rowView) {
        const d = engine.camera.position.distanceTo(controls.target);
        engine.camera.position
          .sub(controls.target)
          .multiplyScalar(DEMOS[id].view / d)
          .add(controls.target);
      }
    },
    freeze: (t) => {
      frozen = t;
    },
    dispose: () => {
      removeUpdate();
      controls.dispose();
      presenter.dispose();
      engine.scene.remove(root, key, key.target, fill, fill.target);
      key.dispose();
      fill.dispose();
      for (const g of geometries) g.dispose();
      for (const m of ownMaterials) m.dispose();
      factory.dispose();
      textures.disposeScope('dev/tools/');
    },
  };
  (window as unknown as { __tools?: ToolShowcaseHandle }).__tools = handle;
  return handle;
}

/** Boîte englobante monde des seuls maillages visibles. */
function visibleBox(object: THREE.Object3D, target: THREE.Box3): THREE.Box3 {
  target.makeEmpty();
  const tmp = new THREE.Box3();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.computeBoundingBox();
      target.union(tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld));
    }
    for (const c of o.children) visit(c);
  };
  visit(object);
  return target;
}

/** Géométries et matériaux propres d'un modèle (libérés avec le banc). */
function collectOwned(
  model: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): void {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.push(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) if (m.userData.shared !== true && !materials.includes(m)) materials.push(m);
  });
}

/** Sonde de la pièce factice (même calcul que pour les pièces d'un objet). */
class DemoProbe implements PartProbe {
  part: DemoPart | null = null;
  constructor(private readonly stage: THREE.Object3D) {}

  describe(_id: string, axis: THREE.Vector3, anchor: THREE.Vector3, out: PartShape): boolean {
    if (!this.part) return false;
    this.part.node.updateMatrixWorld(true);
    describeOrientedBox(this.part.box, this.part.node.matrixWorld, axis, anchor, out);
    this.stage.getWorldPosition(out.objectCenter);
    out.hasCenter = true;
    return true;
  }

  worldQuaternion(_id: string, out: THREE.Quaternion): boolean {
    if (!this.part) return false;
    this.part.node.getWorldQuaternion(out);
    return true;
  }
}

/** Fabrique des pièces factices (géométries simples, matériaux de la bibliothèque). */
class DemoFactory {
  private readonly cache = new Map<string, DemoPart>();

  constructor(
    private readonly materials: AppContext['materials'],
    private readonly geometries: THREE.BufferGeometry[],
    private readonly top: number,
  ) {}

  create(kind: string): DemoPart {
    const cached = this.cache.get(kind);
    if (cached) return cached;
    const part = this.build(kind);
    part.node.userData.restPosition = part.node.position.clone();
    part.node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    for (const f of part.fixtures) {
      f.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
    }
    this.cache.set(kind, part);
    return part;
  }

  dispose(): void {
    this.cache.clear();
  }

  private mesh(geometry: THREE.BufferGeometry, id: string, x = 0, y = 0, z = 0): THREE.Mesh {
    this.geometries.push(geometry);
    const m = new THREE.Mesh(geometry, this.materials.get(id));
    m.position.set(x, y, z);
    return m;
  }

  /** Pièce : nœud au pivot + boîte des maillages propres (repère du nœud). */
  private part(node: THREE.Object3D, fixtures: THREE.Object3D[] = []): DemoPart {
    node.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    node.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      tmp
        .copy(mesh.geometry.boundingBox!)
        .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      box.union(tmp);
    });
    return { node, box, fixtures };
  }

  private build(kind: string): DemoPart {
    const top = this.top;
    const node = new THREE.Group();
    node.name = `Pièce factice « ${kind} »`;
    node.position.set(0, top, 0);
    switch (kind) {
      case 'screw.socket': {
        node.add(
          this.mesh(new THREE.CylinderGeometry(0.00275, 0.00275, 0.003, 32), 'steel.blackoxide', 0, 0.0015),
        );
        node.add(this.mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0002, 6), 'rubber.black', 0, 0.003));
        node.add(
          this.mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.006, 16), 'steel.blackoxide', 0, -0.003),
        );
        return this.part(node);
      }
      case 'screw.phillips':
      case 'screw.slotted': {
        const head = new THREE.SphereGeometry(0.0028, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        head.scale(1, 0.7, 1);
        node.add(this.mesh(head, 'steel.zinc'));
        node.add(this.mesh(new THREE.BoxGeometry(0.0034, 0.0006, 0.0006), 'rubber.black', 0, 0.00185));
        if (kind === 'screw.phillips')
          node.add(this.mesh(new THREE.BoxGeometry(0.0006, 0.0006, 0.0034), 'rubber.black', 0, 0.00185));
        node.add(this.mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.006, 16), 'steel.zinc', 0, -0.003));
        return this.part(node);
      }
      case 'pin':
        node.add(this.mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.014, 16), 'brass', 0, 0.003));
        return this.part(node);
      case 'circlip': {
        const shaft = this.mesh(
          new THREE.CylinderGeometry(0.0025, 0.0025, 0.02, 24),
          'steel.ground',
          0,
          top + 0.008,
        );
        node.position.y = top + 0.014;
        const ring = new THREE.TorusGeometry(0.0034, 0.0007, 8, 40, Math.PI * 1.7);
        ring.rotateX(Math.PI / 2);
        ring.rotateY(Math.PI * 0.65);
        node.add(this.mesh(ring, 'steel.spring'));
        node.add(
          this.mesh(
            new THREE.CylinderGeometry(0.0009, 0.0009, 0.0006, 12),
            'steel.spring',
            0.0018,
            0,
            0.0036,
          ),
        );
        node.add(
          this.mesh(
            new THREE.CylinderGeometry(0.0009, 0.0009, 0.0006, 12),
            'steel.spring',
            -0.0018,
            0,
            0.0036,
          ),
        );
        return this.part(node, [shaft]);
      }
      case 'wire': {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-0.004, -0.002, 0),
          new THREE.Vector3(-0.003, 0.004, 0),
          new THREE.Vector3(0, 0.006, 0),
          new THREE.Vector3(0.003, 0.004, 0),
          new THREE.Vector3(0.004, -0.002, 0),
        ]);
        node.add(this.mesh(new THREE.TubeGeometry(curve, 32, 0.0005, 10), 'copper.bare'));
        return this.part(node);
      }
      case 'bearing': {
        const stub = this.mesh(
          new THREE.CylinderGeometry(0.003, 0.003, 0.012, 24),
          'steel.ground',
          0,
          top + 0.006,
        );
        node.position.y = top + 0.004;
        node.add(this.mesh(ringGeometry(0.008, 0.0065, 0.005), 'steel.stainless'));
        node.add(this.mesh(ringGeometry(0.0045, 0.003, 0.005), 'steel.stainless'));
        node.add(this.mesh(ringGeometry(0.0065, 0.0045, 0.0044), 'rubber.black'));
        const base = this.mesh(
          new THREE.CylinderGeometry(0.009, 0.009, 0.004, 32),
          'alu.anodized.silver',
          0,
          top + 0.002,
        );
        return this.part(node, [stub, base]);
      }
      case 'shaft': {
        const hub = this.mesh(new THREE.BoxGeometry(0.014, 0.02, 0.02), 'alu.anodized.blue', 0, top + 0.04);
        const block = this.mesh(new THREE.BoxGeometry(0.02, 0.03, 0.02), 'alu.machined', 0, top + 0.015);
        node.position.set(0, top + 0.04, 0);
        const shaft = new THREE.CylinderGeometry(0.0025, 0.0025, 0.03, 24);
        shaft.rotateZ(Math.PI / 2);
        node.add(this.mesh(shaft, 'steel.ground'));
        return this.part(node, [hub, block]);
      }
      case 'cap':
        node.add(this.mesh(new THREE.CylinderGeometry(0.009, 0.0095, 0.006, 32), 'plastic.white', 0, 0.003));
        return this.part(node);
      case 'tht':
      case 'led':
      case 'smd':
      case 'soic':
      case 'capacitor':
      case 'dip': {
        const pcb = this.mesh(new THREE.BoxGeometry(0.04, 0.0016, 0.03), 'mask.teal', 0, top + 0.0008);
        node.position.y = top + 0.0016;
        this.circuitPart(kind, node);
        return this.part(node, [pcb, ...(kind === 'dip' ? [this.socket()] : [])]);
      }
      case 'sticker':
        node.add(this.mesh(new THREE.BoxGeometry(0.02, 0.0002, 0.012), 'paper.label', 0, 0.0001));
        return this.part(node);
      case 'cover':
        node.add(this.mesh(new THREE.BoxGeometry(0.024, 0.004, 0.014), 'plastic.white', 0, 0.002));
        return this.part(node);
      default:
        node.add(this.mesh(new THREE.BoxGeometry(0.02, 0.012, 0.02), 'alu.anodized.red', 0, 0.006));
        return this.part(node);
    }
  }

  private socket(): THREE.Object3D {
    return this.mesh(
      new THREE.BoxGeometry(0.0115, 0.003, 0.0095),
      'plastic.black',
      0,
      this.top + 0.0016 + 0.0015,
    );
  }

  private circuitPart(kind: string, node: THREE.Group): void {
    switch (kind) {
      case 'tht': {
        const body = new THREE.CylinderGeometry(0.00115, 0.00115, 0.0063, 20);
        body.rotateZ(Math.PI / 2);
        node.add(this.mesh(body, 'ceramic.tan', 0, 0.0012));
        for (const x of [-0.0045, 0.0045])
          node.add(this.mesh(new THREE.CylinderGeometry(0.0003, 0.0003, 0.003, 8), 'tin', x, 0.0));
        return;
      }
      case 'led':
        node.add(this.mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.006, 24), 'led.red', 0, 0.004));
        node.add(this.mesh(new THREE.CylinderGeometry(0.0029, 0.0029, 0.001, 24), 'led.red', 0, 0.0012));
        return;
      case 'smd':
        node.add(this.mesh(new THREE.BoxGeometry(0.0026, 0.00055, 0.0016), 'resistor.black', 0, 0.000275));
        for (const x of [-0.00145, 0.00145])
          node.add(this.mesh(new THREE.BoxGeometry(0.0004, 0.0006, 0.0016), 'tin', x, 0.0003));
        return;
      case 'soic':
        node.add(this.mesh(new THREE.BoxGeometry(0.0049, 0.0015, 0.0039), 'epoxy.black', 0, 0.00085));
        for (let i = 0; i < 4; i++)
          for (const z of [-0.0026, 0.0026])
            node.add(
              this.mesh(
                new THREE.BoxGeometry(0.0004, 0.0002, 0.0012),
                'tin',
                -0.0019 + i * 0.00127,
                0.0001,
                z,
              ),
            );
        return;
      case 'capacitor':
        node.add(this.mesh(new THREE.BoxGeometry(0.002, 0.0012, 0.00125), 'ceramic.tan', 0, 0.0006));
        return;
      case 'dip':
        node.position.y += 0.003;
        node.add(this.mesh(new THREE.BoxGeometry(0.0098, 0.0033, 0.0064), 'epoxy.black', 0, 0.00165));
        for (let i = 0; i < 4; i++)
          for (const z of [-0.0038, 0.0038])
            node.add(
              this.mesh(
                new THREE.BoxGeometry(0.0006, 0.0034, 0.0003),
                'tin',
                -0.0038 + i * 0.00254,
                -0.0006,
                z,
              ),
            );
        return;
    }
  }
}

/** Anneau (bague de roulement) d'axe Y centré sur l'origine. */
function ringGeometry(outer: number, inner: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 40 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -height / 2, 0);
  return g;
}
