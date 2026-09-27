/**
 * Étagère métallique à cornières perforées (mur est) et son contenu : bidons (jerrican de tôle,
 * nourrice rouge, bidon d'huile), pots de peinture, cartons imprimés ou annotés, bocaux de
 * visserie (dont trois vissés par le couvercle SOUS une tablette, astuce d'atelier) remplis de
 * vis, écrous et rondelles INSTANCIÉS, bombe de dégrippant, bobine de fil, caisse à outils.
 *
 * Repère : l'étagère occupe `SHELF_UNIT` ; façade vers l'ouest (−X), dos contre le mur est.
 */
import * as THREE from 'three/webgpu';
import { mulberry32 } from '../../lighting/neonFlicker';
import { tint, type Tint } from '../batch';
import { InstanceSet, PropKit } from '../kit';
import { SHELF_UNIT } from '../dims';
import { TINTS } from '../parts';
import { lathe, type Vec3Tuple } from '../../geometry/shapes';

/** Jeux d'instances de visserie (géométries partagées). */
export interface HardwareSets {
  screws: InstanceSet;
  nuts: InstanceSet;
  washers: InstanceSet;
  woodScrews: InstanceSet;
}

/** Géométries de visserie (quelques dizaines de triangles chacune). */
export function createHardwareSets(level: number): HardwareSets {
  const seg = level >= 2 ? 8 : 6;
  // Vis à tête cylindrique : tête + fût (filetage suggéré par un profil ondulé).
  const screwProfile: [number, number][] = [[0, -0.02]];
  for (let k = 0; k <= 6; k++) screwProfile.push([k % 2 === 0 ? 0.0019 : 0.0017, -0.02 + k * 0.0033]);
  screwProfile.push([0.0035, 0], [0.0035, 0.003], [0.0028, 0.0036], [0, 0.0036]);
  const screw = lathe(screwProfile, seg);
  const nut = new THREE.CylinderGeometry(0.0055, 0.0055, 0.0045, 6, 1);
  const washer = lathe(
    [
      [0.0034, -0.0006],
      [0.0068, -0.0006],
      [0.0068, 0.0006],
      [0.0034, 0.0006],
      [0.0034, -0.0006],
    ],
    seg + 2,
  );
  const wood = lathe(
    [
      [0, -0.03],
      [0.0017, -0.026],
      [0.002, -0.004],
      [0.0042, 0],
      [0.0038, 0.0012],
      [0, 0.0014],
    ],
    seg,
  );
  const o = { castShadow: false };
  return {
    screws: new InstanceSet('vis M4', screw, 'steel.zinc', o),
    nuts: new InstanceSet('écrous', nut, 'steel.zinc', o),
    washers: new InstanceSet('rondelles', washer, 'steel.zinc', o),
    woodScrews: new InstanceSet('vis à bois', wood, 'brass', o),
  };
}

/** Aile de cornière perforée : boîte mince, UV u = travers de l'aile, v = hauteur monde. */
function flange(kit: PropKit, min: Vec3Tuple, max: Vec3Tuple, across: 'x' | 'z'): void {
  const size: Vec3Tuple = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const a = across === 'x' ? pos.getX(i) / size[0] + 0.5 : pos.getZ(i) / size[2] + 0.5;
    uv.setXY(i, a, pos.getY(i) + (min[1] + max[1]) / 2);
  }
  kit.add(
    'world.props.slotted',
    g,
    PropKit.place([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]),
    {
      uv: 'keep',
      tint: TINTS.shelfGreen,
    },
  );
}

