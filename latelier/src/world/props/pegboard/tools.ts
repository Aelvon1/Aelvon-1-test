/**
 * Outils accrochés au panneau perforé (chevilles INSTANCIÉES dans les trous réels du panneau) :
 * scie à métaux, maillet, extracteur à griffes, pied à coulisse, râtelier de tournevis (plats et
 * cruciformes, manches facettés), clés Allen, pinces (coupante, plate, à circlips), clés mixtes
 * 8 → 19 mm, tournevis de précision, rouleau de ruban adhésif jaune, schéma accroché ;
 * silhouettes peintes derrière les outils (la pince multiprise manque : sa silhouette reste).
 */
import * as THREE from 'three/webgpu';
import { tint, type Tint } from '../batch';
import type { InstanceSet } from '../kit';
import { PropKit } from '../kit';
import { holeX, holeY, PEG } from '../dims';
import { TINTS } from '../parts';
import { CALIPER, HACKSAW, MALLET, PULLER, pliersOutline, wrenchOutline, type P2 } from './outlines';
import {
  caliperOrigin,
  hacksawOrigin,
  PEG_LAYOUT as L,
  pliersAnchorOffset,
  silhouetteSpecs,
  WRENCH_SIZES,
} from './toolLayout';
import { roundedPolyline, tubeAlong, type Vec3Tuple } from '../../geometry/shapes';

/** Rayon des chevilles. */
const PEG_R = 0.0022;

/** Géométrie d'une cheville en L (entre dans le trou, sort de 45 mm, bout relevé). */
export function createPegGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector3(0, -0.008, -0.007),
    new THREE.Vector3(0, 0, -0.004),
    new THREE.Vector3(0, 0, 0.038),
    new THREE.Vector3(0, 0.012, 0.047),
  ];
  const g = tubeAlong(roundedPolyline(pts, 0.006), PEG_R, 6, 300);
  return g;
}

