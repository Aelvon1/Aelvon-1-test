/**
 * Étau d'établi (fonte peinte bleu pétrole, mors striés, vis à poignée en T, barre d'alu serrée)
 * et casier à composants à tiroirs transparents (3 × 5, étiquettes, composants visibles à travers
 * le polystyrène cristal, un tiroir entrouvert), multiprise murale derrière le tapis.
 */
import * as THREE from 'three/webgpu';
import { mulberry32 } from '../../lighting/neonFlicker';
import { tint } from '../batch';
import type { InstanceSet } from '../kit';
import { PropKit } from '../kit';
import { BENCH_ITEMS, BENCH_TOP } from '../dims';
import { TINTS } from '../parts';
import { ROOM } from '../../layout';

export function buildVise(kit: PropKit): void {
  const v = BENCH_ITEMS.vise;
  const paint = { tint: tint(0x2c5f6e, 0.75) };
  kit.at([v.center[0], BENCH_TOP, v.center[1]], [0, v.yaw, 0], () => {
    // Embase pivotante boulonnée.
    kit.lathe(
      'world.props.paint',
      [
        [0.058, 0],
        [0.058, 0.01],
        [0.052, 0.016],
        [0.04, 0.018],
        [0, 0.018],
      ],
      [0, 0, -0.03],
      [0, 0, 0],
      28,
      { tint: paint.tint },
    );
    for (const a of [0.6, 2.5, 4.4]) {
      const x = Math.cos(a) * 0.05;
      const z = -0.03 + Math.sin(a) * 0.05;
      kit.cylinder('steel.blackoxide', [x, 0.01, z], [x, 0.018, z], 0.0065, 6);
    }
    // Corps fixe, enclume, mors fixe.
    kit.box('world.props.paint', [0, 0.05, -0.04], [0.09, 0.064, 0.07], 0.008, paint, [0, 0, 0], 2);
    kit.box('world.props.paint', [0, 0.091, -0.055], [0.062, 0.018, 0.04], 0.004, paint, [0, 0, 0], 2);
    kit.box('world.props.paint', [0, 0.08, -0.008], [0.116, 0.04, 0.02], 0.006, paint, [0, 0, 0], 2);
    kit.box('steel.ground', [0, 0.086, 0.004], [0.112, 0.028, 0.006], 0.0015);
    // Coulisseau, mors mobile.
    kit.box('world.props.paint', [0, 0.046, 0.02], [0.046, 0.024, 0.1], 0.005, paint, [0, 0, 0], 2);
    kit.box('world.props.paint', [0, 0.08, 0.044], [0.116, 0.04, 0.022], 0.006, paint, [0, 0, 0], 2);
    kit.box('steel.ground', [0, 0.086, 0.03], [0.112, 0.028, 0.006], 0.0015);
    // Barre d'aluminium serrée entre les mors.
    kit.box('alu.machined', [0.012, 0.094, 0.017], [0.16, 0.024, 0.02], 0.0015);
    // Vis, bossage, poignée en T.
    kit.cylinder('world.props.paint', [0, 0.05, 0.055], [0, 0.05, 0.068], 0.015, 18, paint);
    kit.cylinder('steel.chrome', [0, 0.05, 0.068], [0, 0.05, 0.09], 0.0075, 12);
    kit.cylinder('steel.chrome', [0, 0.05, 0.09], [0, 0.05, 0.1], 0.011, 14);
    kit.cylinder('steel.chrome', [-0.075, 0.05, 0.095], [0.035, 0.05, 0.095], 0.0048, 10);
    kit.cylinder('steel.chrome', [-0.08, 0.05, 0.095], [-0.072, 0.05, 0.095], 0.0085, 12);
    kit.cylinder('steel.chrome', [0.032, 0.05, 0.095], [0.04, 0.05, 0.095], 0.0085, 12);
  });
}

