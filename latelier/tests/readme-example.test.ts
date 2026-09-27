/**
 * L'exemple minimal « Ajouter un objet » du README doit rester valide et démontable.
 */
import { describe, expect, it } from 'vitest';
import def from './fixtures/readmeBox';
import { validateObjectAllPresets } from '../src/objects/validate';
import { resolveObject } from '../src/objects/resolve';
import { DisassemblyGraph } from '../src/inspection/graph';
import { TOOL_IDS } from '../src/inspection/tools/ids';
import { SimpleGeometryCache, createBuildContext, normalizeBuild } from '../src/objects/buildSupport';
import { createFakeServices } from './helpers/fakeServices';

describe('exemple du README', () => {
  it('est valide et se démonte en une étape', () => {
    for (const r of validateObjectAllPresets(def, new Set<string>(TOOL_IDS))) expect(r.errors).toEqual([]);
    const r = resolveObject(def);
    const g = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
    expect(g.steps.map((s) => s.layers)).toEqual([[['vis'], ['couvercle']]]);
    expect(g.simulateFullDisassembly()).toEqual(['vis', 'couvercle']);
  });

  it('se construit sous Node', () => {
    const services = createFakeServices();
    const r = resolveObject(def);
    const cache = new SimpleGeometryCache();
    for (const part of r.parts) {
      const built = normalizeBuild(part.build!(createBuildContext(part, r.params, services, cache, {})));
      expect(built.object.isObject3D).toBe(true);
    }
  });
});
