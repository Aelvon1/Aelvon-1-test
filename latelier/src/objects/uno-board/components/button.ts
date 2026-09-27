/**
 * Bouton RESET tactile CMS 6 × 3,5 mm (SW1) — composant clé.
 *
 * Sous-ensemble retirable « sw1 » (dessoudage à l'air chaud, niveau 1 ; porteur des joints de
 * soudure) dont les enfants sont les pièces internes (niveau 3, `internals/button.ts`) : capot
 * métallique agrafé, poussoir, dôme de contact en inox, embase à contacts et bornes.
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
import { buttonInternalParts } from '../internals/button';

/** Ménisque d'une borne en aile de mouette (repère pastille). */
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

/** Joints de soudure des deux bornes (portés par le sous-ensemble). */
export function tactSwitchJoints(): ComponentModel {
  const locals = FOOTPRINTS['SW6x3.5'].pads.map((p) => padFrame(p));
  return {
    meshes: [
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
  return [
    keyAssemblyPart({
      ref: 'SW1',
      id: 'sw1',
      name: 'Bouton RESET (SW1)',
      parent,
      joints: tactSwitchJoints(),
      tags: ['component', 'smd'],
      info: {
        role: 'Relance le programme : un appui relie la broche RESET du 328P à la masse (rappel au 5 V par 10 kΩ).',
        material:
          'Embase en polyamide noir, capot en acier inoxydable, dôme de contact en inox, poussoir en polyamide',
        dimensions: '6,0 × 3,5 × 2,9 mm (poussoir compris), bornes au pas de 7,9 mm',
        reference: 'Bouton tactile CMS 6 × 3,5 mm, 50 mA 12 V, force ≈ 1,6 N (typique)',
        tip: 'Placé dans l’angle supérieur gauche, accessible même avec une carte d’extension enfichée.',
        extra: [
          { label: 'Intérieur', value: 'dôme inox Ø 2,6 mm sur contacts argentés, poussoir, capot agrafé' },
        ],
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
    }),
    ...buttonInternalParts(),
  ];
}
