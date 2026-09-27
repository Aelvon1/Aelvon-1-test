/**
 * Pièces du sous-ensemble « Circuit imprimé » : couches séparables pour l'empilement éclaté
 * (niveau 2 du démontage). L'âme FR4 est la base de l'objet (jamais retirée).
 *
 * Ordre de séparation : sérigraphie → vernis → cuivre, face par face, puis fûts de
 * métallisation. Opération pédagogique : dans la réalité le vernis se gratte, le cuivre se dissout.
 */
import * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { Y_CORE_B, Y_CORE_T, Y_CU_B, Y_CU_T, Y_MASK_B, Y_MASK_T, Y_SILK_B, Y_SILK_T } from '../constants';
import { own, routingOf, type Ctx, type UnoParams } from '../params';
import { instanced } from '../packages/geometry';
import {
  allHoles,
  barrelGeometry,
  barrelMatrix,
  coreGeometry,
  padKey,
  padMatrix,
  sheetGeometry,
  smdPadGeometry,
  thtPadGeometry,
  viaRingGeometry,
} from './layers';
import type { Face } from './artwork';

type Part = PartDef<UnoParams>;

const sheetY: Record<'silk' | 'mask' | 'copper', Record<Face, number>> = {
  silk: { top: Y_SILK_T, bottom: Y_SILK_B },
  mask: { top: Y_MASK_T, bottom: Y_MASK_B },
  copper: { top: Y_CU_T, bottom: Y_CU_B },
};

function sheet(ctx: Ctx, layer: 'silk' | 'mask' | 'copper', face: Face): THREE.Mesh {
  const g = ctx.geometry.get(`pcb.sheet.${layer}.${face}`, () =>
    sheetGeometry(sheetY[layer][face], face === 'bottom'),
  );
  const mesh = new THREE.Mesh(g, own(ctx, `pcb.${layer}.${face}.q${ctx.quality}`));
  mesh.name = `feuille ${layer} ${face}`;
  return mesh;
}

/** Pastilles étamées et anneaux de vias d'une face (instanciés par forme). */
function padsGroup(ctx: Ctx, face: Face): THREE.Group {
  const routing = routingOf(ctx);
  const bottom = face === 'bottom';
  const group = new THREE.Group();
  group.name = `pastilles ${face}`;
  const tin = ctx.materials.get('tin');
  const byKey = new Map<string, { geo: () => THREE.BufferGeometry; mats: THREE.Matrix4[] }>();
  for (const p of routing.pads) {
    if (bottom && p.drill === undefined) continue;
    const key = padKey(p);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { geo: () => (p.drill !== undefined ? thtPadGeometry(p) : smdPadGeometry(p)), mats: [] };
      byKey.set(key, entry);
    }
    entry.mats.push(padMatrix(p, bottom, p.drill !== undefined ? (bottom ? Y_CORE_B : Y_CORE_T) : 0));
  }
  for (const [key, entry] of byKey) {
    const g = ctx.geometry.get(`pcb.pad.${key}`, entry.geo);
    group.add(instanced(g, tin, entry.mats, `pastilles ${key}`));
  }
  const viaMats = routing.vias.map((v) => padMatrix(v, bottom, bottom ? Y_CORE_B : Y_CORE_T));
  group.add(instanced(ctx.geometry.get('pcb.via.ring', viaRingGeometry), tin, viaMats, 'anneaux des vias'));
  return group;
}

const layerInfo = {
  silk: (face: string) => ({
    role: `Repères des composants, libellés des broches et marquages de la face ${face}.`,
    material: 'Encre époxy blanche sérigraphiée puis cuite',
    dimensions: 'Épaisseur ≈ 10 µm ; traits de 0,15 mm, caractères de 0,8 à 3,4 mm',
    tip: 'La sérigraphie est détourée autour des pastilles : de l’encre sur une pastille empêcherait le mouillage de la soudure.',
  }),
  mask: (face: string) => ({
    role: `Isole et protège le cuivre de la face ${face}, empêche les ponts de soudure entre pastilles voisines.`,
    material: 'Vernis épargne époxy photo-imageable (LPI), teinte sarcelle semi-brillante',
    dimensions: 'Épaisseur ≈ 20 µm sur le cuivre ; ouvertures élargies de 0,05 mm autour des pastilles',
    tip: 'Translucide, il laisse deviner les pistes : plus claires là où il recouvre du cuivre, en léger relief.',
  }),
};

