/**
 * Coin électronique : bureau (plateau bois, piètement tube peint crème, tiroir), pile de revues,
 * plaque d'essais avec un montage à 555 dont deux LED clignotent, pile 9 V, tasse à crayons ;
 * affiche du code des couleurs punaisée au mur ouest.
 * Façade du bureau vers l'est (+X), dos contre le mur ouest.
 */
import { tint } from '../batch';
import type { PropKit } from '../kit';
import { DESK, WALL_ITEMS } from '../dims';
import { LED_CHANNEL } from '../materials';
import { TINTS } from '../parts';
import { ROOM } from '../../layout';
import type { Vec3Tuple } from '../../geometry/shapes';

export function buildDesk(kit: PropKit): void {
  const [x0, x1] = DESK.x;
  const [z0, z1] = DESK.z;
  const top = DESK.height;
  const th = DESK.topThickness;
  const legs = { tint: TINTS.cream };
  kit.boxMinMax('world.bench.frame', [x0, top - th, z0], [x1, top, z1], 0.006, {}, 2);
  const inset = 0.035;
  const legW = 0.03;
  for (const x of [x0 + inset, x1 - inset]) {
    for (const z of [z0 + inset, z1 - inset]) {
      kit.boxMinMax(
        'world.props.paint',
        [x - legW / 2, 0.012, z - legW / 2],
        [x + legW / 2, top - th, z + legW / 2],
        0.004,
        legs,
      );
      kit.boxMinMax(
        'rubber.black',
        [x - legW / 2 - 0.002, 0, z - legW / 2 - 0.002],
        [x + legW / 2 + 0.002, 0.012, z + legW / 2 + 0.002],
        0.003,
        { castShadow: false },
      );
    }
  }
  // Ceintures et entretoise basse.
  kit.boxMinMax(
    'world.props.paint',
    [x0 + inset, top - th - 0.07, z0 + inset - 0.01],
    [x0 + inset + 0.02, top - th, z1 - inset + 0.01],
    0.003,
    legs,
  );
  kit.boxMinMax(
    'world.props.paint',
    [x0 + inset, top - th - 0.07, z0 + inset - 0.012],
    [x1 - inset, top - th, z0 + inset + 0.008],
    0.003,
    legs,
  );
  kit.boxMinMax(
    'world.props.paint',
    [x0 + inset, top - th - 0.07, z1 - inset - 0.008],
    [x1 - inset, top - th, z1 - inset + 0.012],
    0.003,
    legs,
  );
  kit.boxMinMax(
    'world.props.paint',
    [x0 + inset, 0.14, z0 + inset],
    [x0 + inset + 0.02, 0.165, z1 - inset],
    0.003,
    legs,
  );
  // Tiroir en façade (bois peint crème) et bouton.
  const dz = (z0 + z1) / 2 - 0.12;
  kit.boxMinMax(
    'world.paint.cream',
    [x1 - 0.02, top - th - 0.085, dz - 0.22],
    [x1 - 0.004, top - th - 0.004, dz + 0.22],
    0.004,
    {},
    2,
  );
  kit.cylinder('brass', [x1 - 0.004, top - th - 0.045, dz], [x1 + 0.014, top - th - 0.045, dz], 0.009, 12);
  // Revues empilées (couverture du dessus visible).
  magazines(kit, [x0 + 0.2, top, z0 + 0.22]);
  breadboard(kit, [x1 - 0.17, top, z0 + 0.36]);
  mug(kit, [x0 + 0.13, top, z1 - 0.1]);
  // Affiche punaisée.
  const p = WALL_ITEMS.posterColors;
  kit.decal('posterColors', [ROOM.minX + 0.0008, p.center[1], p.center[2]], p.size, [0, Math.PI / 2, 0]);
  const pins: [number, number, number][] = [
    [0.22, 0.155, 0xb0261c],
    [-0.22, 0.155, 0x2754a6],
    [0.22, -0.155, 0xd9a820],
    [-0.22, -0.155, 0xb0261c],
  ];
  for (const [dzp, dy, color] of pins) {
    const c: Vec3Tuple = [ROOM.minX, p.center[1] + dy, p.center[2] + dzp];
    kit.cylinder('world.props.plastic', [c[0] + 0.001, c[1], c[2]], [c[0] + 0.008, c[1], c[2]], 0.0055, 10, {
      tint: tint(color, 0.3),
      castShadow: false,
    });
  }
}

function magazines(kit: PropKit, base: Vec3Tuple): void {
  const covers = ['mag0', 'mag1', 'mag2'];
  covers.forEach((cover, k) => {
    const y = base[1] + 0.0035 + k * 0.0045;
    const yaw = [0.12, -0.08, 0.26][k]!;
    kit.at([base[0] + k * 0.01, y, base[2] + k * 0.012], [0, yaw, 0], () => {
      kit.box('paper.label', [0, 0, 0], [0.27, 0.004, 0.2], 0.0008, { castShadow: k === 2 });
      kit.decal(cover, [0, 0.0022, 0], [0.2, 0.27], [-Math.PI / 2, 0, Math.PI / 2]);
    });
  });
}

