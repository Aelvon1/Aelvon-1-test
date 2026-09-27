/**
 * Poste de soudage (partie gauche de l'établi) : station de soudage (bouton gradué, voyant de
 * chauffe), fer posé dans son support à spirale avec éponge et paille de laiton, station à air
 * chaud (afficheur de température) et sa poignée sur un berceau, dévidoir d'étain, flacon de
 * flux, pompe à dessouder, bobine de tresse, brucelles.
 */
import * as THREE from 'three/webgpu';
import { rawTint, tint } from '../batch';
import { PropKit } from '../kit';
import { BENCH_ITEMS, BENCH_TOP, type Placement } from '../dims';
import { HOTAIR_PANEL, panelPoint, panelRadius, panelRect, SOLDER_PANEL } from '../atlas/panels';
import { LED_CHANNEL } from '../materials';
import { foot, knob, rocker, TINTS } from '../parts';
import { HelixCurve, tubeAlong, type Vec3Tuple } from '../../geometry/shapes';

const FEET = 0.012;

/** Pose un objet de l'établi dans son repère local (origine au plateau). */
function onBench(kit: PropKit, item: Placement, fn: () => void): void {
  kit.at([item.center[0], BENCH_TOP, item.center[1]], [0, item.yaw, 0], fn);
}

export function buildSoldering(kit: PropKit): void {
  const socket = new THREE.Vector3();
  const ironEnd = new THREE.Vector3();
  const hoseStart = new THREE.Vector3();
  const hoseEnd = new THREE.Vector3();
  onBench(kit, BENCH_ITEMS.solderStation, () => buildSolderStation(kit, socket));
  onBench(kit, BENCH_ITEMS.ironHolder, () => buildIronHolder(kit, ironEnd));
  onBench(kit, BENCH_ITEMS.hotAir, () => buildHotAirStation(kit, hoseStart));
  onBench(kit, BENCH_ITEMS.hotAirCradle, () => buildHotAirHandpiece(kit, hoseEnd));
  onBench(kit, BENCH_ITEMS.solderSpool, () => buildSolderSpool(kit));
  onBench(kit, BENCH_ITEMS.flux, () => buildFlux(kit));
  onBench(kit, BENCH_ITEMS.pump, () => buildPump(kit));
  onBench(kit, BENCH_ITEMS.braid, () => buildBraid(kit));
  onBench(kit, BENCH_ITEMS.tweezers, () => buildTweezers(kit));
  // Cordon du fer (silicone gris) : de la prise de la station à l'arrière du manche.
  const top = BENCH_TOP + 0.004;
  kit.tube(
    'world.props.plastic',
    [
      [socket.x, socket.y, socket.z],
      [socket.x + 0.01, socket.y - 0.02, socket.z + 0.04],
      [socket.x + 0.03, top, socket.z + 0.1],
      [ironEnd.x + 0.06, top, ironEnd.z + 0.04],
      [ironEnd.x + 0.02, ironEnd.y - 0.03, ironEnd.z + 0.03],
      [ironEnd.x, ironEnd.y, ironEnd.z],
    ],
    0.0028,
    6,
    { perMeter: 50, tint: tint(0x5d6166, 0.55) },
  );
  // Gaine de la poignée à air chaud (plus épaisse, annelée suggérée par la rugosité).
  kit.tube(
    'rubber.black',
    [
      [hoseStart.x, hoseStart.y, hoseStart.z],
      [hoseStart.x, hoseStart.y - 0.02, hoseStart.z + 0.05],
      [hoseStart.x - 0.03, top + 0.004, hoseStart.z + 0.1],
      [hoseEnd.x + 0.03, top + 0.004, hoseEnd.z - 0.05],
      [hoseEnd.x + 0.01, hoseEnd.y - 0.02, hoseEnd.z - 0.02],
      [hoseEnd.x, hoseEnd.y, hoseEnd.z],
    ],
    0.0062,
    8,
    { perMeter: 40 },
  );
}

