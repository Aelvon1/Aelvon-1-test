/**
 * Fabriques de matériaux non métalliques : plastiques, caoutchoucs, silicones, céramiques,
 * résines, couches de circuit imprimé (vernis épargne, sérigraphie, âme FR4), composites tissés
 * (fibre de verre, carbone), papier, silicium de puce.
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  dot,
  float,
  materialColor,
  materialMetalness,
  materialRoughness,
  max,
  mix,
  modelWorldMatrix,
  normalize,
  positionWorld,
  saturate,
  smoothstep,
  vec3,
} from 'three/tsl';
import { bumpNormal } from '../tsl/bump';
import { rgb } from '../tsl/color';
import { type MaterialEnv, type MappingOptions, SurfaceKit } from '../tsl/surface';
import type { FloatNode, Vec3Node } from '../tsl/types';
import {
  cavityMask,
  dirtMask,
  dustMask,
  edgeMask,
  fingerprintMask,
  smudgeRoughness,
  wearMask,
} from '../tsl/wear';
import { PALETTE } from '../palette';
import { type CommonOptions, clampRoughness, physical } from './common';

// ---------------------------------------------------------------------------------------------
// Plastiques, caoutchoucs, silicones, céramiques
// ---------------------------------------------------------------------------------------------

export interface PlasticOptions extends MappingOptions, CommonOptions {
  color: THREE.ColorRepresentation;
  roughness?: number;
  /** Texture de moulage : `molded` (grain fin d'électro-érosion), `smooth`, `wrinkled` (gaine). */
  texture?: 'molded' | 'smooth' | 'wrinkled';
  /** Amplitude du relief (m, défaut 6e-6). */
  relief?: number;
  /** Arêtes éraflées, blanchies (0..1, défaut 0,2). */
  wear?: number;
  scratches?: number;
  dirt?: number;
  fingerprints?: number;
  /** Lustre doux des matières souples (0..1). */
  sheen?: number;
  sheenColor?: THREE.ColorRepresentation;
  sheenRoughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** Variation de teinte (0..1, défaut 0,08). */
  tint?: number;
  edgeRadius?: number;
}

export function createPlastic(env: MaterialEnv, o: PlasticOptions): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'local',
    scale: o.scale ?? 25,
    sharpness: o.sharpness,
  });
  const m = physical(o.name, {
    color: o.color,
    roughness: o.roughness ?? 0.5,
    metalness: 0,
    sheen: o.sheen ?? 0,
    sheenColor: o.sheenColor ?? 0xffffff,
    sheenRoughness: o.sheenRoughness ?? 0.6,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.2,
  });
  const noise = kit.sample('noise');
  const grunge = kit.grunge();
  const scratch = kit.sample('scratches', 1.5);
  const radius = o.edgeRadius ?? 0.0015;
  const edges = edgeMask(radius);
  const cavity = cavityMask(radius);
  const relief = o.relief ?? 6e-6;

  let color: Vec3Node = materialColor.mul(
    noise.r
      .sub(0.5)
      .mul(o.tint ?? 0.08)
      .add(1),
  );
  let roughness: FloatNode = materialRoughness.add(noise.g.sub(0.5).mul(0.06));
  let height: FloatNode = float(0);
  const texture = o.texture ?? 'molded';
  if (texture === 'molded') {
    height = noise.b.mul(relief);
    roughness = roughness.add(noise.b.sub(0.5).mul(0.08));
  } else if (texture === 'wrinkled') {
    // Plis de rétreint : stries larges et douces (texture `brushed` très agrandie).
    const wrinkles = kit.sample('brushed', 0.05);
    height = wrinkles.r
      .mul(relief * 1.5)
      .add(wrinkles.a.mul(relief))
      .add(noise.b.mul(relief * 0.4));
    roughness = roughness.sub(wrinkles.r.sub(0.5).mul(0.1));
  }

  // Arêtes éraflées : blanchiment sous contrainte, lustrage.
  const worn = wearMask(edges, o.wear ?? 0.2, grunge.a).mul(0.7);
  color = mix(color, color.mul(1.35).add(0.035), worn);
  roughness = mix(roughness, roughness.mul(0.75), worn);
  const scratchMask = saturate(
    scratch.r.mul((o.scratches ?? 0.2) * 1.2).add(scratch.g.mul(o.scratches ?? 0.2)),
  );
  color = color.add(scratchMask.mul(0.025));
  roughness = roughness.add(scratchMask.mul(0.12));
  height = height.sub(scratch.b.mul(relief * 0.5 * (o.scratches ?? 0.2)));

  const dirtAmount = o.dirt ?? 0.2;
  const dirt = dirtMask(grunge, cavity, dirtAmount);
  const dust = dustMask(grunge, dirtAmount * 0.8);
  color = mix(color, rgb(PALETTE.dirt), dirt.mul(0.6));
  color = mix(color, rgb(PALETTE.dust), dust.mul(0.45));
  roughness = mix(roughness, float(0.85), max(dirt, dust));
  roughness = smudgeRoughness(roughness, fingerprintMask(grunge, o.fingerprints ?? 0.3));

  m.colorNode = color;
  m.roughnessNode = clampRoughness(roughness);
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(height, 1);
  return m;
}

