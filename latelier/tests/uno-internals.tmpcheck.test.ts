import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import def from '../src/objects/uno-board';
import { SimpleGeometryCache, createBuildContext, createPrepareContext, normalizeBuild, registerObjectMaterials } from '../src/objects/buildSupport';
import { resolveObject } from '../src/objects/resolve';
import { createFakeServices } from './helpers/fakeServices';
import { SW_LEVELS } from '../src/objects/uno-board/internals/button';
it('normales', async () => {
  const services = createFakeServices();
  registerObjectMaterials(def, services.materials);
  const r = resolveObject(def);
  const shared: Record<string, unknown> = {};
  await def.prepare?.(createPrepareContext(r.params, services, shared));
  const out: string[] = [];
  const check = (id: string, name: string, test: (c: THREE.Vector3, n: THREE.Vector3) => number) => {
    const part = r.parts.find((p) => p.id === id)!;
    const b = normalizeBuild(part.build!(createBuildContext(part, r.params, services, new SimpleGeometryCache(), shared)));
    const mesh = b.object.getObjectByName(name) as THREE.Mesh;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = g.getAttribute('position');
    let good = 0, bad = 0;
    const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), ctr = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); bb.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.subVectors(bb, a).cross(c.clone().sub(a)).normalize();
      ctr.copy(a).add(bb).add(c).multiplyScalar(1 / 3);
      const v = test(ctr, n);
      if (v > 0) good++; else if (v < 0) bad++;
    }
    out.push(`${id}/${name}: bonnes ${good}, inversées ${bad}`);
  };
  const MM = 0.001;
  // Coque : parois latérales extérieures (|z| > 5.9 mm) et intérieures (|z| < 5.75 mm, > 5.6).
  check('x2.shell', 'coque', (c, n) => (Math.abs(c.z) > 5.95 * MM ? Math.sign(c.z) * n.z : Math.abs(c.z) > 5.6 * MM && Math.abs(c.z) < 5.75 * MM && Math.abs(n.z) > 0.9 ? -Math.sign(c.z) * n.z : 0));
  check('x2.shell', 'volet arrière', (c, n) => (Math.abs(n.x) > 0.9 ? (c.x > -0.15 * MM ? n.x : -n.x) : 0));
  {
    const R = 1.3, h = 0.22, t = 0.05;
    const rho = (R * R + h * h) / (2 * h);
    const cy = (SW_LEVELS.contactTop + h - rho) * MM;
    check('sw1.dome', 'dôme', (c, n) => {
      const d = new THREE.Vector3(c.x, c.y - cy, c.z);
      const len = d.length();
      if (Math.hypot(c.x, c.z) > 1.25 * MM) return 0;
      const dot = d.normalize().dot(n);
      return len > (rho + t / 2) * MM ? dot : -dot;
    });
  }
  writeFileSync('/tmp/claude-0/shots/interieurs-carte/normals.txt', out.join('\n'));
});
