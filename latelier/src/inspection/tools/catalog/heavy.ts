/**
 * Outils d'effort : extracteur de roulements à deux griffes, presse à crémaillère (à main) et
 * maillet à embouts.
 *
 * - Extracteur : traverse à bossage fileté, griffes coulissantes qui s'adaptent au diamètre de la
 *   pièce, vis de poussée filetée en hélice avec barre de manœuvre. Pendant l'extraction, la
 *   traverse et les griffes suivent le roulement ; la vis, en appui sur l'arbre, reste immobile
 *   dans le monde et tourne au pas du filet (1 mm).
 * - Presse : coulisseau carré à crémaillère et poussoir, tête et colonne en fonte peinte, levier à
 *   boule. Le bâti reste immobile, le coulisseau suit la pièce et le levier tourne d'un angle
 *   course / rayon primitif du pignon. Au démontage, le poussoir appuie sur la face ARRIÈRE de
 *   la pièce (il la chasse vers sa sortie) ; au remontage, sur sa face avant.
 * - Maillet : tête à embouts caoutchouc/nylon, manche bois ; trois frappes pivotant au poignet.
 */
import * as THREE from 'three/webgpu';
import type { ToolAnimState, ToolBuildContext } from '../../../objects/types';
import { easeInQuad, easeOutQuad, smoothstep } from '../../easing';
import { createBevelledBox } from '../../../materials/geometry/bevelledBox';
import { AXIS_X, AXIS_Y, AXIS_Z, clamp, toolGroup, toolMesh, toolRoot } from './common';
import { cylinder, hexagon, merge, revolve, sweepPolygon, tubeAlong, type ProfilePoint } from './geometry';
import { TOOL_COLORS, toolMaterials } from './materials';
import { motionProgress, rigContext } from './rig';

/** Prisme droit (axe Y) de section polygonale, de y0 à y1. */
function prism(poly: THREE.Vector2[], y0: number, y1: number): THREE.BufferGeometry {
  const t = new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3(1, 0, 0);
  const v = new THREE.Vector3(0, 0, -1);
  return sweepPolygon(poly, [
    { origin: new THREE.Vector3(0, y0, 0), tangent: t, u, v },
    { origin: new THREE.Vector3(0, y1, 0), tangent: t, u, v },
  ]);
}

// --- Extracteur de roulements ------------------------------------------------------------------

const PULLER_LEG = 0.05;
const PULLER_PITCH = 0.001;

interface PullerRig {
  screw: THREE.Object3D;
  yoke: THREE.Object3D;
  right: THREE.Object3D;
  left: THREE.Object3D;
}

const pullerRigs = new WeakMap<THREE.Object3D, PullerRig>();

/** Vis de poussée M6 : pointe conique, filet hélicoïdal (pas 1 mm), tête six pans. */
function pullerScrewGeometry(): THREE.BufferGeometry {
  const r = 0.003;
  const profile: ProfilePoint[] = [
    [0, 0],
    [0.0009, 0.0004],
    [r, 0.0024],
  ];
  const top = 0.062;
  for (let y = 0.0026; y <= top; y += PULLER_PITCH / 4) profile.push([r, y]);
  profile.push([r, top]);
  return revolve(profile, 16, {
    // Filet à droite : crête en y = pas × θ / 2π (hélice), estompé sur la pointe.
    radial: (theta, y) =>
      1 -
      0.12 *
        (0.5 + 0.5 * Math.cos((2 * Math.PI * y) / PULLER_PITCH - theta)) *
        smoothstep((y - 0.0024) / 0.001),
  });
}

export function buildBearingPuller(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Extracteur de roulements à deux griffes');
  // Vis (origine = pointe).
  const screw = toolGroup('vis');
  screw.add(toolMesh(pullerScrewGeometry(), mats.blackOxide(), 'tige filetée'));
  screw.add(toolMesh(prism(hexagon(0.01), 0.062, 0.069), mats.blackOxide(), 'tête'));
  const bar = cylinder(0.0021, -0.035, 0.035, 16);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, 0.0655, 0);
  screw.add(toolMesh(bar, mats.polished(), 'barre de manœuvre'));
  // Traverse (origine = axe de la vis, à mi-hauteur).
  const yoke = toolGroup('traverse');
  yoke.add(toolMesh(createBevelledBox(0.074, 0.011, 0.012, { radius: 0.0015 }), mats.chrome(), 'traverse'));
  yoke.add(toolMesh(prism(hexagon(0.017), -0.0085, 0.0085), mats.chrome(), 'bossage'));
  // Griffes (origine = axe d'articulation sur la traverse).
  const leg = (side: 1 | -1): THREE.Group => {
    const g = toolGroup(side === 1 ? 'griffe droite' : 'griffe gauche');
    const body = createBevelledBox(0.005, PULLER_LEG + 0.006, 0.009, { radius: 0.0012 });
    body.translate(0, -PULLER_LEG / 2 + 0.003, 0);
    const hook = createBevelledBox(0.0055, 0.003, 0.009, { radius: 0.0008 });
    hook.translate(-side * 0.0025, -PULLER_LEG - 0.0015, 0);
    const pin = cylinder(0.0019, -0.0058, 0.0058, 16);
    pin.rotateX(Math.PI / 2);
    g.add(
      toolMesh(body, mats.chrome(), 'bras'),
      toolMesh(hook, mats.chrome(), 'crochet'),
      toolMesh(pin, mats.polished(), 'axe'),
    );
    return g;
  };
  const right = leg(1);
  const left = leg(-1);
  root.add(screw, yoke, right, left);
  pullerRigs.set(root, { screw, yoke, right, left });
  return root;
}

