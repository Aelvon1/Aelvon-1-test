/**
 * Quartz 16 MHz HC-49/S (Y1) — niveau 3 : intérieur.
 *
 * Pièces (enfants du sous-ensemble « y1 », repère local : X selon la longueur, fils en
 * x = ±2,44 mm, Y vers le haut) :
 * - capot embouti en acier nickelé, soudé par résistance sur la collerette de l'embase (retrait
 *   DESTRUCTIF), marqué sur le dessus ; enceinte remplie d'azote sec ;
 * - lame de quartz taillée AT, 16 MHz en mode fondamental : épaisseur = 1,661 mm·MHz / f
 *   ≈ 0,104 mm ; électrodes d'argent déposées sous vide sur les deux faces, chacune prolongée
 *   par une languette vers « son » support ;
 * - deux supports-ressorts (fourches) soudés au sommet des fils, la lame collée entre leurs
 *   branches à la colle conductrice ;
 * - embase (base du composant) : collerette et bossage en acier nickelé, traversées verre-métal
 *   (perles de verre) et deux fils Ø 0,43 mm, cale isolante.
 */
import * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { L_TAIL_END, L_THT_SEAT, MM } from '../constants';
import { own, type UnoParams } from '../params';
import { lathe, mat, roundedBox, type LoftSection, type P2 } from '../packages/geometry';
import { perforatedBlock, pinPositions, rrect } from '../packages/headers';
import { ellipsoid, hollowLoft, mergeAll } from './geometry';
import { innerPart } from './frame';
import { INT } from './materials';

/** Cale isolante (mm) et plan inférieur de l'embase. */
const SPACER = 0.15;
const Y0 = L_THT_SEAT / MM + SPACER;
/** Collerette, bossage, sommet des fils (mm). */
const FLANGE_TOP = Y0 + 0.3;
const BOSS_TOP = Y0 + 0.75;
const LEAD_TOP = Y0 + 0.95;
/** Capot : paroi 0,15 mm, dessus à 3,5 mm de la collerette basse. */
const CAN_TOP = Y0 + 3.5;
const WALL = 0.15;
/** Lame : 7,6 × 1,9 mm (typique), épaisseur 0,104 mm. */
const BLANK = { w: 7.6, h: 1.9, t: 0.104, y0: Y0 + 1.15 } as const;
const PIN_X = 2.44;

const hippo = (y: number, w: number, d: number): LoftSection => ({
  y: y * MM,
  w: w * MM,
  d: d * MM,
  r: (d / 2 - 0.01) * MM,
});

/** Capot creux (extérieur marqué + intérieur nickelé). */
function canShell(): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const outer: LoftSection[] = [
    hippo(FLANGE_TOP, 11.35, 4.9),
    hippo(FLANGE_TOP + 0.03, 11.4, 4.95),
    hippo(FLANGE_TOP + 0.1, 11.4, 4.95),
    hippo(FLANGE_TOP + 0.16, 11.12, 4.72),
    hippo(FLANGE_TOP + 0.22, 11.05, 4.65),
  ];
  const rt = 0.45;
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    const inset = rt * (1 - Math.cos(a));
    outer.push(hippo(CAN_TOP - rt + rt * Math.sin(a), 11.05 - 2 * inset, 4.65 - 2 * inset));
  }
  const iw = 11.05 - 2 * WALL;
  const id = 4.65 - 2 * WALL;
  const top = CAN_TOP - WALL;
  const ri = 0.3;
  const inner: LoftSection[] = [hippo(FLANGE_TOP, iw, id)];
  for (let k = 0; k <= 3; k++) {
    const a = (k / 3) * (Math.PI / 2);
    const inset = ri * (1 - Math.cos(a));
    inner.push(hippo(top - ri + ri * Math.sin(a), iw - 2 * inset, id - 2 * inset));
  }
  return hollowLoft(outer, inner, 8, { uvSize: [10.9 * MM, 4.5 * MM] });
}

