/**
 * Condensateur électrolytique aluminium CMS 47 µF 25 V (PC1, PC2) — niveau 3 : intérieur.
 *
 * Construction d'un « V-chip » : un condensateur radial classique (godet serti sur un bouchon
 * de caoutchouc, enroulement imprégné d'électrolyte) posé sur une embase plastique, ses deux
 * sorties aplaties et repliées sous l'embase. Pièces (enfants du sous-ensemble « pc1 »/« pc2 »,
 * repère local : bornes en x = ±2,7 mm, + côté −X) :
 * - godet aluminium (marquage, bande de polarité −, évent en croix) : découpe du sertissage,
 *   DESTRUCTIF ;
 * - enroulement : papier / anode / papier / cathode, ≈ 8,8 tours, ≈ 8 cm déployé, languettes
 *   d'aluminium ; DÉROULEMENT animé (crochet `onRemovalProgress`, mouvement `unwind`) ;
 * - bouchon de caoutchouc (joint) ;
 * - embase plastique et bornes (base du composant).
 */
import * as THREE from 'three/webgpu';
import { motionTiming } from '../../../inspection/motions';
import type { PartDef, PartHooks, RemovalSpec } from '../../types';
import { L_SMD_SEAT, MM } from '../constants';
import { FOOTPRINTS } from '../footprints';
import { own, type UnoParams } from '../params';
import { padFrame } from '../packages/chips';
import { filletPath, flatDisk, lathe, roundedBox, sweepStrip, type P2 } from '../packages/geometry';
import { perforatedBlock } from '../packages/headers';
import { mergeAll } from './geometry';
import { innerPart, type InnerMesh } from './frame';
import { INT } from './materials';
import { WindingGeometry, type PlanarSample, type WindingSpec } from './winding';

/** Hauteurs (mm, repère du composant). */
const SEAT0 = L_SMD_SEAT / MM + 0.02;
const BASE_H = 0.9;
const RECESS = SEAT0 + BASE_H - 0.3;
const SEAT_TOP = SEAT0 + BASE_H;
/** Godet : rayon extérieur 3,15 mm, paroi 0,25 mm, dessus à 5,8 mm. */
const CAN_R = 3.15;
const CAN_WALL = 0.25;
const CAN_TOP = 5.8;
/** Rainure de sertissage (serre le bouchon). */
const GROOVE = [1.6, 1.8] as const;
const GROOVE_DEPTH = 0.16;
const SEAL_TOP = 1.97;
/** Enroulement : bas et haut des papiers, des feuilles. */
const PAPER = [2.05, 5.4] as const;
const FOIL = [2.35, 5.1] as const;

/** Spirale : noyau 0,45 mm, pas 0,22 mm (papier 50 µm, anode 90 µm, papier 50 µm, cathode 30 µm). */
export const WINDING: WindingSpec = {
  r0: 0.45 * MM,
  pitch: 0.22 * MM,
  // 8,818 tours : place la languette d'anode face à la borne + (−X) et celle de cathode face
  // à la borne − (+X) au repos (voir `TAB_THETA`).
  turns: 8.818,
  samplesPerTurn: 48,
  layers: [
    { name: 'papier intérieur', offset: 0, thickness: 0.05 * MM, y0: PAPER[0] * MM, y1: PAPER[1] * MM },
    { name: 'anode', offset: 0.05 * MM, thickness: 0.09 * MM, y0: FOIL[0] * MM, y1: FOIL[1] * MM },
    {
      name: 'papier extérieur',
      offset: 0.14 * MM,
      thickness: 0.05 * MM,
      y0: PAPER[0] * MM,
      y1: PAPER[1] * MM,
    },
    { name: 'cathode', offset: 0.19 * MM, thickness: 0.03 * MM, y0: FOIL[0] * MM, y1: FOIL[1] * MM },
  ],
};

/** Angles d'attache des languettes (rayon ≈ 1,0 mm, en face des sorties). */
export const TAB_THETA = { anode: 2.068 * 2 * Math.PI, cathode: 1.568 * 2 * Math.PI } as const;
const LAYER_MATERIALS = [`${INT}paper`, `${INT}anode`, `${INT}paper`, `${INT}cathode`];