function shapeFrom(points: readonly P2[], holes: readonly (readonly P2[])[] = []): THREE.Shape {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

export function buildPegboardTools(kit: PropKit, pegs: InstanceSet): void {
  const peg = (i: number, j: number) => kit.instance(pegs, PropKit.place([holeX(i), holeY(j), PEG.z]));
  // Silhouettes peintes (décalques juste devant la face du panneau).
  for (const s of silhouetteSpecs()) kit.decal(s.region, [s.center[0], s.center[1], PEG.z + 0.0007], s.size);

  buildHacksaw(kit);
  L.hacksaw.i.forEach((i) => peg(i, L.hacksaw.j));
  buildMallet(kit);
  L.mallet.i.forEach((i) => peg(i, L.mallet.j));
  buildPuller(kit);
  peg(L.puller.i, L.puller.j);
  buildCaliper(kit);
  peg(L.caliper.i, L.caliper.j);
  buildScrewdriverRack(kit);
  L.screwdriverRack.i.forEach((i) => peg(i, L.screwdriverRack.j));
  buildAllenRack(kit);
  L.allenRack.i.forEach((i) => peg(i, L.allenRack.j));
  buildPrecisionRack(kit);
  L.precisionRack.i.forEach((i) => peg(i, L.precisionRack.j));
  buildPliers(kit);
  L.pliers.i.forEach((i) => peg(i, L.pliers.j));
  peg(L.missingPliers.i, L.missingPliers.j);
  buildWrenches(kit);
  WRENCH_SIZES.forEach((_, k) => peg(L.wrenches.i0 + k * L.wrenches.step, L.wrenches.j));
  buildTapeAndSheet(kit);
  peg(L.tape.i, L.tape.j);
  peg(L.sheet.i, L.sheet.j);
}

function buildHacksaw(kit: PropKit): void {
  const [x0, top] = hacksawOrigin();
  const F = HACKSAW;
  const z = PEG.z + 0.012;
  const yTop = top - F.tube;
  const yBot = top - F.frameHeight + 0.008;
  const frame = [
    new THREE.Vector3(x0 + 0.008, yBot, z),
    new THREE.Vector3(x0 + 0.008, yTop, z),
    new THREE.Vector3(x0 + F.frameLength, yTop, z),
    new THREE.Vector3(x0 + F.frameLength, yBot - 0.01, z),
  ];
  kit.add('world.props.paint', tubeAlong(roundedPolyline(frame, 0.03), F.tube, 10, 60), null, {
    tint: TINTS.tealLight,
    edge: 'none',
  });
  // Lame (acier bleui) et tendeur à oreilles.
  kit.box(
    'steel.spring',
    [x0 + F.frameLength / 2 + 0.004, yBot + 0.004, z],
    [F.frameLength - 0.01, 0.012, 0.0008],
    0,
    {
      castShadow: false,
    },
  );
  kit.box('steel.zinc', [x0 + 0.008, yBot - 0.01, z], [0.016, 0.01, 0.006], 0.002);
  kit.box('steel.zinc', [x0 + 0.008, yBot - 0.016, z], [0.03, 0.006, 0.003], 0.0015);
  // Poignée pistolet (plastique noir) sous l'arrière de la monture.
  kit.box(
    'world.props.plastic',
    [x0 + F.frameLength + 0.012, yBot - 0.04, z],
    [0.03, 0.075, 0.022],
    0.009,
    { tint: TINTS.plasticBlack },
    [0, 0, 0.35],
    2,
  );
  kit.box(
    'world.props.plastic',
    [x0 + F.frameLength - 0.004, yBot - 0.008, z],
    [0.03, 0.024, 0.02],
    0.006,
    { tint: TINTS.plasticBlack },
    [0, 0, 0],
    2,
  );
}

function buildMallet(kit: PropKit): void {
  const x = (holeX(L.mallet.i[0]) + holeX(L.mallet.i[1])) / 2;
  const headY = holeY(L.mallet.j) + 0.004 + MALLET.headRadius;
  const z = PEG.z + MALLET.headRadius + 0.004;
  kit.cylinder(
    'rubber.black',
    [x - MALLET.headLength / 2, headY, z],
    [x + MALLET.headLength / 2, headY, z],
    MALLET.headRadius,
    22,
  );
  for (const side of [-1, 1]) {
    kit.cylinder(
      'rubber.black',
      [x + (side * MALLET.headLength) / 2, headY, z],
      [x + side * (MALLET.headLength / 2 + 0.003), headY, z],
      MALLET.headRadius * 0.92,
      22,
    );
  }
  kit.cylinder(
    'world.bench.frame',
    [x, headY - MALLET.headRadius * 0.9, z],
    [x, headY - MALLET.headRadius - MALLET.handleLength, z],
    MALLET.handleRadius,
    12,
    {
      radiusB: MALLET.handleRadius * 1.15,
    },
  );
  kit.cylinder(
    'world.props.plastic',
    [x, headY - MALLET.headRadius - MALLET.handleLength + 0.07, z],
    [x, headY - MALLET.headRadius - MALLET.handleLength - 0.002, z],
    MALLET.handleRadius * 1.2,
    12,
    {
      tint: TINTS.plasticYellow,
    },
  );
}

function buildPuller(kit: PropKit): void {
  const x = holeX(L.puller.i) - 0.035;
  const barY = holeY(L.puller.j) + PEG_R + 0.011;
  const z = PEG.z + 0.028;
  const paint = { tint: TINTS.orange };
  kit.box('world.props.paint', [x, barY, z], [PULLER.barLength, 0.022, 0.022], 0.004, paint, [0, 0, 0], 2);
  // Vis de pression (filetage suggéré par des anneaux) et tête hexagonale.
  kit.cylinder('steel.blackoxide', [x, barY + 0.03, z], [x, barY + 0.03 - PULLER.screwLength, z], 0.0065, 10);
  for (let k = 0; k < 10; k++) {
    const y = barY - 0.02 - k * 0.012;
    kit.cylinder('steel.blackoxide', [x, y, z], [x, y - 0.004, z], 0.0074, 10, { castShadow: false });
  }
  kit.cylinder('steel.blackoxide', [x, barY + 0.024, z], [x, barY + 0.042, z], 0.012, 6);
  kit.cylinder(
    'steel.blackoxide',
    [x, barY - PULLER.screwLength + 0.03, z],
    [x, barY - PULLER.screwLength + 0.02, z],
    0.0035,
    8,
    { radiusB: 0.001 },
  );
  // Griffes articulées.
  for (const side of [-1, 1]) {
    const gx = x + side * (PULLER.barLength / 2 - 0.008);
    kit.cylinder('steel.zinc', [gx, barY, z - 0.016], [gx, barY, z + 0.016], 0.005, 10);
    kit.box(
      'world.props.paint',
      [gx, barY - PULLER.jawLength / 2, z],
      [0.012, PULLER.jawLength, 0.014],
      0.003,
      paint,
      [0, 0, side * 0.08],
    );
    const fx = gx - side * 0.009 + side * PULLER.jawLength * Math.sin(0.08) * -1;
    kit.box(
      'world.props.paint',
      [fx, barY - PULLER.jawLength + 0.005, z],
      [0.022, 0.01, 0.014],
      0.003,
      paint,
    );
  }
}

function buildCaliper(kit: PropKit): void {
  const [x, top] = caliperOrigin();
  const C = CALIPER;
  const z = PEG.z + 0.006;
  const steel = 'steel.stainless';
  kit.box(steel, [x, top - C.beamLength / 2, z], [C.beamWidth, C.beamLength, 0.0035], 0.0008);
  // Bec fixe (repose sur la cheville) et becs d'intérieur au-dessus.
  kit.box(steel, [x + C.jawLength / 2 - 0.004, top - 0.025, z], [C.jawLength + 0.008, 0.018, 0.0035], 0.0015);
  kit.box(steel, [x + 0.012, top + 0.008, z], [0.012, 0.018, 0.0028], 0.001, {}, [0, 0, -0.3]);
  // Curseur, bec mobile, molette, vis de blocage.
  kit.box(steel, [x + C.jawLength / 2 - 0.004, top - 0.065, z], [C.jawLength + 0.008, 0.026, 0.004], 0.0015);
  kit.box(steel, [x, top - 0.085, z + 0.001], [C.beamWidth + 0.01, 0.05, 0.007], 0.0015);
  kit.cylinder(
    'steel.zinc',
    [x - 0.01, top - 0.11, z + 0.002],
    [x - 0.004, top - 0.11, z + 0.002],
    0.006,
    14,
  );
  kit.cylinder('steel.zinc', [x, top - 0.062, z + 0.004], [x, top - 0.062, z + 0.009], 0.0035, 8);
  kit.box(steel, [x, top - C.beamLength - 0.02, z], [0.0035, 0.04, 0.0025], 0);
  kit.decal(
    'caliperScale',
    [x + 0.0005, top - C.beamLength / 2 - 0.03, z + 0.0018],
    [0.17, 0.0075],
    [0, 0, -Math.PI / 2],
  );
}

interface ScrewdriverSpec {
  shaft: number;
  handle: number;
  radius: number;
  tip: 'flat' | 'phillips';
  color: Tint;
}

/** Tournevis vertical, pointe vers le bas : `y` = haut de la férule. */
function screwdriver(kit: PropKit, x: number, y: number, z: number, s: ScrewdriverSpec): void {
  const r = s.radius;
  // Manche facetté (8 pans) en acétate coloré, bout arrondi, bague noire.
  kit.lathe(
    'world.props.plastic',
    [
      [r * 0.55, 0],
      [r * 0.85, 0.006],
      [r, 0.02],
      [r * 1.02, s.handle * 0.7],
      [r * 0.92, s.handle * 0.92],
      [r * 0.6, s.handle],
      [0, s.handle],
    ],
    [x, y, z],
    [0, Math.PI / 8, 0],
    8,
    { tint: s.color },
  );
  kit.lathe(
    'world.props.plastic',
    [
      [r * 0.93, s.handle * 0.3],
      [r * 1.04, s.handle * 0.31],
      [r * 1.04, s.handle * 0.4],
      [r * 0.93, s.handle * 0.41],
    ],
    [x, y, z],
    [0, 0, 0],
    8,
    {
      tint: TINTS.plasticBlack,
      castShadow: false,
    },
  );
  const shaftR = Math.max(0.0018, r * 0.28);
  kit.cylinder('steel.chrome', [x, y + 0.004, z], [x, y - s.shaft, z], shaftR, 10);
  if (s.tip === 'flat') {
    kit.box('steel.chrome', [x, y - s.shaft - 0.005, z], [shaftR * 2.6, 0.012, shaftR * 0.6], 0.0003, {
      castShadow: false,
    });
  } else {
    kit.cylinder('steel.blackoxide', [x, y - s.shaft, z], [x, y - s.shaft - 0.009, z], shaftR, 4, {
      radiusB: 0.0004,
      castShadow: false,
    });
  }
}

function buildScrewdriverRack(kit: PropKit): void {
  const [i0, i1] = L.screwdriverRack.i;
  const pegY = holeY(L.screwdriverRack.j);
  const x0 = holeX(i0) - 0.026;
  const x1 = holeX(i1) + 0.028;
  const barY = pegY + PEG_R + 0.0125;
  const z = PEG.z + 0.032;
  kit.box(
    'world.bench.frame',
    [(x0 + x1) / 2, barY, PEG.z + 0.026],
    [x1 - x0, 0.025, 0.05],
    0.004,
    {},
    [0, 0, 0],
    2,
  );
  const red = tint(0xb3261c, 0.22);
  const yellow = tint(0xd9a820, 0.22);
  const specs: ScrewdriverSpec[] = [
    { shaft: 0.075, handle: 0.08, radius: 0.012, tip: 'flat', color: yellow },
    { shaft: 0.1, handle: 0.095, radius: 0.0145, tip: 'flat', color: yellow },
    { shaft: 0.15, handle: 0.105, radius: 0.016, tip: 'flat', color: yellow },
    { shaft: 0.2, handle: 0.11, radius: 0.017, tip: 'flat', color: yellow },
    { shaft: 0.075, handle: 0.08, radius: 0.012, tip: 'phillips', color: red },
    { shaft: 0.1, handle: 0.095, radius: 0.0145, tip: 'phillips', color: red },
    { shaft: 0.125, handle: 0.1, radius: 0.016, tip: 'phillips', color: red },
    { shaft: 0.075, handle: 0.085, radius: 0.0155, tip: 'phillips', color: tint(0x2b5a8c, 0.22) },
  ];
  const step = (x1 - x0 - 0.05) / (specs.length - 1);
  specs.forEach((s, k) => screwdriver(kit, x0 + 0.025 + k * step, barY + 0.0125, z, s));
}

function buildAllenRack(kit: PropKit): void {
  const [i0, i1] = L.allenRack.i;
  const pegY = holeY(L.allenRack.j);
  const x0 = holeX(i0) - 0.024;
  const x1 = holeX(i1) + 0.024;
  const y = pegY + PEG_R + 0.01;
  kit.box(
    'world.props.plastic',
    [(x0 + x1) / 2, y, PEG.z + 0.018],
    [x1 - x0, 0.02, 0.034],
    0.004,
    { tint: TINTS.plasticRed },
    [0, 0, 0],
    2,
  );
  const sizes = [0.0015, 0.002, 0.0025, 0.003, 0.004, 0.005, 0.006, 0.008, 0.01];
  const top = y + 0.01;
  const z = PEG.z + 0.018;
  sizes.forEach((s, k) => {
    const x = x0 + 0.01 + (k * (x1 - x0 - 0.02)) / (sizes.length - 1);
    const long = 0.045 + 10 * s;
    const short = 0.014 + 2.5 * s;
    const pts = [
      new THREE.Vector3(x, top - long, z),
      new THREE.Vector3(x, top + s / 2, z),
      new THREE.Vector3(x, top + s / 2, z + short),
    ];
    // Section hexagonale : tube à 6 pans.
    kit.add(
      'steel.blackoxide',
      tubeAlong(roundedPolyline(pts, s * 1.3), s / 2 / Math.cos(Math.PI / 6), 6, 150),
      null,
      {
        edge: 'none',
        castShadow: false,
      },
    );
  });
}

function buildPrecisionRack(kit: PropKit): void {
  const [i0, i1] = L.precisionRack.i;
  const pegY = holeY(L.precisionRack.j);
  const x0 = holeX(i0) - 0.02;
  const x1 = holeX(i1) + 0.02;
  const y = pegY + PEG_R + 0.008;
  const z = PEG.z + 0.016;
  kit.box(
    'world.props.plastic',
    [(x0 + x1) / 2, y, z],
    [x1 - x0, 0.016, 0.03],
    0.004,
    { tint: TINTS.plasticGray },
    [0, 0, 0],
    2,
  );
  const caps = [
    TINTS.plasticRed,
    TINTS.plasticBlue,
    TINTS.plasticYellow,
    TINTS.plasticGreen,
    TINTS.plasticBlack,
    TINTS.plasticOrange,
  ];
  caps.forEach((cap, k) => {
    const x = x0 + 0.014 + (k * (x1 - x0 - 0.028)) / (caps.length - 1);
    const y0 = y + 0.008;
    kit.cylinder('alu.machined', [x, y0, z], [x, y0 + 0.055, z], 0.0046, 12);
    kit.cylinder('world.props.plastic', [x, y0 + 0.055, z], [x, y0 + 0.062, z], 0.0048, 12, { tint: cap });
    kit.cylinder('steel.chrome', [x, y0, z], [x, y0 - 0.035 - (k % 3) * 0.006, z], 0.0011, 6, {
      castShadow: false,
    });
  });
}

function buildPliers(kit: PropKit): void {
  const grips: Tint[] = [TINTS.plasticRed, tint(0x1f4f8a, 0.4), TINTS.plasticYellow];
  L.pliers.kinds.forEach((kind, k) => {
    const shape = pliersOutline(kind);
    const x = holeX(L.pliers.i[k]!);
    const y = holeY(L.pliers.j) - pliersAnchorOffset(kind);
    const z = PEG.z + 0.009;
    const metal = kind === 'circlip' ? 'steel.blackoxide' : 'steel.chrome';
    kit.extrude(metal, shapeFrom(shape.outer), 0.0075, 0.0014, PropKit.place([x, y, z]));
    kit.cylinder(metal, [x, y + shape.pivotY, z - 0.0045], [x, y + shape.pivotY, z + 0.0045], 0.0045, 12, {
      castShadow: false,
    });
    for (const line of shape.grips) {
      const pts = line.map(([px, py]) => new THREE.Vector3(x + px, y + py, z));
      kit.add('world.props.plastic', tubeAlong(new THREE.CatmullRomCurve3(pts), 0.0068, 8, 90), null, {
        tint: grips[k]!,
        edge: 'none',
      });
    }
  });
}

function buildWrenches(kit: PropKit): void {
  WRENCH_SIZES.forEach((size, k) => {
    const o = wrenchOutline(size, 12);
    const x = holeX(L.wrenches.i0 + k * L.wrenches.step);
    const y = holeY(L.wrenches.j) - 0.58 * size + PEG_R + 0.001;
    const thick = 0.0035 + 0.22 * size;
    const z = PEG.z + 0.006 + thick / 2;
    kit.extrude('steel.chrome', shapeFrom(o.outer, o.holes), thick, 0.0011, PropKit.place([x, y, z]), {}, 4);
  });
}

function buildTapeAndSheet(kit: PropKit): void {
  const tx = holeX(L.tape.i);
  const ty = holeY(L.tape.j) - 0.036 + PEG_R;
  const tz = PEG.z + 0.018;
  kit.lathe(
    'tape.yellow',
    [
      [0.038, -0.0095],
      [0.051, -0.0095],
      [0.0525, -0.008],
      [0.0525, 0.008],
      [0.051, 0.0095],
      [0.038, 0.0095],
    ],
    [tx, ty, tz],
    [Math.PI / 2, 0, 0],
    32,
  );
  kit.lathe(
    'cardboard',
    [
      [0.0345, -0.0098],
      [0.038, -0.0098],
      [0.038, 0.0098],
      [0.0345, 0.0098],
      [0.0345, -0.0098],
    ],
    [tx, ty, tz],
    [Math.PI / 2, 0, 0],
    24,
  );
  // Bout de ruban qui pend.
  kit.box(
    'tape.yellow',
    [tx + 0.052, ty - 0.012, tz],
    [0.0008, 0.03, 0.019],
    0,
    { castShadow: false, edge: 'none' },
    [0, 0, 0.12],
  );
  // Schéma punaisé sur la cheville (papier légèrement décollé du panneau).
  const sx = holeX(L.sheet.i);
  const sy = holeY(L.sheet.j);
  const sheetCenter: Vec3Tuple = [sx, sy - 0.1, PEG.z + 0.004];
  kit.decal('sheet', sheetCenter, [0.155, 0.202], [0.025, 0, 0.02]);
}
