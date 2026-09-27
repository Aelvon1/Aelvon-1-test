/**
 * Fabriques de métaux : métal nu (usiné, poli, plaqué, oxydé), aluminium anodisé, acier rectifié
 * anisotrope, métal peint usé, tôle galvanisée, métal rouillé.
 *
 * Toutes lisent la couleur, la rugosité et la métallicité du matériau (`materialColor`…) : les
 * variantes (`MaterialProvider.variant`) restent donc pilotables par ces propriétés.
 */
import type * as THREE from 'three/webgpu';
import {
  float,
  materialColor,
  materialMetalness,
  materialRoughness,
  max,
  mix,
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
  rustMask,
  smudgeRoughness,
  wearMask,
} from '../tsl/wear';
import { PALETTE } from '../palette';
import { type CommonOptions, clampRoughness, physical } from './common';

/** Couleur de rouille variée (brun sombre → orange) selon `hue` (0..1) et les piqûres. */
export function rustColor(hue: FloatNode, pits: FloatNode): Vec3Node {
  const dark = rgb(PALETTE.rustDark);
  const mid = rgb(PALETTE.rust);
  const light = rgb(PALETTE.rustLight);
  const c = mix(mix(dark, mid, smoothstep(0.1, 0.55, hue)), light, smoothstep(0.6, 0.95, hue));
  return c.mul(float(1).sub(pits.mul(0.5)));
}

// ---------------------------------------------------------------------------------------------
// Métal nu
// ---------------------------------------------------------------------------------------------

export interface BareMetalOptions extends MappingOptions, CommonOptions {
  color: THREE.ColorRepresentation;
  /** Rugosité de base (défaut 0,3). */
  roughness?: number;
  /** Aspect de surface : lisse, brossé (stries triplanaires) ou grenu (fonderie, frittage). */
  finish?: 'smooth' | 'brushed' | 'grainy';
  /** Rayures (0..1, défaut 0,3). */
  scratches?: number;
  /** Traces de doigts (0..1, défaut 0,35). */
  fingerprints?: number;
  /** Usure des arêtes : arêtes lustrées et éclaircies (0..1, défaut 0,3). */
  wear?: number;
  /** Couleur révélée par l'usure des arêtes et les rayures (métal sous un revêtement). */
  edgeColor?: THREE.ColorRepresentation;
  /** Oxydation (ternissure) dans les recoins, les taches et sous les doigts. */
  tarnish?: { color: THREE.ColorRepresentation; amount: number };
  /** Crasse (0..1, défaut 0,15). */
  dirt?: number;
  /** Rayon de congé considéré comme arête (m, défaut 0,002). */
  edgeRadius?: number;
  /** Amplitude du relief de surface (m, défaut 1,5e-5). */
  relief?: number;
  /** Irisation (couche mince : trempe, chromatation, oxyde). */
  iridescence?: number;
  iridescenceThicknessRange?: [number, number];
  clearcoat?: number;
  clearcoatRoughness?: number;
  metalness?: number;
}