export function buildShelves(kit: PropKit, hw: HardwareSets, jarsGlass: string): void {
  const S = SHELF_UNIT;
  const [x0, x1] = S.x;
  const [z0, z1] = S.z;
  const a = S.angle;
  const t = S.sheet;
  // Cornières aux quatre angles (ailes vers l'extérieur).
  for (const [cx, sx] of [
    [x0, 1],
    [x1, -1],
  ] as const) {
    for (const [cz, sz] of [
      [z0, 1],
      [z1, -1],
    ] as const) {
      const xa = sx > 0 ? cx : cx - a;
      const za = sz > 0 ? cz : cz - a;
      flange(kit, [xa, 0.012, sz > 0 ? cz : cz - t], [xa + a, S.height, sz > 0 ? cz + t : cz], 'x');
      flange(kit, [sx > 0 ? cx : cx - t, 0.012, za], [sx > 0 ? cx + t : cx, S.height, za + a], 'z');
      // Patin de pied en plastique.
      kit.box(
        'world.props.plastic',
        [cx + sx * a * 0.5, 0.006, cz + sz * a * 0.5],
        [a + 0.004, 0.012, a + 0.004],
        0.002,
        { tint: TINTS.plasticBlack, castShadow: false },
      );
    }
  }
  // Tablettes : plateau de tôle à bords tombés, boulonnées aux cornières.
  const w = x1 - x0;
  const d = z1 - z0;
  for (const y of S.levels) {
    kit.box(
      'world.props.paint',
      [(x0 + x1) / 2, y - t / 2, (z0 + z1) / 2],
      [w - 0.004, t, d - 0.004],
      0.0008,
      { tint: TINTS.shelfGreen },
    );
    kit.box(
      'world.props.paint',
      [x0 + 0.002, y - 0.017, (z0 + z1) / 2],
      [t * 1.5, 0.032, d - 0.006],
      0.0008,
      { tint: TINTS.shelfGreen },
    );
    kit.box(
      'world.props.paint',
      [x1 - 0.002, y - 0.017, (z0 + z1) / 2],
      [t * 1.5, 0.032, d - 0.006],
      0.0008,
      { tint: TINTS.shelfGreen },
    );
    kit.box(
      'world.props.paint',
      [(x0 + x1) / 2, y - 0.017, z0 + 0.002],
      [w - 0.006, 0.032, t * 1.5],
      0.0008,
      { tint: TINTS.shelfGreen },
    );
    kit.box(
      'world.props.paint',
      [(x0 + x1) / 2, y - 0.017, z1 - 0.002],
      [w - 0.006, 0.032, t * 1.5],
      0.0008,
      { tint: TINTS.shelfGreen },
    );
    for (const bx of [x0 + a * 0.5, x1 - a * 0.5]) {
      for (const bz of [z0 - 0.002, z1 + 0.002]) {
        kit.cylinder(
          'steel.zinc',
          [bx, y - 0.017, bz],
          [bx, y - 0.017, bz + (bz < z0 ? -0.004 : 0.004)],
          0.005,
          6,
          { castShadow: false },
        );
      }
    }
  }
  // Croisillons de contreventement au dos.
  const backX = x1 - 0.004;
  const diag = Math.hypot(S.levels[4] - S.levels[0], d - 0.04);
  const angle = Math.atan2(S.levels[4] - S.levels[0], d - 0.04);
  for (const sgn of [1, -1]) {
    kit.box(
      'world.props.paint',
      [backX, (S.levels[0] + S.levels[4]) / 2, (z0 + z1) / 2],
      [0.002, 0.028, diag],
      0.0005,
      { tint: TINTS.shelfGreen },
      [sgn * angle, 0, 0],
    );
  }

  const cx = (x0 + x1) / 2;
  const L = S.levels;
  // --- Niveau 0 : bidons et pots -----------------------------------------------------------
  jerrican(kit, [cx, L[0], -1.8], TINTS.olive);
  fuelCan(kit, [cx + 0.02, L[0], -1.44]);
  oilJug(kit, [cx - 0.04, L[0], -1.15]);
  paintCan(kit, [cx - 0.08, L[0], -0.86], 0);
  paintCan(kit, [cx + 0.1, L[0], -0.82], 1);
  // --- Niveau 1 : cartons ------------------------------------------------------------------
  carton(kit, [cx - 0.01, L[1], -1.75], [0.4, 0.22, 0.3], 'boxKorvik', [0.28, 0.13], -0.03);
  carton(kit, [cx + 0.02, L[1], -1.33], [0.34, 0.26, 0.36], 'boxFragile', [0.2, 0.085], 0.02);
  openCarton(kit, [cx - 0.02, L[1], -0.9], [0.36, 0.2, 0.3]);
  // --- Niveau 2 : bocaux, bombe, bobine ------------------------------------------------------
  const rand = mulberry32(77);
  const jars: [number, InstanceSet, string][] = [
    [-1.86, hw.screws, 'noteM4'],
    [-1.75, hw.nuts, 'noteNuts'],
    [-1.64, hw.washers, 'noteWashers'],
  ];
  for (const [z, set, label] of jars) jar(kit, [cx - 0.08, L[2], z], set, label, jarsGlass, rand, false);
  sprayCan(kit, [cx - 0.12, L[2], -1.5], 0.3);
  wireSpool(kit, [cx + 0.05, L[2], -1.32]);
  toolbox(kit, [cx - 0.01, L[2], -0.92]);
  // --- Sous la tablette 3 : bocaux suspendus par leur couvercle ------------------------------
  const hanging: [number, InstanceSet, string][] = [
    [-1.3, hw.screws, 'noteM6'],
    [-1.19, hw.woodScrews, 'noteWood'],
    [-1.08, hw.nuts, 'noteNuts'],
  ];
  for (const [z, set, label] of hanging)
    jar(kit, [cx - 0.1, L[3] - t - 0.134, z], set, label, jarsGlass, rand, true);
  // --- Niveau 3 : cartons annotés, tubes néon de rechange -----------------------------------
  carton(kit, [cx - 0.05, L[3], -1.72], [0.3, 0.2, 0.34], 'boxNoel', [0.16, 0.07], 0.04);
  carton(kit, [cx - 0.04, L[3], -0.88], [0.28, 0.18, 0.34], 'boxInvoices', [0.22, 0.075], -0.02);
  kit.box('cardboard', [x1 - 0.045, L[3] + 0.035, (z0 + z1) / 2], [0.075, 0.07, 1.24], 0.003);
  kit.decal('boxLamps', [x1 - 0.045 - 0.0381, L[3] + 0.035, -1.28], [0.15, 0.063], [0, -Math.PI / 2, 0]);
  // --- Niveau 4 (dessus) : cartons plats, caisse « H.S. » -----------------------------------
  carton(kit, [cx, L[4], -1.72], [0.38, 0.05, 0.4], null, [0, 0], 0.02);
  carton(kit, [cx - 0.02, L[4] + 0.05, -1.7], [0.3, 0.035, 0.3], null, [0, 0], -0.06);
  carton(kit, [cx + 0.01, L[4], -1.08], [0.32, 0.055, 0.46], null, [0, 0], 0);
  kit.decal(
    'noteHS',
    [cx + 0.01 - 0.16 - 0.0008, L[4] + 0.028, -1.08],
    [0.07, 0.024],
    [0, -Math.PI / 2, 0.04],
  );
}

