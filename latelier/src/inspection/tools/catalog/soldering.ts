/**
 * Soudure et dessoudage : fer de station (panne conique étamée), pompe à dessouder (piston armé,
 * bouton de déclenchement), tresse à dessouder (bobine distributrice + tresse cuivre), station à
 * air chaud (buse fine, manche cannelé, câble).
 *
 * Gestes :
 * - fer : incliné à ~45° du côté extérieur, panne au contact de la soudure (pied de la pièce),
 *   léger tremblement de la main ; il reste sur place pendant que la pièce se dégage ;
 * - pompe : buse sur la soudure, fer d'appoint de l'autre côté ; à la fusion, le piston est
 *   libéré (déclic) ;
 * - tresse : posée sur la soudure, pressée par le fer ; l'extrémité s'imbibe d'étain (teinte) ;
 * - air chaud : buse à 5 mm de la pièce décrivant de petits cercles, puis recul pendant la levée.
 *
 * Approximation : la soudure visée est supposée au pied de la pièce, sur le flanc extérieur
 * (l'emplacement réel des joints n'est pas décrit par les données) ; la tresse est un ruban de
 * cuivre lisse (brins tressés non modélisés) dont l'extrémité change de teinte en s'imbibant ;
 * le flux d'air chaud et l'aspiration de l'étain ne sont pas visualisés (seul le piston bouge).
 */
import * as THREE from 'three/webgpu';
import type { ToolAnimState, ToolBuildContext } from '../../../objects/types';
import { easeOutCubic, smoothstep } from '../../easing';
import { motionTiming } from '../../motions';
import { createBevelledBox } from '../../../materials/geometry/bevelledBox';
import { clamp, leanQuaternion, sideSign, toolGroup, toolMesh, toolRoot, tremor } from './common';
import { revolve, sweepPolygon, rectangle, tubeAlong, type ProfilePoint, type SweepFrame } from './geometry';
import { TOOL_COLORS, toolMaterials, type ToolMaterials } from './materials';
import { motionProgress, rigContext, type ToolRigContext } from './rig';

/** Fraction du mouvement consacrée à la fusion de l'étain (`desolder`). */
const MELT_FRACTION = motionTiming({ motion: 'desolder', distance: 0.01 }).a;

/** Fin de la fusion (progression du mouvement), selon le mouvement de la pièce. */
function meltEnd(motion: string): number {
  return motion === 'desolder' ? MELT_FRACTION : 0.5;
}

/** Câble à l'arrière d'un manche, qui s'efface progressivement (alpha par sommet). */
function cableGeometry(
  start: THREE.Vector3,
  points: readonly [number, number, number][],
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([start, ...points.map(([x, y, z]) => new THREE.Vector3(x, y, z))]);
  return tubeAlong(curve, {
    radius: () => 0.0021,
    tubularSegments: 48,
    radialSegments: 10,
    alpha: (u) => 1 - smoothstep((u - 0.45) / 0.5),
  });
}

