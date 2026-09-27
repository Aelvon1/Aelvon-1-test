/**
 * Boîtiers moulés CMS paramétriques : SOT-23 (3 et 5 broches), SOT-223, MSOP-8, QFN-32 5 × 5,
 * SMA (DO-214AC). Cotes des fiches JEDEC (valeurs nominales, « typique » sinon).
 *
 * Chaque boîtier produit un `ComponentModel` : corps en résine (dépouille, arête de joint de
 * moulage, arêtes arrondies, marquage laser sur le dessus), pattes étamées balayées (épaisseur
 * réelle, rayons de pliage), ménisques de soudure sur chaque patte (version légère + version
 * fine chargée à l'approche).
 */
import type * as THREE from 'three/webgpu';
import { L_SMD_SEAT, MM } from '../constants';
import { FOOTPRINTS, type FootprintId, type PadDef } from '../footprints';
import { own, type Ctx } from '../params';
import { filletPath, loftRoundedRect, mat, sweepStrip, type LoftSection, type P2 } from './geometry';
import type { ComponentModel, ModelMesh } from './model';
import { filletRing } from './solder';

/** Direction de sortie d'une patte (repère empreinte) : vers le bord le plus proche du boîtier. */
export function outwardDir(pad: PadDef): [number, number] {
  if (pad.fanout) return [pad.fanout.dx, pad.fanout.dy];
  return Math.abs(pad.x) * 1.0001 >= Math.abs(pad.y)
    ? [Math.sign(pad.x) || 1, 0]
    : [0, Math.sign(pad.y) || 1];
}

/** Matrice « repère pastille » (X vers l'extérieur) → repère composant (m). */
export function padFrame(pad: PadDef, dir: readonly [number, number] = outwardDir(pad)): THREE.Matrix4 {
  return mat(pad.x * MM, 0, -pad.y * MM, 0, Math.atan2(dir[1], dir[0]), 0);
}

/** Longueur (selon la sortie) et largeur (latérale) d'une pastille, en mm. */
export function padAlongLat(pad: PadDef, dir: readonly [number, number] = outwardDir(pad)): [number, number] {
  return dir[0] !== 0 ? [pad.w, pad.h] : [pad.h, pad.w];
}

export interface MoldedBodySpec {
  /** Dimensions du corps (mm) : selon X local, selon Z local, hauteur. */
  w: number;
  d: number;
  h: number;
  /** Garde au sol sous le corps (mm). */
  standoff: number;
  /** Hauteur du plan de joint (mm, depuis le bas du corps). */
  parting: number;
  /** Rayon des angles en plan et des arêtes supérieures (mm). */
  r: number;
  rt: number;
  /** Dépouille : retrait (mm) de chaque flanc entre le plan de joint et le dessus. */
  draft: number;
}

/** Corps moulé : partie basse, bourrelet du plan de joint, partie haute en dépouille, arêtes arrondies. */
export function moldedBodySections(b: MoldedBodySpec): LoftSection[] {
  const s = (y: number, inset: number): LoftSection => ({
    y: y * MM,
    w: (b.w - 2 * inset) * MM,
    d: (b.d - 2 * inset) * MM,
    r: Math.max(0.01, b.r - inset * 0.5) * MM,
  });
  const y0 = b.standoff;
  const yp = y0 + b.parting;
  const yt = y0 + b.h;
  const out: LoftSection[] = [
    s(y0, b.draft * 0.6 + 0.02),
    s(y0 + 0.02, b.draft * 0.6),
    s(yp - 0.01, 0.0),
    s(yp + 0.01, 0.0),
  ];
  const steps = 3;
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2);
    out.push(s(yt - b.rt + b.rt * Math.sin(a), b.draft + b.rt * (1 - Math.cos(a))));
  }
  return out;
}

/** Profil d'une patte en aile de mouette (repère pastille, mm). */
export interface GullLeadSpec {
  /** Position du bord du corps (selon X pastille, négatif = côté corps). */
  bodyEdge: number;
  /** Hauteur de sortie (axe de la patte) au-dessus du plan d'assise (mm). */
  exitY: number;
  /** Abscisse de la pointe (mm). */
  tip: number;
  /** Longueur du pied à plat (mm). */
  foot: number;
  width: number;
  thickness: number;
}

