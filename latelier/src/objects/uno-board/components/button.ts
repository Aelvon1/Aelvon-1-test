/**
 * Bouton RESET tactile CMS 6 × 3,5 mm (SW1) — composant clé (niveau 3 à venir : dôme
 * métallique, poussoir, contacts fixes). Pour l'instant : sous-ensemble retirable « sw1 »
 * (joints) + pièce extérieure « sw1.housing » (boîtier, capot, poussoir, bornes).
 */
import type * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { L_SMD_SEAT, MM } from '../constants';
import { FOOTPRINTS } from '../footprints';
import type { UnoParams } from '../params';
import { padAlongLat, padFrame } from '../packages/chips';
import { filletPath, mat, roundedBox, sweepStrip, type P2 } from '../packages/geometry';
import { perforatedBlock, rrect } from '../packages/headers';
import type { ComponentModel } from '../packages/model';
import { filletRing } from '../packages/solder';
import { keyComponentParts } from './common';

const Y0 = L_SMD_SEAT + 0.05 * MM;
const BODY_H = 1.9;

/** Borne en aile de mouette (repère pastille : bord du corps à −0,95 mm). */
function terminal(): THREE.BufferGeometry {
  const t = 0.2;
  const pts: P2[] = [
    [-1.3 * MM, 0.55 * MM],
    [-0.85 * MM, 0.55 * MM],
    [-0.45 * MM, (t / 2) * MM],
    [0.55 * MM, (t / 2) * MM],
  ];
  return sweepStrip(filletPath(pts, 0.2 * MM, 6), t * MM, () => 1.0 * MM, {
    cornerR: 0.05 * MM,
    segs: 2,
  }).translate(0, L_SMD_SEAT, 0);
}

function joint(fine: boolean): THREE.BufferGeometry {
  const pad = FOOTPRINTS['SW6x3.5'].pads[1]!;
  const [along, lat] = padAlongLat(pad);
  const foot: [number, number, number, number] = [-0.5 * MM, -0.5 * MM, 0.55 * MM, 0.5 * MM];
  const padR: [number, number, number, number] = [
    (-along / 2) * MM,
    (-lat / 2) * MM,
    (along / 2) * MM,
    (lat / 2) * MM,
  ];
  return filletRing(
    { foot, pad: padR, hToe: 0.18 * MM, hHeel: 0.36 * MM, hSide: 0.14 * MM },
    fine ? 48 : 16,
    fine ? 8 : 3,
  );
}

export function tactSwitchModel(): ComponentModel {
  const fp = FOOTPRINTS['SW6x3.5'];
  const locals = fp.pads.map((p) => padFrame(p));
  const coverY = Y0 + BODY_H * MM;
  return {
    meshes: [
      {
        name: 'boîtier',
        key: 'sw.body',
        geometry: () =>
          roundedBox(6.0 * MM, 3.5 * MM, BODY_H * MM, { r: 0.2 * MM, rt: 0.12 * MM, rb: 0.05 * MM, y0: Y0 }),
        material: (ctx) => ctx.materials.get('plastic.black'),
      },
      {
        name: 'capot métallique',
        key: 'sw.cover',
        geometry: () =>
          perforatedBlock(
            rrect(6.1 * MM, 3.6 * MM, 0.25 * MM),
            [rrect(2.9 * MM, 1.7 * MM, 0.4 * MM)],
            coverY - 0.02 * MM,
            0.22 * MM,
            0.05 * MM,
          ),
        material: (ctx) => ctx.materials.get('steel.stainless'),
      },
      {
        name: 'pattes du capot',
        key: 'sw.tab',
        geometry: () =>
          roundedBox(1.2 * MM, 0.2 * MM, 1.3 * MM, { r: 0.05 * MM, rt: 0.05 * MM, y0: coverY - 1.3 * MM }),
        material: (ctx) => ctx.materials.get('steel.stainless'),
        locals: [mat(0, 0, 1.82 * MM), mat(0, 0, -1.82 * MM)],
      },
      {
        name: 'poussoir',
        key: 'sw.plunger',
        geometry: () =>
          roundedBox(2.6 * MM, 1.4 * MM, 1.25 * MM, {
            r: 0.5 * MM,
            rt: 0.35 * MM,
            rb: 0.02 * MM,
            y0: coverY - 0.3 * MM,
          }),
        material: (ctx) => ctx.materials.get('plastic.nylon'),
      },
      {
        name: 'bornes',
        key: 'sw.term',
        geometry: terminal,
        material: (ctx) => ctx.materials.get('tin'),
        locals,
      },
      {
        name: 'ménisques',
        key: 'sw.joint.low',
        geometry: () => joint(false),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'low',
      },
      {
        name: 'ménisques fins',
        key: 'sw.joint.fine',
        geometry: () => joint(true),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'detail',
      },
    ],
  };
}

export function buttonParts(parent: string): PartDef<UnoParams>[] {
  return keyComponentParts({
    ref: 'SW1',
    id: 'sw1',
    exteriorId: 'sw1.housing',
    name: 'Bouton RESET (SW1)',
    exteriorName: 'Boîtier du bouton RESET',
    parent,
    model: tactSwitchModel(),
    tags: ['component', 'smd'],
    info: {
      role: 'Relance le programme : un appui relie la broche RESET du 328P à la masse (rappel au 5 V par 10 kΩ).',
      material: 'Boîtier en polyamide noir, capot en acier inoxydable, dôme de contact en acier',
      dimensions: '6,0 × 3,5 × 3,4 mm (poussoir compris), bornes au pas de 7,9 mm',
      reference: 'Bouton tactile CMS 6 × 3,5 mm, 50 mA 12 V, force ≈ 1,6 N (typique)',
      tip: 'Placé dans l’angle supérieur gauche, accessible même avec une carte d’extension enfichée.',
    },
    exteriorInfo: {
      role: 'Enveloppe du mécanisme : le capot serti maintient le dôme et guide le poussoir.',
      material: 'Polyamide, acier inoxydable, poussoir en plastique crème',
      dimensions: 'Corps 6,0 × 3,5 × 1,9 mm ; poussoir 2,6 × 1,4 mm',
      tip: 'Un bouton qui ne « clique » plus a un dôme fatigué : il se remplace sans chercher à le réparer.',
    },
    removal: {
      tool: 'hot-air',
      motion: 'desolder',
      axis: [0, 1, 0],
      distance: 0.018,
      gesture:
        'Chauffer les deux bornes à l’air chaud (buse moyenne), puis soulever le bouton aux brucelles.',
    },
    explode: { direction: [0, 1, 0], distance: 0.01 },
    labelPriority: 6,
  });
}
