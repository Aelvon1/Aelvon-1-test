/**
 * Préhension et petits outils à main : brucelles, extracteur de circuits intégrés (U en acier à
 * ressort à crochets), scalpel (manche n° 3, lame à ventre n° 10), levier plastique (spudger) et
 * « à la main » (deux bouts de doigts gantés, stylisés, qui s'effacent vers la main).
 *
 * Gestes :
 * - brucelles : becs ouverts à l'approche, serrage sur les flancs de la pièce, levée AVEC la pièce
 *   (suivi rigide), relâchement en fin de course ;
 * - extracteur de CI : crochets glissés sous les extrémités du boîtier, serrage, levée en
 *   basculant légèrement ;
 * - scalpel : incliné à ~30° de la surface, raclage par petits allers-retours ;
 * - levier : pointe glissée sous le bord, bascule autour d'un point d'appui ;
 * - doigts : pincement de part et d'autre de la pièce, puis accompagnement.
 */
import * as THREE from 'three/webgpu';
import type { ToolAnimState, ToolBuildContext } from '../../../objects/types';
import { smoothstep } from '../../easing';
import { createBevelledBox } from '../../../materials/geometry/bevelledBox';
import { AXIS_Y, AXIS_Z, clamp, leanQuaternion, sideSign, toolGroup, toolMesh, toolRoot } from './common';
import {
  creasedNormals,
  extrudeOutline,
  merge,
  mirrorX,
  rectangle,
  revolve,
  sweepPolygon,
  type SweepFrame,
} from './geometry';
import { TOOL_COLORS, toolMaterials } from './materials';
import { motionProgress, rigContext } from './rig';

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** Contact en fin d'approche, relâché au début du retrait. */
const contactOf = (approachK: number, retractK: number): number =>
  smoothstep((approachK - 0.55) / 0.45) * (1 - smoothstep(retractK / 0.35));

// --- Brucelles ---------------------------------------------------------------------------------

const TWEEZER_LENGTH = 0.115;
const TWEEZER_THICKNESS = 0.0009;

/** Écartement de repos d'une branche (centre de la tôle) selon y. */
function tweezerBow(y: number): number {
  const u = 1 - y / TWEEZER_LENGTH;
  return TWEEZER_THICKNESS / 2 + 0.0056 * Math.sin(Math.PI * u * 0.75) * (1 - 0.35 * u * u);
}

/** Branche droite (tôle de 0,9 mm, largeur selon Z effilée vers la pointe), cintrée au repos. */
function tweezerLeg(): THREE.BufferGeometry {
  const widths: [number, number][] = [
    [0, 0.0004],
    [0.004, 0.0007],
    [0.02, 0.0021],
    [0.05, 0.0042],
    [0.09, 0.0047],
    [TWEEZER_LENGTH - 0.002, 0.0047],
  ];
  const outline = [
    ...widths.map(([y, w]) => v2(w, y)),
    v2(0.0035, TWEEZER_LENGTH),
    v2(-0.0035, TWEEZER_LENGTH),
    ...[...widths].reverse().map(([y, w]) => v2(-w, y)),
  ];
  const g = extrudeOutline(outline, { depth: TWEEZER_THICKNESS, bevel: 0.0002, curveSegments: 4 });
  g.rotateY(Math.PI / 2); // largeur → Z, épaisseur → X
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + tweezerBow(pos.getY(i)));
  return creasedNormals(g, Math.PI / 5);
}

interface TweezerRig {
  right: THREE.Object3D;
  left: THREE.Object3D;
}

const tweezerRigs = new WeakMap<THREE.Object3D, TweezerRig>();

export function buildTweezers(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Brucelles');
  const leg = tweezerLeg();
  leg.translate(0, -TWEEZER_LENGTH, 0);
  const right = toolGroup('branche droite', toolMesh(leg, mats.stainless(), 'branche'));
  const left = toolGroup('branche gauche', toolMesh(mirrorX(leg), mats.stainless(), 'branche'));
  for (const g of [right, left]) g.position.set(0, TWEEZER_LENGTH, 0);
  const joint = createBevelledBox(0.0019, 0.009, 0.0094, { radius: 0.0004 });
  joint.translate(0, TWEEZER_LENGTH - 0.0045, 0);
  root.add(right, left, toolMesh(joint, mats.stainless(), 'soudure des branches'));
  tweezerRigs.set(root, { right, left });
  return root;
}