function caseFeet(kit: PropKit, W: number, D: number): void {
  for (const [x, z] of [
    [-W / 2 + 0.02, -D / 2 + 0.02],
    [W / 2 - 0.02, -D / 2 + 0.02],
    [-W / 2 + 0.02, D / 2 - 0.03],
    [W / 2 - 0.02, D / 2 - 0.03],
  ] as const) {
    foot(kit, x, z, 0.008, FEET);
  }
}

function buildSolderStation(kit: PropKit, socketOut: THREE.Vector3): void {
  const [W, H, D] = BENCH_ITEMS.solderStation.size;
  const P = SOLDER_PANEL;
  caseFeet(kit, W, D);
  kit.box(
    'world.props.paint',
    [0, FEET + H / 2, 0],
    [W, H, D],
    0.008,
    { tint: TINTS.oliveDark },
    [0, 0, 0],
    2,
  );
  const faceZ = D / 2 + 0.0008;
  const cy = FEET + H / 2;
  kit.decal('solder', [0, cy, faceZ], [W - 0.004, H - 0.004]);
  const [kx, ky] = panelPoint(P, P.knob);
  // Bouton sur 350 °C (graduation 150 → 450 °C sur 270°).
  knob(kit, [kx, cy + ky, faceZ], panelRadius(P, P.knobRadius), 0.018, Math.PI / 4, {
    skirt: TINTS.plasticBlack,
    metalCap: true,
  });
  const [lx, ly] = panelPoint(P, P.led);
  kit.led([lx, cy + ly, faceZ], 0.0026, 0xff3a20, LED_CHANNEL.heater);
  const [swx, swy] = panelPoint(P, P.switch);
  rocker(kit, [swx, cy + swy, faceZ], 0.011, 0.016, true, TINTS.plasticRed);
  const [ox, oy] = panelPoint(P, P.socket);
  kit.cylinder('world.props.plastic', [ox, cy + oy, faceZ], [ox, cy + oy, faceZ + 0.026], 0.0078, 16, {
    tint: TINTS.plasticBlack,
    radiusB: 0.0062,
  });
  kit.toWorld([ox, cy + oy, faceZ + 0.026], socketOut);
  // Boîte d'étameur de pannes sur le capot.
  kit.lathe(
    'tin',
    [
      [0.018, 0],
      [0.018, 0.012],
      [0.0165, 0.0135],
      [0, 0.0135],
    ],
    [-0.03, FEET + H, -0.03],
    [0, 0, 0],
    22,
  );
  kit.cylinder(
    'world.props.plastic',
    [-0.03, FEET + H + 0.0136, -0.03],
    [-0.03, FEET + H + 0.0142, -0.03],
    0.0125,
    18,
    {
      tint: tint(0x5f6a6e, 0.4),
      castShadow: false,
    },
  );
}