// --- Contenants -----------------------------------------------------------------------------

/** Jerrican de tôle 20 L (face étroite vers l'ouest), nervures en X embouties, trois poignées. */
function jerrican(kit: PropKit, base: Vec3Tuple, color: Tint): void {
  kit.at(base, [0, 0, 0], () => {
    const W = 0.34;
    const H = 0.46;
    const D = 0.165;
    kit.box('world.props.paint', [0, H / 2, 0], [W, H, D], 0.018, { tint: color }, [0, 0, 0], 2);
    for (const side of [-1, 1]) {
      const z = side * (D / 2 + 0.002);
      for (const r of [0.93, -0.93]) {
        kit.box('world.props.paint', [0, H * 0.46, z], [0.018, 0.4, 0.006], 0.003, { tint: color }, [
          0,
          0,
          r * 0.62,
        ]);
      }
      kit.box('world.props.paint', [0, H * 0.46, z], [0.3, 0.37, 0.004], 0.004, { tint: color });
    }
    // Poignées (trois) et bec verrouillé.
    for (const x of [-0.09, 0, 0.09]) {
      kit.box('world.props.paint', [x, H + 0.02, 0], [0.024, 0.04, 0.02], 0.005, { tint: color });
    }
    kit.box('world.props.paint', [0, H + 0.04, 0], [0.22, 0.012, 0.02], 0.004, { tint: color });
    kit.cylinder(
      'world.props.paint',
      [-W / 2 + 0.045, H - 0.004, 0],
      [-W / 2 + 0.03, H + 0.035, 0],
      0.024,
      14,
      { tint: color },
    );
    kit.box('steel.zinc', [-W / 2 + 0.03, H + 0.05, 0], [0.04, 0.012, 0.03], 0.004);
  });
}

