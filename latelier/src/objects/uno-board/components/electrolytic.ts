/**
 * Condensateur électrolytique aluminium CMS 47 µF 25 V (PC1, PC2) — composant clé (niveau 3 à
 * venir : bobinage anode/cathode et papier imprégné d'électrolyte, joint caoutchouc). Pour
 * l'instant : sous-ensemble retirable « pc1 » / « pc2 » (joints) + pièce extérieure
 * « pc1.can » / « pc2.can » (godet, embase, bornes).
 *
 * Taille « E » (Ø 6,3 × 5,8 mm, typique) : godet en aluminium à rainure de sertissage, dessus
 * marqué (valeur, tension, bande noire côté −) avec évent en croix ; embase plastique noire aux
 * deux angles chanfreinés côté + ; deux bornes plates repliées sous l'embase.
 */
import * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { L_SMD_SEAT, MM } from '../constants';
import { FOOTPRINTS } from '../footprints';
import { own, type UnoParams } from '../params';
import { padFrame, padAlongLat } from '../packages/chips';
import { filletPath, flatDisk, lathe, sweepStrip, type P2 } from '../packages/geometry';
import { perforatedBlock } from '../packages/headers';
import type { ComponentModel } from '../packages/model';
import { filletRing } from '../packages/solder';
import { keyComponentParts } from './common';

const BASE_H = 0.9;
const CAN_TOP = 5.8;

/** Embase : carré de 6,6 mm, deux angles chanfreinés côté + (−X local). */
function seatPlate(): THREE.BufferGeometry {
  const h = 3.3;
  const c = 1.1;
  const pts: P2[] = [
    [-h + c, -h],
    [h, -h],
    [h, h],
    [-h + c, h],
    [-h, h - c],
    [-h, -h + c],
  ];
  // perforatedBlock attend des points (x, z) ; sens trigonométrique vu de dessus.
  const outer = pts.map(([x, z]) => new THREE.Vector2(x * MM, -z * MM));
  return perforatedBlock(outer, [], L_SMD_SEAT + 0.02 * MM, BASE_H * MM, 0.12 * MM);
}

/** Godet aluminium : fond serti dans l'embase, rainure de sertissage, bord supérieur arrondi. */
function can(): THREE.BufferGeometry {
  const y0 = L_SMD_SEAT / MM + BASE_H - 0.3;
  const R = 3.15;
  const top = CAN_TOP;
  const profile: P2[] = [
    [R - 0.15, y0],
    [R, y0 + 0.12],
    [R, y0 + 0.85],
    [R - 0.12, y0 + 0.95],
    [R - 0.16, y0 + 1.05],
    [R - 0.12, y0 + 1.15],
    [R, y0 + 1.27],
  ];
  const rt = 0.45;
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    profile.push([R - rt + rt * Math.cos(a), top - rt + rt * Math.sin(a)]);
  }
  return lathe(
    profile.map(([r, y]) => [r * MM, y * MM] as P2),
    56,
  );
}

/** Borne plate repliée sous l'embase (repère pastille, X vers l'extérieur ; bord d'embase à +0,6 mm). */
function terminal(): THREE.BufferGeometry {
  const t = 0.2;
  const pts: P2[] = [
    [-1.7 * MM, (0.9 + t / 2) * MM],
    [-1.7 * MM, (t / 2) * MM],
    [0.95 * MM, (t / 2) * MM],
  ];
  return sweepStrip(filletPath(pts, 0.2 * MM, 6), t * MM, () => 0.65 * MM, {
    cornerR: 0.05 * MM,
    segs: 2,
  }).translate(0, L_SMD_SEAT, 0);
}

