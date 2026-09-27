/**
 * ATmega328P-PU (PDIP-28) — niveau 3 : intérieur du boîtier.
 *
 * Pièces (enfants du sous-ensemble « u4 », repère local du boîtier) :
 * - demi-coque supérieure en résine (marquage laser) : décapsulation DESTRUCTIVE au scalpel ;
 * - 28 fils de liaison en or Ø 25 µm (instances sélectionnables, une par broche) ;
 * - puce de silicium 3,0 × 3,0 × 0,30 mm (texture du plan de la puce) ;
 * - grille de connexion : îlot, barrettes de maintien, 28 doigts argentés en bout, colle chargée
 *   argent sous la puce, pattes extérieures étamées à épaulement ;
 * - demi-coque inférieure (base du composant, reste en place).
 *
 * Hauteurs (mm, repère du composant : origine sur le cuivre supérieur de la carte) : plan
 * d'assise des épaulements sur le support, corps de 3,4 mm dont le plan de joint (= plan de la
 * grille) est à 1,45 mm au-dessus du dessous du boîtier.
 */
import * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { MM } from '../constants';
import { FOOTPRINTS } from '../footprints';
import { own, type UnoParams } from '../params';
import { padFrame } from '../packages/chips';
import {
  filletPath,
  loftRoundedRect,
  mat,
  roundedBox,
  roundedRectRing,
  sweepStrip,
  type LoftSection,
  type P2,
} from '../packages/geometry';
import { SOCKET_TOP } from '../packages/headers';
import { DIE, LEADFRAME, PIN_NAMES, WIRE, bondWires, fingerWidth, fingers, tieBars } from './dieLayout';
import { ellipsoid, mergeAll, planarStrip, wireTube } from './geometry';
import { innerPart, type InnerMesh } from './frame';
import { INT } from './materials';

/** Plan d'assise du DIP (épaulements des pattes sur le haut du support), mm. */
export const SEAT = SOCKET_TOP / MM;
export const BODY_Y0 = SEAT + 0.5;
export const BODY_H = 3.4;
/** Plan de joint = plan médian de la grille de connexion (sortie des pattes), mm. */
export const EXIT_Y = BODY_Y0 + 1.45;
export const BODY_W = 35.2;
export const BODY_D = 7.0;

// Hauteurs internes (mm).
const LF_TOP = EXIT_Y + LEADFRAME.thickness / 2;
const PLATING = 0.004;
const SILVER_TOP = LF_TOP + PLATING;
const DIE_BOTTOM = SILVER_TOP + DIE.attach;
const DIE_TOP = DIE_BOTTOM + DIE.thickness;
/** Dénivelé plot de la puce → dessus argenté du doigt. */
const WIRE_DROP = DIE_TOP - SILVER_TOP;

/** Contour du corps : rectangle arrondi avec l'encoche semi-circulaire (Ø 1,5 mm) côté −X. */
function dipRing(w: number, d: number, r: number): P2[] {
  const base = roundedRectRing(w, d, r, 3);
  const out: P2[] = [];
  const x0 = -w / 2;
  const nr = 0.75 * MM;
  for (let i = 0; i < base.length; i++) {
    const p = base[i]!;
    const q = base[(i + 1) % base.length]!;
    out.push(p);
    if (Math.abs(p[0] - x0) < 1e-9 && Math.abs(q[0] - x0) < 1e-9 && p[1] < 0 && q[1] > 0) {
      // Points doublés aux raccords : arête vive entre l'encoche et la face d'extrémité.
      out.push([x0, -nr]);
      for (let k = 0; k <= 10; k++) {
        const a = -Math.PI / 2 + (k / 10) * Math.PI;
        out.push([x0 + Math.cos(a) * nr, Math.sin(a) * nr]);
      }
      out.push([x0, nr]);
    }
  }
  return out;
}

const section = (y: number, inset: number): LoftSection => ({
  y: y * MM,
  w: (BODY_W - 2 * inset) * MM,
  d: (BODY_D - 2 * inset) * MM,
  r: Math.max(0.05, 0.4 - inset) * MM,
});