/** Brucelles : serrage sur les flancs (X du montage = petite largeur), levée avec la pièce. */
export function animateTweezers(tool: THREE.Object3D, _state: ToolAnimState): void {
  const rig = tweezerRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const m = motionProgress(ctx);
  const release = smoothstep((m - 0.9) / 0.1);
  const contact = contactOf(ctx.approachK, ctx.retractK) * (1 - release);
  const rest = tweezerBow(0);
  const grip = Math.max(0.0001, ctx.halfX - 0.00004) + TWEEZER_THICKNESS / 2;
  const open = ctx.halfX + 0.0013 + TWEEZER_THICKNESS / 2;
  const target = THREE.MathUtils.lerp(open, grip, contact);
  const angle = Math.atan2(target - rest, TWEEZER_LENGTH);
  rig.right.rotation.set(0, 0, angle);
  rig.left.rotation.set(0, 0, -angle);
  tool.position.set(0, -clamp(ctx.depth * 0.45, 0.0002, 0.004), 0);
}

// --- Extracteur de circuits intégrés -------------------------------------------------------------

const EXTRACTOR_SPAN = 0.036;
const EXTRACTOR_HEIGHT = 0.055;
const STRIP = 0.0008;
const STRIP_WIDTH = 0.0035;
const HOOK = 0.0018;

interface ExtractorRig {
  right: THREE.Object3D;
  left: THREE.Object3D;
}

const extractorRigs = new WeakMap<THREE.Object3D, ExtractorRig>();

export function buildIcExtractor(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Extracteur de circuits intégrés');
  const x = EXTRACTOR_SPAN / 2;
  // Branche droite + crochet rentrant, relative à son articulation (haut de la branche).
  const arm = extrudeOutline(
    [
      v2(x - STRIP / 2 - HOOK, 0),
      v2(x + STRIP / 2, 0),
      v2(x + STRIP / 2, EXTRACTOR_HEIGHT),
      v2(x - STRIP / 2, EXTRACTOR_HEIGHT),
      v2(x - STRIP / 2, STRIP),
      v2(x - STRIP / 2 - HOOK, STRIP),
    ],
    { depth: STRIP_WIDTH, bevel: 0.00012, bevelSegments: 1 },
  );
  arm.translate(-x, -EXTRACTOR_HEIGHT, 0);
  const right = toolGroup('branche droite', toolMesh(arm, mats.chrome(), 'branche'));
  const left = toolGroup('branche gauche', toolMesh(mirrorX(arm), mats.chrome(), 'branche'));
  right.position.set(x, EXTRACTOR_HEIGHT, 0);
  left.position.set(-x, EXTRACTOR_HEIGHT, 0);
  // Boucle ressort (demi-cercle).
  const Z = new THREE.Vector3(0, 0, 1);
  const frames: SweepFrame[] = [];
  for (let i = 0; i <= 32; i++) {
    const phi = Math.PI * (1 - i / 32);
    const tangent = new THREE.Vector3(Math.sin(phi), -Math.cos(phi), 0);
    frames.push({
      origin: new THREE.Vector3(x * Math.cos(phi), EXTRACTOR_HEIGHT + x * Math.sin(phi), 0),
      tangent,
      u: new THREE.Vector3().crossVectors(tangent, Z).normalize(),
      v: Z.clone(),
    });
  }
  root.add(
    right,
    left,
    toolMesh(sweepPolygon(rectangle(STRIP, STRIP_WIDTH), frames), mats.chrome(), 'boucle'),
  );
  extractorRigs.set(root, { right, left });
  return root;
}