/** Godet creux : paroi, rainure de sertissage, bord roulé, fond intérieur (profil fermé). */
function canGeometry(): THREE.BufferGeometry {
  const R = CAN_R;
  const Ri = R - CAN_WALL;
  const [g0, g1] = GROOVE;
  const d = GROOVE_DEPTH;
  const rt = 0.45;
  const profile: P2[] = [
    [0.001, CAN_TOP - CAN_WALL],
    [Ri - 0.2, CAN_TOP - CAN_WALL],
    [Ri - 0.06, CAN_TOP - CAN_WALL - 0.04],
    [Ri, CAN_TOP - CAN_WALL - 0.2],
    [Ri, g1 + 0.1],
    [Ri - d, g1 - 0.02],
    [Ri - d, g0 + 0.02],
    [Ri, g0 - 0.1],
    [Ri, RECESS + 0.12],
    // Bord roulé (sertissage sur le bouchon).
    [Ri + 0.03, RECESS + 0.04],
    [Ri + 0.12, RECESS],
    [R - 0.06, RECESS + 0.02],
    [R, RECESS + 0.1],
    [R, g0 - 0.1],
    [R - d, g0 + 0.02],
    [R - d, g1 - 0.02],
    [R, g1 + 0.1],
  ];
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    profile.push([R - rt + rt * Math.cos(a), CAN_TOP - rt + rt * Math.sin(a)]);
  }
  return lathe(
    profile.map(([r, y]) => [r * MM, y * MM] as P2),
    56,
  );
}

/** Bouchon de caoutchouc : pincé par la rainure, dessus légèrement bombé. */
function sealGeometry(): THREE.BufferGeometry {
  const Ri = CAN_R - CAN_WALL - 0.02;
  const [g0, g1] = GROOVE;
  const profile: P2[] = [
    [0.001, RECESS + 0.005],
    [Ri - 0.25, RECESS + 0.005],
    [Ri - 0.05, RECESS + 0.05],
    [Ri, RECESS + 0.15],
    [Ri, g0 - 0.1],
    [Ri - GROOVE_DEPTH, g0 + 0.03],
    [Ri - GROOVE_DEPTH, g1 - 0.03],
    [Ri, g1 + 0.1],
    [Ri - 0.08, SEAL_TOP - 0.03],
    [Ri - 0.3, SEAL_TOP],
    [0.001, SEAL_TOP + 0.03],
  ];
  return lathe(
    profile.map(([r, y]) => [r * MM, y * MM] as P2),
    48,
  );
}

/** Contour de l'embase : carré de 6,6 mm, deux angles chanfreinés côté + (−X local). */
function seatOutline(): THREE.Vector2[] {
  const h = 3.3;
  const c = 1.1;
  const pts: P2[] = [
    [-h + c, -h],
    [h, -h],
    [h, h],
    [-h + c, h],
    [-h, h - c],
    [-h, -h + c],
  ];
  return pts.map(([x, z]) => new THREE.Vector2(x * MM, -z * MM));
}

/** Embase : plaque pleine surmontée d'une couronne formant le logement du godet. */
function seatGeometry(): THREE.BufferGeometry {
  const plate = perforatedBlock(seatOutline(), [], SEAT0 * MM, (RECESS - SEAT0) * MM, 0.1 * MM);
  const hole: THREE.Vector2[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    hole.push(new THREE.Vector2(Math.cos(a) * 3.22 * MM, Math.sin(a) * 3.22 * MM));
  }
  const ring = perforatedBlock(
    seatOutline(),
    [hole],
    (RECESS - 0.01) * MM,
    (SEAT_TOP - RECESS + 0.01) * MM,
    0.06 * MM,
  );
  return mergeAll([plate, ring]);
}

/**
 * Borne (repère pastille, X vers l'extérieur) : fil aplati sortant du bouchon, traversant
 * l'embase, replié à plat dessous jusqu'au bord de la pastille.
 */
function terminal(): THREE.BufferGeometry {
  const t = 0.2;
  const pts: P2[] = [
    [-1.7 * MM, 2.1 * MM],
    [-1.7 * MM, (t / 2) * MM],
    [0.95 * MM, (t / 2) * MM],
  ];
  return sweepStrip(filletPath(pts, 0.2 * MM, 6), t * MM, () => 0.65 * MM, {
    cornerR: 0.05 * MM,
    segs: 2,
  }).translate(0, L_SMD_SEAT, 0);
}

/** Languette d'aluminium (repère : X le long de la feuille, Z normale), cousue sur la feuille. */
function tabGeometry(): THREE.BufferGeometry {
  return roundedBox(0.6 * MM, 0.08 * MM, 2.55 * MM, {
    r: 0.02 * MM,
    rt: 0.02 * MM,
    rb: 0.02 * MM,
    y0: 1.05 * MM,
    segs: 2,
  });
}