/** Demi-coque inférieure : dessous arrondi, dépouille jusqu'au plan de joint. */
function lowerSections(): LoftSection[] {
  const out: LoftSection[] = [];
  const rb = 0.15;
  for (let k = 0; k <= 2; k++) {
    const a = (k / 2) * (Math.PI / 2);
    out.push(section(BODY_Y0 + rb * (1 - Math.cos(a)), 0.08 + rb * (1 - Math.sin(a))));
  }
  out.push(section(EXIT_Y - 0.03, 0), section(EXIT_Y, 0));
  return out;
}

/** Demi-coque supérieure : bourrelet du plan de joint, dépouille, dessus arrondi. */
function upperSections(): LoftSection[] {
  const out: LoftSection[] = [section(EXIT_Y, 0), section(EXIT_Y + 0.03, 0)];
  const top = BODY_Y0 + BODY_H;
  const rt = 0.3;
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    out.push(section(top - rt + rt * Math.sin(a), 0.12 + rt * (1 - Math.cos(a))));
  }
  return out;
}

/**
 * Patte extérieure à épaulement (repère pastille : X vers l'extérieur, axe de la broche en
 * x = 0) : sort du flanc du boîtier à plat dans le plan de joint, pliée vers le bas, partie haute
 * large (1,52 mm) jusqu'au plan d'assise, épaulement, puis partie d'insertion de 0,46 mm.
 */
function dipLead(): THREE.BufferGeometry {
  const t = LEADFRAME.thickness;
  const edge = BODY_D / 2 - 3.81; // flanc du corps (−0,31 mm)
  const tipY = SEAT - 3.2;
  const pts: P2[] = [
    [edge * MM, EXIT_Y * MM],
    [0.0, EXIT_Y * MM],
    [0.0, tipY * MM],
  ];
  const path = filletPath(pts, 0.45 * MM, 8);
  let sShoulder = 0;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (a[1] >= SEAT * MM && b[1] < SEAT * MM) sShoulder = acc + (l * (a[1] - SEAT * MM)) / (a[1] - b[1]);
    acc += l;
  }
  const dense: P2[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(l / (0.1 * MM)));
    for (let k = 0; k < n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  dense.push(path[path.length - 1]!);
  const wide = LEADFRAME.leadWidth * MM;
  const narrow = 0.46 * MM;
  return sweepStrip(
    dense,
    t * MM,
    (s, total) => {
      if (s < sShoulder) return wide;
      const k = Math.min(1, (s - sShoulder) / (0.35 * MM));
      const w = wide + (narrow - wide) * k;
      const tip = Math.max(0, (s - (total - 0.3 * MM)) / (0.3 * MM));
      return w * (1 - 0.45 * tip);
    },
    { cornerR: 0.06 * MM, segs: 2 },
  );
}

/** Repères des 28 pattes (repère pastille orienté vers l'extérieur). */
const leadLocals = (): THREE.Matrix4[] => FOOTPRINTS.DIP28.pads.map((p) => padFrame(p, [0, Math.sign(p.y)]));

/** Conversion mm (x, z) → m ; densification de la fin (élargissement vers la patte). */
function fingerPath(path: readonly P2[]): P2[] {
  const m = filletPath(
    path.map(([x, z]) => [x * MM, z * MM] as P2),
    0.3 * MM,
    6,
  );
  // Élargissement : points rapprochés sur les 0,3 derniers mm.
  const last = m[m.length - 1]!;
  const prev = m[m.length - 2]!;
  const len = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
  const span = Math.min(len, 0.3 * MM);
  const out = m.slice(0, -1);
  const start: P2 = [last[0] + ((prev[0] - last[0]) * span) / len, last[1] + ((prev[1] - last[1]) * span) / len];
  if (span < len) out.push(start);
  for (let k = 1; k <= 8; k++)
    out.push([start[0] + ((last[0] - start[0]) * k) / 8, start[1] + ((last[1] - start[1]) * k) / 8]);
  return out;
}

/** Début d'une ligne brisée sur une longueur donnée. */
function headOf(path: readonly P2[], length: number): P2[] {
  const out: P2[] = [path[0]!];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= length) {
      const t = (length - acc) / l;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return out;
    }
    out.push(b);
    acc += l;
  }
  return out;
}