function fuelCan(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [0, 0, 0], () => {
    kit.box(
      'world.props.plastic',
      [0, 0.16, 0],
      [0.3, 0.32, 0.15],
      0.03,
      { tint: tint(0xb2261c, 0.35) },
      [0, 0, 0],
      2,
    );
    kit.box(
      'world.props.plastic',
      [0.04, 0.35, 0],
      [0.12, 0.05, 0.03],
      0.012,
      { tint: tint(0xb2261c, 0.35) },
      [0, 0, 0],
      2,
    );
    kit.cylinder('world.props.plastic', [-0.1, 0.31, 0], [-0.12, 0.36, 0], 0.022, 14, {
      tint: TINTS.plasticBlack,
    });
  });
}

function oilJug(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [0, 0, 0], () => {
    kit.box(
      'world.props.plastic',
      [0, 0.14, 0],
      [0.19, 0.28, 0.12],
      0.02,
      { tint: tint(0x1f3f7a, 0.4) },
      [0, 0, 0],
      2,
    );
    kit.box('world.props.plastic', [0.05, 0.3, 0], [0.07, 0.04, 0.03], 0.01, { tint: tint(0x1f3f7a, 0.4) });
    kit.cylinder('world.props.plastic', [-0.05, 0.28, 0], [-0.05, 0.31, 0], 0.02, 14, {
      tint: TINTS.plasticYellow,
    });
    kit.decal('oil', [-0.0951, 0.13, 0], [0.16, 0.105], [0, -Math.PI / 2, 0]);
  });
}

function paintCan(kit: PropKit, base: Vec3Tuple, variant: number): void {
  kit.at(base, [0, variant * 1.3, 0], () => {
    kit.lathe(
      'steel.zinc',
      [
        [0.08, 0],
        [0.082, 0.004],
        [0.08, 0.008],
        [0.08, 0.105],
        [0.082, 0.11],
        [0.078, 0.112],
        [0, 0.112],
      ],
      [0, 0, 0],
      [0, 0, 0],
      28,
    );
    kit.wrapDecal('paint', [0, 0.056, 0], 0.0806, 0.085, 2.2, -Math.PI / 2);
    // Coulures de peinture olive sur le bord.
    kit.box(
      'world.props.paint',
      [0.06, 0.112, 0.05],
      [0.03, 0.002, 0.02],
      0.001,
      { tint: TINTS.olive, castShadow: false },
      [0, 0.6, 0],
    );
    kit.cylinder('steel.zinc', [-0.06, 0.112, 0], [0.06, 0.13, 0], 0.0015, 5, { castShadow: false });
  });
}