/** Fer de station complet (origine = pointe de la panne, fer vers +Y). */
export function buildIronParts(mats: ToolMaterials): THREE.Group {
  const g = toolGroup('fer');
  g.add(
    toolMesh(
      revolve(
        [
          [0, 0],
          [0.00016, 0.00002],
          [0.00055, 0.0012],
          [0.00085, 0.0024],
        ],
        32,
      ),
      mats.tin(),
      'panne étamée',
    ),
  );
  g.add(
    toolMesh(
      revolve(
        [
          [0.00085, 0.0024],
          [0.0015, 0.0065],
          [0.0021, 0.011],
          [0.0023, 0.014],
          [0.0023, 0.0215],
        ],
        32,
      ),
      mats.chrome(),
      'panne',
    ),
  );
  g.add(
    toolMesh(
      revolve(
        [
          [0.0023, 0.021],
          [0.0034, 0.0215],
          [0.0036, 0.023],
          [0.0036, 0.0655],
        ],
        32,
      ),
      mats.stainless(),
      'fourreau',
    ),
  );
  g.add(
    toolMesh(
      revolve(
        [
          [0.0036, 0.064],
          [0.0052, 0.0645],
          [0.0053, 0.066],
          [0.0053, 0.075],
          [0.0046, 0.0762],
        ],
        48,
        { lobes: 18, lobeDepth: 0.05, lobeSharpness: 2 },
      ),
      mats.polished(),
      'écrou',
    ),
  );
  g.add(
    toolMesh(
      revolve(
        [
          [0.0046, 0.0755],
          [0.0088, 0.077],
          [0.009, 0.079],
          [0.0082, 0.081],
          [0.0074, 0.0815],
        ],
        40,
      ),
      mats.plastic(TOOL_COLORS.black, 0.4),
      'garde',
    ),
  );
  g.add(
    toolMesh(
      revolve(
        [
          [0.0074, 0.081],
          [0.0082, 0.084],
          [0.0092, 0.1],
          [0.0094, 0.118],
          [0.009, 0.132],
          [0.0082, 0.1398],
        ],
        60,
        { lobes: 10, lobeDepth: 0.08, lobeSharpness: 3, lobeRange: [0.083, 0.139], lobeFade: 0.003 },
      ),
      mats.rubber(TOOL_COLORS.blue),
      'poignée',
    ),
  );
  g.add(
    toolMesh(
      revolve(
        [
          [0.0082, 0.1395],
          [0.0084, 0.142],
          [0.0083, 0.17],
          [0.0074, 0.19],
          [0.0062, 0.2],
        ],
        40,
      ),
      mats.plastic(TOOL_COLORS.black, 0.4),
      'manche',
    ),
  );
  const relief: ProfilePoint[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    relief.push([THREE.MathUtils.lerp(0.0062, 0.0029, t), THREE.MathUtils.lerp(0.1995, 0.229, t)]);
  }
  g.add(
    toolMesh(
      revolve(relief, 24, {
        radial: (_t, y) => 1 - 0.1 * (0.5 + 0.5 * Math.cos((2 * Math.PI * y) / 0.0023)),
      }),
      mats.rubber(TOOL_COLORS.black),
      'serre-câble',
    ),
  );
  g.add(
    toolMesh(
      cableGeometry(new THREE.Vector3(0, 0.226, 0), [
        [0, 0.25, 0],
        [0.012, 0.29, -0.01],
        [0.04, 0.322, -0.03],
        [0.085, 0.335, -0.06],
        [0.13, 0.325, -0.1],
      ]),
      mats.cable(),
      'câble',
    ),
  );
  return g;
}

export function buildSolderingIron(ctx: ToolBuildContext): THREE.Object3D {
  const root = toolRoot('Fer à souder de station');
  root.add(buildIronParts(toolMaterials(ctx)));
  return root;
}

const _v = new THREE.Vector3();

/** Pose du fer (repère parent) : panne sur la soudure, incliné vers `side`. */
function placeIron(target: THREE.Object3D, ctx: ToolRigContext, side: 1 | -1, press = 0): void {
  const contact = smoothstep((ctx.approachK - 0.65) / 0.35) * (1 - ctx.retractK);
  leanQuaternion(target.quaternion, side, -0.25, 0.8);
  const shake = 0.00004 * contact;
  target.position.set(
    side * (ctx.halfX + 0.00035) + tremor(ctx.seconds, shake),
    -clamp(ctx.depth * 0.72, 0, 0.012) -
      ctx.travel -
      press * contact +
      tremor(ctx.seconds * 1.13, shake * 0.6, 9.1, 21.7),
    tremor(ctx.seconds * 0.91, shake * 0.8, 6.1, 15.3),
  );
}

/** Fer : incliné à ~45°, panne au pied de la pièce, reste sur place pendant le dégagement. */
export function animateSolderingIron(tool: THREE.Object3D, _state: ToolAnimState): void {
  const ctx = rigContext(tool);
  placeIron(tool, ctx, sideSign(ctx));
}

// --- Pompe à dessouder ------------------------------------------------------------------------

interface PumpRig {
  pump: THREE.Object3D;
  piston: THREE.Object3D;
  helper: THREE.Object3D;
}

const pumpRigs = new WeakMap<THREE.Object3D, PumpRig>();
const PISTON_TRAVEL = 0.058;

