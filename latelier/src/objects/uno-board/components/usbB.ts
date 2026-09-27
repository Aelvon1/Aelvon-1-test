/**
 * Connecteur USB type B traversant (X2) — composant clé.
 *
 * Sous-ensemble retirable « x2 » (dessoudage à la pompe, niveau 1 ; porteur des joints de
 * soudure des quatre broches et des deux pattes de coque) dont les enfants sont les pièces
 * internes (niveau 3, `internals/usbB.ts`) : coque emboutie (déclipsage), contacts supérieurs et
 * inférieurs en bronze doré, isolant et langue.
 *
 * Repère : origine au centre de la face arrière, ouverture vers −X (déborde de 6,2 mm du bord
 * de carte). Coque 16,3 × 12,0 × 10,9 mm en acier de 0,3 mm.
 */
import type { PartDef } from '../../types';
import type { UnoParams } from '../params';
import { pinPositions, thtJointMeshes } from '../packages/headers';
import { keyAssemblyPart } from '../internals/frame';
import { usbBInternalParts } from '../internals/usbB';

export function usbBParts(parent: string): PartDef<UnoParams>[] {
  const signal = pinPositions('USB-B').slice(0, 4);
  const legs = pinPositions('USB-B').slice(4);
  return [
    keyAssemblyPart({
      ref: 'X2',
      id: 'x2',
      name: 'Connecteur USB type B (X2)',
      parent,
      joints: {
        meshes: [
          ...thtJointMeshes('usbb.sig', signal, 0.8, 0.34, { bottomH: 0.8 }),
          ...thtJointMeshes('usbb.leg', legs, 1.5, 1.05, { bottomH: 1.1, top: 0.45 }),
        ],
      },
      tags: ['component', 'tht'],
      info: {
        role: 'Liaison avec l’ordinateur : alimentation 5 V (protégée par le fusible F1) et données USB D+/D− vers l’ATmega16U2.',
        material: 'Coque en acier étamé emboutie, isolant PBT blanc, contacts en bronze phosphoreux dorés',
        dimensions: '16,3 × 12,0 × 10,9 mm ; déborde de 6,2 mm du bord de carte',
        reference: 'Embase USB 2.0 type B traversante, 1,5 A (typique)',
        tip: 'Les deux grosses pattes de la coque encaissent les efforts du câble : un connecteur qui bouge a souvent ces soudures fissurées.',
        extra: [
          { label: 'Brochage', value: '1 VBUS, 2 D−, 3 D+, 4 GND ; coque sur la masse USB' },
          {
            label: 'Intérieur',
            value: 'coque agrafée, isolant à langue, 4 contacts à ressort (2 dessus, 2 dessous)',
          },
        ],
      },
      removal: {
        tool: 'desolder-pump',
        motion: 'desolder',
        axis: [0, 1, 0],
        distance: 0.03,
        gesture:
          'Chauffer longuement les deux pattes de coque (fort volume d’étain) et les quatre broches, aspirer à la pompe, puis extraire le connecteur.',
      },
      // Plus haut que le quartz voisin (Y1, 0,7 mm derrière la coque) et ses pièces éclatées :
      // les contacts, écartés vers l'arrière (+X), passent au-dessus.
      explode: { direction: [0, 1, 0], distance: 0.03 },
      labelPriority: 8,
    }),
    ...usbBInternalParts(),
  ];
}
