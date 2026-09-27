/**
 * Composition des poses des pièces à chaque image.
 *
 * Pose locale d'une pièce = repos + décalage d'éclatement + mouvement de retrait :
 * - le décalage d'éclatement et la translation du retrait sont exprimés dans le repère du parent ;
 * - la rotation du retrait (dévissage, bascule) tourne autour de l'origine de la pièce (pivot).
 * Puis mélange vers une pose cible MONDE (rangement « park », puis vue rangée « knolling »).
 *
 * Pièces instanciées : le nœud ne reçoit que l'éclatement ; chaque instance reçoit son propre
 * mouvement (décalé dans le temps), l'écartement (spread) et sa cible de rangement, écrits dans
 * `instanceMatrix`. Les bornes des maillages instanciés sont recalculées après modification
 * (culling correct).
 *
 * Aucune allocation dans la boucle : vecteurs/quaternions/matrices temporaires réutilisés.
 */
import * as THREE from 'three/webgpu';
import type { Assembly, PartRuntime } from './Assembly';
import { createMotionSample, type MotionSample } from './motions';
import { computeExplodeStages, explodeDirection, explodeStageAmount } from './explode';
import { easeInOutCubic } from './easing';
import type { InstanceSpread, Vec3 } from '../objects/types';

/** État de pose dynamique d'une pièce. */
export interface PartPose {
  part: PartRuntime;
  // --- Éclatement ---
  stage: number;
  /** Direction d'éclatement (repère du parent, normalisée ; nulle si aucune). */
  explodeDir: THREE.Vector3;
  explodeDistance: number;
  /** Taux d'écartement courant de la pièce (étage, easé). */
  explodeAmount: number;
  explodeSpread: InstanceSpread | null;
  // --- Retrait ---
  /** Axe de retrait et axe perpendiculaire (repère du parent, normalisés). */
  axis: THREE.Vector3;
  perp: THREE.Vector3;
  /** Mêmes axes dans le repère du nœud (pièces instanciées). */
  axisNode: THREE.Vector3;
  perpNode: THREE.Vector3;
  /** Échantillon de mouvement courant de la pièce (pièces non instanciées). */
  motion: MotionSample;
  /** Échantillons par instance (pièces instanciées). */
  instanceMotion: MotionSample[] | null;
  removalSpread: InstanceSpread | null;
  // --- Placement ---
  /** Poids brut (0..1) vers l'emplacement de rangement « park ». */
  parkWeight: number;
  /** Poids brut (0..1) vers l'emplacement de la vue rangée. */
  knollWeight: number;
  /** Cibles monde (nœud) ; null = pas de cible. */
  parkTarget: THREE.Matrix4 | null;
  knollTarget: THREE.Matrix4 | null;
  /** Cibles monde par instance (repère de l'instance). */
  parkInstanceTargets: THREE.Matrix4[] | null;
  knollInstanceTargets: THREE.Matrix4[] | null;
  // --- Visibilité ---
  userHidden: boolean;
  /** Opacité liée au placement « hide » (1 = visible, 0 = cachée). */
  placementOpacity: number;
  /** Les matrices d'instance doivent être recalculées (mouvement, écartement, placement). */
  instancesDirty: boolean;
  /** Matrice monde du nœud et poids de placement lors du dernier calcul des instances. */
  lastNodeWorld: THREE.Matrix4;
  lastParkWeight: number;
  lastKnollWeight: number;
  /** Clones transparents pendant un fondu (matériau d'origine → clone). */
  fadeMaterials: Map<THREE.Material, THREE.Material> | null;
  /** Matériaux d'origine des maillages pendant un fondu. */
  fadeOriginals: Map<THREE.Mesh, THREE.Material | THREE.Material[]> | null;
  /** Opacité courante du fondu. */
  fadeOpacity: number;
}

const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _tp = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _ts = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _off = new THREE.Vector3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
/** Trajectoire en arc des placements : hauteur max (m) et rapport hauteur / trajet. */
const ARC_MAX = 0.05;
const ARC_RATIO = 0.3;
const _X = new THREE.Vector3(1, 0, 0);

