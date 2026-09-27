/**
 * Appareils de mesure de l'établi : oscilloscope analogique (écran à phosphore vert animé),
 * alimentation de laboratoire (deux afficheurs 7 segments à LED), multimètre couché sur sa
 * béquille dont les pointes mesurent la sortie de l'alimentation, sonde d'oscilloscope.
 *
 * Repère de chaque appareil : origine au plateau sous le centre de l'emprise, +Z = face avant.
 */
import * as THREE from 'three/webgpu';
import { rawTint, tint } from '../batch';
import type { PropKit } from '../kit';
import { BENCH_ITEMS, BENCH_TOP } from '../dims';
import { METER_PANEL, panelPoint, panelRadius, panelRect, PSU_PANEL, SCOPE_PANEL } from '../atlas/panels';
import { LED_CHANNEL } from '../materials';
import { bindingPost, bnc, foot, knob, rocker, TINTS } from '../parts';
import type { Vec3Tuple } from '../../geometry/shapes';

/** Points d'attache monde (câbles entre appareils). */
export interface InstrumentAnchors {
  psuPlus: THREE.Vector3;
  psuMinus: THREE.Vector3;
  meterCom: THREE.Vector3;
  meterVolt: THREE.Vector3;
  scopeCh1: THREE.Vector3;
}

const FEET = 0.012;

export function buildInstruments(kit: PropKit): InstrumentAnchors {
  const anchors: InstrumentAnchors = {
    psuPlus: new THREE.Vector3(),
    psuMinus: new THREE.Vector3(),
    meterCom: new THREE.Vector3(),
    meterVolt: new THREE.Vector3(),
    scopeCh1: new THREE.Vector3(),
  };
  const s = BENCH_ITEMS.scope;
  kit.at([s.center[0], BENCH_TOP, s.center[1]], [0, s.yaw, 0], () => buildScope(kit, anchors));
  const p = BENCH_ITEMS.psu;
  kit.at([p.center[0], BENCH_TOP, p.center[1]], [0, p.yaw, 0], () => buildPsu(kit, anchors));
  const m = BENCH_ITEMS.multimeter;
  kit.at([m.center[0], BENCH_TOP, m.center[1]], [0, m.yaw, 0], () => buildMultimeter(kit, anchors));
  buildLeads(kit, anchors);
  return anchors;
}

/** Cadre avant en plastique sombre autour d'une face (w × h) située en z. */
function frontFrame(kit: PropKit, w: number, h: number, y0: number, z: number, t = 0.006): void {
  const o = { tint: TINTS.plasticDark };
  const d = 0.012;
  kit.box('world.props.plastic', [0, y0 + h - t / 2, z + d / 2 - 0.004], [w + 0.002, t, d], 0.002, o);
  kit.box('world.props.plastic', [0, y0 + t / 2, z + d / 2 - 0.004], [w + 0.002, t, d], 0.002, o);
  kit.box(
    'world.props.plastic',
    [-w / 2 + t / 2, y0 + h / 2, z + d / 2 - 0.004],
    [t, h - 2 * t, d],
    0.002,
    o,
  );
  kit.box('world.props.plastic', [w / 2 - t / 2, y0 + h / 2, z + d / 2 - 0.004], [t, h - 2 * t, d], 0.002, o);
}

