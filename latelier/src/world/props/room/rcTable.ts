/**
 * Table de la voiture radiocommandée (mur est) : buggy 1/10 en réparation sur son support (une
 * roue arrière démontée posée à côté, carrosserie retirée), émetteur à manches, chargeur dont le
 * voyant clignote avec son pack d'accus, clés hexagonales ; affiche de la coupe de modélisme.
 * Façade de la table vers l'ouest (−X).
 */
import { mulberry32 } from '../../lighting/neonFlicker';
import { tint, type Tint } from '../batch';
import type { PropKit } from '../kit';
import { RC, WALL_ITEMS } from '../dims';
import { LED_CHANNEL } from '../materials';
import { TINTS } from '../parts';
import { ROOM } from '../../layout';
import type { Vec3Tuple } from '../../geometry/shapes';

export function buildRcTable(kit: PropKit): void {
  const [x0, x1] = RC.x;
  const [z0, z1] = RC.z;
  const top = RC.height;
  kit.boxMinMax('wood.plywood', [x0, top - RC.topThickness, z0], [x1, top, z1], 0.004, {}, 2);
  for (const x of [x0 + 0.03, x1 - 0.03]) {
    for (const z of [z0 + 0.03, z1 - 0.03]) {
      kit.boxMinMax(
        'world.bench.frame',
        [x - 0.02, 0, z - 0.02],
        [x + 0.02, top - RC.topThickness, z + 0.02],
        0.004,
        { uvRotate: true },
      );
    }
  }
  kit.boxMinMax('world.bench.frame', [x0 + 0.02, 0.12, z0 + 0.02], [x0 + 0.04, 0.16, z1 - 0.02], 0.003);
  kit.boxMinMax(
    'world.bench.frame',
    [x0 + 0.03, top - RC.topThickness - 0.06, z0 + 0.012],
    [x1 - 0.03, top - RC.topThickness, z0 + 0.03],
    0.003,
  );
  kit.boxMinMax(
    'world.bench.frame',
    [x0 + 0.03, top - RC.topThickness - 0.06, z1 - 0.03],
    [x1 - 0.03, top - RC.topThickness, z1 - 0.012],
    0.003,
  );

  // Support et buggy (nez vers le sud).
  const standTop = top + 0.055;
  kit.boxMinMax('world.bench.frame', [2.2, top, 0.26], [2.28, standTop, 0.34], 0.004);
  kit.at([2.24, standTop, 0.3], [0, 0.08, 0], () => buggy(kit));
  // Roue démontée, son écrou et la carrosserie posée à l'envers contre le mur.
  kit.at([2.14, top, 0.54], [0, 0.4, 0], () => {
    wheel(kit, [0, 0.0215, 0], [0, 0, 0], 0.045, 0.043, TINTS.plasticYellow);
    kit.cylinder('steel.zinc', [0.06, 0, 0.03], [0.06, 0.005, 0.03], 0.004, 6, { castShadow: false });
  });
  bodyShell(kit, [2.37, top, -0.04]);
  transmitter(kit, [2.16, top, -0.09]);
  charger(kit, [2.4, top, 0.6]);
  // Clés hexagonales (manches rouges) et vis en vrac.
  const rand = mulberry32(31);
  for (let k = 0; k < 2; k++) {
    kit.at([2.07 + k * 0.025, top + 0.006, 0.12 + k * 0.02], [0, 0.2 + k * 0.3, Math.PI / 2], () => {
      kit.cylinder('world.props.plastic', [0, -0.05, 0], [0, 0.03, 0], 0.0065, 8, { tint: TINTS.plasticRed });
      kit.cylinder('steel.chrome', [0, 0.03, 0], [0, 0.09, 0], 0.0012, 6, { castShadow: false });
    });
  }
  for (let k = 0; k < 7; k++) {
    kit.cylinder(
      'steel.blackoxide',
      [2.1 + rand() * 0.06, top + 0.0015, 0.2 + rand() * 0.05],
      [2.1 + rand() * 0.06, top + 0.0015, 0.2 + rand() * 0.05],
      0.0012,
      5,
      {
        castShadow: false,
      },
    );
  }
  // Affiche de modélisme punaisée.
  const p = WALL_ITEMS.posterModel;
  kit.decal('posterModel', [ROOM.maxX - 0.0008, p.center[1], p.center[2]], p.size, [0, -Math.PI / 2, 0]);
}

