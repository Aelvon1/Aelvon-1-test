/**
 * Libération d'un objet : après `Assembly.dispose()`, la bibliothèque de matériaux retrouve
 * exactement ses identifiants d'avant la construction (portée `<objet>/` ET alias courts, y
 * compris les alias qui en préfixent d'autres, ex. « int.resin » / « int.resin.top.q0 »).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Assembly } from '../src/inspection/Assembly';
import { listObjectDefs } from '../src/objects/registry';
import { createFakeServices } from './helpers/fakeServices';

describe('libération des matériaux d’un objet', () => {
  for (const def of listObjectDefs()) {
    it(`${def.id} : aucun matériau propre ne reste enregistré`, async () => {
      const services = createFakeServices();
      const before = services.materials.ids();
      const assembly = new Assembly(def, def.defaultParams, { ...services, matCenter: new THREE.Vector3() });
      expect(await assembly.build()).toBe(true);
      expect(services.materials.ids().length).toBeGreaterThan(before.length);
      assembly.dispose();
      expect(services.materials.ids()).toEqual(before);
    }, 120000);
  }
});