/** Axe perpendiculaire stable à `axis` (bascules, tremblements latéraux). */
export function perpendicularTo(axis: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const ref = Math.abs(axis.dot(_Z)) < 0.9 ? _Z : _X;
  return target.crossVectors(axis, ref).normalize();
}

const vec = (v: Vec3, target = new THREE.Vector3()) => target.set(v[0], v[1], v[2]);

export class PoseComposer {
  readonly poses = new Map<string, PartPose>();
  readonly stageCount: number;
  private explodeRate = 0;
  private dirty = true;
  /** Incrémenté à chaque recomposition effective (vue : étiquettes, caméra, contours). */
  version = 0;
  private readonly lastExplodeAmount = new Map<string, number>();

  constructor(private readonly assembly: Assembly) {
    const stages = computeExplodeStages(assembly.order.map((p) => p.def));
    this.stageCount = stages.stageCount;
    const center = new THREE.Vector3();
    for (const part of assembly.order) {
      const def = part.def;
      // Centre de repos (repère du parent) pour la direction radiale.
      const box = part.localBox.isEmpty() ? part.subtreeBox : part.localBox;
      if (box.isEmpty()) center.set(0, 0, 0);
      else box.getCenter(center);
      center.multiply(part.restScale).applyQuaternion(part.restQuaternion).add(part.restPosition);
      const dir = explodeDirection(def.explode, [center.x, center.y, center.z]);
      const axis = def.removal ? vec(def.removal.axis).normalize() : new THREE.Vector3(0, 1, 0);
      const perp = perpendicularTo(axis, new THREE.Vector3());
      const invRest = part.restQuaternion.clone().invert();
      const count = part.instanced?.count ?? 0;
      this.poses.set(part.id, {
        part,
        stage: stages.stageOf.get(part.id) ?? 0,
        explodeDir: vec(dir),
        explodeDistance: def.explode.distance,
        explodeAmount: 0,
        explodeSpread: def.explode.spread ?? null,
        axis,
        perp,
        axisNode: axis.clone().applyQuaternion(invRest).normalize(),
        perpNode: perp.clone().applyQuaternion(invRest).normalize(),
        motion: createMotionSample(),
        instanceMotion: count > 0 ? Array.from({ length: count }, createMotionSample) : null,
        removalSpread: def.removal?.spread ?? null,
        parkWeight: 0,
        knollWeight: 0,
        parkTarget: null,
        knollTarget: null,
        parkInstanceTargets: null,
        knollInstanceTargets: null,
        userHidden: false,
        placementOpacity: 1,
        instancesDirty: true,
        lastNodeWorld: new THREE.Matrix4(),
        lastParkWeight: 0,
        lastKnollWeight: 0,
        fadeMaterials: null,
        fadeOriginals: null,
        fadeOpacity: 1,
      });
    }
  }

  get(id: string): PartPose | undefined {
    return this.poses.get(id);
  }

  /**
   * Demande une recomposition à la prochaine image ; `id` signale en plus que l'état propre de
   * cette pièce a changé (ses instances éventuelles seront recalculées).
   */
  markDirty(id?: string): void {
    this.dirty = true;
    if (id !== undefined) {
      const pose = this.poses.get(id);
      if (pose) pose.instancesDirty = true;
    }
  }

  get rate(): number {
    return this.explodeRate;
  }

  /** Taux d'éclatement global (0..1) : met à jour le taux de chaque étage et les hooks. */
  setExplodeRate(rate: number): void {
    const r = Math.min(1, Math.max(0, rate));
    if (r === this.explodeRate && !this.dirty) return;
    this.explodeRate = r;
    for (const pose of this.poses.values()) {
      const amount = explodeStageAmount(r, pose.stage, this.stageCount);
      if (pose.explodeSpread && amount !== pose.explodeAmount) pose.instancesDirty = true;
      pose.explodeAmount = amount;
      const last = this.lastExplodeAmount.get(pose.part.id);
      if (last === undefined || Math.abs(last - amount) > 1e-6) {
        this.lastExplodeAmount.set(pose.part.id, amount);
        try {
          pose.part.hooks?.onExplode?.(amount);
        } catch (error) {
          console.error(`[poses] hook onExplode de « ${pose.part.id} » :`, error);
        }
      }
    }
    this.dirty = true;
  }

