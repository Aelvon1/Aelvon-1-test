/**
 * Contenu de l'atlas des décalques des accessoires : sérigraphies des appareils, affiches,
 * calendrier, étiquettes, impressions sur carton, notes sur ruban de masquage, silhouettes
 * peintes du panneau perforé. MARQUES ET TEXTES ENTIÈREMENT INVENTÉS.
 *
 * Chaque région dessine dans son propre repère (pixels de l'atlas de référence, origine en haut
 * à gauche) ; `atlas/index.ts` les empaquette et les translate. Module PUR (données).
 */
import type { DrawOp } from '../../../textures/types';
import { mulberry32 } from '../../lighting/neonFlicker';
import {
  aging,
  circle,
  dialScale,
  erode,
  FONT_COND,
  FONT_HAND,
  FONT_MONO,
  FONT_SERIF,
  line,
  maskingTape,
  rect,
  rotateAbout,
  screwHead,
  text,
} from './draw';
import {
  HOTAIR_PANEL,
  METER_PANEL,
  PSU_PANEL,
  RADIO_PANEL,
  SCOPE_PANEL,
  SOLDER_PANEL,
  type PanelSpec,
  type UV,
  type UVRect,
} from './panels';
import { SILHOUETTE_PX_PER_M, silhouetteSpecs, type SilhouetteSpec } from '../pegboard/toolLayout';

export interface RegionDef {
  name: string;
  w: number;
  h: number;
  draw: () => DrawOp[];
}

const INK = '#1d1b18';
const CREAM = '#e8dfc6';
const ORANGE = '#b35a2a';
const RED = '#a8261c';
const TEAL = '#245563';

/** Station de radio (nom inventé) et position de l'aiguille sur le cadran. */
export const RADIO_STATION = {
  label: 'Radio Sapinière — PO 1206 kHz',
  khz: 1206,
} as const;

/** Abscisse (fraction du cadran) d'une fréquence PO. */
export function dialPositionPO(khz: number): number {
  return (40 + ((khz - 530) / (1600 - 530)) * 360) / 440;
}

/** Libellés des 15 tiroirs du casier (3 colonnes × 5 rangées, de haut en bas). */
export const DRAWER_LABELS = [
  'RÉSIST. 1/4 W',
  'RÉSIST. 1 W',
  'POTARS',
  'CONDOS CÉRAM.',
  'CHIMIQUES',
  'DIODES',
  'LED 5 mm',
  'TRANSISTORS',
  'CI 74xx',
  'RÉGULATEURS',
  'QUARTZ',
  'FUSIBLES',
  'VIS M3',
  'ÉCROUS M3',
  'DIVERS',
] as const;

// --- Aides de faces avant ----------------------------------------------------------------

function px(panel: PanelSpec, uv: UV): [number, number] {
  return [uv[0] * panel.px[0], uv[1] * panel.px[1]];
}

function pxRect(panel: PanelSpec, r: UVRect): [number, number, number, number] {
  return [r[0] * panel.px[0], r[1] * panel.px[1], r[2] * panel.px[0], r[3] * panel.px[1]];
}

/** Traces de doigts autour des commandes (film gras légèrement sombre). */
function smudges(points: readonly (readonly [number, number])[], r: number, seed: number): DrawOp[] {
  const rand = mulberry32(seed);
  const ops: DrawOp[] = [];
  for (const [x, y] of points) {
    for (let k = 0; k < 3; k++) {
      ops.push(
        circle(
          x + (rand() - 0.5) * r * 2,
          y + (rand() - 0.5) * r * 2,
          r * (0.4 + rand() * 0.5),
          'rgba(40, 32, 24, 0.05)',
        ),
      );
    }
  }
  return ops;
}

/** Fenêtre d'afficheur (cadre noir, verre rouge sombre). */
function displayWindow(x: number, y: number, w: number, h: number, glass = '#1e0705'): DrawOp[] {
  return [rect(x - 4, y - 4, w + 8, h + 8, '#121212', { radius: 3 }), rect(x, y, w, h, glass, { radius: 2 })];
}

/** Symbole de terre (trois traits). */
function groundSymbol(x: number, y: number, s: number, color: string): DrawOp[] {
  return [
    line([x, y - s, x, y], color, 1.6),
    line([x - s * 0.8, y, x + s * 0.8, y], color, 1.6),
    line([x - s * 0.5, y + s * 0.35, x + s * 0.5, y + s * 0.35], color, 1.6),
    line([x - s * 0.2, y + s * 0.7, x + s * 0.2, y + s * 0.7], color, 1.6),
  ];
}

const KNOB_A0 = Math.PI * 0.75;
const KNOB_A1 = Math.PI * 2.25;

// --- Appareils ------------------------------------------------------------------------------

function psu(): DrawOp[] {
  const P = PSU_PANEL;
  const [W, H] = P.px;
  const ops: DrawOp[] = [
    rect(0, 0, W, H, '#c3bead'),
    rect(5, 5, W - 10, H - 10, undefined, { stroke: '#8f8a7c', lineWidth: 2, radius: 4 }),
  ];
  ops.push(text('TENSIOR', 18, 26, 30, { weight: 'bold', font: FONT_COND, spacing: 2 }));
  ops.push(text('AL-305', 158, 27, 18, { weight: 'bold', fill: ORANGE }));
  ops.push(text('ALIMENTATION STABILISÉE  0–30 V  0–5 A', 18, 50, 11, { font: FONT_COND, fill: '#3b3833' }));
  for (const [r, unit] of [
    [P.displayV, 'V'],
    [P.displayA, 'A'],
  ] as const) {
    const [x, y, w, h] = pxRect(P, r);
    ops.push(...displayWindow(x, y, w, h));
    ops.push(text(unit, x + w + 12, y + h / 2, 20, { weight: 'bold' }));
  }
  const kr = P.knobRadius * W;
  const labels: [UV, string, string[]][] = [
    [P.knobV, 'TENSION', ['0', '15', '30']],
    [P.knobA, 'COURANT', ['0', '2,5', '5']],
  ];
  for (const [uv, name, marks] of labels) {
    const [x, y] = px(P, uv);
    ops.push(...dialScale(x, y, kr * 1.22, KNOB_A0, KNOB_A1, 10, { labels: marks, labelSize: 10, len: 4 }));
    ops.push(text(name, x, H - 10, 11, { weight: 'bold', align: 'center', font: FONT_COND }));
  }
  for (const [uv, name] of [
    [P.ledCV, 'CV'],
    [P.ledCC, 'CC'],
  ] as const) {
    const [x, y] = px(P, uv);
    ops.push(circle(x, y, 7, '#2b2b2b'), text(name, x + 12, y, 11, { weight: 'bold', font: FONT_COND }));
  }
  const colors = ['#b0261c', '#1b1b1b', '#2f6b35'];
  P.terminals.forEach((uv, k) => {
    const [x, y] = px(P, uv);
    ops.push(circle(x, y, 17, colors[k], { stroke: '#2a2826', lineWidth: 1.5 }));
    if (k === 0) ops.push(text('+', x, y - 29, 16, { weight: 'bold', align: 'center', fill: RED }));
    else if (k === 1) ops.push(text('−', x, y - 29, 16, { weight: 'bold', align: 'center' }));
    else ops.push(...groundSymbol(x, y - 31, 7, '#2f6b35'));
  });
  const [sx, sy] = px(P, P.switch);
  ops.push(
    rect(sx - 22, sy - 12, 44, 24, '#1b1b1b', { radius: 3 }),
    text('MARCHE', sx, sy + 22, 10, { weight: 'bold', align: 'center', font: FONT_COND }),
  );
  ops.push(...smudges([px(P, P.knobV), px(P, P.knobA), px(P, P.switch)], 18, 11));
  ops.push(...aging(W, H, 21, { stains: 3, color: '70, 60, 40', edges: 0.08 }));
  return ops;
}

