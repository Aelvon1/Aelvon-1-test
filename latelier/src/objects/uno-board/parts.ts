/**
 * Arborescence des pièces de la carte :
 * - « Circuit imprimé nu » (couches séparables, âme FR4 = base de l'objet) ;
 * - cinq blocs fonctionnels (sous-ensembles non retirables, pour l'éclatement et la lecture) :
 *   alimentation, interface USB, microcontrôleur, signalisation/commande, connecteurs ;
 * - dans chaque bloc, TOUS les composants (tags `component` + `smd`/`tht`) ; les passifs
 *   identiques d'un même bloc sont regroupés en une pièce instanciée (une instance
 *   sélectionnable par composant, libellée par sa désignation) ;
 * - composants clés (328P, quartz, électrolytiques, bouton, USB-B) : sous-ensembles préparés
 *   pour les intérieurs (voir `components/`).
 */
import type { ExplodeSpec, PartDef, PartInfo, RemovalSpec } from '../types';
import { MM } from './constants';
import { component, type BlockId } from './layout';
import type { UnoParams } from './params';
import { atmega328pParts } from './components/atmega328p';
import { buttonParts } from './components/button';
import { crystalParts } from './components/crystal';
import { electrolyticParts } from './components/electrolytic';
import { usbBParts } from './components/usbB';
import { MSOP8, SOT223, SOT23_3, SOT23_5, leadedPackage, qfn32Model, smaModel } from './packages/chips';
import { roundedBox } from './packages/geometry';
import { dipSocketModel, femaleHeaderModel, icspModel } from './packages/headers';
import { jackModel } from './packages/jack';
import { buildComponent, componentDetail, type ComponentModel } from './packages/model';
import {
  C0603,
  FERRITE0805,
  FUSE1812,
  R0603,
  VARISTOR0603,
  chip2Model,
  led0805Model,
  resistorArrayModel,
  resonatorModel,
} from './packages/passives';
import { pcbParts } from './pcb/parts';

type Part = PartDef<UnoParams>;

export const BLOCK_PART: Readonly<Record<BlockId, string>> = {
  power: 'blk.power',
  usb: 'blk.usb',
  mcu: 'blk.mcu',
  ui: 'blk.ui',
  io: 'blk.io',
};

/** Retrait d'un CMS à l'air chaud. */
const smd = (gesture: string, distance = 0.015): RemovalSpec => ({
  tool: 'hot-air',
  motion: 'desolder',
  axis: [0, 1, 0],
  distance,
  stagger: 0.35,
  gesture,
});

/** Retrait d'un traversant au fer et à la pompe. */
const tht = (gesture: string, distance = 0.025, requires: string[] = []): RemovalSpec => ({
  requires,
  tool: 'desolder-pump',
  motion: 'desolder',
  axis: [0, 1, 0],
  distance,
  gesture,
});

const up = (distance: number): ExplodeSpec => ({ direction: [0, 1, 0], distance });

interface CompSpec {
  id: string;
  name: string;
  block: BlockId;
  refs: readonly string[];
  model: ComponentModel;
  tags: readonly string[];
  info: PartInfo;
  removal: RemovalSpec;
  explode: ExplodeSpec;
  /** Libellé d'instance (ex. « C4 — découplage VCC »). */
  labels?: readonly string[];
  labelPriority?: number;
}

/** Pièce d'un composant (ou d'un groupe de composants identiques). */
function comp(spec: CompSpec): Part {
  const many = spec.refs.length > 1;
  const placements = () => spec.refs.map(component);
  const labels = spec.labels ?? spec.refs.map((r) => `${r} — ${component(r).value}`);
  const part: Part = {
    id: spec.id,
    name: spec.name,
    parent: BLOCK_PART[spec.block],
    tags: spec.tags,
    build: (ctx) =>
      buildComponent(ctx, spec.model, placements(), {
        instancedPart: many,
        label: (i) => labels[i] ?? spec.name,
      }),
    info: spec.info,
    explode: spec.explode,
    removal: spec.removal,
    label: { priority: spec.labelPriority ?? 2 },
  };
  if (many) part.quantity = spec.refs.length;
  const detail = componentDetail(spec.model, placements, { instancedPart: many });
  if (detail) part.detail = detail;
  return part;
}

// --- Modèles partagés (géométries mises en cache par clé) -----------------------------------------

