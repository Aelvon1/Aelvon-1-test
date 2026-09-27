/**
 * Quartz 16 MHz en boîtier HC-49/S (horloge de l'ATmega16U2) — composant clé (niveau 3 à venir :
 * lame de quartz, électrodes, embase et traversées de verre). Pour l'instant : sous-ensemble
 * retirable « y1 » (joints de soudure) + pièce extérieure « y1.can » (capot, embase, fils).
 *
 * HC-49/S (« bas ») : capot 11,05 × 4,65 × 3,5 mm en acier nickelé, collerette de sertissage,
 * fils Ø 0,43 mm au pas de 4,88 mm, cale isolante sous le boîtier.
 */
import type * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { L_TAIL_END, L_THT_SEAT, MM } from '../constants';
import { own, type UnoParams } from '../params';
import { lathe, loftRoundedRect, mat, roundedBox, type LoftSection } from '../packages/geometry';
import { pinPositions, thtJointMeshes } from '../packages/headers';
import type { ComponentModel } from '../packages/model';
import { keyComponentParts } from './common';

const SPACER = 0.15;
const Y0 = L_THT_SEAT / MM + SPACER;

function canSections(): LoftSection[] {
  const s = (y: number, w: number, d: number): LoftSection => ({
    y: y * MM,
    w: w * MM,
    d: d * MM,
    r: (d / 2 - 0.01) * MM,
  });
  const top = Y0 + 3.5;
  const out: LoftSection[] = [
    // Collerette sertie (plus large), puis capot.
    s(Y0, 11.3, 4.9),
    s(Y0 + 0.05, 11.4, 4.95),
    s(Y0 + 0.4, 11.4, 4.95),
    s(Y0 + 0.48, 11.1, 4.7),
    s(Y0 + 0.55, 11.05, 4.65),
  ];
  const rt = 0.45;
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    const inset = rt * (1 - Math.cos(a));
    out.push(s(top - rt + rt * Math.sin(a), 11.05 - 2 * inset, 4.65 - 2 * inset));
  }
  return out;
}

/** Fil de sortie Ø 0,43 mm, pointe arrondie. */
function wire(): THREE.BufferGeometry {
  const r = 0.215 * MM;
  const y0 = L_TAIL_END;
  const y1 = (Y0 + 0.2) * MM;
  return lathe(
    [
      [0.001 * MM, y0],
      [r * 0.7, y0 + 0.02 * MM],
      [r, y0 + 0.08 * MM],
      [r, y1],
      [0.001 * MM, y1 + 0.001 * MM],
    ],
    12,
  );
}

export function hc49sModel(): ComponentModel {
  const pins = pinPositions('HC49S');
  return {
    meshes: [
      {
        name: 'capot et embase',
        key: 'hc49s.can',
        geometry: () => loftRoundedRect(canSections(), { cornerSegments: 8, uvSize: [10.9 * MM, 4.5 * MM] }),
        material: (ctx) => own(ctx, `mark.y1.top.q${ctx.quality}`),
      },
      {
        name: 'cale isolante',
        key: 'hc49s.spacer',
        geometry: () =>
          roundedBox(9.6 * MM, 3.6 * MM, SPACER * MM, { r: 0.4 * MM, rt: 0.03 * MM, y0: L_THT_SEAT }),
        material: (ctx) => ctx.materials.get('plastic.nylon'),
      },
      {
        name: 'fils',
        key: 'hc49s.wire',
        geometry: wire,
        material: (ctx) => ctx.materials.get('tin'),
        locals: pins.map(([x, z]) => mat(x, 0, z)),
      },
      ...thtJointMeshes('hc49s', pins, 0.75, 0.24, { bottomH: 0.75, top: 0.2 }),
    ],
  };
}

export function crystalParts(parent: string): PartDef<UnoParams>[] {
  return keyComponentParts({
    ref: 'Y1',
    id: 'y1',
    exteriorId: 'y1.can',
    name: 'Quartz 16 MHz (HC-49/S)',
    exteriorName: 'Boîtier HC-49/S du quartz',
    parent,
    model: hc49sModel(),
    tags: ['component', 'tht'],
    info: {
      role: 'Base de temps de l’ATmega16U2 : la précision du quartz (± 30 ppm, typique) est nécessaire à l’USB pleine vitesse.',
      material: 'Lame de quartz taillée AT, capot en acier nickelé serti sur embase',
      dimensions: 'HC-49/S : 11,05 × 4,65 × 3,5 mm, fils Ø 0,43 mm au pas de 4,88 mm',
      reference: '16,000 MHz, charge 18 pF (typique)',
      tip: 'Chargé par deux condensateurs de 22 pF (C7, C12) et shunté par 1 MΩ (R1) pour garantir le démarrage de l’oscillateur.',
    },
    exteriorInfo: {
      role: 'Enceinte étanche (azote sec) protégeant la lame de quartz ; les fils traversent l’embase par des perles de verre.',
      material: 'Acier nickelé embouti, embase sertie, fils étamés',
      dimensions: 'Capot 11,05 × 4,65 × 3,5 mm ; collerette 11,4 × 4,95 mm',
      tip: 'Ne jamais chauffer le capot : la lame, très fine, se décolle ou se fêle au choc thermique.',
    },
    removal: {
      tool: 'desolder-pump',
      motion: 'desolder',
      axis: [0, 1, 0],
      distance: 0.022,
      gesture:
        'Chauffer chaque soudure côté cuivre au fer, aspirer l’étain à la pompe, puis extraire le quartz.',
    },
    explode: { direction: [0, 1, 0], distance: 0.012 },
    labelPriority: 6,
  });
}