function scope(): DrawOp[] {
  const P = SCOPE_PANEL;
  const [W, H] = P.px;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#d6d0bf')];
  const [sx, sy, sw, sh] = pxRect(P, P.screen);
  // Encadrement sombre de l'écran et des réglages de faisceau.
  ops.push(rect(8, 8, sx + sw + 18, H - 16, '#2b2c2e', { radius: 8 }));
  ops.push(rect(sx - 6, sy - 6, sw + 12, sh + 12, '#101211', { radius: 6 }));
  ops.push(rect(sx, sy, sw, sh, '#07100b', { radius: 3 }));
  ops.push(text('HELDAR', W * 0.575, 22, 24, { weight: 'bold', font: FONT_COND, spacing: 3, fill: TEAL }));
  ops.push(text('OS-2020 · 20 MHz', W * 0.575, 44, 12, { font: FONT_COND, weight: 'bold' }));
  const bigLabels: [string, string[]][] = [
    ['VOLTS/DIV', ['5 V', '0,5', '50 m']],
    ['TIME/DIV', ['0,5 s', '1 ms', '5 µs']],
  ];
  const kr = P.bigKnobRadius * W;
  P.bigKnobs.forEach((uv, k) => {
    const [x, y] = px(P, uv);
    ops.push(circle(x, y, kr * 1.12, '#c9c2af', { stroke: '#8d8778', lineWidth: 1 }));
    ops.push(
      ...dialScale(x, y, kr * 1.18, KNOB_A0, KNOB_A1, 10, {
        labels: bigLabels[k]![1],
        labelSize: 9,
        len: 3.5,
      }),
    );
    ops.push(
      text(bigLabels[k]![0], x, y - kr - 28, 11, { weight: 'bold', align: 'center', font: FONT_COND }),
    );
  });
  const smallNames = ['POS. ↕', 'POS. ↔', 'NIVEAU', 'INTENS.', 'FOCUS', 'ÉCLAIR.'];
  P.smallKnobs.forEach((uv, k) => {
    const [x, y] = px(P, uv);
    const onDark = k >= 4;
    ops.push(
      text(smallNames[k]!, x, y - P.smallKnobRadius * W - 10, 9, {
        weight: 'bold',
        align: 'center',
        font: FONT_COND,
        fill: onDark ? CREAM : INK,
      }),
    );
  });
  const bncNames = ['CH 1', 'CH 2', 'DÉCL. EXT.'];
  P.bnc.forEach((uv, k) => {
    const [x, y] = px(P, uv);
    ops.push(
      circle(x, y, 14, '#8c877a'),
      text(bncNames[k]!, x + 18, y - 12, 9, { weight: 'bold', font: FONT_COND }),
    );
  });
  ops.push(text('1 MΩ · 25 pF · 400 V max', W * 0.6, H - 8, 8, { font: FONT_COND, fill: '#4a463f' }));
  const [px0, py0] = px(P, P.power);
  ops.push(
    rect(px0 - 13, py0 - 10, 26, 20, '#1d1d1d', { radius: 3 }),
    text('SECTEUR', px0, py0 + 20, 8, { weight: 'bold', align: 'center', font: FONT_COND }),
  );
  ops.push(...smudges([px(P, P.bigKnobs[0]), px(P, P.bigKnobs[1]), px(P, P.power)], 22, 12));
  ops.push(...aging(W, H, 22, { stains: 3, color: '70, 60, 40', edges: 0.07 }));
  return ops;
}

function solder(): DrawOp[] {
  const P = SOLDER_PANEL;
  const [W, H] = P.px;
  const ops: DrawOp[] = [
    rect(0, 0, W, H, '#3f4a39'),
    rect(4, 4, W - 8, H - 8, undefined, { stroke: '#6c7760', lineWidth: 1.5, radius: 5 }),
  ];
  ops.push(text('FERLIX', 16, 24, 24, { weight: 'bold', font: FONT_COND, fill: CREAM, spacing: 2 }));
  ops.push(text('STATION DE SOUDAGE 48 W', 16, 44, 9, { font: FONT_COND, fill: '#c9c1a6' }));
  const [kx, ky] = px(P, P.knob);
  const kr = P.knobRadius * W;
  ops.push(
    ...dialScale(kx, ky, kr * 1.12, KNOB_A0, KNOB_A1, 12, {
      major: 2,
      labels: ['150', '200', '250', '300', '350', '400', '450'],
      labelSize: 9,
      color: CREAM,
      len: 3,
    }),
  );
  ops.push(text('°C', kx, ky + kr + 26, 10, { fill: CREAM, align: 'center', weight: 'bold' }));
  const [lx, ly] = px(P, P.led);
  ops.push(
    text('CHAUFFE', lx, ly + 17, 8, { fill: CREAM, align: 'center', weight: 'bold', font: FONT_COND }),
  );
  const [swx, swy] = px(P, P.switch);
  ops.push(
    rect(swx - 12, swy - 16, 24, 32, '#151515', { radius: 3 }),
    text('0 / I', swx, swy + 26, 8, { fill: CREAM, align: 'center', weight: 'bold' }),
  );
  const [ox, oy] = px(P, P.socket);
  ops.push(
    circle(ox, oy, 20, '#232323', { stroke: '#8b937f', lineWidth: 2 }),
    text('FER', ox, oy - 30, 9, { fill: CREAM, align: 'center', weight: 'bold' }),
  );
  ops.push(...smudges([[kx, ky]], 26, 13));
  ops.push(...erode(W, H, 31, 40, 1.4));
  return ops;
}

function hotAir(): DrawOp[] {
  const P = HOTAIR_PANEL;
  const [W, H] = P.px;
  const ops: DrawOp[] = [
    rect(0, 0, W, H, '#1f2021'),
    rect(4, 4, W - 8, H - 8, undefined, { stroke: '#4a4c4f', lineWidth: 1.5, radius: 5 }),
  ];
  const [dx, dy, dw, dh] = pxRect(P, P.display);
  ops.push(
    ...displayWindow(dx, dy, dw, dh),
    text('°C', dx + dw + 10, dy + dh / 2, 16, { fill: CREAM, weight: 'bold' }),
  );
  ops.push(
    text('SOUFFLARD', W * 0.56, 24, 22, { weight: 'bold', font: FONT_COND, fill: '#e5a33a', spacing: 1 }),
  );
  ops.push(text('850 · STATION À AIR CHAUD', W * 0.56, 45, 9, { font: FONT_COND, fill: '#c9c1a6' }));
  const kr = P.knobRadius * W;
  const names: [string, string[]][] = [
    ['AIR', ['1', '4', '8']],
    ['TEMP.', ['100', '300', '480']],
  ];
  P.knobs.forEach((uv, k) => {
    const [x, y] = px(P, uv);
    ops.push(
      ...dialScale(x, y, kr * 1.2, KNOB_A0, KNOB_A1, 10, {
        labels: names[k]![1],
        labelSize: 8,
        color: CREAM,
        len: 3,
      }),
    );
    ops.push(
      text(names[k]![0], x, H - 10, 10, { fill: CREAM, align: 'center', weight: 'bold', font: FONT_COND }),
    );
  });
  const [ox, oy] = px(P, P.outlet);
  ops.push(circle(ox, oy, 30, '#2e2f31', { stroke: '#77797c', lineWidth: 2 }));
  const [lx, ly] = px(P, P.led);
  ops.push(
    text('CHAUFFE', lx, ly + 16, 8, { fill: CREAM, align: 'center', weight: 'bold', font: FONT_COND }),
  );
  const [swx, swy] = px(P, P.switch);
  ops.push(
    rect(swx - 20, swy - 11, 40, 22, '#0f0f0f', { radius: 3 }),
    text('MARCHE', swx, swy + 21, 8, { fill: CREAM, align: 'center', weight: 'bold' }),
  );
  ops.push(...erode(W, H, 32, 30, 1.2));
  return ops;
}

