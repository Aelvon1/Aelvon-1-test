/**
 * Quartz 16 MHz en boîtier HC-49/S (horloge de l'ATmega16U2) — composant clé.
 *
 * Sous-ensemble retirable « y1 » (dessoudage à la pompe, niveau 1 ; porteur des joints de
 * soudure) dont les enfants sont les pièces internes du boîtier (niveau 3, `internals/crystal.ts`) :
 * capot soudé (ouverture destructive), lame de quartz taillée AT et ses électrodes d'argent,
 * supports-ressorts, embase à traversées verre-métal et ses deux fils.
 *
 * HC-49/S (« bas ») : capot 11,05 × 4,65 × 3,5 mm en acier nickelé, collerette 11,4 × 4,95 mm,
 * fils Ø 0,43 mm au pas de 4,88 mm, cale isolante sous le boîtier.
 */
import type { PartDef } from '../../types';
import type { UnoParams } from '../params';
import { pinPositions, thtJointMeshes } from '../packages/headers';
import { keyAssemblyPart } from '../internals/frame';
import { crystalInternalParts } from '../internals/crystal';

export function crystalParts(parent: string): PartDef<UnoParams>[] {
  return [
    keyAssemblyPart({
      ref: 'Y1',
      id: 'y1',
      name: 'Quartz 16 MHz (HC-49/S)',
      parent,
      joints: {
        meshes: thtJointMeshes('hc49s', pinPositions('HC49S'), 0.75, 0.24, { bottomH: 0.75, top: 0.2 }),
      },
      tags: ['component', 'tht'],
      info: {
        role: 'Base de temps de l’ATmega16U2 : la précision du quartz (± 30 ppm, typique) est nécessaire à l’USB pleine vitesse.',
        material:
          'Lame de quartz taillée AT sous capot en acier nickelé soudé sur une embase à traversées de verre',
        dimensions: 'HC-49/S : 11,05 × 4,65 × 3,5 mm, fils Ø 0,43 mm au pas de 4,88 mm',
        reference: '16,000 MHz, charge 18 pF (typique)',
        tip: 'Chargé par deux condensateurs de 22 pF et shunté par 1 MΩ pour garantir le démarrage de l’oscillateur. Ne jamais chauffer le capot au dessoudage.',
        extra: [
          {
            label: 'Intérieur',
            value: 'lame de 7,6 × 1,9 × 0,104 mm tenue par deux supports-ressorts, sous azote sec',
          },
        ],
      },
      removal: {
        tool: 'desolder-pump',
        motion: 'desolder',
        axis: [0, 1, 0],
        distance: 0.022,
        gesture:
          'Chauffer chaque soudure côté cuivre au fer, aspirer l’étain à la pompe, puis extraire le quartz.',
      },
      explode: { direction: [0, 1, 0], distance: 0.012 },
      labelPriority: 6,
    }),
    ...crystalInternalParts(),
  ];
}