const mmWidth = (fn: (s: number, total: number) => number) => (s: number, total: number) =>
  fn(s / MM, total / MM) * MM;

/** Cuivre de la grille : doigts, îlot, barrettes de maintien. */
function leadframeCopper(): THREE.BufferGeometry {
  const y = EXIT_Y * MM;
  const t = LEADFRAME.thickness * MM;
  const parts: THREE.BufferGeometry[] = fingers().map((f) =>
    planarStrip(fingerPath(f.path), mmWidth(fingerWidth), y, t, { cornerR: 0.06 * MM }),
  );
  const P = LEADFRAME.paddle;
  parts.push(
    roundedBox(P * MM, P * MM, t, { r: 0.15 * MM, rt: 0.03 * MM, rb: 0.03 * MM, y0: y - t / 2, segs: 3 }),
  );
  for (const bar of tieBars())
    parts.push(
      planarStrip(
        bar.map(([x, z]) => [x * MM, z * MM] as P2),
        () => LEADFRAME.tieBar * MM,
        y,
        t,
        { cornerR: 0.06 * MM },
      ),
    );
  return mergeAll(parts);
}

/** Dépôts d'argent : bouts des doigts (zone de soudure des fils) et îlot. */
function leadframeSilver(): THREE.BufferGeometry {
  const y = (LF_TOP + PLATING / 2) * MM;
  const parts: THREE.BufferGeometry[] = fingers().map((f) =>
    planarStrip(
      headOf(fingerPath(f.path), LEADFRAME.silverLength * MM),
      () => (LEADFRAME.finger - 0.03) * MM,
      y,
      PLATING * MM,
      { cornerR: PLATING * 0.4 * MM },
    ),
  );
  const s = LEADFRAME.paddle - 0.2;
  parts.push(
    roundedBox(s * MM, s * MM, PLATING * MM, {
      r: 0.12 * MM,
      rt: 0.001 * MM,
      rb: 0.001 * MM,
      y0: LF_TOP * MM,
      segs: 3,
    }),
  );
  return mergeAll(parts);
}

/** Colle chargée argent : galette sous la puce, ménisque remontant sur ses flancs. */
function dieAttach(): THREE.BufferGeometry {
  const y0 = SILVER_TOP;
  const s = (y: number, w: number, r: number): LoftSection => ({ y: y * MM, w: w * MM, d: w * MM, r: r * MM });
  return loftRoundedRect(
    [
      s(y0, DIE.size + 0.24, 0.14),
      s(y0 + 0.008, DIE.size + 0.2, 0.12),
      s(y0 + 0.018, DIE.size + 0.1, 0.07),
      s(y0 + 0.04, DIE.size + 0.02, 0.02),
      s(y0 + 0.07, DIE.size - 0.02, 0.01),
    ],
    { cornerSegments: 4 },
  );
}

/** Puce : pavé à arêtes à peine adoucies (découpe à la scie), texture sur le dessus. */
function dieGeometry(): THREE.BufferGeometry {
  return roundedBox(DIE.size * MM, DIE.size * MM, DIE.thickness * MM, {
    r: 0.012 * MM,
    rt: 0.008 * MM,
    rb: 0.006 * MM,
    y0: DIE_BOTTOM * MM,
    segs: 2,
    uvSize: [DIE.size * MM, DIE.size * MM],
    sideUV: [0.002, 0.002],
  });
}

// --- Fils de liaison ---------------------------------------------------------------------------------

/**
 * Tracé de référence d'un fil (repère du fil : X = portée, Y vers le haut, origine sur le plot),
 * portée `WIRE.referenceSpan` : col vertical au-dessus de la boule, pliure, boucle à ≈ 0,19 mm,
 * descente régulière et arrivée rasante sur le doigt (croissant).
 */
function wireCenterline(): THREE.Vector3[] {
  const S = WIRE.referenceSpan;
  const h = WIRE.loopHeight;
  const d = WIRE_DROP;
  const pts: [number, number][] = [
    [0, 0.03],
    [0, 0.1],
    [0.018, 0.165],
    [0.09, h],
    [0.3, h - 0.035],
    [0.58, h - 0.2],
    [0.84, -d + 0.07],
    [S - 0.05, -d + 0.016],
    [S, -d + 0.008],
  ];
  return pts.map(([x, y]) => new THREE.Vector3(x * MM, y * MM, 0));
}

