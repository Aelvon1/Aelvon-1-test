/**
 * Connecteur USB type B traversant (X2) — composant clé (niveau 3 à venir : isolant, contacts à
 * ressort, pattes). Pour l'instant : sous-ensemble retirable « x2 » (joints) + pièce extérieure
 * « x2.shell » (coque emboutie, face avant, pattes de fixation) qui inclut provisoirement la
 * partie visible de l'isolant (langue et contacts) pour un rendu correct de l'ouverture.
 *
 * Repère : origine au centre de la face arrière, ouverture vers −X (déborde de 6,2 mm du bord
 * de carte). Coque 16,3 × 12,0 × 10,9 mm en acier étamé de 0,3 mm.
 */
import * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { L_TAIL_END, L_THT_SEAT, MM } from '../constants';
import type { UnoParams } from '../params';
import { loftRoundedRect, mat, roundedBox, roundedRectRing } from '../packages/geometry';
import { pinPositions, thtJointMeshes } from '../packages/headers';
import type { ComponentModel, ModelMesh } from '../packages/model';
import { keyComponentParts } from './common';

const L = 16.3;
const W = 12.0;
const H = 10.9;
const T = 0.3;
const Y0 = L_THT_SEAT / MM;

/** Rectangle arrondi (plan de la forme : x = Z objet, y = Y objet), en m. */
function rr(w: number, h: number, r: number, cx: number, cy: number): THREE.Vector2[] {
  return roundedRectRing(w * MM, h * MM, r * MM, 3).map(
    ([x, z]) => new THREE.Vector2(x + cx * MM, -z + cy * MM),
  );
}

/** Ouverture « maison » du type B : 8,45 × 7,78 mm, angles supérieurs chanfreinés. */
function houseOpening(): THREE.Vector2[] {
  const w = 8.45 / 2;
  const y0 = Y0 + 1.6;
  const y1 = y0 + 7.78;
  const c = 1.3;
  const pts: [number, number][] = [
    [-w, y0],
    [w, y0],
    [w, y1 - c],
    [w - c, y1],
    [-w + c, y1],
    [-w, y1 - c],
  ];
  return pts.map(([x, y]) => new THREE.Vector2(x * MM, y * MM));
}

/** Extrusion le long de −X (de x = −x0 − depth à −x0), chanfrein léger. */
function extrudeX(
  outer: THREE.Vector2[],
  holes: THREE.Vector2[][],
  x0: number,
  depth: number,
  bevel = 0.06,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer);
  for (const h of holes) shape.holes.push(new THREE.Path(h));
  const b = bevel * MM;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth * MM - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, b + x0 * MM);
  g.rotateY(-Math.PI / 2); // extrusion (+Z forme) → −X objet ; x forme → Z objet
  g.computeVertexNormals();
  return g;
}