function meter(): DrawOp[] {
  const P = METER_PANEL;
  const [W, H] = P.px;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#2a2b2e', { radius: 8 })];
  const [lx, ly, lw, lh] = pxRect(P, P.lcd);
  ops.push(rect(lx - 5, ly - 5, lw + 10, lh + 10, '#151515', { radius: 4 }), rect(lx, ly, lw, lh, '#8f9a84'));
  ops.push(
    text('OHMIQ', W / 2 - 4, H * 0.315, 22, {
      weight: 'bold',
      fill: '#f2c21b',
      align: 'right',
      font: FONT_COND,
    }),
  );
  ops.push(
    text('D-36', W / 2 + 4, H * 0.315, 16, { weight: 'bold', fill: CREAM, align: 'left', font: FONT_COND }),
  );
  const [cx, cy] = px(P, P.dial);
  const r = P.dialRadius * W;
  ops.push(circle(cx, cy, r * 1.05, '#202124', { stroke: '#56585c', lineWidth: 1.5 }));
  // Secteurs du commutateur (sens horaire depuis le haut) : OFF, V⎓, V~, Ω, A.
  const legends: [number, string, string][] = [
    [-90, 'OFF', CREAM],
    [-62, '1000', '#e8e2d0'],
    [-44, '200', '#e8e2d0'],
    [-26, '20', '#e8e2d0'],
    [-8, '2', '#e8e2d0'],
    [12, '750', '#f2c21b'],
    [30, '200', '#f2c21b'],
    [58, '200', '#9fd0e8'],
    [76, '2k', '#9fd0e8'],
    [94, '20k', '#9fd0e8'],
    [112, '2M', '#9fd0e8'],
    [140, '10A', '#e87a62'],
    [160, '200m', '#e87a62'],
    [180, '20m', '#e87a62'],
    [214, 'hFE', CREAM],
  ];
  for (const [deg, label, color] of legends) {
    const a = (deg * Math.PI) / 180;
    ops.push(
      line(
        [
          cx + Math.cos(a) * r * 1.07,
          cy + Math.sin(a) * r * 1.07,
          cx + Math.cos(a) * r * 1.2,
          cy + Math.sin(a) * r * 1.2,
        ],
        color,
        1.4,
      ),
    );
    ops.push(
      text(label, cx + Math.cos(a) * r * 1.42, cy + Math.sin(a) * r * 1.42, 9, {
        fill: color,
        align: 'center',
        weight: 'bold',
        font: FONT_COND,
      }),
    );
  }
  ops.push(
    text('V⎓', cx - r * 0.95, cy - r * 1.62, 11, { fill: '#e8e2d0', weight: 'bold', align: 'center' }),
  );
  ops.push(text('V~', cx + r * 1.3, cy - r * 0.62, 11, { fill: '#f2c21b', weight: 'bold', align: 'center' }));
  ops.push(text('Ω', cx + r * 1.62, cy + r * 0.62, 12, { fill: '#9fd0e8', weight: 'bold', align: 'center' }));
  ops.push(text('A', cx - r * 1.62, cy + r * 0.3, 12, { fill: '#e87a62', weight: 'bold', align: 'center' }));
  const jackNames = ['10A', 'COM', 'VΩmA'];
  const jackColors = ['#e87a62', CREAM, '#e87a62'];
  P.jacks.forEach((uv, k) => {
    const [x, y] = px(P, uv);
    ops.push(circle(x, y, 13, k === 1 ? '#111' : '#3a1210', { stroke: '#77797c', lineWidth: 1.5 }));
    ops.push(
      text(jackNames[k]!, x, y - 22, 9, {
        fill: jackColors[k],
        align: 'center',
        weight: 'bold',
        font: FONT_COND,
      }),
    );
  });
  ops.push(text('CAT II 600 V', W / 2, H - 8, 8, { fill: '#9d9a90', align: 'center', font: FONT_COND }));
  return ops;
}

function radio(): DrawOp[] {
  const P = RADIO_PANEL;
  const [W, H] = P.px;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#b3b4b0')];
  // Bandeau noir central et enceintes.
  const gr = P.grilleRadius * W;
  ops.push(rect(W * 0.3, H * 0.4, W * 0.4, H * 0.56, '#1d1d1e', { radius: 10 }));
  for (const uv of P.grilles) {
    const [x, y] = px(P, uv);
    ops.push(
      circle(x, y, gr * 1.18, '#1c1c1d'),
      circle(x, y, gr * 1.1, undefined, { stroke: '#d8d9d5', lineWidth: 2.5 }),
    );
    ops.push(
      text('2 VOIES', x, y + gr * 1.18 + 12, 9, {
        align: 'center',
        weight: 'bold',
        font: FONT_COND,
        fill: '#3a3a3a',
      }),
    );
  }
  ops.push(
    text('BRUMEL', W / 2, H * 0.315, 30, {
      weight: 'bold',
      italic: true,
      align: 'center',
      font: FONT_COND,
      spacing: 3,
    }),
  );
  ops.push(
    text('RK-84 · STÉRÉO RADIO-CASSETTE · PO  GO  FM', W / 2, H * 0.365, 10, {
      align: 'center',
      font: FONT_COND,
      fill: '#2f2f2f',
    }),
  );
  const [dx, dy, dw, dh] = pxRect(P, P.dial);
  ops.push(rect(dx - 5, dy - 5, dw + 10, dh + 10, '#202021', { radius: 4 }));
  const knobNames = ['ACCORD', 'VOLUME'];
  P.knobs.forEach((uv, k) => {
    const [x, y] = px(P, uv);
    const r = P.knobRadius * W;
    ops.push(circle(x, y, r * 1.3, '#9d9e9a'));
    ops.push(
      text(knobNames[k]!, x, y + r * 1.3 + 11, 10, { align: 'center', weight: 'bold', font: FONT_COND }),
    );
  });
  const [lx, ly] = px(P, P.led);
  ops.push(text('FM ST.', lx + 10, ly, 8, { weight: 'bold', font: FONT_COND, fill: CREAM }));
  ops.push(...smudges([px(P, P.knobs[0]), px(P, P.knobs[1])], 18, 14));
  ops.push(...aging(W, H, 24, { stains: 4, color: '60, 55, 45', edges: 0.06 }));
  return ops;
}

function radioDial(): DrawOp[] {
  const W = 440;
  const H = 90;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#e2d4ae')];
  const x0 = 40;
  const span = 360;
  // FM 88–108 MHz.
  ops.push(text('FM', 8, 18, 12, { weight: 'bold', fill: RED }));
  for (let f = 88; f <= 108; f += 1) {
    const x = x0 + ((f - 88) / 20) * span;
    const big = f % 2 === 0;
    ops.push(line([x, 24, x, big ? 31 : 28], INK, 1.2));
    if (big) ops.push(text(String(f), x, 14, 9, { align: 'center', font: FONT_COND, weight: 'bold' }));
  }
  ops.push(text('MHz', W - 4, 18, 9, { align: 'right', font: FONT_COND }));
  // PO 530–1600 kHz.
  ops.push(text('PO', 8, 52, 12, { weight: 'bold', fill: RED }));
  for (let f = 530; f <= 1600; f += 50) {
    const x = x0 + ((f - 530) / 1070) * span;
    ops.push(line([x, 40, x, f % 100 === 0 ? 47 : 44], INK, 1.2));
  }
  for (const f of [530, 600, 700, 800, 1000, 1200, 1400, 1600]) {
    ops.push(
      text(String(f), x0 + ((f - 530) / 1070) * span, 57, 9, {
        align: 'center',
        font: FONT_COND,
        weight: 'bold',
      }),
    );
  }
  ops.push(text('kHz', W - 4, 52, 9, { align: 'right', font: FONT_COND }));
  // GO 150–300 kHz.
  ops.push(text('GO', 8, 78, 12, { weight: 'bold', fill: RED }));
  for (let f = 150; f <= 300; f += 10) {
    const x = x0 + ((f - 150) / 150) * span;
    ops.push(line([x, 67, x, f % 50 === 0 ? 73 : 70], INK, 1.2));
    if (f % 50 === 0)
      ops.push(text(String(f), x, 82, 9, { align: 'center', font: FONT_COND, weight: 'bold' }));
  }
  // Repère au feutre de la station favorite.
  const sx = dialPositionPO(RADIO_STATION.khz) * W;
  ops.push(circle(sx, 45, 7, undefined, { stroke: 'rgba(160, 30, 20, 0.8)', lineWidth: 1.6 }));
  return ops;
}

function drawerLabel(k: number): DrawOp[] {
  const W = 96;
  const H = 28;
  const hand = k % 4 === 2;
  const ops: DrawOp[] = [rect(0, 0, W, H, hand ? '#e6dcc0' : '#efe8d4')];
  ops.push(
    text(DRAWER_LABELS[k]!, W / 2, H / 2 + 1, hand ? 14 : 11, {
      align: 'center',
      font: hand ? FONT_HAND : FONT_MONO,
      weight: 'bold',
      fill: hand ? '#1b1f5c' : INK,
    }),
  );
  ops.push(...aging(W, H, 100 + k, { stains: 1, edges: 0.12 }));
  return ops;
}

// --- Papiers, affiches -------------------------------------------------------------------

