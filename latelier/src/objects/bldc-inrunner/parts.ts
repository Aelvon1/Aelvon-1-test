/**
 * Nomenclature du moteur : pièces, sous-ensembles, vue éclatée (axiale, hiérarchique) et
 * démontage (dépendances, mouvements, outils). Distances en mètres, directions dans le repère
 * du parent (les sous-ensembles ne sont jamais tournés : repère = moteur, axe X).
 */
import * as THREE from 'three/webgpu';
import type { PartBuild, PartDef, Vec3 } from '../types';
import { deriveDimensions, type BldcParams } from './params';
import { infos } from './infos';
import type { Ctx } from './build/common';
import { dims, group } from './build/common';
import { buildCan, buildCanDetail } from './build/can';
import {
  buildFrontBell,
  buildFrontBellDetail,
  buildRearBell,
  buildTabs,
  buildTerminalBlock,
} from './build/bells';
import {
  buildBalls,
  buildBearingNode,
  buildCage,
  buildInnerRing,
  buildOuterRing,
  buildShield,
} from './build/bearing';
import { buildMagnets, buildShaft, buildSleeve, buildYoke } from './build/rotor';
import {
  buildInsulators,
  buildLaminations,
  buildNeutral,
  buildPhase,
  buildPhaseDetail,
  buildVarnish,
} from './build/stator';
import {
  buildConnector,
  buildHallSensors,
  buildPcb,
  buildPcbScrews,
  buildSensorCable,
} from './build/sensors';
import { buildBullet, buildJoints, buildLeadWire, buildShrink } from './build/leads';
import { buildPinion, buildPinionDetail, buildSetScrew } from './build/pinion';
import {
  circlipGeometry,
  screwGeometry,
  screwMatrix,
  shimGeometry,
  waveWasherGeometry,
} from './build/fasteners';
import { instanced, mesh } from './build/common';

type Part = PartDef<BldcParams>;

const MMm = (v: number) => v / 1000;
const X_PLUS: Vec3 = [1, 0, 0];
const X_MINUS: Vec3 = [-1, 0, 0];
const Y_PLUS: Vec3 = [0, 1, 0];

/** Nœud de sous-ensemble sans géométrie propre, placé sur l'axe du moteur. */
const axisNode = (name: string) => (ctx: Ctx) => group(name, 0, dims(ctx).axisY, 0);

/** Vis de flasque (avant ou arrière), instanciées ×3 : pivot sur l'axe de chaque vis. */
function flangeScrews(ctx: Ctx, side: 1 | -1): PartBuild {
  const d = dims(ctx);
  const sc = d.screw;
  const geo = screwGeometry(ctx, `flange-${sc.name}`, {
    d: sc.d,
    pitch: sc.pitch,
    headD: sc.headD,
    headH: sc.headH,
    length: sc.length,
    keyS: sc.key,
  });
  const matrices = sc.angles.map((a, i) =>
    screwMatrix(side * d.half, sc.pcdR * Math.cos(a), sc.pcdR * Math.sin(a), side, 0.4 + i * 1.1),
  );
  const inst = instanced(
    geo,
    ctx.materials.get('steel.blackoxide'),
    matrices,
    side > 0 ? 'frontBell.screws' : 'rearBell.screws',
  );
  const o = group(side > 0 ? 'Vis de flasque avant' : 'Vis de flasque arrière');
  o.add(inst);
  return {
    object: o,
    instanced: inst,
    instanceLabel: (i) => `Vis ${sc.name} n° ${i + 1} (${Math.round((sc.angles[i]! * 180) / Math.PI)}°)`,
  };
}

/**
 * Sous-pièces d'un roulement (flasques, cage, bague extérieure, billes, bague intérieure).
 * Approximation : en réalité on regroupe les billes d'un côté pour décentrer la bague intérieure
 * et la sortir ; ici la bague extérieure est dégagée d'abord, puis les billes sont écartées.
 */
