/**
 * Pièces communes des accessoires (boutons, pieds, interrupteurs, bornes, fiches, vis…) et
 * teintes de la direction artistique. Chaque fonction construit dans le repère courant du kit.
 */
import { tint, type Tint } from './batch';
import type { PropKit } from './kit';
import type { Vec3Tuple } from '../geometry/shapes';

/** Teintes des matériaux teintés (paint : a = usure ; plastic : a = rugosité). */
export const TINTS = {
  // Tôles peintes.
  instrumentCream: tint(0xcfc7b0, 0.3),
  instrumentGray: tint(0x8e908a, 0.3),
  olive: tint(0x5a6340, 0.5),
  oliveDark: tint(0x3f4a39, 0.45),
  orange: tint(0xb35a2a, 0.55),
  teal: tint(0x245563, 0.5),
  tealLight: tint(0x3f7d8c, 0.45),
  cream: tint(0xd9ceb0, 0.4),
  red: tint(0xa8261c, 0.35),
  shelfGreen: tint(0x6d7560, 0.55),
  charcoal: tint(0x2b2c2e, 0.35),
  black: tint(0x1c1c1d, 0.3),
  rustyRed: tint(0x8a3c26, 0.8),
  // Plastiques.
  plasticBlack: tint(0x161616, 0.45),
  plasticDark: tint(0x2a2b2d, 0.5),
  plasticGray: tint(0x77797a, 0.5),
  plasticSilver: tint(0xaeb0ac, 0.38),
  plasticCream: tint(0xdcd4bd, 0.5),
  plasticRed: tint(0xa3261d, 0.4),
  plasticYellow: tint(0xe0b21e, 0.45),
  plasticOrange: tint(0xd66a1f, 0.45),
  plasticBlue: tint(0x2b5a8c, 0.4),
  plasticGreen: tint(0x2f6b35, 0.45),
  plasticTeal: tint(0x2f6272, 0.5),
  holster: tint(0xd29a1c, 0.72),
  sponge: tint(0xc49a3a, 0.95),
  vinylOlive: tint(0x4f5a36, 0.55),
} as const satisfies Record<string, Tint>;

/**
 * Bouton rotatif moleté (jupe + chapeau) de rayon `r`, axe selon +Z local (face avant), avec
 * repère d'index orienté à `angle` (rad, 0 = en haut, sens horaire vu de face).
 */
export function knob(
  kit: PropKit,
  center: Vec3Tuple,
  r: number,
  depth: number,
  angle: number,
  o: { skirt?: Tint; cap?: Tint; metalCap?: boolean } = {},
): void {
  kit.at(center, [Math.PI / 2, 0, 0], () => {
    // Profil de révolution selon Y local (= +Z du panneau après rotation).
    kit.lathe(
      'world.props.plastic',
      [
        [r * 1.18, 0],
        [r * 1.18, depth * 0.18],
        [r * 1.0, depth * 0.28],
        [r * 0.98, depth * 0.9],
        [r * 0.9, depth],
        [0, depth],
      ],
      [0, 0, 0],
      [0, 0, 0],
      20,
      { tint: o.skirt ?? tint(0x1a1a1b, 0.4), castShadow: false },
    );
    if (o.metalCap) {
      kit.lathe(
        'alu.machined',
        [
          [r * 0.72, depth * 1.001],
          [r * 0.6, depth * 1.03],
          [0, depth * 1.03],
        ],
        [0, 0, 0],
        [0, 0, 0],
        16,
        { castShadow: false },
      );
    }
  });
  // Repère d'index (trait crème) sur le chapeau.
  const len = r * 0.7;
  kit.box(
    'world.props.plastic',
    [
      center[0] + Math.sin(angle) * len * 0.62,
      center[1] + Math.cos(angle) * len * 0.62,
      center[2] + depth * 1.02,
    ],
    [r * 0.14, len, depth * 0.06],
    0,
    { tint: o.cap ?? tint(0xe8e0c8, 0.5), castShadow: false, edge: 'none' },
    [0, 0, -angle],
  );
}