function buildIronHolder(kit: PropKit, ironEndOut: THREE.Vector3): void {
  // Socle en fonte peinte, bac à éponge et paille de laiton.
  kit.box(
    'world.props.paint',
    [0, 0.009, 0],
    [0.1, 0.018, 0.14],
    0.006,
    { tint: TINTS.charcoal },
    [0, 0, 0],
    2,
  );
  kit.box(
    'world.props.plastic',
    [-0.018, 0.02, 0.035],
    [0.055, 0.01, 0.052],
    0.004,
    { tint: TINTS.sponge },
    [0, 0, 0],
    2,
  );
  const wool = new THREE.IcosahedronGeometry(0.014, 1);
  wool.scale(1, 0.62, 1);
  kit.add('brass', wool, PropKit.place([0.03, 0.024, 0.04], [0.3, 0.8, 0]), {
    edge: 'none',
    castShadow: false,
  });
  // Axe de la spirale (ouverture vers l'avant et le haut).
  const dir = new THREE.Vector3(0, 0.6, 0.8).normalize();
  const B = new THREE.Vector3(0, 0.03, -0.035);
  kit.box('world.props.paint', [0, 0.03, -0.035], [0.012, 0.03, 0.03], 0.003, { tint: TINTS.charcoal });
  kit.pushMatrix(PropKit.alongY([B.x, B.y, B.z], [dir.x, dir.y, dir.z]));
  kit.add('steel.chrome', tubeAlong(new HelixCurve(0.017, 0.085, 7), 0.0012, 5, 130), null, {
    edge: 'none',
    castShadow: false,
  });
  kit.cylinder('steel.chrome', [0, 0.085, 0], [0, 0.0865, 0], 0.0185, 18, { open: true });
  kit.pop();
  // Fer : panne, fourreau, écrou, manche, serre-câble.
  const at = (d: number): Vec3Tuple => [B.x + dir.x * d, B.y + dir.y * d, B.z + dir.z * d];
  kit.cylinder('tin', at(0.006), at(0.026), 0.0026, 10, { radiusB: 0.0012 });
  kit.cylinder('steel.stainless', at(0.026), at(0.095), 0.0034, 12);
  kit.cylinder('alu.machined', at(0.095), at(0.104), 0.0068, 12);
  kit.pushMatrix(PropKit.alongY(at(0.104), [dir.x, dir.y, dir.z]));
  kit.lathe(
    'world.props.plastic',
    [
      [0.0068, 0],
      [0.0095, 0.012],
      [0.0098, 0.02],
      [0.0088, 0.03],
      [0.0092, 0.05],
      [0.0105, 0.075],
      [0.0098, 0.09],
      [0.005, 0.1],
      [0, 0.1],
    ],
    [0, 0, 0],
    [0, 0, 0],
    18,
    { tint: tint(0x2f3336, 0.45) },
  );
  // Bague de préhension caoutchouc.
  kit.lathe(
    'rubber.black',
    [
      [0.0099, 0.014],
      [0.0101, 0.018],
      [0.0101, 0.045],
      [0.0094, 0.049],
    ],
    [0, 0, 0],
    [0, 0, 0],
    18,
  );
  kit.pop();
  kit.cylinder('rubber.black', at(0.204), at(0.23), 0.004, 8, { radiusB: 0.003 });
  kit.toWorld(at(0.23), ironEndOut);
}

function buildHotAirStation(kit: PropKit, hoseOut: THREE.Vector3): void {
  const [W, H, D] = BENCH_ITEMS.hotAir.size;
  const P = HOTAIR_PANEL;
  caseFeet(kit, W, D);
  kit.box('world.props.paint', [0, FEET + H / 2, 0], [W, H, D], 0.008, { tint: TINTS.orange }, [0, 0, 0], 2);
  const faceZ = D / 2 + 0.0008;
  const cy = FEET + H / 2;
  kit.decal('hotair', [0, cy, faceZ], [W - 0.006, H - 0.006]);
  const d = panelRect(P, P.display);
  kit.quad(
    'world.props.seg',
    [d.center[0], cy + d.center[1], faceZ + 0.0006],
    [d.size[0] * 0.9, d.size[1] * 0.84],
    [0, 0, 0],
    rawTint(2, 3),
  );
  const r = panelRadius(P, P.knobRadius);
  P.knobs.forEach((uv, k) => {
    const [x, y] = panelPoint(P, uv);
    knob(kit, [x, cy + y, faceZ], r, 0.014, k === 0 ? -0.3 : 0.9, {
      skirt: TINTS.plasticBlack,
      metalCap: true,
    });
  });
  const [lx, ly] = panelPoint(P, P.led);
  kit.led([lx, cy + ly, faceZ], 0.0024, 0xffa11a, LED_CHANNEL.hotAir);
  const [swx, swy] = panelPoint(P, P.switch);
  rocker(kit, [swx, cy + swy, faceZ], 0.018, 0.01, true, TINTS.plasticRed);
  const [ox, oy] = panelPoint(P, P.outlet);
  kit.cylinder('rubber.black', [ox, cy + oy, faceZ], [ox, cy + oy, faceZ + 0.02], 0.011, 16, {
    radiusB: 0.008,
  });
  kit.toWorld([ox, cy + oy, faceZ + 0.02], hoseOut);
  // Aérations sur le capot.
  for (let k = 0; k < 5; k++) {
    kit.box(
      'world.props.plastic',
      [-0.04 + k * 0.02, FEET + H + 0.0004, -0.03],
      [0.008, 0.0012, 0.08],
      0.0005,
      {
        tint: TINTS.plasticBlack,
        castShadow: false,
      },
    );
  }
}