export function createBareMetal(env: MaterialEnv, o: BareMetalOptions): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: o.space ?? 'local', scale: o.scale ?? 25, sharpness: o.sharpness });
  const m = physical(o.name, {
    color: o.color,
    roughness: o.roughness ?? 0.3,
    metalness: o.metalness ?? 1,
    clearcoat: o.clearcoat ?? 0,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.1,
    iridescence: o.iridescence ?? 0,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: o.iridescenceThicknessRange ?? [180, 420],
  });
  const grunge = kit.grunge();
  const noise = kit.sample('noise');
  const scratch = kit.sample('scratches', 1.6);
  const edges = edgeMask(o.edgeRadius ?? 0.002);
  const cavity = cavityMask(o.edgeRadius ?? 0.002);
  const relief = o.relief ?? 1.5e-5;

  let color: Vec3Node = materialColor.mul(noise.r.sub(0.5).mul(0.14).add(1));
  let roughness: FloatNode = materialRoughness.add(noise.g.sub(0.5).mul(0.08));
  let height: FloatNode = float(0);

  if (o.finish === 'brushed') {
    const brushed = kit.sample('brushed', 0.5);
    color = color.mul(brushed.r.sub(0.5).mul(0.1).add(1));
    roughness = roughness.add(brushed.r.sub(0.5).mul(0.14)).add(brushed.g.sub(0.5).mul(0.06));
    height = height.add(brushed.g.mul(relief * 0.3));
  } else if (o.finish === 'grainy') {
    roughness = roughness.add(noise.b.sub(0.5).mul(0.2));
    height = height.add(noise.b.mul(relief * 2)).add(noise.g.mul(relief));
  }

  // Arêtes : lustrées par les manipulations (plus claires, plus lisses) ou revêtement usé.
  const wear = o.wear ?? 0.3;
  const worn = wearMask(edges, wear, grunge.a);
  if (o.edgeColor !== undefined) {
    color = mix(color, rgb(o.edgeColor).mul(noise.g.mul(0.2).add(0.9)), worn);
    roughness = mix(roughness, float(0.28), worn);
  } else {
    color = color.mul(edges.mul(wear * 0.25).add(1));
    roughness = roughness.mul(float(1).sub(edges.mul(wear * 0.45)));
  }

  // Rayures : sillons qui diffusent la lumière (plus rugueux), révélant le métal sous-jacent.
  const scratches = o.scratches ?? 0.3;
  const scratchMask = saturate(scratch.r.mul(scratches * 1.4).add(scratch.g.mul(scratches * 0.5)));
  roughness = roughness.add(scratchMask.mul(0.18));
  if (o.edgeColor !== undefined) color = mix(color, rgb(o.edgeColor), scratch.r.mul(scratches));
  height = height.sub(scratch.b.mul(relief * scratches * 0.6));

  // Ternissure (cuivre, laiton) : recoins, grandes taches et empreintes.
  const prints = fingerprintMask(grunge, o.fingerprints ?? 0.35);
  if (o.tarnish && o.tarnish.amount > 0) {
    const t = saturate(
      cavity
        .mul(0.9)
        .add(smoothstep(0.5, 0.9, grunge.r).mul(0.7))
        .add(prints.mul(1.4))
        .mul(o.tarnish.amount),
    );
    color = mix(color, rgb(o.tarnish.color), t);
    roughness = roughness.add(t.mul(0.22));
  }
  roughness = smudgeRoughness(roughness, prints);

  // Crasse et poussière (réduisent la métallicité).
  const dirt = dirtMask(grunge, cavity, o.dirt ?? 0.15);
  const dust = dustMask(grunge, (o.dirt ?? 0.15) * 0.6);
  const grime = max(dirt, dust.mul(0.7));
  color = mix(color, mix(rgb(PALETTE.dirt), rgb(PALETTE.dust), dust), grime.mul(0.85));
  roughness = mix(roughness, float(0.85), grime);

  m.colorNode = color;
  m.roughnessNode = clampRoughness(roughness);
  m.metalnessNode = materialMetalness.mul(float(1).sub(grime.mul(0.8)));
  m.normalNode = bumpNormal(height, 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Aluminium anodisé
// ---------------------------------------------------------------------------------------------

export interface AnodizedOptions extends MappingOptions, CommonOptions {
  color: THREE.ColorRepresentation;
  roughness?: number;
  /** Éclats d'anodisation sur les arêtes (0..1, défaut 0,25). */
  wear?: number;
  scratches?: number;
  fingerprints?: number;
}

/**
 * Aluminium anodisé satiné : couleur de teinture portée par le métal, léger brossage, arêtes
 * écaillées et rayures révélant l'aluminium brut.
 */
export function createAnodized(env: MaterialEnv, o: AnodizedOptions): THREE.MeshPhysicalNodeMaterial {
  return createBareMetal(env, {
    ...o,
    roughness: o.roughness ?? 0.38,
    finish: 'brushed',
    wear: o.wear ?? 0.25,
    edgeColor: 0xc9cdd2,
    scratches: o.scratches ?? 0.25,
    fingerprints: o.fingerprints ?? 0.4,
    dirt: 0.1,
    edgeRadius: 0.0015,
  });
}

// ---------------------------------------------------------------------------------------------
// Acier rectifié (anisotrope)
// ---------------------------------------------------------------------------------------------

export interface GroundSteelOptions extends CommonOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** Intensité de l'anisotropie (0..1, défaut 0,8). */
  anisotropy?: number;
  /** Répétitions de la texture de stries en U (circonférence) et V (longueur). */
  repeat?: [number, number];
  /** Sens des stries : `u` (défaut, stries sur la circonférence) ou `v`. */
  grain?: 'u' | 'v';
  fingerprints?: number;
  /** Mappage des traces de doigts/salissures (défaut local, 25 rép./m). */
  mapping?: MappingOptions;
}