function buildScope(kit: PropKit, anchors: InstrumentAnchors): void {
  const [W, H, D] = BENCH_ITEMS.scope.size;
  const P = SCOPE_PANEL;
  const y0 = FEET;
  const front = D / 2 - 0.012;
  for (const [x, z] of [
    [-W / 2 + 0.03, -D / 2 + 0.03],
    [W / 2 - 0.03, -D / 2 + 0.03],
    [-W / 2 + 0.03, front - 0.03],
    [W / 2 - 0.03, front - 0.03],
  ] as const) {
    foot(kit, x, z);
  }
  // Capot en tôle crème (enveloppe), face arrière ajourée.
  kit.box(
    'world.props.paint',
    [0, y0 + H / 2, (front - D / 2) / 2],
    [W, H, D - 0.012],
    0.008,
    { tint: TINTS.instrumentCream },
    [0, 0, 0],
    2,
  );
  for (let k = 0; k < 7; k++) {
    kit.box(
      'world.props.plastic',
      [-0.09 + k * 0.03, y0 + H + 0.0004, -0.08],
      [0.012, 0.0015, 0.09],
      0.0006,
      {
        tint: TINTS.plasticBlack,
        castShadow: false,
      },
    );
  }
  frontFrame(kit, W, H, y0, front);
  const faceZ = front + 0.0008;
  kit.decal('scope', [0, y0 + H / 2, faceZ], [W, H]);
  const cy = y0 + H / 2;
  // Écran : quadrilatère émissif légèrement en saillie, entouré d'une lunette.
  const screen = panelRect(P, P.screen);
  const [sx, sy] = screen.center;
  const [sw, sh] = screen.size;
  kit.quad('world.props.scope', [sx, cy + sy, faceZ + 0.0012], [sw * 0.94, sh * 0.94], [0, 0, 0]);
  const bz = faceZ + 0.003;
  const bt = 0.005;
  const bez = { tint: TINTS.plasticBlack, castShadow: false };
  kit.box('world.props.plastic', [sx, cy + sy + sh / 2, bz], [sw + bt, bt, 0.006], 0.0015, bez);
  kit.box('world.props.plastic', [sx, cy + sy - sh / 2, bz], [sw + bt, bt, 0.006], 0.0015, bez);
  kit.box('world.props.plastic', [sx - sw / 2, cy + sy, bz], [bt, sh, 0.006], 0.0015, bez);
  kit.box('world.props.plastic', [sx + sw / 2, cy + sy, bz], [bt, sh, 0.006], 0.0015, bez);
  // Commandes.
  const bigR = panelRadius(P, P.bigKnobRadius);
  const angles = [0.9, -0.6];
  P.bigKnobs.forEach((uv, k) => {
    const [x, y] = panelPoint(P, uv);
    knob(kit, [x, cy + y, faceZ], bigR, 0.016, angles[k]!, { skirt: TINTS.plasticDark, metalCap: true });
  });
  const smallR = panelRadius(P, P.smallKnobRadius);
  P.smallKnobs.forEach((uv, k) => {
    const [x, y] = panelPoint(P, uv);
    knob(kit, [x, cy + y, faceZ], smallR, 0.01, -0.4 + k * 0.5, {
      skirt: k >= 4 ? TINTS.plasticGray : TINTS.plasticBlack,
    });
  });
  P.bnc.forEach((uv) => {
    const [x, y] = panelPoint(P, uv);
    bnc(kit, [x, cy + y, faceZ]);
  });
  {
    const [x, y] = panelPoint(P, P.power);
    kit.box('world.props.plastic', [x, cy + y, faceZ + 0.004], [0.011, 0.0085, 0.008], 0.0015, {
      tint: TINTS.plasticCream,
      castShadow: false,
    });
    const [lx, ly] = panelPoint(P, P.led);
    kit.led([lx, cy + ly, faceZ], 0.0022, 0x4dff6a, LED_CHANNEL.on);
  }
  // Poignée de transport rabattue sur le capot.
  const handle = { tint: TINTS.plasticDark };
  for (const x of [-W / 2 - 0.006, W / 2 + 0.006]) {
    kit.cylinder(
      'world.props.plastic',
      [x - Math.sign(x) * 0.006, cy, -0.02],
      [x + Math.sign(x) * 0.004, cy, -0.02],
      0.014,
      16,
      handle,
    );
    kit.box(
      'world.props.plastic',
      [x, y0 + H * 0.78, -0.045],
      [0.008, H * 0.55, 0.018],
      0.003,
      handle,
      [0.45, 0, 0],
    );
  }
  kit.box('world.props.plastic', [0, y0 + H + 0.012, -0.08], [W + 0.02, 0.012, 0.022], 0.005, handle);
  // Étiquette de contrôle métrologique sur le capot.
  kit.decal('scopeCal', [W / 2 - 0.045, y0 + H + 0.0006, 0.08], [0.05, 0.019], [-Math.PI / 2, 0, 0.1]);
  // Fiche BNC de la sonde branchée sur la voie 1.
  const [bx, by] = panelPoint(P, P.bnc[0]);
  kit.cylinder('steel.chrome', [bx, cy + by, faceZ + 0.008], [bx, cy + by, faceZ + 0.026], 0.0068, 14);
  kit.cylinder('world.props.plastic', [bx, cy + by, faceZ + 0.026], [bx, cy + by, faceZ + 0.05], 0.0045, 10, {
    tint: TINTS.plasticDark,
    radiusB: 0.003,
  });
  kit.toWorld([bx, cy + by, faceZ + 0.05], anchors.scopeCh1);
}

