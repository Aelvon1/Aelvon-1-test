/**
 * Démontage pas à pas (A → Z) : étapes groupées et lisibles. L'ordre découle des dépendances
 * (support après le 328P, couches du circuit après tous les composants, intérieur d'un composant
 * après son retrait de la carte), départagé par la priorité : d'abord le microcontrôleur sur
 * support, puis les traversants (du plus massif au plus délicat), puis les CMS bloc par bloc à
 * l'air chaud, puis la séparation des couches du circuit (niveau 2), enfin l'ouverture des
 * composants clés posés sur le tapis (niveau 3 : ATmega328P, USB-B, quartz, électrolytiques,
 * bouton).
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
  // --- Niveau 3 : intérieur des composants clés ------------------------------------------------
  {
    id: 'mcu-decap',
    title: 'Décapsuler l’ATmega328P (destructif)',
    description:
      'Entailler la résine au scalpel tout le long du plan de joint, puis soulever la demi-coque supérieure : la puce et ses 28 fils d’or apparaissent.',
    parts: ['u4.resin.top'],
    tool: 'scalpel',
    priority: 100,
    destructive: true,
  },
  {
    id: 'mcu-wires',
    title: 'Arracher les fils d’or de l’ATmega328P (destructif)',
    description:
      'Aux brucelles, arracher les fils de liaison un à un : chacun casse au col, juste au-dessus de sa boule soudée sur le plot de la puce.',
    parts: ['u4.wires'],
    tool: 'tweezers',
    priority: 101,
    destructive: true,
  },
  {
    id: 'mcu-die',
    title: 'Décoller la puce de silicium (destructif)',
    description:
      'Soulever la puce aux brucelles : la colle chargée argent cède et libère l’îlot de la grille de connexion.',
    parts: ['u4.die'],
    tool: 'tweezers',
    priority: 102,
    destructive: true,
  },
  {
    id: 'mcu-leadframe',
    title: 'Arracher la grille de connexion (destructif)',
    description:
      'Saisir les pattes à la pince plate et arracher la grille de la demi-coque inférieure : îlot, barrettes de maintien et 28 doigts viennent d’un bloc.',
    parts: ['u4.leadframe'],
    tool: 'pliers-flat',
    priority: 103,
    destructive: true,
  },
  {
    id: 'usb-shell',
    title: 'Déclipser la coque du connecteur USB-B',
    description:
      'Relever le volet arrière au tournevis de précision (déclic des agrafes), puis faire glisser la coque vers l’avant : l’isolant et sa langue apparaissent.',
    parts: ['x2.shell'],
    tool: 'screwdriver-precision',
    priority: 110,
  },
  {
    id: 'usb-contacts',
    title: 'Extraire les quatre contacts dorés de l’USB-B',
    description:
      'À la pince plate, tirer vers l’arrière les contacts supérieurs (VBUS, D−), dont les queues barrent le passage, puis les contacts inférieurs (D+, GND).',
    parts: ['x2.contacts.top', 'x2.contacts.bottom'],
    tool: 'pliers-flat',
    priority: 111,
  },
  {
    id: 'crystal-can',
    title: 'Ouvrir le capot du quartz (destructif)',
    description:
      'Rompre à la pince coupante la soudure du capot sur la collerette, tout autour, puis soulever le capot : la lame de quartz apparaît, debout entre ses supports.',
    parts: ['y1.can'],
    tool: 'cutter-flush',
    priority: 120,
    destructive: true,
  },
  {
    id: 'crystal-blank',
    title: 'Dégager la lame de quartz (destructif)',
    description:
      'Saisir la lame par ses bords aux brucelles et la sortir des fourches : la colle conductrice cède. Elle ne fait qu’un dixième de millimètre d’épaisseur.',
    parts: ['y1.blank'],
    tool: 'tweezers',
    priority: 121,
    destructive: true,
  },
  {
    id: 'crystal-supports',
    title: 'Retirer les supports-ressorts du quartz (destructif)',
    description:
      'Casser à la pince plate les soudures par points des deux supports sur les fils : il reste l’embase et ses traversées de verre.',
    parts: ['y1.supports'],
    tool: 'pliers-flat',
    priority: 122,
    destructive: true,
  },
  {
    id: 'pc1-can',
    title: 'Ouvrir le godet de l’électrolytique PC1 (destructif)',
    description:
      'Couper le bord roulé du sertissage à la pince coupante, puis tirer le godet vers le haut : l’enroulement imbibé d’électrolyte apparaît, debout sur son bouchon.',
    parts: ['pc1.can'],
    tool: 'cutter-flush',
    priority: 130,
    destructive: true,
  },
  {
    id: 'pc1-unwind',
    title: 'Dérouler l’électrolytique PC1 (destructif)',
    description:
      'Couper les languettes, saisir l’extrémité extérieure et dérouler la bande : papier, anode gravée, papier, cathode, sur près de 8 cm.',
    parts: ['pc1.winding'],
    tool: 'tweezers',
    priority: 131,
    destructive: true,
  },
  {
    id: 'pc1-seal',
    title: 'Retirer le bouchon de caoutchouc de PC1',
    description:
      'Faire glisser le bouchon le long des deux sorties aux brucelles : il reste l’embase et ses bornes.',
    parts: ['pc1.seal'],
    tool: 'tweezers',
    priority: 132,
  },
  {
    id: 'pc2-open',
    title: 'Ouvrir et dérouler l’électrolytique PC2 (destructif)',
    description:
      'Même démontage que PC1 : couper le sertissage et retirer le godet, dérouler l’enroulement, puis dégager le bouchon.',
    parts: ['pc2.can', 'pc2.winding', 'pc2.seal'],
    tool: 'cutter-flush',
    priority: 133,
    destructive: true,
  },
  {
    id: 'sw-cover',
    title: 'Déclipser le capot du bouton RESET',
    description:
      'Glisser la lame d’un tournevis de précision sous une patte du capot, l’écarter, puis soulever le capot : le poussoir apparaît.',
    parts: ['sw1.cover'],
    tool: 'screwdriver-precision',
    priority: 140,
  },
  {
    id: 'sw-mechanism',
    title: 'Retirer le poussoir et le dôme inox du bouton',
    description:
      'Aux brucelles, sortir le poussoir, puis le dôme de contact : au fond du logement apparaissent le contact central (masse) et les contacts périphériques (RESET).',
    parts: ['sw1.plunger', 'sw1.dome'],
    tool: 'tweezers',
    priority: 141,
  },
];
