/**
 * Condensateur électrolytique aluminium CMS 47 µF 25 V (PC1, PC2) — composant clé.
 *
 * Sous-ensemble retirable « pc1 » / « pc2 » (dessoudage à l'air chaud, niveau 1 ; porteur des
 * joints de soudure) dont les enfants sont les pièces internes (niveau 3,
 * `internals/electrolytic.ts`) : godet aluminium serti (ouverture destructive), enroulement
 * anode / papier / cathode (déroulement animé), bouchon de caoutchouc, embase et bornes.
 *
 * Taille « E » (Ø 6,3 × 5,8 mm, typique) : godet à rainure de sertissage, dessus marqué (valeur,
 * tension, bande noire côté −) avec évent en croix ; embase plastique noire aux deux angles
 * chanfreinés côté + ; deux bornes plates repliées sous l'embase.
 */
import type * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { MM } from '../constants';
import { FOOTPRINTS } from '../footprints';
import type { UnoParams } from '../params';
import { padAlongLat, padFrame } from '../packages/chips';
import type { ComponentModel } from '../packages/model';
import { filletRing } from '../packages/solder';
import { keyAssemblyPart } from '../internals/frame';
import { electrolyticInternalParts } from '../internals/electrolytic';

/** Ménisque d'une borne plate (repère pastille ; bord d'embase à +0,6 mm). */
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

/** Joints de soudure des deux bornes (portés par le sous-ensemble, fondus au dessoudage). */
export function electrolyticJoints(): ComponentModel {
  const locals = FOOTPRINTS['CP6.3'].pads.map((p) => padFrame(p));
  return {
    meshes: [
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

/** Sous-ensemble d'un électrolytique (PC1 : entrée VIN, PC2 : sortie 5 V) et ses pièces internes. */
export function electrolyticParts(ref: 'PC1' | 'PC2', parent: string): PartDef<UnoParams>[] {
  const id = ref.toLowerCase();
  const onVin = ref === 'PC1';
  return [
    keyAssemblyPart({
      ref,
      id,
      name: `Condensateur électrolytique ${ref} 47 µF`,
      parent,
      joints: electrolyticJoints(),
      tags: ['component', 'smd'],
      info: {
        role: onVin
          ? 'Réservoir d’entrée du régulateur 5 V : lisse la tension VIN (7–12 V) après la diode de protection.'
          : 'Réservoir de sortie du régulateur 5 V : assure sa stabilité et absorbe les appels de courant.',
        material:
          'Feuilles d’aluminium gravées, papier imprégné d’électrolyte, godet aluminium serti, embase plastique',
        dimensions: 'Ø 6,3 × 5,8 mm (typique), embase 6,6 × 6,6 mm',
        reference: '47 µF 25 V, électrolytique aluminium CMS',
        tip: 'Polarisé : la bande noire du dessus repère le −, les angles chanfreinés de l’embase le +. Monté à l’envers, il chauffe et gonfle (l’évent en croix s’ouvre).',
        extra: [
          {
            label: 'Intérieur',
            value: 'enroulement de ≈ 8 cm de bande (anode, papier, cathode), bouchon de caoutchouc',
          },
        ],
      },
      removal: {
        tool: 'hot-air',
        motion: 'desolder',
        axis: [0, 1, 0],
        distance: 0.02,
        gesture:
          'Chauffer les deux bornes à l’air chaud en protégeant le godet, puis soulever aux brucelles.',
      },
      explode: { direction: [0, 1, 0], distance: 0.012 },
      labelPriority: 5,
    }),
    ...electrolyticInternalParts(ref),
  ];
}