function wireGeometry(): THREE.BufferGeometry {
  return wireTube(wireCenterline(), (WIRE.diameter / 2) * MM, 64, 8);
}

/** Boule (thermosonique) et col de recristallisation au-dessus du plot. */
function ballGeometry(): THREE.BufferGeometry {
  const r = (WIRE.ballDiameter / 2) * MM;
  const hb = WIRE.ballHeight * MM;
  const ball = ellipsoid(r, hb / 2, r, 18, 8).translate(0, hb / 2, 0);
  const neck = new THREE.CylinderGeometry(
    (WIRE.diameter / 2) * MM,
    (WIRE.diameter / 2) * 1.5 * MM,
    0.02 * MM,
    10,
    1,
    true,
  ).translate(0, hb + 0.009 * MM, 0);
  return mergeAll([ball, neck]);
}

/** Soudure en croissant (« stitch ») : fil écrasé en queue d'aronde sur le doigt. */
function stitchGeometry(): THREE.BufferGeometry {
  return ellipsoid(0.036 * MM, 0.007 * MM, 0.021 * MM, 16, 6).translate(0.012 * MM, 0.006 * MM, 0);
}

/** Matrices des fils (repère du composant). */
function wireMatrices(): { ball: THREE.Matrix4[]; stitch: THREE.Matrix4[]; tube: THREE.Matrix4[] } {
  const ball: THREE.Matrix4[] = [];
  const stitch: THREE.Matrix4[] = [];
  const tube: THREE.Matrix4[] = [];
  for (const w of bondWires()) {
    const px = w.pad[0] * MM;
    const pz = w.pad[1] * MM;
    ball.push(mat(px, DIE_TOP * MM, pz, 0, w.heading, 0));
    stitch.push(mat(w.stitch[0] * MM, SILVER_TOP * MM, w.stitch[1] * MM, 0, w.heading, 0));
    // Approximation : un profil unique étiré selon la portée de chaque fil (écart ≤ 15 %) ; la
    // section de la partie montante devient très légèrement elliptique.
    tube.push(mat(px, DIE_TOP * MM, pz, 0, w.heading, 0, w.span / WIRE.referenceSpan, 1, 1));
  }
  return { ball, stitch, tube };
}

// --- Pièces ------------------------------------------------------------------------------------------

const PARENT = 'u4';
const REF = 'U4';