  /** Recompose les poses si nécessaire (appelé une fois par image). */
  apply(force = false): void {
    if (!this.dirty && !force) return;
    this.dirty = false;
    this.version++;
    const root = this.assembly.root;
    root.updateWorldMatrix(true, false);
    for (const part of this.assembly.order) {
      const pose = this.poses.get(part.id)!;
      this.composeNode(pose);
      if (part.instanced && (force || this.instancesNeedUpdate(pose))) {
        this.composeInstances(pose);
        pose.instancesDirty = false;
        pose.lastNodeWorld.copy(part.node.matrixWorld);
        pose.lastParkWeight = pose.parkWeight;
        pose.lastKnollWeight = pose.knollWeight;
      }
    }
  }

  private composeNode(pose: PartPose): void {
    const part = pose.part;
    const node = part.node;
    const m = pose.motion;
    const instanced = part.instanced !== null;
    _p.copy(part.restPosition).addScaledVector(pose.explodeDir, pose.explodeDistance * pose.explodeAmount);
    _q.copy(part.restQuaternion);
    _s.copy(part.restScale);
    if (!instanced) {
      _p.addScaledVector(pose.axis, m.offset).addScaledVector(pose.perp, m.lateral);
      if (m.spin !== 0 || m.tilt !== 0) {
        _qa.setFromAxisAngle(pose.axis, m.spin);
        _qb.setFromAxisAngle(pose.perp, m.tilt);
        _q.premultiply(_qb).premultiply(_qa);
      }
      const parentWorld = node.parent ? node.parent.matrixWorld : null;
      if (parentWorld) {
        if (pose.parkWeight > 0 && pose.parkTarget)
          this.blendToWorld(parentWorld, pose.parkTarget, pose.parkWeight);
        if (pose.knollWeight > 0 && pose.knollTarget)
          this.blendToWorld(parentWorld, pose.knollTarget, pose.knollWeight);
      }
    }
    node.position.copy(_p);
    node.quaternion.copy(_q);
    node.scale.copy(_s);
    node.updateMatrix();
    if (node.parent) node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
    else node.matrixWorld.copy(node.matrix);
  }

  /** Mélange (_p, _q, _s) vers la cible monde `target` exprimée dans le repère du parent. */
  private blendToWorld(parentWorld: THREE.Matrix4, target: THREE.Matrix4, rawWeight: number): void {
    _m.copy(parentWorld).invert();
    _up.copy(_Y).transformDirection(_m);
    _m.multiply(target);
    this.blendTo(_m, rawWeight);
  }

  /**
   * Mélange (_p, _q, _s) vers la pose locale `local` : trajectoire en arc (la pièce est soulevée
   * puis reposée, hauteur proportionnelle au trajet, ≤ 5 cm), `_up` = verticale dans ce repère.
   */
  private blendTo(local: THREE.Matrix4, rawWeight: number): void {
    const w = easeInOutCubic(rawWeight);
    local.decompose(_tp, _tq, _ts);
    const lift = Math.min(ARC_MAX, _p.distanceTo(_tp) * ARC_RATIO) * Math.sin(Math.PI * w);
    _p.lerp(_tp, w).addScaledVector(_up, lift);
    _q.slerp(_tq, w);
    _s.lerp(_ts, w);
  }

  /** Instances à recalculer : état modifié, poids de placement changés, ou nœud déplacé sous cible monde. */
  private instancesNeedUpdate(pose: PartPose): boolean {
    if (pose.instancesDirty) return true;
    if (pose.parkWeight !== pose.lastParkWeight || pose.knollWeight !== pose.lastKnollWeight) return true;
    const worldTargets =
      (pose.parkWeight > 0 && pose.parkInstanceTargets !== null) ||
      (pose.knollWeight > 0 && pose.knollInstanceTargets !== null);
    return worldTargets && !pose.lastNodeWorld.equals(pose.part.node.matrixWorld);
  }