const MODELS = {
  sot223: leadedPackage(SOT223, 'sot223'),
  sot23: leadedPackage(SOT23_3, 'sot23'),
  sot235: leadedPackage(SOT23_5, 'sot235'),
  msop8: leadedPackage(MSOP8, 'msop8'),
  qfn32: qfn32Model(),
  sma: smaModel(),
  r103: chip2Model(R0603('r0603.103'), 'r0603.103'),
  r102: chip2Model(R0603('r0603.102'), 'r0603.102'),
  r105: chip2Model(R0603('r0603.105'), 'r0603.105'),
  cX7R: chip2Model(C0603('x7r'), 'c0603.x7r'),
  cX5R: chip2Model(C0603('x5r'), 'c0603.x5r'),
  cC0G: chip2Model(C0603('c0g'), 'c0603.c0g'),
  varistor: chip2Model(VARISTOR0603, 'var0603'),
  ferrite: chip2Model(FERRITE0805, 'fer0805'),
  fuse: chip2Model(FUSE1812, 'fuse1812'),
  rn220: resistorArrayModel('rn.220'),
  rn103: resistorArrayModel('rn.103'),
  rn102: resistorArrayModel('rn.102'),
  ledY: led0805Model('led.yellow'),
  ledG: led0805Model('led.green'),
  resonator: resonatorModel(),
  jack: jackModel(),
  socket: dipSocketModel(),
  icsp: icspModel(),
  hdr6: femaleHeaderModel('HDR1x6'),
  hdr8: femaleHeaderModel('HDR1x8'),
  hdr10: femaleHeaderModel('HDR1x10'),
};

// --- Pont de soudure RESET-EN -----------------------------------------------------------------------

const SOLDER_BRIDGE: ComponentModel = {
  meshes: [
    {
      name: 'pont d’étain',
      key: 'sj.bridge',
      geometry: () =>
        roundedBox(1.35 * MM, 0.9 * MM, 0.22 * MM, { r: 0.35 * MM, rt: 0.18 * MM, rb: 0.0, y0: 0, steps: 5 }),
      material: (ctx) => ctx.materials.get('solder'),
      joint: 'top',
    },
  ],
};

// --- Blocs -------------------------------------------------------------------------------------------

function blocks(): Part[] {
  const block = (id: string, name: string, role: string, dims: string): Part => ({
    id,
    name,
    kind: 'assembly',
    info: {
      role,
      material: 'Composants CMS et traversants brasés (étain sans plomb SAC305, typique)',
      dimensions: dims,
    },
    explode: { direction: [0, 1, 0], distance: 0.045 },
    label: { priority: 7 },
  });
  return [
    block(
      'blk.power',
      'Étage d’alimentation',
      'Produit le 5 V (régulateur NCP1117 depuis le jack 7–12 V) et le 3,3 V (LP2985), et bascule automatiquement entre l’USB et le jack (comparateur LMV358 + transistor FDN340P).',
      'Zone inférieure gauche, ≈ 27 × 25 mm',
    ),
    block(
      'blk.usb',
      'Interface USB (ATmega16U2)',
      'Convertit l’USB en liaison série pour programmer le 328P et dialoguer avec l’ordinateur ; protège l’entrée USB (fusible, varistances, ferrite).',
      'Zone supérieure gauche, ≈ 28 × 25 mm',
    ),
    block(
      'blk.mcu',
      'Microcontrôleur ATmega328P',
      'Le cœur de la carte : 328P sur support, résonateur 16 MHz, découplages, rappels de RESET et liaison série vers le 16U2.',
      'Zone centrale et inférieure droite',
    ),
    block(
      'blk.ui',
      'Signalisation et commande',
      'Témoins lumineux (ON, L, TX, RX), bouton RESET et pont RESET-EN (réinitialisation automatique).',
      'Répartis au centre et à gauche',
    ),
    block(
      'blk.io',
      'Connecteurs d’extension',
      'Barrettes femelles au format « shield » : alimentation, entrées analogiques, entrées-sorties numériques et I²C.',
      'Deux rangées au pas de 2,54 mm (écart de 0,16 po entre D7 et D8)',
    ),
  ];
}

// --- Composants ------------------------------------------------------------------------------------

