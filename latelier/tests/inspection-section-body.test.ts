/**
 * Coupe : le plan se place sur les bornes du CORPS de l'objet (pièces de base), pas sur celles de
 * l'objet entier. Moteur : le câble capteurs dépasse largement du carter ; à 50 % sur X, la
 * coupe doit traverser le carter (et non tomber à son extrémité, ce qui le faisait disparaître).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Assembly } from '../src/inspection/Assembly';
import { objectBodyBounds, objectLocalBounds } from '../src/inspection/view/InspectionView';
import { sectionPointLocal } from '../src/inspection/view/Section';
import { getObjectDef } from '../src/objects/registry';
import { createFakeServices } from './helpers/fakeServices';

describe('coupe — bornes du corps de l’objet', () => {
  it('moteur : à 50 % sur chaque axe, le plan traverse le carter', async () => {
    const def = getObjectDef('bldc-inrunner')!;
    const services = createFakeServices();
    const assembly = new Assembly(def, def.defaultParams, { ...services, matCenter: new THREE.Vector3() });
    expect(await assembly.build()).toBe(true);
    const full = objectLocalBounds(assembly, new THREE.Box3());
    const body = objectBodyBounds(assembly, new THREE.Box3());
    expect(full.containsBox(body)).toBe(true);
    const can = assembly.parts.get('can')!;
    assembly.root.updateWorldMatrix(true, true);
    const toObject = new THREE.Matrix4()
      .copy(assembly.root.matrixWorld)
      .invert()
      .multiply(can.node.matrixWorld);
    const canBox = can.localBox.clone().applyMatrix4(toObject);
    for (const axis of ['x', 'y', 'z'] as const) {
      const p = sectionPointLocal(body, axis, 0.5, new THREE.Vector3());
      expect(p[axis]).toBeGreaterThan(canBox.min[axis]);
      expect(p[axis]).toBeLessThan(canBox.max[axis]);
    }
    // Le câble dépasse : l'objet entier est nettement plus long que son corps sur un axe au moins.
    const fs = full.getSize(new THREE.Vector3());
    const bs = body.getSize(new THREE.Vector3());
    expect(Math.max(fs.x / bs.x, fs.y / bs.y, fs.z / bs.z)).toBeGreaterThan(1.5);
    assembly.dispose();
  }, 120000);
});