const _q = new THREE.Quaternion();

/**
 * Extracteur : griffes ouvertes à l'approche puis serrées sous la pièce ; pendant la sortie,
 * traverse et griffes suivent la pièce tandis que la vis, en appui, tourne sur place.
 */
export function animateBearingPuller(tool: THREE.Object3D, _state: ToolAnimState): void {
  const rig = pullerRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const depth = clamp(ctx.depth, 0.001, PULLER_LEG - 0.01);
  const yokeY = -depth + PULLER_LEG;
  const xLeg = clamp(ctx.halfX + 0.0025, 0.0055, 0.034);
  rig.yoke.position.set(0, yokeY, 0);
  const open = clamp(1 - smoothstep((ctx.approachK - 0.45) / 0.55) + smoothstep(ctx.retractK / 0.5), 0, 1);
  rig.right.position.set(xLeg, yokeY, 0);
  rig.left.position.set(-xLeg, yokeY, 0);
  rig.right.rotation.set(0, 0, 0.32 * open);
  rig.left.rotation.set(0, 0, -0.32 * open);
  // Vis : immobile dans le monde (compense le déplacement de la pièce), rayon adapté à l'alésage.
  const radius = clamp((0.28 * ctx.halfX) / 0.003, 0.25, 1.2);
  rig.screw.scale.set(radius, 1, radius);
  rig.screw.position.set(0, -depth - ctx.travel, 0);
  // Filet à droite : la vis avance vers −Y en tournant dans le sens horaire vu de dessus.
  const approachTurns = 1.5 * (1 - smoothstep(ctx.approachK));
  rig.screw.quaternion.setFromAxisAngle(
    AXIS_Y,
    (-2 * Math.PI * ctx.travel) / PULLER_PITCH + approachTurns * 2 * Math.PI,
  );
}

// --- Presse à main ------------------------------------------------------------------------------

const PRESS_HEAD_Y = 0.13;
const PINION_RADIUS = 0.012;
const LEVER_REST = -0.5;

interface PressRig {
  frame: THREE.Object3D;
  lever: THREE.Object3D;
}

const pressRigs = new WeakMap<THREE.Object3D, PressRig>();

export function buildArborPress(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Presse à crémaillère');
  // Coulisseau (origine = face du poussoir).
  const ram = toolGroup('coulisseau');
  ram.add(
    toolMesh(
      revolve(
        [
          [0, 0],
          [0.0034, 0],
          [0.0034, 0],
          [0.004, 0.0006],
          [0.004, 0.013],
        ],
        32,
      ),
      mats.polished(),
      'poussoir',
    ),
  );
  const bar = createBevelledBox(0.016, 0.2, 0.016, { radius: 0.0012, faceSegments: 2 });
  bar.translate(0, 0.112, 0);
  ram.add(toolMesh(bar, mats.chrome(), 'barre'));
  const teeth: THREE.BufferGeometry[] = [];
  for (let y = 0.02; y < 0.205; y += 0.004) {
    const tooth = new THREE.BoxGeometry(0.012, 0.0019, 0.002);
    tooth.translate(0, y, -0.0089);
    teeth.push(tooth);
  }
  ram.add(toolMesh(merge(teeth), mats.chrome(), 'crémaillère'));
  // Bâti (tête, colonne, pignon, levier), immobile dans le monde pendant le geste.
  const frame = toolGroup('bâti');
  const cast = mats.castIron(TOOL_COLORS.castTeal);
  const head = createBevelledBox(0.08, 0.075, 0.072, { radius: 0.006, bevelSegments: 3, faceSegments: 3 });
  head.translate(0, PRESS_HEAD_Y, -0.012);
  frame.add(toolMesh(head, cast, 'tête'));
  // Colonne (tronquée au niveau du poussoir : table et socle ne sont pas représentés).
  const column = createBevelledBox(0.05, 0.16, 0.034, { radius: 0.005, bevelSegments: 3, faceSegments: 4 });
  column.translate(0, PRESS_HEAD_Y - 0.045, -0.066);
  frame.add(toolMesh(column, cast, 'colonne'));
  const hub = cylinder(0.013, 0.04, 0.054, 32);
  hub.rotateZ(-Math.PI / 2);
  hub.translate(0, PRESS_HEAD_Y, 0);
  frame.add(toolMesh(hub, mats.chrome(), 'moyeu'));
  const lever = toolGroup('levier');
  lever.position.set(0.049, PRESS_HEAD_Y, 0);
  lever.add(toolMesh(cylinder(0.005, 0, 0.21, 20), mats.chrome(), 'bras de levier'));
  const knob = revolve(
    [
      [0, 0.199],
      [0.006, 0.2],
      [0.0105, 0.206],
      [0.0112, 0.213],
      [0.0095, 0.221],
      [0.005, 0.2248],
      [0, 0.225],
    ],
    32,
  );
  lever.add(toolMesh(knob, mats.plastic(TOOL_COLORS.black, 0.35), 'boule'));
  frame.add(lever);
  root.add(ram, frame);
  pressRigs.set(root, { frame, lever });
  return root;
}