function bearingParts(
  id: 'rearBell.bearing' | 'frontBell.bearing',
  info: ReturnType<typeof infos>,
  s: number,
): Part[] {
  // Côté extérieur du moteur : +X pour le roulement avant, −X pour l'arrière.
  const out: 1 | -1 = id === 'frontBell.bearing' ? 1 : -1;
  const tags = ['bearingpart'];
  return [
    {
      id: `${id}.inner`,
      name: 'Bague intérieure',
      parent: id,
      material: 'steel.ground',
      build: buildInnerRing,
      info: info[`${id}.inner`]!,
      explode: { direction: [0, 0, 0], distance: 0 },
      label: { priority: 1 },
    },
    {
      id: `${id}.shieldOut`,
      name: 'Flasque de protection (côté extérieur)',
      parent: id,
      tags,
      material: 'steel.zinc',
      build: (ctx) => buildShield(ctx, out),
      info: info[`${id}.shieldOut`]!,
      explode: { direction: [out, 0, 0], distance: MMm(3 * s) },
      removal: {
        motion: 'lift',
        axis: [out, 0, 0],
        distance: MMm(8 * s),
        tool: 'screwdriver-precision',
        gesture:
          'Glisser la pointe sous la lèvre sertie et soulever la flasque (elle se déforme : non réutilisable).',
        destructive: true,
      },
    },
    {
      id: `${id}.shieldIn`,
      name: 'Flasque de protection (côté intérieur)',
      parent: id,
      tags,
      material: 'steel.zinc',
      build: (ctx) => buildShield(ctx, -out as 1 | -1),
      info: info[`${id}.shieldIn`]!,
      explode: { direction: [-out, 0, 0], distance: MMm(3 * s) },
      removal: {
        motion: 'lift',
        axis: [-out, 0, 0],
        distance: MMm(8 * s),
        tool: 'screwdriver-precision',
        gesture: 'Retourner le roulement et déposer la seconde flasque.',
        destructive: true,
      },
    },
    {
      id: `${id}.cage`,
      name: 'Cage à ruban',
      parent: id,
      tags,
      material: 'steel.zinc',
      build: buildCage,
      info: info[`${id}.cage`]!,
      explode: { direction: Y_PLUS, distance: MMm(7 * s) },
      removal: {
        requires: [`${id}.shieldOut`, `${id}.shieldIn`],
        motion: 'cut',
        axis: [out, 0, 0],
        distance: MMm(9 * s),
        tool: 'scalpel',
        destructive: true,
        gesture: 'Cisailler les rivets de la cage à ruban et retirer les deux demi-cages.',
      },
    },
    {
      id: `${id}.outer`,
      name: 'Bague extérieure',
      parent: id,
      tags,
      material: 'steel.ground',
      build: buildOuterRing,
      info: info[`${id}.outer`]!,
      explode: { direction: [0, 0, 0], distance: 0 },
      removal: {
        requires: [`${id}.cage`],
        motion: 'translate',
        axis: [-out, 0, 0],
        distance: MMm(9 * s),
        tool: 'hands',
        gesture:
          'Regrouper les billes d’un côté pour décentrer la bague intérieure, puis dégager la bague extérieure.',
      },
    },
    {
      id: `${id}.balls`,
      name: 'Billes',
      parent: id,
      tags,
      material: 'steel.chrome',
      quantity: (p) => deriveDimensions(p).bearing.ballCount,
      build: buildBalls,
      info: info[`${id}.balls`]!,
      explode: {
        direction: [0, 0, 0],
        distance: 0,
        spread: { mode: 'radial', axis: X_PLUS, distance: MMm(2.6 * s) },
      },
      removal: {
        requires: [`${id}.outer`],
        motion: 'spread',
        axis: Y_PLUS,
        distance: MMm(6 * s),
        spread: { mode: 'radial', axis: X_PLUS, distance: MMm(3.5 * s) },
        stagger: 0.12,
        tool: 'tweezers',
        gesture: 'Libérer les billes une à une à la brucelle.',
      },
      knolling: { layout: 'row' },
    },
  ];
}