function buildPsu(kit: PropKit, anchors: InstrumentAnchors): void {
  const [W, H, D] = BENCH_ITEMS.psu.size;
  const P = PSU_PANEL;
  const y0 = FEET;
  const front = D / 2 - 0.01;
  for (const [x, z] of [
    [-W / 2 + 0.025, -D / 2 + 0.025],
    [W / 2 - 0.025, -D / 2 + 0.025],
    [-W / 2 + 0.025, front - 0.025],
    [W / 2 - 0.025, front - 0.025],
  ] as const) {
    foot(kit, x, z);
  }
  kit.box(
    'world.props.paint',
    [0, y0 + H / 2, (front - D / 2) / 2],
    [W, H, D - 0.01],
    0.007,
    { tint: tint(0x4b5357, 0.4) },
    [0, 0, 0],
    2,
  );
  frontFrame(kit, W, H, y0, front, 0.005);
  const faceZ = front + 0.0008;
  const cy = y0 + H / 2;
  kit.decal('psu', [0, cy, faceZ], [W, H]);
  // Afficheurs à LED (x = numéro d'afficheur, y = nombre de chiffres).
  const dv = panelRect(P, P.displayV);
  const da = panelRect(P, P.displayA);
  kit.quad(
    'world.props.seg',
    [dv.center[0], cy + dv.center[1], faceZ + 0.0006],
    [dv.size[0] * 0.92, dv.size[1] * 0.86],
    [0, 0, 0],
    rawTint(0, 3),
  );
  kit.quad(
    'world.props.seg',
    [da.center[0], cy + da.center[1], faceZ + 0.0006],
    [da.size[0] * 0.92, da.size[1] * 0.86],
    [0, 0, 0],
    rawTint(1, 3),
  );
  const kr = panelRadius(P, P.knobRadius);
  const [kvx, kvy] = panelPoint(P, P.knobV);
  const [kax, kay] = panelPoint(P, P.knobA);
  knob(kit, [kvx, cy + kvy, faceZ], kr, 0.014, 0.35, { metalCap: true });
  knob(kit, [kax, cy + kay, faceZ], kr, 0.014, -1.1, { metalCap: true });
  const [cvx, cvy] = panelPoint(P, P.ledCV);
  const [ccx, ccy] = panelPoint(P, P.ledCC);
  kit.led([cvx, cy + cvy, faceZ], 0.0022, 0x4dff6a, LED_CHANNEL.on);
  kit.led([ccx, cy + ccy, faceZ], 0.0022, 0xff3324, LED_CHANNEL.off);
  const colors = [TINTS.plasticRed, TINTS.plasticBlack, TINTS.plasticGreen];
  P.terminals.forEach((uv, k) => {
    const [x, y] = panelPoint(P, uv);
    bindingPost(kit, [x, cy + y, faceZ], colors[k]!);
    if (k === 0) kit.toWorld([x, cy + y, faceZ + 0.018], anchors.psuPlus);
    if (k === 1) kit.toWorld([x, cy + y, faceZ + 0.018], anchors.psuMinus);
  });
  const [swx, swy] = panelPoint(P, P.switch);
  rocker(kit, [swx, cy + swy, faceZ], 0.02, 0.011, true, TINTS.plasticRed);
  // Ruban de masquage annoté sur le capot.
  kit.decal('noteFuse', [-0.02, y0 + H + 0.0006, front - 0.03], [0.07, 0.016], [-Math.PI / 2, 0, 0.06]);
}

