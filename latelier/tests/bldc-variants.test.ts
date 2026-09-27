/**
 * Moteur brushless inrunner : balayage de TOUTES les combinaisons de variantes (format ×
 * encoches/pôles × capteurs × sorties × KV extrêmes) — définition valide, démontage A → Z complet,
 * construction de chaque pièce et de chaque détail sans erreur ni coordonnée invalide, bobinage
 * rangé sans tassement excessif sur toute la plage de KV.
 */
import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import def from '../src/objects/bldc-inrunner/index';
import { deriveDimensions, type BldcParams } from '../src/objects/bldc-inrunner/params';
import { buildWindingLayout } from '../src/objects/bldc-inrunner/windingLayout';
import { resolveObject } from '../src/objects/resolve';
import { DisassemblyGraph } from '../src/inspection/graph';
import { validateObject } from '../src/objects/validate';
import { TOOL_IDS } from '../src/inspection/tools/ids';
import {
  SimpleGeometryCache,
  createBuildContext,
  normalizeBuild,
  registerObjectMaterials,
} from '../src/objects/buildSupport';
import type { ObjectParams } from '../src/objects/types';
import { createFakeServices } from './helpers/fakeServices';

const FORMATS = ['2848', '3650', '3660'] as const;
const SLOT_POLES = ['12-4', '12-2', '9-6'] as const;

describe('bldc-inrunner : balayage des variantes', () => {
  it('bobinage rangé et KV obtenu à ±15 % sur toute la plage 3000–6000', () => {
    for (const format of FORMATS)
      for (const slotPole of SLOT_POLES)
        for (let kv = 3000; kv <= 6000; kv += 250) {
          const d = deriveDimensions({ format, slotPole, kv });
          const label = `${format} ${slotPole} ${kv}`;
          expect(Math.abs(d.winding.kvEffective - kv) / kv, label).toBeLessThan(0.15);
          expect(buildWindingLayout(d, 0).packScale, label).toBeGreaterThan(0.95);
        }
  }, 120_000);

  it('chaque combinaison est valide, se démonte entièrement et se construit (pièces et détails)', () => {
    const services = { ...createFakeServices(), quality: 0 as const };
    registerObjectMaterials(def as never, services.materials);
    const tools = new Set<string>(TOOL_IDS);
    for (const format of FORMATS)
      for (const slotPole of SLOT_POLES)
        for (const sensors of [true, false])
          for (const leads of ['tabs', 'wires'] as const)
            for (const kv of [3000, 6000]) {
              const p: Partial<BldcParams> = {
                format,
                slotPole,
                sensors,
                leads,
                kv,
                lamination: kv > 4000 ? '0.2' : '0.35',
              };
              const label = JSON.stringify(p);
              const r = resolveObject(def as never, p as Partial<ObjectParams>);
              expect(validateObject(def as never, r.params, tools).errors, label).toEqual([]);
              const g = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((q) => q.id)));
              expect(g.simulateFullDisassembly().length, label).toBe(r.parts.filter((q) => q.removal).length);
              const shared: Record<string, unknown> = {};
              const cache = new SimpleGeometryCache();
              for (const part of r.parts) {
                const ctx = createBuildContext(part, r.params, services, cache, shared);
                const objects: THREE.Object3D[] = [];
                if (part.build) objects.push(normalizeBuild(part.build(ctx)).object);
                if (part.detail) objects.push(part.detail.build(ctx));
                for (const o of objects)
                  o.traverse((node) => {
                    const mesh = node as THREE.Mesh;
                    if (!mesh.isMesh) return;
                    const arr = mesh.geometry.getAttribute('position').array as Float32Array;
                    let finite = true;
                    for (let i = 0; i < arr.length && finite; i++) finite = Number.isFinite(arr[i]!);
                    expect(finite, `${label} ${part.id} ${mesh.name}`).toBe(true);
                  });
              }
            }
  }, 300_000);
});