function shell(): THREE.BufferGeometry {
  const cy = Y0 + H / 2;
  const tube = extrudeX(rr(W, H, 0.6, 0, cy), [rr(W - 2 * T, H - 2 * T, 0.35, 0, cy)], T, L - 2 * T, 0.05);
  const front = extrudeX(rr(W, H, 0.6, 0, cy), [houseOpening()], L - T, T, 0.08);
  const back = extrudeX(rr(W, H, 0.6, 0, cy), [], 0, T, 0.08);
  const parts = [tube, front, back];
  const merged = mergeNonIndexed(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** Fusion de géométries non indexées (attributs position/normal/uv). */
function mergeNonIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv'] as const;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = name === 'uv' ? 2 : 3;
    const total = list.reduce((n, g) => n + g.getAttribute(name).count, 0);
    const arr = new Float32Array(total * size);
    let offset = 0;
    for (const g of list) {
      const a = g.getAttribute(name);
      for (let i = 0; i < a.count; i++)
        for (let k = 0; k < size; k++) arr[offset * size + i * size + k] = a.getComponent(i, k);
      offset += a.count;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

export function usbBModel(): ComponentModel {
  const signal = pinPositions('USB-B').slice(0, 4);
  const legs = pinPositions('USB-B').slice(4);
  const tongueY = Y0 + 1.6 + 7.78 / 2;
  const meshes: ModelMesh[] = [
    { name: 'coque', key: 'usbb.shell', geometry: shell, material: (ctx) => ctx.materials.get('steel.zinc') },
    {
      name: 'pattes de fixation',
      key: 'usbb.leg',
      geometry: () =>
        loftRoundedRect(
          [
            { y: L_TAIL_END, w: 1.3 * MM, d: 0.3 * MM, r: 0.05 * MM },
            { y: L_TAIL_END + 0.5 * MM, w: 2.0 * MM, d: 0.3 * MM, r: 0.05 * MM },
            { y: (Y0 + 1.0) * MM, w: 2.0 * MM, d: 0.3 * MM, r: 0.05 * MM },
          ],
          { cornerSegments: 1 },
        ),
      material: (ctx) => ctx.materials.get('steel.zinc'),
      locals: legs.map(([x, z]) => mat(x, 0, z)),
    },
    {
      name: 'isolant',
      key: 'usbb.insulator',
      geometry: () =>
        roundedBox(9.6 * MM, (W - 2 * T - 0.05) * MM, (H - 2 * T - 0.05) * MM, {
          r: 0.2 * MM,
          rt: 0.15 * MM,
          y0: (Y0 + T + 0.02) * MM,
        }).translate(-(T + 4.8) * MM, 0, 0),
      material: (ctx) => ctx.materials.get('plastic.white'),
    },
    {
      name: 'langue',
      key: 'usbb.tongue',
      geometry: () =>
        roundedBox(5.4 * MM, 5.6 * MM, 3.0 * MM, {
          r: 0.3 * MM,
          rt: 0.25 * MM,
          rb: 0.25 * MM,
          y0: (tongueY - 1.5) * MM,
        }).translate(-(T + 9.6 + 2.6) * MM, 0, 0),
      material: (ctx) => ctx.materials.get('plastic.white'),
    },
    {
      name: 'contacts',
      key: 'usbb.contact',
      geometry: () =>
        roundedBox(4.6 * MM, 0.8 * MM, 0.08 * MM, { r: 0.05 * MM, rt: 0.03 * MM, rb: 0.01 * MM }).translate(
          -(T + 9.6 + 2.8) * MM,
          0,
          0,
        ),
      material: (ctx) => ctx.materials.get('gold'),
      locals: [
        mat(0, (tongueY + 1.5) * MM, -1.25 * MM),
        mat(0, (tongueY + 1.5) * MM, 1.25 * MM),
        mat(0, (tongueY - 1.58) * MM, -1.25 * MM),
        mat(0, (tongueY - 1.58) * MM, 1.25 * MM),
      ],
    },
    {
      name: 'broches',
      key: 'usbb.pin',
      geometry: () =>
        loftRoundedRect(
          [
            { y: L_TAIL_END, w: 0.3 * MM, d: 0.2 * MM, r: 0.04 * MM },
            { y: L_TAIL_END + 0.2 * MM, w: 0.6 * MM, d: 0.3 * MM, r: 0.04 * MM },
            { y: (Y0 + 1.2) * MM, w: 0.6 * MM, d: 0.3 * MM, r: 0.04 * MM },
          ],
          { cornerSegments: 1 },
        ),
      material: (ctx) => ctx.materials.get('tin'),
      locals: signal.map(([x, z]) => mat(x, 0, z)),
    },
    ...thtJointMeshes('usbb.sig', signal, 0.8, 0.34, { bottomH: 0.8 }),
    ...thtJointMeshes('usbb.leg', legs, 1.5, 1.05, { bottomH: 1.1, top: 0.45 }),
  ];
  return { meshes };
}

export function usbBParts(parent: string): PartDef<UnoParams>[] {
  return keyComponentParts({
    ref: 'X2',
    id: 'x2',
    exteriorId: 'x2.shell',
    name: 'Connecteur USB type B (X2)',
    exteriorName: 'Coque et face avant du connecteur USB-B',
    parent,
    model: usbBModel(),
    tags: ['component', 'tht'],
    info: {
      role: 'Liaison avec l’ordinateur : alimentation 5 V (protégée par le fusible F1) et données USB D+/D− vers l’ATmega16U2.',
      material: 'Coque en acier étamé emboutie, isolant PBT blanc, contacts en alliage de cuivre dorés',
      dimensions: '16,3 × 12,0 × 10,9 mm ; déborde de 6,2 mm du bord de carte',
      reference: 'Embase USB 2.0 type B traversante, 1,5 A (typique)',
      tip: 'Les deux grosses pattes de la coque encaissent les efforts du câble : un connecteur qui bouge a souvent ces soudures fissurées.',
      extra: [{ label: 'Brochage', value: '1 VBUS, 2 D−, 3 D+, 4 GND ; coque sur la masse USB' }],
    },
    exteriorInfo: {
      role: 'Blindage et tenue mécanique ; la face avant guide la fiche (profil « maison » du type B).',
      material: 'Acier étamé de 0,3 mm (coque), PBT blanc (isolant visible), contacts dorés',
      dimensions: 'Ouverture 8,45 × 7,78 mm ; langue 5,6 × 3,0 mm',
      tip: 'Approximation actuelle : l’isolant et les contacts visibles font partie de cette pièce ; ils seront séparés au niveau des intérieurs.',
    },
    removal: {
      tool: 'desolder-pump',
      motion: 'desolder',
      axis: [0, 1, 0],
      distance: 0.03,
      gesture:
        'Chauffer longuement les deux pattes de coque (fort volume d’étain) et les quatre broches, aspirer à la pompe, puis extraire le connecteur.',
    },
    explode: { direction: [0, 1, 0], distance: 0.016 },
    labelPriority: 8,
  });
}