/** Caoutchouc : très mat, grain marqué, voile de poussière (efflorescence). */
export function createRubber(
  env: MaterialEnv,
  o: Partial<PlasticOptions> & { color: THREE.ColorRepresentation },
): THREE.MeshPhysicalNodeMaterial {
  return createPlastic(env, {
    roughness: 0.85,
    relief: 1.5e-5,
    sheen: 0.35,
    sheenColor: 0x8a8f94,
    sheenRoughness: 0.8,
    wear: 0.1,
    dirt: 0.35,
    ...o,
  });
}

/** Isolant silicone : satiné, souple, lustre doux. */
export function createSilicone(env: MaterialEnv, color: THREE.ColorRepresentation, name?: string) {
  // Lustre teinté (et non blanc) : un lustre blanc délave les couleurs vives en pastel.
  const sheenColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
  return createPlastic(env, {
    name,
    color,
    roughness: 0.5,
    texture: 'smooth',
    sheen: 0.35,
    sheenColor,
    sheenRoughness: 0.45,
    wear: 0.1,
    dirt: 0.15,
    fingerprints: 0.2,
    tint: 0.05,
  });
}

/** Gaine thermorétractable : plis de rétreint, satiné. */
export function createHeatShrink(env: MaterialEnv, color: THREE.ColorRepresentation, name?: string) {
  return createPlastic(env, {
    name,
    color,
    roughness: 0.42,
    texture: 'wrinkled',
    relief: 1.2e-5,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
    wear: 0.12,
    dirt: 0.12,
  });
}

/** Céramique (corps de condensateur) : satinée, grenue. */
export function createCeramic(env: MaterialEnv, color: THREE.ColorRepresentation, name?: string) {
  return createPlastic(env, {
    name,
    color,
    roughness: 0.48,
    texture: 'molded',
    relief: 3e-6,
    scale: 120,
    wear: 0.15,
    dirt: 0.08,
    fingerprints: 0.1,
    tint: 0.1,
  });
}

/** Résine de boîtier de CI : grain d'électro-érosion, fin vernis. */
export function createEpoxy(env: MaterialEnv, o: { color?: THREE.ColorRepresentation; name?: string } = {}) {
  return createPlastic(env, {
    name: o.name,
    color: o.color ?? 0x151516,
    roughness: 0.58,
    texture: 'molded',
    relief: 2.5e-6,
    scale: 150,
    clearcoat: 0.22,
    clearcoatRoughness: 0.35,
    wear: 0.08,
    dirt: 0.08,
    fingerprints: 0.25,
  });
}

// ---------------------------------------------------------------------------------------------
// Circuit imprimé
// ---------------------------------------------------------------------------------------------

export interface SolderMaskOptions extends MappingOptions, CommonOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** Brillance du vernis (clearcoat, défaut 0,75). */
  gloss?: number;
}

/**
 * Vernis épargne semi-brillant : couche transparente (clearcoat) à peau d'orange sur une teinte
 * légèrement nuagée ; traces de doigts visibles dans le reflet.
 */
export function createSolderMask(
  env: MaterialEnv,
  o: SolderMaskOptions = {},
): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'local',
    scale: o.scale ?? 40,
    sharpness: o.sharpness,
  });
  const m = physical(o.name, {
    color: o.color ?? 0x0f6a73,
    roughness: o.roughness ?? 0.42,
    metalness: 0,
    clearcoat: o.gloss ?? 0.75,
    clearcoatRoughness: 0.14,
  });
  const noise = kit.sample('noise');
  const grunge = kit.grunge();
  const prints = fingerprintMask(grunge, 0.35);
  m.colorNode = materialColor.mul(noise.r.sub(0.5).mul(0.12).add(1)).mul(noise.g.sub(0.5).mul(0.06).add(1));
  m.roughnessNode = clampRoughness(materialRoughness.add(noise.b.sub(0.5).mul(0.06)));
  m.metalnessNode = materialMetalness;
  m.clearcoatRoughnessNode = clampRoughness(float(0.12).add(prints.mul(0.3)).add(grunge.g.mul(0.04)));
  // Peau d'orange : ondulation douce du vernis (normale de la couche transparente seulement).
  m.clearcoatNormalNode = bumpNormal(noise.g.mul(4e-6).add(noise.b.mul(1.5e-6)), 1);
  return m;
}