/**
 * Presse : démontage — outil retourné, poussoir sur la face arrière (profondeur de la pièce),
 * la pièce est chassée vers sa sortie ; remontage — poussoir sur la face avant.
 */
export function animateArborPress(tool: THREE.Object3D, state: ToolAnimState): void {
  const rig = pressRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const flipped = state.direction === 1;
  if (flipped) {
    tool.quaternion.setFromAxisAngle(AXIS_Z, Math.PI);
    tool.position.set(0, -ctx.depth, 0);
  }
  // Bâti immobile : compense le déplacement du montage (repère du modèle éventuellement retourné).
  rig.frame.position.set(0, flipped ? ctx.travel : -ctx.travel, 0);
  const advance = ctx.travel * state.direction;
  const m = motionProgress(ctx);
  const creep = state.motion === 'pressOut' ? 0.07 * smoothstep(m / 0.35) : 0;
  rig.lever.quaternion.setFromAxisAngle(AXIS_X, LEVER_REST - advance / PINION_RADIUS - creep);
}

// --- Maillet ------------------------------------------------------------------------------------

const MALLET_PIVOT = new THREE.Vector3(0.25, 0.029, 0);
const MALLET_STRIKES = [0.28, 0.56, 0.84] as const;

export function buildMallet(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Maillet à embouts');
  root.add(
    toolMesh(
      revolve(
        [
          [0, 0],
          [0.0128, 0],
          [0.0152, 0.0012],
          [0.0162, 0.0038],
          [0.0162, 0.012],
          [0.0158, 0.012],
        ],
        48,
      ),
      mats.rubber(TOOL_COLORS.black),
      'embout caoutchouc',
    ),
  );
  root.add(
    toolMesh(
      revolve(
        [
          [0.0158, 0.0118],
          [0.0168, 0.0125],
          [0.0168, 0.0455],
          [0.0158, 0.0462],
        ],
        48,
      ),
      mats.castIron(TOOL_COLORS.castTeal),
      'tête',
    ),
  );
  root.add(
    toolMesh(
      revolve(
        [
          [0.0158, 0.046],
          [0.0162, 0.046],
          [0.0162, 0.054],
          [0.0152, 0.0566],
          [0.0128, 0.0578],
          [0, 0.0578],
        ],
        48,
      ),
      mats.nylon(),
      'embout nylon',
    ),
  );
  const handle = tubeAlong(
    new THREE.LineCurve3(new THREE.Vector3(0.012, 0.029, 0), new THREE.Vector3(0.275, 0.029, 0)),
    {
      radius: (u) => {
        const body = 0.0098 + 0.0032 * smoothstep((u - 0.2) / 0.55);
        return u > 0.96 ? body * Math.sqrt(Math.max(0, 1 - ((u - 0.96) / 0.04) ** 2)) : body;
      },
      tubularSegments: 36,
      radialSegments: 20,
      aspect: 0.85,
      up: new THREE.Vector3(0, 0, 1),
    },
  );
  root.add(toolMesh(handle, mats.wood(), 'manche'));
  return root;
}

/** Instants des frappes (progression du mouvement de la pièce). */
export const malletStrikes = (): readonly number[] => MALLET_STRIKES;

const _p = new THREE.Vector3();

/** Maillet : trois frappes, le poignet (près du bout du manche) servant de pivot. */
export function animateMallet(tool: THREE.Object3D, _state: ToolAnimState): void {
  const ctx = rigContext(tool);
  const m = motionProgress(ctx);
  const period = MALLET_STRIKES[0];
  let raise = 0;
  if (m > 0 && m < MALLET_STRIKES[2]) {
    const p = (m % period) / period;
    raise = 0.55 * (p < 0.62 ? easeOutQuad(p / 0.62) : 1 - easeInQuad((p - 0.62) / 0.38));
  }
  _q.setFromAxisAngle(AXIS_Z, -raise);
  tool.quaternion.copy(_q);
  _p.copy(MALLET_PIVOT).applyQuaternion(_q);
  tool.position.copy(MALLET_PIVOT).sub(_p);
}