/** Carton fermé (scotché), impression facultative sur la face ouest. */
function carton(
  kit: PropKit,
  base: Vec3Tuple,
  size: Vec3Tuple,
  print: string | null,
  printSize: readonly [number, number],
  yaw: number,
): void {
  kit.at(base, [0, yaw, 0], () => {
    const [w, h, d] = size;
    kit.box('cardboard', [0, h / 2, 0], [w, h, d], 0.006, {}, [0, 0, 0], 2);
    kit.box('world.props.plastic', [0, h + 0.0005, 0], [w + 0.002, 0.001, 0.05], 0, {
      tint: tint(0xb58a4a, 0.3),
      castShadow: false,
      edge: 'none',
    });
    if (print) kit.decal(print, [-w / 2 - 0.0008, h * 0.5, 0], printSize, [0, -Math.PI / 2, 0]);
  });
}

/** Carton ouvert, rabats relevés, inscription au feutre, pièces de voiture RC qui dépassent. */
function openCarton(kit: PropKit, base: Vec3Tuple, size: Vec3Tuple): void {
  kit.at(base, [0, 0.04, 0], () => {
    const [w, h, d] = size;
    const t = 0.004;
    kit.box('cardboard', [0, t / 2, 0], [w, t, d], 0.001);
    kit.box('cardboard', [-w / 2 + t / 2, h / 2, 0], [t, h, d], 0.001);
    kit.box('cardboard', [w / 2 - t / 2, h / 2, 0], [t, h, d], 0.001);
    kit.box('cardboard', [0, h / 2, -d / 2 + t / 2], [w, h, t], 0.001);
    kit.box('cardboard', [0, h / 2, d / 2 - t / 2], [w, h, t], 0.001);
    kit.box('cardboard', [-w / 2 - 0.06, h + 0.005, 0], [0.13, t, d - 0.01], 0.001, {}, [0, 0, -0.35]);
    kit.box('cardboard', [w / 2 + 0.05, h + 0.02, 0], [0.12, t, d - 0.01], 0.001, {}, [0, 0, 0.9]);
    kit.decal('boxRC', [-w / 2 - 0.0008, h * 0.45, 0], [0.18, 0.074], [0, -Math.PI / 2, 0]);
    // Roues de rechange et un carter qui dépassent.
    for (const [x, z] of [
      [-0.06, -0.05],
      [0.05, 0.06],
    ] as const) {
      kit.cylinder('rubber.black', [x, h - 0.02, z - 0.02], [x, h - 0.02, z + 0.02], 0.042, 16);
    }
    kit.box(
      'world.props.plastic',
      [0.02, h - 0.03, -0.08],
      [0.12, 0.05, 0.06],
      0.01,
      { tint: TINTS.plasticYellow },
      [0.3, 0.2, 0],
    );
  });
}

/**
 * Bocal de verre à couvercle métallique rempli de visserie instanciée. `hanging` : couvercle vissé
 * sous la tablette (le bocal pend, couvercle en haut).
 */
function jar(
  kit: PropKit,
  base: Vec3Tuple,
  set: InstanceSet,
  label: string,
  glass: string,
  rand: () => number,
  hanging: boolean,
): void {
  const r = 0.043;
  const h = 0.12;
  kit.at(base, [0, rand() * 2, 0], () => {
    kit.lathe(
      glass,
      [
        [0.0, 0.001],
        [r - 0.006, 0.0],
        [r, 0.008],
        [r, h - 0.02],
        [r - 0.008, h - 0.008],
        [r - 0.008, h],
      ],
      [0, 0, 0],
      [0, 0, 0],
      24,
      { castShadow: false },
    );
    kit.lathe(
      'world.props.paint',
      [
        [r - 0.003, h - 0.012],
        [r - 0.003, h + 0.006],
        [r - 0.005, h + 0.009],
        [0, h + 0.009],
      ],
      [0, 0, 0],
      [0, 0, 0],
      24,
      { tint: hanging ? TINTS.red : TINTS.orange },
    );
    if (hanging)
      kit.cylinder('steel.zinc', [0, h + 0.009, 0], [0, h + 0.014, 0], 0.004, 6, { castShadow: false });
    kit.decal(label, [0, h * 0.62, r + 0.0008], [0.05, 0.016]);
    // Remplissage : tas tassé au fond (à peu près 55 % du volume).
    const n = set.name === 'rondelles' ? 45 : set.name === 'écrous' ? 40 : 34;
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt(rand()) * (r - 0.012);
      const aa = rand() * Math.PI * 2;
      const y = 0.006 + (i / n) * h * 0.5 + rand() * 0.01;
      kit.instance(
        set,
        PropKit.place(
          [Math.cos(aa) * rr, y, Math.sin(aa) * rr],
          [rand() * Math.PI, rand() * Math.PI, rand() * Math.PI],
        ),
      );
    }
  });
}