/** Pied caoutchouc cylindrique (sous un appareil). */
export function foot(kit: PropKit, x: number, z: number, r = 0.009, h = 0.012): void {
  kit.cylinder('rubber.black', [x, 0, z], [x, h, z], r, 10, { castShadow: false });
}

/** Interrupteur à bascule rectangulaire (face +Z locale). */
export function rocker(
  kit: PropKit,
  center: Vec3Tuple,
  w: number,
  h: number,
  on = true,
  color: Tint = TINTS.plasticBlack,
): void {
  kit.box('world.props.plastic', [center[0], center[1], center[2] + 0.002], [w, h, 0.004], 0.0012, {
    tint: TINTS.plasticBlack,
    castShadow: false,
  });
  kit.box(
    'world.props.plastic',
    [center[0], center[1], center[2] + 0.006],
    [w * 0.8, h * 0.82, 0.005],
    0.0012,
    { tint: color, castShadow: false },
    [on ? -0.18 : 0.18, 0, 0],
  );
}

/** Borne de raccordement (embase hexagonale + capuchon coloré), axe +Z. */
export function bindingPost(kit: PropKit, center: Vec3Tuple, color: Tint): void {
  kit.at(center, [Math.PI / 2, 0, 0], () => {
    kit.lathe(
      'brass',
      [
        [0.0035, 0],
        [0.0035, 0.004],
        [0, 0.004],
      ],
      [0, 0, 0],
      [0, 0, 0],
      6,
      { castShadow: false },
    );
    kit.lathe(
      'world.props.plastic',
      [
        [0.0062, 0.004],
        [0.0062, 0.012],
        [0.0055, 0.0145],
        [0.0038, 0.0165],
        [0, 0.0165],
      ],
      [0, 0, 0],
      [0, 0, 0],
      14,
      { tint: color, castShadow: false },
    );
  });
}

/** Embase BNC chromée (axe +Z). */
export function bnc(kit: PropKit, center: Vec3Tuple): void {
  kit.at(center, [Math.PI / 2, 0, 0], () => {
    kit.lathe(
      'steel.chrome',
      [
        [0.0078, 0],
        [0.0078, 0.002],
        [0.0052, 0.0025],
        [0.0052, 0.011],
        [0.0042, 0.012],
        [0.002, 0.012],
      ],
      [0, 0, 0],
      [0, 0, 0],
      14,
      { castShadow: false },
    );
  });
  kit.cylinder(
    'steel.chrome',
    [center[0] - 0.0065, center[1], center[2] + 0.008],
    [center[0] + 0.0065, center[1], center[2] + 0.008],
    0.0009,
    5,
    { castShadow: false },
  );
}

/** Tête de vis cruciforme bombée (axe +Z). */
export function screwHead(kit: PropKit, center: Vec3Tuple, r = 0.0028): void {
  kit.at(center, [Math.PI / 2, 0, 0], () => {
    kit.lathe(
      'steel.zinc',
      [
        [r, 0],
        [r * 0.9, r * 0.35],
        [r * 0.5, r * 0.6],
        [0, r * 0.62],
      ],
      [0, 0, 0],
      [0, 0, 0],
      8,
      { castShadow: false },
    );
  });
}

/** Câble souple entre deux points avec affaissement (chaînette approchée). */
export function sagCable(
  kit: PropKit,
  material: string,
  a: Vec3Tuple,
  b: Vec3Tuple,
  sag: number,
  radius: number,
  floorY = -Infinity,
  segments = 8,
): void {
  const pts: Vec3Tuple[] = [];
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    const y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
    pts.push([a[0] + (b[0] - a[0]) * t, Math.max(floorY + radius, y), a[2] + (b[2] - a[2]) * t]);
  }
  kit.tube(material, pts, radius, 6, { perMeter: 50 });
}