export function buildDesolderPump(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Pompe à dessouder');
  const pump = toolGroup('pompe');
  // Buse PTFE percée (paroi intérieure et fond du canal modélisés).
  pump.add(
    toolMesh(
      revolve(
        [
          [0, 0.004],
          [0.0006, 0.004],
          [0.0006, 0],
          [0.0011, 0],
          [0.0013, 0.0004],
          [0.0046, 0.022],
          [0.0072, 0.03],
        ],
        40,
      ),
      mats.ptfe(),
      'buse',
    ),
  );
  pump.add(
    toolMesh(
      revolve(
        [
          [0.0072, 0.0295],
          [0.0099, 0.0305],
          [0.0099, 0.043],
          [0.0097, 0.0435],
        ],
        48,
      ),
      mats.polished(),
      'porte-buse',
    ),
  );
  pump.add(
    toolMesh(
      revolve(
        [
          [0.0097, 0.043],
          [0.0098, 0.044],
          [0.0098, 0.158],
          [0.0096, 0.159],
        ],
        64,
        { lobes: 28, lobeDepth: 0.035, lobeSharpness: 3, lobeRange: [0.07, 0.13], lobeFade: 0.004 },
      ),
      mats.anodized('blue'),
      'corps',
    ),
  );
  pump.add(
    toolMesh(
      revolve(
        [
          [0.0096, 0.1585],
          [0.0104, 0.159],
          [0.0106, 0.162],
          [0.0106, 0.17],
          [0.0098, 0.1725],
          [0.0031, 0.1735],
          [0.0028, 0.174],
        ],
        48,
      ),
      mats.plastic(TOOL_COLORS.black, 0.4),
      'bouchon',
    ),
  );
  const button = createBevelledBox(0.004, 0.009, 0.006, { radius: 0.001 });
  button.translate(0.0108, 0.15, 0);
  pump.add(toolMesh(button, mats.plastic(TOOL_COLORS.black, 0.4), 'bouton de déclenchement'));
  const piston = toolGroup('piston');
  piston.add(
    toolMesh(
      revolve(
        [
          [0.0025, 0.12],
          [0.0025, 0.1785],
        ],
        20,
      ),
      mats.polished(),
      'tige',
    ),
  );
  piston.add(
    toolMesh(
      revolve(
        [
          [0.0025, 0.1775],
          [0.0068, 0.178],
          [0.0072, 0.18],
          [0.0072, 0.188],
          [0.006, 0.1905],
          [0, 0.191],
        ],
        32,
      ),
      mats.plastic(TOOL_COLORS.black, 0.4),
      'bouton',
    ),
  );
  pump.add(piston);
  const helper = toolGroup('fer d’appoint', buildIronParts(mats));
  helper.visible = false;
  root.add(pump, helper);
  pumpRigs.set(root, { pump, piston, helper });
  return root;
}

/** Instant de libération du piston (progression du mouvement). */
export const pumpReleaseAt = (motion: string): number => meltEnd(motion) * 0.85;

export function animateDesolderPump(tool: THREE.Object3D, state: ToolAnimState): void {
  const rig = pumpRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const side = sideSign(ctx);
  // Buse du côté opposé au fer, inclinée d'environ 30°.
  leanQuaternion(rig.pump.quaternion, -side, -0.2, 0.52);
  rig.pump.position.set(-side * (ctx.halfX + 0.0009), -clamp(ctx.depth * 0.5, 0, 0.008) - ctx.travel, 0);
  // Piston : armé jusqu'à la fusion, puis libéré (détente avec léger rebond).
  const releaseAt = ctx.approachSeconds + pumpReleaseAt(state.motion) * ctx.motionSeconds;
  const dt = ctx.seconds - releaseAt;
  let y = 0;
  if (dt > 0) {
    const k = dt / 0.08;
    y =
      k < 1
        ? PISTON_TRAVEL * easeOutCubic(k)
        : PISTON_TRAVEL * (1 + 0.05 * Math.exp(-(dt - 0.08) * 22) * Math.sin((dt - 0.08) * 55));
  }
  rig.piston.position.set(0, y, 0);
  rig.helper.visible = ctx.helpersVisible;
  placeIron(rig.helper, ctx, side);
}