export function mcuInternalParts(): PartDef<UnoParams>[] {
  const wires = bondWires();
  const cutInfo =
    'En laboratoire, on décapsule à l’acide nitrique fumant vers 80 °C, qui dissout la résine sans attaquer l’or ni le silicium ; la découpe mécanique au plan de joint, ici, arrache les fils.';
  return [
    innerPart({
      id: 'u4.resin.bottom',
      name: 'Demi-coque inférieure en résine (U4)',
      parent: PARENT,
      ref: REF,
      material: `uno-board/${INT}resin`,
      meshes: () => [
        {
          name: 'demi-coque inférieure',
          key: 'u4.int.resin.bottom',
          geometry: () => loftRoundedRect(lowerSections(), { ring: dipRing }),
          material: (ctx) => own(ctx, `${INT}resin`),
        },
      ],
      info: {
        role: 'Moitié basse du boîtier moulé : elle noyait l’îlot et la face inférieure de la grille de connexion ; c’est ce qui reste une fois le composant entièrement démonté.',
        material: 'Résine époxy de moulage (EMC) noire, chargée de ≈ 80 % de billes de silice (typique)',
        dimensions: '35,2 × 7,0 mm ; 1,45 mm sous le plan de joint',
        tip: 'Le plan de joint, à mi-hauteur des pattes, sépare les deux empreintes du moule : sur un boîtier neuf, on le devine à une fine arête sur les flancs.',
      },
      explode: { direction: [0, 1, 0], distance: 0 },
      labelPriority: 2,
    }),
    innerPart({
      id: 'u4.leadframe',
      name: 'Grille de connexion (U4)',
      parent: PARENT,
      ref: REF,
      material: 'copper.bare',
      meshes: () => [
        {
          name: 'grille (cuivre)',
          key: 'u4.int.lf.copper',
          geometry: leadframeCopper,
          material: (ctx) => ctx.materials.get('copper.bare'),
        },
        {
          name: 'dépôts d’argent',
          key: 'u4.int.lf.silver',
          geometry: leadframeSilver,
          material: (ctx) => own(ctx, `${INT}silver`),
        },
        {
          name: 'colle chargée argent',
          key: 'u4.int.attach',
          geometry: dieAttach,
          material: (ctx) => own(ctx, `${INT}silverEpoxy`),
        },
        {
          name: 'pattes',
          key: 'u4.int.lead',
          geometry: dipLead,
          material: (ctx) => ctx.materials.get('tin'),
          locals: leadLocals(),
        },
      ],
      info: {
        role: 'Squelette métallique du boîtier : l’îlot porte la puce et évacue sa chaleur, les 28 doigts conduisent chaque signal jusqu’à sa patte extérieure.',
        material:
          'Alliage de cuivre (type C194) de 0,25 mm, découpé ; bouts de doigts et îlot argentés ; pattes étamées après moulage',
        dimensions: `Îlot ${fmt(LEADFRAME.paddle)} × ${fmt(LEADFRAME.paddle)} mm ; doigts de 0,25 mm, isolement ≥ 0,15 mm ; pattes au pas de 2,54 mm`,
        tip: 'Les deux barrettes qui tenaient l’îlot pendant le moulage sont coupées au ras du boîtier : leur section de cuivre affleure au fond de l’encoche et sur l’autre extrémité.',
        extra: [
          { label: 'Doigts', value: '28, un par broche ; les broches d’extrémité rejoignent les petits côtés de la puce' },
          { label: 'Colle de la puce', value: 'époxy chargée argent (conduction thermique), ≈ 25 µm' },
        ],
      },
      removal: {
        requires: ['u4.die'],
        tool: 'pliers-flat',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.012,
        destructive: true,
        gesture: 'Saisir la grille par les pattes à la pince plate et l’arracher de la demi-coque inférieure.',
      },
      explode: { direction: [0, 1, 0], distance: 0.0015 },
      labelPriority: 4,
    }),
    innerPart({
      id: 'u4.die',
      name: 'Puce de silicium ATmega328P',
      parent: PARENT,
      ref: REF,
      material: `uno-board/${INT}die.q2`,
      meshes: () => [
        {
          name: 'puce',
          key: 'u4.int.die',
          geometry: dieGeometry,
          material: (ctx) => own(ctx, `${INT}die.q${ctx.quality}`),
        },
      ],
      options: { pivot: [0, DIE_BOTTOM * MM, 0], anchor: [0, DIE_TOP * MM, 0] },
      info: {
        role: 'Le circuit intégré lui-même : cœur AVR 8 bits, mémoires Flash, SRAM et EEPROM, convertisseur analogique-numérique et périphériques, gravés sur un même morceau de silicium.',
        material: 'Silicium monocristallin, interconnexions en aluminium, passivation nitrure/oxyde (irisée)',
        dimensions: `≈ ${fmt(DIE.size)} × ${fmt(DIE.size)} × ${fmt(DIE.thickness)} mm (typique)`,
        reference: 'ATmega328P (AVR 8 bits, jusqu’à 20 MHz)',
        tip: 'Le plus grand bloc régulier est la Flash de 32 Ko ; la SRAM de 2 Ko est seize fois plus petite en capacité mais ses cellules (6 transistors par bit) sont bien plus grosses que celles de la Flash (1 transistor par bit).',
        extra: [
          { label: 'Plots', value: '32 (8 par côté) dont 28 câblés en DIP-28' },
          { label: 'Plots nus', value: 'ADC6, ADC7 et une paire VCC/GND, câblés seulement en TQFP-32' },
          { label: 'Gravure', value: '≈ 0,35 µm (ordre de grandeur, typique)' },
        ],
      },
      removal: {
        requires: ['u4.wires'],
        tool: 'tweezers',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.01,
        destructive: true,
        gesture: 'Décoller la puce de l’îlot aux brucelles (la colle chargée argent cède).',
      },
      explode: { direction: [0, 1, 0], distance: 0.003 },
      labelPriority: 6,
    }),
    innerPart({
      id: 'u4.wires',
      name: 'Fils de liaison en or (U4)',
      parent: PARENT,
      ref: REF,
      material: 'gold',
      quantity: wires.length,
      meshes: (): InnerMesh[] => {
        const m = wireMatrices();
        return [
          {
            name: 'boules',
            key: 'u4.int.wire.ball',
            geometry: ballGeometry,
            material: (ctx) => ctx.materials.get('gold'),
            locals: m.ball,
            selectable: true,
          },
          {
            name: 'croissants',
            key: 'u4.int.wire.stitch',
            geometry: stitchGeometry,
            material: (ctx) => ctx.materials.get('gold'),
            locals: m.stitch,
            selectable: true,
          },
          {
            name: 'fils',
            key: 'u4.int.wire.tube',
            geometry: wireGeometry,
            material: (ctx) => ctx.materials.get('gold'),
            locals: m.tube,
            selectable: true,
          },
        ];
      },
      options: {
        label: (i) => {
          const w = wires[i];
          return w ? `Fil d’or — broche ${w.pin} : ${PIN_NAMES[w.pin]}` : 'Fil d’or';
        },
      },
      info: {
        role: 'Relient chacun des plots de la puce au doigt de la broche correspondante : ce sont les seules liaisons électriques entre le silicium et l’extérieur.',
        material: 'Or 99,99 % (4N) ; boule sur le plot d’aluminium, soudure en croissant sur le doigt argenté (thermosonique)',
        dimensions: 'Ø 25 µm (1 mil) ; portée ≈ 0,9 à 1,2 mm ; boucle ≈ 0,2 mm au-dessus de la puce (typique)',
        tip: 'Un fil d’or de 25 µm fond sous ≈ 1 A en quelques millisecondes : une surcharge franche sur une broche coupe souvent son fil, la broche est « morte » alors que le reste du circuit fonctionne.',
        extra: [{ label: 'Nombre', value: '28, un par broche (cliquer un fil pour voir sa broche)' }],
      },
      removal: {
        requires: ['u4.resin.top'],
        tool: 'tweezers',
        motion: 'peel',
        axis: [0, 1, 0],
        distance: 0.006,
        stagger: 0.04,
        destructive: true,
        gesture: 'Arracher les fils un à un aux brucelles (ils cassent au col, au-dessus de la boule).',
      },
      explode: {
        direction: [0, 1, 0],
        distance: 0.005,
        spread: { mode: 'radial', axis: [0, 1, 0], distance: 0.002 },
      },
      labelPriority: 5,
    }),
    innerPart({
      id: 'u4.resin.top',
      name: 'Demi-coque supérieure en résine (U4)',
      parent: PARENT,
      ref: REF,
      material: `uno-board/${INT}resin.u4top.q2`,
      meshes: () => [
        {
          name: 'demi-coque supérieure',
          key: 'u4.int.resin.top',
          geometry: () => loftRoundedRect(upperSections(), { ring: dipRing, uvSize: [35.1 * MM, 6.6 * MM] }),
          material: (ctx) => own(ctx, `${INT}resin.u4top.q${ctx.quality}`),
        },
      ],
      info: {
        role: 'Moitié haute du boîtier moulé : protège la puce et ses fils de l’humidité, de la lumière et des chocs ; porte le marquage laser.',
        material: 'Résine époxy de moulage (EMC) noire, chargée de ≈ 80 % de billes de silice, noir de carbone (typique)',
        dimensions: '35,2 × 7,0 mm ; 1,95 mm au-dessus du plan de joint',
        tip: cutInfo,
      },
      removal: {
        tool: 'scalpel',
        motion: 'cut',
        axis: [0, 1, 0],
        distance: 0.012,
        destructive: true,
        gesture: 'Entailler le plan de joint au scalpel tout autour du boîtier, puis soulever la demi-coque.',
      },
      explode: { direction: [0, 1, 0], distance: 0.008 },
      labelPriority: 5,
    }),
  ];
}

/** Nombre (mm) au format français. */
function fmt(v: number): string {
  return (Number.isInteger(v) ? v.toFixed(1) : String(v)).replace('.', ',');
}