/** Crochet de déroulement : couches et languettes suivent la longueur déroulée. */
function unwindHooks(
  winding: WindingGeometry,
  meshes: ReadonlyMap<string, THREE.Mesh>,
  removal: RemovalSpec,
): PartHooks {
  const tabs = [
    { mesh: meshes.get('languette d’anode'), layer: 1, theta: TAB_THETA.anode },
    { mesh: meshes.get('languette de cathode'), layer: 3, theta: TAB_THETA.cathode },
  ];
  const out: PlanarSample = { x: 0, z: 0, nx: 0, nz: 0 };
  // Fraction de la durée consacrée au déroulement (phase 1 du mouvement `unwind`).
  const phase = motionTiming(
    { motion: 'unwind', distance: removal.distance, duration: removal.duration },
    1,
  ).a;
  const place = () => {
    for (const tab of tabs) {
      if (!tab.mesh) continue;
      winding.attachment(tab.layer, tab.theta, 0.04 * MM, out);
      tab.mesh.position.set(out.x, 0, out.z);
      // X local le long de la feuille (θ croissants), Z local = normale extérieure.
      tab.mesh.rotation.set(0, Math.atan2(out.nx, out.nz), 0);
    }
  };
  place();
  return {
    onRemovalProgress: (t, info) => {
      if (info.motion !== 'unwind') return;
      const k = Math.min(1, Math.max(0, t / phase));
      const eased = k * k * (3 - 2 * k);
      winding.update(eased * winding.math.length);
      place();
    },
  };
}