/** Embase : collerette et bossage percés de deux trous (traversées de verre). */
function baseMetal(): THREE.BufferGeometry {
  const holes = [-PIN_X, PIN_X].map((x) => circle(0.6, x));
  const flange = perforatedBlock(rrect(11.4 * MM, 4.95 * MM, 2.46 * MM, 0, 0, 6), holes, Y0 * MM, 0.3 * MM, 0.04 * MM);
  const boss = perforatedBlock(
    rrect(10.55 * MM, 4.1 * MM, 2.04 * MM, 0, 0, 6),
    holes,
    (FLANGE_TOP - 0.01) * MM,
    (BOSS_TOP - FLANGE_TOP + 0.01) * MM,
    0.05 * MM,
  );
  return mergeAll([flange, boss]);
}

function circle(r: number, cx: number, n = 20): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(new THREE.Vector2((cx + Math.cos(a) * r) * MM, Math.sin(a) * r * MM));
  }
  return out;
}

/** Perle de verre autour d'un fil : affleure dessous, ménisque remontant le long du fil dessus. */
function glassBead(): THREE.BufferGeometry {
  const rl = 0.215;
  const profile: P2[] = [
    [rl + 0.005, Y0 + 0.03],
    [0.45, Y0 + 0.02],
    [0.6, Y0 + 0.04],
    [0.6, BOSS_TOP - 0.03],
    [0.5, BOSS_TOP - 0.005],
    [0.34, BOSS_TOP + 0.02],
    [0.25, BOSS_TOP + 0.07],
    [rl + 0.005, BOSS_TOP + 0.11],
  ];
  return lathe(
    profile.map(([r, y]) => [r * MM, y * MM] as P2),
    24,
  );
}

/** Fil Ø 0,43 mm : de l'extrémité sous la carte au sommet (arrondi) dans l'enceinte. */
function leadWire(): THREE.BufferGeometry {
  const r = 0.215 * MM;
  const y0 = L_TAIL_END;
  const y1 = LEAD_TOP * MM;
  return lathe(
    [
      [0.001 * MM, y0],
      [r * 0.7, y0 + 0.02 * MM],
      [r, y0 + 0.08 * MM],
      [r, y1 - 0.08 * MM],
      [r * 0.7, y1 - 0.02 * MM],
      [0.001 * MM, y1],
    ],
    12,
  );
}

/** Support-ressort (côté +X) : semelle soudée sur le fil et fourche à deux branches. */
function supportMetal(): THREE.BufferGeometry {
  const foot = roundedBox(1.4 * MM, 0.5 * MM, 0.08 * MM, {
    r: 0.1 * MM,
    rt: 0.03 * MM,
    rb: 0.03 * MM,
    y0: LEAD_TOP * MM,
  }).translate((PIN_X + 0.45) * MM, 0, 0);
  const prongs = [-1, 1].map((s) =>
    roundedBox(0.55 * MM, 0.06 * MM, (BLANK.y0 + 1.45 - LEAD_TOP) * MM, {
      r: 0.025 * MM,
      rt: 0.1 * MM,
      rb: 0.02 * MM,
      y0: (LEAD_TOP + 0.05) * MM,
    }).translate((BLANK.w / 2 - 0.3) * MM, 0, s * (BLANK.t / 2 + 0.045) * MM),
  );
  return mergeAll([foot, ...prongs]);
}

/** Colle conductrice entre la lame et les branches (deux gouttes par support). */
function supportGlue(): THREE.BufferGeometry {
  return mergeAll(
    [-1, 1].map((s) =>
      ellipsoid(0.22 * MM, 0.32 * MM, 0.06 * MM, 12, 8).translate(
        (BLANK.w / 2 - 0.3) * MM,
        (BLANK.y0 + 0.75) * MM,
        s * (BLANK.t / 2 + 0.08) * MM,
      ),
    ),
  );
}

function blankGeometry(): THREE.BufferGeometry {
  return roundedBox(BLANK.w * MM, BLANK.t * MM, BLANK.h * MM, {
    r: 0.04 * MM,
    rt: 0.04 * MM,
    rb: 0.04 * MM,
    y0: BLANK.y0 * MM,
    segs: 2,
  });
}

