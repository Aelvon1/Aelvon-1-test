/**
 * Passifs CMS paramétriques : résistances et condensateurs céramiques (0603), ferrite (0805),
 * varistances (0603), fusible réarmable (1812), réseaux de 4 résistances (1206 « CAY16 »),
 * LED 0805 à lentille transparente, résonateur céramique 3 bornes.
 *
 * Chaque modèle : corps (arêtes arrondies), terminaisons étamées enveloppantes, marquage éventuel
 * (code EIA des résistances), ménisques concaves sur chaque terminaison.
 */
import type * as THREE from 'three/webgpu';
import { L_SMD_SEAT, MM } from '../constants';
import { FOOTPRINTS, type FootprintId, type PadDef } from '../footprints';
import { own, type Ctx } from '../params';
import { filletPath, mat, roundedBox, sweepStrip, type P2 } from './geometry';
import { padAlongLat, padFrame } from './chips';
import type { ComponentModel, ModelMesh } from './model';
import { filletRing } from './solder';

type MaterialRef = (ctx: Ctx) => THREE.Material;

const base =
  (id: string): MaterialRef =>
  (ctx) =>
    ctx.materials.get(id);
const ownMat =
  (key: string): MaterialRef =>
  (ctx) =>
    own(ctx, key);
const marking =
  (id: string): MaterialRef =>
  (ctx) =>
    own(ctx, `mark.${id}.q${ctx.quality}`);

/** Ménisques d'une terminaison de composant à 2 bornes (repère pastille, X vers l'extérieur). */
function chipJoint(
  pad: PadDef,
  termInner: number,
  termOuter: number,
  width: number,
  height: number,
  fine: boolean,
): THREE.BufferGeometry {
  const [along, lat] = padAlongLat(pad);
  const foot: [number, number, number, number] = [
    termInner * MM,
    (-width / 2) * MM,
    termOuter * MM,
    (width / 2) * MM,
  ];
  const padR: [number, number, number, number] = [
    (-along / 2) * MM,
    (-lat / 2) * MM,
    (along / 2) * MM,
    (lat / 2) * MM,
  ];
  foot[2] = Math.min(foot[2], padR[2] - 0.04 * MM);
  foot[1] = Math.max(foot[1], padR[1] + 0.01 * MM);
  foot[3] = Math.min(foot[3], padR[3] - 0.01 * MM);
  const h = height * MM;
  return filletRing(
    { foot, pad: padR, hToe: h * 0.62, hHeel: h * 0.05, hSide: h * 0.3 },
    fine ? 56 : 20,
    fine ? 8 : 3,
  );
}

export interface Chip2Spec {
  footprint: FootprintId;
  /** Longueur, largeur, épaisseur du composant (mm). */
  L: number;
  W: number;
  H: number;
  /** Longueur des terminaisons (mm). */
  term: number;
  /** Matériau du corps (céramique, ferrite…). */
  body: MaterialRef;
  /** Résistance : substrat blanc + couche de protection noire marquée (identifiant de marquage). */
  resistorMarking?: string;
  /** Zone marquée sur le dessus (fusible) : identifiant et dimensions (mm). */
  topMarking?: { id: string; size: P2 };
}