function calendar(): DrawOp[] {
  const W = 270;
  const H = 414;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#ebe2cb')];
  // Illustration : route forestière sous la pluie, vieille berline.
  const ih = 178;
  ops.push(rect(10, 10, W - 20, ih, '#8fa3a8'));
  ops.push(rect(10, 10, W - 20, ih * 0.45, '#b6c2bd'));
  ops.push({
    op: 'polyline',
    points: [10, 110, 70, 62, 120, 96, 175, 48, 260, 104, 260, 188, 10, 188],
    fill: '#51676a',
    closed: true,
  });
  const rand = mulberry32(7);
  for (let k = 0; k < 16; k++) {
    const x = 14 + rand() * (W - 28);
    const base = 120 + rand() * 50;
    const h = 30 + rand() * 45;
    ops.push({
      op: 'polyline',
      points: [x, base - h, x - h * 0.28, base, x + h * 0.28, base],
      fill: k % 3 ? '#23392f' : '#2f4a3b',
      closed: true,
    });
  }
  ops.push({
    op: 'polyline',
    points: [95, 188, 128, 128, 142, 128, 190, 188],
    fill: '#5d5a54',
    closed: true,
  });
  ops.push(
    rect(122, 150, 44, 16, '#8c2a1e', { radius: 5 }),
    rect(130, 142, 26, 10, '#7a2419', { radius: 4 }),
  );
  ops.push(circle(131, 167, 5, '#171717'), circle(158, 167, 5, '#171717'));
  ops.push(circle(163, 157, 2.2, '#ffe9a8'));
  for (let k = 0; k < 60; k++) {
    const x = 12 + rand() * (W - 24);
    const y = 12 + rand() * (ih - 10);
    ops.push(line([x, y, x - 2, y + 9], 'rgba(230, 236, 240, 0.35)', 0.8));
  }
  ops.push(
    text('GARAGE DES SAPINS', W / 2, 206, 17, {
      align: 'center',
      weight: 'bold',
      font: FONT_COND,
      fill: '#2d4a3a',
    }),
  );
  ops.push(
    text('Mécanique · Carrosserie · Dépannage 24 h/24', W / 2, 223, 8.5, {
      align: 'center',
      font: FONT_COND,
    }),
  );
  ops.push(
    text('OCTOBRE 1989', W / 2, 246, 16, { align: 'center', weight: 'bold', fill: RED, font: FONT_SERIF }),
  );
  const days = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const gx = 22;
  const cw = (W - 44) / 7;
  days.forEach((d, k) =>
    ops.push(
      text(d, gx + cw * (k + 0.5), 264, 10, { align: 'center', weight: 'bold', fill: k === 6 ? RED : INK }),
    ),
  );
  // Le 1er octobre 1989 est un dimanche.
  for (let day = 1; day <= 31; day++) {
    const cell = day + 5;
    const col = cell % 7;
    const row = Math.floor(cell / 7);
    const x = gx + cw * (col + 0.5);
    const y = 282 + row * 21;
    ops.push(
      text(String(day), x, y, 11, {
        align: 'center',
        font: FONT_COND,
        weight: col === 6 ? 'bold' : 'normal',
        fill: col === 6 ? RED : INK,
      }),
    );
    if (day === 14 || day === 21)
      ops.push(circle(x, y, 9, undefined, { stroke: 'rgba(170, 30, 25, 0.85)', lineWidth: 1.8 }));
  }
  ops.push(
    text('course RC !', 150, 400, 12, { font: FONT_HAND, fill: '#a3261d', rotate: -0.08, weight: 'bold' }),
  );
  ops.push(text('vidange', 38, 400, 11, { font: FONT_HAND, fill: '#1b1f5c', rotate: 0.05 }));
  ops.push(circle(W / 2, 5, 3.2, '#2a2723'));
  ops.push(...aging(W, H, 41, { stains: 5, edges: 0.14 }));
  return ops;
}

function posterRally(): DrawOp[] {
  const W = 330;
  const H = 460;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#e7dcc0')];
  ops.push(rect(0, 0, W, 120, '#b35a2a'));
  ops.push(
    text('RALLYE', W / 2, 42, 40, {
      align: 'center',
      weight: '900',
      font: FONT_COND,
      fill: '#f3e7c8',
      spacing: 4,
    }),
  );
  ops.push(
    text('DES CRÊTES', W / 2, 88, 34, { align: 'center', weight: 'bold', font: FONT_COND, fill: '#f3e7c8' }),
  );
  // Montagnes, forêt, route en lacets, voiture en appui.
  ops.push({
    op: 'polyline',
    points: [0, 260, 60, 170, 110, 215, 180, 140, 250, 205, 330, 160, 330, 330, 0, 330],
    fill: '#3e5f63',
    closed: true,
  });
  ops.push({
    op: 'polyline',
    points: [0, 300, 80, 250, 150, 280, 240, 240, 330, 270, 330, 340, 0, 340],
    fill: '#26433a',
    closed: true,
  });
  ops.push({
    op: 'path',
    d: 'M 40 340 C 120 300 90 280 170 272 C 250 264 230 300 300 290',
    stroke: '#c9b48a',
    lineWidth: 14,
    lineCap: 'round',
  });
  ops.push(...rotateAbout(-0.12, 200, 262));
  ops.push(
    rect(170, 248, 62, 20, '#f2c21b', { radius: 6 }),
    rect(182, 238, 34, 13, '#e0b10f', { radius: 5 }),
  );
  ops.push(circle(183, 270, 7, '#141414'), circle(220, 270, 7, '#141414'));
  ops.push(text('07', 201, 258, 11, { align: 'center', weight: 'bold' }));
  ops.push(...rotateAbout(0.12, 200, 262));
  ops.push(rect(0, 340, W, 120, '#e7dcc0'));
  ops.push(
    text('1988', W / 2, 372, 42, { align: 'center', weight: '900', font: FONT_COND, fill: '#245563' }),
  );
  ops.push(
    text('8 & 9 OCTOBRE · SPÉCIALES DE NUIT', W / 2, 402, 12, {
      align: 'center',
      weight: 'bold',
      font: FONT_COND,
    }),
  );
  ops.push(
    text('Forêt du Haut-Val · Parc d’assistance au village', W / 2, 419, 10, {
      align: 'center',
      font: FONT_COND,
    }),
  );
  ops.push(line([16, 432, W - 16, 432], '#8a7d62', 1));
  ops.push(
    text('GRAISSOR   ·   PNEUS VARDEX   ·   GARAGE DES SAPINS', W / 2, 446, 9, {
      align: 'center',
      weight: 'bold',
      font: FONT_COND,
      fill: '#4a4033',
    }),
  );
  // Ruban adhésif jauni aux coins.
  for (const [x, y, a] of [
    [0, 0, 0.7],
    [W, 0, -0.7],
  ] as const) {
    ops.push(
      ...rotateAbout(a, x, y),
      rect(x - 26, y - 8, 52, 16, 'rgba(214, 196, 140, 0.85)'),
      ...rotateAbout(-a, x, y),
    );
  }
  ops.push(...aging(W, H, 51, { stains: 7, edges: 0.18, fold: true }));
  return ops;
}

const RESISTOR_COLORS: [string, string, string, string, string][] = [
  ['Noir', '#111111', '0', '0', '× 1'],
  ['Marron', '#6b3a1f', '1', '1', '× 10'],
  ['Rouge', '#c0271d', '2', '2', '× 100'],
  ['Orange', '#e07324', '3', '3', '× 1 k'],
  ['Jaune', '#f0c41c', '4', '4', '× 10 k'],
  ['Vert', '#2f8a3b', '5', '5', '× 100 k'],
  ['Bleu', '#2754a6', '6', '6', '× 1 M'],
  ['Violet', '#7a3fa0', '7', '7', '× 10 M'],
  ['Gris', '#8a8a8a', '8', '8', ''],
  ['Blanc', '#f2f0ea', '9', '9', ''],
  ['Or', '#c9a04a', '', '', '× 0,1'],
  ['Argent', '#b9bec4', '', '', '× 0,01'],
];

