/**
 * Bouton RESET tactile CMS 6 × 3,5 mm (SW1) — niveau 3 : intérieur.
 *
 * Pièces (enfants du sous-ensemble « sw1 », repère local : X selon la longueur, bornes en
 * x = ±3,95 mm, Y vers le haut) :
 * - capot en acier inoxydable (ouverture du poussoir, deux pattes rabattues sur les grands
 *   côtés de l'embase) : déclipsé au tournevis de précision ;
 * - poussoir en polyamide : tête dépassant du capot, collerette retenue sous le capot, téton
 *   qui appuie au centre du dôme ;
 * - dôme de contact en inox (calotte sphérique) posé sur les deux contacts périphériques ;
 * - embase (base du composant) : boîtier moulé à logement, contacts argentés surmoulés au fond
 *   du logement (central et périphériques), deux bornes en aile de mouette.
 *
 * Principe : borne 1 (−X, RESET) = contacts périphériques, sur lesquels repose le bord du dôme ;
 * borne 2 (+X, masse) = contact central. L'appui fait basculer le dôme, dont le centre vient
 * toucher le contact central : RESET est relié à la masse.
 *
 * Approximation : dôme rond de Ø 2,6 mm (certains modèles de cette taille utilisent un dôme
 * oblong) ; liaisons internes contacts → bornes noyées dans l'embase, non représentées.
 */
import type * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { L_SMD_SEAT, MM } from '../constants';
import { FOOTPRINTS } from '../footprints';
import { own, type UnoParams } from '../params';
import { padFrame } from '../packages/chips';
import { filletPath, lathe, roundedBox, sweepStrip, type P2 } from '../packages/geometry';
import { perforatedBlock, rrect } from '../packages/headers';
import { mergeAll } from './geometry';
import { innerPart } from './frame';
import { INT } from './materials';

/** Cotes (mm, repère du composant ; origine sur le cuivre supérieur). */
export const SW = {
  /** Dessous de l'embase (sur les bornes brasées). */
  y0: L_SMD_SEAT / MM + 0.05,
  /** Embase 6,0 × 3,5 × 1,9 mm. */
  body: { w: 6.0, d: 3.5, h: 1.9 },
  /** Logement du mécanisme (vu de dessus) et profondeur. */
  cavity: { w: 3.9, d: 2.7, r: 0.5, depth: 1.15 },
  /** Capot : 6,1 × 3,6 mm, épaisseur 0,22 mm, ouverture 2,9 × 1,7 mm. */
  cover: { w: 6.1, d: 3.6, t: 0.22, hole: [2.9, 1.7] as const },
  /** Dôme : rayon du bord, flèche, épaisseur. */
  dome: { r: 1.3, h: 0.22, t: 0.05 },
  /** Poussoir : tête, collerette, téton. */
  plunger: { head: [2.6, 1.4] as const, flange: [3.6, 2.4] as const, flangeT: 0.28, nub: 0.9 },
} as const;

const BODY_TOP = SW.y0 + SW.body.h;
/** Fond du logement. */
export const FLOOR = BODY_TOP - SW.cavity.depth;
/** Dessus des contacts argentés (le bord du dôme y repose). */
const CONTACT_TOP = FLOOR + 0.02;
const COVER_Y0 = BODY_TOP - 0.02;
/** Sommet extérieur du dôme. */
export const DOME_TOP = CONTACT_TOP + SW.dome.h + SW.dome.t;
/** Sommet de la tête du poussoir (0,95 mm au-dessus de l'embase). */
export const PLUNGER_TOP = BODY_TOP + 0.95;

/** Embase : semelle pleine surmontée d'une couronne formant le logement. */
function housingGeometry(): THREE.BufferGeometry {
  const outer = rrect(SW.body.w * MM, SW.body.d * MM, 0.2 * MM);
  const plate = perforatedBlock(outer, [], SW.y0 * MM, (FLOOR - SW.y0 + 0.01) * MM, 0.05 * MM);
  const ring = perforatedBlock(
    outer,
    [rrect(SW.cavity.w * MM, SW.cavity.d * MM, SW.cavity.r * MM)],
    FLOOR * MM,
    (BODY_TOP - FLOOR) * MM,
    0.04 * MM,
  );
  return mergeAll([plate, ring]);
}