/** Roue : pneu à crampons (profil ondulé), jante colorée. Axe selon Y local après `rotation`. */
function wheel(
  kit: PropKit,
  center: Vec3Tuple,
  rotation: Vec3Tuple,
  radius: number,
  width: number,
  rim: Tint,
): void {
  const w = width / 2;
  const profile: [number, number][] = [[radius * 0.62, -w]];
  const ribs = 7;
  for (let k = 0; k <= ribs; k++)
    profile.push([k % 2 === 0 ? radius : radius * 0.95, -w + (2 * w * k) / ribs]);
  profile.push([radius * 0.62, w]);
  kit.lathe('rubber.black', profile, center, rotation, 22);
  kit.lathe(
    'world.props.plastic',
    [
      [radius * 0.62, -w * 0.9],
      [radius * 0.64, -w * 0.3],
      [radius * 0.2, -w * 0.2],
      [radius * 0.15, w * 0.4],
      [0, w * 0.4],
    ],
    center,
    rotation,
    16,
    { tint: rim },
  );
}

/** Buggy 1/10 : châssis, cloisons, amortisseurs, triangles, moteur, accus, servo, récepteur. */
function buggy(kit: PropKit): void {
  const black = { tint: TINTS.plasticBlack };
  kit.box('world.props.plastic', [0, 0.004, 0], [0.1, 0.004, 0.33], 0.0015, black);
  kit.box('world.props.plastic', [0, 0.02, 0.14], [0.08, 0.03, 0.02], 0.003, black);
  kit.box('world.props.plastic', [0, 0.03, -0.12], [0.1, 0.05, 0.06], 0.006, { tint: tint(0x2a2a2a, 0.45) });
  // Moteur 540 et pignon.
  kit.cylinder('steel.zinc', [0.02, 0.035, -0.08], [0.058, 0.035, -0.08], 0.018, 16);
  kit.cylinder('brass', [0.058, 0.035, -0.08], [0.064, 0.035, -0.08], 0.005, 10);
  kit.cylinder('silicone.red', [0.04, 0.052, -0.08], [0.04, 0.07, -0.02], 0.0012, 5, { castShadow: false });
  // Pack d'accus 6 éléments (gaine jaune), servo, récepteur et antenne.
  for (let k = 0; k < 6; k++) {
    const x = k < 3 ? -0.012 : 0.012;
    const z = -0.03 + (k % 3) * 0.044 - 0.022;
    kit.cylinder('heatshrink.yellow', [x, 0.018, z - 0.021], [x, 0.018, z + 0.021], 0.0115, 12);
  }
  kit.box('world.props.plastic', [-0.03, 0.022, 0.08], [0.02, 0.036, 0.04], 0.003, black);
  kit.box('world.props.plastic', [0.03, 0.018, 0.07], [0.034, 0.02, 0.044], 0.003, {
    tint: tint(0x2b5a8c, 0.4),
  });
  kit.tube(
    'world.props.plastic',
    [
      [0.03, 0.028, 0.05],
      [0.035, 0.08, 0.03],
      [0.04, 0.2, 0.0],
    ],
    0.0009,
    4,
    { tint: TINTS.plasticBlack, perMeter: 60 },
  );
  // Tours d'amortisseurs, amortisseurs rouges anodisés, triangles, roues.
  for (const [z, front] of [
    [0.12, true],
    [-0.12, false],
  ] as const) {
    kit.box('world.props.plastic', [0, 0.06, z], [0.12, 0.006, 0.012], 0.002, black);
    for (const side of [-1, 1]) {
      const wx = side * (front ? 0.1 : 0.105);
      kit.box('world.props.plastic', [side * 0.06, 0.004, z], [0.08, 0.008, 0.028], 0.003, black);
      kit.cylinder('alu.anodized.red', [side * 0.05, 0.058, z], [side * 0.085, 0.005, z], 0.006, 10);
      kit.cylinder('steel.spring', [side * 0.052, 0.052, z], [side * 0.07, 0.025, z], 0.0078, 8, {
        open: true,
        castShadow: false,
      });
      const rearRightRemoved = !front && side > 0;
      if (rearRightRemoved) {
        // Fusée nue (roue démontée) : hexagone d'entraînement et axe.
        kit.cylinder('steel.zinc', [wx - 0.02, 0.0, z], [wx + 0.005, 0.0, z], 0.003, 8);
        kit.cylinder('world.props.plastic', [wx - 0.004, 0, z], [wx + 0.004, 0, z], 0.006, 6, black);
        continue;
      }
      wheel(
        kit,
        [wx, 0.0, z],
        [0, 0, Math.PI / 2],
        front ? 0.042 : 0.045,
        front ? 0.03 : 0.043,
        TINTS.plasticYellow,
      );
    }
  }
  kit.box('world.props.plastic', [0, 0.035, 0.175], [0.13, 0.012, 0.02], 0.005, { tint: TINTS.plasticBlack });
}