/** Composant CMS à 2 terminaisons (0603, 0805, 1812). */
export function chip2Model(spec: Chip2Spec, cacheKey: string): ComponentModel {
  const fp = FOOTPRINTS[spec.footprint];
  const pitch = Math.abs(fp.pads[1]!.x - fp.pads[0]!.x);
  const meshes: ModelMesh[] = [];
  const y0 = L_SMD_SEAT;
  const L = spec.L * MM;
  const W = spec.W * MM;
  const H = spec.H * MM;
  const t = spec.term * MM;
  const r = Math.min(spec.W, spec.H) * 0.08 * MM;
  if (spec.resistorMarking) {
    // Substrat d'alumine blanc, puis couche résistive protégée par un vernis noir marqué.
    meshes.push({
      name: 'substrat',
      key: `${cacheKey}.substrate`,
      geometry: () => roundedBox(L - 2 * t + 0.02 * MM, W * 0.98, H - 0.07 * MM, { r, rt: r, y0 }),
      material: base('ceramic.white'),
    });
    meshes.push({
      name: 'vernis marqué',
      key: `${cacheKey}.overcoat`,
      geometry: () =>
        roundedBox(1.0 * MM * (spec.L / 1.6), W * 0.9, 0.06 * MM, {
          r: 0.05 * MM,
          rt: 0.03 * MM,
          y0: y0 + H - 0.08 * MM,
          uvSize: [1.0 * MM * (spec.L / 1.6), 0.7 * MM * (spec.W / 0.8)],
        }),
      material: marking(spec.resistorMarking),
    });
  } else {
    meshes.push({
      name: 'corps',
      key: `${cacheKey}.body`,
      geometry: () =>
        roundedBox(L - 0.02 * MM, W, H, {
          r,
          rt: r * 1.5,
          y0,
          ...(spec.topMarking
            ? { uvSize: [spec.topMarking.size[0] * MM, spec.topMarking.size[1] * MM] as P2 }
            : {}),
        }),
      material: spec.topMarking ? marking(spec.topMarking.id) : spec.body,
    });
  }
  // Terminaisons enveloppantes (étain sur barrière de nickel).
  const termGeo = () =>
    roundedBox(t, W + 0.03 * MM, H + 0.02 * MM, {
      r: r * 1.2,
      rt: 0.04 * MM,
      rb: 0.02 * MM,
      y0: y0 - 0.005 * MM,
    });
  meshes.push({
    name: 'terminaisons',
    key: `${cacheKey}.term`,
    geometry: termGeo,
    material: base('tin'),
    locals: [mat(-(L / 2 - t / 2), 0, 0), mat(L / 2 - t / 2, 0, 0)],
  });
  // Ménisques : repère pastille (bout de terminaison à L/2 − pas/2 du centre de pastille).
  const outer = spec.L / 2 - pitch / 2;
  const inner = outer - spec.term;
  for (const lod of ['low', 'detail'] as const) {
    meshes.push({
      name: lod === 'low' ? 'ménisques' : 'ménisques fins',
      key: `${cacheKey}.joint.${lod}`,
      geometry: () => chipJoint(fp.pads[1]!, inner, outer, spec.W + 0.03, spec.H, lod === 'detail'),
      material: base('solder'),
      locals: fp.pads.map((p) => padFrame(p)),
      joint: 'top',
      lod,
    });
  }
  return { meshes };
}

// --- Réseau de 4 résistances (1206 convexe) ---------------------------------------------------------

export function resistorArrayModel(markingId: string): ComponentModel {
  const fp = FOOTPRINTS.RN4;
  const y0 = L_SMD_SEAT;
  const dirOf = (p: PadDef): [number, number] => [0, Math.sign(p.y)];
  const meshes: ModelMesh[] = [
    {
      name: 'substrat',
      key: 'rn4.substrate',
      geometry: () => roundedBox(3.2 * MM, 1.55 * MM, 0.42 * MM, { r: 0.08 * MM, rt: 0.05 * MM, y0 }),
      material: base('ceramic.white'),
    },
    {
      name: 'vernis marqué',
      key: 'rn4.overcoat',
      geometry: () =>
        roundedBox(2.6 * MM, 1.1 * MM, 0.07 * MM, {
          r: 0.08 * MM,
          rt: 0.035 * MM,
          y0: y0 + 0.4 * MM,
          uvSize: [2.4 * MM, 1.0 * MM],
        }),
      material: marking(markingId),
    },
    {
      name: 'terminaisons',
      key: 'rn4.term',
      // Terminaison convexe : demi-anneau enveloppant le bord long (repère pastille, X vers l'extérieur).
      geometry: () =>
        roundedBox(0.34 * MM, 0.42 * MM, 0.47 * MM, {
          r: 0.1 * MM,
          rt: 0.05 * MM,
          rb: 0.02 * MM,
          y0: y0 - 0.005 * MM,
        }).translate((0.8 - 0.85 - 0.1) * MM, 0, 0),
      material: base('tin'),
      locals: fp.pads.map((p) => padFrame(p, dirOf(p))),
    },
  ];
  for (const lod of ['low', 'detail'] as const) {
    meshes.push({
      name: lod === 'low' ? 'ménisques' : 'ménisques fins',
      key: `rn4.joint.${lod}`,
      geometry: () => {
        const pad = fp.pads[0]!;
        const [along, lat] = padAlongLat(pad, dirOf(pad));
        const foot: [number, number, number, number] = [-0.32 * MM, -0.16 * MM, 0.0 * MM, 0.16 * MM];
        const padR: [number, number, number, number] = [
          (-along / 2) * MM,
          (-lat / 2) * MM,
          (along / 2) * MM,
          (lat / 2) * MM,
        ];
        return filletRing(
          { foot, pad: padR, hToe: 0.28 * MM, hHeel: 0.02 * MM, hSide: 0.1 * MM },
          lod === 'detail' ? 40 : 14,
          lod === 'detail' ? 7 : 3,
        );
      },
      material: base('solder'),
      locals: fp.pads.map((p) => padFrame(p, dirOf(p))),
      joint: 'top',
      lod,
    });
  }
  return { meshes };
}