/** Contacts argentés affleurant au fond du logement : central (borne 2), périphériques (borne 1). */
function contactsGeometry(): THREE.BufferGeometry {
  const t = CONTACT_TOP - FLOOR + 0.01;
  const center = roundedBox(1.0 * MM, 1.0 * MM, t * MM, {
    r: 0.49 * MM,
    rt: 0.008 * MM,
    rb: 0.004 * MM,
    y0: (FLOOR - 0.01) * MM,
    segs: 5,
  });
  const outer = [-1, 1].map((s) =>
    roundedBox(0.5 * MM, 1.3 * MM, t * MM, {
      r: 0.15 * MM,
      rt: 0.008 * MM,
      rb: 0.004 * MM,
      y0: (FLOOR - 0.01) * MM,
    }).translate(s * 1.25 * MM, 0, 0),
  );
  return mergeAll([center, ...outer]);
}

/** Borne en aile de mouette (repère pastille : X vers l'extérieur, bord du corps à −0,95 mm). */
function terminalGeometry(): THREE.BufferGeometry {
  const t = 0.2;
  const pts: P2[] = [
    [-1.3 * MM, 0.55 * MM],
    [-0.85 * MM, 0.55 * MM],
    [-0.45 * MM, (t / 2) * MM],
    [0.55 * MM, (t / 2) * MM],
  ];
  return sweepStrip(filletPath(pts, 0.2 * MM, 6), t * MM, () => 1.0 * MM, {
    cornerR: 0.05 * MM,
    segs: 2,
  }).translate(0, L_SMD_SEAT, 0);
}

/**
 * Dôme : calotte sphérique mince (profil fermé : face intérieure du sommet vers le bord, tranche,
 * face extérieure du bord vers le sommet).
 */
export function domeGeometry(): THREE.BufferGeometry {
  const { r: R, h, t } = SW.dome;
  const rho = (R * R + h * h) / (2 * h);
  const phiMax = Math.asin(R / rho);
  const n = 12;
  const inner: P2[] = [];
  const outer: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const phi = (k / n) * phiMax;
    const r = rho * Math.sin(phi);
    const y = CONTACT_TOP + h - rho * (1 - Math.cos(phi));
    inner.push([Math.max(0.001, r), y]);
    // Face extérieure : décalée de t selon la normale de la calotte.
    outer.push([Math.max(0.001, r + t * Math.sin(phi)), y + t * Math.cos(phi)]);
  }
  const profile: P2[] = [...inner, ...outer.reverse()];
  return lathe(
    profile.map(([r, y]) => [r * MM, y * MM] as P2),
    40,
  );
}

/** Poussoir : tête oblongue, collerette sous le capot, téton d'appui sur le dôme. */
function plungerGeometry(): THREE.BufferGeometry {
  const p = SW.plunger;
  const flangeTop = COVER_Y0;
  const flangeBottom = flangeTop - p.flangeT;
  const head = roundedBox(p.head[0] * MM, p.head[1] * MM, (PLUNGER_TOP - flangeTop + 0.01) * MM, {
    r: 0.5 * MM,
    rt: 0.35 * MM,
    rb: 0.02 * MM,
    y0: (flangeTop - 0.01) * MM,
  });
  const flange = roundedBox(p.flange[0] * MM, p.flange[1] * MM, p.flangeT * MM, {
    r: 0.45 * MM,
    rt: 0.04 * MM,
    rb: 0.06 * MM,
    y0: flangeBottom * MM,
  });
  const nubBottom = DOME_TOP + 0.01;
  const nub = roundedBox(p.nub * MM, p.nub * MM, (flangeBottom - nubBottom + 0.01) * MM, {
    r: (p.nub / 2 - 0.01) * MM,
    rt: 0.02 * MM,
    rb: 0.12 * MM,
    y0: nubBottom * MM,
    segs: 5,
  });
  return mergeAll([head, flange, nub]);
}