function buildMultimeter(kit: PropKit, anchors: InstrumentAnchors): void {
  const tilt = 0.22;
  const L = 0.184;
  const T = 0.038;
  const y0 = (T / 2) * Math.cos(tilt) + (L / 2) * Math.sin(tilt);
  kit.at([0, y0, 0], [tilt, 0, 0], () => {
    // Gaine caoutchouc jaune et boîtier.
    kit.box('world.props.plastic', [0, 0, 0], [0.094, T, L], 0.011, { tint: TINTS.holster }, [0, 0, 0], 2);
    kit.box('world.props.plastic', [0, T / 2 - 0.004, 0], [0.082, 0.012, 0.17], 0.004, {
      tint: TINTS.plasticDark,
    });
    const P = METER_PANEL;
    const faceY = T / 2 + 0.0022;
    kit.decal('meter', [0, faceY, 0], [P.meters[0], P.meters[1]], [-Math.PI / 2, 0, 0]);
    // Face → repère de l'appareil : (x, y) du plan de face → (x, faceY, −y).
    const onFace = (u: readonly [number, number], lift: number): Vec3Tuple => {
      const [x, y] = panelPoint(P, u);
      return [x, faceY + lift, -y];
    };
    const lcd = panelRect(P, P.lcd);
    kit.quad(
      'world.props.lcd',
      [lcd.center[0], faceY + 0.0006, -lcd.center[1]],
      [lcd.size[0] * 0.94, lcd.size[1] * 0.86],
      [-Math.PI / 2, 0, 0],
      rawTint(0, 4),
    );
    // Commutateur rotatif : disque et barrette de préhension, sur le calibre 20 V continu.
    const dial = onFace(P.dial, 0);
    kit.cylinder('world.props.plastic', dial, [dial[0], dial[1] + 0.006, dial[2]], 0.017, 24, {
      tint: TINTS.plasticBlack,
    });
    kit.box(
      'world.props.plastic',
      [dial[0], dial[1] + 0.0095, dial[2]],
      [0.034, 0.008, 0.009],
      0.003,
      { tint: TINTS.plasticBlack },
      [0, -0.45, 0],
    );
    kit.box(
      'world.props.plastic',
      [dial[0] - Math.cos(0.45) * 0.012, dial[1] + 0.0136, dial[2] - Math.sin(0.45) * 0.012],
      [0.008, 0.0012, 0.0022],
      0,
      { tint: TINTS.plasticCream, castShadow: false, edge: 'none' },
      [0, -0.45, 0],
    );
    P.jacks.forEach((u, k) => {
      const j = onFace(u, 0);
      kit.cylinder(
        'world.props.plastic',
        [j[0], j[1] - 0.002, j[2]],
        [j[0], j[1] + 0.001, j[2]],
        0.0048,
        12,
        { tint: k === 1 ? TINTS.plasticBlack : TINTS.plasticRed },
      );
    });
    // Fiches des cordons (COM noir, VΩ rouge) : corps coudés.
    const com = onFace(P.jacks[1], 0);
    const volt = onFace(P.jacks[2], 0);
    for (const [j, t, target] of [
      [com, TINTS.plasticBlack, anchors.meterCom],
      [volt, TINTS.plasticRed, anchors.meterVolt],
    ] as const) {
      kit.cylinder('world.props.plastic', j, [j[0], j[1] + 0.022, j[2]], 0.0055, 12, {
        tint: t,
        radiusB: 0.0048,
      });
      kit.toWorld([j[0], j[1] + 0.022, j[2]], target);
    }
    // Béquille chromée repliée sous l'arrière.
    kit.tube(
      'steel.chrome',
      [
        [-0.04, -T / 2, -0.05],
        [-0.043, -T / 2 - 0.01, -0.08],
        [0, -T / 2 - 0.012, -0.088],
        [0.043, -T / 2 - 0.01, -0.08],
        [0.04, -T / 2, -0.05],
      ],
      0.0016,
      5,
    );
  });
}