// --- LED 0805 ----------------------------------------------------------------------------------------

/**
 * LED CMS 0805 : substrat blanc, lentille époxy transparente teintée (transmission), puce et fil
 * de liaison visibles à travers la lentille, terminaisons étamées.
 */
export function led0805Model(lens: 'led.yellow' | 'led.green'): ComponentModel {
  const fp = FOOTPRINTS.LED0805;
  const y0 = L_SMD_SEAT;
  const meshes: ModelMesh[] = [
    {
      name: 'substrat',
      key: 'led0805.substrate',
      geometry: () => roundedBox(2.0 * MM, 1.25 * MM, 0.3 * MM, { r: 0.06 * MM, rt: 0.03 * MM, y0 }),
      material: base('plastic.white'),
    },
    {
      name: 'lentille',
      key: 'led0805.lens',
      geometry: () =>
        roundedBox(1.9 * MM, 1.2 * MM, 0.5 * MM, {
          r: 0.1 * MM,
          rt: 0.12 * MM,
          rb: 0.01 * MM,
          y0: y0 + 0.3 * MM,
        }),
      material: base(lens),
    },
    {
      name: 'puce',
      key: 'led0805.die',
      geometry: () =>
        roundedBox(0.28 * MM, 0.28 * MM, 0.12 * MM, {
          r: 0.02 * MM,
          rt: 0.01 * MM,
          y0: y0 + 0.3 * MM,
        }).translate(-0.25 * MM, 0, 0),
      material: base('silicon.die'),
    },
    {
      name: 'fil de liaison',
      key: 'led0805.wire',
      geometry: () => {
        const pts: P2[] = [
          [-0.25 * MM, (0.3 + 0.12) * MM + y0],
          [-0.1 * MM, (0.3 + 0.32) * MM + y0],
          [0.35 * MM, (0.3 + 0.3) * MM + y0],
          [0.55 * MM, (0.3 + 0.01) * MM + y0],
        ];
        return sweepStrip(filletPath(pts, 0.12 * MM, 6), 0.025 * MM, () => 0.025 * MM, {
          cornerR: 0.012 * MM,
          segs: 2,
        });
      },
      material: base('gold'),
    },
    {
      name: 'terminaisons',
      key: 'led0805.term',
      geometry: () =>
        roundedBox(0.3 * MM, 1.27 * MM, 0.33 * MM, {
          r: 0.04 * MM,
          rt: 0.03 * MM,
          rb: 0.01 * MM,
          y0: y0 - 0.005 * MM,
        }),
      material: base('tin'),
      locals: [mat(-0.85 * MM, 0, 0), mat(0.85 * MM, 0, 0)],
    },
  ];
  for (const lod of ['low', 'detail'] as const) {
    meshes.push({
      name: lod === 'low' ? 'ménisques' : 'ménisques fins',
      key: `led0805.joint.${lod}`,
      geometry: () => chipJoint(fp.pads[1]!, 0.0 - 0.3, 0.0, 1.27, 0.34, lod === 'detail'),
      material: base('solder'),
      locals: fp.pads.map((p) => padFrame(p)),
      joint: 'top',
      lod,
    });
  }
  return { meshes };
}