function breadboard(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [0, 0.35, 0], () => {
    kit.box('world.props.plastic', [0, 0.005, 0], [0.057, 0.01, 0.165], 0.0015, {
      tint: tint(0xe6e1d3, 0.55),
    });
    kit.decal('breadboard', [0, 0.0106, 0], [0.165, 0.057], [-Math.PI / 2, 0, Math.PI / 2]);
    // Circuit intégré DIP-8 (555) à cheval sur la rainure, résistances, deux LED, fils de liaison.
    kit.box('world.props.plastic', [0, 0.0135, -0.02], [0.0075, 0.004, 0.0098], 0.0006, {
      tint: TINTS.plasticBlack,
    });
    for (const z of [-0.04, 0.015])
      kit.box('ceramic.tan', [0.012, 0.0125, z], [0.0022, 0.0022, 0.0065], 0.001, { castShadow: false });
    kit.led([-0.014, 0.0165, 0.035], 0.0026, 0xff3324, LED_CHANNEL.boardA, [-Math.PI / 2, 0, 0]);
    kit.led([-0.014, 0.0165, 0.05], 0.0026, 0x4dff6a, LED_CHANNEL.boardB, [-Math.PI / 2, 0, 0]);
    for (const z of [0.035, 0.05])
      kit.cylinder('world.props.plastic', [-0.014, 0.011, z], [-0.014, 0.0165, z], 0.0026, 10, {
        tint: tint(z < 0.04 ? 0x7a1510 : 0x1a5a22, 0.2),
        castShadow: false,
      });
    const wires: [Vec3Tuple, Vec3Tuple, number][] = [
      [[0.02, 0.011, -0.07], [0.006, 0.011, -0.024], 0xb0261c],
      [[-0.02, 0.011, -0.07], [-0.006, 0.011, -0.016], 0x1c1c1c],
      [[0.004, 0.011, -0.01], [-0.012, 0.011, 0.03], 0x2754a6],
      [[0.018, 0.011, 0.02], [0.018, 0.011, 0.06], 0xd9a820],
    ];
    for (const [a, b, color] of wires) {
      const mid: Vec3Tuple = [(a[0] + b[0]) / 2, 0.022, (a[2] + b[2]) / 2];
      kit.tube('world.props.plastic', [a, mid, b], 0.0007, 4, { tint: tint(color, 0.4), perMeter: 200 });
    }
    // Pile 9 V et son coupleur.
    kit.box('world.props.plastic', [0.055, 0.009, -0.03], [0.026, 0.017, 0.048], 0.002, {
      tint: tint(0x2a2a2c, 0.4),
    });
    kit.box('world.props.plastic', [0.055, 0.009, -0.02], [0.0262, 0.0172, 0.018], 0.002, {
      tint: tint(0xc9a04a, 0.3),
    });
    kit.tube(
      'silicone.red',
      [
        [0.055, 0.018, -0.056],
        [0.04, 0.02, -0.07],
        [0.02, 0.011, -0.074],
      ],
      0.0008,
      4,
      { perMeter: 200 },
    );
    kit.tube(
      'silicone.black',
      [
        [0.058, 0.018, -0.056],
        [0.03, 0.016, -0.08],
        [-0.02, 0.011, -0.074],
      ],
      0.0008,
      4,
      { perMeter: 200 },
    );
  });
}

function mug(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [0, 0.8, 0], () => {
    kit.lathe(
      'ceramic.white',
      [
        [0.035, 0],
        [0.038, 0.006],
        [0.04, 0.09],
        [0.036, 0.092],
        [0.034, 0.012],
        [0.0, 0.012],
      ],
      [0, 0, 0],
      [0, 0, 0],
      22,
    );
    kit.tube(
      'ceramic.white',
      [
        [0.038, 0.075, 0],
        [0.058, 0.07, 0],
        [0.062, 0.045, 0],
        [0.056, 0.022, 0],
        [0.038, 0.02, 0],
      ],
      0.0055,
      6,
      {
        perMeter: 120,
        castShadow: true,
      },
    );
    // Crayons, feutre, petit tournevis.
    const items: [number, number, number, number][] = [
      [0.012, 0.008, 0.15, 0xd9a820],
      [-0.01, 0.01, 0.14, 0x1c1c1c],
      [0.004, -0.014, 0.13, 0xb0261c],
      [-0.014, -0.006, 0.12, 0x2754a6],
    ];
    for (const [x, z, len, color] of items) {
      kit.cylinder('world.props.plastic', [x, 0.014, z], [x * 3, 0.014 + len, z * 3], 0.0045, 6, {
        tint: tint(color, 0.4),
      });
    }
  });
}
