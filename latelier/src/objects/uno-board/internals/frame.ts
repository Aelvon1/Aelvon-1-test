/**
 * Niveau 3 (intérieurs des composants clés) : outils communs de construction.
 *
 * Chaque composant clé est un sous-ensemble retirable (nœud placé par translation seule sur son
 * empreinte, voir `components/common.ts`). Ses pièces internes sont des ENFANTS de ce
 * sous-ensemble : la règle implicite du parent impose donc d'avoir d'abord retiré le composant de
 * la carte. Une pièce interne est construite dans le repère LOCAL du composant (mm → m, origine
 * au centre de l'empreinte sur le plan du cuivre, X/Z = axes de l'empreinte) :
 * - nœud de la pièce = pivot (translation seule dans le repère du parent, jamais tourné : les
 *   axes de retrait et d'éclatement restent ceux de l'objet) ;
 * - groupe intérieur tourné de la rotation de l'empreinte et décalé pour que le pivot local
 *   coïncide avec l'origine du nœud ;
 * - maillages répétés (`locals`) instanciés ; un maillage peut être déclaré « instances
 *   sélectionnables » (fils d'or, supports, contacts) : il est alors exposé dans
 *   `PartBuild.instanced` avec un libellé par instance.
 */
import * as THREE from 'three/webgpu';
import type { ExplodeSpec, PartBuild, PartDef, PartHooks, PartInfo, RemovalSpec, Vec3 } from '../../types';
import { boardRot } from '../constants';
import { component } from '../layout';
import { instanced } from '../packages/geometry';
import { buildComponent, componentDetail, type ComponentModel } from '../packages/model';
import type { Ctx, UnoParams } from '../params';

/** Maillage d'une pièce interne (repère local du composant, m). */
export interface InnerMesh {
  name: string;
  /** Clé du cache de géométries (partagée entre composants identiques, ex. PC1/PC2). */
  key: string;
  geometry: () => THREE.BufferGeometry;
  material: (ctx: Ctx) => THREE.Material;
  /** Répétitions (InstancedMesh) ; défaut : une seule, identité. */
  locals?: readonly THREE.Matrix4[];
  /** Instances sélectionnables individuellement (exposées dans `PartBuild.instanced`). */
  selectable?: boolean;
  /** Maillage déformé à chaque image (hooks) : pas de découpage de vue sur des bornes figées. */
  dynamic?: boolean;
  /** Géométrie propre à la pièce (non partagée via le cache) : déformée par un hook. */
  unique?: boolean;
}

export interface InnerBuildOptions {
  /** Pivot de la pièce dans le repère local du composant (m). Défaut : origine. */
  pivot?: Vec3;
  /** Libellé des instances sélectionnables. */
  label?: (index: number) => string;
  /** Ancrage (repère local du composant, m) des étiquettes et de l'outil. */
  anchor?: Vec3;
  /** Crochets construits une fois les maillages créés (déformations). */
  hooks?: (meshes: ReadonlyMap<string, THREE.Mesh>, inner: THREE.Group) => PartHooks;
}

/** Rotation (rad, autour de Y) de l'empreinte d'un composant. */
export const refRotation = (ref: string): number => boardRot(component(ref).rot);

/** Vecteur du repère local du composant exprimé dans le repère du parent (axes de l'objet). */
export function toParent(ref: string, v: Vec3): Vec3 {
  const r = refRotation(ref);
  const c = Math.cos(r);
  const s = Math.sin(r);
  // Convention three.js : rotation.y = r ⇒ x' = x cos r + z sin r ; z' = −x sin r + z cos r.
  const x = v[0] * c + v[2] * s;
  const z = -v[0] * s + v[2] * c;
  return [clean(x), v[1], clean(z)];
}

const clean = (v: number): number => (Math.abs(v) < 1e-12 ? 0 : v);

