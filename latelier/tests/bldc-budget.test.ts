/**
 * Moteur brushless inrunner : budget de rendu au détail maximal (qualité Ultra, toutes les
 * géométries fines construites) — < 1,5 M triangles et < 400 appels de dessin.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import def from '../src/objects/bldc-inrunner/index';
import { PRESETS } from '../src/objects/bldc-inrunner/params';
import { resolveObject } from '../src/objects/resolve';
import {
  SimpleGeometryCache,
  createBuildContext,
  normalizeBuild,
  registerObjectMaterials,
} from '../src/objects/buildSupport';
import type { ObjectParams } from '../src/objects/types';
import { createFakeServices } from './helpers/fakeServices';

function measure(params: Partial<ObjectParams>): { triangles: number; draws: number } {
  const services = { ...createFakeServices(), quality: 3 as const };
  registerObjectMaterials(def as never, services.materials);
  const r = resolveObject(def as never, params);
  const shared: Record<string, unknown> = {};
  const cache = new SimpleGeometryCache();
  let triangles = 0;
  let draws = 0;
  const count = (o: THREE.Object3D, replaced: readonly string[] = []) =>
    o.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || replaced.includes(mesh.name)) return;
      const g = mesh.geometry;
      const n = (g.index ? g.index.count : g.attributes.position!.count) / 3;
      const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
      triangles += n * inst;
      draws += Array.isArray(mesh.material) ? mesh.material.length : 1;
    });
  for (const part of r.parts) {
    const ctx = createBuildContext(part, r.params, services, cache, shared);
    const replaced = part.detail?.replaces ?? [];
    if (part.build) count(normalizeBuild(part.build(ctx)).object, replaced);
    if (part.detail) count(part.detail.build(ctx));
  }
  return { triangles, draws };
}

describe('bldc-inrunner : budget de rendu', () => {
  const contexts: { label: string; params: Partial<ObjectParams> }[] = [
    { label: 'défaut', params: {} },
    ...PRESETS.map((p) => ({ label: p.label, params: p.params as Partial<ObjectParams> })),
    { label: '3660 tôles 0,2 mm', params: { format: '3660', lamination: '0.2', kv: 6000 } },
  ];
  for (const c of contexts) {
    it(`< 1,5 M triangles et < 400 appels (${c.label})`, () => {
      const { triangles, draws } = measure(c.params);
      expect(triangles).toBeLessThan(1_500_000);
      expect(draws).toBeLessThan(400);
    }, 120_000);
  }
});
