/**
 * Clés six pans (clés Allen en L) et tournevis (cruciforme, plat, de précision).
 *
 * Géométrie à l'échelle réelle : section hexagonale réelle des clés (surplat 1,5 / 2 / 2,5 mm,
 * longueurs ISO 2936 série courte, coude de rayon ≈ 1,2 × surplat, chanfreins d'extrémité),
 * empreinte cruciforme à quatre ailes (PH1 / PH0), lame plate évoluant du rond au méplat,
 * manches cannelés bi-matière. Pointe active à l'origine, outil vers +Y.
 *
 * Geste : l'outil s'engage dans l'empreinte le long de l'axe et tourne avec la vis (`spin`) ;
 * sans rotation de la pièce (déclipsage, extraction), le tournevis fait levier.
 *
 * Approximation : l'enfoncement dans l'empreinte est déduit de la profondeur de la pièce
 * (l'empreinte réelle n'est pas décrite par les données).
 */
import * as THREE from 'three/webgpu';
import type { ToolAnimState, ToolBuildContext } from '../../../objects/types';
import { smoothstep } from '../../easing';
import { AXIS_Y, AXIS_Z, clamp, sideSign, toolGroup, toolMesh, toolRoot } from './common';
import { hexagon, loftRings, revolve, sweepPolygon, type ProfilePoint, type SweepFrame } from './geometry';
import { TOOL_COLORS, toolMaterials } from './materials';
import { motionProgress, rigContext } from './rig';

// --- Clés six pans ------------------------------------------------------------------------

/** Longueurs ISO 2936 (série courte) : grand bras, petit bras (m), par surplat (mm). */
const HEX_KEY_SIZES: Record<string, { s: number; long: number; short: number }> = {
  '1.5': { s: 0.0015, long: 0.0465, short: 0.0155 },
  '2': { s: 0.002, long: 0.052, short: 0.018 },
  '2.5': { s: 0.0025, long: 0.0585, short: 0.0205 },
};

/**
 * Clé en L balayée : grand bras le long de +Y (pointe à l'origine, engagée dans la vis : on
 * fait tourner la clé par le petit bras, comme pour un dévissage rapide), coude, petit bras +X.
 */
export function hexKeyGeometry(s: number, long: number, short: number): THREE.BufferGeometry {
  const poly = hexagon(s);
  const bend = 1.2 * s;
  const chamfer = 0.12 * s;
  const shrink = 1 - (2 * chamfer) / s;
  const yTop = long - bend - s / 2;
  const xEnd = short - s / 2;
  const frames: SweepFrame[] = [];
  const Z = new THREE.Vector3(0, 0, 1);
  const frame = (x: number, y: number, tx: number, ty: number, scale = 1, tilt = 0): SweepFrame => {
    const tangent = new THREE.Vector3(tx, ty, 0).normalize();
    // u = T × Z (dans le plan de la clé), v = Z : la section reste perpendiculaire au trajet.
    const u = new THREE.Vector3().crossVectors(tangent, Z).normalize();
    return { origin: new THREE.Vector3(x, y, 0), tangent, u, v: Z.clone(), scale, tilt };
  };
  // Pointe chanfreinée.
  frames.push(frame(0, 0, 0, 1, shrink, -1), frame(0, chamfer, 0, 1, 1, -1), frame(0, chamfer, 0, 1));
  frames.push(frame(0, yTop, 0, 1));
  // Coude (centre (bend, yTop)).
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const phi = (i / steps) * (Math.PI / 2);
    frames.push(
      frame(bend - bend * Math.cos(phi), yTop + bend * Math.sin(phi), Math.sin(phi), Math.cos(phi)),
    );
  }
  const yArm = yTop + bend;
  frames.push(frame(bend, yArm, 1, 0), frame(xEnd - chamfer, yArm, 1, 0));
  frames.push(frame(xEnd - chamfer, yArm, 1, 0, 1, 1), frame(xEnd, yArm, 1, 0, shrink, 1));
  return sweepPolygon(poly, frames);
}

interface DriverRig {
  /** Capuchon libre (tournevis de précision). */
  cap: THREE.Object3D | null;
  /** Enfoncement maximal dans l'empreinte (m). */
  insert: number;
}

const driverRigs = new WeakMap<THREE.Object3D, DriverRig>();

export function buildHexKey(size: '1.5' | '2' | '2.5') {
  return (ctx: ToolBuildContext): THREE.Object3D => {
    const spec = HEX_KEY_SIZES[size]!;
    const mats = toolMaterials(ctx);
    const root = toolRoot(`Clé Allen ${size} mm`);
    root.add(toolMesh(hexKeyGeometry(spec.s, spec.long, spec.short), mats.chrome(), 'clé'));
    driverRigs.set(root, { cap: null, insert: 0.6 * spec.s });
    return root;
  };
}

