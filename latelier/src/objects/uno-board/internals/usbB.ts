/**
 * Connecteur USB type B traversant (X2) — niveau 3 : intérieur.
 *
 * Repère local : origine au centre de la face arrière, sur le cuivre supérieur ; ouverture vers
 * −X (déborde de 6,2 mm du bord de carte). Pièces (enfants du sous-ensemble « x2 ») :
 * - coque emboutie (acier 0,3 mm) : tube agrafé, face avant à ouverture « maison », volet
 *   arrière rabattu, fente ouverte à l'arrière du fond (passage des queues des contacts), deux
 *   pattes de fixation. Déclipsage : le volet arrière se relève (crochet `onRemovalProgress`),
 *   puis la coque glisse vers l'avant et libère l'isolant ;
 * - contacts supérieurs 1 (VBUS) et 2 (D−), queues au rang arrière (x = −2,2 mm) ;
 * - contacts inférieurs 3 (D+) et 4 (GND), queues au rang avant (x = −4,2 mm) ; ils ne sortent
 *   qu'une fois les supérieurs extraits (leurs queues barrent le passage vers l'arrière) ;
 * - isolant (base du composant) : corps et langue portant deux contacts dessus, deux dessous.
 *
 * Contacts : bronze phosphoreux 0,3 mm, doré sur la lame (langue), étamé sur la queue ; tirés
 * vers l'arrière hors de leurs canaux (introduits par l'arrière au montage).
 *
 * Approximations : canaux des contacts dans l'isolant non modélisés (les contacts y glissent) ;
 * pas de rayon de pliage au volet arrière ; ergots de retenue de la coque omis.
 */
import * as THREE from 'three/webgpu';
import { motionTiming, sampleRemoval, createMotionSample } from '../../../inspection/motions';
import type { PartDef, PartHooks, RemovalSpec } from '../../types';
import { L_TAIL_END, L_THT_SEAT, MM } from '../constants';
import type { UnoParams } from '../params';
import {
  filletPath,
  loftRoundedRect,
  mat,
  roundedBox,
  roundedRectRing,
  sweepStrip,
  type P2,
} from '../packages/geometry';
import { pinPositions } from '../packages/headers';
import { mergeAll } from './geometry';
import { innerPart, refRotation, toParent, type InnerMesh } from './frame';

/** Cotes (mm) : coque 16,3 × 12,0 × 10,9, tôle 0,3. */
export const USB = {
  L: 16.3,
  W: 12.0,
  H: 10.9,
  T: 0.3,
  y0: L_THT_SEAT / MM,
  /** Ouverture « maison » : 8,45 × 7,78 mm, bas à 1,6 mm du dessous. */
  opening: { w: 8.45, h: 7.78, y: 1.6, chamfer: 1.3 },
  /** Fente arrière du fond (demi-largeur, longueur depuis l'arrière du tube). */
  slot: { half: 2.0, end: 5.0 },
  /** Volet arrière (plus étroit et plus court que la coque). */
  flap: { w: 10.8, h: 10.1 },
  /** Isolant : corps (longueur selon X), langue. */
  body: { x0: 0.3, len: 9.6 },
  tongue: { len: 5.4, w: 5.6, h: 3.0 },
  /** Contacts : épaisseur, largeur de lame et de queue. */
  contact: { t: 0.3, blade: 1.0, tail: 0.6 },
} as const;

const Y0 = USB.y0;
/** Axe de la langue (milieu de l'ouverture). */
export const TONGUE_Y = Y0 + USB.opening.y + USB.opening.h / 2;
const TONGUE_X1 = -(USB.body.x0 + USB.body.len);
const TONGUE_X0 = TONGUE_X1 - USB.tongue.len;
/** Limite dorure / étamage des contacts (à l'intérieur du corps de l'isolant). */
const PLATING_X = TONGUE_X1 + 0.5;
/** Angle d'ouverture maximal du volet arrière (rad). */
const FLAP_OPEN = 1.95;

/** Rectangle arrondi dans le plan de la forme (x = Z objet, y = Y objet), m. */
function rr(w: number, h: number, r: number, cy: number): THREE.Vector2[] {
  return roundedRectRing(w * MM, h * MM, r * MM, 3).map(([x, z]) => new THREE.Vector2(x, -z + cy * MM));
}

/** Quart d'arc (plan de la forme), angles en rad, sens selon a0 → a1. */
function arc(out: THREE.Vector2[], cx: number, cy: number, r: number, a0: number, a1: number, n = 4): void {
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    out.push(new THREE.Vector2((cx + Math.cos(a) * r) * MM, (cy + Math.sin(a) * r) * MM));
  }
}