function gullLeadGeometry(spec: GullLeadSpec, fine: boolean): THREE.BufferGeometry {
  const t = spec.thickness;
  const pts: P2[] = [
    [(spec.bodyEdge - 0.25) * MM, spec.exitY * MM],
    [(spec.bodyEdge + 0.12) * MM, spec.exitY * MM],
    [(spec.tip - spec.foot + 0.02) * MM, (t / 2) * MM],
    [spec.tip * MM, (t / 2) * MM],
  ];
  const path = filletPath(pts, t * 1.2 * MM, fine ? 8 : 4);
  return sweepStrip(path, t * MM, () => spec.width * MM, {
    cornerR: t * 0.25 * MM,
    segs: fine ? 2 : 1,
  }).translate(0, L_SMD_SEAT, 0);
}

/** Ménisque d'une patte en aile de mouette (repère pastille). */
function gullJoint(
  spec: GullLeadSpec,
  padAlong: number,
  padLat: number,
  fine: boolean,
): THREE.BufferGeometry {
  const foot: [number, number, number, number] = [
    (spec.tip - spec.foot) * MM,
    (-spec.width / 2) * MM,
    spec.tip * MM,
    (spec.width / 2) * MM,
  ];
  const pad: [number, number, number, number] = [
    (-padAlong / 2) * MM,
    (-padLat / 2) * MM,
    (padAlong / 2) * MM,
    (padLat / 2) * MM,
  ];
  // Le pied doit rester dans la pastille (sinon on le rogne).
  foot[0] = Math.max(foot[0], pad[0] + 0.02 * MM);
  foot[2] = Math.min(foot[2], pad[2] - 0.03 * MM);
  const h = (L_SMD_SEAT / MM + spec.thickness) * MM;
  return filletRing(
    { foot, pad, hToe: h * 0.75, hHeel: h * 1.9, hSide: h * 0.55 },
    fine ? 56 : 20,
    fine ? 8 : 3,
  );
}

export interface LeadedPackageSpec {
  footprint: FootprintId;
  body: MoldedBodySpec;
  /** Marquage (identifiant `markings.ts`). */
  marking: string;
  /** Dimensions de la zone marquée (mm). */
  markingSize: P2;
  /** Pattes par numéro de broche (les absentes ne sont pas dessinées). */
  lead: (pad: PadDef) => GullLeadSpec | null;
}

/** Modèle d'un boîtier à pattes en aile de mouette. */
export function leadedPackage(spec: LeadedPackageSpec, cacheKey: string): ComponentModel {
  const fp = FOOTPRINTS[spec.footprint];
  const meshes: ModelMesh[] = [];
  meshes.push({
    name: 'corps',
    key: `${cacheKey}.body`,
    geometry: () =>
      loftRoundedRect(moldedBodySections(spec.body), {
        cornerSegments: 3,
        uvSize: [spec.markingSize[0] * MM, spec.markingSize[1] * MM],
      }).translate(0, L_SMD_SEAT, 0),
    material: (ctx: Ctx) => own(ctx, `mark.${spec.marking}.q${ctx.quality}`),
  });
  // Pattes regroupées par profil identique.
  const groups = new Map<
    string,
    { lead: GullLeadSpec; along: number; lat: number; locals: THREE.Matrix4[] }
  >();
  for (const pad of fp.pads) {
    const lead = spec.lead(pad);
    if (!lead) continue;
    const dir = outwardDir(pad);
    const [along, lat] = padAlongLat(pad, dir);
    const k = `${lead.width}:${lead.tip}:${lead.bodyEdge}:${lead.exitY}:${along}:${lat}`;
    let g = groups.get(k);
    if (!g) {
      g = { lead, along, lat, locals: [] };
      groups.set(k, g);
    }
    g.locals.push(padFrame(pad, dir));
  }
  let n = 0;
  for (const g of groups.values()) {
    const id = `${cacheKey}.lead${n++}`;
    meshes.push({
      name: 'pattes',
      key: `${id}`,
      geometry: () => gullLeadGeometry(g.lead, true),
      material: (ctx) => ctx.materials.get('tin'),
      locals: g.locals,
    });
    meshes.push({
      name: 'ménisques',
      key: `${id}.joint.low`,
      geometry: () => gullJoint(g.lead, g.along, g.lat, false),
      material: (ctx) => ctx.materials.get('solder'),
      locals: g.locals,
      joint: 'top',
      lod: 'low',
    });
    meshes.push({
      name: 'ménisques fins',
      key: `${id}.joint.fine`,
      geometry: () => gullJoint(g.lead, g.along, g.lat, true),
      material: (ctx) => ctx.materials.get('solder'),
      locals: g.locals,
      joint: 'top',
      lod: 'detail',
    });
  }
  return { meshes };
}