/** Encre de sérigraphie : légèrement en relief, grain d'impression, bords irréguliers. */
export function createSilkscreen(
  env: MaterialEnv,
  o: { color?: THREE.ColorRepresentation; name?: string } = {},
) {
  return createPlastic(env, {
    name: o.name,
    color: o.color ?? 0xf2f2ee,
    roughness: 0.72,
    texture: 'molded',
    relief: 4e-6,
    scale: 160,
    wear: 0.2,
    dirt: 0.12,
    fingerprints: 0.1,
    tint: 0.12,
  });
}

// ---------------------------------------------------------------------------------------------
// Composites tissés, FR4
// ---------------------------------------------------------------------------------------------

export interface WovenCompositeOptions extends MappingOptions, CommonOptions {
  kind: 'glass' | 'carbon';
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** Brillance de la résine (clearcoat). */
  gloss?: number;
}

/**
 * Composite tissé imprégné de résine.
 * - verre : fils crème translucides, interstices plus sombres (résine), lustre des fibres (sheen) ;
 * - carbone : sergé 2/2, les mèches de chaîne et de trame s'éclairent tour à tour selon l'angle
 *   de vue. Approximation : ce reflet anisotrope est simulé par la luminosité des mèches en
 *   fonction de l'alignement de la direction de vue sur l'axe X de l'objet (pas de vraie BRDF
 *   anisotrope par mèche).
 */
