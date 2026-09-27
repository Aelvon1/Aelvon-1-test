/**
 * Tests du niveau 3 de la carte « uno-board » (intérieurs des composants clés) : étapes
 * déclarées pour toutes les pièces internes, ordre et caractère destructif, gestes, déroulement
 * de l'enroulement des électrolytiques, cotes du quartz, du bouton et du connecteur USB-B.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import def from '../src/objects/uno-board';
import { L_TAIL_END, MM } from '../src/objects/uno-board/constants';
import { pinPositions } from '../src/objects/uno-board/packages/headers';
import { WINDING } from '../src/objects/uno-board/internals/electrolytic';
import { WindingGeometry, WindingMath } from '../src/objects/uno-board/internals/winding';
import { DOME_TOP, FLOOR, PLUNGER_TOP, SW, SW_LEVELS } from '../src/objects/uno-board/internals/button';
import { TONGUE_Y, USB, contactPath } from '../src/objects/uno-board/internals/usbB';
import {
  SimpleGeometryCache,
  createBuildContext,
  createPrepareContext,
  normalizeBuild,
  registerObjectMaterials,
} from '../src/objects/buildSupport';
import { resolveObject } from '../src/objects/resolve';
import { validateObject } from '../src/objects/validate';
import { DisassemblyGraph } from '../src/inspection/graph';
import { TOOL_IDS } from '../src/inspection/tools/ids';
import type { PartBuild } from '../src/objects/types';
import { createFakeServices } from './helpers/fakeServices';

const KEY_COMPONENTS = ['u4', 'x2', 'y1', 'pc1', 'pc2', 'sw1'];

function graph() {
  const r = resolveObject(def);
  return { r, g: new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id))) };
}

/** Construit une pièce isolée (services factices). */
async function buildPart(id: string): Promise<PartBuild> {
  const services = createFakeServices();
  registerObjectMaterials(def, services.materials);
  const r = resolveObject(def);
  const shared: Record<string, unknown> = {};
  await def.prepare?.(createPrepareContext(r.params, services, shared));
  const part = r.parts.find((p) => p.id === id);
  if (!part?.build) throw new Error(`pièce sans construction : ${id}`);
  return normalizeBuild(
    part.build(createBuildContext(part, r.params, services, new SimpleGeometryCache(), shared)),
  );
}

function meshNamed(root: THREE.Object3D, name: string): THREE.Mesh {
  const found = root.getObjectByName(name);
  if (!(found instanceof THREE.Mesh)) throw new Error(`maillage introuvable : ${name}`);
  return found;
}

describe('niveau 3 : étapes et gestes', () => {
  it('aucune pièce retirable sans étape déclarée, outils connus, aucune erreur', () => {
    const report = validateObject(def, undefined, new Set<string>(TOOL_IDS));
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter((w) => w.includes('sans étape'))).toEqual([]);
    expect(
      graph()
        .g.steps.filter((s) => s.auto)
        .map((s) => s.parts[0]),
    ).toEqual([]);
  });

  it('chaque intérieur après son composant et après les couches du circuit', () => {
    const { r, g } = graph();
    const order = g.simulateFullDisassembly();
    const lastLayer = Math.max(...order.filter((id) => id.startsWith('pcb.')).map((id) => order.indexOf(id)));
    for (const key of KEY_COMPONENTS) {
      const inner = r.parts.filter((p) => p.parent === key && p.removal);
      expect(inner.length, key).toBeGreaterThan(0);
      // Une seule pièce de base (sans retrait) par composant.
      expect(r.parts.filter((p) => p.parent === key && !p.removal).length, key).toBe(1);
      for (const p of inner) {
        expect(order.indexOf(p.id), p.id).toBeGreaterThan(order.indexOf(key));
        expect(order.indexOf(p.id), p.id).toBeGreaterThan(lastLayer);
        expect(p.tags).toContain('internal');
      }
    }
  });

  it('gestes : décapsulation au scalpel, déroulement, déclipsage ; étapes destructives signalées', () => {
    const { r, g } = graph();
    const part = (id: string) => r.parts.find((p) => p.id === id)!;
    expect(part('u4.resin.top').removal).toMatchObject({ motion: 'cut', tool: 'scalpel', destructive: true });
    expect(part('pc1.winding').removal).toMatchObject({ motion: 'unwind', destructive: true });
    expect(part('pc2.winding').removal).toMatchObject({ motion: 'unwind', destructive: true });
    expect(part('x2.shell').removal).toMatchObject({ motion: 'unclip' });
    expect(part('sw1.cover').removal).toMatchObject({ motion: 'unclip' });
    const step = (id: string) => g.steps.find((s) => s.id === id)!;
    for (const id of ['mcu-decap', 'mcu-wires', 'crystal-can', 'pc1-can', 'pc1-unwind', 'pc2-open'])
      expect(step(id).destructive, id).toBe(true);
    for (const id of ['usb-shell', 'usb-contacts', 'sw-cover', 'sw-mechanism'])
      expect(step(id).destructive, id).toBe(false);
    expect(step('mcu-decap').title).toContain('destructif');
    // Couches successives dans une étape : les contacts supérieurs avant les inférieurs.
    expect(step('usb-contacts').layers).toEqual([['x2.contacts.top'], ['x2.contacts.bottom']]);
    expect(step('pc2-open').layers).toEqual([['pc2.can'], ['pc2.winding'], ['pc2.seal']]);
  });
});

