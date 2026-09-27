/**
 * Pinces : plate (bec long), à circlips (becs droits à ergots, ouverture par serrage) et coupante
 * diagonale. Deux demi-pinces articulées sur un rivet (joint à recouvrement), mors en acier
 * chromé effilés, poignées gainées. Pointe (milieu des mors) à l'origine, pince vers +Y, plan
 * de la pince = XY (ouverture selon X).
 *
 * Gestes : pince plate — serrage puis traction dans l'axe avec un léger dandinement ; pince à
 * circlips — ergots dans les œillets, écartement, puis dégagement ; coupante — mors ouverts
 * autour du fil, fermeture sèche à l'instant de la coupe.
 *
 * Approximation : l'ouverture des mors est calée sur la boîte englobante de la pièce (largeur
 * perpendiculaire à l'axe), les ergots de la pince à circlips visent des œillets supposés à mi-rayon.
 */
import * as THREE from 'three/webgpu';
import type { ToolAnimState, ToolBuildContext } from '../../../objects/types';
import { smoothstep } from '../../easing';
import { AXIS_Y, clamp, toolGroup, toolMesh, toolRoot, tremor } from './common';
import { cylinder, extrudeOutline, mirrorX, tubeAlong } from './geometry';
import { TOOL_COLORS, toolMaterials } from './materials';
import { motionProgress, rigContext } from './rig';
import { motionTiming } from '../../motions';

interface PliersSpec {
  name: string;
  /** Hauteur de l'axe d'articulation (m). */
  pivotY: number;
  /** Épaisseur des mors (Z). */
  depth: number;
  /** Contour du mors droit (x ≥ 0), pointe vers y = 0. */
  jaw: readonly [number, number][];
  jawThickness: (x: number, y: number) => number;
  jointR: number;
  /** Poignée du côté opposé au mors (pinces classiques) ou du même côté (pince à circlips). */
  crossed: boolean;
  /** Points de la poignée droite (x > 0 : poignée non croisée). */
  handle: readonly [number, number][];
  gripColor: number;
  /** Ergots de pince à circlips : rayon, longueur, abscisse. */
  pins?: { r: number; length: number; x: number };
}

interface PliersRig {
  right: THREE.Object3D;
  left: THREE.Object3D;
  pivotY: number;
  /** Abscisse de repos d'une pointe (ergot ou face de mors). */
  tipX: number;
}

const pliersRigs = new WeakMap<THREE.Object3D, PliersRig>();

function buildPliers(ctx: ToolBuildContext, spec: PliersSpec): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot(spec.name);
  const steel = mats.chrome();
  const grip = mats.plastic(spec.gripColor, 0.45);
  // Géométries de la demi-pince droite, exprimées relativement à l'articulation.
  const jawGeo = extrudeOutline(
    spec.jaw.map(([x, y]) => new THREE.Vector2(x, y)),
    { depth: spec.depth, bevel: 0.00035, bevelSegments: 2, thickness: spec.jawThickness },
  );
  jawGeo.translate(0, -spec.pivotY, 0);
  const discGeo = cylinder(spec.jointR, -spec.depth / 2, 0, 40);
  discGeo.rotateX(Math.PI / 2); // axe Z, z ∈ [−depth/2, 0]
  const curve = new THREE.CatmullRomCurve3(
    spec.handle.map(([x, y]) => new THREE.Vector3(spec.crossed ? -x : x, y - spec.pivotY, 0)),
  );
  const gripGeo = tubeAlong(curve, {
    radius: (u) => {
      const body = 0.0036 + 0.0024 * smoothstep(u / 0.3);
      return u > 0.9 ? body * Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) : body;
    },
    tubularSegments: 40,
    radialSegments: 20,
    aspect: 0.78,
    ribs: 14,
    ribDepth: 0.03,
    up: new THREE.Vector3(0, 0, 1),
  });
  const rivetGeo = cylinder(spec.jointR * 0.36, -spec.depth / 2 - 0.0004, spec.depth / 2 + 0.0004, 24);
  rivetGeo.rotateX(Math.PI / 2);
  const pinGeo = spec.pins ? cylinder(spec.pins.r, 0, spec.pins.length, 16) : null;
  if (pinGeo && spec.pins) pinGeo.translate(spec.pins.x, -spec.pivotY, 0);

  const half = (side: 1 | -1): THREE.Group => {
    const g = toolGroup(side === 1 ? 'demi-pince droite' : 'demi-pince gauche');
    g.position.set(0, spec.pivotY, 0);
    const jaw = side === 1 ? jawGeo : mirrorX(jawGeo);
    // Joint à recouvrement : chaque demi-pince occupe une moitié de l'épaisseur.
    const disc = discGeo.clone();
    if (side === 1) disc.translate(0, 0, spec.depth / 2);
    const handleGeo = side === 1 ? gripGeo : mirrorX(gripGeo);
    g.add(
      toolMesh(jaw, steel, 'mors'),
      toolMesh(disc, steel, 'articulation'),
      toolMesh(handleGeo, grip, 'gaine'),
    );
    if (pinGeo) g.add(toolMesh(side === 1 ? pinGeo : mirrorX(pinGeo), steel, 'ergot'));
    return g;
  };
  const right = half(1);
  const left = half(-1);
  right.add(toolMesh(rivetGeo, mats.polished(), 'rivet'));
  root.add(right, left);
  discGeo.dispose();
  pliersRigs.set(root, {
    right,
    left,
    pivotY: spec.pivotY,
    tipX: spec.pins ? spec.pins.x : 0,
  });
  return root;
}