/**
 * Section en « C » du tronçon arrière du tube : paroi d'épaisseur T, fond ouvert entre
 * z = ±`gap` (plan de la forme : x = Z, y = Y ; mm → m).
 */
function cSection(gap: number): THREE.Vector2[] {
  const { W, H, T } = USB;
  const ro = 0.6;
  const ri = 0.35;
  const yb = Y0;
  const yt = Y0 + H;
  const hw = W / 2;
  const pts: THREE.Vector2[] = [];
  // Contour extérieur (trigonométrique) de (gap, bas) à (−gap, bas).
  pts.push(new THREE.Vector2(gap * MM, yb * MM));
  arc(pts, hw - ro, yb + ro, ro, -Math.PI / 2, 0);
  arc(pts, hw - ro, yt - ro, ro, 0, Math.PI / 2);
  arc(pts, -hw + ro, yt - ro, ro, Math.PI / 2, Math.PI);
  arc(pts, -hw + ro, yb + ro, ro, Math.PI, (3 * Math.PI) / 2);
  pts.push(new THREE.Vector2(-gap * MM, yb * MM));
  // Contour intérieur (horaire) de (−gap, bas + T) à (gap, bas + T).
  const ib = yb + T;
  const it = yt - T;
  const ihw = hw - T;
  pts.push(new THREE.Vector2(-gap * MM, ib * MM));
  arc(pts, -ihw + ri, ib + ri, ri, (3 * Math.PI) / 2, Math.PI);
  arc(pts, -ihw + ri, it - ri, ri, Math.PI, Math.PI / 2);
  arc(pts, ihw - ri, it - ri, ri, Math.PI / 2, 0);
  arc(pts, ihw - ri, ib + ri, ri, 0, -Math.PI / 2);
  pts.push(new THREE.Vector2(gap * MM, ib * MM));
  return pts;
}

/** Ouverture « maison » : angles supérieurs chanfreinés. */
function houseOpening(): THREE.Vector2[] {
  const { w: ow, h, y, chamfer: c } = USB.opening;
  const w = ow / 2;
  const y0 = Y0 + y;
  const y1 = y0 + h;
  const pts: [number, number][] = [
    [-w, y0],
    [w, y0],
    [w, y1 - c],
    [w - c, y1],
    [-w + c, y1],
    [-w, y1 - c],
  ];
  return pts.map(([px, py]) => new THREE.Vector2(px * MM, py * MM));
}

/** Extrusion le long de −X (de x = −x0 − depth à −x0, mm), chanfrein léger. */
function extrudeX(
  outer: THREE.Vector2[],
  holes: THREE.Vector2[][],
  x0: number,
  depth: number,
  bevel = 0.06,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer);
  for (const h of holes) shape.holes.push(new THREE.Path(h));
  const b = bevel * MM;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth * MM - 2 * b,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, b + x0 * MM);
  g.rotateY(-Math.PI / 2); // extrusion (+Z forme) → −X objet ; x forme → Z objet
  g.computeVertexNormals();
  return g;
}

/** Coque : tronçon arrière fendu, tube, face avant percée. */
function shellGeometry(): THREE.BufferGeometry {
  const { L, W, H, T, slot } = USB;
  const cy = Y0 + H / 2;
  const outer = () => rr(W, H, 0.6, cy);
  const inner = () => rr(W - 2 * T, H - 2 * T, 0.35, cy);
  const rear = extrudeX(cSection(slot.half), [], T, slot.end - T, 0.004);
  const tube = extrudeX(outer(), [inner()], slot.end, L - T - slot.end, 0.004);
  const front = extrudeX(outer(), [houseOpening()], L - T, T, 0.08);
  return mergeAll([rear, tube, front]);
}

/** Volet arrière : repère de la charnière (arête supérieure arrière), pend vers −Y. */
function flapGeometry(): THREE.BufferGeometry {
  const { H, T, flap } = USB;
  const top = Y0 + H;
  const g = extrudeX(rr(flap.w, flap.h, 0.5, top - flap.h / 2), [], 0, T, 0.05);
  return g.translate(0, -top * MM, 0);
}

