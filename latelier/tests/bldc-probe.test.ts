import { it } from 'vitest';
import * as THREE from 'three/webgpu';
import def from '../src/objects/bldc-inrunner/index';
import { validateObjectAllPresets } from '../src/objects/validate';
import { resolveObject } from '../src/objects/resolve';
import { DisassemblyGraph } from '../src/inspection/graph';
import { TOOL_IDS } from '../src/inspection/tools/ids';
import { SimpleGeometryCache, createBuildContext, normalizeBuild, registerObjectMaterials } from '../src/objects/buildSupport';
import { createFakeServices } from './helpers/fakeServices';
import type { ObjectParams } from '../src/objects/types';
it('probe', () => {
  for (const r of validateObjectAllPresets(def as never, new Set<string>(TOOL_IDS))) console.log(r.context, 'W:', r.warnings, 'E:', r.errors);
  for (const ctxp of [{}, ...def.presets!.map((p) => p.params)]) {
    const r = resolveObject(def as never, ctxp as Partial<ObjectParams>);
    const g = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
    console.log(JSON.stringify(ctxp), 'steps', g.steps.length, g.steps.map((s) => `${s.index + 1}.${s.id}[${s.layers.map((l) => l.join('+')).join(' > ')}]`).join('\n   '));
  }
  for (const q of [2, 3] as const) {
    const services = createFakeServices();
    (services as { quality: number }).quality = q;
    registerObjectMaterials(def as never, services.materials);
    const r = resolveObject(def as never, {});
    const shared: Record<string, unknown> = {};
    const cache = new SimpleGeometryCache();
    let tris = 0, calls = 0; const per: string[] = [];
    for (const part of r.parts) {
      let pt = 0;
      const count = (o: THREE.Object3D) => o.traverse((m) => { const mm = m as THREE.Mesh; if (!mm.isMesh) return; const gg = mm.geometry; const n = (gg.index ? gg.index.count : gg.attributes.position!.count) / 3; const inst = (mm as THREE.InstancedMesh).isInstancedMesh ? (mm as THREE.InstancedMesh).count : 1; pt += n * inst; calls += Array.isArray(mm.material) ? mm.material.length : 1; });
      const ctx = createBuildContext(part as never, r.params, { ...services, quality: q }, cache, shared);
      if (part.build) count(normalizeBuild(part.build(ctx as never)).object);
      if (part.detail) count(part.detail.build(ctx as never));
      tris += pt; per.push(`${part.id}:${Math.round(pt/1000)}k`);
    }
    console.log('quality', q, 'triangles(with detail)', Math.round(tris), 'meshes/draws', calls, '\n', per.join(' '));
  }
});