// --- Définitions ----------------------------------------------------------------------------

export const buildFlatPliers = (ctx: ToolBuildContext): THREE.Object3D =>
  buildPliers(ctx, {
    name: 'Pince plate à bec long',
    pivotY: 0.047,
    depth: 0.0085,
    jaw: [
      [0, 0.0002],
      [0.0017, 0],
      [0.0021, 0.0025],
      [0.0034, 0.02],
      [0.0048, 0.034],
      [0.0074, 0.042],
      [0.0074, 0.045],
      [0, 0.045],
    ],
    jawThickness: (_x, y) => THREE.MathUtils.lerp(0.47, 1, smoothstep(y / 0.036)),
    jointR: 0.0085,
    crossed: true,
    handle: [
      [0.002, 0.052],
      [0.007, 0.07],
      [0.012, 0.095],
      [0.0155, 0.12],
      [0.016, 0.148],
    ],
    gripColor: TOOL_COLORS.red,
  });

export const buildCirclipPliers = (ctx: ToolBuildContext): THREE.Object3D =>
  buildPliers(ctx, {
    name: 'Pince à circlips extérieurs',
    pivotY: 0.042,
    depth: 0.006,
    jaw: [
      [0.0006, 0.0034],
      [0.002, 0.0034],
      [0.0036, 0.022],
      [0.0064, 0.036],
      [0.0064, 0.04],
      [0.0001, 0.04],
      [0.0001, 0.03],
    ],
    jawThickness: (_x, y) => THREE.MathUtils.lerp(0.5, 1, smoothstep(y / 0.03)),
    jointR: 0.0072,
    crossed: false,
    handle: [
      [0.0025, 0.047],
      [0.0075, 0.064],
      [0.012, 0.088],
      [0.015, 0.113],
      [0.0155, 0.138],
    ],
    gripColor: TOOL_COLORS.blue,
    pins: { r: 0.00055, length: 0.0045, x: 0.0013 },
  });

