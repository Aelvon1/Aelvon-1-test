/**
 * Fabriques de matériaux « optiques » : verre (transmission), vitre avec pluie, LED (transmission
 * + émission pilotable), sources émissives (filament, néon), écran d'oscilloscope, fond extérieur.
 *
 * Émission pilotable : `userData.setGlow(v)` (v ≥ 0 ; 0 = éteint, 1 = nominal) règle
 * `emissiveIntensity` = v × intensité nominale. Cette propriété est lue par le shader via une
 * référence au matériau (uniform propre à chaque matériau) : une variante créée par
 * `MaterialProvider.variant` possède donc sa propre intensité (voir `userData.onVariant`).
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  fract,
  materialColor,
  materialEmissive,
  materialRoughness,
  max,
  mix,
  normalWorldGeometry,
  pow,
  saturate,
  sin,
  smoothstep,
  texture,
  time,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { bumpNormal } from '../tsl/bump';
import { rgb } from '../tsl/color';
import { type MaterialEnv, type MappingOptions, SurfaceKit } from '../tsl/surface';
import type { FloatNode, Vec3Node } from '../tsl/types';
import { fingerprintMask } from '../tsl/wear';
import { libTexture } from '../libTextures';
import { type CommonOptions, clampRoughness, physical, standard } from './common';

/** Matériau dont l'émission est pilotable. */
export interface GlowUserData {
  /** Règle l'émission (0 = éteint, 1 = nominal, > 1 = surexcité). */
  setGlow(value: number): void;
  /** Émission courante (même échelle). */
  getGlow(): number;
  /** Intensité nominale (`emissiveIntensity` pour v = 1). */
  glowIntensity: number;
}

/** Règle l'émission d'un matériau s'il est pilotable ; retourne faux sinon. */
export function setMaterialGlow(material: THREE.Material, value: number): boolean {
  const setGlow: unknown = material.userData.setGlow;
  if (typeof setGlow !== 'function') return false;
  (setGlow as (v: number) => void)(value);
  return true;
}

/**
 * Installe `setGlow`/`getGlow` sur le matériau et le crochet `onVariant` (appelé par la
 * bibliothèque après clonage) qui les rattache au clone.
 */
export function makeGlowable(
  material: THREE.MeshStandardNodeMaterial,
  intensity: number,
  initial: number,
): THREE.MeshStandardNodeMaterial {
  const bind = (m: THREE.Material & { emissiveIntensity: number }) => {
    let glow = initial;
    m.emissiveIntensity = intensity * glow;
    const data: GlowUserData = {
      glowIntensity: intensity,
      setGlow: (value: number) => {
        glow = Math.max(0, value);
        m.emissiveIntensity = intensity * glow;
      },
      getGlow: () => glow,
    };
    Object.assign(m.userData, data);
  };
  bind(material);
  material.userData.onVariant = (clone: THREE.Material) => {
    if ('emissiveIntensity' in clone) bind(clone as THREE.Material & { emissiveIntensity: number });
  };
  return material;
}

// ---------------------------------------------------------------------------------------------
// Verre
// ---------------------------------------------------------------------------------------------

export interface GlassOptions extends MappingOptions, CommonOptions {
  /** Teinte transmise (défaut blanc). */
  tint?: THREE.ColorRepresentation;
  roughness?: number;
  /** Épaisseur (m) pour la réfraction et l'atténuation (défaut 0,002). */
  thickness?: number;
  ior?: number;
  /** Poussière, traces de doigts (0..1, défaut 0,25). */
  dirt?: number;
  /** Couleur d'atténuation (verre vert en épaisseur) et distance. */
  attenuation?: { color: THREE.ColorRepresentation; distance: number };
}