/** Cordons de mesure et câble de la sonde (repère monde). */
function buildLeads(kit: PropKit, a: InstrumentAnchors): void {
  const top = BENCH_TOP + 0.004;
  const lead = (from: THREE.Vector3, to: THREE.Vector3, material: string, lift: number, bend: number) => {
    const mid = from.clone().lerp(to, 0.5);
    const pts: Vec3Tuple[] = [
      [from.x, from.y, from.z],
      [from.x + (from.x - mid.x) * 0.1, from.y + 0.04, from.z + 0.03],
      [mid.x + bend, top + lift, mid.z + 0.05],
      [to.x + (mid.x - to.x) * 0.2, to.y + 0.03, to.z + 0.05],
      [to.x, to.y, to.z + 0.008],
    ];
    kit.tube(material, pts, 0.0021, 6, { perMeter: 50 });
  };
  lead(a.meterVolt, a.psuPlus, 'silicone.red', 0.002, 0.02);
  lead(a.meterCom, a.psuMinus, 'silicone.black', 0.005, -0.02);
  // Fiches bananes enfoncées dans les bornes.
  for (const [p, material] of [
    [a.psuPlus, 'silicone.red'],
    [a.psuMinus, 'silicone.black'],
  ] as const) {
    kit.cylinder(material, [p.x, p.y, p.z - 0.004], [p.x, p.y, p.z + 0.014], 0.0048, 10);
  }
  // Sonde d'oscilloscope : câble jusqu'à la sonde couchée à droite du tapis, pince crochet.
  const probeTip: Vec3Tuple = [-0.38, top + 0.006, -1.38];
  const probeBack: Vec3Tuple = [-0.31, top + 0.007, -1.43];
  const c = a.scopeCh1;
  kit.tube(
    'rubber.black',
    [
      [c.x, c.y, c.z],
      [c.x - 0.01, c.y - 0.03, c.z + 0.05],
      [c.x - 0.03, top + 0.004, c.z + 0.1],
      [-0.2, top + 0.004, -1.47],
      [probeBack[0] + 0.05, top + 0.004, probeBack[2] - 0.01],
      probeBack,
    ],
    0.0024,
    6,
    { perMeter: 40 },
  );
  kit.cylinder('world.props.plastic', probeBack, probeTip, 0.0055, 12, {
    tint: TINTS.plasticGray,
    radiusB: 0.0045,
    castShadow: false,
  });
  kit.cylinder(
    'steel.chrome',
    probeTip,
    [probeTip[0] - 0.02, probeTip[1] - 0.001, probeTip[2] + 0.012],
    0.0011,
    6,
    { castShadow: false },
  );
  // Pince de masse (petit crocodile noir).
  kit.tube(
    'rubber.black',
    [
      [probeBack[0] - 0.02, probeBack[1], probeBack[2] + 0.012],
      [-0.35, top + 0.003, -1.36],
      [-0.33, top + 0.003, -1.33],
    ],
    0.0012,
    5,
  );
  kit.box(
    'world.props.plastic',
    [-0.325, top + 0.004, -1.325],
    [0.018, 0.006, 0.007],
    0.002,
    { tint: TINTS.plasticBlack, castShadow: false },
    [0, 0.7, 0],
  );
}
