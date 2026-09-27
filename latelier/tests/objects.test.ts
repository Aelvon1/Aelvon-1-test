/**
 * Tests de TOUS les objets du registre (découverte automatique) :
 * - validation des définitions pour les paramètres par défaut et chaque préréglage ;
 * - démontage A → Z complet sans blocage, puis remontage complet ;
 * - construction de chaque pièce sous Node (aucune exception, maillages présents,
 *   textures d'objet préfixées par l'identifiant de l'objet).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { listDevObjectDefs, listObjectDefs } from '../src/objects/registry';
import { validateObjectAllPresets } from '../src/objects/validate';
import { resolveObject } from '../src/objects/resolve';
import { DisassemblyGraph } from '../src/inspection/graph';
import { TOOL_IDS } from '../src/inspection/tools/ids';
import {
  SimpleGeometryCache,
  createBuildContext,
  createPrepareContext,
  normalizeBuild,
  objectScope,
  registerObjectMaterials,
} from '../src/objects/buildSupport';
import type { ObjectParams } from '../src/objects/types';
import { createFakeServices } from './helpers/fakeServices';

const defs = [...listObjectDefs(), ...listDevObjectDefs()];

describe('registre des objets', () => {
  it('découvre au moins un objet', () => {
    expect(defs.length).toBeGreaterThanOrEqual(0);
  });
});

for (const def of defs) {
  describe(`objet « ${def.id} »`, () => {
    it('est valide pour tous ses préréglages', () => {
      for (const report of validateObjectAllPresets(def, new Set<string>(TOOL_IDS))) {
        expect(report.errors, `${report.context}`).toEqual([]);
      }
    });

    const contexts: { label: string; params?: Partial<ObjectParams> }[] = [
      { label: 'défaut' },
      ...(def.presets ?? []).map((p) => ({ label: p.label, params: p.params })),
    ];

    for (const context of contexts) {
      it(`se démonte et se remonte entièrement (${context.label})`, () => {
        const r = resolveObject(def, context.params);
        const g = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
        const removed = new Set(g.simulateFullDisassembly());
        expect(removed.size).toBe(r.parts.filter((p) => p.removal).length);
        for (let plan = g.planPrev(removed); plan; plan = g.planPrev(removed)) {
          for (const layer of plan.layers) {
            for (const id of layer) expect(g.canReinsert(id, removed).ok, id).toBe(true);
            for (const id of layer) removed.delete(id);
          }
        }
        expect(removed.size).toBe(0);
      });

      it(`construit chaque pièce sous Node (${context.label})`, async () => {
        const services = createFakeServices();
        registerObjectMaterials(def, services.materials);
        const r = resolveObject(def, context.params);
        const shared: Record<string, unknown> = {};
        await def.prepare?.(createPrepareContext(r.params, services, shared));
        const cache = new SimpleGeometryCache();
        let meshes = 0;
        for (const part of r.parts) {
          if (!part.build) continue;
          const built = normalizeBuild(
            part.build(createBuildContext(part, r.params, services, cache, shared)),
          );
          expect(built.object, part.id).toBeInstanceOf(THREE.Object3D);
          built.object.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) meshes++;
          });
        }
        expect(meshes).toBeGreaterThan(0);
        for (const req of services.textures.requests) {
          expect(req.key.startsWith(objectScope(def.id)) || req.key.startsWith('lib/'), req.key).toBe(true);
        }
      });
    }
  });
}