/** Électrodes d'argent sur les deux faces, chacune avec sa languette vers une extrémité. */
function electrodes(): THREE.BufferGeometry {
  const t = 0.003;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const z = s * (BLANK.t / 2 + t / 2) * MM;
    const pad = roundedBox(4.4 * MM, t * MM, 1.25 * MM, {
      r: 0.0012 * MM,
      rt: 0.0012 * MM,
      rb: 0.0012 * MM,
      y0: (BLANK.y0 + 0.33) * MM,
    }).translate(0, 0, z);
    // Languette : face +Z vers +X (support de la broche 2), face −Z vers −X (broche 1).
    const tab = roundedBox(1.75 * MM, t * MM, 0.45 * MM, {
      r: 0.0012 * MM,
      rt: 0.0012 * MM,
      rb: 0.0012 * MM,
      y0: (BLANK.y0 + 0.55) * MM,
    }).translate(s * (2.2 + 0.85) * MM, 0, z);
    parts.push(pad, tab);
  }
  return mergeAll(parts);
}

const PARENT = 'y1';
const REF = 'Y1';

export function crystalInternalParts(): PartDef<UnoParams>[] {
  const pins = pinPositions('HC49S');
  const supports = [mat(0, 0, 0), mat(0, 0, 0, 0, Math.PI, 0)];
  return [
    innerPart({
      id: 'y1.base',
      name: 'Embase et traversées verre-métal (Y1)',
      parent: PARENT,
      ref: REF,
      material: 'nickel',
      meshes: () => [
        {
          name: 'embase',
          key: 'y1.int.base',
          geometry: baseMetal,
          material: (ctx) => ctx.materials.get('nickel'),
        },
        {
          name: 'perles de verre',
          key: 'y1.int.glass',
          geometry: glassBead,
          material: (ctx) => own(ctx, `${INT}glassSeal`),
          locals: pins.map(([x, z]) => mat(x, 0, z)),
        },
        {
          name: 'fils',
          key: 'y1.int.lead',
          geometry: leadWire,
          material: (ctx) => ctx.materials.get('tin'),
          locals: pins.map(([x, z]) => mat(x, 0, z)),
        },
        {
          name: 'cale isolante',
          key: 'hc49s.spacer',
          geometry: () =>
            roundedBox(9.6 * MM, 3.6 * MM, SPACER * MM, { r: 0.4 * MM, rt: 0.03 * MM, y0: L_THT_SEAT }),
          material: (ctx) => ctx.materials.get('plastic.nylon'),
        },
      ],
      info: {
        role: 'Socle étanche du quartz : les deux fils traversent l’acier par des perles de verre fondu qui isolent et scellent à la fois ; le capot y était soudé.',
        material: 'Acier nickelé (collerette et bossage), verre de scellement, fils en acier cuivré étamé',
        dimensions: 'Collerette 11,4 × 4,95 mm ; perles Ø 1,2 mm ; fils Ø 0,43 mm au pas de 4,88 mm',
        tip: 'Le verre et l’acier ont des coefficients de dilatation voisins : la traversée reste étanche de −55 à +125 °C (typique). Un fil tordu près de la perle peut la fêler et laisser entrer l’humidité.',
      },
      explode: { direction: [0, 1, 0], distance: 0 },
      labelPriority: 2,
    }),
    innerPart({
      id: 'y1.supports',
      name: 'Supports-ressorts de la lame (Y1)',
      parent: PARENT,
      ref: REF,
      material: 'nickel',
      quantity: 2,
      meshes: () => [
        {
          name: 'supports',
          key: 'y1.int.support',
          geometry: supportMetal,
          material: (ctx) => ctx.materials.get('nickel'),
          locals: supports,
          selectable: true,
        },
        {
          name: 'colle conductrice',
          key: 'y1.int.glue',
          geometry: supportGlue,
          material: (ctx) => own(ctx, `${INT}silverEpoxy`),
          locals: supports,
          selectable: true,
        },
      ],
      options: {
        label: (i) => (i === 0 ? 'Support côté broche 2 (+X)' : 'Support côté broche 1 (−X)'),
      },
      info: {
        role: 'Tiennent la lame par ses extrémités, loin de la zone qui vibre, et amènent le courant à chaque électrode ; leur souplesse amortit les chocs.',
        material: 'Ruban de nickel de 0,08 mm soudé par points sur les fils ; colle époxy chargée argent',
        dimensions: 'Semelle 1,4 × 0,5 mm ; fourche de 0,55 mm de large, branches de 1,5 mm (typique)',
        tip: 'Une chute sur le carrelage peut décoller la lame d’un support : le quartz ne démarre plus, alors que le boîtier paraît intact.',
      },
      removal: {
        requires: ['y1.blank'],
        tool: 'pliers-flat',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.008,
        stagger: 0.3,
        destructive: true,
        gesture: 'Casser les soudures par points à la pince plate et dégager les deux supports.',
      },
      explode: { direction: [0, 1, 0], distance: 0.002 },
      labelPriority: 3,
    }),
    innerPart({
      id: 'y1.blank',
      name: 'Lame de quartz taillée AT (Y1)',
      parent: PARENT,
      ref: REF,
      material: `uno-board/${INT}quartz`,
      meshes: () => [
        {
          name: 'lame',
          key: 'y1.int.blank',
          geometry: blankGeometry,
          material: (ctx) => own(ctx, `${INT}quartz`),
        },
        {
          name: 'électrodes',
          key: 'y1.int.electrodes',
          geometry: electrodes,
          material: (ctx) => own(ctx, `${INT}silver`),
        },
      ],
      options: { pivot: [0, BLANK.y0 * MM, 0], anchor: [0, (BLANK.y0 + BLANK.h / 2) * MM, 0] },
      info: {
        role: 'Le résonateur : sous tension alternative, la lame vibre en cisaillement d’épaisseur (effet piézoélectrique) et impose sa fréquence de 16 MHz à l’oscillateur de l’ATmega16U2.',
        material: 'Quartz synthétique (SiO₂) taillé AT (≈ 35° 15′ de l’axe optique) ; électrodes d’argent de ≈ 0,1 µm',
        dimensions: `${BLANK.w.toString().replace('.', ',')} × ${BLANK.h.toString().replace('.', ',')} × 0,104 mm (typique) ; électrodes 4,4 × 1,25 mm`,
        reference: '16,000 MHz fondamental, ± 30 ppm (typique)',
        tip: 'La fréquence est fixée par l’épaisseur : 1,661 mm·MHz ÷ 16 MHz ≈ 0,104 mm. On l’ajuste en fin de fabrication en ajoutant quelques nanomètres d’argent sur l’électrode (ce qui abaisse la fréquence).',
        extra: [{ label: 'Coupe AT', value: 'fréquence quasi insensible à la température autour de 25 °C' }],
      },
      removal: {
        requires: ['y1.can'],
        tool: 'tweezers',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.01,
        destructive: true,
        gesture: 'Saisir la lame par ses bords aux brucelles et la dégager des fourches (la colle conductrice cède).',
      },
      explode: { direction: [0, 1, 0], distance: 0.005 },
      labelPriority: 5,
    }),
    innerPart({
      id: 'y1.can',
      name: 'Capot du quartz (Y1)',
      parent: PARENT,
      ref: REF,
      material: 'uno-board/mark.y1.top.q2',
      meshes: () => {
        let shell: { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } | null = null;
        const get = () => (shell ??= canShell());
        return [
          {
            name: 'capot (extérieur)',
            key: 'y1.int.can.outer',
            geometry: () => get().outer,
            material: (ctx) => own(ctx, `mark.y1.top.q${ctx.quality}`),
          },
          {
            name: 'capot (intérieur)',
            key: 'y1.int.can.inner',
            geometry: () => get().inner,
            material: (ctx) => ctx.materials.get('nickel'),
          },
        ];
      },
      info: {
        role: 'Enceinte étanche remplie d’azote sec : protège la lame de l’humidité et de la poussière, qui en modifieraient la fréquence.',
        material: 'Acier embouti nickelé de 0,15 mm, soudé par résistance sur la collerette ; marquage à l’encre',
        dimensions: 'HC-49/S : 11,05 × 4,65 × 3,5 mm (capot), collerette 11,4 × 4,95 mm',
        tip: 'Ne jamais chauffer le capot au dessoudage : la lame, épaisse d’un dixième de millimètre, se décolle ou se fêle au choc thermique.',
      },
      removal: {
        tool: 'cutter-flush',
        motion: 'cut',
        axis: [0, 1, 0],
        distance: 0.012,
        destructive: true,
        gesture: 'Pincer et rompre la soudure de la collerette à la pince coupante tout autour, puis soulever le capot.',
      },
      explode: { direction: [0, 1, 0], distance: 0.009 },
      labelPriority: 4,
    }),
  ];
}