/** Extracteur de CI : crochets sous les extrémités (X du montage = grande longueur du boîtier). */
export function animateIcExtractor(tool: THREE.Object3D, _state: ToolAnimState): void {
  const rig = extractorRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const contact = contactOf(ctx.approachK, ctx.retractK);
  const grip = ctx.halfX + STRIP / 2;
  const open = grip + HOOK + 0.0012;
  const target = THREE.MathUtils.lerp(open, grip, contact);
  const angle = Math.asin(clamp((target - EXTRACTOR_SPAN / 2) / EXTRACTOR_HEIGHT, -0.4, 0.4));
  rig.right.rotation.set(0, 0, angle);
  rig.left.rotation.set(0, 0, -angle);
  const m = motionProgress(ctx);
  const rock =
    0.035 *
    Math.sin(2 * Math.PI * 1.1 * ctx.seconds) *
    smoothstep((m - 0.05) / 0.1) *
    (1 - smoothstep((m - 0.6) / 0.2));
  tool.quaternion.setFromAxisAngle(AXIS_Z, rock);
  tool.position.set(0, -clamp(ctx.depth * 0.5, 0.0003, 0.004), 0);
}

// --- Scalpel -----------------------------------------------------------------------------------

export function buildScalpel(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Scalpel');
  const handle = extrudeOutline(
    [
      v2(-0.0018, 0.022),
      v2(0.0018, 0.022),
      v2(0.0028, 0.031),
      v2(0.0045, 0.05),
      v2(0.0045, 0.14),
      v2(0.0038, 0.1465),
      v2(0, 0.149),
      v2(-0.0038, 0.1465),
      v2(-0.0045, 0.14),
      v2(-0.0045, 0.05),
      v2(-0.0028, 0.031),
    ],
    { depth: 0.0026, bevel: 0.0004 },
  );
  root.add(toolMesh(handle, mats.stainless(), 'manche'));
  const ribs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const rib = new THREE.BoxGeometry(0.0089, 0.0007, 0.0029);
    rib.translate(0, 0.055 + i * 0.0024, 0);
    ribs.push(rib);
  }
  root.add(toolMesh(merge(ribs), mats.chrome(), 'moletage'));
  const blade = extrudeOutline(
    [
      v2(-0.0031, 0.0028),
      v2(-0.0022, 0.0008),
      v2(-0.0011, 0.0001),
      v2(0, 0),
      v2(0.0014, 0.0003),
      v2(0.0028, 0.0014),
      v2(0.0039, 0.0036),
      v2(0.0045, 0.008),
      v2(0.0044, 0.017),
      v2(0.0036, 0.027),
      v2(0.0012, 0.031),
      v2(-0.0016, 0.031),
      v2(-0.0029, 0.026),
      v2(-0.0034, 0.012),
      v2(-0.0034, 0.0045),
    ],
    { depth: 0.0004, bevel: 0.00005, bevelSegments: 1, crease: Math.PI / 4 },
  );
  root.add(toolMesh(blade, mats.polished(), 'lame n° 10'));
  return root;
}

/** Scalpel : incliné, ventre de la lame au contact, allers-retours de raclage. */
export function animateScalpel(tool: THREE.Object3D, _state: ToolAnimState): void {
  const ctx = rigContext(tool);
  const side = sideSign(ctx);
  const m = motionProgress(ctx);
  const work = smoothstep(m / 0.08) * (1 - smoothstep((m - 0.88) / 0.12));
  const amplitude = clamp(ctx.halfX * 0.5, 0.0005, 0.003) * work;
  leanQuaternion(tool.quaternion, side, 0, 1.0);
  const contact = contactOf(ctx.approachK, ctx.retractK);
  tool.position.set(amplitude * Math.sin(2 * Math.PI * 2.2 * ctx.seconds), -0.00004 * contact, 0);
}

// --- Levier plastique ---------------------------------------------------------------------------