/** Verre transparent : transmission, réfraction, voile de poussière et traces de doigts. */
export function createGlass(env: MaterialEnv, o: GlassOptions = {}): THREE.MeshPhysicalNodeMaterial {
  const kit = new SurfaceKit(env, {
    space: o.space ?? 'local',
    scale: o.scale ?? 25,
    sharpness: o.sharpness,
  });
  const m = physical(o.name, {
    color: o.tint ?? 0xffffff,
    roughness: o.roughness ?? 0.03,
    metalness: 0,
    transmission: 1,
    thickness: o.thickness ?? 0.002,
    ior: o.ior ?? 1.5,
    attenuationColor: o.attenuation?.color ?? 0xffffff,
    attenuationDistance: o.attenuation?.distance ?? Infinity,
    specularIntensity: 1,
  });
  const grunge = kit.grunge();
  const amount = o.dirt ?? 0.25;
  // Verre propre dans l'ensemble : quelques traces de doigts et un voile de poussière par plaques.
  const prints = fingerprintMask(grunge, amount);
  const dust = saturate(
    smoothstep(0.55, 0.95, grunge.g)
      .mul(0.35)
      .add(smoothstep(0.62, 0.92, grunge.r).mul(0.4))
      .mul(amount * 2),
  );
  m.roughnessNode = clampRoughness(materialRoughness.add(prints.mul(0.2)).add(dust.mul(0.3)), 0.02);
  m.transmissionNode = float(1).sub(dust.mul(0.4));
  m.colorNode = mix(materialColor, vec3(0.62, 0.6, 0.55), dust.mul(0.5));
  return m;
}

export interface WindowGlassOptions extends GlassOptions {
  /** Gouttes de pluie et ruisselets animés (défaut : selon la qualité, absent en Bas). */
  rain?: boolean;
  /** Répétitions du motif de pluie par mètre (défaut 2,5). */
  rainScale?: number;
  /** Vitesse de glissement des ruisselets (m/s, défaut 0,012). */
  rainSpeed?: number;
}

/**
 * Vitre : légèrement verte en épaisseur, sale sur les bords, gouttes de pluie qui réfractent la
 * vue (normale perturbée par la hauteur des gouttes) et ruisselets qui glissent lentement.
 * Mappage des gouttes : UV de la vitre (v vers le haut, 1 répétition = 1/`rainScale` m si les UV
 * sont en mètres — sinon régler `rainScale`).
 */
export function createWindowGlass(
  env: MaterialEnv,
  o: WindowGlassOptions = {},
): THREE.MeshPhysicalNodeMaterial {
  const m = createGlass(env, {
    thickness: 0.004,
    attenuation: { color: 0xd8efe4, distance: 0.08 },
    dirt: 0.3,
    space: 'world',
    scale: 2,
    ...o,
  });
  // Profil de qualité : pas de pluie sur la vitre en qualité Basse (`rainOnGlass`).
  if (!(o.rain ?? env.quality >= 1)) return m;
  const rain = libTexture(env.textures, env.quality, 'raindrops');
  const scale = o.rainScale ?? 2.5;
  const speed = o.rainSpeed ?? 0.012;
  const base = uv().mul(scale);
  // Couche fixe (gouttes posées) + couche qui glisse vers le bas (v décroissant).
  const still = texture(rain, base);
  const sliding = texture(rain, base.mul(0.8).add(vec2(0.37, time.mul(speed * scale * 0.8))));
  const height = max(still.r, sliding.r.mul(sliding.b.mul(0.6).add(0.4)));
  const wet = max(still.g, sliding.g);
  m.normalNode = bumpNormal(height, 0.0012);
  // Les gouttes lavent le voile de poussière : rugosité minimale sous l'eau.
  const dryRoughness = (m.roughnessNode as FloatNode | null) ?? materialRoughness;
  m.roughnessNode = clampRoughness(mix(dryRoughness, float(0.02), wet), 0.02);
  return m;
}

// ---------------------------------------------------------------------------------------------
// LED
// ---------------------------------------------------------------------------------------------

/**
 * LED CMS : lentille d'époxy teintée translucide (transmission) sur réflecteur blanc ; émission
 * pilotable (`userData.setGlow`, éteinte par défaut). Intensité nominale adaptée au bloom.
 */