// --- Tournevis ------------------------------------------------------------------------------

/** Empreinte cruciforme : quatre ailes (θ = k·90°) et goujures profondes entre elles. */
function phillipsTip(scale: number): THREE.BufferGeometry {
  const r = 0.0025 * scale;
  const tipLen = 0.0043 * scale;
  const profile: ProfilePoint[] = [
    [0, 0],
    [0.00032 * scale, 0],
    [0.00032 * scale, 0],
    [r * 0.55, tipLen * 0.5],
    [r, tipLen],
    [r, tipLen + 0.002 * scale],
    [r, 0.009 * scale],
  ];
  return revolve(profile, 64, {
    radial: (theta, y) => {
      const wings = 0.34 + 0.66 * Math.pow(Math.abs(Math.cos(2 * theta)), 5);
      // Les goujures s'estompent dans la tige (fin de l'empreinte).
      const w = 1 - smoothstep((y - tipLen) / (0.0035 * scale));
      return 1 - (1 - wings) * w;
    },
    phase: Math.PI / 4,
  });
}

/** Lame plate : section superellipse évoluant du méplat (pointe) au rond (tige). */
function flatBlade(width: number, tip: number, shaftR: number, length: number): THREE.BufferGeometry {
  const N = 48;
  const rings: THREE.Vector3[][] = [];
  const ys = [0, 0.0005, 0.0015, 0.003, 0.005, 0.0075, 0.01, 0.0125, length];
  for (const y of ys) {
    const k = smoothstep(y / (length * 0.95));
    const halfT = THREE.MathUtils.lerp(tip / 2, shaftR, Math.pow(k, 0.75));
    const halfW = THREE.MathUtils.lerp(width / 2, shaftR, smoothstep((y - 0.003) / (length - 0.003)));
    const n = THREE.MathUtils.lerp(10, 2, k);
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < N; j++) {
      const a = (j / N) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ring.push(
        new THREE.Vector3(
          halfW * Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
          y,
          halfT * Math.sign(s) * Math.pow(Math.abs(s), 2 / n),
        ),
      );
    }
    rings.push(ring);
  }
  return loftRings(rings, true);
}

/** Manche cannelé (profil [rayon, y] à partir de y0). */
function handleProfile(y0: number, length: number, radius: number): ProfilePoint[] {
  const p = (r: number, t: number): ProfilePoint => [r * radius, y0 + t * length];
  return [
    p(0.3, 0),
    p(0.48, 0.03),
    p(0.62, 0.1),
    p(0.78, 0.25),
    p(0.93, 0.45),
    p(1, 0.66),
    p(0.99, 0.82),
    p(0.9, 0.93),
    p(0.62, 0.99),
    [0, y0 + length],
  ];
}

function buildScrewdriver(
  ctx: ToolBuildContext,
  o: { kind: 'phillips' | 'flat'; handleColor: number; gripColor: number; name: string },
): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot(o.name);
  const shaftR = 0.0025;
  const shaftTop = 0.082;
  const tipH = o.kind === 'phillips' ? 0.009 : 0.016;
  if (o.kind === 'phillips') root.add(toolMesh(phillipsTip(1), mats.blackOxide(), 'empreinte'));
  else root.add(toolMesh(flatBlade(0.0055, 0.0007, shaftR, tipH), mats.blackOxide(), 'lame'));
  const shaft = revolve(
    [
      [shaftR, tipH],
      [shaftR, shaftTop - 0.003],
      [shaftR * 1.5, shaftTop - 0.001],
      [shaftR * 1.5, shaftTop + 0.004],
    ],
    28,
  );
  root.add(toolMesh(shaft, mats.chrome(), 'tige'));
  // Manche : noyau plastique teinté + surmoulage élastomère cannelé.
  const hLen = 0.1;
  const hR = 0.0155;
  const core = revolve(handleProfile(shaftTop, hLen, hR), 72, {
    lobes: 6,
    lobeDepth: 0.1,
    lobeSharpness: 3,
    lobeRange: [shaftTop + 0.01, shaftTop + hLen * 0.95],
    lobeFade: 0.006,
  });
  root.add(toolMesh(core, mats.plastic(o.handleColor, 0.32), 'manche'));
  const g0 = shaftTop + hLen * 0.3;
  const g1 = shaftTop + hLen * 0.8;
  const base = handleProfile(shaftTop, hLen, hR);
  const radiusAt = (y: number): number => {
    for (let i = 1; i < base.length; i++) {
      const a = base[i - 1]!;
      const b = base[i]!;
      if (y <= b[1]) return THREE.MathUtils.lerp(a[0], b[0], (y - a[1]) / Math.max(1e-9, b[1] - a[1]));
    }
    return base[base.length - 1]![0];
  };
  const grip: ProfilePoint[] = [];
  for (let i = 0; i <= 12; i++) {
    const y = THREE.MathUtils.lerp(g0, g1, i / 12);
    const edge = Math.min(i, 12 - i) === 0 ? 0.985 : 1.03;
    grip.push([radiusAt(y) * edge, y]);
  }
  const gripGeo = revolve(grip, 72, { lobes: 6, lobeDepth: 0.1, lobeSharpness: 3 });
  root.add(toolMesh(gripGeo, mats.rubber(o.gripColor), 'poignée'));
  driverRigs.set(root, { cap: null, insert: o.kind === 'phillips' ? 0.0016 : 0.0012 });
  return root;
}