function powerParts(): Part[] {
  return [
    comp({
      id: 'x1',
      name: 'Jack d’alimentation 2,1 mm (X1)',
      block: 'power',
      refs: ['X1'],
      model: MODELS.jack,
      tags: ['component', 'tht'],
      info: {
        role: 'Entrée d’alimentation externe 7–12 V (centre positif) vers la diode M7 puis le régulateur 5 V.',
        material: 'Corps en PBT noir, contacts en laiton étamé',
        dimensions: '13,5 × 9,0 × 11,0 mm, alésage Ø 6,3 mm, broche centrale Ø 2,0 mm',
        reference: 'Embase jack 5,5 × 2,1 mm traversante, 2 A (typique)',
        tip: 'Au-delà de 12 V, le NCP1117 dissipe beaucoup : il chauffe fortement dès quelques dizaines de mA.',
      },
      removal: tht(
        'Chauffer les trois lames au fer (grosse panne), aspirer l’étain à la pompe, puis extraire le jack.',
        0.03,
      ),
      explode: up(0.02),
      labelPriority: 6,
    }),
    comp({
      id: 'd1',
      name: 'Diode de protection M7 (D1)',
      block: 'power',
      refs: ['D1'],
      model: MODELS.sma,
      tags: ['component', 'smd'],
      info: {
        role: 'Protège la carte contre une inversion de polarité sur le jack (chute ≈ 1 V).',
        material: 'Jonction silicium, boîtier époxy moulé, bornes étamées',
        dimensions: 'SMA (DO-214AC) : 4,3 × 2,6 × 2,1 mm',
        reference: 'M7 (1N4007 en boîtier CMS), 1 A 1000 V',
        tip: 'La bande grise repère la cathode (côté VIN).',
      },
      removal: smd(
        'Chauffer la diode à l’air chaud jusqu’à fusion des deux joints, puis la soulever aux brucelles.',
      ),
      explode: up(0.01),
    }),
    comp({
      id: 'u1',
      name: 'Régulateur 5 V NCP1117 (U1)',
      block: 'power',
      refs: ['U1'],
      model: MODELS.sot223,
      tags: ['component', 'smd'],
      info: {
        role: 'Régulateur linéaire à faible chute : fournit le 5 V depuis VIN (jack).',
        material: 'Puce silicium, boîtier époxy, languette de cuivre étamée (dissipation)',
        dimensions: 'SOT-223 : 6,5 × 3,5 × 1,6 mm, languette de 3,0 mm',
        reference: 'NCP1117ST50 (5,0 V, 1 A)',
        tip: 'La languette (broche 4) est la sortie 5 V : elle évacue la chaleur dans le cuivre de la carte.',
        extra: [{ label: 'Brochage', value: '1 GND, 2 sortie 5 V, 3 entrée VIN, 4 (languette) sortie' }],
      },
      removal: smd(
        'Chauffer longuement la languette (grande masse de cuivre) et les trois pattes à l’air chaud, puis soulever.',
      ),
      explode: up(0.01),
    }),
    ...electrolyticParts('PC1', BLOCK_PART.power),
    ...electrolyticParts('PC2', BLOCK_PART.power),
    comp({
      id: 'u2',
      name: 'Régulateur 3,3 V LP2985 (U2)',
      block: 'power',
      refs: ['U2'],
      model: MODELS.sot235,
      tags: ['component', 'smd'],
      info: {
        role: 'Régulateur linéaire à très faible chute : fournit la broche 3.3V (150 mA max) depuis le 5 V.',
        material: 'Puce silicium, boîtier époxy, pattes étamées',
        dimensions: 'SOT-23-5 : 2,9 × 1,6 × 1,1 mm',
        reference: 'LP2985-33 (marquage codé)',
        tip: 'Les petits boîtiers portent un code à 3 ou 4 caractères au lieu de la référence complète.',
      },
      removal: smd('Chauffer le boîtier à l’air chaud (buse fine), puis le soulever aux brucelles.', 0.012),
      explode: up(0.008),
    }),
    comp({
      id: 'u5',
      name: 'Double amplificateur opérationnel LMV358 (U5)',
      block: 'power',
      refs: ['U5'],
      model: MODELS.msop8,
      tags: ['component', 'smd'],
      info: {
        role: 'U5A compare VIN/2 à 3,3 V pour couper l’USB quand le jack est branché ; U5B, en suiveur, commande la LED « L » (D13).',
        material: 'Puce CMOS, boîtier époxy, 8 pattes étamées',
        dimensions: 'MSOP-8 : 3,0 × 3,0 × 1,1 mm, pas 0,65 mm',
        reference: 'LMV358 (double, rail à rail en sortie)',
        tip: 'Le point du dessus repère la broche 1.',
      },
      removal: smd(
        'Chauffer les huit pattes à l’air chaud en mouvement circulaire, puis soulever aux brucelles.',
        0.012,
      ),
      explode: up(0.008),
    }),
    comp({
      id: 't1',
      name: 'Transistor MOSFET P FDN340P (T1)',
      block: 'power',
      refs: ['T1'],
      model: MODELS.sot23,
      tags: ['component', 'smd'],
      info: {
        role: 'Interrupteur de l’alimentation USB : conduit tant que le jack est absent (grille commandée par U5A).',
        material: 'MOSFET silicium canal P, boîtier époxy',
        dimensions: 'SOT-23 : 2,9 × 1,3 × 1,0 mm',
        reference: 'FDN340P (−20 V, 2 A)',
        tip: 'Sa diode interne laisse passer un peu de courant même bloqué : on ne l’utilise que dans le bon sens.',
      },
      removal: smd('Chauffer à l’air chaud (buse fine), puis soulever le transistor aux brucelles.', 0.012),
      explode: up(0.008),
    }),
    comp({
      id: 'c.power.1u',
      name: 'Condensateurs céramiques 1 µF (C2, C3)',
      block: 'power',
      refs: ['C2', 'C3'],
      labels: ['C2 — 1 µF (sortie 3,3 V)', 'C3 — 1 µF (entrée LP2985)'],
      model: MODELS.cX5R,
      tags: ['component', 'smd'],
      info: {
        role: 'Découplage et stabilité du régulateur 3,3 V.',
        material: 'Céramique multicouche X5R, électrodes nickel, terminaisons étamées',
        dimensions: '0603 : 1,6 × 0,8 × 0,8 mm',
        reference: '1 µF 16 V X5R (typique)',
        tip: 'Les condensateurs céramiques ne portent aucun marquage : seule une mesure permet de les identifier.',
      },
      removal: smd('Chauffer chaque condensateur à l’air chaud puis le saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'c.power.100n',
      name: 'Condensateur céramique 100 nF (C1)',
      block: 'power',
      refs: ['C1'],
      model: MODELS.cX7R,
      tags: ['component', 'smd'],
      info: {
        role: 'Découplage haute fréquence de la sortie 5 V du régulateur.',
        material: 'Céramique multicouche X7R, terminaisons étamées',
        dimensions: '0603 : 1,6 × 0,8 × 0,8 mm',
        reference: '100 nF 50 V X7R (typique)',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'r.power.10k',
      name: 'Résistances 10 kΩ (R4, R5)',
      block: 'power',
      refs: ['R4', 'R5'],
      labels: ['R4 — 10 kΩ (pont diviseur VIN)', 'R5 — 10 kΩ (pont diviseur VIN)'],
      model: MODELS.r103,
      tags: ['component', 'smd'],
      info: {
        role: 'Pont diviseur : applique VIN/2 au comparateur U5A.',
        material: 'Couche résistive épaisse sur alumine, vernis noir, terminaisons étamées',
        dimensions: '0603 : 1,6 × 0,8 × 0,45 mm',
        reference: '10 kΩ 1 % 1/10 W',
        tip: 'Code « 103 » : 10 suivi de 3 zéros = 10 000 Ω.',
      },
      removal: smd('Chauffer à l’air chaud puis saisir chaque résistance aux brucelles.', 0.01),
      explode: up(0.006),
    }),
  ];
}

function usbParts(): Part[] {
  return [
    ...usbBParts(BLOCK_PART.usb),
    ...crystalParts(BLOCK_PART.usb),
    comp({
      id: 'u3',
      name: 'Convertisseur USB ATmega16U2 (U3)',
      block: 'usb',
      refs: ['U3'],
      model: MODELS.qfn32,
      tags: ['component', 'smd'],
      info: {
        role: 'Microcontrôleur USB programmé en convertisseur USB-série : relaie les données et commande la réinitialisation (DTR) du 328P.',
        material: 'Puce CMOS, boîtier QFN moulé, plots et pastille thermique étamés',
        dimensions: 'QFN-32 : 5 × 5 × 0,86 mm, pas 0,5 mm, pastille thermique 3,3 mm',
        reference: 'ATmega16U2-MU',
        tip: 'Sans pattes, ses soudures se voient à peine : un fin ménisque sur la tranche de chaque plot. Tourné de 45° sur la carte.',
        extra: [{ label: 'Plots', value: '32 plots + pastille centrale de masse' }],
      },
      removal: smd(
        'Chauffer uniformément le boîtier à l’air chaud (la pastille centrale retient beaucoup d’étain), puis soulever aux brucelles.',
        0.012,
      ),
      explode: up(0.01),
      labelPriority: 7,
    }),
    comp({
      id: 'f1',
      name: 'Fusible réarmable 500 mA (F1)',
      block: 'usb',
      refs: ['F1'],
      model: MODELS.fuse,
      tags: ['component', 'smd'],
      info: {
        role: 'Protège le port USB de l’ordinateur : sa résistance augmente brutalement au-delà de 500 mA, puis il se réarme en refroidissant.',
        material: 'Polymère chargé de carbone (CTP) entre deux électrodes, enrobage époxy',
        dimensions: '1812 : 4,5 × 3,2 × 0,85 mm',
        reference: 'MF-MSMF050 (500 mA maintenu, 1 A déclenché, typique)',
        tip: 'Après un court-circuit, attendre quelques secondes hors tension : il se réarme seul.',
      },
      removal: smd('Chauffer les deux terminaisons à l’air chaud, puis soulever aux brucelles.'),
      explode: up(0.008),
    }),
    comp({
      id: 'l1',
      name: 'Perle de ferrite (L1)',
      block: 'usb',
      refs: ['L1'],
      model: MODELS.ferrite,
      tags: ['component', 'smd'],
      info: {
        role: 'Relie la masse USB (blindage) à la masse de la carte en filtrant les parasites haute fréquence.',
        material: 'Ferrite NiZn multicouche, terminaisons étamées',
        dimensions: '0805 : 2,0 × 1,25 × 0,85 mm',
        reference: 'BLM21 (≈ 220 Ω à 100 MHz, typique)',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'z.esd',
      name: 'Varistances anti-ESD (Z1, Z2)',
      block: 'usb',
      refs: ['Z1', 'Z2'],
      labels: ['Z1 — varistance D−', 'Z2 — varistance D+'],
      model: MODELS.varistor,
      tags: ['component', 'smd'],
      info: {
        role: 'Écrêtent les décharges électrostatiques sur les lignes de données USB D+ et D−.',
        material: 'Oxyde de zinc multicouche, terminaisons étamées',
        dimensions: '0603 : 1,6 × 0,8 × 0,8 mm',
        reference: 'CG0603MLC-05E (5,5 V, typique)',
      },
      removal: smd('Chauffer à l’air chaud puis saisir chaque varistance aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'rn3',
      name: 'Réseau de résistances 22 Ω (RN3)',
      block: 'usb',
      refs: ['RN3'],
      model: MODELS.rn220,
      tags: ['component', 'smd'],
      info: {
        role: 'Résistances série des lignes D+ et D− (adaptation d’impédance de l’USB pleine vitesse).',
        material: 'Quatre résistances à couche épaisse sur substrat commun, terminaisons convexes étamées',
        dimensions: '1206 (4 × 0603) : 3,2 × 1,6 × 0,5 mm',
        reference: '4 × 22 Ω (code « 220 »)',
      },
      removal: smd('Chauffer les huit terminaisons à l’air chaud, puis soulever aux brucelles.', 0.012),
      explode: up(0.006),
    }),
    comp({
      id: 'c.usb.22p',
      name: 'Condensateurs de charge du quartz 22 pF (C7, C12)',
      block: 'usb',
      refs: ['C7', 'C12'],
      labels: ['C7 — 22 pF (XTAL1)', 'C12 — 22 pF (XTAL2)'],
      model: MODELS.cC0G,
      tags: ['component', 'smd'],
      info: {
        role: 'Capacités de charge de l’oscillateur à quartz du 16U2.',
        material: 'Céramique multicouche C0G/NP0 (très stable), terminaisons étamées',
        dimensions: '0603 : 1,6 × 0,8 × 0,8 mm',
        reference: '22 pF 50 V C0G',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'r.usb.1m',
      name: 'Résistance 1 MΩ du quartz (R1)',
      block: 'usb',
      refs: ['R1'],
      model: MODELS.r105,
      tags: ['component', 'smd'],
      info: {
        role: 'Polarise l’inverseur de l’oscillateur du 16U2 et facilite le démarrage du quartz.',
        material: 'Couche épaisse sur alumine, vernis noir',
        dimensions: '0603 : 1,6 × 0,8 × 0,45 mm',
        reference: '1 MΩ (code « 105 »)',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'c.usb.1u',
      name: 'Condensateur UCAP 1 µF (C9)',
      block: 'usb',
      refs: ['C9'],
      model: MODELS.cX5R,
      tags: ['component', 'smd'],
      info: {
        role: 'Stabilise le régulateur 3,3 V interne du 16U2 qui alimente son émetteur-récepteur USB.',
        material: 'Céramique multicouche X5R',
        dimensions: '0603 : 1,6 × 0,8 × 0,8 mm',
        reference: '1 µF',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'c.usb.100n',
      name: 'Condensateurs de découplage 100 nF (C10, C11)',
      block: 'usb',
      refs: ['C10', 'C11'],
      labels: ['C10 — 100 nF (VCC du 16U2)', 'C11 — 100 nF (UVCC/AVCC du 16U2)'],
      model: MODELS.cX7R,
      tags: ['component', 'smd'],
      info: {
        role: 'Découplage des alimentations du 16U2, au plus près de ses broches.',
        material: 'Céramique multicouche X7R',
        dimensions: '0603 : 1,6 × 0,8 × 0,8 mm',
        reference: '100 nF',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'icsp1',
      name: 'Connecteur ICSP du 16U2 (ICSP1)',
      block: 'usb',
      refs: ['ICSP1'],
      model: MODELS.icsp,
      tags: ['component', 'tht'],
      info: {
        role: 'Programmation directe (SPI) du micrologiciel USB du 16U2.',
        material: 'Embase en PBT noir, broches carrées en laiton étamé',
        dimensions: '2 × 3 broches au pas de 2,54 mm, broches 0,64 mm, hauteur 8,5 mm',
        reference: 'Barrette mâle 2 × 3',
        tip: 'Brochage ICSP : 1 MISO, 2 VCC, 3 SCK, 4 MOSI, 5 RESET, 6 GND.',
      },
      removal: tht(
        'Chauffer chaque broche côté cuivre, aspirer l’étain à la pompe, puis extraire la barrette.',
        0.028,
      ),
      explode: up(0.018),
    }),
  ];
}

function mcuParts(): Part[] {
  return [
    ...atmega328pParts(BLOCK_PART.mcu),
    comp({
      id: 'u4.socket',
      name: 'Support DIP-28 (U4)',
      block: 'mcu',
      refs: ['U4'],
      model: MODELS.socket,
      tags: ['component', 'tht'],
      info: {
        role: 'Reçoit l’ATmega328P sans soudure : le microcontrôleur se remplace en quelques secondes.',
        material: 'PBT noir chargé verre, contacts estampés en alliage de cuivre étamé',
        dimensions: '35,0 × 10,1 × 3,2 mm, 28 contacts, rangées à 7,62 mm',
        reference: 'Support DIP-28 0,3 po à contacts double lame',
        tip: 'L’encoche du support doit coïncider avec celle du circuit : broche 1 côté jack.',
      },
      removal: tht(
        'Chauffer successivement les 28 soudures côté cuivre en aspirant l’étain, puis extraire le support.',
        0.025,
        ['u4'],
      ),
      explode: up(0.008),
    }),
    comp({
      id: 'y2',
      name: 'Résonateur céramique 16 MHz (Y2)',
      block: 'mcu',
      refs: ['Y2'],
      model: MODELS.resonator,
      tags: ['component', 'smd'],
      info: {
        role: 'Horloge du 328P : résonateur à condensateurs de charge intégrés (broche centrale à la masse).',
        material: 'Céramique piézoélectrique, capot céramique, 3 terminaisons étamées',
        dimensions: '3,2 × 1,3 × 0,9 mm',
        reference: 'CSTCE16M0V53 (± 0,5 %, typique)',
        tip: 'Moins précis qu’un quartz, mais suffisant pour le 328P (la liaison série tolère ± 2 %).',
      },
      removal: smd('Chauffer les trois terminaisons à l’air chaud, puis soulever aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'r.mcu.1m',
      name: 'Résistance 1 MΩ du résonateur (R2)',
      block: 'mcu',
      refs: ['R2'],
      model: MODELS.r105,
      tags: ['component', 'smd'],
      info: {
        role: 'Polarise l’oscillateur du 328P en parallèle sur le résonateur.',
        material: 'Couche épaisse sur alumine',
        dimensions: '0603 : 1,6 × 0,8 × 0,45 mm',
        reference: '1 MΩ (code « 105 »)',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'c.mcu.100n',
      name: 'Condensateurs 100 nF du 328P (C4, C5, C6, C8)',
      block: 'mcu',
      refs: ['C4', 'C5', 'C6', 'C8'],
      labels: [
        'C4 — 100 nF (découplage VCC)',
        'C5 — 100 nF (liaison DTR → RESET)',
        'C6 — 100 nF (découplage AVCC)',
        'C8 — 100 nF (filtrage AREF)',
      ],
      model: MODELS.cX7R,
      tags: ['component', 'smd'],
      info: {
        role: 'Découplages du 328P (VCC, AVCC, AREF) et condensateur de liaison DTR → RESET (réinitialisation automatique au téléversement).',
        material: 'Céramique multicouche X7R',
        dimensions: '0603 : 1,6 × 0,8 × 0,8 mm',
        reference: '100 nF 50 V X7R',
        tip: 'C5 transforme le front du signal DTR en une brève impulsion de RESET.',
      },
      removal: smd('Chauffer chaque condensateur à l’air chaud puis le saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'rn1',
      name: 'Réseau de résistances 10 kΩ (RN1)',
      block: 'mcu',
      refs: ['RN1'],
      model: MODELS.rn103,
      tags: ['component', 'smd'],
      info: {
        role: 'Rappels au 5 V des broches RESET du 328P et du 16U2.',
        material: 'Quatre résistances à couche épaisse sur substrat commun',
        dimensions: '1206 (4 × 0603) : 3,2 × 1,6 × 0,5 mm',
        reference: '4 × 10 kΩ (code « 103 »)',
      },
      removal: smd('Chauffer les huit terminaisons à l’air chaud, puis soulever aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'rn4',
      name: 'Réseau de résistances 1 kΩ (RN4)',
      block: 'mcu',
      refs: ['RN4'],
      model: MODELS.rn102,
      tags: ['component', 'smd'],
      info: {
        role: 'Résistances série de la liaison série 16U2 ↔ 328P (TX/RX) : protègent en cas de conflit avec D0/D1.',
        material: 'Quatre résistances à couche épaisse sur substrat commun',
        dimensions: '1206 (4 × 0603) : 3,2 × 1,6 × 0,5 mm',
        reference: '4 × 1 kΩ (code « 102 »)',
      },
      removal: smd('Chauffer les huit terminaisons à l’air chaud, puis soulever aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'icsp',
      name: 'Connecteur ICSP du 328P (ICSP)',
      block: 'mcu',
      refs: ['ICSP'],
      model: MODELS.icsp,
      tags: ['component', 'tht'],
      info: {
        role: 'Programmation directe (SPI) du 328P, par exemple pour réécrire le chargeur d’amorçage.',
        material: 'Embase en PBT noir, broches carrées en laiton étamé',
        dimensions: '2 × 3 broches au pas de 2,54 mm, hauteur 8,5 mm',
        reference: 'Barrette mâle 2 × 3',
        tip: 'Ses broches MISO, SCK et MOSI sont reliées à D12, D13 et D11.',
      },
      removal: tht(
        'Chauffer chaque broche côté cuivre, aspirer l’étain à la pompe, puis extraire la barrette.',
        0.028,
      ),
      explode: up(0.018),
    }),
  ];
}

function uiParts(): Part[] {
  const sj: Part = {
    id: 'sj1',
    name: 'Pont de soudure RESET-EN (SJ1)',
    parent: BLOCK_PART.ui,
    tags: ['component', 'smd'],
    build: (ctx) => buildComponent(ctx, SOLDER_BRIDGE, [component('SJ1')]),
    info: {
      role: 'Relie le condensateur C5 (DTR) à la broche RESET : fermé, la carte se réinitialise automatiquement à chaque ouverture du port série.',
      material: 'Goutte d’étain sans plomb sur deux demi-pastilles',
      dimensions: 'Pastilles 0,6 × 1,0 mm séparées de 0,3 mm',
      tip: 'On l’ouvre à la tresse pour qu’une application garde la main sans réinitialisation ; une goutte de soudure le referme.',
    },
    explode: up(0.004),
    removal: {
      tool: 'desolder-braid',
      motion: 'desolder',
      axis: [0, 1, 0],
      distance: 0.006,
      gesture: 'Poser la tresse sur le pont et la chauffer au fer : l’étain est absorbé, le pont s’ouvre.',
    },
    label: { priority: 2 },
  };
  return [
    comp({
      id: 'led.yellow',
      name: 'LED jaunes L, TX, RX',
      block: 'ui',
      refs: ['LED3', 'LED1', 'LED2'],
      labels: ['LED « L » (D13)', 'LED « TX » (émission série)', 'LED « RX » (réception série)'],
      model: MODELS.ledY,
      tags: ['component', 'smd'],
      info: {
        role: 'Témoins : « L » suit la broche D13 (via U5B), TX et RX clignotent pendant les échanges USB-série.',
        material: 'Puce InGaAlP sur substrat, lentille époxy transparente, fil de liaison en or',
        dimensions: '0805 : 2,0 × 1,25 × 0,8 mm',
        reference: 'LED CMS jaune 0805, ≈ 2 V 2 mA (typique)',
        tip: 'Polarisées : la cathode est repérée par la barre de sérigraphie.',
      },
      removal: smd(
        'Chauffer à l’air chaud (buse fine, température modérée pour la lentille), puis saisir aux brucelles.',
        0.01,
      ),
      explode: up(0.006),
    }),
    comp({
      id: 'led.green',
      name: 'LED verte ON',
      block: 'ui',
      refs: ['ON'],
      model: MODELS.ledG,
      tags: ['component', 'smd'],
      info: {
        role: 'Témoin de présence du 5 V.',
        material: 'Puce InGaN/AlGaInP, lentille époxy transparente',
        dimensions: '0805 : 2,0 × 1,25 × 0,8 mm',
        reference: 'LED CMS verte 0805',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'r.ui.1k',
      name: 'Résistance 1 kΩ de la LED ON (R3)',
      block: 'ui',
      refs: ['R3'],
      model: MODELS.r102,
      tags: ['component', 'smd'],
      info: {
        role: 'Limite le courant de la LED ON à ≈ 3 mA.',
        material: 'Couche épaisse sur alumine',
        dimensions: '0603 : 1,6 × 0,8 × 0,45 mm',
        reference: '1 kΩ (code « 102 »)',
      },
      removal: smd('Chauffer à l’air chaud puis saisir aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    comp({
      id: 'rn2',
      name: 'Réseau de résistances 1 kΩ des LED (RN2)',
      block: 'ui',
      refs: ['RN2'],
      model: MODELS.rn102,
      tags: ['component', 'smd'],
      info: {
        role: 'Résistances de limitation des LED TX, RX et L.',
        material: 'Quatre résistances à couche épaisse sur substrat commun',
        dimensions: '1206 (4 × 0603) : 3,2 × 1,6 × 0,5 mm',
        reference: '4 × 1 kΩ (code « 102 »)',
      },
      removal: smd('Chauffer les huit terminaisons à l’air chaud, puis soulever aux brucelles.', 0.01),
      explode: up(0.006),
    }),
    ...buttonParts(BLOCK_PART.ui),
    sj,
  ];
}

function ioParts(): Part[] {
  const header = (
    id: string,
    ref: string,
    name: string,
    model: ComponentModel,
    role: string,
    pins: string,
  ): Part =>
    comp({
      id,
      name,
      block: 'io',
      refs: [ref],
      model,
      tags: ['component', 'tht'],
      info: {
        role,
        material: 'PBT noir (UL94 V-0), contacts à double lame en bronze phosphoreux étamé',
        dimensions: `${pins} au pas de 2,54 mm, hauteur 8,5 mm, queues carrées 0,64 mm`,
        reference: 'Barrette femelle droite traversante',
        tip: 'Pour la dessouder proprement, dégager l’étain broche par broche à la pompe, puis extraire en basculant doucement d’un bout à l’autre.',
      },
      removal: tht(
        'Chauffer chaque broche côté cuivre, aspirer l’étain à la pompe, puis extraire la barrette.',
        0.03,
      ),
      explode: up(0.02),
      labelPriority: 4,
    });
  return [
    header(
      'hdr.power',
      'POWER',
      'Barrette d’alimentation 1×8',
      MODELS.hdr8,
      'Distribue IOREF, RESET, 3,3 V, 5 V, GND et VIN aux cartes d’extension.',
      '8 contacts',
    ),
    header(
      'hdr.analog',
      'AD',
      'Barrette analogique 1×6 (A0–A5)',
      MODELS.hdr6,
      'Entrées analogiques A0–A5 du 328P (A4/A5 partagées avec SDA/SCL).',
      '6 contacts',
    ),
    header(
      'hdr.ioh',
      'IOH',
      'Barrette numérique 1×10 (D8–D13, AREF, I²C)',
      MODELS.hdr10,
      'D8–D13, GND, AREF et le bus I²C (SDA, SCL).',
      '10 contacts',
    ),
    header(
      'hdr.iol',
      'IOL',
      'Barrette numérique 1×8 (D0–D7)',
      MODELS.hdr8,
      'D0–D7, dont la liaison série D0/D1 partagée avec le 16U2.',
      '8 contacts',
    ),
  ];
}

/** Toutes les pièces de l'objet. */
export function allParts(): Part[] {
  return [
    ...pcbParts(),
    ...blocks(),
    ...powerParts(),
    ...usbParts(),
    ...mcuParts(),
    ...uiParts(),
    ...ioParts(),
  ];
}