function buildHotAirHandpiece(kit: PropKit, hoseOut: THREE.Vector3): void {
  // Berceau : semelle et deux étriers en fil chromé.
  kit.box('world.props.paint', [0, 0.004, 0], [0.09, 0.008, 0.06], 0.003, { tint: TINTS.charcoal });
  for (const x of [-0.03, 0.03]) {
    kit.tube(
      'steel.chrome',
      [
        [x, 0.008, -0.022],
        [x, 0.04, -0.02],
        [x, 0.028, 0],
        [x, 0.04, 0.02],
        [x, 0.008, 0.022],
      ],
      0.0018,
      5,
    );
  }
  // Poignée couchée selon X local (buse vers −X).
  const y = 0.044;
  kit.pushMatrix(PropKit.alongY([0.07, y, 0], [-1, 0, 0]));
  kit.lathe(
    'world.props.plastic',
    [
      [0.006, 0],
      [0.012, 0.01],
      [0.0145, 0.03],
      [0.0152, 0.07],
      [0.0135, 0.1],
      [0.0118, 0.115],
      [0, 0.115],
    ],
    [0, 0, 0],
    [0, 0, 0],
    18,
    { tint: tint(0x303236, 0.5) },
  );
  kit.lathe(
    'steel.stainless',
    [
      [0.0112, 0.114],
      [0.0112, 0.165],
      [0.009, 0.172],
      [0.004, 0.178],
      [0.004, 0.195],
      [0, 0.195],
    ],
    [0, 0, 0],
    [0, 0, 0],
    16,
  );
  kit.pop();
  kit.box('world.props.plastic', [0.02, y + 0.015, 0], [0.018, 0.004, 0.008], 0.0015, {
    tint: TINTS.plasticRed,
    castShadow: false,
  });
  kit.toWorld([0.075, y, 0], hoseOut);
}

function buildSolderSpool(kit: PropKit): void {
  // Étrier du dévidoir, axe, bobine d'étain (flasques rouges).
  kit.box('world.props.paint', [0, 0.004, 0], [0.07, 0.008, 0.07], 0.003, { tint: TINTS.teal });
  for (const x of [-0.029, 0.029])
    kit.box('world.props.paint', [x, 0.03, 0], [0.004, 0.05, 0.02], 0.0015, { tint: TINTS.teal });
  const axleY = 0.046;
  kit.cylinder('steel.zinc', [-0.033, axleY, 0], [0.033, axleY, 0], 0.003, 8);
  kit.pushMatrix(PropKit.alongY([-0.021, axleY, 0], [1, 0, 0]));
  kit.lathe(
    'world.props.plastic',
    [
      [0.006, 0],
      [0.032, 0],
      [0.032, 0.003],
      [0.009, 0.003],
    ],
    [0, 0, 0],
    [0, 0, 0],
    24,
    { tint: TINTS.plasticRed },
  );
  kit.lathe(
    'solder',
    [
      [0.009, 0.003],
      [0.024, 0.003],
      [0.0246, 0.021],
      [0.024, 0.039],
      [0.009, 0.039],
    ],
    [0, 0, 0],
    [0, 0, 0],
    24,
  );
  kit.lathe(
    'world.props.plastic',
    [
      [0.009, 0.039],
      [0.032, 0.039],
      [0.032, 0.042],
      [0.006, 0.042],
    ],
    [0, 0, 0],
    [0, 0, 0],
    24,
    { tint: TINTS.plasticRed },
  );
  kit.pop();
  // Fil d'étain déroulé qui retombe vers l'avant.
  kit.tube(
    'solder',
    [
      [0, axleY + 0.024, 0.004],
      [0.004, axleY + 0.02, 0.03],
      [0.01, 0.01, 0.05],
      [0.02, 0.002, 0.075],
      [0.05, 0.0012, 0.09],
    ],
    0.0006,
    4,
    { perMeter: 80 },
  );
}