function terminalJoint(fine: boolean): THREE.BufferGeometry {
  const pad = FOOTPRINTS['CP6.3'].pads[1]!;
  const [along, lat] = padAlongLat(pad);
  const foot: [number, number, number, number] = [-1.65 * MM, -0.33 * MM, 0.95 * MM, 0.33 * MM];
  const padR: [number, number, number, number] = [
    (-along / 2) * MM,
    (-lat / 2) * MM,
    (along / 2) * MM,
    (lat / 2) * MM,
  ];
  return filletRing(
    { foot, pad: padR, hToe: 0.22 * MM, hHeel: 0.05 * MM, hSide: 0.14 * MM },
    fine ? 48 : 16,
    fine ? 8 : 3,
  );
}

export function electrolyticModel(): ComponentModel {
  const fp = FOOTPRINTS['CP6.3'];
  const locals = fp.pads.map((p) => padFrame(p));
  return {
    meshes: [
      {
        name: 'embase',
        key: 'cp63.seat',
        geometry: seatPlate,
        material: (ctx) => ctx.materials.get('plastic.black'),
      },
      { name: 'godet', key: 'cp63.can', geometry: can, material: (ctx) => ctx.materials.get('alu.machined') },
      {
        name: 'dessus marqué',
        key: 'cp63.top',
        geometry: () => flatDisk(2.72 * MM, CAN_TOP * MM, 6.1 * MM, 64),
        material: (ctx) => own(ctx, `mark.pc.top.q${ctx.quality}`),
      },
      {
        name: 'bornes',
        key: 'cp63.term',
        geometry: terminal,
        material: (ctx) => ctx.materials.get('tin'),
        locals,
      },
      {
        name: 'ménisques',
        key: 'cp63.joint.low',
        geometry: () => terminalJoint(false),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'low',
      },
      {
        name: 'ménisques fins',
        key: 'cp63.joint.fine',
        geometry: () => terminalJoint(true),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'detail',
      },
    ],
  };
}

/** Sous-ensemble d'un électrolytique (PC1 : entrée VIN, PC2 : sortie 5 V). */
export function electrolyticParts(ref: 'PC1' | 'PC2', parent: string): PartDef<UnoParams>[] {
  const id = ref.toLowerCase();
  const onVin = ref === 'PC1';
  return keyComponentParts({
    ref,
    id,
    exteriorId: `${id}.can`,
    name: `Condensateur électrolytique ${ref} 47 µF`,
    exteriorName: `Godet et embase de ${ref}`,
    parent,
    model: electrolyticModel(),
    tags: ['component', 'smd'],
    info: {
      role: onVin
        ? 'Réservoir d’entrée du régulateur 5 V : lisse la tension VIN (7–12 V) après la diode de protection.'
        : 'Réservoir de sortie du régulateur 5 V : assure sa stabilité et absorbe les appels de courant.',
      material: 'Feuilles d’aluminium gravées, électrolyte liquide, godet aluminium, embase plastique',
      dimensions: 'Ø 6,3 × 5,8 mm (typique), embase 6,6 × 6,6 mm',
      reference: '47 µF 25 V, électrolytique aluminium CMS',
      tip: 'Polarisé : la bande noire du dessus repère le −, les angles chanfreinés de l’embase le +. Monté à l’envers, il chauffe et gonfle (l’évent en croix s’ouvre).',
    },
    exteriorInfo: {
      role: 'Enveloppe étanche du bobinage : godet serti sur un joint caoutchouc, posé sur son embase isolante.',
      material: 'Aluminium embouti (évent en croix), embase en plastique noir, bornes étamées',
      dimensions: 'Godet Ø 6,3 mm ; bornes 0,65 × 0,2 mm repliées sous l’embase',
      tip: 'La rainure autour du godet est le sertissage qui comprime le joint : c’est par là que fuit un condensateur vieilli.',
    },
    removal: {
      tool: 'hot-air',
      motion: 'desolder',
      axis: [0, 1, 0],
      distance: 0.02,
      gesture: 'Chauffer les deux bornes à l’air chaud en protégeant le godet, puis soulever aux brucelles.',
    },
    explode: { direction: [0, 1, 0], distance: 0.012 },
    labelPriority: 5,
  });
}