function posterColors(): DrawOp[] {
  const W = 400;
  const H = 283;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#efe9d8')];
  ops.push(
    text('CODE DES COULEURS — RÉSISTANCES', W / 2, 20, 15, {
      align: 'center',
      weight: 'bold',
      font: FONT_COND,
    }),
  );
  // Résistance illustrée.
  ops.push(line([24, 46, 110, 46], '#8a8a8a', 2.5), line([230, 46, 316, 46], '#8a8a8a', 2.5));
  ops.push(rect(110, 34, 120, 24, '#d9c49a', { radius: 11 }));
  for (const [x, c] of [
    [128, '#f0c41c'],
    [146, '#7a3fa0'],
    [164, '#c0271d'],
    [206, '#c9a04a'],
  ] as const) {
    ops.push(rect(x, 34, 9, 24, c));
  }
  ops.push(text('= 4,7 kΩ ± 5 %', 330, 46, 12, { weight: 'bold' }));
  const cols = [20, 104, 170, 236, 314];
  const heads = ['Couleur', '1er chiffre', '2e chiffre', 'Multiplic.', 'Tolér.'];
  heads.forEach((h, k) => ops.push(text(h, cols[k]!, 74, 10, { weight: 'bold', font: FONT_COND })));
  RESISTOR_COLORS.forEach(([name, color, a, b, mult], k) => {
    const y = 90 + k * 15.2;
    ops.push(rect(14, y - 7, 372, 14, k % 2 ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0)'));
    ops.push(rect(20, y - 5, 16, 10, color, { stroke: '#555', lineWidth: 0.6 }));
    ops.push(text(name, 42, y, 10, { font: FONT_COND }));
    ops.push(
      text(a, cols[1]! + 20, y, 10, { align: 'center' }),
      text(b, cols[2]! + 20, y, 10, { align: 'center' }),
    );
    ops.push(text(mult, cols[3]! + 4, y, 10));
    const tol = k === 1 ? '± 1 %' : k === 2 ? '± 2 %' : k === 10 ? '± 5 %' : k === 11 ? '± 10 %' : '';
    ops.push(text(tol, cols[4]!, y, 10));
  });
  ops.push(
    text('Éditions Électro-Bricole · encart détachable n° 112', W / 2, H - 8, 8, {
      align: 'center',
      font: FONT_COND,
      fill: '#5a5448',
    }),
  );
  ops.push(...aging(W, H, 61, { stains: 4, edges: 0.12, fold: true }));
  return ops;
}

function posterTorque(): DrawOp[] {
  const W = 300;
  const H = 416;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#e4dcc6'), rect(0, 0, W, 64, '#245563')];
  ops.push(
    text('FORGERAND', W / 2, 22, 20, {
      align: 'center',
      weight: '900',
      fill: '#f2c21b',
      font: FONT_COND,
      spacing: 3,
    }),
  );
  ops.push(
    text('OUTILLAGE PROFESSIONNEL', W / 2, 46, 10, {
      align: 'center',
      weight: 'bold',
      fill: '#e8dfc6',
      font: FONT_COND,
    }),
  );
  ops.push(text('COUPLES DE SERRAGE', W / 2, 86, 17, { align: 'center', weight: 'bold', font: FONT_COND }));
  ops.push(
    text('Visserie acier · filetage métrique · N·m', W / 2, 104, 9, { align: 'center', font: FONT_COND }),
  );
  const rows = [
    ['M5', '6', '8,5'],
    ['M6', '10', '14'],
    ['M8', '25', '35'],
    ['M10', '49', '69'],
    ['M12', '85', '120'],
    ['M14', '135', '190'],
    ['M16', '210', '295'],
  ];
  ops.push(
    text('Filet', 40, 126, 10, { weight: 'bold' }),
    text('Cl. 8.8', 140, 126, 10, { weight: 'bold', align: 'center' }),
    text('Cl. 10.9', 235, 126, 10, { weight: 'bold', align: 'center' }),
  );
  rows.forEach(([m, a, b], k) => {
    const y = 146 + k * 22;
    ops.push(rect(22, y - 10, W - 44, 20, k % 2 ? 'rgba(36, 85, 99, 0.08)' : 'rgba(0,0,0,0)'));
    ops.push(
      text(m!, 40, y, 12, { weight: 'bold' }),
      text(a!, 140, y, 12, { align: 'center' }),
      text(b!, 235, y, 12, { align: 'center' }),
    );
  });
  // Clé dynamométrique stylisée.
  ops.push(...rotateAbout(-0.18, W / 2, 340));
  ops.push(
    rect(40, 334, 200, 12, '#9aa0a6', { radius: 6 }),
    circle(46, 340, 15, '#9aa0a6'),
    rect(200, 331, 60, 18, '#2a2b2e', { radius: 7 }),
  );
  ops.push(...rotateAbout(0.18, W / 2, 340));
  ops.push(
    text('Serrer en croix, en deux passes.', W / 2, 392, 10, {
      align: 'center',
      italic: true,
      font: FONT_SERIF,
    }),
  );
  ops.push(
    ...screwHead(12, 12, 5),
    ...screwHead(W - 12, 12, 5),
    ...screwHead(12, H - 12, 5),
    ...screwHead(W - 12, H - 12, 5),
  );
  ops.push(...aging(W, H, 71, { stains: 5, edges: 0.16, color: '90, 70, 40' }));
  return ops;
}

function posterModel(): DrawOp[] {
  const W = 280;
  const H = 396;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#dfe3d6'), rect(0, 0, W, 140, '#5a6340')];
  ops.push(
    text('COUPE RÉGIONALE', W / 2, 30, 17, {
      align: 'center',
      weight: 'bold',
      fill: '#f2e9cf',
      font: FONT_COND,
    }),
  );
  ops.push(
    text('DE MODÉLISME', W / 2, 54, 17, {
      align: 'center',
      weight: 'bold',
      fill: '#f2e9cf',
      font: FONT_COND,
    }),
  );
  ops.push(
    text('TOUT-TERRAIN 1/10', W / 2, 92, 22, {
      align: 'center',
      weight: '900',
      fill: '#f2c21b',
      font: FONT_COND,
    }),
  );
  ops.push(
    text('électrique · 2 et 4 roues motrices', W / 2, 120, 10, {
      align: 'center',
      fill: '#e8e2cc',
      font: FONT_COND,
    }),
  );
  // Buggy stylisé.
  ops.push(
    rect(60, 200, 160, 34, '#b0261c', { radius: 14 }),
    rect(100, 180, 70, 26, '#8b1d15', { radius: 10 }),
  );
  ops.push(
    circle(84, 238, 22, '#1a1a1a'),
    circle(196, 238, 22, '#1a1a1a'),
    circle(84, 238, 9, '#c9c9c4'),
    circle(196, 238, 9, '#c9c9c4'),
  );
  ops.push(line([200, 186, 236, 150], '#1a1a1a', 2));
  ops.push({
    op: 'path',
    d: 'M 20 268 C 90 256 190 280 262 262',
    stroke: '#8a7a5a',
    lineWidth: 5,
    lineCap: 'round',
  });
  ops.push(
    text('DIMANCHE 12 MAI 1991', W / 2, 300, 15, { align: 'center', weight: 'bold', font: FONT_COND }),
  );
  ops.push(text('Piste du Moulin · essais dès 8 h', W / 2, 320, 11, { align: 'center', font: FONT_COND }));
  ops.push(
    text('Inscriptions : Club Modélisme du Val', W / 2, 346, 10, { align: 'center', font: FONT_COND }),
  );
  ops.push(
    text('Buvette · tombola · coupe des jeunes', W / 2, 362, 10, {
      align: 'center',
      font: FONT_COND,
      italic: true,
    }),
  );
  ops.push(circle(16, 16, 5, '#b0261c'), circle(W - 16, 16, 5, '#2754a6'));
  ops.push(...aging(W, H, 81, { stains: 6, edges: 0.2 }));
  return ops;
}

function schematicSheet(): DrawOp[] {
  const W = 230;
  const H = 300;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#f0ead9')];
  for (let y = 40; y < H - 10; y += 14) ops.push(line([12, y, W - 12, y], 'rgba(90, 130, 170, 0.25)', 0.8));
  ops.push(text('Chargeur 7,2 V — rév. B', 14, 22, 13, { font: FONT_HAND, fill: '#1b1f5c', weight: 'bold' }));
  const blue = '#1b1f5c';
  // Pont de diodes, condensateur, régulateur, résistance de limitation, LED.
  ops.push(line([20, 80, 60, 80, 60, 60, 90, 60], blue, 1.6));
  ops.push({ op: 'polyline', points: [90, 52, 104, 60, 90, 68], stroke: blue, lineWidth: 1.6, closed: true });
  ops.push(line([104, 52, 104, 68], blue, 1.6), line([104, 60, 150, 60], blue, 1.6));
  ops.push(
    rect(150, 50, 40, 30, undefined, { stroke: blue, lineWidth: 1.6 }),
    text('7805', 170, 65, 10, { font: FONT_HAND, fill: blue, align: 'center' }),
  );
  ops.push(line([190, 60, 214, 60, 214, 120], blue, 1.6));
  ops.push(line([214, 120, 208, 126, 220, 132, 208, 138, 220, 144, 214, 150, 214, 170], blue, 1.4));
  ops.push(text('22 Ω', 180, 140, 10, { font: FONT_HAND, fill: blue }));
  ops.push(
    line([120, 60, 120, 96], blue, 1.6),
    line([108, 96, 132, 96], blue, 2),
    line([108, 104, 132, 104], blue, 2),
    line([120, 104, 120, 130], blue, 1.6),
  );
  ops.push(text('470 µF', 70, 100, 10, { font: FONT_HAND, fill: blue }));
  ops.push(line([20, 130, 214, 130], blue, 1.2));
  ops.push(text('+ accus', 190, 186, 10, { font: FONT_HAND, fill: blue }));
  ops.push(
    text('ne pas dépasser 700 mA !!', 18, 220, 11, {
      font: FONT_HAND,
      fill: '#a3261d',
      weight: 'bold',
      rotate: -0.04,
    }),
  );
  ops.push(text('essai 14/10 : OK', 18, 250, 11, { font: FONT_HAND, fill: blue }));
  ops.push(circle(W / 2, 10, 4, '#3a3530'));
  ops.push(circle(160, 230, 34, undefined, { stroke: 'rgba(110, 72, 30, 0.35)', lineWidth: 4 }));
  ops.push(...aging(W, H, 91, { stains: 4, edges: 0.1 }));
  return ops;
}

// --- Emballages, étiquettes ----------------------------------------------------------------

function inkBox(W: number, H: number, content: DrawOp[], seed: number): DrawOp[] {
  return [...content, ...erode(W, H, seed, Math.round((W * H) / 180), 2)];
}

function boxKorvik(): DrawOp[] {
  const W = 320;
  const H = 150;
  const ink = '#2c2925';
  return inkBox(
    W,
    H,
    [
      rect(8, 8, W - 16, H - 16, undefined, { stroke: ink, lineWidth: 4 }),
      text('KORVIK', 24, 44, 36, { weight: '900', font: FONT_COND, fill: ink, spacing: 3 }),
      text('VISSERIE ASSORTIE · 2 kg', 24, 84, 16, { weight: 'bold', font: FONT_COND, fill: ink }),
      text('Vis · écrous · rondelles — acier zingué', 24, 108, 11, { font: FONT_COND, fill: ink }),
      line([262, 120, 262, 52], ink, 7),
      line([246, 70, 262, 50, 278, 70], ink, 7),
      line([292, 120, 292, 52], ink, 7),
      line([276, 70, 292, 50, 308, 70], ink, 7),
      text('HAUT', 277, 134, 12, { weight: 'bold', align: 'center', fill: ink }),
    ],
    201,
  );
}

function boxFragile(): DrawOp[] {
  const W = 260;
  const H = 110;
  const ink = '#a3261d';
  return inkBox(
    W,
    H,
    [
      rect(6, 6, W - 12, H - 12, undefined, { stroke: ink, lineWidth: 3 }),
      text('FRAGILE', 150, 56, 34, { weight: '900', font: FONT_COND, fill: ink, align: 'center' }),
      { op: 'path', d: 'M 26 22 L 64 22 L 60 50 Q 45 64 30 50 Z', fill: ink },
      line([45, 60, 45, 86], ink, 4),
      line([32, 88, 58, 88], ink, 4),
    ],
    202,
  );
}

function handwritten(
  W: number,
  H: number,
  value: string,
  color: string,
  size: number,
  seed: number,
  rotate = -0.04,
): DrawOp[] {
  return [
    text(value, W / 2, H / 2, size, {
      font: FONT_HAND,
      fill: color,
      weight: 'bold',
      align: 'center',
      rotate,
    }),
    ...erode(W, H, seed, 12, 1.2),
  ];
}

function boxLamps(): DrawOp[] {
  const W = 260;
  const H = 110;
  const ink = '#2c2925';
  return inkBox(
    W,
    H,
    [
      text('LUMAFLEX', 16, 30, 26, { weight: '900', font: FONT_COND, fill: ink }),
      text('TUBES FLUORESCENTS T8', 16, 60, 13, { weight: 'bold', font: FONT_COND, fill: ink }),
      text('36 W · 1200 mm · blanc industrie · × 10', 16, 82, 10, { font: FONT_COND, fill: ink }),
    ],
    203,
  );
}

function oilLabel(): DrawOp[] {
  const W = 230;
  const H = 150;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#1f3f7a'), rect(0, 96, W, 54, '#f2c21b')];
  ops.push(
    text('GRAISSOR', W / 2, 32, 30, {
      weight: '900',
      font: FONT_COND,
      fill: '#f3ead2',
      align: 'center',
      spacing: 2,
    }),
  );
  ops.push(text('HUILE MOTEUR', W / 2, 64, 14, { weight: 'bold', fill: '#f3ead2', align: 'center' }));
  ops.push(text('15W40 · 5 L', W / 2, 122, 24, { weight: '900', font: FONT_COND, align: 'center' }));
  ops.push(...aging(W, H, 211, { stains: 5, color: '20, 14, 6', edges: 0.2 }));
  return ops;
}

function sprayLabel(): DrawOp[] {
  const W = 170;
  const H = 230;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#2f6b35'), rect(0, 70, W, 90, '#f2e3b3')];
  ops.push(
    text('ROUILLEX', W / 2, 38, 28, { weight: '900', font: FONT_COND, fill: '#f2c21b', align: 'center' }),
  );
  ops.push(text('DÉGRIPPANT', W / 2, 98, 20, { weight: 'bold', font: FONT_COND, align: 'center' }));
  ops.push(text('LUBRIFIANT', W / 2, 124, 14, { font: FONT_COND, align: 'center' }));
  ops.push(text('anti-humidité', W / 2, 144, 11, { font: FONT_COND, align: 'center', italic: true }));
  ops.push(text('400 ml', W / 2, 196, 16, { weight: 'bold', fill: '#f2e3b3', align: 'center' }));
  ops.push(...aging(W, H, 212, { stains: 5, color: '20, 14, 6', edges: 0.15 }));
  return ops;
}

function paintLabel(): DrawOp[] {
  const W = 260;
  const H = 120;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#efe6cd'), rect(0, 0, 70, H, '#5a6340')];
  ops.push(text('RÉSILAC', 84, 28, 24, { weight: '900', font: FONT_COND }));
  ops.push(text('PEINTURE ANTIROUILLE', 84, 58, 12, { weight: 'bold', font: FONT_COND }));
  ops.push(text('Vert olive · satiné · 1 L', 84, 80, 11, { font: FONT_COND }));
  // Coulures de peinture.
  for (const [x, l] of [
    [110, 40],
    [160, 70],
    [205, 28],
  ] as const) {
    ops.push(rect(x, 0, 7, l, '#4f5a36', { radius: 3 }), circle(x + 3.5, l, 5, '#4f5a36'));
  }
  ops.push(...aging(W, H, 213, { stains: 5, color: '40, 36, 20', edges: 0.2 }));
  return ops;
}

function extinguisherLabel(): DrawOp[] {
  const W = 220;
  const H = 320;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#f0ead8', { radius: 6 })];
  ops.push(rect(0, 0, W, 54, '#a3261d', { radius: 6 }));
  ops.push(
    text('FLAMBLOC', W / 2, 28, 28, {
      weight: '900',
      fill: '#f5ecd6',
      align: 'center',
      font: FONT_COND,
      spacing: 2,
    }),
  );
  ops.push(text('EXTINCTEUR À POUDRE', W / 2, 74, 14, { weight: 'bold', align: 'center', font: FONT_COND }));
  ops.push(text('ABC · 6 kg', W / 2, 96, 18, { weight: '900', align: 'center', font: FONT_COND }));
  ['A', 'B', 'C'].forEach((c, k) => {
    const x = 36 + k * 58;
    ops.push(
      rect(x, 112, 46, 46, '#fff', { stroke: INK, lineWidth: 2 }),
      text(c, x + 23, 136, 28, { weight: '900', align: 'center' }),
    );
  });
  const steps = [
    '1. Tirer la goupille',
    '2. Viser la base des flammes',
    '3. Presser la poignée',
    '4. Balayer',
  ];
  steps.forEach((s, k) => ops.push(text(s, 18, 186 + k * 20, 12, { font: FONT_COND })));
  ops.push(
    text('Contrôlé 03/89', 18, 288, 14, { font: FONT_HAND, fill: '#1b1f5c', weight: 'bold', rotate: -0.05 }),
  );
  ops.push(...aging(W, H, 221, { stains: 4, edges: 0.1 }));
  return ops;
}

function extinguisherSign(): DrawOp[] {
  const W = 200;
  const H = 130;
  const ops: DrawOp[] = [
    rect(0, 0, W, H, '#b0261c', { radius: 6 }),
    rect(6, 6, W - 12, H - 12, undefined, { stroke: '#f5ecd6', lineWidth: 3, radius: 4 }),
  ];
  ops.push(
    rect(28, 30, 26, 70, '#f5ecd6', { radius: 10 }),
    rect(34, 20, 14, 12, '#f5ecd6'),
    line([48, 26, 64, 22, 70, 40], '#f5ecd6', 4),
  );
  ops.push(
    text('EXTINCTEUR', 130, 64, 17, { weight: '900', fill: '#f5ecd6', align: 'center', font: FONT_COND }),
  );
  ops.push(...aging(W, H, 222, { stains: 3, color: '40, 20, 10', edges: 0.1 }));
  return ops;
}

function magazine(k: number): DrawOp[] {
  const W = 200;
  const H = 270;
  const colors = ['#c0271d', '#245563', '#e07324'];
  const ops: DrawOp[] = [rect(0, 0, W, H, '#ebe6da'), rect(0, 0, W, 58, colors[k]!)];
  const title = k === 2 ? 'RADIO-MODÈLE' : 'ÉLECTRO-BRICOLE';
  ops.push(
    text(title, W / 2, 30, k === 2 ? 22 : 19, {
      weight: '900',
      align: 'center',
      fill: '#f7f1e2',
      font: FONT_COND,
    }),
  );
  ops.push(
    text(k === 2 ? 'n° 57 · mars 1990' : `n° ${112 + k * 6} · 1989`, W / 2, 72, 11, {
      align: 'center',
      weight: 'bold',
    }),
  );
  ops.push(rect(16, 86, W - 32, 110, k === 2 ? '#6c7a52' : '#3a3f45'));
  if (k === 2)
    ops.push(
      rect(50, 140, 100, 26, '#f2c21b', { radius: 8 }),
      circle(66, 170, 12, '#111'),
      circle(134, 170, 12, '#111'),
    );
  else
    ops.push(
      rect(40, 110, 120, 62, '#1f5a3a'),
      ...[0, 1, 2, 3].map((i) => rect(52 + i * 26, 124, 14, 30, '#111')),
    );
  const lines =
    k === 2
      ? ['Réglez vos amortisseurs', 'Accus : charge rapide', 'Essai : le Rapace 10']
      : ['Montez un fréquencemètre', 'Alimentation 0–30 V', 'Le 555 en 10 montages'];
  lines.forEach((l, i) =>
    ops.push(text(l, 16, 214 + i * 18, 11, { weight: i === 0 ? 'bold' : 'normal', font: FONT_COND })),
  );
  ops.push(...aging(W, H, 231 + k, { stains: 4, edges: 0.1 }));
  return ops;
}

function rcSticker(): DrawOp[] {
  const W = 260;
  const H = 120;
  return [
    ...rotateAbout(-0.08, W / 2, H / 2),
    text('RAPACE', 10, 50, 44, {
      weight: '900',
      italic: true,
      font: FONT_COND,
      fill: '#f2c21b',
      stroke: '#1a1a1a',
      lineWidth: 3,
    }),
    ...rotateAbout(0.08, W / 2, H / 2),
    circle(212, 60, 40, '#f5f1e6', { stroke: '#1a1a1a', lineWidth: 4 }),
    text('07', 212, 62, 40, { weight: '900', align: 'center', font: FONT_COND }),
    text('10', 128, 96, 22, { weight: '900', italic: true, fill: '#b0261c', font: FONT_COND }),
  ];
}

function chargerLabel(): DrawOp[] {
  const W = 200;
  const H = 100;
  return [
    rect(0, 0, W, H, '#262626'),
    text('AMPÉRO', 12, 22, 20, { weight: '900', fill: '#e07324', font: FONT_COND }),
    text('CHARGEUR RAPIDE', 12, 50, 12, { weight: 'bold', fill: CREAM, font: FONT_COND }),
    text('accus 7,2 V · 1,2 A', 12, 70, 11, { fill: '#b7b09a', font: FONT_COND }),
    text('CHARGE', 150, 84, 9, { fill: CREAM, align: 'center', weight: 'bold' }),
  ];
}

function transmitterLabel(): DrawOp[] {
  const W = 180;
  const H = 90;
  return [
    rect(0, 0, W, H, '#1c1c1c'),
    text('PILOTE 2', W / 2, 26, 20, { weight: '900', fill: '#f2c21b', align: 'center', font: FONT_COND }),
    text('2 VOIES · 27 MHz AM', W / 2, 54, 11, {
      fill: CREAM,
      align: 'center',
      font: FONT_COND,
      weight: 'bold',
    }),
    text('DIRECTION      GAZ', W / 2, 76, 9, { fill: '#b7b09a', align: 'center', font: FONT_COND }),
  ];
}

function breadboard(): DrawOp[] {
  const W = 320;
  const H = 110;
  const ops: DrawOp[] = [rect(0, 0, W, H, '#ece8dc', { radius: 4 })];
  ops.push(line([8, 7, W - 8, 7], '#c0271d', 1.2), line([8, H - 7, W - 8, H - 7], '#2754a6', 1.2));
  for (let x = 12; x < W - 8; x += 7.5) {
    ops.push(rect(x, 10, 2.6, 2.6, '#4a4a4a'), rect(x, 16, 2.6, 2.6, '#4a4a4a'));
    ops.push(rect(x, H - 19, 2.6, 2.6, '#4a4a4a'), rect(x, H - 13, 2.6, 2.6, '#4a4a4a'));
    for (let r = 0; r < 5; r++) {
      ops.push(rect(x, 28 + r * 7, 2.6, 2.6, '#4a4a4a'), rect(x, 66 + r * 7, 2.6, 2.6, '#4a4a4a'));
    }
  }
  ops.push(rect(8, 60, W - 16, 3, '#d9d4c4'));
  return ops;
}

function cassetteLabel(): DrawOp[] {
  const W = 220;
  const H = 60;
  return [
    rect(0, 0, W, H, '#f1ebd9'),
    rect(0, 0, W, 12, '#e07324'),
    text('Compil’ été 88', W / 2, 32, 17, {
      font: FONT_HAND,
      fill: '#1b1f5c',
      align: 'center',
      weight: 'bold',
    }),
    text('face A', W - 30, 50, 9, { font: FONT_HAND, fill: '#1b1f5c', align: 'center' }),
  ];
}

function plate(W: number, H: number, title: string, sub: string, bg: string, ink: string): DrawOp[] {
  const ops: DrawOp[] = [
    rect(0, 0, W, H, bg, { radius: 5 }),
    rect(3, 3, W - 6, H - 6, undefined, { stroke: ink, lineWidth: 1.5, radius: 4 }),
  ];
  ops.push(
    text(title, W / 2, sub ? H * 0.4 : H / 2, H * (sub ? 0.36 : 0.5), {
      weight: '900',
      fill: ink,
      align: 'center',
      font: FONT_COND,
      spacing: 2,
    }),
  );
  if (sub)
    ops.push(
      text(sub, W / 2, H * 0.76, H * 0.2, { fill: ink, align: 'center', font: FONT_COND, weight: 'bold' }),
    );
  ops.push(...screwHead(9, H / 2, 3.2), ...screwHead(W - 9, H / 2, 3.2));
  return ops;
}

function scopeCalibration(): DrawOp[] {
  const W = 150;
  const H = 56;
  return [
    rect(0, 0, W, H, '#f4f1e6', { radius: 4 }),
    rect(0, 0, 30, H, '#2f8a3b', { radius: 4 }),
    text('✓', 15, H / 2, 20, { fill: '#fff', align: 'center', weight: 'bold' }),
    text('CONTRÔLÉ', 90, 16, 11, { weight: 'bold', align: 'center', font: FONT_COND }),
    text('03 / 89  J.-M.', 90, 38, 13, { font: FONT_HAND, fill: '#1b1f5c', align: 'center', weight: 'bold' }),
    ...aging(W, H, 241, { stains: 2, edges: 0.1 }),
  ];
}

function caliperScale(): DrawOp[] {
  const W = 520;
  const ops: DrawOp[] = [];
  const x0 = 20;
  const mm = (W - 40) / 150;
  for (let k = 0; k <= 150; k++) {
    const x = x0 + k * mm;
    const len = k % 10 === 0 ? 16 : k % 5 === 0 ? 11 : 7;
    ops.push(line([x, 2, x, 2 + len], '#1a1a1a', 1));
    if (k % 10 === 0)
      ops.push(
        text(String(k / 10), x, 30, 11, {
          align: 'center',
          weight: 'bold',
          font: FONT_COND,
          fill: '#1a1a1a',
        }),
      );
  }
  return ops;
}

function cartLabel(value: string): DrawOp[] {
  const W = 130;
  const H = 34;
  return [
    rect(0, 0, W, H, '#ece5cf'),
    text(value, W / 2, H / 2 + 1, 15, { align: 'center', font: FONT_MONO, weight: 'bold' }),
    ...aging(W, H, value.length * 7, { stains: 1, edges: 0.1 }),
  ];
}

// --- Silhouettes du panneau perforé ---------------------------------------------------------

const SIL_PAINT = '#6b2c21';

function silhouetteRegion(spec: SilhouetteSpec, seed: number): RegionDef {
  const s = SILHOUETTE_PX_PER_M;
  const w = Math.ceil(spec.size[0] * s);
  const h = Math.ceil(spec.size[1] * s);
  return {
    name: spec.region,
    w,
    h,
    draw: () => {
      // Plan du panneau → pixels de la région (y écran vers le bas).
      const left = spec.center[0] - spec.size[0] / 2;
      const top = spec.center[1] + spec.size[1] / 2;
      const toPx = (x: number, y: number): [number, number] => [(x - left) * s, (top - y) * s];
      const ops: DrawOp[] = [];
      const border = 0.004 * s;
      if (spec.shape.kind === 'polygon') {
        const pts: number[] = [];
        const k = spec.shape.scale;
        for (const [x, y] of spec.shape.points)
          pts.push(...toPx(spec.origin[0] + x * k, spec.origin[1] + y * k));
        ops.push({
          op: 'polyline',
          points: pts,
          fill: SIL_PAINT,
          stroke: SIL_PAINT,
          lineWidth: border * 2,
          closed: true,
          lineJoin: 'round',
        });
      } else {
        for (const [x, y, rw, rh] of spec.shape.rects) {
          const [px0, py0] = toPx(spec.origin[0] + x, spec.origin[1] + y + rh);
          ops.push(
            rect(px0 - border, py0 - border, rw * s + 2 * border, rh * s + 2 * border, SIL_PAINT, {
              radius: border * 1.5,
            }),
          );
        }
      }
      ops.push(...erode(w, h, seed, Math.round((w * h) / 90), 1.3));
      return ops;
    },
  };
}

// --- Liste --------------------------------------------------------------------------------

function panelRegion(name: string, panel: PanelSpec, draw: () => DrawOp[]): RegionDef {
  return { name, w: panel.px[0], h: panel.px[1], draw };
}

/** Toutes les régions de l'atlas (ordre stable). */
export function regionDefs(): RegionDef[] {
  const defs: RegionDef[] = [
    panelRegion('psu', PSU_PANEL, psu),
    panelRegion('scope', SCOPE_PANEL, scope),
    panelRegion('solder', SOLDER_PANEL, solder),
    panelRegion('hotair', HOTAIR_PANEL, hotAir),
    panelRegion('meter', METER_PANEL, meter),
    panelRegion('radio', RADIO_PANEL, radio),
    { name: 'radioDial', w: 440, h: 90, draw: radioDial },
    { name: 'calendar', w: 270, h: 414, draw: calendar },
    { name: 'posterRally', w: 330, h: 460, draw: posterRally },
    { name: 'posterColors', w: 400, h: 283, draw: posterColors },
    { name: 'posterTorque', w: 300, h: 416, draw: posterTorque },
    { name: 'posterModel', w: 280, h: 396, draw: posterModel },
    { name: 'sheet', w: 230, h: 300, draw: schematicSheet },
    { name: 'boxKorvik', w: 320, h: 150, draw: boxKorvik },
    { name: 'boxFragile', w: 260, h: 110, draw: boxFragile },
    { name: 'boxLamps', w: 260, h: 110, draw: boxLamps },
    { name: 'boxRC', w: 220, h: 90, draw: () => handwritten(220, 90, 'PIÈCES RC', '#161616', 30, 204) },
    { name: 'boxNoel', w: 200, h: 90, draw: () => handwritten(200, 90, 'NOËL', '#a3261d', 38, 205, 0.05) },
    {
      name: 'boxInvoices',
      w: 260,
      h: 90,
      draw: () => handwritten(260, 90, 'FACTURES 87-90', '#161616', 26, 206),
    },
    { name: 'oil', w: 230, h: 150, draw: oilLabel },
    { name: 'spray', w: 170, h: 230, draw: sprayLabel },
    { name: 'paint', w: 260, h: 120, draw: paintLabel },
    { name: 'extinguisher', w: 220, h: 320, draw: extinguisherLabel },
    { name: 'extSign', w: 200, h: 130, draw: extinguisherSign },
    { name: 'mag0', w: 200, h: 270, draw: () => magazine(0) },
    { name: 'mag1', w: 200, h: 270, draw: () => magazine(1) },
    { name: 'mag2', w: 200, h: 270, draw: () => magazine(2) },
    { name: 'rcSticker', w: 260, h: 120, draw: rcSticker },
    { name: 'charger', w: 200, h: 100, draw: chargerLabel },
    { name: 'transmitter', w: 180, h: 90, draw: transmitterLabel },
    { name: 'breadboard', w: 320, h: 110, draw: breadboard },
    { name: 'cassette', w: 220, h: 60, draw: cassetteLabel },
    { name: 'scopeCal', w: 150, h: 56, draw: scopeCalibration },
    { name: 'caliperScale', w: 520, h: 44, draw: caliperScale },
    {
      name: 'noteCharge',
      w: 260,
      h: 40,
      draw: () => maskingTape(260, 40, 'EN CHARGE — NE PAS TOUCHER', 301),
    },
    { name: 'noteFuse', w: 170, h: 38, draw: () => maskingTape(170, 38, 'FUSIBLE 2 A !', 302, '#a3261d') },
    { name: 'noteHS', w: 110, h: 38, draw: () => maskingTape(110, 38, 'H.S.', 303, '#a3261d') },
    { name: 'noteM4', w: 100, h: 32, draw: () => maskingTape(100, 32, 'M4', 304) },
    { name: 'noteM6', w: 100, h: 32, draw: () => maskingTape(100, 32, 'M6', 305) },
    { name: 'noteNuts', w: 120, h: 32, draw: () => maskingTape(120, 32, 'ÉCROUS', 306) },
    { name: 'noteWashers', w: 140, h: 32, draw: () => maskingTape(140, 32, 'RONDELLES', 307) },
    { name: 'noteWood', w: 120, h: 32, draw: () => maskingTape(120, 32, 'VIS BOIS', 308) },
    {
      name: 'fanBadge',
      w: 150,
      h: 56,
      draw: () => plate(150, 56, 'BORÉAL', '40 cm · 3 vitesses', '#c9c3b0', '#2a2622'),
    },
    {
      name: 'cartPlate',
      w: 230,
      h: 60,
      draw: () => plate(230, 60, 'FORGERAND', 'SERVANTE D’ATELIER', '#cfc7b3', '#2a2622'),
    },
    { name: 'cabinetBrand', w: 170, h: 44, draw: () => plate(170, 44, 'RANGIX', '', '#e8e2d0', '#245563') },
    { name: 'cartSockets', w: 130, h: 34, draw: () => cartLabel('DOUILLES') },
    { name: 'cartKeys', w: 130, h: 34, draw: () => cartLabel('CLÉS') },
    { name: 'cartElec', w: 130, h: 34, draw: () => cartLabel('ÉLECTRIC.') },
    { name: 'cartMisc', w: 130, h: 34, draw: () => cartLabel('DIVERS') },
    { name: 'cartRC', w: 130, h: 34, draw: () => cartLabel('RC') },
  ];
  DRAWER_LABELS.forEach((_, k) =>
    defs.push({ name: `drawer${k}`, w: 96, h: 28, draw: () => drawerLabel(k) }),
  );
  silhouetteSpecs().forEach((spec, k) => defs.push(silhouetteRegion(spec, 400 + k)));
  return defs;
}