// --- Tresse à dessouder ------------------------------------------------------------------------

interface BraidRig {
  wick: THREE.Material & { color: THREE.Color };
  helper: THREE.Object3D;
}

const braidRigs = new WeakMap<THREE.Object3D, BraidRig>();
const BRAID_WIDTH = 0.0026;
const BRAID_THICKNESS = 0.0003;
const WICK_LENGTH = 0.006;
const COPPER = new THREE.Color(0xc98356);
const SOAKED = new THREE.Color(0xb8bcc0);

function hasColor(m: THREE.Material): m is THREE.Material & { color: THREE.Color } {
  return 'color' in m && (m as { color?: unknown }).color instanceof THREE.Color;
}

/** Ruban de tresse le long d'une courbe, de l'abscisse u0 à u1 (largeur selon Z). */
function ribbon(
  curve: THREE.Curve<THREE.Vector3>,
  u0: number,
  u1: number,
  steps: number,
): THREE.BufferGeometry {
  const Z = new THREE.Vector3(0, 0, 1);
  const frames: SweepFrame[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = THREE.MathUtils.lerp(u0, u1, i / steps);
    const origin = curve.getPointAt(u);
    const tangent = curve.getTangentAt(u).normalize();
    frames.push({
      origin,
      tangent,
      u: new THREE.Vector3().crossVectors(tangent, Z).normalize(),
      v: Z.clone(),
    });
  }
  return sweepPolygon(rectangle(BRAID_THICKNESS, BRAID_WIDTH), frames);
}

export function buildDesolderBraid(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Tresse à dessouder');
  const braid = toolGroup('tresse');
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.003, BRAID_THICKNESS / 2, 0),
    new THREE.Vector3(-0.004, BRAID_THICKNESS / 2, 0),
    new THREE.Vector3(-0.012, 0.0022, 0),
    new THREE.Vector3(-0.022, 0.012, 0),
    new THREE.Vector3(-0.03, 0.022, 0),
    new THREE.Vector3(-0.034, 0.027, 0),
  ]);
  const uWick = WICK_LENGTH / curve.getLength();
  const wickMaterial = ctx.materials.variant('copper.bare', { color: COPPER, name: 'outil/tresse imbibée' });
  if (!hasColor(wickMaterial)) throw new Error('Tresse : matériau cuivre sans couleur.');
  braid.add(toolMesh(ribbon(curve, 0, uWick, 6), wickMaterial, 'extrémité imbibée'));
  braid.add(toolMesh(ribbon(curve, uWick, 1, 40), mats.copper(), 'tresse cuivre'));
  // Bobine distributrice (axe Z), fenêtre laissant voir la tresse enroulée.
  const spool = toolGroup('bobine');
  const body = revolve(
    [
      [0, -0.0056],
      [0.0148, -0.0056],
      [0.0161, -0.0043],
      [0.0161, 0.0043],
      [0.0148, 0.0056],
      [0.0115, 0.0056],
      [0.0115, 0.0035],
    ],
    64,
  );
  const coil = revolve(
    [
      [0.0115, 0.0035],
      [0.0045, 0.0035],
    ],
    64,
  );
  const hub = revolve(
    [
      [0.0045, 0.0035],
      [0.0045, 0.006],
      [0, 0.006],
    ],
    32,
  );
  for (const geo of [body, coil, hub]) geo.rotateX(Math.PI / 2);
  spool.add(
    toolMesh(body, mats.plastic(TOOL_COLORS.green, 0.35), 'bobine'),
    toolMesh(coil, mats.copper(), 'tresse enroulée'),
    toolMesh(hub, mats.plastic(TOOL_COLORS.green, 0.35), 'moyeu'),
  );
  spool.position.set(-0.046, 0.038, 0);
  braid.add(spool);
  const helper = toolGroup('fer d’appoint', buildIronParts(mats));
  helper.visible = false;
  root.add(braid, helper);
  braidRigs.set(root, { wick: wickMaterial, helper });
  return root;
}