/**
 * Acier rectifié : reflet étiré perpendiculairement aux stries de rectification.
 *
 * Anisotropie dans three r186 (`MeshPhysicalNodeMaterial`) : la direction d'anisotropie est
 * exprimée dans le repère tangent (T, B, N) — `anisotropyRotation` = 0 étire le reflet le long de
 * T (sens des U croissants), π/2 le long de B (sens des V). T et B viennent de l'attribut
 * `tangent` s'il existe, sinon d'un repère reconstruit par dérivées écran des UV (`uv` canal 0).
 *
 * CE QUE LA GÉOMÉTRIE DOIT FOURNIR :
 * - des UV avec u = circonférence et v = longueur de l'arbre (convention de `CylinderGeometry`
 *   et `LatheGeometry`) ; sans UV, le repère tangent est nul et le reflet redevient isotrope ;
 * - de préférence `geometry.computeTangents()` (géométrie indexée avec position/normal/uv) :
 *   repère stable, sans le crénelage des dérivées écran.
 * Les stries de rectification suivant la circonférence (u), le reflet est étiré le long de
 * l'axe : rotation π/2 (option `grain: 'v'` pour une géométrie à UV transposées).
 */
export function createGroundSteel(env: MaterialEnv, o: GroundSteelOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: 'local', scale: 25, ...o.mapping });
  const grain = o.grain ?? 'u';
  const m = physical(o.name, {
    color: o.color ?? 0xc4c7cc,
    roughness: o.roughness ?? 0.2,
    metalness: 1,
    anisotropy: o.anisotropy ?? 0.8,
    anisotropyRotation: grain === 'u' ? Math.PI / 2 : 0,
  });
  const [ru, rv] = o.repeat ?? [1, 3];
  // Texture `brushed` : stries le long de U de la texture ; permutation pour `grain: 'v'`.
  const streaks = grain === 'u' ? kit.sampleUV('brushed', ru, rv) : kit.sampleUV('brushed', rv, ru);
  const grunge = kit.grunge();
  const prints = fingerprintMask(grunge, o.fingerprints ?? 0.3);
  const color = materialColor.mul(streaks.r.sub(0.5).mul(0.12).add(1)).mul(streaks.a.sub(0.5).mul(0.08).add(1));
  const roughness = materialRoughness.add(streaks.r.sub(0.5).mul(0.1)).add(streaks.b.mul(0.12));
  m.colorNode = color;
  m.roughnessNode = clampRoughness(smudgeRoughness(roughness, prints));
  m.metalnessNode = materialMetalness;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Métal peint usé
// ---------------------------------------------------------------------------------------------

export interface PaintedMetalOptions extends MappingOptions, CommonOptions {
  color: THREE.ColorRepresentation;
  /** Usure des arêtes jusqu'à la sous-couche puis au métal (0..1, défaut 0,45). */
  wear?: number;
  /** Rouille dans les recoins et sous les éclats (0..1, défaut 0,3). */
  rust?: number;
  /** Crasse, poussière (0..1, défaut 0,4). */
  dirt?: number;
  /** Rugosité de la peinture (défaut 0,55). */
  roughness?: number;
  /** Vernis brillant (0..1, défaut 0) : peinture laquée (extincteur). */
  gloss?: number;
  /** Sous-couche (défaut : minium). */
  primer?: THREE.ColorRepresentation;
  /** Métal nu sous la peinture. */
  metal?: THREE.ColorRepresentation;
  /** Intensité du grain peint à la main (défaut 1). */
  brush?: number;
  /** Rayon de congé considéré comme arête (m, défaut 0,008). */
  edgeRadius?: number;
  fingerprints?: number;
}

