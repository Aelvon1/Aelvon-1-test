/**
 * ATmega328P-PU (DIP-28) — composant clé.
 *
 * Sous-ensemble retirable « u4 » (extraction de son support à l'extracteur, niveau 1) dont les
 * enfants sont les pièces internes du boîtier (niveau 3, `internals/mcu.ts`) : demi-coques de
 * résine, fils d'or, puce de silicium, grille de connexion et pattes.
 *
 * Boîtier PDIP-28 0,3 po : corps 35,2 × 7,0 × 3,4 mm (dépouille, plan de joint, encoche de
 * repérage côté broche 1, arêtes arrondies), 28 pattes étamées de 0,25 mm d'épaisseur : partie
 * haute large (1,52 mm) jusqu'au plan d'assise, épaulement, puis partie d'insertion de 0,46 mm.
 */
import type { PartDef } from '../../types';
import type { UnoParams } from '../params';
import { keyAssemblyPart } from '../internals/frame';
import { mcuInternalParts } from '../internals/mcu';

/** Sous-ensemble ATmega328P et ses pièces internes. */
export function atmega328pParts(parent: string): PartDef<UnoParams>[] {
  return [
    keyAssemblyPart({
      ref: 'U4',
      id: 'u4',
      name: 'Microcontrôleur ATmega328P-PU',
      parent,
      // Monté sur support : aucun joint de soudure.
      joints: { meshes: [] },
      tags: ['component', 'tht'],
      info: {
        role: 'Microcontrôleur principal 8 bits AVR : exécute le programme de l’utilisateur (entrées-sorties D0–D13, A0–A5, liaison série, SPI, I²C).',
        material:
          'Puce CMOS en silicium, grille de connexion en alliage de cuivre étamé, résine époxy chargée de silice',
        dimensions: 'PDIP-28 0,3 po : 35,2 × 7,0 × 3,4 mm (corps), pas 2,54 mm, rangées à 7,62 mm',
        reference: 'ATmega328P-PU',
        tip: 'Monté sur support : on le remplace sans fer à souder. À l’extraction, soulever alternativement chaque extrémité pour ne pas tordre les pattes.',
        extra: [
          { label: 'Mémoires', value: '32 Ko Flash, 2 Ko SRAM, 1 Ko EEPROM' },
          { label: 'Horloge', value: '16 MHz (résonateur céramique Y2)' },
          { label: 'Broche 1', value: 'repérée par l’encoche et le point moulé (côté jack)' },
          { label: 'Intérieur', value: 'puce de 3 × 3 mm, 28 fils d’or, grille de connexion' },
        ],
      },
      removal: {
        requires: [],
        tool: 'ic-extractor',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.03,
        gesture:
          'Glisser l’extracteur sous les extrémités du boîtier et soulever en basculant légèrement, sans tordre les pattes.',
      },
      explode: { direction: [0, 1, 0], distance: 0.014 },
      labelPriority: 9,
    }),
    ...mcuInternalParts(),
  ];
}
