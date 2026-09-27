/**
 * Libération d'un objet : après `Assembly.dispose()`, la bibliothèque de matériaux retrouve
 * exactement ses identifiants d'avant la construction (portée `<objet>/` ET alias courts, y
 * compris les alias qui en préfixent d'autres, ex. « int.resin » / « int.resin.top.q0 »), et
 * chaque maillage a émis « dispose ».
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
      // Chaque objet dessinable émet « dispose » (le renderer libère alors ses objets de rendu,
      // qui retiendraient sinon le maillage et toute l'arborescence de l'objet).
      const drawables: THREE.Object3D[] = [];
      assembly.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints)
          drawables.push(o);
      });
      let disposed = 0;
      for (const o of drawables)
        (o as unknown as THREE.EventDispatcher<{ dispose: object }>).addEventListener(
          'dispose',
          () => disposed++,
        );
      assembly.dispose();
      expect(disposed).toBe(drawables.length);
      expect(services.materials.ids()).toEqual(before);
    }, 120000);
  }
});