// --- Boîtiers ------------------------------------------------------------------------------------

/** SOT-23 (3 broches) : 2,9 × 1,3 × 1,0 mm, pattes 0,4 × 0,13 mm, envergure 2,4 mm. */
export const SOT23_3: LeadedPackageSpec = {
  footprint: 'SOT23-3',
  body: { w: 2.9, d: 1.3, h: 0.95, standoff: 0.06, parting: 0.45, r: 0.08, rt: 0.08, draft: 0.05 },
  marking: 't1.top',
  markingSize: [2.8, 1.2],
  lead: () => ({ bodyEdge: 0.65 - 1.1, exitY: 0.5, tip: 1.2 - 1.1, foot: 0.42, width: 0.4, thickness: 0.13 }),
};

/** SOT-23-5 : mêmes cotes, pattes 0,38 mm au pas de 0,95 mm. */
export const SOT23_5: LeadedPackageSpec = {
  footprint: 'SOT23-5',
  body: { w: 2.9, d: 1.6, h: 0.95, standoff: 0.06, parting: 0.45, r: 0.08, rt: 0.08, draft: 0.05 },
  marking: 'u2.top',
  markingSize: [2.8, 1.5],
  lead: () => ({ bodyEdge: 0.8 - 1.1, exitY: 0.5, tip: 1.4 - 1.1, foot: 0.45, width: 0.38, thickness: 0.13 }),
};

/** SOT-223 : 6,5 × 3,5 × 1,6 mm, 3 pattes de 0,7 mm et languette de 3,0 mm, envergure 7,0 mm. */
export const SOT223: LeadedPackageSpec = {
  footprint: 'SOT223',
  body: { w: 6.5, d: 3.5, h: 1.6, standoff: 0.06, parting: 0.8, r: 0.15, rt: 0.12, draft: 0.08 },
  marking: 'u1.top',
  markingSize: [6.3, 3.3],
  lead: (pad) =>
    pad.num === '4'
      ? { bodyEdge: 1.75 - 3.15, exitY: 0.82, tip: 3.5 - 3.15, foot: 0.9, width: 3.0, thickness: 0.26 }
      : { bodyEdge: 1.75 - 3.15, exitY: 0.82, tip: 3.5 - 3.15, foot: 0.9, width: 0.7, thickness: 0.26 },
};

/** MSOP-8 : 3 × 3 × 0,86 mm, pattes 0,3 × 0,15 mm au pas de 0,65 mm, envergure 4,9 mm. */
export const MSOP8: LeadedPackageSpec = {
  footprint: 'MSOP8',
  body: { w: 3.0, d: 3.0, h: 0.86, standoff: 0.08, parting: 0.42, r: 0.08, rt: 0.07, draft: 0.04 },
  marking: 'u5.top',
  markingSize: [2.9, 2.9],
  lead: () => ({
    bodyEdge: 1.5 - 2.2,
    exitY: 0.47,
    tip: 2.45 - 2.2,
    foot: 0.55,
    width: 0.3,
    thickness: 0.15,
  }),
};

// --- QFN-32 --------------------------------------------------------------------------------------

/** Plot de QFN : partie visible du plot sur la tranche du boîtier (repère pastille). */
function qfnTerminal(): THREE.BufferGeometry {
  // Le plot affleure la tranche (dépasse de 5 µm pour rester visible) : 0,4 × 0,25 × 0,2 mm.
  return loftRoundedRect(
    [
      { y: L_SMD_SEAT - 0.005 * MM, w: 0.4 * MM, d: 0.25 * MM, r: 0.02 * MM, ox: -0.145 * MM },
      { y: L_SMD_SEAT + 0.2 * MM, w: 0.4 * MM, d: 0.25 * MM, r: 0.02 * MM, ox: -0.145 * MM },
    ],
    { cornerSegments: 2 },
  );
}

function qfnJoint(fine: boolean): THREE.BufferGeometry {
  const foot: [number, number, number, number] = [-0.34 * MM, -0.125 * MM, 0.055 * MM, 0.125 * MM];
  const pad: [number, number, number, number] = [-0.42 * MM, -0.14 * MM, 0.42 * MM, 0.14 * MM];
  return filletRing(
    { foot, pad, hToe: 0.2 * MM, hHeel: 0.0, hSide: 0.03 * MM },
    fine ? 40 : 14,
    fine ? 7 : 3,
  );
}