export const buildPhillips = (ctx: ToolBuildContext): THREE.Object3D =>
  buildScrewdriver(ctx, {
    kind: 'phillips',
    handleColor: TOOL_COLORS.red,
    gripColor: TOOL_COLORS.black,
    name: 'Tournevis cruciforme PH1',
  });

export const buildFlat = (ctx: ToolBuildContext): THREE.Object3D =>
  buildScrewdriver(ctx, {
    kind: 'flat',
    handleColor: TOOL_COLORS.yellow,
    gripColor: TOOL_COLORS.black,
    name: 'Tournevis plat 5,5 mm',
  });

/** Tournevis de précision : corps alu cannelé, capuchon libre, empreinte PH0. */
export function buildPrecision(ctx: ToolBuildContext): THREE.Object3D {
  const mats = toolMaterials(ctx);
  const root = toolRoot('Tournevis de précision PH0');
  const scale = 0.5;
  const shaftR = 0.0025 * scale;
  root.add(toolMesh(phillipsTip(scale), mats.blackOxide(), 'empreinte'));
  root.add(
    toolMesh(
      revolve(
        [
          [shaftR, 0.009 * scale],
          [shaftR, 0.049],
        ],
        20,
      ),
      mats.chrome(),
      'tige',
    ),
  );
  const body = revolve(
    [
      [0.0016, 0.046],
      [0.0028, 0.049],
      [0.0046, 0.056],
      [0.0055, 0.064],
      [0.0055, 0.064],
      [0.0055, 0.129],
      [0.0052, 0.131],
      [0.0046, 0.1315],
    ],
    96,
    { lobes: 24, lobeDepth: 0.06, lobeSharpness: 2, lobeRange: [0.066, 0.127], lobeFade: 0.002 },
  );
  root.add(toolMesh(body, mats.machined(), 'corps'));
  const capGeo = revolve(
    [
      [0.0046, 0.1312],
      [0.0054, 0.1318],
      [0.0056, 0.133],
      [0.0056, 0.1395],
      [0.0048, 0.1425],
      [0.0025, 0.1438],
      [0, 0.144],
    ],
    48,
  );
  const cap = toolGroup('capuchon', toolMesh(capGeo, mats.anodized('red'), 'capuchon libre'));
  root.add(cap);
  driverRigs.set(root, { cap, insert: 0.0009 });
  return root;
}

// --- Animation ------------------------------------------------------------------------------

const _q = new THREE.Quaternion();

/**
 * Clés et tournevis : engagés dans l'empreinte (enfoncement proportionné à la pièce), ils
 * tournent avec la vis. Pendant l'approche, un petit mouvement de recherche aligne l'empreinte.
 * Sans rotation de la pièce, le tournevis fait levier (déclipsage).
 */
export function animateDriver(tool: THREE.Object3D, state: ToolAnimState): void {
  const ctx = rigContext(tool);
  const rig = driverRigs.get(tool);
  const insert = clamp(ctx.depth * 0.35, 0.0003, rig?.insert ?? 0.0015);
  const seek = 0.45 * (1 - smoothstep(ctx.approachK));
  tool.position.set(0, -insert * smoothstep((ctx.approachK - 0.6) / 0.4), 0);
  if (state.motion === 'unscrew' || Math.abs(state.spin) > 1e-6) {
    const angle = state.spin + seek * state.direction;
    tool.quaternion.setFromAxisAngle(AXIS_Y, angle);
    // Le capuchon libre reste immobile sous le doigt.
    if (rig?.cap) rig.cap.quaternion.setFromAxisAngle(AXIS_Y, -angle);
    return;
  }
  // Levier : bascule autour de la pointe, vers le côté extérieur.
  const m = motionProgress(ctx);
  const lever = 0.24 * smoothstep(m / 0.3) * (1 - smoothstep((m - 0.75) / 0.25));
  tool.quaternion.setFromAxisAngle(AXIS_Z, -sideSign(ctx) * lever);
  _q.setFromAxisAngle(AXIS_Y, seek);
  tool.quaternion.multiply(_q);
  if (rig?.cap) rig.cap.quaternion.identity();
}