/** Casier à tiroirs transparents : 3 colonnes × 5 rangées. */
export function buildDrawerCabinet(kit: PropKit, components: InstanceSet): void {
  const c = BENCH_ITEMS.drawerCabinet;
  const [W, H, D] = c.size;
  const frame = { tint: TINTS.plasticTeal };
  const t = 0.008;
  const cols = 3;
  const rows = 5;
  const div = 0.003;
  const innerW = (W - 2 * t - (cols - 1) * div) / cols;
  const innerH = (H - 2 * t - (rows - 1) * div) / rows;
  const rand = mulberry32(19);
  kit.at([c.center[0], BENCH_TOP, c.center[1]], [0, c.yaw, 0], () => {
    kit.box('world.props.plastic', [0, H - t / 2, 0], [W, t, D], 0.003, frame);
    kit.box('world.props.plastic', [0, t / 2, 0], [W, t, D], 0.003, frame);
    kit.box('world.props.plastic', [-W / 2 + t / 2, H / 2, 0], [t, H, D], 0.003, frame);
    kit.box('world.props.plastic', [W / 2 - t / 2, H / 2, 0], [t, H, D], 0.003, frame);
    kit.box('world.props.plastic', [0, H / 2, -D / 2 + 0.002], [W, H, 0.004], 0.001, frame);
    for (let r = 1; r < rows; r++) {
      const y = t + r * innerH + (r - 0.5) * div;
      kit.box('world.props.plastic', [0, y, 0.002], [W - 2 * t, div, D - 0.004], 0, {
        ...frame,
        castShadow: false,
      });
    }
    for (let r = 0; r < rows; r++) {
      const y0 = t + r * (innerH + div);
      for (let k = 1; k < cols; k++) {
        const x = -W / 2 + t + k * innerW + (k - 0.5) * div;
        kit.box('world.props.plastic', [x, y0 + innerH / 2, 0.002], [div, innerH, D - 0.004], 0, {
          ...frame,
          castShadow: false,
        });
      }
    }
    kit.decal('cabinetBrand', [0, H + 0.0006, D / 2 - 0.03], [0.07, 0.018], [-Math.PI / 2, 0, 0]);
    // Tiroirs (de haut en bas, de gauche à droite).
    const depth = D - 0.012;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const index = r * cols + k;
        const x = -W / 2 + t + k * (innerW + div) + innerW / 2;
        const y0 = H - t - (r + 1) * innerH - r * div + 0.0008;
        const pull = index === 6 ? 0.034 : index === 10 ? 0.008 : 0;
        const fz = D / 2 + pull;
        const w = innerW - 0.0016;
        const h = innerH - 0.0016;
        const drawer = 'world.props.drawer';
        const o = { castShadow: false };
        kit.box(drawer, [x, y0 + h / 2, fz - 0.00125], [w, h, 0.0025], 0.0008, o);
        kit.box(
          drawer,
          [x - w / 2 + 0.001, y0 + h * 0.4, fz - depth / 2],
          [0.0016, h * 0.8, depth - 0.003],
          0,
          o,
        );
        kit.box(
          drawer,
          [x + w / 2 - 0.001, y0 + h * 0.4, fz - depth / 2],
          [0.0016, h * 0.8, depth - 0.003],
          0,
          o,
        );
        kit.box(drawer, [x, y0 + 0.0008, fz - depth / 2], [w - 0.004, 0.0016, depth - 0.003], 0, o);
        kit.box(drawer, [x, y0 + h * 0.4, fz - depth + 0.001], [w - 0.004, h * 0.8, 0.0016], 0, o);
        kit.box(drawer, [x, y0 + 0.004, fz + 0.004], [0.022, 0.006, 0.008], 0.0015, o);
        kit.decal(`drawer${index}`, [x, y0 + h * 0.66, fz + 0.0004], [0.05, 0.0146]);
        // Composants en vrac au fond du tiroir.
        const n = 5 + Math.floor(rand() * 6);
        const palette = [0xc7a878, 0x2a5aa0, 0x1c1c1c, 0x9a2a20, 0xd8c35a, 0x3a7a42];
        const base = palette[index % palette.length]!;
        for (let i = 0; i < n; i++) {
          const px = x + (rand() - 0.5) * (w - 0.016);
          const pz = fz - 0.012 - rand() * (depth - 0.03);
          const py = y0 + 0.003 + rand() * 0.004;
          const color = new THREE.Color(rand() < 0.75 ? base : palette[Math.floor(rand() * palette.length)]!);
          kit.instance(
            components,
            PropKit.place([px, py, pz], [rand() * 0.6, rand() * Math.PI, Math.PI / 2 + (rand() - 0.5) * 0.4]),
            color,
          );
        }
      }
    }
  });
}