/** Construit une pièce interne d'un composant (voir l'en-tête du module). */
export function buildInner(
  ctx: Ctx,
  ref: string,
  meshes: readonly InnerMesh[],
  opts: InnerBuildOptions = {},
): PartBuild {
  const pivot = opts.pivot ?? [0, 0, 0];
  const root = new THREE.Group();
  const p = toParent(ref, pivot);
  root.position.set(p[0], p[1], p[2]);
  const inner = new THREE.Group();
  inner.name = 'intérieur';
  inner.rotation.y = refRotation(ref);
  inner.position.set(-p[0], -p[1], -p[2]);
  root.add(inner);
  const byName = new Map<string, THREE.Mesh>();
  const selectable: THREE.InstancedMesh[] = [];
  for (const m of meshes) {
    const geometry = m.unique ? m.geometry() : ctx.geometry.get(m.key, m.geometry);
    const material = m.material(ctx);
    const locals = m.locals;
    let mesh: THREE.Mesh;
    if (locals && (locals.length > 1 || m.selectable)) {
      const im = instanced(geometry, material, locals, m.name);
      if (m.selectable) selectable.push(im);
      mesh = im;
    } else {
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = m.name;
      if (locals?.[0]) mesh.applyMatrix4(locals[0]);
    }
    if (m.dynamic) mesh.frustumCulled = false;
    inner.add(mesh);
    byName.set(m.name, mesh);
  }
  const build: PartBuild = { object: root };
  if (selectable.length) {
    build.instanced = selectable;
    if (opts.label) build.instanceLabel = opts.label;
  }
  if (opts.anchor) {
    const a = toParent(ref, opts.anchor);
    build.anchor = [a[0] - p[0], a[1] - p[1], a[2] - p[2]];
  }
  if (opts.hooks) build.hooks = opts.hooks(byName, inner);
  return build;
}

/** Données d'une pièce interne (déclaration compacte). */
export interface InnerPartSpec {
  id: string;
  name: string;
  /** Sous-ensemble du composant (ex. « u4 »). */
  parent: string;
  /** Désignation du composant (layout), pour le repère local. */
  ref: string;
  info: PartInfo;
  /** Maillages (appelé à chaque construction). */
  meshes?: () => readonly InnerMesh[];
  options?: InnerBuildOptions;
  /**
   * Variante de `meshes` + `options` créés ensemble à chaque construction (état partagé entre
   * les géométries et les crochets, ex. enroulement déformable).
   */
  create?: () => { meshes: readonly InnerMesh[]; options?: InnerBuildOptions };
  /** Retrait (absent : pièce de base du composant, jamais retirée). */
  removal?: RemovalSpec;
  explode: ExplodeSpec;
  quantity?: number;
  tags?: readonly string[];
  labelPriority?: number;
  material?: string;
}

export function innerPart(spec: InnerPartSpec): PartDef<UnoParams> {
  const part: PartDef<UnoParams> = {
    id: spec.id,
    name: spec.name,
    parent: spec.parent,
    tags: ['internal', ...(spec.tags ?? [])],
    build: (ctx) => {
      const made = spec.create ? spec.create() : { meshes: spec.meshes?.() ?? [], options: spec.options };
      return buildInner(ctx, spec.ref, made.meshes, made.options);
    },
    info: spec.info,
    explode: spec.explode,
    label: { priority: spec.labelPriority ?? 3 },
  };
  if (spec.removal) part.removal = spec.removal;
  if (spec.quantity !== undefined) part.quantity = spec.quantity;
  if (spec.material) part.material = spec.material;
  return part;
}

/** Sous-ensemble d'un composant clé (joints de soudure + geste de retrait de la carte). */
export interface KeyAssemblySpec {
  ref: string;
  id: string;
  name: string;
  parent: string;
  /** Modèle réduit aux joints de soudure (éventuellement vide : composant sur support). */
  joints: ComponentModel;
  tags: readonly string[];
  info: PartInfo;
  removal: RemovalSpec;
  explode: ExplodeSpec;
  labelPriority?: number;
}

/**
 * Sous-ensemble retirable d'un composant clé : mêmes conventions que `components/common.ts`
 * (nœud placé par translation seule, joints fondus au dessoudage), sans pièce extérieure
 * monolithique : ce sont les pièces internes qui constituent le composant.
 */
export function keyAssemblyPart(spec: KeyAssemblySpec): PartDef<UnoParams> {
  const placement = () => [component(spec.ref)];
  const part: PartDef<UnoParams> = {
    id: spec.id,
    name: spec.name,
    kind: 'assembly',
    parent: spec.parent,
    tags: spec.tags,
    build: (ctx) => buildComponent(ctx, spec.joints, placement(), { withBody: false }),
    info: spec.info,
    explode: spec.explode,
    removal: spec.removal,
    label: { priority: spec.labelPriority ?? 5 },
  };
  const detail = componentDetail(spec.joints, placement, { withBody: false });
  if (detail) part.detail = detail;
  return part;
}