export function createLed(
  _env: MaterialEnv,
  o: { color: THREE.ColorRepresentation; intensity?: number; glow?: number; name?: string },
): THREE.MeshPhysicalNodeMaterial {
  const c = new THREE.Color(o.color);
  const body = c.clone().lerp(new THREE.Color(0xffffff), 0.25);
  const m = physical(o.name, {
    color: body,
    roughness: 0.18,
    metalness: 0,
    transmission: 0.65,
    thickness: 0.0008,
    ior: 1.5,
    attenuationColor: c,
    attenuationDistance: 0.002,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    emissive: c,
  });
  // Cœur plus lumineux que le bord (puce au centre de la lentille).
  const facing = pow(saturate(abs(normalWorldGeometry.y)), float(2));
  m.emissiveNode = materialEmissive.mul(facing.mul(0.6).add(0.4));
  makeGlowable(m, o.intensity ?? 2.5, o.glow ?? 0);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Sources émissives
// ---------------------------------------------------------------------------------------------

export interface EmissiveOptions extends CommonOptions {
  color: THREE.ColorRepresentation;
  /** Intensité nominale (HDR, défaut 4). */
  intensity?: number;
  /** Émission initiale (0..1, défaut 1 = allumé). */
  glow?: number;
}

/** Source lumineuse (filament, tube néon) : émission pilotable, surface quasi noire éteinte. */
export function createEmissive(_env: MaterialEnv, o: EmissiveOptions): THREE.MeshStandardNodeMaterial {
  const c = new THREE.Color(o.color);
  const m = standard(o.name, {
    color: c.clone().multiplyScalar(0.35),
    roughness: 0.4,
    metalness: 0,
    emissive: c,
  });
  return makeGlowable(m, o.intensity ?? 4, o.glow ?? 1);
}

/**
 * Écran d'oscilloscope à phosphore vert : graticule 10 × 8, trace sinusoïdale animée, rémanence
 * et halo. Mappage : UV (0..1) de la face de l'écran.
 */
export function createScopeScreen(
  _env: MaterialEnv,
  o: { color?: THREE.ColorRepresentation; intensity?: number; name?: string } = {},
): THREE.MeshStandardNodeMaterial {
  const c = new THREE.Color(o.color ?? 0x46ff8a);
  const m = standard(o.name, { color: 0x0a120d, roughness: 0.15, metalness: 0, emissive: c });
  const p = uv();
  // Graticule : lignes fines tous les 1/10 (x) et 1/8 (y), axes centraux plus marqués.
  const gx = abs(fract(p.x.mul(10)).sub(0.5));
  const gy = abs(fract(p.y.mul(8)).sub(0.5));
  const grid = max(smoothstep(0.47, 0.5, gx), smoothstep(0.465, 0.5, gy)).mul(0.25);
  const axes = max(smoothstep(0.004, 0.0, abs(p.x.sub(0.5))), smoothstep(0.004, 0.0, abs(p.y.sub(0.5)))).mul(
    0.2,
  );
  // Trace : sinusoïde amortie qui défile, épaisseur ~1 % de la hauteur, halo doux.
  const phase = p.x
    .mul(3)
    .sub(time.mul(0.35))
    .mul(Math.PI * 2);
  const wave = sin(phase)
    .mul(0.22)
    .mul(sin(p.x.mul(Math.PI)).mul(0.6).add(0.4))
    .add(0.5);
  const d = abs(p.y.sub(wave));
  const trace = smoothstep(0.012, 0.0, d).add(smoothstep(0.06, 0.0, d).mul(0.25));
  const border = smoothstep(0.0, 0.04, p.x)
    .mul(smoothstep(1, 0.96, p.x))
    .mul(smoothstep(0, 0.04, p.y))
    .mul(smoothstep(1, 0.96, p.y));
  const glow: FloatNode = saturate(trace.add(grid).add(axes).add(0.03)).mul(border);
  m.emissiveNode = materialEmissive.mul(glow);
  return makeGlowable(m, o.intensity ?? 3, 1);
}

// ---------------------------------------------------------------------------------------------
// Fond extérieur
// ---------------------------------------------------------------------------------------------

/**
 * Fond vu par la fenêtre : forêt dans la brume (texture `forest`, UV : u horizontal, v vers le
 * haut) + voile de brume qui dérive lentement. Non éclairé (`MeshBasicNodeMaterial`),
 * luminosité réglable par `setGlow`.
 */
export function createForestBackdrop(
  env: MaterialEnv,
  o: { brightness?: number; name?: string } = {},
): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
  if (o.name) m.name = o.name;
  const forest = libTexture(env.textures, env.quality, 'forest');
  const noise = libTexture(env.textures, env.quality, 'noise');
  const img = texture(forest, uv());
  const drift = texture(
    noise,
    uv()
      .mul(vec2(1.5, 0.8))
      .add(vec2(time.mul(0.004), 0)),
  ).a;
  const fogColor: Vec3Node = rgb(0xc5cbc7);
  const mist = smoothstep(0.35, 0.9, drift)
    .mul(float(1).sub(img.a.mul(0.6)))
    .mul(0.35);
  const brightness = o.brightness ?? 1;
  m.colorNode = mix(img.rgb, fogColor, mist).mul(materialColor).mul(brightness);
  m.fog = false;
  m.userData.setGlow = (v: number) => m.color.setScalar(Math.max(0, v));
  m.userData.getGlow = () => m.color.r;
  return m;
}