  private composeInstances(pose: PartPose): void {
    const part = pose.part;
    const inst = part.instanced!;
    const motions = pose.instanceMotion!;
    const nodeWorld = part.node.matrixWorld;
    const needInverse =
      (pose.parkWeight > 0 && pose.parkInstanceTargets !== null) ||
      (pose.knollWeight > 0 && pose.knollInstanceTargets !== null);
    if (needInverse) {
      _inv.copy(nodeWorld).invert();
      _up.copy(_Y).transformDirection(_inv);
    }
    for (let i = 0; i < inst.count; i++) {
      const m = motions[i]!;
      const pivot = inst.framePosition[i]!;
      // Translation dans le repère du nœud : retrait, tremblement, écartements.
      _off.copy(pose.axisNode).multiplyScalar(m.offset).addScaledVector(pose.perpNode, m.lateral);
      if (pose.removalSpread && m.spread !== 0) this.addSpread(pose.removalSpread, i, pivot, m.spread, _off);
      if (pose.explodeSpread && pose.explodeAmount !== 0)
        this.addSpread(pose.explodeSpread, i, pivot, pose.explodeAmount, _off);
      _p.copy(pivot).add(_off);
      _q.copy(inst.frameQuaternion[i]!);
      if (m.spin !== 0 || m.tilt !== 0) {
        _qa.setFromAxisAngle(pose.axisNode, m.spin);
        _qb.setFromAxisAngle(pose.perpNode, m.tilt);
        _q.premultiply(_qb).premultiply(_qa);
      }
      _s.copy(inst.frameScale[i]!);
      if (pose.parkWeight > 0 && pose.parkInstanceTargets)
        this.blendInstance(pose.parkInstanceTargets[i]!, pose.parkWeight);
      if (pose.knollWeight > 0 && pose.knollInstanceTargets)
        this.blendInstance(pose.knollInstanceTargets[i]!, pose.knollWeight);
      // F' (repère de l'instance dans N) → matrices d'instance de chaque maillage.
      _m.compose(_p, _q, _s);
      for (let k = 0; k < inst.meshes.length; k++) {
        const mesh = inst.meshes[k]!;
        if (k === 0) {
          if (inst.meshLocalIdentity[0]) mesh.setMatrixAt(i, _m);
          else mesh.setMatrixAt(i, _m2.multiplyMatrices(inst.meshLocalInv[0]!, _m));
        } else {
          _m2.multiplyMatrices(_m, inst.rel[k]![i]!);
          if (!inst.meshLocalIdentity[k]) _m2.premultiply(inst.meshLocalInv[k]!);
          mesh.setMatrixAt(i, _m2);
        }
      }
    }
    for (let k = 0; k < inst.meshes.length; k++) inst.meshes[k]!.instanceMatrix.needsUpdate = true;
    this.assembly.refreshInstancedBounds(part);
  }

  private blendInstance(targetWorld: THREE.Matrix4, rawWeight: number): void {
    this.blendTo(_m2.multiplyMatrices(_inv, targetWorld), rawWeight);
  }

  /** Ajoute l'écartement de l'instance `i` (repère du nœud) à `out`. */
  private addSpread(
    spread: InstanceSpread,
    i: number,
    pivot: THREE.Vector3,
    amount: number,
    out: THREE.Vector3,
  ): void {
    if (spread.mode === 'linear') {
      out.x += spread.step[0] * i * amount;
      out.y += spread.step[1] * i * amount;
      out.z += spread.step[2] * i * amount;
      return;
    }
    vec(spread.axis, _v).normalize();
    const along = pivot.dot(_v);
    _v.multiplyScalar(-along).add(pivot);
    const l = _v.length();
    if (l < 1e-9) return;
    out.addScaledVector(_v, (spread.distance * amount) / l);
  }

  // --- Visibilité et fondus ---------------------------------------------------------------

  /**
   * Applique la visibilité d'une pièce (masquage utilisateur, placement « hide », détail). Une
   * pièce suit le fondu de ses ancêtres cachés (elle est partie avec eux), sauf en vue rangée où
   * chaque pièce est posée pour elle-même.
   */
  refreshVisibility(id: string): void {
    const pose = this.poses.get(id);
    if (!pose) return;
    let opacity = 1;
    if (pose.knollWeight <= 0) {
      opacity = pose.placementOpacity;
      for (let pid = pose.part.parentId; pid;) {
        const parent = this.poses.get(pid);
        if (!parent) break;
        opacity = Math.min(opacity, parent.placementOpacity);
        pid = parent.part.parentId;
      }
    }
    const visible = !pose.userHidden && opacity > 0.001;
    for (const mesh of pose.part.ownMeshes) mesh.visible = visible && mesh.userData.detailReplaced !== true;
    this.setFade(pose, visible && opacity < 0.999 ? opacity : null);
  }