export function buildSpudger(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Levier plastique');
  const body = extrudeOutline(
    [
      v2(-0.0042, 0.0015),
      v2(-0.0035, 0),
      v2(0.0035, 0),
      v2(0.0042, 0.0015),
      v2(0.005, 0.02),
      v2(0.005, 0.13),
      v2(0.0025, 0.145),
      v2(0, 0.15),
      v2(-0.0025, 0.145),
      v2(-0.005, 0.13),
      v2(-0.005, 0.02),
    ],
    {
      depth: 0.0042,
      bevel: 0.0005,
      // Biseau de la pointe plate, effilement de l'autre bout.
      thickness: (_x, y) =>
        THREE.MathUtils.lerp(0.18, 1, smoothstep(y / 0.016)) *
        THREE.MathUtils.lerp(1, 0.45, smoothstep((y - 0.128) / 0.02)),
    },
  );
  root.add(toolMesh(body, mats.plastic(TOOL_COLORS.charcoal, 0.55), 'levier'));
  return root;
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _fulcrum = new THREE.Vector3();
const _tip = new THREE.Vector3();

/** Levier : pointe sous le bord de la pièce, bascule autour d'un appui situé 6 mm plus haut. */
export function animateSpudger(tool: THREE.Object3D, _state: ToolAnimState): void {
  const ctx = rigContext(tool);
  const side = sideSign(ctx);
  leanQuaternion(_qa, side, 0, 1.1);
  const m = motionProgress(ctx);
  const lift = smoothstep(m / 0.35) * (1 - smoothstep(ctx.retractK / 0.5));
  _qb.setFromAxisAngle(AXIS_Z, -side * 0.18 * lift);
  _tip.set(side * Math.max(0, ctx.halfX - 0.0008), -clamp(ctx.depth * 0.9, 0, 0.01), 0);
  _dir.copy(AXIS_Y).applyQuaternion(_qa);
  _fulcrum.copy(_tip).addScaledVector(_dir, 0.006);
  _tip.sub(_fulcrum).applyQuaternion(_qb).add(_fulcrum);
  tool.quaternion.copy(_qb).multiply(_qa);
  tool.position.copy(_tip);
}

// --- À la main ----------------------------------------------------------------------------------

interface HandRig {
  index: THREE.Object3D;
  thumb: THREE.Object3D;
}

const handRigs = new WeakMap<THREE.Object3D, HandRig>();
const FINGER_RADIUS = 0.0085;

/** Bout de doigt ganté (pulpe à y = 0), qui s'efface vers la main (alpha par sommet). */
function fingerGeometry(scale: number): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0, 0],
    [0.004, 0.0006],
    [0.0065, 0.0025],
    [0.0078, 0.0055],
    [0.0083, 0.01],
    [0.0085, 0.02],
    [0.0087, 0.035],
    [0.0088, 0.05],
    [0.0088, 0.058],
  ];
  const g = revolve(
    profile.map(([r, y]) => [r * scale, y * scale] as const),
    40,
    // Pulpe légèrement aplatie du côté du contact (−X local).
    { radial: (theta) => 1 - 0.07 * Math.max(0, -Math.sin(theta)) ** 2 },
  );
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / scale;
    colors.set([1, 1, 1, 1 - smoothstep((y - 0.022) / 0.03)], i * 4);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return g;
}

export function buildHands(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('À la main');
  const index = toolGroup('index', toolMesh(fingerGeometry(1), mats.glove(), 'index ganté'));
  const thumbGeo = fingerGeometry(1.12);
  const thumb = toolGroup('pouce', toolMesh(mirrorX(thumbGeo), mats.glove(), 'pouce ganté'));
  thumbGeo.dispose();
  root.add(index, thumb);
  handRigs.set(root, { index, thumb });
  return root;
}

/** Doigts : pincement de part et d'autre de la pièce (X du montage = petite largeur). */
export function animateHands(tool: THREE.Object3D, _state: ToolAnimState): void {
  const rig = handRigs.get(tool);
  if (!rig) return;
  const ctx = rigContext(tool);
  const contact = contactOf(ctx.approachK, ctx.retractK);
  const gap = 0.006 * (1 - contact);
  const y = -clamp(ctx.depth * 0.5, 0.0005, 0.02);
  rig.index.position.set(ctx.halfX + FINGER_RADIUS * 0.92 + gap, y, 0);
  rig.thumb.position.set(-(ctx.halfX + FINGER_RADIUS * 1.03 + gap), y, 0);
  rig.index.rotation.set(0, 0, 0.22);
  rig.thumb.rotation.set(0, 0, -0.26);
}