/** Patte de fixation (tôle de 0,3 mm pliée vers le bas). */
function legGeometry(): THREE.BufferGeometry {
  return loftRoundedRect(
    [
      { y: L_TAIL_END, w: 1.3 * MM, d: 0.3 * MM, r: 0.05 * MM },
      { y: L_TAIL_END + 0.5 * MM, w: 2.0 * MM, d: 0.3 * MM, r: 0.05 * MM },
      { y: (Y0 + 1.0) * MM, w: 2.0 * MM, d: 0.3 * MM, r: 0.05 * MM },
    ],
    { cornerSegments: 1 },
  );
}

/** Corps de l'isolant et langue. */
function insulatorGeometry(): THREE.BufferGeometry {
  const { W, H, T, body, tongue } = USB;
  const block = roundedBox(body.len * MM, (W - 2 * T - 0.05) * MM, (H - 2 * T - 0.05) * MM, {
    r: 0.2 * MM,
    rt: 0.15 * MM,
    y0: (Y0 + T + 0.02) * MM,
  }).translate(-(body.x0 + body.len / 2) * MM, 0, 0);
  const t = roundedBox((tongue.len + 0.1) * MM, tongue.w * MM, tongue.h * MM, {
    r: 0.3 * MM,
    rt: 0.25 * MM,
    rb: 0.25 * MM,
    y0: (TONGUE_Y - tongue.h / 2) * MM,
  }).translate(((TONGUE_X0 + TONGUE_X1 + 0.1) / 2) * MM, 0, 0);
  return mergeAll([block, t]);
}

// --- Contacts ---------------------------------------------------------------------------------------

/** Profil d'un contact (mm, plan X–Y) : bout accroché dans la langue, bosse, lame, coude, queue. */
export function contactPath(row: 'top' | 'bottom'): P2[] {
  const s = row === 'top' ? 1 : -1;
  const face = TONGUE_Y + s * (USB.tongue.h / 2);
  const run = face + s * 0.12;
  const drop = row === 'top' ? -2.2 : -4.2;
  const pts: P2[] = [
    [TONGUE_X0 + 0.3, face - s * 0.3],
    [TONGUE_X0 + 0.6, run],
    [TONGUE_X0 + 1.4, face + s * 0.42],
    [TONGUE_X0 + 2.4, run],
    [drop, run],
    [drop, L_TAIL_END / MM],
  ];
  return filletPath(pts, 0.3, 6);
}

/** Coupe un profil à l'abscisse x = `cut` (premier passage) : [avant, après]. */
function splitAt(path: readonly P2[], cut: number): [P2[], P2[]] {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if ((a[0] - cut) * (b[0] - cut) <= 0 && a[0] !== b[0]) {
      const k = (cut - a[0]) / (b[0] - a[0]);
      const p: P2 = [cut, a[1] + (b[1] - a[1]) * k];
      return [
        [...path.slice(0, i), p],
        [p, ...path.slice(i)],
      ];
    }
  }
  throw new Error('splitAt : abscisse hors du profil.');
}

/** Lame dorée (partie avant) ou corps étamé et queue (partie arrière) d'un contact. */
function contactGeometry(row: 'top' | 'bottom', part: 'blade' | 'tail'): THREE.BufferGeometry {
  const [blade, tail] = splitAt(contactPath(row), PLATING_X);
  const { t, blade: wb, tail: wt } = USB.contact;
  const toM = (p: readonly P2[]) => p.map(([x, y]) => [x * MM, y * MM] as P2);
  if (part === 'blade') return sweepStrip(toM(blade), t * MM, () => wb * MM, { cornerR: 0.06 * MM, segs: 2 });
  // Coude : longueur horizontale de la partie arrière ; rétrécissement juste après.
  const bend = Math.abs(tail[0]![0] - (row === 'top' ? -2.2 : -4.2)) * MM;
  return sweepStrip(
    toM(tail),
    t * MM,
    (s, total) => {
      const k = Math.min(1, Math.max(0, (s - bend - 0.3 * MM) / (0.5 * MM)));
      const w = wb * MM + (wt - wb) * MM * k;
      const tip = Math.max(0, (s - (total - 0.3 * MM)) / (0.3 * MM));
      return w * (1 - 0.3 * tip);
    },
    { cornerR: 0.06 * MM, segs: 2 },
  );
}

// --- Crochets de la coque -------------------------------------------------------------------------------

/**
 * Crochets de la coque : ouverture du volet arrière (déclipsage, vue éclatée) et annulation de
 * la bascule du levier générique de `unclip` (une coque tubulaire autour de l'isolant ne peut
 * pas pivoter : le « levier » est ici le volet qui se relève).
 */