export function bldcParts(p: BldcParams): Part[] {
  const d = deriveDimensions(p);
  const s = d.s;
  const info = infos(d);
  const sensors = (q: BldcParams) => q.sensors === true;
  const wires = (q: BldcParams) => q.leads === 'wires';
  const distributed = d.winding.spec.kind === 'distributed';
  const sc = d.screw;
  const screwTurns = Math.max(3, Math.round((sc.length - d.flangeT) / sc.pitch));

  const parts: Part[] = [
    // --- Carter (base) -----------------------------------------------------------------------
    {
      id: 'can',
      name: 'Carter',
      material: `alu.anodized.${p.anodize}`,
      build: buildCan,
      detail: { distance: 0.06, build: buildCanDetail },
      info: info.can!,
      explode: { direction: [0, 0, 0], distance: 0 },
      label: { priority: 10 },
    },

    // --- Pignon ------------------------------------------------------------------------------
    {
      id: 'pinion',
      name: 'Pignon',
      kind: 'assembly',
      material: 'steel.ground',
      build: buildPinion,
      detail: { distance: 0.05, build: buildPinionDetail },
      info: info.pinion!,
      explode: { direction: X_PLUS, distance: MMm(82 * s) },
      removal: {
        requires: ['pinion.setscrew'],
        motion: 'translate',
        axis: X_PLUS,
        distance: MMm(30 * s),
        tool: 'hands',
        gesture: 'Faire glisser le pignon hors de l’arbre.',
      },
      label: { priority: 7 },
    },
    {
      id: 'pinion.setscrew',
      name: 'Vis sans tête du pignon',
      parent: 'pinion',
      material: 'steel.blackoxide',
      build: buildSetScrew,
      info: info['pinion.setscrew']!,
      explode: { direction: Y_PLUS, distance: MMm(9 * s) },
      removal: {
        motion: 'unscrew',
        axis: Y_PLUS,
        turns: Math.max(3, Math.round(d.pinion.setScrewL / 0.5) + 1),
        pitch: 0.0005,
        distance: MMm(8),
        tool: 'hex-key-1.5',
        inPlace: true,
        gesture: 'Desserrer la vis sans tête (clé Allen 1,5 mm) jusqu’à libérer le méplat.',
      },
      label: { priority: 3 },
    },

    // --- Câble et platine capteurs --------------------------------------------------------------
    {
      id: 'sensorCable',
      name: 'Câble capteurs',
      enabled: sensors,
      material: 'silicone.black',
      build: buildSensorCable,
      info: info.sensorCable!,
      explode: { direction: X_MINUS, distance: MMm(118 * s) },
      removal: {
        motion: 'unclip',
        axis: X_MINUS,
        distance: MMm(14 * s),
        tool: 'hands',
        gesture: 'Appuyer sur le verrou et tirer la fiche dans l’axe (jamais par les fils).',
      },
      label: { priority: 4 },
    },
    {
      id: 'sensors',
      name: 'Platine capteurs',
      kind: 'assembly',
      enabled: sensors,
      build: axisNode('Platine capteurs'),
      info: info.sensors!,
      explode: { direction: X_MINUS, distance: MMm(100 * s) },
      removal: {
        requires: ['sensors.screws', 'sensorCable'],
        motion: 'translate',
        axis: X_MINUS,
        distance: MMm(16 * s),
        tool: 'hands',
        gesture: 'Sortir la platine de son logement en dégageant les capteurs de leurs fenêtres.',
      },
      label: { priority: 6 },
    },
    {
      id: 'sensors.pcb',
      name: 'Circuit imprimé capteurs',
      parent: 'sensors',
      enabled: sensors,
      material: 'fr4.core',
      build: buildPcb,
      info: info['sensors.pcb']!,
      explode: { direction: [0, 0, 0], distance: 0 },
    },
    {
      id: 'sensors.connector',
      name: 'Connecteur capteurs 6 points',
      parent: 'sensors',
      enabled: sensors,
      material: 'plastic.nylon',
      build: buildConnector,
      info: info['sensors.connector']!,
      explode: { direction: [0, 0, 0], distance: 0 },
    },
    {
      id: 'sensors.hall',
      name: 'Capteurs à effet Hall',
      parent: 'sensors',
      enabled: sensors,
      quantity: 3,
      material: 'epoxy.black',
      build: buildHallSensors,
      info: info['sensors.hall']!,
      explode: { direction: X_PLUS, distance: MMm(6 * s) },
      removal: {
        motion: 'desolder',
        axis: X_PLUS,
        distance: MMm(9 * s),
        tool: 'soldering-iron',
        stagger: 0.25,
        gesture: 'Dessouder les trois pattes (pompe ou tresse) et retirer le capteur.',
      },
      knolling: { layout: 'row' },
    },
    {
      id: 'sensors.screws',
      name: 'Vis de platine',
      parent: 'sensors',
      enabled: sensors,
      quantity: 2,
      material: 'steel.zinc',
      build: buildPcbScrews,
      info: info['sensors.screws']!,
      explode: { direction: X_MINUS, distance: MMm(8 * s) },
      removal: {
        motion: 'unscrew',
        axis: X_MINUS,
        turns: 6,
        pitch: 0.0004,
        distance: MMm(7),
        tool: 'screwdriver-precision',
        inPlace: true,
        gesture: 'Dévisser les deux vis cruciformes de la platine.',
      },
    },

    // --- Sorties de phase ----------------------------------------------------------------------
    {
      id: 'leads.joints',
      name: 'Soudures des sorties de phase',
      quantity: 3,
      material: 'solder',
      build: buildJoints,
      info: info['leads.joints']!,
      explode: { direction: [-1, 0.08, 0], distance: MMm(86 * s) },
      removal: {
        motion: 'desolder',
        axis: Y_PLUS,
        distance: MMm(4 * s),
        tool: 'soldering-iron',
        stagger: 0.3,
        after: 'hide',
        gesture: 'Chauffer chaque languette et aspirer l’étain (pompe à dessouder).',
      },
    },
    ...([0, 1, 2] as const).flatMap((k): Part[] => {
      const id = `lead.${'abc'[k]}`;
      return [
        {
          id,
          name: `Fil de phase ${'ABC'[k]}`,
          kind: 'assembly',
          enabled: wires,
          tags: ['leadwire'],
          material: `silicone.${['yellow', 'red', 'blue'][k]}`,
          build: (ctx) => buildLeadWire(ctx, k),
          info: info[id]!,
          explode: { direction: [-1, 0.05, 0.12], distance: MMm(95 * s) },
          removal: {
            requires: ['leads.joints'],
            motion: 'translate',
            axis: X_MINUS,
            distance: MMm(25 * s),
            tool: 'hands',
            gesture: 'Dégager le fil de la languette une fois l’étain retiré.',
          },
          label: { priority: 2 },
        },
        {
          id: `${id}.bullet`,
          name: `Bullet 4 mm (phase ${'ABC'[k]})`,
          parent: id,
          enabled: wires,
          material: 'brass',
          build: (ctx) => buildBullet(ctx, k),
          info: info[`${id}.bullet`]!,
          explode: { direction: X_MINUS, distance: MMm(6 * s) },
        },
        {
          id: `${id}.shrink`,
          name: `Gaine thermo (phase ${'ABC'[k]})`,
          parent: id,
          enabled: wires,
          material: `heatshrink.${['yellow', 'red', 'blue'][k]}`,
          build: (ctx) => buildShrink(ctx, k),
          info: info[`${id}.shrink`]!,
          explode: { direction: [0, 0, 0], distance: 0 },
        },
      ];
    }),

    // --- Flasque arrière -----------------------------------------------------------------------
    {
      id: 'rearBell',
      name: 'Flasque arrière',
      kind: 'assembly',
      material: `alu.anodized.${p.anodize}`,
      build: buildRearBell,
      info: info.rearBell!,
      explode: { direction: X_MINUS, distance: MMm(86 * s) },
      removal: {
        requires: [
          'rearBell.screws',
          'leads.joints',
          ...(p.leads === 'wires' ? ['#leadwire'] : []),
          'sensors',
        ],
        motion: 'translate',
        axis: X_MINUS,
        distance: MMm(24 * s),
        tool: 'hands',
        gesture: 'Retirer la flasque dans l’axe ; le roulement arrière glisse sur l’arbre.',
      },
      label: { priority: 8 },
    },
    {
      id: 'rearBell.screws',
      name: 'Vis de flasque arrière',
      parent: 'rearBell',
      quantity: 3,
      material: 'steel.blackoxide',
      build: (ctx) => flangeScrews(ctx, -1),
      info: info['rearBell.screws']!,
      explode: { direction: X_MINUS, distance: MMm(12 * s) },
      removal: {
        motion: 'unscrew',
        axis: X_MINUS,
        turns: screwTurns,
        pitch: sc.pitch / 1000,
        distance: MMm(sc.length + 4),
        tool: sc.tool,
        inPlace: true,
        stagger: 0.15,
        gesture: `Dévisser les trois vis ${sc.name} (clé Allen ${sc.key.toString().replace('.', ',')} mm), en croix.`,
      },
      knolling: { layout: 'row' },
    },
    {
      id: 'rearBell.block',
      name: 'Bornier des sorties',
      parent: 'rearBell',
      material: 'plastic.pbt.black',
      build: buildTerminalBlock,
      info: info['rearBell.block']!,
      explode: { direction: [0, 0, 0], distance: 0 },
    },
    {
      id: 'rearBell.tabs',
      name: 'Languettes A, B, C',
      parent: 'rearBell',
      quantity: 3,
      material: 'tin',
      build: buildTabs,
      info: info['rearBell.tabs']!,
      explode: { direction: [0, 0, 0], distance: 0 },
    },
    {
      id: 'rearBell.bearing',
      name: 'Roulement arrière',
      parent: 'rearBell',
      kind: 'assembly',
      build: (ctx) => buildBearingNode(ctx, 'rear'),
      info: info['rearBell.bearing']!,
      explode: { direction: X_PLUS, distance: MMm(10 * s) },
      removal: {
        motion: 'pressOut',
        axis: X_PLUS,
        distance: MMm(10 * s),
        tool: 'bearing-puller',
        gesture: 'Extraire le roulement de sa portée (extracteur en appui sur la bague extérieure).',
      },
      label: { priority: 5 },
    },
    ...bearingParts('rearBell.bearing', info, s),

    // --- Calage arrière sur l'arbre ---------------------------------------------------------
    {
      id: 'waveWasher',
      name: 'Rondelle ondulée de précharge',
      material: 'steel.spring',
      build: (ctx) => {
        const o = group('Rondelle ondulée', dims(ctx).wave.x, dims(ctx).axisY, 0);
        o.add(mesh(waveWasherGeometry(ctx), ctx.materials.get('steel.spring'), 'waveWasher'));
        return o;
      },
      info: info.waveWasher!,
      explode: { direction: [-0.45, 1, 0], distance: MMm(30 * s) },
      removal: {
        requires: ['rearBell'],
        motion: 'translate',
        axis: X_MINUS,
        distance: MMm(12 * s),
        tool: 'tweezers',
        gesture: 'Retirer la rondelle ondulée du bout de l’arbre.',
      },
    },
    {
      id: 'shims',
      name: 'Cales de réglage',
      quantity: 2,
      material: 'steel.stainless',
      build: (ctx): PartBuild => {
        const dd = dims(ctx);
        const matrices = dd.shims.x.map((x) => new THREE.Matrix4().makeTranslation(x / 1000, 0, 0));
        const inst = instanced(shimGeometry(ctx), ctx.materials.get('steel.stainless'), matrices, 'shims');
        const o = group('Cales', 0, dd.axisY, 0);
        o.add(inst);
        return {
          object: o,
          instanced: inst,
          instanceLabel: (i) => `Cale n° ${i + 1} (${dd.shims.t.toString().replace('.', ',')} mm)`,
        };
      },
      info: info.shims!,
      explode: {
        direction: [-0.45, 1, 0],
        distance: MMm(35 * s),
        spread: { mode: 'linear', step: [-0.0012, 0, 0] },
      },
      removal: {
        requires: ['waveWasher'],
        motion: 'translate',
        axis: X_MINUS,
        distance: MMm(12 * s),
        tool: 'tweezers',
        stagger: 0.3,
        gesture: 'Retirer les cales en notant leur nombre.',
      },
      knolling: { layout: 'stack' },
    },
    {
      id: 'circlip',
      name: 'Circlip',
      material: 'steel.spring',
      build: (ctx) => {
        const o = group('Circlip', dims(ctx).circlip.x, dims(ctx).axisY, 0);
        o.add(mesh(circlipGeometry(ctx), ctx.materials.get('steel.spring'), 'circlip'));
        return o;
      },
      info: info.circlip!,
      explode: { direction: [-0.45, 1, 0], distance: MMm(40 * s) },
      removal: {
        requires: ['shims'],
        motion: 'lift',
        axis: X_MINUS,
        distance: MMm(14 * s),
        tool: 'pliers-circlip',
        gesture: 'Ouvrir le circlip à la pince (becs dans les oreilles) et le dégager de sa gorge.',
      },
    },

    // --- Rotor --------------------------------------------------------------------------------
    {
      id: 'rotor',
      name: 'Rotor',
      kind: 'assembly',
      build: axisNode('Rotor'),
      info: info.rotor!,
      explode: { direction: X_PLUS, distance: MMm(40 * s) },
      removal: {
        requires: ['circlip', 'pinion'],
        motion: 'magneticPull',
        axis: X_MINUS,
        distance: MMm(d.shaftX1 - d.shaftX0 + 22),
        tool: 'hands',
        gesture: 'Tirer le rotor vers l’arrière, dans l’axe : forte attraction des aimants, puis décrochage.',
      },
      label: { priority: 9 },
    },
    {
      id: 'rotor.yoke',
      name: 'Culasse rotorique',
      parent: 'rotor',
      material: 'steel.stainless',
      build: buildYoke,
      info: info['rotor.yoke']!,
      explode: { direction: [0, 0, 0], distance: 0 },
    },
    {
      id: 'rotor.shaft',
      name: 'Arbre',
      parent: 'rotor',
      material: 'steel.ground',
      build: buildShaft,
      info: info['rotor.shaft']!,
      explode: { direction: [0, 0, 0], distance: 0 },
      removal: {
        requires: ['rotor.magnets'],
        motion: 'pressOut',
        axis: X_PLUS,
        distance: MMm(d.shaftX1 - d.yokeX0 + 6),
        tool: 'arbor-press',
        gesture: 'Chasser l’arbre hors de la culasse à la presse (culasse en appui sur un support).',
      },
      label: { priority: 4 },
    },
    {
      id: 'rotor.magnets',
      name: 'Aimants néodyme',
      parent: 'rotor',
      quantity: (q) => deriveDimensions(q).winding.spec.poles,
      material: 'nickel',
      build: buildMagnets,
      info: info['rotor.magnets']!,
      explode: {
        direction: [0, 0, 0],
        distance: 0,
        spread: { mode: 'radial', axis: X_PLUS, distance: MMm(3.5 * s) },
      },
      removal: {
        requires: ['rotor.sleeve'],
        motion: 'spread',
        axis: Y_PLUS,
        distance: MMm(10 * s),
        spread: { mode: 'radial', axis: X_PLUS, distance: MMm(6 * s) },
        stagger: 0.15,
        tool: 'spudger',
        destructive: true,
        gesture: 'Casser le joint de colle au levier et décoller les aimants un à un (collés : destructif).',
      },
      knolling: { layout: 'row' },
      label: { priority: 6 },
    },
    {
      id: 'rotor.sleeve',
      name: 'Frette en fibre',
      parent: 'rotor',
      material: 'bldc-inrunner/sleeveWeave',
      build: buildSleeve,
      info: info['rotor.sleeve']!,
      explode: { direction: Y_PLUS, distance: MMm(18 * s) },
      removal: {
        motion: 'peel',
        axis: Y_PLUS,
        distance: MMm(16 * s),
        tool: 'scalpel',
        destructive: true,
        gesture: 'Inciser la frette dans sa longueur au scalpel et la peler (destructif).',
      },
      label: { priority: 5 },
    },

    // --- Flasque avant -------------------------------------------------------------------------
    {
      id: 'frontBell',
      name: 'Flasque avant',
      kind: 'assembly',
      material: `alu.anodized.${p.anodize}`,
      build: buildFrontBell,
      detail: { distance: 0.05, build: buildFrontBellDetail },
      info: info.frontBell!,
      explode: { direction: X_PLUS, distance: MMm(55 * s) },
      removal: {
        requires: ['frontBell.screws', 'rotor'],
        motion: 'translate',
        axis: X_PLUS,
        distance: MMm(22 * s),
        tool: 'hands',
        gesture: 'Retirer la flasque avant avec son roulement.',
      },
      label: { priority: 8 },
    },
    {
      id: 'frontBell.screws',
      name: 'Vis de flasque avant',
      parent: 'frontBell',
      quantity: 3,
      material: 'steel.blackoxide',
      build: (ctx) => flangeScrews(ctx, 1),
      info: info['frontBell.screws']!,
      explode: { direction: X_PLUS, distance: MMm(12 * s) },
      removal: {
        motion: 'unscrew',
        axis: X_PLUS,
        turns: screwTurns,
        pitch: sc.pitch / 1000,
        distance: MMm(sc.length + 4),
        tool: sc.tool,
        inPlace: true,
        stagger: 0.15,
        gesture: `Dévisser les trois vis ${sc.name} de la flasque avant, en croix.`,
      },
      knolling: { layout: 'row' },
    },
    {
      id: 'frontBell.bearing',
      name: 'Roulement avant',
      parent: 'frontBell',
      kind: 'assembly',
      build: (ctx) => buildBearingNode(ctx, 'front'),
      info: info['frontBell.bearing']!,
      explode: { direction: X_MINUS, distance: MMm(10 * s) },
      removal: {
        motion: 'pressOut',
        axis: X_MINUS,
        distance: MMm(10 * s),
        tool: 'bearing-puller',
        gesture: 'Extraire le roulement avant de sa portée.',
      },
      label: { priority: 5 },
    },
    ...bearingParts('frontBell.bearing', info, s),

    // --- Stator --------------------------------------------------------------------------------
    {
      id: 'stator',
      name: 'Stator',
      kind: 'assembly',
      build: axisNode('Stator'),
      info: info.stator!,
      explode: { direction: X_MINUS, distance: MMm(52 * s) },
      removal: {
        requires: ['rotor', 'frontBell'],
        motion: 'pressOut',
        axis: X_MINUS,
        distance: MMm(d.length + 18),
        tool: 'arbor-press',
        destructive: true,
        gesture:
          'Presser le paquet de tôles hors du carter (collé et emmanché : destructif), en appui sur les tôles.',
      },
      label: { priority: 9 },
    },
    {
      id: 'stator.varnish',
      name: 'Vernis d’imprégnation',
      parent: 'stator',
      material: 'bldc-inrunner/varnishShell',
      build: buildVarnish,
      info: info['stator.varnish']!,
      explode: { direction: [0, 0, 0], distance: 0 },
      removal: {
        motion: 'peel',
        axis: Y_PLUS,
        distance: MMm(14 * s),
        tool: 'scalpel',
        destructive: true,
        gesture: 'Gratter et peler la coque de vernis des têtes de bobines (destructif).',
      },
      knolling: { exclude: true },
    },
    {
      id: 'stator.neutral',
      name: 'Point neutre',
      parent: 'stator',
      material: 'solder',
      build: buildNeutral,
      info: info['stator.neutral']!,
      explode: { direction: [0, 0, 0], distance: 0 },
      removal: {
        requires: ['stator.varnish'],
        motion: 'cut',
        axis: Y_PLUS,
        distance: MMm(10 * s),
        tool: 'cutter-flush',
        destructive: true,
        gesture: 'Couper l’épissure du point neutre pour séparer les trois phases.',
      },
    },
    ...([2, 1, 0] as const).map((k): Part => ({
      id: `stator.phase${'ABC'[k]}`,
      name: `Phase ${'ABC'[k]}`,
      parent: 'stator',
      tags: ['phase'],
      material: 'copper.enamel',
      build: (ctx) => buildPhase(ctx, k),
      detail: { distance: 0.12, build: (ctx) => buildPhaseDetail(ctx, k), replaces: ['conductors'] },
      info: info[`stator.phase${'ABC'[k]}`]!,
      explode: { direction: [0, 0, 0], distance: 0 },
      removal: {
        // Bobinage réparti : la dernière phase bobinée (C) recouvre les autres.
        requires:
          distributed && k < 2 ? ['stator.neutral', `stator.phase${'ABC'[k + 1]}`] : ['stator.neutral'],
        motion: 'unwind',
        axis: Y_PLUS,
        distance: MMm(30 * s),
        tool: 'hands',
        after: 'park',
        gesture: `Débobiner la phase ${'ABC'[k]} depuis le point neutre, spire par spire.`,
      },
      label: { priority: 6 },
    })),
    {
      id: 'stator.insulators',
      name: 'Isolants d’encoche',
      parent: 'stator',
      quantity: d.stator.slots,
      material: 'paper.insulation',
      build: buildInsulators,
      info: info['stator.insulators']!,
      explode: { direction: [0, 0, 0], distance: 0 },
      removal: {
        requires: ['#phase'],
        motion: 'translate',
        axis: X_PLUS,
        distance: MMm(d.stator.stackLength + 8),
        tool: 'tweezers',
        stagger: 0.08,
        gesture: 'Faire glisser les isolants hors des encoches.',
      },
      knolling: { layout: 'row' },
    },
    {
      id: 'stator.core',
      name: 'Paquet de tôles',
      parent: 'stator',
      quantity: d.stator.lamCount,
      material: 'steel.electrical',
      build: buildLaminations,
      info: info['stator.core']!,
      explode: { direction: [0, 0, 0], distance: 0 },
      removal: {
        requires: ['stator.insulators'],
        motion: 'spread',
        axis: Y_PLUS,
        distance: MMm(4 * s),
        spread: { mode: 'linear', step: [MMm((95 * s) / d.stator.lamCount), 0, 0] },
        stagger: Math.min(0.02, 0.8 / d.stator.lamCount),
        tool: 'hands',
        gesture: 'Séparer le paquet en tôles individuelles (vernis de collage cassé à la lame).',
      },
      knolling: { layout: 'stack' },
      label: { priority: 7 },
    },
  ];
  return DEV_DETAIL ? parts.map(withDetail) : parts;
}

// TEMPORAIRE (mise au point, à retirer) : `?bldcdetail=1` construit aussi les détails dans le banc.
const DEV_DETAIL =
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('bldcdetail');
function withDetail(part: Part): Part {
  const build = part.build;
  const detail = part.detail;
  if (!build || !detail) return part;
  return {
    ...part,
    build: (ctx) => {
      const r = build(ctx);
      const obj = (r as THREE.Object3D).isObject3D ? (r as THREE.Object3D) : (r as PartBuild).object;
      obj.traverse((o) => {
        if (detail.replaces?.includes(o.name)) o.visible = false;
      });
      obj.add(detail.build(ctx));
      return r;
    },
  };
}