describe('électrolytique : enroulement et déroulement', () => {
  it('bande de ≈ 8 cm, rouleau Ø ≈ 5,2 mm logé dans le godet', () => {
    const m = new WindingMath(WINDING);
    expect(m.length).toBeGreaterThan(0.07);
    expect(m.length).toBeLessThan(0.09);
    const outer = m.radius(m.thetaMax) + WINDING.pitch;
    expect(2 * outer).toBeCloseTo(5.2e-3, 4);
    // Rayon intérieur du godet : 3,15 − 0,25 mm.
    expect(outer).toBeLessThan(2.9e-3);
  });

  it('bande continue au point de contact, déroulée à plat sur toute sa longueur', () => {
    const m = new WindingMath(WINDING);
    const out = { x: 0, z: 0, nx: 0, nz: 0 };
    for (const unrolled of [0.01, 0.04, 0.07]) {
      const thetaD = m.contactTheta(unrolled);
      const a = { ...m.sample(thetaD - 1e-6, 0, unrolled, out) };
      const b = { ...m.sample(thetaD + 1e-6, 0, unrolled, out) };
      expect(Math.hypot(a.x - b.x, a.z - b.z), `ℓ = ${unrolled}`).toBeLessThan(2e-6);
    }
    const w = new WindingGeometry(WINDING);
    w.update(m.length);
    for (const g of w.geometries) {
      g.computeBoundingBox();
      const size = g.boundingBox!.getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThan(m.length * 0.98);
      expect(size.z).toBeLessThan(WINDING.pitch * 1.5);
      const p = g.getAttribute('position').array as Float32Array;
      expect(p.every(Number.isFinite)).toBe(true);
    }
  });

  it('le crochet de la pièce déroule la bande puis la réenroule', async () => {
    const built = await buildPart('pc1.winding');
    const hook = built.hooks?.onRemovalProgress;
    expect(hook).toBeTypeOf('function');
    const anode = meshNamed(built.object, 'anode');
    const extent = () => {
      anode.geometry.computeBoundingBox();
      return anode.geometry.boundingBox!.getSize(new THREE.Vector3()).x;
    };
    const rolled = extent();
    hook!(1, { motion: 'unwind', direction: 1 });
    expect(extent()).toBeGreaterThan(0.06);
    hook!(0, { motion: 'unwind', direction: -1 });
    expect(extent()).toBeCloseTo(rolled, 6);
  });
});

describe('quartz HC-49/S', () => {
  it('lame taillée AT : épaisseur = 1,661 mm·MHz ÷ 16 MHz', async () => {
    const built = await buildPart('y1.blank');
    const blank = meshNamed(built.object, 'lame');
    blank.geometry.computeBoundingBox();
    const size = blank.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.z / MM).toBeCloseTo(1.661 / 16, 3);
  });
});

describe('bouton tactile', () => {
  it('mécanisme logé : dôme dans le logement, collerette retenue par le capot', () => {
    expect(2 * SW.dome.r).toBeLessThan(SW.cavity.d);
    expect(SW.plunger.flange[0]).toBeGreaterThan(SW.cover.hole[0]);
    expect(SW.plunger.flange[1]).toBeGreaterThan(SW.cover.hole[1]);
    expect(SW.plunger.flange[0]).toBeLessThan(SW.cavity.w);
    expect(SW.plunger.flange[1]).toBeLessThan(SW.cavity.d);
    expect(SW.plunger.head[0]).toBeLessThan(SW.cover.hole[0]);
    expect(SW.plunger.head[1]).toBeLessThan(SW.cover.hole[1]);
    expect(FLOOR).toBeGreaterThan(SW.y0);
    expect(DOME_TOP).toBeLessThan(SW_LEVELS.coverY0 - SW.plunger.flangeT);
    expect(PLUNGER_TOP).toBeGreaterThan(SW_LEVELS.coverY0 + SW.cover.t);
  });
});

describe('connecteur USB-B', () => {
  it('queues des contacts dans leurs trous, rang arrière pour les contacts supérieurs', () => {
    const pads = pinPositions('USB-B');
    for (const [row, pins] of [
      ['top', [1, 2]],
      ['bottom', [3, 4]],
    ] as const) {
      const path = contactPath(row);
      const tail = path[path.length - 1]!;
      expect(tail[1]).toBeCloseTo(L_TAIL_END / MM, 9);
      for (const n of pins) expect(tail[0] * MM).toBeCloseTo(pads[n - 1]![0], 9);
      // Lame sur la langue, dans l'ouverture « maison ».
      const ys = path.map((p) => p[1]).filter((_, i) => path[i]![0] < -9.9);
      const low = USB.y0 + USB.opening.y;
      for (const y of ys) {
        expect(y).toBeGreaterThan(low);
        expect(y).toBeLessThan(low + USB.opening.h - USB.opening.chamfer);
      }
      expect(Math.sign(ys[0]! - TONGUE_Y)).toBe(row === 'top' ? 1 : -1);
    }
    // Queues des contacts dans la fente arrière du fond de la coque.
    for (const [x, z] of pads.slice(0, 4)) {
      expect(Math.abs(z) + USB.contact.tail / 2).toBeLessThan(USB.slot.half);
      expect(-x + USB.contact.t / 2).toBeLessThan(USB.slot.end);
    }
  });

  it('coque : le volet arrière se relève au déclipsage et se referme au remontage', async () => {
    const built = await buildPart('x2.shell');
    const flap = meshNamed(built.object, 'volet arrière');
    const hook = built.hooks!.onRemovalProgress!;
    hook(0.5, { motion: 'unclip', direction: 1 });
    expect(flap.rotation.z).toBeGreaterThan(1.5);
    hook(0, { motion: 'unclip', direction: -1 });
    expect(flap.rotation.z).toBeCloseTo(0, 9);
    // Bascule générique du levier annulée : le groupe intérieur compense la rotation du nœud.
    const inner = built.object.getObjectByName('intérieur')!;
    expect(inner.rotation.y).toBeCloseTo(0, 9);
  });
});