// --- Résonateur céramique 3 bornes -----------------------------------------------------------------

export function resonatorModel(): ComponentModel {
  const fp = FOOTPRINTS.RESONATOR3;
  const y0 = L_SMD_SEAT;
  const dir: [number, number] = [0, 1];
  const meshes: ModelMesh[] = [
    {
      name: 'corps',
      key: 'res3.body',
      geometry: () =>
        roundedBox(3.2 * MM, 1.3 * MM, 0.9 * MM, {
          r: 0.1 * MM,
          rt: 0.1 * MM,
          y0,
          uvSize: [3.1 * MM, 1.2 * MM],
        }),
      material: marking('y2.top'),
    },
    {
      name: 'bornes',
      key: 'res3.term',
      // Bande enveloppant le corps (dessous et deux flancs), 0,4 mm de large.
      geometry: () =>
        roundedBox(0.4 * MM, 1.34 * MM, 0.5 * MM, {
          r: 0.05 * MM,
          rt: 0.04 * MM,
          rb: 0.01 * MM,
          y0: y0 - 0.005 * MM,
        }),
      material: base('tin'),
      locals: [-1.2, 0, 1.2].map((x) => mat(x * MM, 0, 0)),
    },
  ];
  for (const lod of ['low', 'detail'] as const) {
    meshes.push({
      name: lod === 'low' ? 'ménisques' : 'ménisques fins',
      key: `res3.joint.${lod}`,
      geometry: () => {
        const pad = fp.pads[0]!;
        const [along, lat] = padAlongLat(pad, dir);
        const foot: [number, number, number, number] = [-0.67 * MM, -0.2 * MM, 0.67 * MM, 0.2 * MM];
        const padR: [number, number, number, number] = [
          (-along / 2) * MM,
          (-lat / 2) * MM,
          (along / 2) * MM,
          (lat / 2) * MM,
        ];
        return filletRing(
          { foot, pad: padR, hToe: 0.3 * MM, hHeel: 0.3 * MM, hSide: 0.05 * MM },
          lod === 'detail' ? 48 : 16,
          lod === 'detail' ? 7 : 3,
        );
      },
      material: base('solder'),
      locals: fp.pads.map((p) => padFrame(p, dir)),
      joint: 'top',
      lod,
    });
  }
  return { meshes };
}

// --- Catalogue des passifs -----------------------------------------------------------------------

export const R0603 = (markingId: string): Chip2Spec => ({
  footprint: 'R0603',
  L: 1.6,
  W: 0.8,
  H: 0.45,
  term: 0.3,
  body: base('ceramic.white'),
  resistorMarking: markingId,
});

export const C0603 = (dielectric: 'c0g' | 'x7r' | 'x5r'): Chip2Spec => ({
  footprint: 'C0603',
  L: 1.6,
  W: 0.8,
  H: 0.8,
  term: 0.35,
  body: ownMat(`mlcc.${dielectric}`),
});

export const VARISTOR0603: Chip2Spec = {
  footprint: 'R0603',
  L: 1.6,
  W: 0.8,
  H: 0.8,
  term: 0.35,
  body: ownMat('varistor'),
};

export const FERRITE0805: Chip2Spec = {
  footprint: 'L0805',
  L: 2.0,
  W: 1.25,
  H: 0.85,
  term: 0.45,
  body: ownMat('ferrite'),
};

export const FUSE1812: Chip2Spec = {
  footprint: 'F1812',
  L: 4.5,
  W: 3.2,
  H: 0.85,
  term: 0.6,
  body: ownMat('ferrite'),
  topMarking: { id: 'f1.top', size: [4.3, 3.0] },
};