export function createWovenComposite(
  env: MaterialEnv,
  o: WovenCompositeOptions,
): THREE.MeshPhysicalNodeMaterial {
  const carbon = o.kind === 'carbon';
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'local',
    scale: o.scale ?? (carbon ? 60 : 140),
    sharpness: o.sharpness ?? 8,
  });
  const m = physical(o.name, {
    color: o.color ?? (carbon ? 0x1a1a1c : 0xd9d4c2),
    roughness: o.roughness ?? (carbon ? 0.32 : 0.45),
    metalness: 0,
    clearcoat: o.gloss ?? (carbon ? 1 : 0.55),
    clearcoatRoughness: carbon ? 0.05 : 0.15,
    sheen: carbon ? 0 : 0.35,
    sheenColor: 0xfffbea,
    sheenRoughness: 0.35,
  });
  const weave = kit.sample(carbon ? 'weave.carbon' : 'weave.glass');
  const grunge = kit.grunge();
  const gap = float(1).sub(weave.a);
  let color: Vec3Node;
  if (carbon) {
    const view = normalize(cameraPosition.sub(positionWorld));
    const axis = modelWorldMatrix.transformDirection(vec3(1, 0, 0));
    const f = saturate(abs(dot(view, axis)).mul(1.6));
    const lit = mix(f, float(1).sub(f), weave.g);
    color = materialColor.mul(lit.mul(1.6).add(0.45)).mul(weave.b.mul(0.5).add(0.75));
  } else {
    color = materialColor.mul(weave.b.mul(0.3).add(0.82)).mul(float(1).sub(gap.mul(0.35)));
  }
  color = mix(color, rgb(PALETTE.dirt), dirtMask(grunge, float(0), 0.12).mul(0.4));
  m.colorNode = color;
  m.roughnessNode = clampRoughness(materialRoughness.add(gap.mul(0.2)).add(weave.b.sub(0.5).mul(0.1)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(weave.r.mul(carbon ? 1.5e-5 : 2.5e-5), 1);
  return m;
}

/** Âme FR4 (tranche de circuit) : tissu de verre noyé dans l'époxy jaunâtre. */
export function createFr4(env: MaterialEnv, o: { color?: THREE.ColorRepresentation; name?: string } = {}) {
  const kit = new SurfaceKit(env, { space: 'local', scale: 900, sharpness: 8 });
  const m = physical(o.name, { color: o.color ?? 0xb9a86a, roughness: 0.55, metalness: 0, clearcoat: 0.2 });
  const weave = kit.sample('weave.glass');
  const noise = kit.sample('noise', 0.05);
  m.colorNode = materialColor.mul(weave.b.mul(0.25).add(0.85)).mul(noise.r.sub(0.5).mul(0.15).add(1));
  m.roughnessNode = clampRoughness(materialRoughness.add(weave.r.sub(0.5).mul(0.15)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(weave.r.mul(3e-6), 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Papier
// ---------------------------------------------------------------------------------------------

export interface PaperOptions extends MappingOptions, CommonOptions {
  color: THREE.ColorRepresentation;
  roughness?: number;
  /** Lustre de calandrage (0..1). */
  sheen?: number;
  dirt?: number;
}

/** Papier (étiquette, isolant d'encoche) : fibres, légère ondulation, salissures. */
export function createPaper(env: MaterialEnv, o: PaperOptions): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'local',
    scale: o.scale ?? 25,
    sharpness: o.sharpness,
  });
  const m = physical(o.name, {
    color: o.color,
    roughness: o.roughness ?? 0.85,
    metalness: 0,
    sheen: o.sheen ?? 0.15,
    sheenColor: 0xffffff,
    sheenRoughness: 0.7,
  });
  const noise = kit.sample('noise', 2);
  const grunge = kit.grunge();
  const cavity = cavityMask(0.002);
  const fibers = grunge.g.sub(0.5).mul(0.12).add(noise.b.sub(0.5).mul(0.1));
  let color: Vec3Node = materialColor.mul(fibers.add(1)).mul(noise.r.sub(0.5).mul(0.08).add(1));
  const dirt = dirtMask(grunge, cavity, o.dirt ?? 0.25);
  color = mix(color, color.mul(vec3(0.72, 0.64, 0.5)), dirt);
  m.colorNode = color;
  m.roughnessNode = clampRoughness(materialRoughness.add(noise.b.sub(0.5).mul(0.08)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(noise.b.mul(8e-6).add(noise.r.mul(2e-5)), 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Silicium
// ---------------------------------------------------------------------------------------------

/**
 * Silicium de puce : miroir gris bleuté, irisation légère (couches d'oxyde d'épaisseur variable)
 * et maillage d'interconnexions suggéré par des stries croisées très fines, visibles au zoom.
 * Approximation : le motif de circuit est un tramage générique (pas un dessin de puce réel).
 */
export function createSiliconDie(
  env: MaterialEnv,
  o: { name?: string } = {},
): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: 'local', scale: 300, sharpness: 12 });
  const m = physical(o.name, {
    color: 0x55586a,
    roughness: 0.12,
    metalness: 0.65,
    iridescence: 0.85,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [250, 650],
  });
  const lines = kit.sample('brushed', 1);
  const cross = kit.sample('brushed', 1.37);
  const noise = kit.sample('noise', 0.2);
  const grid = max(smoothstep(0.62, 0.8, lines.g), smoothstep(0.62, 0.8, cross.b.add(cross.g.mul(0.5))));
  m.colorNode = materialColor.mul(grid.mul(0.35).add(0.85)).mul(noise.r.sub(0.5).mul(0.2).add(1));
  m.roughnessNode = clampRoughness(materialRoughness.add(grid.mul(0.1)));
  m.metalnessNode = materialMetalness;
  // Épaisseur d'oxyde variant lentement (bandes irisées larges) + motif d'interconnexions.
  const slow = kit.sample('noise', 0.02);
  m.iridescenceThicknessNode = mix(float(250), float(650), slow.r.mul(0.8).add(grid.mul(0.2)));
  return m;
}

// ---------------------------------------------------------------------------------------------
// Résines translucides
// ---------------------------------------------------------------------------------------------

export interface ResinOptions extends MappingOptions, CommonOptions {
  color: THREE.ColorRepresentation;
  /** Part de lumière transmise (défaut 0,6). */
  transmission?: number;
  /** Épaisseur moyenne (m, défaut 0,0005). */
  thickness?: number;
  roughness?: number;
}

/**
 * Résine ou vernis ambré translucide (résidu de flux, vernis d'imprégnation) : transmission
 * teintée par atténuation, surface brillante légèrement bosselée (coulures figées).
 */
export function createResin(env: MaterialEnv, o: ResinOptions): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'local',
    scale: o.scale ?? 60,
    sharpness: o.sharpness,
  });
  const thickness = o.thickness ?? 0.0005;
  const m = physical(o.name, {
    color: o.color,
    roughness: o.roughness ?? 0.18,
    metalness: 0,
    transmission: o.transmission ?? 0.6,
    thickness,
    ior: 1.52,
    attenuationColor: o.color,
    attenuationDistance: thickness * 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const noise = kit.sample('noise');
  const grunge = kit.grunge();
  m.colorNode = materialColor.mul(noise.r.sub(0.5).mul(0.25).add(1));
  m.roughnessNode = clampRoughness(materialRoughness.add(grunge.g.mul(0.15)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(noise.g.mul(1.5e-5).add(noise.b.mul(3e-6)), 1);
  return m;
}
