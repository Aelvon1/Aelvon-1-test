/**
 * Accessoires muraux : calendrier du garage accroché à un clou, affiche de rallye, tableau des
 * couples de serrage, rallonges et câbles lovés sur des crochets (mur est), multiprise pendue.
 */
import { mulberry32 } from '../../lighting/neonFlicker';
import { tint, type Tint } from '../batch';
import type { PropKit } from '../kit';
import { WALL_ITEMS } from '../dims';
import { TINTS } from '../parts';
import { ROOM } from '../../layout';

export function buildWallItems(kit: PropKit): void {
  calendar(kit);
  const rally = WALL_ITEMS.posterRally;
  kit.decal('posterRally', [rally.center[0], rally.center[1], ROOM.minZ + 0.0008], rally.size);
  const torque = WALL_ITEMS.posterTorque;
  kit.decal('posterTorque', [torque.center[0], torque.center[1], ROOM.maxZ - 0.0008], torque.size, [
    0,
    Math.PI,
    0,
  ]);
  cordHooks(kit);
}

function calendar(kit: PropKit): void {
  const c = WALL_ITEMS.calendar;
  const [x, y] = c.center;
  const [w, h] = c.size;
  const z = ROOM.minZ;
  // Clou.
  kit.cylinder('steel.blackoxide', [x, y + h / 2 - 0.008, z], [x, y + h / 2 - 0.008, z + 0.014], 0.0018, 6, {
    castShadow: false,
  });
  kit.cylinder(
    'steel.blackoxide',
    [x, y + h / 2 - 0.008, z + 0.014],
    [x, y + h / 2 - 0.008, z + 0.016],
    0.0035,
    8,
    { castShadow: false },
  );
  // Liasse de feuilles (le haut tient au clou, le bas touche le mur).
  kit.at([x, y, z + 0.006], [-0.018, 0, 0.012], () => {
    kit.box('paper.label', [0, 0, 0], [w, h, 0.003], 0.0008);
    kit.decal('calendar', [0, 0, 0.0016], [w, h]);
    // Pages du dessous qui rebiquent en bas.
    kit.box(
      'paper.label',
      [0, -h / 2 + 0.012, 0.004],
      [w - 0.004, 0.024, 0.0012],
      0.0004,
      { castShadow: false },
      [0.5, 0, 0],
    );
  });
}

/** Lacets d'un câble lové pendu à un crochet (boucles elliptiques légèrement décalées). */
function coil(
  kit: PropKit,
  hook: readonly [number, number, number],
  loops: number,
  drop: number,
  width: number,
  radius: number,
  material: string,
  color: Tint | undefined,
  seed: number,
): void {
  const rand = mulberry32(seed);
  for (let k = 0; k < loops; k++) {
    const pts: [number, number, number][] = [];
    const d = drop * (0.9 + rand() * 0.2);
    const w = width * (0.85 + rand() * 0.3);
    const off = -0.018 - rand() * 0.03;
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      // Boucle pendue : haut pincé sur le crochet, bas arrondi.
      const yy = -(1 - Math.cos(a)) * 0.5 * d;
      const zz = Math.sin(a) * w * 0.5 * (0.35 + 0.65 * (1 - Math.cos(a)) * 0.5);
      pts.push([hook[0] + off - rand() * 0.004, hook[1] + yy, hook[2] + zz]);
    }
    kit.tube(material, pts, radius, 6, { closed: true, perMeter: 45, tint: color, castShadow: k % 3 === 0 });
  }
}

function cordHooks(kit: PropKit): void {
  const H = WALL_ITEMS.cordHooks;
  const x = H.x;
  const y = H.y;
  for (const z of H.z) {
    kit.boxMinMax('world.props.paint', [x - 0.006, y - 0.03, z - 0.02], [x, y + 0.03, z + 0.02], 0.002, {
      tint: TINTS.charcoal,
    });
    kit.tube(
      'steel.zinc',
      [
        [x - 0.004, y - 0.01, z],
        [x - 0.06, y - 0.012, z],
        [x - 0.075, y + 0.01, z],
      ],
      0.004,
      6,
      { perMeter: 80, castShadow: true },
    );
  }
  const [z0, z1, z2] = H.z;
  // Rallonge orange (25 m) et sa fiche qui pend.
  coil(kit, [x - 0.02, y - 0.012, z0], 9, 0.44, 0.24, 0.0045, 'world.props.plastic', TINTS.plasticOrange, 11);
  kit.tube(
    'world.props.plastic',
    [
      [x - 0.04, y - 0.02, z0 + 0.02],
      [x - 0.05, y - 0.3, z0 + 0.1],
      [x - 0.045, y - 0.62, z0 + 0.09],
    ],
    0.0045,
    6,
    { tint: TINTS.plasticOrange },
  );
  kit.box(
    'world.props.plastic',
    [x - 0.045, y - 0.66, z0 + 0.09],
    [0.036, 0.05, 0.036],
    0.008,
    { tint: TINTS.plasticOrange },
    [0, 0.3, 0],
    2,
  );
  // Câble noir plus fin.
  coil(kit, [x - 0.02, y - 0.012, z1], 11, 0.3, 0.18, 0.0028, 'rubber.black', undefined, 12);
  // Multiprise pendue par son cordon.
  coil(kit, [x - 0.02, y - 0.012, z2], 5, 0.22, 0.16, 0.0035, 'world.props.plastic', tint(0xd6d0bf, 0.5), 13);
  kit.at([x - 0.03, y - 0.42, z2], [0, 0, 0.05], () => {
    kit.box(
      'world.props.plastic',
      [0, 0, 0],
      [0.04, 0.3, 0.05],
      0.009,
      { tint: tint(0xd6d0bf, 0.5) },
      [0, 0, 0],
      2,
    );
    for (let k = 0; k < 4; k++) {
      kit.cylinder(
        'world.props.plastic',
        [-0.0205, -0.1 + k * 0.065, 0],
        [-0.022, -0.1 + k * 0.065, 0],
        0.016,
        16,
        { tint: tint(0xc4bda8, 0.5), castShadow: false },
      );
    }
    kit.led([-0.021, 0.13, 0], 0.003, 0xff3a1a, 7, [0, -Math.PI / 2, 0]);
  });
}
