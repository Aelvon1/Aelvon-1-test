/**
 * Moteur brushless inrunner : hooks de démontage (débobinage progressif, fusion de l'étain),
 * construits sous Node avec les services factices.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import def from '../src/objects/bldc-inrunner/index';
import { resolveObject } from '../src/objects/resolve';
import {
  SimpleGeometryCache,
  createBuildContext,
  normalizeBuild,
  registerObjectMaterials,
} from '../src/objects/buildSupport';
import type { ObjectParams, PartBuild } from '../src/objects/types';
import { createFakeServices } from './helpers/fakeServices';

function buildPart(
  id: string,
  params: Partial<ObjectParams> = {},
): { built: PartBuild; detail?: THREE.Object3D } {
  const services = createFakeServices();
  registerObjectMaterials(def as never, services.materials);
  const r = resolveObject(def as never, params);
  const part = r.parts.find((p) => p.id === id)!;
  const shared: Record<string, unknown> = {};
  const cache = new SimpleGeometryCache();
  const ctx = createBuildContext(part, r.params, services, cache, shared);
  const built = normalizeBuild(part.build!(ctx));
  const detail = part.detail?.build(ctx);
  return { built, detail };
}

const drawCount = (mesh: THREE.Mesh) => mesh.geometry.drawRange.count;
const meshNamed = (o: THREE.Object3D, name: string) => o.getObjectByName(name) as THREE.Mesh;

describe('bldc-inrunner : débobinage', () => {
  it('les spires disparaissent depuis le point neutre et un brin libre sort', () => {
    const { built, detail } = buildPart('stator.phaseA');
    const hook = built.hooks!.onRemovalProgress!;
    const base = meshNamed(built.object, 'conductors');
    const strands = meshNamed(detail!, 'strands');
    const free = meshNamed(built.object, 'Brin libéré');
    hook(0, { motion: 'unwind', direction: 1 });
    const full = drawCount(base);
    expect(full).toBeGreaterThan(0);
    expect(free.visible).toBe(false);
    const counts: number[] = [];
    for (const t of [0.1, 0.3, 0.5, 0.7]) {
      hook(t, { motion: 'unwind', direction: 1 });
      counts.push(drawCount(base));
      expect(drawCount(strands)).toBeGreaterThan(0);
    }
    // Décroissance monotone, brin libre visible pendant le débobinage.
    for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThan(counts[i - 1]!);
    expect(counts[0]!).toBeLessThan(full);
    expect(free.visible).toBe(true);
    expect(free.geometry.drawRange.count).toBeGreaterThan(0);
    // Fin du débobinage : plus aucune spire en place.
    hook(1, { motion: 'unwind', direction: 1 });
    expect(drawCount(base)).toBe(0);
    // Remontage : état initial restauré.
    hook(0, { motion: 'unwind', direction: -1 });
    expect(drawCount(base)).toBe(full);
    expect(free.visible).toBe(false);
  });
});

describe('bldc-inrunner : dessoudage', () => {
  it('l’étain des languettes fond et se rétracte', () => {
    const { built } = buildPart('leads.joints');
    const mesh = built.object.getObjectByName('leads.joints') as THREE.InstancedMesh;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const extent = () => {
      let m = 0;
      for (let i = 0; i < pos.count; i++) m = Math.max(m, Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)));
      return m;
    };
    const rest = extent();
    built.hooks!.onRemovalProgress!(0.2, { motion: 'desolder', direction: 1 });
    const mid = extent();
    built.hooks!.onRemovalProgress!(1, { motion: 'desolder', direction: 1 });
    expect(mid).toBeLessThan(rest);
    expect(extent()).toBeLessThan(rest * 0.05);
    built.hooks!.onRemovalProgress!(0, { motion: 'desolder', direction: -1 });
    expect(extent()).toBeCloseTo(rest, 9);
  });
});

describe('bldc-inrunner : instances', () => {
  it('pivots des instances sur les pièces (écartement radial et dévissage corrects)', () => {
    const { built } = buildPart('rotor.magnets');
    const inst = built.instanced as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      // Centre de l'aimant hors de l'axe : l'écartement radial a une direction définie.
      expect(Math.hypot(p.y, p.z)).toBeGreaterThan(0.003);
    }
    const screws = buildPart('frontBell.screws').built.instanced as THREE.InstancedMesh;
    expect(screws.count).toBe(3);
    const lam = buildPart('stator.core', { lamination: '0.2' }).built.instanced as THREE.InstancedMesh;
    expect(lam.count).toBe(150);
  });
});