export function electrolyticInternalParts(ref: 'PC1' | 'PC2'): PartDef<UnoParams>[] {
  const id = ref.toLowerCase();
  const fp = FOOTPRINTS['CP6.3'];
  const terminalLocals = fp.pads.map((p) => padFrame(p));
  const unwind: RemovalSpec = {
    requires: [`${id}.can`],
    tool: 'tweezers',
    motion: 'unwind',
    axis: [0, 1, 0],
    // Levée finale courte : la bande déroulée reste près du tapis (placement « stay »).
    distance: 0.003,
    duration: 5.5,
    destructive: true,
    after: 'stay',
    gesture:
      'Couper les languettes au ras du bouchon, saisir l’extrémité extérieure et dérouler la bande : papier, anode, papier, cathode.',
  };
  return [
    innerPart({
      id: `${id}.seat`,
      name: `Embase et bornes de ${ref}`,
      parent: id,
      ref,
      material: 'plastic.black',
      meshes: () => [
        {
          name: 'embase',
          key: 'cp63.int.seat',
          geometry: seatGeometry,
          material: (ctx) => ctx.materials.get('plastic.black'),
        },
        {
          name: 'bornes',
          key: 'cp63.int.term',
          geometry: terminal,
          material: (ctx) => ctx.materials.get('tin'),
          locals: terminalLocals,
        },
      ],
      info: {
        role: 'Transforme un condensateur radial en composant CMS : l’embase isolante le tient debout, ses deux sorties aplaties sont repliées dessous pour être brasées.',
        material: 'Plastique thermostable (PPS ou PA46, typique) noir ; fils d’acier cuivré étamé aplatis',
        dimensions: 'Embase 6,6 × 6,6 × 0,9 mm ; bornes 0,65 × 0,2 mm',
        tip: 'Les deux angles chanfreinés de l’embase repèrent le + ; la bande noire du godet, le −.',
      },
      explode: { direction: [0, 1, 0], distance: 0 },
      labelPriority: 2,
    }),
    innerPart({
      id: `${id}.seal`,
      name: `Bouchon de caoutchouc de ${ref}`,
      parent: id,
      ref,
      material: 'rubber.black',
      meshes: () => [
        {
          name: 'bouchon',
          key: 'cp63.int.seal',
          geometry: sealGeometry,
          material: (ctx) => ctx.materials.get('rubber.black'),
        },
      ],
      info: {
        role: 'Ferme le godet et laisse passer les deux sorties ; comprimé par la rainure de sertissage, il retient l’électrolyte liquide.',
        material: 'Caoutchouc butyle (IIR) ou EPDM (typique)',
        dimensions: `Ø ${(2 * (CAN_R - CAN_WALL - 0.02)).toFixed(1).replace('.', ',')} × 1,3 mm`,
        tip: 'Le bouchon laisse diffuser très lentement l’électrolyte : à chaud, un électrolytique s’assèche ; sa durée de vie est donnée à 85 ou 105 °C (typique 2000 h) et double environ tous les 10 °C de moins.',
      },
      removal: {
        requires: [`${id}.winding`],
        tool: 'tweezers',
        motion: 'lift',
        axis: [0, 1, 0],
        distance: 0.008,
        gesture: 'Faire glisser le bouchon le long des sorties aux brucelles.',
      },
      explode: { direction: [0, 1, 0], distance: 0.002 },
      labelPriority: 2,
    }),
    innerPart({
      id: `${id}.winding`,
      name: `Enroulement de ${ref}`,
      parent: id,
      ref,
      material: `uno-board/${INT}anode`,
      create: () => {
        const winding = new WindingGeometry(WINDING);
        const meshes: InnerMesh[] = WINDING.layers.map((layer, k) => ({
          name: layer.name,
          key: `${id}.int.winding.${k}`,
          geometry: () => winding.geometries[k]!,
          material: (ctx) => own(ctx, LAYER_MATERIALS[k]!),
          unique: true,
          dynamic: true,
        }));
        for (const name of ['languette d’anode', 'languette de cathode'])
          meshes.push({
            name,
            key: 'cp63.int.tab',
            geometry: tabGeometry,
            material: (ctx) => ctx.materials.get('alu.machined'),
            dynamic: true,
          });
        return {
          meshes,
          options: {
            anchor: [0, 4 * MM, 0],
            hooks: (byName) => unwindHooks(winding, byName, unwind),
          },
        };
      },
      info: {
        role: 'Le condensateur proprement dit : deux feuilles d’aluminium séparées par du papier imbibé d’électrolyte. L’armature + est l’anode, le diélectrique la fine couche d’alumine formée à sa surface, l’armature − l’électrolyte, relié par la cathode.',
        material:
          'Anode en aluminium gravé (surface multipliée ≈ 50 fois) et oxydé, papier kraft imprégné (électrolyte à base d’éthylène glycol, typique), cathode en aluminium, languettes cousues',
        dimensions:
          'Ø 5,2 × 3,35 mm roulé ; ≈ 8,8 tours, bande de ≈ 8 cm × 3,35 mm une fois déroulée (typique)',
        reference: '47 µF 25 V',
        tip: 'L’alumine ne fait que ≈ 1,4 nm par volt de formation : c’est cette épaisseur infime, sur une surface démultipliée par la gravure, qui donne 47 µF dans 6 mm. Inversé, le courant de fuite détruit l’oxyde, le gaz produit gonfle le godet.',
        extra: [
          { label: 'Empilement', value: 'papier 50 µm, anode 90 µm, papier 50 µm, cathode 30 µm (typique)' },
          { label: 'Languettes', value: 'anode vers la borne +, cathode vers la borne −' },
        ],
      },
      removal: unwind,
      explode: { direction: [0, 1, 0], distance: 0.006 },
      labelPriority: 5,
    }),
    innerPart({
      id: `${id}.can`,
      name: `Godet aluminium de ${ref}`,
      parent: id,
      ref,
      material: 'alu.machined',
      meshes: () => [
        {
          name: 'godet',
          key: 'cp63.int.can',
          geometry: canGeometry,
          material: (ctx) => ctx.materials.get('alu.machined'),
        },
        {
          name: 'dessus marqué',
          key: 'cp63.top',
          geometry: () => flatDisk(2.72 * MM, CAN_TOP * MM, 6.1 * MM, 64),
          material: (ctx) => own(ctx, `mark.pc.top.q${ctx.quality}`),
        },
      ],
      info: {
        role: 'Enveloppe étanche de l’enroulement ; relié à la cathode par l’électrolyte, il n’est pas isolé électriquement.',
        material: 'Aluminium embouti de 0,25 mm (typique) ; marquage à l’encre (valeur, tension, bande −)',
        dimensions: 'Ø 6,3 × 5,1 mm (godet), dessus à 5,8 mm de la carte',
        tip: 'Les entailles en croix du dessus sont un évent de sécurité : en cas de surpression (inversion, surtension, vieillissement), le godet s’ouvre là au lieu d’exploser.',
      },
      removal: {
        tool: 'cutter-flush',
        motion: 'cut',
        axis: [0, 1, 0],
        distance: 0.014,
        destructive: true,
        gesture: 'Couper le bord roulé du sertissage à la pince coupante, puis tirer le godet vers le haut.',
      },
      explode: { direction: [0, 1, 0], distance: 0.012 },
      labelPriority: 4,
    }),
  ];
}
