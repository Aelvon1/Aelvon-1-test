import { it } from 'vitest';
import * as THREE from 'three/webgpu';
import def from '../src/objects/uno-board';
import { SimpleGeometryCache, createBuildContext, createPrepareContext, normalizeBuild, registerObjectMaterials } from '../src/objects/buildSupport';
import { resolveObject } from '../src/objects/resolve';
import { createFakeServices } from './helpers/fakeServices';
it('stats', { timeout: 60000 }, async () => {
  for (const fine of [false, true]) {
    const services = createFakeServices();
    registerObjectMaterials(def, services.materials);
    const r = resolveObject(def, { fineDetail: fine });
    const shared: Record<string, unknown> = {};
    await def.prepare?.(createPrepareContext(r.params, services, shared));
    const cache = new SimpleGeometryCache();
    let meshes = 0, tris = 0;
    const per: Record<string, [number, number]> = {};
    const mats = new Set<THREE.Material>();
    for (const part of r.parts) {
      if (!part.build) continue;
      const b = normalizeBuild(part.build(createBuildContext(part, r.params, services, cache, shared)));
      let pm = 0, pt = 0;
      b.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        meshes++; pm++;
        mats.add(m.material as THREE.Material);
        const g = m.geometry;
        const t = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
        tris += t * n; pt += t * n;
      });
      per[part.id] = [pm, Math.round(pt)];
    }
    console.info(fine ? 'FIN' : 'BASE', 'meshes', meshes, 'triangles', Math.round(tris), 'materials', mats.size, 'geoms', cache.size);
    if (fine) console.info(Object.entries(per).sort((a, b) => b[1][1] - a[1][1]).slice(0, 15).map(([k, v]) => `${k}: ${v[0]} maillages, ${v[1]} tri`).join('\n'));
  }
});