/** Tresse posée sur la soudure, pressée par le fer ; l'extrémité s'imbibe d'étain. */
export function animateDesolderBraid(tool: THREE.Object3D, state: ToolAnimState): void {
  const rig = braidRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const m = motionProgress(ctx);
  const end = meltEnd(state.motion);
  const soak = smoothstep((m - end * 0.1) / (end * 0.8));
  rig.wick.color.lerpColors(COPPER, SOAKED, state.direction === 1 ? soak : 0);
  rig.helper.visible = ctx.helpersVisible;
  // Fer sur la tresse, à l'aplomb de la soudure.
  const contact = smoothstep((ctx.approachK - 0.65) / 0.35) * (1 - ctx.retractK);
  leanQuaternion(rig.helper.quaternion, 1, -0.25, 0.85);
  rig.helper.position.set(
    0.0008 + tremor(ctx.seconds, 0.00003 * contact),
    BRAID_THICKNESS - 0.00006 * contact + tremor(ctx.seconds * 1.2, 0.00002 * contact),
    0,
  );
}

// --- Station à air chaud -----------------------------------------------------------------------

export function buildHotAir(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Station à air chaud');
  root.add(
    toolMesh(
      revolve(
        [
          [0, 0.003],
          [0.0029, 0.003],
          [0.0029, 0],
          [0.0034, 0],
          [0.0036, 0.0004],
          [0.0036, 0.02],
          [0.0045, 0.023],
          [0.0108, 0.036],
          [0.0112, 0.038],
        ],
        48,
      ),
      mats.stainless(),
      'buse',
    ),
  );
  root.add(
    toolMesh(
      revolve(
        [
          [0.0112, 0.0378],
          [0.0114, 0.039],
          [0.0114, 0.085],
        ],
        72,
        { lobes: 12, lobeDepth: 0.05, lobeSharpness: 4, lobeRange: [0.045, 0.08], lobeFade: 0.003 },
      ),
      mats.stainless(),
      'tube chauffant',
    ),
  );
  root.add(
    toolMesh(
      revolve(
        [
          [0.0112, 0.0848],
          [0.0132, 0.086],
          [0.0135, 0.095],
          [0.013, 0.0962],
        ],
        48,
      ),
      mats.plastic(TOOL_COLORS.black, 0.4),
      'collerette',
    ),
  );
  root.add(
    toolMesh(
      revolve(
        [
          [0.013, 0.096],
          [0.0148, 0.11],
          [0.0158, 0.15],
          [0.0155, 0.2],
          [0.0138, 0.235],
          [0.011, 0.245],
          [0.0062, 0.2505],
          [0.0045, 0.251],
        ],
        64,
        { lobes: 8, lobeDepth: 0.06, lobeSharpness: 3, lobeRange: [0.105, 0.235], lobeFade: 0.008 },
      ),
      mats.plastic(TOOL_COLORS.charcoal, 0.5),
      'manche',
    ),
  );
  root.add(
    toolMesh(
      cableGeometry(new THREE.Vector3(0, 0.249, 0), [
        [0, 0.27, 0],
        [0.01, 0.31, -0.012],
        [0.04, 0.342, -0.035],
        [0.085, 0.352, -0.065],
        [0.13, 0.34, -0.1],
      ]),
      mats.cable(),
      'câble',
    ),
  );
  return root;
}

/** Air chaud : buse à 5 mm, petits cercles pendant la chauffe, recul pendant la levée. */
export function animateHotAir(tool: THREE.Object3D, state: ToolAnimState): void {
  const ctx = rigContext(tool);
  const side = sideSign(ctx);
  const m = motionProgress(ctx);
  const end = meltEnd(state.motion);
  const heat = smoothstep(m / 0.08) * (1 - smoothstep((m - end) / 0.1));
  const radius = clamp(0.0012 + 0.25 * ctx.halfX, 0.0012, 0.004) * heat;
  const w = 2 * Math.PI * 1.3 * ctx.seconds;
  leanQuaternion(tool.quaternion, side, -0.3, 0.2);
  _v.set(
    radius * Math.cos(w),
    0.005 + 0.003 * smoothstep((m - end) / 0.3) - ctx.travel,
    radius * Math.sin(w),
  );
  tool.position.copy(_v);
}