/** Carrosserie en polycarbonate peinte (rouge et jaune), autocollant, posée sur la table. */
function bodyShell(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [0, 0.35, 0], () => {
    kit.lathe(
      'world.props.plastic',
      [
        [0.1, 0],
        [0.1, 0.012],
        [0.085, 0.045],
        [0.05, 0.065],
        [0, 0.07],
      ],
      [0, 0, 0],
      [0, 0, 0],
      24,
      { tint: tint(0xb0261c, 0.18) },
    );
    kit.decal('rcSticker', [0, 0.071, 0.0], [0.1, 0.046], [-Math.PI / 2, 0, 0]);
  });
}

/** Émetteur à manches, couché, antenne télescopique déployée. */
function transmitter(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [0, -0.5, 0], () => {
    kit.box(
      'world.props.plastic',
      [0, 0.03, 0],
      [0.17, 0.06, 0.2],
      0.012,
      { tint: tint(0x2a2b2d, 0.45) },
      [0, 0, 0],
      2,
    );
    kit.decal('transmitter', [0, 0.0606, 0.05], [0.12, 0.06], [-Math.PI / 2, 0, 0]);
    for (const x of [-0.045, 0.045]) {
      kit.cylinder('world.props.plastic', [x, 0.06, -0.035], [x, 0.063, -0.035], 0.017, 16, {
        tint: TINTS.plasticSilver,
      });
      kit.cylinder('steel.chrome', [x, 0.063, -0.035], [x + 0.004, 0.09, -0.037], 0.0022, 6);
      kit.cylinder('world.props.plastic', [x + 0.004, 0.09, -0.037], [x + 0.005, 0.098, -0.038], 0.0045, 8, {
        tint: TINTS.plasticBlack,
      });
    }
    kit.cylinder('steel.chrome', [0.06, 0.05, -0.1], [0.08, 0.052, -0.35], 0.004, 8);
    kit.cylinder('steel.chrome', [0.08, 0.052, -0.35], [0.1, 0.054, -0.6], 0.0028, 8);
  });
}

function charger(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [0, -Math.PI / 2 + 0.1, 0], () => {
    kit.box(
      'world.props.plastic',
      [0, 0.025, 0],
      [0.12, 0.05, 0.09],
      0.006,
      { tint: tint(0x262626, 0.45) },
      [0, 0, 0],
      2,
    );
    kit.decal('charger', [0, 0.025, 0.0452], [0.1, 0.05]);
    kit.led([0.035, 0.012, 0.0452], 0.0025, 0xff3324, LED_CHANNEL.charger);
    kit.decal('noteCharge', [0, 0.0506, 0], [0.11, 0.017], [-Math.PI / 2, 0, 0.05]);
    // Pack d'accus en charge, cordon.
    kit.at([0.02, 0, 0.12], [0, 0.3, 0], () => {
      for (let k = 0; k < 6; k++) {
        const x = (k % 3) * 0.024 - 0.024;
        const y = k < 3 ? 0.0115 : 0.0345;
        kit.cylinder('heatshrink.blue', [x, y, -0.024], [x, y, 0.024], 0.0115, 12);
      }
    });
    kit.tube(
      'silicone.red',
      [
        [-0.04, 0.012, 0.045],
        [-0.03, 0.004, 0.08],
        [0.0, 0.01, 0.1],
      ],
      0.0014,
      5,
      { perMeter: 100 },
    );
    kit.tube(
      'rubber.black',
      [
        [0.06, 0.02, -0.03],
        [0.1, 0.01, -0.04],
        [0.14, 0.004, -0.06],
      ],
      0.0025,
      5,
      { perMeter: 60 },
    );
  });
}
