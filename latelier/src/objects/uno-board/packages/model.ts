/**
 * Modèle de composant et construction des pièces correspondantes.
 *
 * Un `ComponentModel` décrit un boîtier dans son repère LOCAL (m) : origine au centre de
 * l'empreinte sur le plan du cuivre supérieur (`Y_CU_T`), X/Z = axes locaux de l'empreinte
 * (Z = −Y carte), Y vers le haut. Chaque maillage peut être répété dans le composant (`locals` :
 * pattes, broches) et marqué comme joint de soudure (fond au dessoudage) et/ou niveau de détail.
 *
 * Construction :
 * - composant unique : groupe placé/tourné sur l'empreinte, maillages répétés instanciés ;
 * - groupe de composants identiques (passifs) : une instance par composant et par maillage
 *   (répétitions internes fusionnées), déclarées dans `PartBuild.instanced` pour la sélection
 *   individuelle ;
 * - joints de soudure : regroupés sous `joints.low` (remplacés à l'approche par `joints.detail`),
 *   aplatis puis masqués par le crochet `onRemovalProgress` pendant la fusion de l'étain.
 */
import * as THREE from 'three/webgpu';
import { meltProgress } from '../../../inspection/motions';
import type { DetailSpec, PartBuild, PartHooks } from '../../types';
import { L_BOTTOM_PAD, L_PAD_TOP, Y_CU_T, boardRot, boardX, boardZ } from '../constants';
import type { ComponentPlacement } from '../layout';
import type { Ctx, UnoParams } from '../params';
import { instanced, mergeTransformed } from './geometry';

export type Lod = 'base' | 'low' | 'detail';

export interface ModelMesh {
  /** Nom (débogage). */
  name: string;
  /** Clé de cache de la géométrie (partagée entre composants identiques). */
  key: string;
  geometry: () => THREE.BufferGeometry;
  material: (ctx: Ctx) => THREE.Material;
  /** Transformations locales des répétitions (défaut : une, identité). */
  locals?: readonly THREE.Matrix4[];
  /**
   * Joint de soudure : `top` (plan des pastilles supérieures) ou `bottom` (sous la carte, la
   * géométrie est retournée) ; son repère Y = 0 est la surface étamée.
   */
  joint?: 'top' | 'bottom';
  /** `low` : remplacé par la version `detail` à l'approche. Défaut `base`. */
  lod?: Lod;
}

export interface ComponentModel {
  meshes: readonly ModelMesh[];
}

const IDENTITY = new THREE.Matrix4();

/** Matrice de placement d'un composant (repère objet, origine sur le plan du cuivre). */
export function placementMatrix(p: Pick<ComponentPlacement, 'x' | 'y' | 'rot'>): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(boardRot(p.rot));
  m.setPosition(boardX(p.x), 0, boardZ(p.y));
  return m;
}

const jointOffset = (j: 'top' | 'bottom'): number => (j === 'top' ? L_PAD_TOP : L_BOTTOM_PAD);

function selectMeshes(model: ComponentModel, lod: 'base' | 'detail', fineDetail: boolean): ModelMesh[] {
  return model.meshes.filter((m) => {
    const l = m.lod ?? 'base';
    if (lod === 'detail') return l === 'detail';
    if (fineDetail) return l !== 'low';
    return l !== 'detail';
  });
}

/** Ajoute les maillages d'un composant unique au groupe `root` (repère du composant). */
function addSingle(
  ctx: Ctx,
  root: THREE.Object3D,
  meshes: readonly ModelMesh[],
  jointsGroup: THREE.Group,
): void {
  for (const m of meshes) {
    const g = ctx.geometry.get(m.key, m.geometry);
    const material = m.material(ctx);
    const locals = m.locals ?? [IDENTITY];
    const obj =
      locals.length === 1
        ? Object.assign(new THREE.Mesh(g, material), { name: m.name })
        : instanced(g, material, locals, m.name);
    if (locals.length === 1) obj.applyMatrix4(locals[0]!);
    if (m.joint) {
      const holder = new THREE.Group();
      holder.name = `joint ${m.name}`;
      holder.position.y = jointOffset(m.joint);
      holder.userData.jointSide = m.joint;
      holder.add(obj);
      jointsGroup.add(holder);
    } else root.add(obj);
  }
}

/** Ajoute les maillages d'un groupe de composants identiques (une instance par composant). */
function addGroup(
  ctx: Ctx,
  root: THREE.Object3D,
  meshes: readonly ModelMesh[],
  placements: readonly THREE.Matrix4[],
  jointsGroup: THREE.Group,
  listed: THREE.InstancedMesh[] | null,
): void {
  for (const m of meshes) {
    const locals = m.locals ?? [IDENTITY];
    const key = locals.length === 1 ? m.key : `${m.key}:merged${locals.length}`;
    const g = ctx.geometry.get(key, () => {
      const base = m.geometry();
      if (locals.length === 1) return base;
      const merged = mergeTransformed(locals.map((matrix) => ({ geometry: base, matrix })));
      base.dispose();
      return merged;
    });
    const im = instanced(
      g,
      m.material(ctx),
      locals.length === 1 ? placements.map((p) => p.clone().multiply(locals[0]!)) : placements,
      m.name,
    );
    if (m.joint) {
      const holder = new THREE.Group();
      holder.name = `joint ${m.name}`;
      holder.position.y = jointOffset(m.joint);
      holder.userData.jointSide = m.joint;
      holder.add(im);
      jointsGroup.add(holder);
    } else {
      root.add(im);
      listed?.push(im);
    }
  }
}