function sprayCan(kit: PropKit, base: Vec3Tuple, yaw: number): void {
  kit.at(base, [0, yaw, 0], () => {
    kit.lathe(
      'steel.zinc',
      [
        [0.029, 0],
        [0.0325, 0.004],
        [0.0325, 0.16],
        [0.026, 0.176],
        [0.012, 0.182],
        [0, 0.182],
      ],
      [0, 0, 0],
      [0, 0, 0],
      22,
    );
    kit.wrapDecal('spray', [0, 0.085, 0], 0.0331, 0.15, Math.PI * 1.2, -Math.PI / 2);
    kit.cylinder('world.props.plastic', [0, 0.176, 0], [0, 0.196, 0], 0.012, 12, { tint: TINTS.plasticRed });
    kit.cylinder('world.props.plastic', [0.012, 0.19, 0], [0.04, 0.19, 0], 0.0012, 5, {
      tint: TINTS.plasticRed,
      castShadow: false,
    });
  });
}

function wireSpool(kit: PropKit, base: Vec3Tuple): void {
  kit.at(base, [Math.PI / 2, 0, 0.1], () => {
    kit.lathe(
      'world.props.plastic',
      [
        [0.012, -0.04],
        [0.06, -0.04],
        [0.06, -0.034],
        [0.022, -0.034],
      ],
      [0, 0, -0.06],
      [0, 0, 0],
      24,
      { tint: TINTS.plasticBlack },
    );
    kit.lathe(
      'copper.enamel',
      [
        [0.022, -0.034],
        [0.048, -0.034],
        [0.05, 0.0],
        [0.048, 0.034],
        [0.022, 0.034],
      ],
      [0, 0, -0.06],
      [0, 0, 0],
      24,
    );
    kit.lathe(
      'world.props.plastic',
      [
        [0.022, 0.034],
        [0.06, 0.034],
        [0.06, 0.04],
        [0.012, 0.04],
      ],
      [0, 0, -0.06],
      [0, 0, 0],
      24,
      { tint: TINTS.plasticBlack },
    );
  });
}

/** Caisse à outils en tôle (bleu pétrole), poignée rabattue, fermoirs. */
export function toolbox(kit: PropKit, base: Vec3Tuple, yaw = 0): void {
  kit.at(base, [0, yaw, 0], () => {
    const W = 0.2;
    const H = 0.17;
    const D = 0.44;
    kit.box('world.props.paint', [0, H * 0.4, 0], [W, H * 0.8, D], 0.008, { tint: TINTS.teal }, [0, 0, 0], 2);
    kit.box(
      'world.props.paint',
      [0, H * 0.88, 0],
      [W - 0.004, H * 0.24, D - 0.004],
      0.012,
      { tint: TINTS.teal },
      [0, 0, 0],
      2,
    );
    kit.cylinder('steel.chrome', [0, H + 0.012, -0.1], [0, H + 0.012, 0.1], 0.006, 10);
    for (const z of [-0.1, 0.1]) kit.box('steel.chrome', [0, H + 0.004, z], [0.012, 0.016, 0.006], 0.002);
    for (const z of [-0.14, 0.14])
      kit.box('steel.chrome', [-W / 2 - 0.003, H * 0.8, z], [0.006, 0.03, 0.024], 0.002);
  });
}