function buildFlux(kit: PropKit): void {
  kit.lathe(
    'world.props.plastic',
    [
      [0.015, 0],
      [0.016, 0.004],
      [0.016, 0.045],
      [0.012, 0.052],
      [0.006, 0.054],
      [0, 0.054],
    ],
    [0, 0, 0],
    [0, 0, 0],
    18,
    { tint: tint(0xa8641e, 0.25) },
  );
  kit.cylinder('world.props.plastic', [0, 0.054, 0], [0, 0.07, 0], 0.005, 12, {
    tint: TINTS.plasticCream,
    radiusB: 0.002,
  });
  kit.cylinder('steel.stainless', [0, 0.07, 0], [0, 0.084, 0.004], 0.0006, 5, { castShadow: false });
  kit.cylinder('world.props.plastic', [0, 0.02, 0], [0, 0.036, 0], 0.0163, 18, {
    tint: TINTS.plasticCream,
    open: true,
  });
}

function buildPump(kit: PropKit): void {
  const r = 0.0115;
  const y = r;
  kit.cylinder('alu.anodized.blue', [-0.07, y, 0], [0.06, y, 0], r, 18);
  kit.cylinder('world.props.plastic', [0.06, y, 0], [0.095, y, 0], 0.0075, 14, {
    tint: TINTS.plasticCream,
    radiusB: 0.0028,
  });
  kit.cylinder('steel.chrome', [-0.07, y, 0], [-0.1, y, 0], 0.003, 8);
  kit.cylinder('world.props.plastic', [-0.1, y, 0], [-0.112, y, 0], 0.0095, 14, { tint: TINTS.plasticBlack });
  kit.cylinder('world.props.plastic', [0.025, y + r - 0.002, 0], [0.025, y + r + 0.004, 0], 0.0042, 10, {
    tint: TINTS.plasticBlack,
  });
}

function buildBraid(kit: PropKit): void {
  kit.lathe(
    'world.props.plastic',
    [
      [0.006, 0],
      [0.024, 0],
      [0.024, 0.003],
      [0.008, 0.003],
    ],
    [0, 0, 0],
    [0, 0, 0],
    22,
    { tint: TINTS.plasticGreen },
  );
  kit.lathe(
    'copper.bare',
    [
      [0.008, 0.003],
      [0.019, 0.003],
      [0.019, 0.01],
      [0.008, 0.01],
    ],
    [0, 0, 0],
    [0, 0, 0],
    22,
  );
  kit.lathe(
    'world.props.plastic',
    [
      [0.008, 0.01],
      [0.024, 0.01],
      [0.024, 0.013],
      [0.006, 0.013],
    ],
    [0, 0, 0],
    [0, 0, 0],
    22,
    { tint: TINTS.plasticGreen },
  );
  kit.box(
    'copper.bare',
    [0.028, 0.0008, 0.006],
    [0.02, 0.0012, 0.0025],
    0,
    { edge: 'none', castShadow: false },
    [0, 0.3, 0],
  );
}

function buildTweezers(kit: PropKit): void {
  for (const side of [-1, 1]) {
    kit.box(
      'steel.stainless',
      [side * 0.0022, 0.0022, 0],
      [0.0016, 0.0008, 0.118],
      0.0003,
      { edge: 'none', castShadow: false },
      [0, side * 0.035, 0],
    );
  }
  kit.box('steel.stainless', [0, 0.0022, -0.058], [0.0055, 0.0012, 0.008], 0.0005, { castShadow: false });
}