/**
 * Métal peint : grain de pinceau, arêtes éclaircies puis écaillées (sous-couche, métal nu),
 * rayures, rouille dans les recoins, crasse et poussière, traces de doigts.
 * Défaut : décor (mappage monde, 3 répétitions par mètre).
 */
export function createPaintedMetal(env: MaterialEnv, o: PaintedMetalOptions): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: o.space ?? 'world', scale: o.scale ?? 3, sharpness: o.sharpness });
  const gloss = o.gloss ?? 0;
  const m = physical(o.name, {
    color: o.color,
    roughness: o.roughness ?? 0.55,
    metalness: 0,
    clearcoat: gloss,
    clearcoatRoughness: 0.18,
  });
  const paint = kit.sample('paint');
  const grunge = kit.grunge();
  const rust = kit.sample('rust', 0.8);
  const scratch = kit.sample('scratches', 1.5);
  const radius = o.edgeRadius ?? 0.008;
  const edges = edgeMask(radius);
  const cavity = cavityMask(radius);
  const brush = o.brush ?? 1;
  const wear = o.wear ?? 0.45;

  // Peinture : vibration de teinte par touche, arêtes éclaircies (DA : lecture des volumes).
  const tone = paint.g.sub(0.5).mul(0.3 * brush);
  let color: Vec3Node = materialColor.mul(vec3(tone.mul(1.1).add(1), tone.add(1), tone.mul(0.85).add(1)));
  color = color.mul(edges.mul(0.35 * (0.4 + wear)).add(1)).add(edges.mul(0.015));
  let roughness: FloatNode = materialRoughness.add(paint.b.sub(0.5).mul(0.12)).sub(edges.mul(0.1));

  // Éclats : sous-couche autour, métal nu au cœur.
  const chip = wearMask(edges, wear, paint.a);
  const bare = wearMask(edges, wear * 0.72, paint.a, 0.04);
  const primer = rgb(o.primer ?? PALETTE.primerRed);
  const metal = rgb(o.metal ?? PALETTE.bareSteel);
  color = mix(color, primer.mul(paint.g.mul(0.2).add(0.9)), chip);
  color = mix(color, metal.mul(grunge.a.mul(0.25).add(0.8)), bare);
  roughness = mix(roughness, float(0.65), chip);
  roughness = mix(roughness, float(0.32), bare);

  // Rayures traversant la peinture : lignes claires et métalliques.
  const scratchLine = saturate(scratch.r.mul(wear * 1.3));
  color = mix(color, metal, scratchLine.mul(0.7));
  let metalness: FloatNode = max(bare, scratchLine.mul(0.8));
  roughness = mix(roughness, float(0.4), scratchLine);

  // Rouille : recoins, éclats, arêtes.
  const rusty = rustMask({ coverage: rust.r, cavity: max(cavity, bare.mul(0.8)), edges: chip, amount: o.rust ?? 0.3 });
  color = mix(color, rustColor(rust.b, rust.g), rusty);
  roughness = mix(roughness, float(0.9), rusty);
  metalness = metalness.mul(float(1).sub(rusty));

  // Crasse, poussière, traces de doigts.
  const dirtAmount = o.dirt ?? 0.4;
  const dirt = dirtMask(grunge, cavity, dirtAmount);
  const dust = dustMask(grunge, dirtAmount * 0.7);
  color = mix(color, rgb(PALETTE.dirt).mul(grunge.g.mul(0.4).add(0.8)), dirt.mul(0.75));
  color = mix(color, rgb(PALETTE.dust), dust.mul(0.5));
  roughness = mix(roughness, float(0.85), max(dirt, dust));
  const prints = fingerprintMask(grunge, o.fingerprints ?? 0.4);
  roughness = smudgeRoughness(roughness, prints);
  color = color.mul(float(1).sub(prints.mul(0.06)));

  // Relief : touches de pinceau, marche des éclats, boursouflures de rouille.
  const height = paint.r
    .mul(6e-5 * brush)
    .sub(chip.mul(4e-5))
    .sub(scratch.b.mul(wear * 3e-5))
    .add(rust.a.mul(rusty).mul(1.5e-4));

  m.colorNode = color;
  m.roughnessNode = clampRoughness(roughness);
  m.metalnessNode = metalness;
  m.normalNode = bumpNormal(height, 1);
  if (gloss > 0) m.clearcoatNode = float(gloss).mul(float(1).sub(max(chip, rusty)));
  return m;
}

