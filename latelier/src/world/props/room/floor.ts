/**
 * Accessoires au sol : tabouret à roulettes (assise en skaï réparée au ruban jaune), poubelle en
 * tôle galvanisée (papiers froissés, chiffon), extincteur sur son support mural et son panneau,
 * vieux tapis à franges, rangements sous l'établi (caisse à outils, enrouleur, carton).
 */
import * as THREE from 'three/webgpu';
import { mulberry32 } from '../../lighting/neonFlicker';
import { tint } from '../batch';
import { PropKit } from '../kit';
import { EXTINGUISHER, RUG_DETAIL, STOOL, TRASH } from '../dims';
import { TINTS } from '../parts';
import { BENCH, ROOM } from '../../layout';
import { rag } from './cart';
import { toolbox } from './shelves';

export function buildFloorItems(kit: PropKit): void {
  stool(kit);
  trash(kit);
  extinguisher(kit);
  rug(kit);
  underBench(kit);
}

function stool(kit: PropKit): void {
  const [x, , z] = STOOL.base;
  kit.at([x, 0, z], [0, 0.4, 0], () => {
    // Piètement 5 branches, roulettes.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const ex = Math.cos(a) * STOOL.starRadius;
      const ez = Math.sin(a) * STOOL.starRadius;
      kit.cylinder('world.props.paint', [0, 0.1, 0], [ex * 0.92, 0.075, ez * 0.92], 0.014, 8, {
        tint: TINTS.charcoal,
        radiusB: 0.011,
      });
      kit.cylinder('steel.zinc', [ex * 0.95, 0.075, ez * 0.95], [ex * 0.95, 0.055, ez * 0.95], 0.006, 6);
      const tx = -Math.sin(a) * 0.012;
      const tz = Math.cos(a) * 0.012;
      kit.cylinder(
        'rubber.black',
        [ex * 0.97 - tx, 0.025, ez * 0.97 - tz],
        [ex * 0.97 + tx, 0.025, ez * 0.97 + tz],
        0.025,
        12,
      );
      kit.box(
        'world.props.plastic',
        [ex * 0.96, 0.045, ez * 0.96],
        [0.03, 0.02, 0.036],
        0.005,
        { tint: TINTS.plasticBlack },
        [0, -a, 0],
      );
    }
    kit.cylinder('world.props.plastic', [0, 0.08, 0], [0, 0.32, 0], 0.026, 16, { tint: TINTS.plasticBlack });
    kit.cylinder('steel.chrome', [0, 0.32, 0], [0, 0.5, 0], 0.014, 12);
    kit.lathe(
      'world.props.paint',
      [
        [0.02, 0],
        [0.09, 0.005],
        [0.12, 0.018],
        [0.12, 0.024],
        [0, 0.024],
      ],
      [0, 0.49, 0],
      [0, 0, 0],
      20,
      { tint: TINTS.charcoal },
    );
    // Assise en skaï olive (coussin bombé) et réparation au ruban adhésif.
    const r = STOOL.seatRadius;
    kit.lathe(
      'world.props.plastic',
      [
        [0, 0],
        [r * 0.96, 0],
        [r, 0.012],
        [r * 1.01, 0.035],
        [r * 0.97, 0.055],
        [r * 0.8, 0.068],
        [0, 0.072],
      ],
      [0, STOOL.seatHeight - 0.06, 0],
      [0, 0, 0],
      28,
      { tint: TINTS.vinylOlive },
    );
    const topY = STOOL.seatHeight + 0.012;
    kit.box(
      'tape.yellow',
      [0.02, topY, -0.02],
      [0.13, 0.0012, 0.028],
      0.0004,
      { castShadow: false, edge: 'none' },
      [0.03, 0.5, 0.02],
    );
    kit.box(
      'tape.yellow',
      [0.03, topY + 0.0008, -0.01],
      [0.1, 0.0012, 0.028],
      0.0004,
      { castShadow: false, edge: 'none' },
      [-0.02, -0.7, 0.03],
    );
  });
}

