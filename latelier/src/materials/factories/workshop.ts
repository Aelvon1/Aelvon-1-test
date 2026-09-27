/**
 * Fabriques des matériaux du décor : bois (établi, contreplaqué), béton taché d'huile, mur peint,
 * panneau perforé, carton, tissus (chiffon, tapis), ruban adhésif, tapis antistatique.
 * Mappage par défaut : repère MONDE (décor fixe, pas d'UV nécessaire).
 */
import type * as THREE from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fract,
  length,
  materialColor,
  materialMetalness,
  materialRoughness,
  mix,
  normalWorldGeometry,
  positionWorld,
  saturate,
  select,
  smoothstep,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { bumpNormal } from '../tsl/bump';
import { rgb } from '../tsl/color';
import { type MaterialEnv, type MappingOptions, SurfaceKit } from '../tsl/surface';
import type { FloatNode, Vec2Node, Vec3Node } from '../tsl/types';
import {
  cavityMask,
  dirtMask,
  dustMask,
  edgeMask,
  fingerprintMask,
  groundGrime,
  smudgeRoughness,
  wearMask,
} from '../tsl/wear';
import { PALETTE } from '../palette';
import { type CommonOptions, clampRoughness, physical } from './common';

// ---------------------------------------------------------------------------------------------
// Bois
// ---------------------------------------------------------------------------------------------

export interface WoodOptions extends MappingOptions, CommonOptions {
  /** `bench` : lamellé-collé d'établi usé ; `plywood` : contreplaqué de bouleau. */
  variant?: 'bench' | 'plywood';
  /** Teinte multipliée à la texture (défaut blanc = couleurs de la texture). */
  tint?: THREE.ColorRepresentation;
  roughness?: number;
  /** Usure : zones lustrées, arêtes adoucies, rayures (0..1, défaut 0,6 établi / 0,25 CP). */
  wear?: number;
  /** Taches d'huile, crasse (0..1, défaut 0,5 / 0,2). */
  dirt?: number;
}

/**
 * Bois : veinage « en cathédrale » peint, fil le long de X du monde (et de Z sur les faces
 * orientées X) ; zones polies par l'usage, taches d'huile sombres et plus lisses, rayures
 * claires (fibres à nu), arêtes émoussées et éclaircies.
 */
export function createWood(env: MaterialEnv, o: WoodOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const plywood = o.variant === 'plywood';
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'world',
    scale: o.scale ?? (plywood ? 1 : 1.25),
    sharpness: o.sharpness,
  });
  const m = physical(o.name, {
    color: o.tint ?? 0xffffff,
    roughness: o.roughness ?? (plywood ? 0.72 : 0.62),
    metalness: 0,
  });
  const wood = kit.sample(plywood ? 'wood.plywood' : 'wood.bench');
  const grunge = kit.grunge();
  const scratch = kit.sample('scratches', 2);
  const edges = edgeMask(0.01);
  const cavity = cavityMask(0.01);
  const wear = o.wear ?? (plywood ? 0.25 : 0.6);
  const dirtAmount = o.dirt ?? (plywood ? 0.2 : 0.5);

  let color: Vec3Node = wood.rgb.mul(materialColor);
  // Poli d'usage : grandes zones plus lisses et légèrement plus chaudes.
  const polish = smoothstep(0.35, 0.8, grunge.a).mul(wear);
  let roughness: FloatNode = materialRoughness.sub(polish.mul(0.2)).add(float(0.5).sub(wood.a).mul(0.25));
  // Arêtes : bois éclairci (vernis et crasse partis).
  const worn = wearMask(edges, wear, grunge.a);
  color = mix(color, color.mul(1.25).add(vec3(0.03, 0.022, 0.012)), worn);
  // Rayures : fibres claires à nu.
  const lines = saturate(scratch.r.mul(wear * 1.2).add(scratch.g.mul(wear * 0.5)));
  color = mix(color, color.mul(1.4).add(0.02), lines.mul(0.6));
  roughness = roughness.add(lines.mul(0.1));
  // Taches d'huile : sombres et lustrées ; crasse dans les creux.
  const oil = smoothstep(0.6, 0.85, grunge.r).mul(dirtAmount);
  color = mix(color, color.mul(vec3(0.42, 0.36, 0.3)), oil);
  roughness = mix(roughness, float(0.32), oil);
  const dirt = dirtMask(grunge, cavity, dirtAmount * 0.6);
  color = mix(color, rgb(PALETTE.dirt), dirt.mul(0.6));
  const prints = fingerprintMask(grunge, 0.25);
  m.colorNode = color;
  m.roughnessNode = clampRoughness(smudgeRoughness(roughness, prints));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(wood.a.mul(2.2e-4).sub(scratch.b.mul(wear * 6e-5)), 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Béton
// ---------------------------------------------------------------------------------------------

export interface ConcreteOptions extends MappingOptions, CommonOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** Taches d'huile (0..1, défaut 0,8). */
  oil?: number;
  /** Fissures (0..1, défaut 0,7). */
  cracks?: number;
}