function shellHooks(
  meshes: ReadonlyMap<string, THREE.Mesh>,
  inner: THREE.Group,
  removal: RemovalSpec,
): PartHooks {
  const flap = meshes.get('volet arrière');
  const timing = motionTiming(removal, 1);
  const sample = createMotionSample();
  const baseRotation = refRotation(REF);
  let byRemoval = 0;
  let byExplode = 0;
  const apply = () => {
    if (flap) flap.rotation.z = FLAP_OPEN * Math.max(byRemoval, byExplode);
  };
  const easeOut = (k: number) => 1 - (1 - k) ** 3;
  return {
    onRemovalProgress: (t, info) => {
      if (info.motion !== 'unclip') return;
      byRemoval = easeOut(Math.min(1, Math.max(0, t / timing.a)));
      // Même échantillon que le moteur (le remontage parcourt le retrait à l'envers).
      sampleRemoval(removal, t, sample, timing);
      inner.rotation.y = baseRotation - sample.tilt;
      apply();
    },
    onExplode: (amount) => {
      byExplode = easeOut(Math.min(1, Math.max(0, amount / 0.08)));
      apply();
    },
  };
}

const PARENT = 'x2';
const REF = 'X2';

export function usbBInternalParts(): PartDef<UnoParams>[] {
  const legs = pinPositions('USB-B').slice(4);
  const signal = pinPositions('USB-B').slice(0, 4);
  const pinName = ['1 — VBUS (+5 V)', '2 — D−', '3 — D+', '4 — GND'];
  const shellRemoval: RemovalSpec = {
    tool: 'screwdriver-precision',
    motion: 'unclip',
    axis: toParent(REF, [-1, 0, 0]),
    distance: 0.019,
    duration: 2.2,
    gesture:
      'Relever le volet arrière de la coque au tournevis de précision (déclic des agrafes), puis faire glisser la coque vers l’avant pour dégager l’isolant.',
  };
  const contactMeshes = (row: 'top' | 'bottom', pins: readonly number[]): InnerMesh[] => {
    const locals = pins.map((n) => mat(0, 0, signal[n - 1]![1]));
    return [
      {
        name: 'lames dorées',
        key: `usbb.int.contact.${row}.blade`,
        geometry: () => contactGeometry(row, 'blade'),
        material: (ctx) => ctx.materials.get('gold'),
        locals,
        selectable: true,
      },
      {
        name: 'queues étamées',
        key: `usbb.int.contact.${row}.tail`,
        geometry: () => contactGeometry(row, 'tail'),
        material: (ctx) => ctx.materials.get('tin'),
        locals,
        selectable: true,
      },
    ];
  };
  const contactInfo = {
    material:
      'Bronze phosphoreux (CuSn) de 0,3 mm, découpé et plié ; flash d’or sur sous-couche de nickel sur la lame, étamé sur la queue (typique)',
    dimensions: 'Lame 1,0 × 0,3 mm, bosse de contact à 0,57 mm de la langue ; queue 0,6 × 0,3 mm (typique)',
  };
  return [
    innerPart({
      id: 'x2.insulator',
      name: 'Isolant et langue du connecteur USB-B',
      parent: PARENT,
      ref: REF,
      material: 'plastic.white',
      meshes: () => [
        {
          name: 'isolant',
          key: 'usbb.int.insulator',
          geometry: insulatorGeometry,
          material: (ctx) => ctx.materials.get('plastic.white'),
        },
      ],
      options: { anchor: [((TONGUE_X0 + TONGUE_X1) / 2) * MM, TONGUE_Y * MM, 0] },
      info: {
        role: 'Porte et isole les quatre contacts ; la langue centrale, que la fiche vient coiffer, présente deux contacts dessus et deux dessous. C’est ce qui reste une fois le connecteur démonté.',
        material: 'PBT chargé de fibre de verre, blanc (typique), auto-extinguible UL94 V-0',
        dimensions: 'Corps 9,6 × 11,35 × 10,25 mm ; langue 5,4 × 5,6 × 3,0 mm',
        tip: 'Le profil « maison » de l’ouverture (deux angles chanfreinés) interdit d’insérer la fiche à l’envers : on parle de détrompage.',
      },
      explode: { direction: [0, 1, 0], distance: 0 },
      labelPriority: 3,
    }),
    innerPart({
      id: 'x2.contacts.bottom',
      name: 'Contacts inférieurs 3 et 4 (X2)',
      parent: PARENT,
      ref: REF,
      material: 'gold',
      quantity: 2,
      meshes: () => contactMeshes('bottom', [3, 4]),
      options: { label: (i) => `Contact ${pinName[2 + i] ?? ''}` },
      info: {
        role: 'D+ (3) et masse (4) : lames à ressort sous la langue ; leurs queues, au rang avant, traversent la carte.',
        ...contactInfo,
        tip: 'Leurs queues sont au rang avant, sous les lames des contacts supérieurs : on ne peut les tirer vers l’arrière qu’une fois ceux-ci extraits.',
        extra: [{ label: 'Rang', value: 'avant (x = −4,2 mm), pastilles 3 et 4' }],
      },
      removal: {
        requires: ['x2.contacts.top'],
        tool: 'pliers-flat',
        motion: 'translate',
        axis: toParent(REF, [1, 0, 0]),
        distance: 0.016,
        stagger: 0.3,
        gesture: 'Saisir chaque queue à la pince plate et tirer le contact vers l’arrière hors de son canal.',
      },
      explode: { direction: toParent(REF, [1, 0, 0]), distance: 0.016 },
      labelPriority: 4,
    }),
    innerPart({
      id: 'x2.contacts.top',
      name: 'Contacts supérieurs 1 et 2 (X2)',
      parent: PARENT,
      ref: REF,
      material: 'gold',
      quantity: 2,
      meshes: () => contactMeshes('top', [1, 2]),
      options: { label: (i) => `Contact ${pinName[i] ?? ''}` },
      info: {
        role: 'VBUS (1, +5 V) et D− (2) : lames à ressort sur le dessus de la langue, dont la bosse frotte sur les contacts de la fiche ; leurs queues, au rang arrière, traversent la carte.',
        ...contactInfo,
        tip: 'Côté fiche, les contacts VBUS et GND sont plus longs que D+ et D− : à l’insertion, l’alimentation et la masse s’établissent avant les données.',
        extra: [
          { label: 'Rang', value: 'arrière (x = −2,2 mm), pastilles 1 et 2' },
          { label: 'Courant', value: '1,5 A par contact (typique)' },
        ],
      },
      removal: {
        requires: ['x2.shell'],
        tool: 'pliers-flat',
        motion: 'translate',
        axis: toParent(REF, [1, 0, 0]),
        distance: 0.018,
        stagger: 0.3,
        gesture:
          'Saisir chaque queue à la pince plate et tirer le contact vers l’arrière : ses harpons de retenue raclent le canal de l’isolant.',
      },
      explode: { direction: toParent(REF, [1, 0, 0]), distance: 0.018 },
      labelPriority: 4,
    }),
    innerPart({
      id: 'x2.shell',
      name: 'Coque emboutie du connecteur USB-B',
      parent: PARENT,
      ref: REF,
      material: 'steel.zinc',
      create: () => ({
        meshes: [
          {
            name: 'coque',
            key: 'usbb.int.shell',
            geometry: shellGeometry,
            material: (ctx) => ctx.materials.get('steel.zinc'),
          },
          {
            name: 'volet arrière',
            key: 'usbb.int.flap',
            geometry: flapGeometry,
            material: (ctx) => ctx.materials.get('steel.zinc'),
            locals: [mat(0, (Y0 + USB.H) * MM, 0)],
            dynamic: true,
          },
          {
            name: 'pattes de fixation',
            key: 'usbb.int.leg',
            geometry: legGeometry,
            material: (ctx) => ctx.materials.get('steel.zinc'),
            locals: legs.map(([x, z]) => mat(x, 0, z)),
          },
        ],
        options: {
          anchor: [0.2 * MM, (Y0 + USB.H - 1.0) * MM, 0],
          hooks: (meshes, inner) => shellHooks(meshes, inner, shellRemoval),
        },
      }),
      info: {
        role: 'Blindage relié à la masse USB, guide de la fiche et tenue mécanique : ses deux grosses pattes, brasées dans la carte, encaissent les efforts du câble.',
        material:
          'Tôle d’acier de 0,3 mm découpée, pliée et agrafée, étamée (typique ; nickelée sur certains modèles)',
        dimensions:
          '16,3 × 12,0 × 10,9 mm ; ouverture « maison » 8,45 × 7,78 mm ; pattes de fixation 2,0 × 0,3 mm',
        tip: 'La coque n’est ni collée ni soudée à l’isolant : un volet arrière rabattu et des agrafes la retiennent. Le fond est fendu à l’arrière pour laisser passer les queues des contacts.',
      },
      removal: shellRemoval,
      explode: { direction: toParent(REF, [-1, 0, 0]), distance: 0.02 },
      labelPriority: 4,
    }),
  ];
}