/** Pièces du circuit imprimé. */
export function pcbParts(): Part[] {
  const peel = (requires: string[], axis: [number, number, number], gesture: string) => ({
    requires,
    motion: 'peel' as const,
    axis,
    distance: 0.03,
    tool: 'scalpel',
    destructive: true,
    gesture,
  });
  const slide = (requires: string[], gesture: string) => ({
    requires,
    motion: 'translate' as const,
    axis: [0, 0, 1] as [number, number, number],
    distance: 0.085,
    destructive: true,
    gesture,
  });
  const faceName = (f: Face) => (f === 'top' ? 'supérieure' : 'inférieure');
  const parts: Part[] = [
    {
      id: 'pcb',
      name: 'Circuit imprimé nu',
      kind: 'assembly',
      info: {
        role: 'Porte et relie tous les composants : deux couches de cuivre sur une âme isolante, protégées par le vernis.',
        material: 'FR4, cuivre 35 µm, vernis épargne, sérigraphie, finition étain HASL',
        dimensions: '68,6 × 53,4 × 1,6 mm (2,7 × 2,1 po), 2 couches',
        tip: 'Format et implantation d’une carte Uno R3 (matériel libre) ; sérigraphie générique « ATELIER-328 ».',
      },
      explode: { direction: [0, 1, 0], distance: 0 },
      label: { priority: 1 },
    },
    {
      id: 'pcb.core',
      name: 'Âme FR4',
      parent: 'pcb',
      material: 'uno-board/pcb.core',
      build: (ctx) => {
        const routing = routingOf(ctx);
        const mesh = new THREE.Mesh(
          ctx.geometry.get('pcb.core', () => coreGeometry(routing)),
          own(ctx, 'pcb.core'),
        );
        mesh.name = 'âme FR4';
        return mesh;
      },
      info: {
        role: 'Support mécanique et isolant électrique entre les deux couches de cuivre ; percée pour les composants traversants, les vias et la fixation.',
        material:
          'Stratifié verre-époxy FR4 : 8 plis de tissu de verre 7628 imprégnés de résine époxy ignifugée (Tg ≈ 135 °C, typique)',
        dimensions: '68,58 × 53,34 × 1,51 mm ; 4 trous de fixation Ø 3,2 mm',
        tip: 'Sur la tranche, on voit les torons de verre coupés. Une surchauffe (fer trop longtemps) fait cloquer et blanchir le stratifié : c’est la délamination.',
        extra: [
          { label: 'Constante diélectrique', value: 'εr ≈ 4,5 à 1 MHz (typique)' },
          { label: 'Contour', value: 'petits chanfreins côté droit (approximation du contour réel)' },
        ],
      },
      explode: { direction: [0, 1, 0], distance: 0.013, stage: 2 },
      knolling: { exclude: false },
    },
  ];
  for (const face of ['top', 'bottom'] as const) {
    const top = face === 'top';
    const fn = faceName(face);
    parts.push(
      {
        id: `pcb.silk.${face}`,
        name: `Sérigraphie ${top ? 'supérieure' : 'inférieure'}`,
        parent: 'pcb',
        build: (ctx) => sheet(ctx, 'silk', face),
        info: layerInfo.silk(fn),
        explode: { direction: [0, 1, 0], distance: top ? 0.029 : 0, stage: 2 },
        removal: top
          ? peel(
              ['#component'],
              [0, 1, 0],
              'Opération pédagogique : gratter l’encre de sérigraphie au scalpel.',
            )
          : slide(
              ['#component'],
              'Opération pédagogique : détacher la sérigraphie de la face inférieure et la dégager.',
            ),
        knolling: { layout: 'stack' },
      },
      {
        id: `pcb.mask.${face}`,
        name: `Vernis épargne ${top ? 'supérieur' : 'inférieur'}`,
        parent: 'pcb',
        build: (ctx) => sheet(ctx, 'mask', face),
        info: layerInfo.mask(fn),
        explode: { direction: [0, 1, 0], distance: top ? 0.025 : 0.004, stage: 2 },
        removal: top
          ? peel(
              [`pcb.silk.${face}`],
              [0, 1, 0],
              'Opération pédagogique : décaper le vernis épargne (grattage au scalpel ou décapant).',
            )
          : slide([`pcb.silk.${face}`], 'Opération pédagogique : décaper le vernis de la face inférieure.'),
      },
      {
        id: `pcb.copper.${face}`,
        name: `Cuivre ${top ? 'supérieur' : 'inférieur'} (pistes et pastilles)`,
        parent: 'pcb',
        build: (ctx) => {
          const group = new THREE.Group();
          group.add(sheet(ctx, 'copper', face), padsGroup(ctx, face));
          return group;
        },
        info: {
          role: top
            ? 'Face composants : pistes de signal, pistes d’alimentation élargies, pastilles CMS et traversantes, plan de masse avec dégagements.'
            : 'Face soudure : pistes de liaison, pastilles des traversants et plan de masse relié au dessus par les vias.',
          material: 'Cuivre électrolytique laminé ; pastilles et vias étamés HASL (étain sans plomb)',
          dimensions:
            'Cuivre 35 µm (1 oz/ft²) ; pistes de 0,2 mm (signaux) à 0,8 mm (entrée jack) ; isolement ≥ 0,15 mm',
          tip: 'Les pastilles gardent un peu d’étain après dessoudage : c’est l’étamage HASL, bombé, qui facilite le remontage.',
        },
        explode: { direction: [0, 1, 0], distance: top ? 0.021 : 0.008, stage: 2 },
        removal: top
          ? {
              requires: [`pcb.mask.${face}`],
              motion: 'peel',
              axis: [0, 1, 0],
              distance: 0.03,
              destructive: true,
              gesture:
                'Opération pédagogique : en réalité le cuivre est dissous (gravure au perchlorure de fer) ; ici la couche est soulevée pour montrer le dessin des pistes.',
            }
          : slide(
              [`pcb.mask.${face}`],
              'Opération pédagogique : la couche de cuivre inférieure est dégagée pour montrer ses pistes.',
            ),
      },
    );
  }
  parts.push({
    id: 'pcb.barrels',
    name: 'Fûts de métallisation (vias et trous traversants)',
    parent: 'pcb',
    build: (ctx) => {
      const holes = allHoles(routingOf(ctx)).filter((h) => h.plated);
      const im = instanced(
        ctx.geometry.get('pcb.barrel', barrelGeometry),
        own(ctx, 'pcb.plating'),
        holes.map((h) => barrelMatrix(h)),
        'fûts de métallisation',
      );
      return {
        object: im,
        instanced: im,
        instanceLabel: (i) => {
          const h = holes[i];
          return h
            ? `Fût Ø ${h.d.toFixed(2).replace('.', ',')} mm (${h.d <= 0.4 ? 'via' : 'trou traversant'})`
            : 'Fût';
        },
      };
    },
    info: {
      role: 'Relient électriquement les deux faces : vias de passage de couche et trous des composants traversants.',
      material: 'Cuivre déposé chimiquement puis électrolytiquement (≈ 25 µm), étamé aux extrémités',
      dimensions: 'Perçages Ø 0,4 mm (vias) à Ø 2,3 mm (pattes de la coque USB)',
      tip: 'Un trou métallisé arraché au dessoudage (fût sorti avec la patte) coupe la liaison entre les faces : on le répare avec un fil traversant.',
    },
    explode: { direction: [0, 1, 0], distance: 0.017, stage: 2 },
    removal: {
      requires: ['pcb.copper.top', 'pcb.copper.bottom'],
      motion: 'translate',
      axis: [0, 1, 0],
      distance: 0.02,
      stagger: 0.002,
      destructive: true,
      gesture: 'Opération pédagogique : extraire les fûts de cuivre des perçages de l’âme.',
    },
  });
  return parts;
}