export const buildFlushCutter = (ctx: ToolBuildContext): THREE.Object3D =>
  buildPliers(ctx, {
    name: 'Pince coupante diagonale',
    pivotY: 0.024,
    depth: 0.0095,
    jaw: [
      [0, 0.0001],
      [0.0014, 0.0003],
      [0.0048, 0.0035],
      [0.0075, 0.009],
      [0.0094, 0.015],
      [0.0094, 0.02],
      [0, 0.02],
    ],
    // Biseau du tranchant (face interne x = 0) et effilement vers la pointe.
    jawThickness: (x, y) =>
      THREE.MathUtils.lerp(0.3, 1, smoothstep(x / 0.0022)) *
      THREE.MathUtils.lerp(0.72, 1, smoothstep(y / 0.012)),
    jointR: 0.0095,
    crossed: true,
    handle: [
      [0.0025, 0.03],
      [0.008, 0.046],
      [0.0125, 0.07],
      [0.016, 0.095],
      [0.017, 0.122],
    ],
    gripColor: TOOL_COLORS.orange,
  });

// --- Animations -----------------------------------------------------------------------------

/** Angle d'ouverture (rad) amenant une pointe située à `tipX` au repos jusqu'à `x`. */
function openingFor(rig: PliersRig, x: number): number {
  return Math.asin(clamp((x - rig.tipX) / rig.pivotY, -0.6, 0.6));
}

function setOpening(rig: PliersRig, angle: number): void {
  rig.right.rotation.set(0, 0, angle);
  rig.left.rotation.set(0, 0, -angle);
}

/** Contact des mors : serrage en fin d'approche, desserrage au début du retrait. */
function contactOf(approachK: number, retractK: number): number {
  return smoothstep((approachK - 0.55) / 0.45) * (1 - smoothstep(retractK / 0.35));
}

/** Pince plate : serre la pièce par ses flancs puis la tire dans l'axe (léger dandinement). */
export function animateFlatPliers(tool: THREE.Object3D, _state: ToolAnimState): void {
  const rig = pliersRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const contact = contactOf(ctx.approachK, ctx.retractK);
  const open = ctx.halfX + 0.0016;
  const grip = Math.max(0, ctx.halfX - 0.00005);
  setOpening(rig, openingFor(rig, THREE.MathUtils.lerp(open, grip, contact)));
  const m = motionProgress(ctx);
  const wiggle =
    0.06 *
    Math.sin(2 * Math.PI * 2.1 * ctx.seconds) *
    smoothstep(m / 0.1) *
    (1 - smoothstep((m - 0.35) / 0.2));
  tool.quaternion.setFromAxisAngle(AXIS_Y, wiggle);
  tool.position.set(0, -clamp(ctx.depth * 0.6, 0.0006, 0.007), 0);
}

/** Pince à circlips : ergots dans les œillets, écartement du circlip, dégagement. */
export function animateCirclipPliers(tool: THREE.Object3D, _state: ToolAnimState): void {
  const rig = pliersRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const contact = contactOf(ctx.approachK, ctx.retractK);
  const target = clamp(ctx.halfX * 0.55, 0.0009, 0.014);
  const m = motionProgress(ctx);
  const spread = smoothstep(m / 0.3) * (1 - smoothstep(ctx.retractK / 0.5));
  const x =
    THREE.MathUtils.lerp(rig.tipX, target, smoothstep((ctx.approachK - 0.3) / 0.5)) * (1 + 0.45 * spread);
  setOpening(rig, openingFor(rig, x));
  tool.position.set(0, -0.0006 * contact, 0);
}

/** Coupante : mors ouverts autour du fil, fermeture sèche à l'instant de la coupe. */
export function animateCutter(tool: THREE.Object3D, state: ToolAnimState): void {
  const rig = pliersRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const cutAt = state.motion === 'cut' ? motionTiming({ motion: 'cut', distance: 0 }).a : 0.2;
  const closeAt = ctx.approachSeconds + cutAt * ctx.motionSeconds;
  const close = smoothstep((ctx.seconds - closeAt + 0.07) / 0.07);
  const open = Math.max(0.12, openingFor(rig, ctx.halfX + 0.0012));
  setOpening(rig, open * (1 - close));
  // Effort avant la coupe : tremblement du poignet.
  const effort = smoothstep((ctx.seconds - closeAt + 0.4) / 0.35) * (1 - close);
  tool.position.set(tremor(ctx.seconds, 0.00005 * effort), -clamp(ctx.depth * 0.5, 0.0004, 0.004), 0);
}
