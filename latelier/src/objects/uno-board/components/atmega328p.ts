/**
 * ATmega328P-PU (DIP-28) — composant clé (niveau 3 à venir : puce de silicium, grille de
 * connexion, fils d'or, résine). Pour l'instant : sous-ensemble retirable « u4 » (extraction de
 * son support à l'extracteur) + pièce extérieure « u4.package » (boîtier moulé et pattes).
 *
 * Boîtier PDIP-28 0,3 po : corps 35,2 × 7,0 × 3,4 mm (dépouille, plan de joint, encoche de
 * repérage côté broche 1, arêtes arrondies), 28 pattes étamées de 0,25 mm d'épaisseur : partie
 * haute large (1,52 mm) jusqu'au plan d'assise, épaulement, puis partie d'insertion de 0,46 mm.
 */
import type * as THREE from 'three/webgpu';
import type { PartDef } from '../../types';
import { MM } from '../constants';
import { FOOTPRINTS } from '../footprints';
import { own, type UnoParams } from '../params';
import { padFrame } from '../packages/chips';
import {
  filletPath,
  loftRoundedRect,
  roundedRectRing,
  sweepStrip,
  type LoftSection,
  type P2,
} from '../packages/geometry';
import { SOCKET_TOP } from '../packages/headers';
import type { ComponentModel } from '../packages/model';
import { keyComponentParts } from './common';

/** Plan d'assise du DIP (épaulements des pattes sur le haut du support), mm repère composant. */
const SEAT = SOCKET_TOP / MM;
const BODY_Y0 = SEAT + 0.5;
const BODY_H = 3.4;
const EXIT_Y = BODY_Y0 + 1.45;
const BODY_W = 35.2;
const BODY_D = 7.0;

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

function bodySections(): LoftSection[] {
  const s = (y: number, inset: number): LoftSection => ({
    y: y * MM,
    w: (BODY_W - 2 * inset) * MM,
    d: (BODY_D - 2 * inset) * MM,
    r: Math.max(0.05, 0.4 - inset) * MM,
  });
  const out: LoftSection[] = [];
  // Bas arrondi, dépouille jusqu'au plan de joint, bourrelet, dépouille jusqu'au haut arrondi.
  const rb = 0.15;
  for (let k = 0; k <= 2; k++) {
    const a = (k / 2) * (Math.PI / 2);
    out.push(s(BODY_Y0 + rb * (1 - Math.cos(a)), 0.08 + rb * (1 - Math.sin(a))));
  }
  out.push(s(EXIT_Y - 0.03, 0.0), s(EXIT_Y + 0.03, 0.0));
  const top = BODY_Y0 + BODY_H;
  const rt = 0.3;
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    out.push(s(top - rt + rt * Math.sin(a), 0.12 + rt * (1 - Math.cos(a))));
  }
  return out;
}

/** Patte DIP à épaulement (repère pastille : X vers l'extérieur, axe de la broche en x = 0). */
function dipLead(): THREE.BufferGeometry {
  const t = 0.25;
  const edge = BODY_D / 2 - 3.81; // flanc du corps (≈ −0,31 mm)
  const tipY = SEAT - 3.2;
  const pts: P2[] = [
    [(edge - 0.5) * MM, EXIT_Y * MM],
    [0.0, EXIT_Y * MM],
    [0.0, tipY * MM],
  ];
  const path = filletPath(pts, 0.45 * MM, 8);
  // Abscisse curviligne de l'épaulement (plan d'assise) et longueur totale.
  let sShoulder = 0;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (a[1] >= SEAT * MM && b[1] < SEAT * MM) sShoulder = acc + (l * (a[1] - SEAT * MM)) / (a[1] - b[1]);
    acc += l;
  }
  // Rééchantillonnage fin de la partie droite (transitions de largeur nettes).
  const dense: P2[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(l / (0.1 * MM)));
    for (let k = 0; k < n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  dense.push(path[path.length - 1]!);
  const wide = 1.52 * MM;
  const narrow = 0.46 * MM;
  return sweepStrip(
    dense,
    t * MM,
    (s, total) => {
      if (s < sShoulder) return wide;
      const k = Math.min(1, (s - sShoulder) / (0.35 * MM));
      const w = wide + (narrow - wide) * k;
      // Pointe chanfreinée.
      const tip = Math.max(0, (s - (total - 0.3 * MM)) / (0.3 * MM));
      return w * (1 - 0.45 * tip);
    },
    { cornerR: 0.06 * MM, segs: 2 },
  );
}

export function dip28Model(): ComponentModel {
  const fp = FOOTPRINTS.DIP28;
  return {
    meshes: [
      {
        name: 'boîtier moulé',
        key: 'dip28.body',
        geometry: () => loftRoundedRect(bodySections(), { ring: dipRing, uvSize: [35.1 * MM, 6.6 * MM] }),
        material: (ctx) => own(ctx, `mark.u4.top.q${ctx.quality}`),
      },
      {
        name: 'pattes',
        key: 'dip28.lead',
        geometry: dipLead,
        material: (ctx) => ctx.materials.get('tin'),
        locals: fp.pads.map((p) => padFrame(p, [0, Math.sign(p.y)])),
      },
    ],
  };
}

/** Sous-ensemble ATmega328P et son boîtier. */
export function atmega328pParts(parent: string): PartDef<UnoParams>[] {
  return keyComponentParts({
    ref: 'U4',
    id: 'u4',
    exteriorId: 'u4.package',
    name: 'Microcontrôleur ATmega328P-PU',
    exteriorName: 'Boîtier PDIP-28 de l’ATmega328P',
    parent,
    model: dip28Model(),
    tags: ['component', 'tht'],
    info: {
      role: 'Microcontrôleur principal 8 bits AVR : exécute le programme de l’utilisateur (entrées-sorties D0–D13, A0–A5, liaison série, SPI, I²C).',
      material:
        'Puce CMOS en silicium, grille de connexion en alliage de cuivre étamé, résine époxy chargée de silice',
      dimensions: 'PDIP-28 0,3 po : 35,2 × 7,0 × 3,4 mm (corps), pas 2,54 mm, rangées à 7,62 mm',
      reference: 'ATmega328P-PU',
      tip: 'Monté sur support : on le remplace sans fer à souder. À l’extraction, soulever alternativement chaque extrémité pour ne pas tordre les pattes.',
      extra: [
        { label: 'Mémoires', value: '32 Ko Flash, 2 Ko SRAM, 1 Ko EEPROM' },
        { label: 'Horloge', value: '16 MHz (résonateur céramique Y2)' },
        { label: 'Broche 1', value: 'repérée par l’encoche et le point moulé (côté jack)' },
      ],
    },
    exteriorInfo: {
      role: 'Protège la puce et porte les 28 pattes qui la relient au support.',
      material: 'Résine époxy noire moulée (marquage laser), pattes en alliage de cuivre étamé',
      dimensions: 'Pattes : 1,52 mm (partie haute) puis 0,46 mm (insertion), épaisseur 0,25 mm',
      tip: 'L’épaulement des pattes vient en butée sur le support : c’est le plan d’assise.',
    },
    removal: {
      requires: [],
      tool: 'ic-extractor',
      motion: 'lift',
      axis: [0, 1, 0],
      distance: 0.03,
      gesture:
        'Glisser l’extracteur sous les extrémités du boîtier et soulever en basculant légèrement, sans tordre les pattes.',
    },
    explode: { direction: [0, 1, 0], distance: 0.014 },
    labelPriority: 9,
  });
}