/** Aplatit puis masque les joints (fusion de l'étain) selon la progression de retrait. */
export function meltJoints(root: THREE.Object3D, t: number): void {
  const melt = meltProgress(t);
  root.traverse((o) => {
    if (o.userData.jointSide === undefined) return;
    o.scale.y = Math.max(0.05, 1 - 0.9 * melt);
    o.visible = melt < 0.97;
  });
}

/** Crochets d'une pièce soudée (fusion des joints pendant le dessoudage et le ressoudage). */
export function solderHooks(root: THREE.Object3D): PartHooks {
  return {
    onRemovalProgress: (t, info) => {
      if (info.motion === 'desolder') meltJoints(root, t);
    },
  };
}

/**
 * Repère de la pièce construite :
 * - `placement` : nœud placé (translation seule) sur l'empreinte ; les maillages sont dans un
 *   groupe intérieur tourné (le nœud lui-même n'est jamais tourné : les axes de retrait et
 *   d'éclatement restent ceux de l'objet) ;
 * - `child` : pièce enfant d'un sous-ensemble déjà placé sur l'empreinte (origine nulle).
 */
export type Frame = 'placement' | 'child';

export interface BuildOptions {
  /** Une instance sélectionnable par composant (pièce à `quantity` > 1). */
  instancedPart?: boolean;
  label?: (i: number) => string;
  /** Construire les joints de soudure (défaut vrai). */
  withJoints?: boolean;
  /** Construire le corps (défaut vrai) ; faux = joints seuls (sous-ensemble soudé). */
  withBody?: boolean;
  /** Crochets de fusion des joints (défaut vrai). */
  hooks?: boolean;
  frame?: Frame;
}

function wantMesh(m: ModelMesh, opts: BuildOptions): boolean {
  if (m.joint) return opts.withJoints !== false;
  return opts.withBody !== false;
}

/** Construit la pièce d'un ou plusieurs composants identiques. */
export function buildComponent(
  ctx: Ctx,
  model: ComponentModel,
  placements: readonly ComponentPlacement[],
  opts: BuildOptions = {},
): PartBuild {
  const fine = ctx.params.fineDetail;
  const meshes = selectMeshes(model, 'base', fine).filter((m) => wantMesh(m, opts));
  const root = new THREE.Group();
  const joints = new THREE.Group();
  joints.name = 'joints.low';
  const listed: THREE.InstancedMesh[] = [];
  if (placements.length === 1 && !opts.instancedPart) {
    const p = placements[0]!;
    if (opts.frame !== 'child') root.position.set(boardX(p.x), Y_CU_T, boardZ(p.y));
    const inner = new THREE.Group();
    inner.name = 'composant';
    inner.rotation.y = boardRot(p.rot);
    root.add(inner);
    addSingle(ctx, inner, meshes, joints);
    if (joints.children.length) inner.add(joints);
  } else {
    root.position.y = Y_CU_T;
    addGroup(ctx, root, meshes, placements.map(placementMatrix), joints, listed);
    if (joints.children.length) root.add(joints);
  }
  const build: PartBuild = { object: root };
  if (opts.hooks !== false && joints.children.length) build.hooks = solderHooks(root);
  if (listed.length && opts.instancedPart) {
    build.instanced = listed;
    if (opts.label) build.instanceLabel = opts.label;
  }
  return build;
}

/** Détail (ménisques fins, pattes détaillées) : même repère que la construction de base. */
export function componentDetail(
  model: ComponentModel,
  placements: () => readonly ComponentPlacement[],
  opts: BuildOptions & { distance?: number } = {},
): DetailSpec<UnoParams> | undefined {
  if (!model.meshes.some((m) => m.lod === 'detail' && wantMesh(m, opts))) return undefined;
  return {
    distance: opts.distance ?? 0.12,
    replaces: ['joints.low'],
    build: (ctx) => {
      const group = new THREE.Group();
      group.name = 'joints.detail';
      if (ctx.params.fineDetail) return group; // déjà construit dans la base
      const meshes = selectMeshes(model, 'detail', false).filter((m) => wantMesh(m, opts));
      const list = placements();
      const holder = new THREE.Group();
      if (list.length === 1 && !opts.instancedPart) {
        group.rotation.y = boardRot(list[0]!.rot);
        addSingle(ctx, holder, meshes, group);
      } else {
        addGroup(ctx, holder, meshes, list.map(placementMatrix), group, null);
      }
      // Maillages non-joints éventuels du détail : rattachés au même groupe.
      for (const child of [...holder.children]) group.add(child);
      return group;
    },
  };
}
