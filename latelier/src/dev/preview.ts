/**
 * Banc de prévisualisation d'objet (développement) : `?preview=<id objet>`.
 *
 * Construit toutes les pièces d'un objet sur le tapis de l'établi, avec une caméra orbitale
 * simple, SANS le moteur d'inspection. Sert à mettre au point la géométrie et les matériaux
 * d'un objet. Paramètres complémentaires :
 * - `explode=0..1`   : éclatement naïf (direction × distance, étages ignorés) ;
 * - `only=a,b`       : n'afficher que ces pièces (et leurs enfants) ;
 * - `hide=a,b`       : masquer ces pièces ;
 * - `p.<clé>=valeur` : paramètre de l'objet (ex. `p.kv=6000`, `p.sensors=false`) ;
 * - `preset=<id>`    : préréglage ;
 * - `view=dx,dy,dz,distance` : direction (depuis la cible) et distance de la caméra ;
 * - `target=x,y,z`   : cible de la caméra dans le repère de l'objet (défaut : centre).
 */
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AppContext } from '../core/context';
import type { World } from '../world/World';
import { getObjectDef } from '../objects/registry';
import { resolveObject } from '../objects/resolve';
import {
  SimpleGeometryCache,
  createBuildContext,
  createPrepareContext,
  normalizeBuild,
  registerObjectMaterials,
} from '../objects/buildSupport';
import type { ObjectParams, Vec3 } from '../objects/types';

export async function startPreview(ctx: AppContext, world: World, objectId: string): Promise<void> {
  const def = getObjectDef(objectId);
  if (!def) throw new Error(`Objet inconnu : « ${objectId} ».`);
  const q = ctx.dev.raw;
  const params: Partial<ObjectParams> = {
    ...(def.presets?.find((p) => p.id === q.get('preset'))?.params ?? {}),
  };
  for (const [key, value] of q.entries()) {
    if (!key.startsWith('p.')) continue;
    const k = key.slice(2);
    params[k] =
      value === 'true'
        ? true
        : value === 'false'
          ? false
          : Number.isFinite(Number(value))
            ? Number(value)
            : value;
  }
  const resolved = resolveObject(def, params);
  registerObjectMaterials(def, ctx.materials);
  const services = {
    materials: ctx.materials,
    textures: ctx.textures,
    quality: ctx.engine.quality.level,
    maxAnisotropy: ctx.engine.maxAnisotropy,
  };
  const shared: Record<string, unknown> = {};
  await def.prepare?.(createPrepareContext(resolved.params, services, shared));
  const cache = new SimpleGeometryCache();
  const root = new THREE.Group();
  root.name = `Aperçu ${def.name}`;
  const nodes = new Map<string, THREE.Object3D>();
  const explode = Math.min(1, Math.max(0, ctx.dev.explode ?? 0));
  const only = q.get('only')?.split(',').filter(Boolean) ?? [];
  const hide = new Set(q.get('hide')?.split(',').filter(Boolean) ?? []);

  // Construction dans l'ordre hiérarchique (parents d'abord).
  const pending = [...resolved.parts];
  let guard = 0;
  while (pending.length && guard++ < 10_000) {
    const part = pending.shift()!;
    if (part.parent && !nodes.has(part.parent)) {
      pending.push(part);
      continue;
    }
    let node: THREE.Object3D;
    if (part.build) {
      node = normalizeBuild(
        part.build(createBuildContext(part, resolved.params, services, cache, shared)),
      ).object;
    } else {
      node = new THREE.Group();
    }
    node.name = part.name;
    node.userData.partId = part.id;
    const e = part.explode;
    if (explode > 0 && e.distance > 0) {
      const dir =
        e.direction === 'radial'
          ? radial(node.position, e.radialAxis ?? [0, 0, 1])
          : new THREE.Vector3(...e.direction).normalize();
      node.position.addScaledVector(dir, e.distance * explode);
    }
    (part.parent ? nodes.get(part.parent)! : root).add(node);
    nodes.set(part.id, node);
  }
  for (const [id, node] of nodes) {
    if (hide.has(id)) node.visible = false;
  }
  if (only.length) {
    for (const node of nodes.values()) node.visible = false;
    for (const id of only) nodes.get(id)?.traverse((o) => (o.visible = true));
    // Rendre visibles les ancêtres.
    for (const id of only)
      for (let n = nodes.get(id)?.parent; n && n !== root; n = n.parent) n.visible = true;
  }
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.rotation.y = def.presentation?.rotationY ?? 0;
  root.position.copy(world.bench.matCenter);
  ctx.engine.scene.add(root);

  // Éclairage d'appoint type studio.
  const key = new THREE.SpotLight(0xfff4e6, 30, 3, Math.PI / 5, 0.6, 1.5);
  key.position.copy(world.bench.matCenter).add(new THREE.Vector3(0.25, 0.6, 0.35));
  key.target.position.copy(world.bench.matCenter);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0001;
  const fill = new THREE.PointLight(0xcfe0ff, 1.5, 2);
  fill.position.copy(world.bench.matCenter).add(new THREE.Vector3(-0.3, 0.3, 0.2));
  ctx.engine.scene.add(key, key.target, fill);

  // Caméra orbitale.
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const camera = ctx.engine.camera;
  const targetParam = q.get('target')?.split(',').map(Number);
  const target =
    targetParam && targetParam.length === 3 && targetParam.every(Number.isFinite)
      ? root.localToWorld(new THREE.Vector3(targetParam[0], targetParam[1], targetParam[2]))
      : sphere.center.clone();
  const view = ctx.dev.view;
  const dir =
    view && view.length >= 3
      ? new THREE.Vector3(view[0], view[1], view[2]).normalize()
      : new THREE.Vector3(0.2, 0.55, 1).normalize();
  const distance = view && view.length >= 4 ? view[3]! : Math.max(0.05, sphere.radius * 3.2);
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.fov = 35;
  camera.near = Math.max(1e-5, distance * 0.02);
  camera.far = 30;
  camera.updateProjectionMatrix();
  const controls = new OrbitControls(camera, ctx.engine.canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.zoomToCursor = true;
  controls.minDistance = 0.002;
  controls.update();
  ctx.engine.add({
    update: () => {
      controls.update();
      // Plans near/far suivant la distance à la cible (profondeur inversée : large plage tolérée).
      const d = camera.position.distanceTo(controls.target);
      camera.near = Math.max(1e-5, d * 0.05);
      camera.far = Math.max(5, d * 400);
      camera.updateProjectionMatrix();
    },
  });
  const triangles = countTriangles(root);
  console.info(
    `[preview] ${def.name} : ${resolved.parts.length} pièces, ${nodes.size} nœuds, ${cache.size} géométries partagées, ${triangles} triangles.`,
  );
  (window as unknown as { __preview?: unknown }).__preview = { root, nodes, controls, triangles };
}

function radial(position: THREE.Vector3, axis: Vec3): THREE.Vector3 {
  const a = new THREE.Vector3(...axis).normalize();
  const v = position.clone().sub(a.clone().multiplyScalar(position.dot(a)));
  return v.lengthSq() > 1e-12 ? v.normalize() : new THREE.Vector3(1, 0, 0);
}

function countTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const count = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    total +=
      count * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
  });
  return Math.round(total);
}