function trash(kit: PropKit): void {
  const [x, , z] = TRASH.base;
  const R = TRASH.radius;
  const H = TRASH.height;
  kit.at([x, 0, z], [0, 0.3, 0], () => {
    const profile: [number, number][] = [
      [0, 0.004],
      [R * 0.9, 0.004],
      [R * 0.92, 0],
      [R * 0.93, 0.02],
    ];
    // Nervures embouties.
    for (const y of [0.12, 0.3])
      profile.push(
        [R * 0.93 + (y / H) * 0.012, y - 0.012],
        [R * 0.95 + (y / H) * 0.012, y],
        [R * 0.93 + (y / H) * 0.012, y + 0.012],
      );
    profile.push(
      [R, H - 0.01],
      [R + 0.006, H - 0.004],
      [R + 0.004, H],
      [R - 0.002, H - 0.004],
      [R * 0.95, H - 0.02],
      [R * 0.9, 0.01],
    );
    kit.lathe('metal.galvanized', profile, [0, 0, 0], [0, 0, 0], 28);
    // Papiers froissés et chiffon qui déborde.
    const rand = mulberry32(3);
    for (let k = 0; k < 7; k++) {
      const g = new THREE.IcosahedronGeometry(0.028 + rand() * 0.018, 1);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++)
        pos.setXYZ(
          i,
          pos.getX(i) * (0.8 + rand() * 0.4),
          pos.getY(i) * (0.8 + rand() * 0.4),
          pos.getZ(i) * (0.8 + rand() * 0.4),
        );
      g.computeVertexNormals();
      const a = rand() * Math.PI * 2;
      const rr = rand() * (R - 0.05);
      kit.add(
        'paper.label',
        g,
        PropKit.place(
          [Math.cos(a) * rr, H - 0.1 + rand() * 0.07, Math.sin(a) * rr],
          [rand(), rand(), rand()],
        ),
        { edge: 'none', castShadow: false },
      );
    }
    rag(kit, [R * 0.5, H + 0.004, -0.02], 1.2, 0.22);
  });
}

function extinguisher(kit: PropKit): void {
  const E = EXTINGUISHER;
  const z = E.z;
  const red = 'metal.painted.red';
  kit.at([E.x, E.bottom, z], [0, Math.PI, 0], () => {
    const R = E.radius;
    const H = E.height;
    kit.lathe(
      red,
      [
        [0, 0],
        [R * 0.9, 0],
        [R, 0.012],
        [R, H - 0.06],
        [R * 0.92, H - 0.025],
        [R * 0.62, H - 0.006],
        [0.018, H],
      ],
      [0, 0, 0],
      [0, 0, 0],
      28,
    );
    kit.wrapDecal('extinguisher', [0, H * 0.46, 0], R + 0.0008, 0.2, 1.5, 0);
    // Tête : robinet laiton, manomètre, levier, goupille, tuyau et lance.
    kit.cylinder('brass', [0, H, 0], [0, H + 0.03, 0], 0.019, 14);
    kit.box('world.props.plastic', [0, H + 0.045, 0.004], [0.028, 0.03, 0.05], 0.005, {
      tint: TINTS.plasticBlack,
    });
    kit.box('steel.zinc', [0, H + 0.07, 0.03], [0.024, 0.008, 0.11], 0.003, {}, [0.18, 0, 0]);
    kit.box('steel.zinc', [0, H + 0.055, 0.04], [0.022, 0.006, 0.1], 0.003, {}, [-0.05, 0, 0]);
    kit.cylinder('steel.chrome', [-0.018, H + 0.05, 0.005], [0.018, H + 0.05, 0.005], 0.002, 6);
    kit.cylinder('world.props.plastic', [0.018, H + 0.05, 0.005], [0.026, H + 0.05, 0.005], 0.007, 10, {
      tint: TINTS.plasticYellow,
    });
    kit.cylinder('steel.chrome', [0.022, H + 0.035, -0.0], [0.034, H + 0.035, 0.0], 0.014, 16);
    kit.cylinder('world.props.plastic', [0.0341, H + 0.035, 0], [0.0346, H + 0.035, 0], 0.0115, 16, {
      tint: tint(0xefe9d8, 0.3),
      castShadow: false,
    });
    kit.tube(
      'rubber.black',
      [
        [-0.016, H + 0.04, 0.0],
        [-0.05, H + 0.02, 0.005],
        [-R - 0.02, H - 0.1, 0.01],
        [-R - 0.012, H * 0.35, 0.012],
        [-R - 0.006, H * 0.22, 0.02],
      ],
      0.007,
      8,
      { perMeter: 40, castShadow: true },
    );
    kit.cylinder(
      'world.props.plastic',
      [-R - 0.006, H * 0.22, 0.02],
      [-R - 0.004, H * 0.12, 0.022],
      0.0085,
      10,
      { tint: TINTS.plasticBlack, radiusB: 0.006 },
    );
    // Support mural (sangle et crochet) dans le dos.
    kit.box('steel.zinc', [0, H * 0.72, -R - 0.004], [0.05, 0.1, 0.006], 0.002);
    kit.lathe(
      'steel.zinc',
      [
        [R + 0.003, -0.012],
        [R + 0.004, 0.012],
      ],
      [0, H * 0.7, 0],
      [0, 0, 0],
      28,
      { castShadow: false },
    );
  });
  kit.decal('extSign', [E.x, E.bottom + E.height + 0.24, ROOM.maxZ - 0.0008], [0.2, 0.13], [0, Math.PI, 0]);
}