/** QFN-32 5 × 5 × 0,85 mm, pas 0,5 mm, plots latéraux visibles, pastille thermique brasée. */
export function qfn32Model(): ComponentModel {
  const fp = FOOTPRINTS.QFN32;
  const locals = fp.pads.filter((p) => p.num !== '33').map((p) => padFrame(p));
  return {
    meshes: [
      {
        name: 'corps',
        key: 'qfn32.body',
        geometry: () =>
          loftRoundedRect(
            [
              { y: L_SMD_SEAT + 0.02 * MM, w: 5.0 * MM, d: 5.0 * MM, r: 0.08 * MM },
              { y: L_SMD_SEAT + 0.8 * MM, w: 5.0 * MM, d: 5.0 * MM, r: 0.08 * MM },
              { y: L_SMD_SEAT + 0.84 * MM, w: 4.97 * MM, d: 4.97 * MM, r: 0.07 * MM },
              { y: L_SMD_SEAT + 0.86 * MM, w: 4.9 * MM, d: 4.9 * MM, r: 0.05 * MM },
            ],
            { cornerSegments: 3, uvSize: [4.9 * MM, 4.9 * MM] },
          ),
        material: (ctx) => own(ctx, `mark.u3.top.q${ctx.quality}`),
      },
      {
        name: 'plots',
        key: 'qfn32.terminal',
        geometry: qfnTerminal,
        material: (ctx) => ctx.materials.get('tin'),
        locals,
      },
      {
        name: 'ménisques',
        key: 'qfn32.joint.low',
        geometry: () => qfnJoint(false),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'low',
      },
      {
        name: 'ménisques fins',
        key: 'qfn32.joint.fine',
        geometry: () => qfnJoint(true),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'detail',
      },
    ],
  };
}

// --- SMA (DO-214AC) ----------------------------------------------------------------------------

/** Borne en J repliée sous le corps (repère pastille ; bord du corps à x = +0,05 mm). */
function smaTerminal(fine: boolean): THREE.BufferGeometry {
  const t = 0.2;
  const e = 0.05;
  const pts: P2[] = [
    [(e - 0.45) * MM, 0.75 * MM],
    [(e + 0.22) * MM, 0.75 * MM],
    [(e + 0.22) * MM, (t / 2) * MM],
    [(e - 0.75) * MM, (t / 2) * MM],
  ];
  return sweepStrip(filletPath(pts, 0.18 * MM, fine ? 8 : 4), t * MM, () => 1.45 * MM, {
    cornerR: 0.05 * MM,
    segs: 2,
  }).translate(0, L_SMD_SEAT, 0);
}

function smaJoint(fine: boolean): THREE.BufferGeometry {
  const foot: [number, number, number, number] = [-0.75 * MM, -0.72 * MM, 0.37 * MM, 0.72 * MM];
  const pad: [number, number, number, number] = [-0.8 * MM, -0.95 * MM, 0.8 * MM, 0.95 * MM];
  return filletRing(
    { foot, pad, hToe: 0.55 * MM, hHeel: 0.02 * MM, hSide: 0.12 * MM },
    fine ? 48 : 18,
    fine ? 8 : 3,
  );
}

/** Diode SMA : corps 4,3 × 2,6 × 2,1 mm, bande de cathode, bornes en J. */
export function smaModel(): ComponentModel {
  const fp = FOOTPRINTS.SMA;
  const locals = fp.pads.map((p) => padFrame(p));
  return {
    meshes: [
      {
        name: 'corps',
        key: 'sma.body',
        geometry: () =>
          loftRoundedRect(
            moldedBodySections({
              w: 4.3,
              d: 2.6,
              h: 2.1,
              standoff: 0.1,
              parting: 0.9,
              r: 0.15,
              rt: 0.15,
              draft: 0.1,
            }),
            { cornerSegments: 3, uvSize: [4.1 * MM, 2.4 * MM] },
          ).translate(0, L_SMD_SEAT, 0),
        material: (ctx) => own(ctx, `mark.d1.top.q${ctx.quality}`),
      },
      {
        name: 'bornes',
        key: 'sma.terminal',
        geometry: () => smaTerminal(true),
        material: (ctx) => ctx.materials.get('tin'),
        locals,
      },
      {
        name: 'ménisques',
        key: 'sma.joint.low',
        geometry: () => smaJoint(false),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'low',
      },
      {
        name: 'ménisques fins',
        key: 'sma.joint.fine',
        geometry: () => smaJoint(true),
        material: (ctx) => ctx.materials.get('solder'),
        locals,
        joint: 'top',
        lod: 'detail',
      },
    ],
  };
}