/**
 * Béton de garage : marbrures, bullage et granulats, fissures fines, taches d'huile sombres (cœur
 * encore brillant, auréole mate), crasse au pied des murs (repère monde).
 */
export function createConcrete(env: MaterialEnv, o: ConcreteOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'world',
    scale: o.scale ?? 0.45,
    sharpness: o.sharpness,
  });
  const m = physical(o.name, {
    color: o.color ?? PALETTE.concrete,
    roughness: o.roughness ?? 0.88,
    metalness: 0,
  });
  const concrete = kit.sample('concrete');
  const fine = kit.sample('noise', 8);
  const grunge = kit.grunge();
  const mottle = concrete.r;
  const oil = concrete.g.mul(o.oil ?? 0.8);
  const grain = concrete.b;
  const cracks = concrete.a.mul(o.cracks ?? 0.7);

  let color: Vec3Node = materialColor.mul(mottle.mul(0.45).add(0.75)).mul(fine.b.sub(0.5).mul(0.12).add(1));
  // Granulats clairs, pores sombres.
  color = color.mul(grain.sub(0.5).mul(0.7).add(1));
  color = mix(color, rgb(PALETTE.dirt), smoothstep(0.55, 0.9, grunge.r).mul(0.25));
  // Huile : très sombre au cœur, légèrement irisée/brunâtre en périphérie.
  const oilColor = mix(rgb(0x4a4238), rgb(PALETTE.oil), smoothstep(0.3, 0.8, oil));
  color = mix(color, oilColor, smoothstep(0.05, 0.6, oil).mul(0.9));
  color = mix(color, color.mul(0.35), cracks);
  let roughness: FloatNode = materialRoughness.add(fine.b.sub(0.5).mul(0.1)).add(grain.sub(0.5).mul(-0.1));
  // Huile fraîche : lustrée au cœur, mate sur les bords.
  roughness = mix(roughness, float(0.28), smoothstep(0.45, 0.9, oil).mul(fine.r.mul(0.5).add(0.5)));
  roughness = mix(roughness, float(0.95), cracks);
  const height = mottle.mul(1.5e-4).add(grain.sub(0.5).mul(3e-4)).sub(cracks.mul(6e-4)).add(fine.b.mul(1e-4));
  m.colorNode = color;
  m.roughnessNode = clampRoughness(roughness);
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(height, 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Mur peint
// ---------------------------------------------------------------------------------------------

export interface WallPaintOptions extends MappingOptions, CommonOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** Salissures (0..1, défaut 0,5) : bas de mur, coulures, taches. */
  dirt?: number;
}