  refreshAllVisibility(): void {
    for (const id of this.poses.keys()) this.refreshVisibility(id);
  }

  /** Visibilité d'une pièce et de tous ses descendants. */
  refreshVisibilityDeep(id: string): void {
    for (const sub of this.assembly.subtreeIds(id)) this.refreshVisibility(sub);
  }

  /** Fondu : clones transparents des matériaux de la pièce, libérés à la fin du fondu. */
  private setFade(pose: PartPose, opacity: number | null): void {
    if (opacity === null) {
      if (!pose.fadeOriginals) return;
      for (const [mesh, material] of pose.fadeOriginals) mesh.material = material;
      for (const clone of pose.fadeMaterials!.values()) clone.dispose();
      pose.fadeOriginals = null;
      pose.fadeMaterials = null;
      pose.fadeOpacity = 1;
      return;
    }
    pose.fadeOpacity = opacity;
    if (!pose.fadeOriginals) {
      pose.fadeOriginals = new Map();
      pose.fadeMaterials = new Map();
      for (const mesh of pose.part.ownMeshes) {
        pose.fadeOriginals.set(mesh, mesh.material);
        mesh.material = this.fadeCloneOf(pose, mesh.material);
      }
    }
    for (const [original, clone] of pose.fadeMaterials!) clone.opacity = original.opacity * opacity;
  }

  /** Clone(s) transparent(s) d'un matériau pour le fondu d'une pièce (mis en cache par original). */
  private fadeCloneOf(
    pose: PartPose,
    material: THREE.Material | THREE.Material[],
  ): THREE.Material | THREE.Material[] {
    const clones = pose.fadeMaterials!;
    const cloneOf = (m: THREE.Material) => {
      let c = clones.get(m);
      if (!c) {
        c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        c.userData = { ...m.userData, shared: false, fadeClone: true };
        c.opacity = m.opacity * pose.fadeOpacity;
        clones.set(m, c);
      }
      return c;
    };
    return Array.isArray(material) ? material.map(cloneOf) : cloneOf(material);
  }

  /**
   * Matériau « de base » d'un maillage : celui qu'il retrouvera à la fin d'un fondu en cours,
   * sinon son matériau courant. Utilisé par les modes de vue (rayons X, coupe).
   */
  baseMaterialOf(mesh: THREE.Mesh): THREE.Material | THREE.Material[] {
    const id: unknown = mesh.userData.partId;
    const pose = typeof id === 'string' ? this.poses.get(id) : undefined;
    return pose?.fadeOriginals?.get(mesh) ?? mesh.material;
  }

  /** Remplace le matériau de base d'un maillage, en conservant un fondu en cours. */
  setBaseMaterial(mesh: THREE.Mesh, material: THREE.Material | THREE.Material[]): void {
    const id: unknown = mesh.userData.partId;
    const pose = typeof id === 'string' ? this.poses.get(id) : undefined;
    if (pose?.fadeOriginals?.has(mesh)) {
      pose.fadeOriginals.set(mesh, material);
      mesh.material = this.fadeCloneOf(pose, material);
      return;
    }
    mesh.material = material;
  }

  /** Remet toutes les pièces au repos (poids, mouvements, fondus). */
  resetAll(): void {
    for (const pose of this.poses.values()) {
      Object.assign(pose.motion, createMotionSample());
      pose.instanceMotion?.forEach((m) => Object.assign(m, createMotionSample()));
      pose.parkWeight = 0;
      pose.placementOpacity = 1;
      pose.instancesDirty = true;
      this.refreshVisibility(pose.part.id);
    }
    this.dirty = true;
  }

  dispose(): void {
    for (const pose of this.poses.values()) this.setFade(pose, null);
    this.poses.clear();
  }
}
