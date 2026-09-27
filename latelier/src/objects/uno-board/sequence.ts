/**
 * Démontage pas à pas (A → Z) : étapes groupées et lisibles. L'ordre découle des dépendances
 * (support après le 328P, couches du circuit après tous les composants), départagé par la
 * priorité : d'abord le microcontrôleur sur support, puis les traversants (du plus massif au
 * plus délicat), puis les CMS bloc par bloc à l'air chaud, enfin la séparation des couches.
 */
import type { StepDef } from '../types';

export const STEPS: readonly StepDef[] = [
  {
    id: 'extract-mcu',
    title: 'Extraire l’ATmega328P de son support',
    description:
      'Glisser l’extracteur sous les deux extrémités du boîtier et soulever en basculant légèrement : les 28 pattes sortent ensemble sans se tordre.',
    parts: ['u4'],
    tool: 'ic-extractor',
    priority: 10,
  },
  {
    id: 'desolder-headers',
    title: 'Dessouder les connecteurs femelles',
    description:
      'Côté soudure, chauffer chaque broche au fer et aspirer l’étain à la pompe (32 soudures), puis extraire les quatre barrettes.',
    parts: ['hdr.power', 'hdr.analog', 'hdr.ioh', 'hdr.iol'],
    tool: 'desolder-pump',
    priority: 20,
    parallel: true,
  },
  {
    id: 'desolder-icsp',
    title: 'Dessouder les deux connecteurs ICSP',
    description: 'Même geste sur les 2 × 6 broches carrées : chauffer, aspirer, extraire.',
    parts: ['icsp', 'icsp1'],
    tool: 'desolder-pump',
    priority: 22,
    parallel: true,
  },
  {
    id: 'desolder-usb',
    title: 'Dessouder le connecteur USB-B',
    description:
      'Les pattes de la coque retiennent beaucoup d’étain : chauffer longtemps (panne large), aspirer, puis dégager les quatre broches de signal.',
    parts: ['x2'],
    tool: 'desolder-pump',
    priority: 30,
  },
  {
    id: 'desolder-jack',
    title: 'Dessouder le jack d’alimentation',
    description: 'Chauffer les trois lames au fer, aspirer l’étain et extraire le jack.',
    parts: ['x1'],
    tool: 'desolder-pump',
    priority: 32,
  },
  {
    id: 'desolder-crystal',
    title: 'Dessouder le quartz HC-49/S',
    description:
      'Deux soudures seulement ; ne pas chauffer le capot (choc thermique pour la lame de quartz).',
    parts: ['y1'],
    tool: 'desolder-pump',
    priority: 34,
  },
  {
    id: 'desolder-socket',
    title: 'Dessouder le support DIP-28',
    description:
      'Libérer les 28 contacts un à un à la pompe, vérifier qu’aucun ne tient encore, puis retirer le support.',
    parts: ['u4.socket'],
    tool: 'desolder-pump',
    priority: 36,
  },
  {
    id: 'smd-power',
    title: 'Retirer les CMS de l’étage d’alimentation (air chaud)',
    description:
      'Régulateurs, diode, électrolytiques, comparateur, transistor et passifs : chauffer chaque composant à l’air chaud jusqu’à fusion, puis le saisir aux brucelles.',
    parts: ['u1', 'd1', 'pc1', 'pc2', 'u2', 'u5', 't1', 'c.power.1u', 'c.power.100n', 'r.power.10k'],
    tool: 'hot-air',
    priority: 40,
  },
  {
    id: 'smd-usb',
    title: 'Retirer les CMS de l’interface USB (air chaud)',
    description:
      'L’ATmega16U2 (pastille thermique : chauffer plus longtemps), le fusible, la ferrite, les varistances, les résistances et condensateurs.',
    parts: ['u3', 'f1', 'l1', 'z.esd', 'rn3', 'c.usb.22p', 'r.usb.1m', 'c.usb.1u', 'c.usb.100n'],
    tool: 'hot-air',
    priority: 50,
  },
  {
    id: 'smd-mcu',
    title: 'Retirer les CMS autour du microcontrôleur (air chaud)',
    description: 'Résonateur 16 MHz, résistance 1 MΩ, condensateurs 100 nF et réseaux de résistances.',
    parts: ['y2', 'r.mcu.1m', 'c.mcu.100n', 'rn1', 'rn4'],
    tool: 'hot-air',
    priority: 60,
  },
  {
    id: 'smd-ui',
    title: 'Retirer les LED, le bouton RESET et leurs résistances',
    description:
      'Air chaud à température modérée pour ne pas jaunir les lentilles des LED ni déformer le bouton.',
    parts: ['led.yellow', 'led.green', 'r.ui.1k', 'rn2', 'sw1'],
    tool: 'hot-air',
    priority: 70,
  },
  {
    id: 'reset-en',
    title: 'Ouvrir le pont RESET-EN (tresse)',
    description:
      'Poser la tresse à dessouder sur le pont et la chauffer : l’étain est absorbé, les deux demi-pastilles sont isolées.',
    parts: ['sj1'],
    tool: 'desolder-braid',
    priority: 75,
  },
  {
    id: 'layers-top',
    title: 'Séparer les couches supérieures du circuit imprimé',
    description:
      'Vue pédagogique de l’empilement : sérigraphie, puis vernis épargne, puis cuivre (pistes, pastilles, plan de masse) de la face composants.',
    parts: ['pcb.silk.top', 'pcb.mask.top', 'pcb.copper.top'],
    tool: 'scalpel',
    priority: 80,
    destructive: true,
  },
  {
    id: 'layers-bottom',
    title: 'Séparer les couches inférieures et les fûts métallisés',
    description:
      'Sérigraphie, vernis et cuivre de la face soudure, puis les fûts de cuivre des vias et trous traversants : il ne reste que l’âme FR4 percée.',
    parts: ['pcb.silk.bottom', 'pcb.mask.bottom', 'pcb.copper.bottom', 'pcb.barrels'],
    priority: 90,
    destructive: true,
  },
];