/** Peinture murale crème défraîchie : passes de rouleau, jaunissement, bas de mur encrassé. */
export function createWallPaint(env: MaterialEnv, o: WallPaintOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'world',
    scale: o.scale ?? 0.8,
    sharpness: o.sharpness,
  });
  const m = physical(o.name, { color: o.color ?? 0xc9c0a6, roughness: o.roughness ?? 0.88, metalness: 0 });
  const paint = kit.sample('paint.roller');
  const grunge = kit.grunge();
  const noise = kit.sample('noise', 0.5);
  const dirtAmount = o.dirt ?? 0.5;
  const tone = paint.g.sub(0.5).mul(0.12).add(noise.a.sub(0.5).mul(0.12));
  let color: Vec3Node = materialColor.mul(vec3(tone.add(1), tone.add(1), tone.mul(1.3).add(1)));
  // Jaunissement par plaques, crasse au pied du mur, taches.
  color = mix(color, color.mul(vec3(0.95, 0.9, 0.78)), smoothstep(0.4, 0.8, noise.r).mul(0.6));
  const grime = saturate(
    groundGrime(0.35)
      .mul(grunge.a.mul(0.6).add(0.4))
      .add(smoothstep(0.6, 0.9, grunge.r).mul(0.5)),
  );
  color = mix(color, color.mul(vec3(0.55, 0.5, 0.42)), grime.mul(dirtAmount));
  m.colorNode = color;
  m.roughnessNode = clampRoughness(materialRoughness.add(paint.b.sub(0.5).mul(0.08)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(paint.r.mul(1.2e-4).add(paint.b.mul(4e-5)), 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Panneau perforé
// ---------------------------------------------------------------------------------------------

export interface PegboardOptions extends MappingOptions, CommonOptions {
  color?: THREE.ColorRepresentation;
  /** Pas des trous (m, défaut 0,0254 = 1 po). */
  pitch?: number;
  /** Rayon des trous (m, défaut 0,0032). */
  holeRadius?: number;
  /** Axe normal au panneau (repère monde, défaut `z` : panneau fixé sur le mur nord). */
  axis?: 'x' | 'y' | 'z';
  /** Décalage de la grille (m) dans le plan du panneau. */
  offset?: [number, number];
  /** Trous découpés (alphaTest) ou seulement peints (défaut : découpés). */
  cutHoles?: boolean;
}

/**
 * Panneau perforé (isorel peint) : trous de 1 po en quinconce régulier, découpés par test alpha
 * sur les faces orientées selon `axis` ; auréoles de frottement autour des trous (crochets).
 */
export function createPegboard(env: MaterialEnv, o: PegboardOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: o.space ?? 'world', scale: o.scale ?? 2, sharpness: o.sharpness });
  const m = physical(o.name, { color: o.color ?? 0x9b8563, roughness: 0.78, metalness: 0 });
  const paint = kit.sample('paint');
  const grunge = kit.grunge();
  const pitch = o.pitch ?? 0.0254;
  const radius = o.holeRadius ?? 0.0032;
  const axis = o.axis ?? 'z';
  const [ox, oy] = o.offset ?? [0, 0];
  const p = positionWorld;
  const plane: Vec2Node = axis === 'x' ? vec2(p.z, p.y) : axis === 'y' ? vec2(p.x, p.z) : vec2(p.x, p.y);
  const facing =
    axis === 'x'
      ? abs(normalWorldGeometry.x)
      : axis === 'y'
        ? abs(normalWorldGeometry.y)
        : abs(normalWorldGeometry.z);
  const cell = fract(plane.add(vec2(ox, oy)).div(pitch)).sub(0.5);
  const d = length(cell).mul(pitch);
  const onFace = smoothstep(0.6, 0.8, facing);
  const hole = smoothstep(radius + 0.0002, radius - 0.0002, d).mul(onFace);
  const ring = smoothstep(radius * 2.2, radius, d)
    .mul(float(1).sub(hole))
    .mul(onFace);
  const tone = paint.g.sub(0.5).mul(0.2);
  let color: Vec3Node = materialColor.mul(tone.add(1));
  color = mix(color, color.mul(0.62), ring.mul(grunge.a.mul(0.8).add(0.2)).mul(0.6));
  color = mix(color, rgb(PALETTE.dirt), smoothstep(0.55, 0.9, grunge.r).mul(0.3));
  // Fond du trou (si peint) : sombre.
  color = mix(color, rgb(0x16130f), hole);
  m.colorNode = color;
  m.roughnessNode = clampRoughness(materialRoughness.add(paint.b.sub(0.5).mul(0.1)).sub(ring.mul(0.15)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(paint.r.mul(5e-5).sub(ring.mul(4e-5)), 1);
  if (o.cutHoles !== false) {
    m.opacityNode = float(1).sub(hole);
    m.alphaTest = 0.5;
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Carton
// ---------------------------------------------------------------------------------------------

export interface CardboardOptions extends MappingOptions, CommonOptions {
  tint?: THREE.ColorRepresentation;
  wear?: number;
}

/** Carton ondulé kraft : fibres, cannelures, arêtes écrasées et plus sombres, taches. */
export function createCardboard(env: MaterialEnv, o: CardboardOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: o.space ?? 'world', scale: o.scale ?? 3, sharpness: o.sharpness });
  const m = physical(o.name, {
    color: o.tint ?? 0xffffff,
    roughness: 0.9,
    metalness: 0,
    sheen: 0.2,
    sheenColor: 0xf0dcc0,
    sheenRoughness: 0.8,
  });
  const board = kit.sample('cardboard');
  const grunge = kit.grunge();
  const edges = edgeMask(0.006);
  const worn = wearMask(edges, o.wear ?? 0.5, grunge.a);
  let color: Vec3Node = board.rgb.mul(materialColor);
  color = mix(color, color.mul(vec3(0.7, 0.62, 0.52)), worn.mul(0.8));
  color = mix(color, rgb(PALETTE.dirt), dirtMask(grunge, cavityMask(0.006), 0.3).mul(0.5));
  m.colorNode = color;
  m.roughnessNode = clampRoughness(materialRoughness.sub(worn.mul(0.1)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(board.a.mul(1.5e-4).sub(worn.mul(1e-4)), 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Tissus
// ---------------------------------------------------------------------------------------------

export interface FabricOptions extends MappingOptions, CommonOptions {
  /** `cloth` : toile de coton fine ; `rug` : natté grossier à motif de bandes. */
  weave?: 'cloth' | 'rug';
  color: THREE.ColorRepresentation;
  /** Couleur du lustre des fibres (sheen). */
  sheenColor?: THREE.ColorRepresentation;
  roughness?: number;
  /** Taches (0..1). */
  dirt?: number;
  /** Tapis : trois couleurs de motif (bordures, médaillon), le champ prend `color`. */
  stripes?: readonly [THREE.ColorRepresentation, THREE.ColorRepresentation, THREE.ColorRepresentation];
}

/**
 * Tissu : tissage visible (relief, interstices), lustre des fibres (sheen), taches.
 * Tapis (kilim) : bordures à bandes et médaillon en coordonnées UV (0..1 sur le tapis) ; sans UV,
 * couleur unie.
 */
export function createFabric(env: MaterialEnv, o: FabricOptions): THREE.MeshPhysicalNodeMaterial {
  const rug = o.weave === 'rug';
  const kit = new SurfaceKit(env, {
    space: o.space ?? (rug ? 'world' : 'local'),
    scale: o.scale ?? (rug ? 30 : 50),
    sharpness: o.sharpness ?? 6,
  });
  const m = physical(o.name, {
    color: o.color,
    roughness: o.roughness ?? 0.92,
    metalness: 0,
    sheen: 1,
    sheenColor: o.sheenColor ?? 0xffffff,
    sheenRoughness: rug ? 0.55 : 0.4,
  });
  const weave = kit.sample(rug ? 'weave.rug' : 'weave.cloth');
  const grunge = rug ? kit.sampleAbs('grunge', 1.5) : kit.grunge();
  let base: Vec3Node = materialColor;
  if (rug) {
    // Kilim : champ uni (couleur du matériau), bordures à bandes aux deux extrémités (v) et
    // médaillon en losanges concentriques au centre ; contours légèrement crénelés (tissage).
    const [c1, c2, c3] = o.stripes ?? [PALETTE.cream, PALETTE.petrol, PALETTE.burntOrange];
    const p = uv();
    const step = (x: FloatNode) => floor(x.mul(48)).div(48); // crénelage des motifs tissés
    const ends = abs(step(p.y).sub(0.5)).mul(2); // 0 au centre, 1 aux extrémités
    const band = fract(ends.mul(9));
    let c: Vec3Node = materialColor;
    c = select(ends.greaterThan(0.72).and(band.lessThan(0.35)), rgb(c1 ?? PALETTE.cream), c);
    c = select(ends.greaterThan(0.72).and(band.greaterThan(0.6)), rgb(c2 ?? PALETTE.petrol), c);
    c = select(ends.greaterThan(0.93), rgb(c3 ?? PALETTE.burntOrange).mul(0.8), c);
    // Médaillon : distance « losange », rangées de chevrons.
    const diamond = abs(step(p.x).sub(0.5))
      .mul(1.4)
      .add(abs(step(p.y).sub(0.5)));
    const ring = fract(diamond.mul(7));
    const inMedallion = diamond.lessThan(0.42);
    c = select(inMedallion.and(ring.lessThan(0.28)), rgb(c1 ?? PALETTE.cream), c);
    c = select(
      inMedallion.and(ring.greaterThan(0.55)).and(ring.lessThan(0.75)),
      rgb(c2 ?? PALETTE.petrol),
      c,
    );
    c = select(diamond.lessThan(0.08), rgb(c3 ?? PALETTE.burntOrange), c);
    base = c;
  }
  const fiber = weave.b.mul(0.45).add(0.75);
  const gap = float(1).sub(weave.a);
  let color: Vec3Node = base.mul(fiber).mul(float(1).sub(gap.mul(0.5)));
  const stains = smoothstep(0.55, 0.9, grunge.r).mul(o.dirt ?? 0.4);
  color = mix(color, color.mul(vec3(0.55, 0.5, 0.42)), stains);
  color = color.mul(dustMask(grunge, 0.2).mul(0.25).add(1));
  m.colorNode = color;
  m.sheenNode = color.mul(1.4).add(0.04);
  m.roughnessNode = clampRoughness(materialRoughness.add(gap.mul(0.05)));
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(weave.r.mul(rug ? 9e-4 : 1.2e-4), 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Ruban adhésif, tapis antistatique
// ---------------------------------------------------------------------------------------------

/** Ruban adhésif vinyle : jaune vif satiné, légers plis, bords encrassés. */
export function createTape(
  env: MaterialEnv,
  o: { color?: THREE.ColorRepresentation; name?: string } & MappingOptions = {},
): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'local',
    scale: o.scale ?? 20,
    sharpness: o.sharpness,
  });
  const m = physical(o.name, {
    color: o.color ?? PALETTE.tapeYellow,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
  });
  const wrinkles = kit.sample('brushed', 0.1);
  const grunge = kit.grunge();
  const edges = edgeMask(0.001);
  const dirt = saturate(edges.mul(0.7).add(smoothstep(0.6, 0.9, grunge.r).mul(0.5))).mul(0.6);
  m.colorNode = mix(materialColor.mul(wrinkles.a.sub(0.5).mul(0.1).add(1)), rgb(PALETTE.dirt), dirt.mul(0.5));
  m.roughnessNode = clampRoughness(
    smudgeRoughness(materialRoughness.add(dirt.mul(0.3)), fingerprintMask(grunge, 0.3)),
  );
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(wrinkles.r.mul(2e-5), 1);
  return m;
}

/**
 * Tapis antistatique d'établi : caoutchouc vert mat à grain fin, éraflures claires, brûlures de
 * fer à souder (petites taches sombres et luisantes), poussière.
 */
export function createAntistaticMat(
  env: MaterialEnv,
  o: { color?: THREE.ColorRepresentation; name?: string } & MappingOptions = {},
): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: o.space ?? 'world', scale: o.scale ?? 3, sharpness: o.sharpness });
  const m = physical(o.name, {
    color: o.color ?? 0x2f5f45,
    roughness: 0.78,
    metalness: 0,
    sheen: 0.3,
    sheenColor: 0x9fb8a8,
    sheenRoughness: 0.7,
  });
  const noise = kit.sample('noise', 12);
  const grunge = kit.grunge();
  const scratch = kit.sample('scratches');
  const burns = smoothstep(0.93, 0.97, grunge.a).mul(smoothstep(0.4, 0.7, grunge.r));
  const scuffs = saturate(scratch.r.mul(0.6).add(scratch.g.mul(0.3)));
  let color: Vec3Node = materialColor.mul(noise.r.sub(0.5).mul(0.1).add(1));
  color = mix(color, color.mul(1.5).add(0.03), scuffs);
  color = mix(color, rgb(0x121410), burns);
  color = mix(color, rgb(PALETTE.dust), dustMask(grunge, 0.35).mul(0.35));
  m.colorNode = color;
  m.roughnessNode = clampRoughness(
    smudgeRoughness(
      materialRoughness.add(noise.b.sub(0.5).mul(0.1)).sub(burns.mul(0.4)),
      fingerprintMask(grunge, 0.4),
    ),
  );
  m.metalnessNode = materialMetalness;
  m.normalNode = bumpNormal(noise.b.mul(4e-5).sub(scuffs.mul(1.5e-5)).add(burns.mul(-3e-5)), 1);
  return m;
}