function rug(kit: PropKit): void {
  const R = RUG_DETAIL;
  const [x0, x1] = R.x;
  const [z0, z1] = R.z;
  kit.boxMinMax('fabric.rug', [x0, 0.0005, z0], [x1, R.thickness, z1], 0.003, { castShadow: false });
  // Franges (petits torons) sur les petits côtés est et ouest.
  const rand = mulberry32(9);
  const n = kit.level >= 2 ? 44 : 26;
  for (const [x, sign] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const z = z0 + 0.03 + ((z1 - z0 - 0.06) * k) / (n - 1);
      const len = R.fringe * (0.75 + rand() * 0.35);
      const bend = (rand() - 0.5) * 0.03;
      kit.cylinder('fabric.rug', [x, 0.003, z], [x + sign * len, 0.0025, z + bend], 0.0018, 4, {
        castShadow: false,
      });
    }
  }
}

function underBench(kit: PropKit): void {
  const shelfTop = 0.198;
  const zc = (BENCH.z[0] + BENCH.z[1]) / 2;
  toolbox(kit, [-1.45, shelfTop, zc - 0.02], Math.PI / 2 + 0.05);
  // Enrouleur de rallonge (tambour rouge, câble orange).
  kit.at([-0.82, shelfTop, zc], [0, 0.2, 0], () => {
    for (const x of [-0.07, 0.07]) {
      kit.box('world.props.paint', [x, 0.12, 0], [0.012, 0.24, 0.05], 0.004, { tint: TINTS.charcoal });
      kit.box('world.props.paint', [x, 0.006, 0], [0.02, 0.012, 0.26], 0.004, { tint: TINTS.charcoal });
    }
    kit.pushMatrix(PropKit.alongY([-0.06, 0.16, 0], [1, 0, 0]));
    kit.lathe(
      'world.props.plastic',
      [
        [0.02, 0],
        [0.13, 0],
        [0.13, 0.008],
        [0.03, 0.008],
      ],
      [0, 0, 0],
      [0, 0, 0],
      28,
      { tint: TINTS.plasticRed },
    );
    kit.lathe(
      'world.props.plastic',
      [
        [0.03, 0.008],
        [0.1, 0.008],
        [0.104, 0.06],
        [0.1, 0.112],
        [0.03, 0.112],
      ],
      [0, 0, 0],
      [0, 0, 0],
      28,
      { tint: TINTS.plasticOrange },
    );
    kit.lathe(
      'world.props.plastic',
      [
        [0.03, 0.112],
        [0.13, 0.112],
        [0.13, 0.12],
        [0.02, 0.12],
      ],
      [0, 0, 0],
      [0, 0, 0],
      28,
      { tint: TINTS.plasticRed },
    );
    kit.pop();
    kit.box('world.props.plastic', [0, 0.26, 0], [0.16, 0.024, 0.03], 0.008, { tint: TINTS.plasticBlack });
  });
  kit.boxMinMax('cardboard', [-0.35, shelfTop, zc - 0.2], [0.02, shelfTop + 0.26, zc + 0.2], 0.006, {}, 2);
  // Chutes de bois.
  kit.boxMinMax('wood.plywood', [-1.15, shelfTop, zc - 0.25], [-1.02, shelfTop + 0.018, zc + 0.2], 0.002);
  kit.boxMinMax(
    'world.bench.frame',
    [-1.12, shelfTop + 0.018, zc - 0.2],
    [-1.07, shelfTop + 0.068, zc + 0.24],
    0.004,
  );
}