// ---------------------------------------------------------------------------------------------
// Tôle galvanisée
// ---------------------------------------------------------------------------------------------

export interface GalvanizedOptions extends MappingOptions, CommonOptions {
  color?: THREE.ColorRepresentation;
  roughness?: number;
  /** Rouille blanche (oxyde de zinc) dans les recoins (0..1, défaut 0,4). */
  whiteRust?: number;
  dirt?: number;
}

/** Tôle galvanisée : fleurs de zinc (cellules de reflets inégaux), rouille blanche, crasse. */
export function createGalvanized(env: MaterialEnv, o: GalvanizedOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: o.space ?? 'world', scale: o.scale ?? 4, sharpness: o.sharpness });
  const m = physical(o.name, { color: o.color ?? 0x9ea4a6, roughness: o.roughness ?? 0.4, metalness: 1 });
  // Fleurage : canal A de `rust` (cellules) détourné comme motif cristallin.
  const cells = kit.sample('rust', 2);
  const grunge = kit.grunge();
  const cavity = cavityMask(0.01);
  const spangle = cells.a.sub(0.35).mul(1.4);
  let color: Vec3Node = materialColor.mul(spangle.mul(0.18).add(1));
  let roughness: FloatNode = materialRoughness.add(spangle.mul(0.2)).add(cells.b.sub(0.5).mul(0.1));
  const white = saturate(cavity.mul(0.8).add(smoothstep(0.55, 0.9, grunge.r).mul(0.6)).mul(o.whiteRust ?? 0.4));
  color = mix(color, vec3(0.62, 0.63, 0.6), white);
  roughness = mix(roughness, float(0.9), white);
  const dirt = dirtMask(grunge, cavity, o.dirt ?? 0.3);
  color = mix(color, rgb(PALETTE.dirt), dirt.mul(0.7));
  roughness = mix(roughness, float(0.85), dirt);
  m.colorNode = color;
  m.roughnessNode = clampRoughness(smudgeRoughness(roughness, fingerprintMask(grunge, 0.3)));
  m.metalnessNode = materialMetalness.mul(float(1).sub(max(white, dirt).mul(0.9)));
  m.normalNode = bumpNormal(cells.a.mul(1e-5), 1);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Métal rouillé
// ---------------------------------------------------------------------------------------------

export interface RustyMetalOptions extends MappingOptions, CommonOptions {
  /** Couverture de rouille (0..1, défaut 0,85). */
  amount?: number;
  /** Restes de peinture (couleur) entre les plaques de rouille. */
  paint?: THREE.ColorRepresentation;
}

/** Métal très rouillé : calamine sombre, rouille orange feuilletée, restes de peinture. */
export function createRustyMetal(env: MaterialEnv, o: RustyMetalOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, { space: o.space ?? 'world', scale: o.scale ?? 3, sharpness: o.sharpness });
  const m = physical(o.name, { color: 0x6e4128, roughness: 0.85, metalness: 0.4 });
  const rust = kit.sample('rust');
  const grunge = kit.grunge();
  const cavity = cavityMask(0.01);
  const amount = o.amount ?? 0.85;
  const rusty = rustMask({ coverage: rust.r, cavity, amount });
  const base = mix(rgb(PALETTE.graphite), rgb(o.paint ?? PALETTE.olive), smoothstep(0.3, 0.7, grunge.a));
  const rc = rustColor(rust.b, rust.g).mul(materialColor.div(rgb(0x6e4128)));
  const color = mix(base, rc, rusty);
  const roughness = mix(float(0.5), materialRoughness.add(rust.g.mul(0.1)), rusty);
  m.colorNode = color;
  m.roughnessNode = clampRoughness(roughness);
  m.metalnessNode = mix(float(0.3), float(0), rusty).mul(materialMetalness.div(0.4));
  m.normalNode = bumpNormal(rust.a.mul(rusty).mul(3e-4).add(rust.g.mul(-6e-5)), 1);
  return m;
}