/** Multiprise murale derrière le tapis (cordons des appareils), reliée à la prise de l'établi. */
export function buildPowerStrip(kit: PropKit): void {
  const y = BENCH_TOP + 0.075;
  const z = ROOM.minZ + 0.022;
  const x0 = -0.64;
  const x1 = -0.3;
  kit.box(
    'world.props.plastic',
    [(x0 + x1) / 2, y, z],
    [x1 - x0, 0.052, 0.04],
    0.008,
    { tint: TINTS.plasticCream },
    [0, 0, 0],
    2,
  );
  for (let k = 0; k < 5; k++) {
    const x = x0 + 0.05 + k * 0.058;
    kit.cylinder('world.props.plastic', [x, y, z + 0.019], [x, y, z + 0.022], 0.016, 18, {
      tint: tint(0xcfc6ae, 0.5),
      castShadow: false,
    });
    if (k < 3) {
      // Fiches branchées et leurs cordons qui plongent derrière l'établi.
      kit.box(
        'world.props.plastic',
        [x, y, z + 0.036],
        [0.026, 0.034, 0.028],
        0.006,
        { tint: TINTS.plasticBlack },
        [0, 0, 0],
        2,
      );
      kit.tube(
        'rubber.black',
        [
          [x, y - 0.012, z + 0.048],
          [x + 0.01, y - 0.05, z + 0.05],
          [x + 0.02, BENCH_TOP + 0.003, z + 0.04],
          [x + 0.2 + k * 0.05, BENCH_TOP + 0.003, z + 0.03],
        ],
        0.0028,
        6,
        { perMeter: 40 },
      );
    }
  }
  kit.led([x0 + 0.018, y + 0.012, z + 0.02], 0.0028, 0xff3a1a, 0);
  kit.cylinder(
    'world.props.plastic',
    [x0 + 0.018, y - 0.008, z + 0.018],
    [x0 + 0.018, y - 0.008, z + 0.024],
    0.006,
    12,
    { tint: TINTS.plasticRed, castShadow: false },
  );
  // Cordon d'alimentation : descend derrière l'établi jusqu'à une prise basse (les deux prises
  // de l'établi sont prises par la lampe et la mise à la terre du tapis).
  const lowOutlet: [number, number, number] = [-0.22, 0.32, ROOM.minZ];
  kit.box(
    'world.paint.creamMetal',
    [lowOutlet[0], lowOutlet[1], z - 0.002],
    [0.075, 0.075, 0.04],
    0.007,
    {},
    [0, 0, 0],
    2,
  );
  kit.cylinder(
    'plastic.black',
    [lowOutlet[0], lowOutlet[1], z + 0.017],
    [lowOutlet[0], lowOutlet[1], z + 0.021],
    0.019,
    18,
  );
  kit.box(
    'world.props.plastic',
    [lowOutlet[0], lowOutlet[1], z + 0.034],
    [0.03, 0.036, 0.026],
    0.006,
    { tint: TINTS.plasticBlack },
    [0, 0, 0],
    2,
  );
  kit.tube(
    'rubber.black',
    [
      [x1, y - 0.012, z + 0.01],
      [x1 + 0.03, y - 0.06, z + 0.004],
      [x1 + 0.05, 0.6, ROOM.minZ + 0.012],
      [lowOutlet[0] + 0.02, 0.42, ROOM.minZ + 0.03],
      [lowOutlet[0], lowOutlet[1] + 0.012, z + 0.048],
    ],
    0.003,
    6,
    { perMeter: 30 },
  );
}