/** Capot : tôle percée ; pattes rabattues le long des grands côtés. */
function coverGeometry(): THREE.BufferGeometry {
  const plate = perforatedBlock(
    rrect(SW.cover.w * MM, SW.cover.d * MM, 0.25 * MM),
    [rrect(SW.cover.hole[0] * MM, SW.cover.hole[1] * MM, 0.4 * MM)],
    COVER_Y0 * MM,
    SW.cover.t * MM,
    0.05 * MM,
  );
  const tabs = [-1, 1].map((s) =>
    roundedBox(1.2 * MM, 0.2 * MM, 1.3 * MM, {
      r: 0.05 * MM,
      rt: 0.05 * MM,
      y0: (BODY_TOP - 1.3) * MM,
    }).translate(0, 0, s * 1.82 * MM),
  );
  return mergeAll([plate, ...tabs]);
}

const PARENT = 'sw1';
const REF = 'SW1';

export function buttonInternalParts(): PartDef<UnoParams>[] {
  const terminals = FOOTPRINTS['SW6x3.5'].pads.map((p) => padFrame(p));
  const coverTop = COVER_Y0 + SW.cover.t;
  return [
    innerPart({
      id: 'sw1.base',
      name: 'Embase à contacts du bouton (SW1)',
      parent: PARENT,
      ref: REF,
      material: 'plastic.black',
      meshes: () => [
        {
          name: 'embase',
          key: 'sw.int.housing',
          geometry: housingGeometry,
          material: (ctx) => ctx.materials.get('plastic.black'),
        },
        {
          name: 'contacts fixes',
          key: 'sw.int.contacts',
          geometry: contactsGeometry,
          material: (ctx) => own(ctx, `${INT}silver`),
        },
        {
          name: 'bornes',
          key: 'sw.int.term',
          geometry: terminalGeometry,
          material: (ctx) => ctx.materials.get('tin'),
          locals: terminals,
        },
      ],
      options: { anchor: [0, FLOOR * MM, 0] },
      info: {
        role: 'Socle du mécanisme : au fond de son logement affleurent les contacts fixes, reliés chacun à une borne ; c’est ce qui reste une fois le bouton démonté.',
        material:
          'Polyamide PA46 ou polymère à cristaux liquides noir (typique), surmoulé sur une grille en laiton argenté ; bornes étamées',
        dimensions: '6,0 × 3,5 × 1,9 mm ; logement 3,9 × 2,7 × 1,15 mm ; contact central Ø 1,0 mm (typique)',
        tip: 'Contacts périphériques = borne 1 (RESET), contact central = borne 2 (masse). Un bouton qui « rebondit » donne plusieurs impulsions en quelques millisecondes : sur la broche RESET, le condensateur et la résistance de rappel les absorbent.',
        extra: [{ label: 'Isolement', value: '≥ 100 MΩ sous 100 V entre bornes (typique)' }],
      },
      explode: { direction: [0, 1, 0], distance: 0 },
      labelPriority: 2,
    }),
    innerPart({
      id: 'sw1.dome',
      name: 'Dôme de contact inox (SW1)',
      parent: PARENT,
      ref: REF,
      material: 'steel.stainless',
      meshes: () => [
        {
          name: 'dôme',
          key: 'sw.int.dome',
          geometry: domeGeometry,
          material: (ctx) => ctx.materials.get('steel.stainless'),
        },
      ],
      options: { pivot: [0, CONTACT_TOP * MM, 0], anchor: [0, DOME_TOP * MM, 0] },
      info: {
        role: 'Ressort et contact mobile à la fois : sous ≈ 1,6 N il s’effondre d’un coup (le « clic » ressenti), son centre touche le contact central et relie RESET à la masse ; relâché, il reprend sa forme et ouvre le contact.',
        material: 'Acier inoxydable écroui (type 301), 0,05 mm (typique), parfois argenté',
        dimensions: 'Ø 2,6 mm, flèche 0,22 mm, épaisseur 0,05 mm (typique)',
        tip: 'Durée de vie ≈ 100 000 appuis (typique) : un bouton qui ne « claque » plus ou ne conduit plus qu’en appuyant fort a un dôme fatigué ou oxydé.',
        extra: [{ label: 'Course', value: '≈ 0,25 mm (typique)' }],
      },
      removal: {
        requires: ['sw1.plunger'],
        tool: 'tweezers',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.006,
        gesture: 'Saisir le dôme par son bord aux brucelles et le sortir du logement sans le plier.',
      },
      explode: { direction: [0, 1, 0], distance: 0.003 },
      labelPriority: 5,
    }),
    innerPart({
      id: 'sw1.plunger',
      name: 'Poussoir du bouton (SW1)',
      parent: PARENT,
      ref: REF,
      material: 'plastic.nylon',
      meshes: () => [
        {
          name: 'poussoir',
          key: 'sw.int.plunger',
          geometry: plungerGeometry,
          material: (ctx) => ctx.materials.get('plastic.nylon'),
        },
      ],
      options: { pivot: [0, DOME_TOP * MM, 0], anchor: [0, PLUNGER_TOP * MM, 0] },
      info: {
        role: 'Transmet l’appui du doigt au centre du dôme ; sa collerette, plus large que l’ouverture du capot, le retient dans le logement.',
        material: 'Polyamide (PA66) naturel (typique)',
        dimensions:
          'Tête 2,6 × 1,4 mm dépassant de 0,95 mm ; collerette 3,6 × 2,4 × 0,28 mm ; téton Ø 0,9 mm',
        tip: 'Le téton concentre l’effort au centre exact du dôme : décentré, le dôme bascule sans claquer et le contact devient incertain.',
      },
      removal: {
        requires: ['sw1.cover'],
        tool: 'tweezers',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.007,
        gesture: 'Saisir le poussoir par sa tête aux brucelles et le sortir du logement.',
      },
      explode: { direction: [0, 1, 0], distance: 0.006 },
      labelPriority: 4,
    }),
    innerPart({
      id: 'sw1.cover',
      name: 'Capot métallique du bouton (SW1)',
      parent: PARENT,
      ref: REF,
      material: 'steel.stainless',
      meshes: () => [
        {
          name: 'capot',
          key: 'sw.int.cover',
          geometry: coverGeometry,
          material: (ctx) => ctx.materials.get('steel.stainless'),
        },
      ],
      // Pivot sur l'arête supérieure du côté +Z : le levier soulève d'abord le côté −Z.
      options: { pivot: [0, coverTop * MM, 1.92 * MM], anchor: [0, (BODY_TOP - 0.6) * MM, -1.95 * MM] },
      info: {
        role: 'Ferme le logement : il retient le poussoir par sa collerette et plaque le dôme sur ses contacts ; ses deux pattes rabattues l’agrafent sur l’embase.',
        material: 'Acier inoxydable de 0,2 mm, découpé et embouti (typique)',
        dimensions: '6,1 × 3,6 mm ; ouverture 2,9 × 1,7 mm ; pattes 1,2 × 1,3 mm',
        tip: 'Au remontage, rabattre les pattes à la pince plate : un capot mal agrafé laisse jouer le poussoir et le bouton ne « clique » plus franchement.',
      },
      removal: {
        tool: 'screwdriver-precision',
        motion: 'unclip',
        axis: [0, 1, 0],
        distance: 0.007,
        gesture:
          'Glisser la lame d’un tournevis de précision sous une patte du capot, l’écarter, puis soulever le capot.',
      },
      explode: { direction: [0, 1, 0], distance: 0.009 },
      labelPriority: 4,
    }),
  ];
}

/** Repères utiles aux tests (mm). */
export const SW_LEVELS = {
  floor: FLOOR,
  contactTop: CONTACT_TOP,
  coverY0: COVER_Y0,
  bodyTop: BODY_TOP,
} as const;
