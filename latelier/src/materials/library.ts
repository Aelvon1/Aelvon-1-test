/**
 * Enregistrement de la bibliothèque de base (identifiants `BASE_MATERIAL_IDS`).
 *
 * Chaque identifiant est associé à une fabrique paramétrable (`materials/factories/*`) écrite
 * en TSL sur des `MeshPhysicalNodeMaterial` / `MeshStandardNodeMaterial`. Le type
 * `Record<BaseMaterialId, …>` garantit qu'aucun identifiant n'est oublié.
 *
 * Conventions :
 * - pièces d'objets : mappage LOCAL (la texture suit la pièce démontée), ~25 répétitions/m ;
 * - décor fixe : mappage MONDE ;
 * - couleur/rugosité/métallicité lues depuis les propriétés du matériau : `variant()` fonctionne ;
 * - émission pilotable (LED, sources, écran) : `userData.setGlow(v)` (voir `factories/optics.ts`).
 */
import type * as THREE from 'three/webgpu';
import { BASE_MATERIAL_IDS, type BaseMaterialId, type MaterialFactoryContext, type MaterialLibrary } from './types';
import type { MaterialEnv } from './tsl/surface';
import { PALETTE } from './palette';
import {
  createAnodized,
  createBareMetal,
  createGalvanized,
  createGroundSteel,
  createPaintedMetal,
  createRustyMetal,
} from './factories/metal';
import {
  createCeramic,
  createEpoxy,
  createFr4,
  createHeatShrink,
  createPaper,
  createPlastic,
  createResin,
  createRubber,
  createSilicone,
  createSiliconDie,
  createSilkscreen,
  createSolderMask,
  createWovenComposite,
} from './factories/dielectric';
import {
  createEmissive,
  createForestBackdrop,
  createGlass,
  createLed,
  createScopeScreen,
  createWindowGlass,
} from './factories/optics';
import {
  createAntistaticMat,
  createCardboard,
  createConcrete,
  createFabric,
  createPegboard,
  createTape,
  createWallPaint,
  createWood,
} from './factories/workshop';

type Recipe = (env: MaterialEnv, name: string) => THREE.Material;

const anodized =
  (color: number, roughness = 0.38): Recipe =>
  (env, name) =>
    createAnodized(env, { name, color, roughness });

const painted =
  (color: number, extra: { gloss?: number; wear?: number; rust?: number; primer?: number } = {}): Recipe =>
  (env, name) =>
    createPaintedMetal(env, { name, color, ...extra });

export const BASE_RECIPES: Record<BaseMaterialId, Recipe> = {
  // --- Métaux ---
  'alu.anodized.blue': anodized(0x2c5d73),
  'alu.anodized.black': anodized(0x1d1f22, 0.42),
  'alu.anodized.red': anodized(0x8c2320),
  'alu.anodized.silver': anodized(0xb8bcc2, 0.34),
  'alu.machined': (env, name) =>
    createBareMetal(env, { name, color: 0xc9ccd0, roughness: 0.28, finish: 'brushed', scratches: 0.35, wear: 0.3 }),
  'steel.ground': (env, name) => createGroundSteel(env, { name }),
  'steel.blackoxide': (env, name) =>
    createBareMetal(env, {
      name,
      color: 0x2a2b2e,
      roughness: 0.42,
      wear: 0.45,
      edgeColor: 0x8d9196,
      scratches: 0.3,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
    }),
  'steel.zinc': (env, name) =>
    createBareMetal(env, {
      name,
      color: 0xb9bec4,
      roughness: 0.32,
      iridescence: 0.28,
      iridescenceThicknessRange: [250, 480],
      scratches: 0.2,
    }),
  'steel.stainless': (env, name) =>
    createBareMetal(env, { name, color: 0xcfd3d8, roughness: 0.18, finish: 'brushed', scratches: 0.25 }),
  'steel.chrome': (env, name) =>
    createBareMetal(env, { name, color: 0xe6e8ea, roughness: 0.05, scratches: 0.15, fingerprints: 0.6, wear: 0.1 }),
  'steel.electrical': (env, name) =>
    createBareMetal(env, {
      name,
      color: 0x4a4d52,
      roughness: 0.45,
      metalness: 0.85,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      wear: 0.6,
      edgeColor: 0x4f5f80,
      scratches: 0.1,
    }),
  'steel.spring': (env, name) =>
    createBareMetal(env, {
      name,
      color: 0x3a4556,
      roughness: 0.33,
      iridescence: 0.45,
      iridescenceThicknessRange: [300, 520],
      scratches: 0.25,
      wear: 0.3,
      edgeColor: 0x7d8590,
    }),
  'copper.enamel': (env, name) =>
    createBareMetal(env, {
      name,
      color: 0xb8622a,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      scratches: 0.05,
      fingerprints: 0.1,
      wear: 0,
      dirt: 0.05,
    }),
  'copper.bare': (env, name) =>
    createBareMetal(env, {
      name,
      color: 0xd08850,
      roughness: 0.3,
      tarnish: { color: 0x5c2e1a, amount: 0.5 },
      scratches: 0.2,
    }),
  nickel: (env, name) => createBareMetal(env, { name, color: 0xc9c6bd, roughness: 0.22, scratches: 0.15 }),
  brass: (env, name) =>
    createBareMetal(env, { name, color: 0xc9a04a, roughness: 0.3, tarnish: { color: 0x5a4a22, amount: 0.35 } }),
  gold: (env, name) =>
    createBareMetal(env, {
      name,
      color: 0xe8b64c,
      roughness: 0.22,
      scratches: 0.05,
      fingerprints: 0.1,
      wear: 0,
      scale: 200,
    }),
  tin: (env, name) =>
    createBareMetal(env, {
      name,
      color: 0xc9ccce,
      roughness: 0.32,
      finish: 'grainy',
      relief: 4e-6,
      scale: 200,
      scratches: 0.05,
      wear: 0.1,
    }),
  solder: (env, name) =>
    createBareMetal(env, {
      name,
      color: 0xd5d7d9,
      roughness: 0.12,
      finish: 'grainy',
      relief: 1.5e-6,
      scale: 300,
      scratches: 0,
      fingerprints: 0.05,
      wear: 0,
      dirt: 0.05,
    }),
  'solder.flux': (env, name) =>
    createResin(env, { name, color: 0xc98a3a, transmission: 0.7, thickness: 0.0003, roughness: 0.12, scale: 300 }),
  // --- Non-métaux techniques ---
  'fiber.glass': (env, name) => createWovenComposite(env, { name, kind: 'glass' }),
  'fiber.carbon': (env, name) => createWovenComposite(env, { name, kind: 'carbon' }),
  'paper.insulation': (env, name) =>
    createPaper(env, { name, color: 0xd8c9a0, roughness: 0.8, sheen: 0.3, scale: 60, dirt: 0.15 }),
  'varnish.impregnation': (env, name) =>
    createResin(env, { name, color: 0xb46a24, transmission: 0.55, thickness: 0.0006, roughness: 0.15 }),
  'silicone.red': (env, name) => createSilicone(env, 0xa3231e, name),
  'silicone.black': (env, name) => createSilicone(env, 0x1b1b1b, name),
  'silicone.yellow': (env, name) => createSilicone(env, 0xd9b21f, name),
  'silicone.blue': (env, name) => createSilicone(env, 0x1f4fa3, name),
  'heatshrink.red': (env, name) => createHeatShrink(env, 0x9a1f1a, name),
  'heatshrink.black': (env, name) => createHeatShrink(env, 0x151515, name),
  'heatshrink.yellow': (env, name) => createHeatShrink(env, 0xd2ae1c, name),
  'heatshrink.blue': (env, name) => createHeatShrink(env, 0x1d4796, name),
  'plastic.black': (env, name) => createPlastic(env, { name, color: 0x161616, roughness: 0.55 }),
  'plastic.white': (env, name) => createPlastic(env, { name, color: 0xe8e6e0, roughness: 0.5, dirt: 0.3 }),
  'plastic.nylon': (env, name) =>
    createPlastic(env, {
      name,
      color: 0xe3dcc6,
      roughness: 0.55,
      texture: 'smooth',
      sheen: 0.3,
      sheenColor: 0xfff8e6,
    }),
  'plastic.pbt.black': (env, name) =>
    createPlastic(env, { name, color: 0x121212, roughness: 0.62, relief: 8e-6, scale: 60 }),
  'rubber.black': (env, name) => createRubber(env, { name, color: 0x141414 }),
  'epoxy.black': (env, name) => createEpoxy(env, { name }),
  'ceramic.tan': (env, name) => createCeramic(env, 0xa98b64, name),
  'ceramic.white': (env, name) => createCeramic(env, 0xe9e6de, name),
  'ceramic.gray': (env, name) => createCeramic(env, 0x8d8f91, name),
  'resistor.black': (env, name) => createEpoxy(env, { name, color: 0x111111 }),
  'fr4.core': (env, name) => createFr4(env, { name }),
  'mask.teal': (env, name) => createSolderMask(env, { name }),
  'silk.white': (env, name) => createSilkscreen(env, { name }),
  'silicon.die': (env, name) => createSiliconDie(env, { name }),
  'glass.clear': (env, name) => createGlass(env, { name, dirt: 0.15 }),
  'led.green': (env, name) => createLed(env, { name, color: PALETTE.ledGreen }),
  'led.yellow': (env, name) => createLed(env, { name, color: PALETTE.ledYellow }),
  'led.red': (env, name) => createLed(env, { name, color: PALETTE.ledRed }),
  'magnet.ndfeb.raw': (env, name) =>
    createBareMetal(env, {
      name,
      color: 0x6d6a66,
      roughness: 0.55,
      metalness: 0.8,
      finish: 'grainy',
      relief: 1e-5,
      scale: 60,
      scratches: 0.1,
      wear: 0.1,
    }),
  // --- Atelier (décor) ---
  'wood.bench': (env, name) => createWood(env, { name, variant: 'bench' }),
  'wood.plywood': (env, name) => createWood(env, { name, variant: 'plywood' }),
  'wood.pegboard': (env, name) => createPegboard(env, { name }),
  'concrete.floor': (env, name) => createConcrete(env, { name }),
  'paint.wall': (env, name) => createWallPaint(env, { name }),
  'metal.painted.olive': painted(PALETTE.olive),
  'metal.painted.orange': painted(PALETTE.burntOrange),
  'metal.painted.teal': painted(PALETTE.petrol),
  'metal.painted.cream': painted(PALETTE.cream, { primer: PALETTE.primerGray }),
  'metal.painted.red': painted(PALETTE.signalRed, { gloss: 0.7, wear: 0.25, rust: 0.1 }),
  'metal.galvanized': (env, name) => createGalvanized(env, { name }),
  'metal.rusty': (env, name) => createRustyMetal(env, { name }),
  'rubber.mat.green': (env, name) => createAntistaticMat(env, { name }),
  'fabric.rug': (env, name) =>
    createFabric(env, { name, weave: 'rug', color: 0x7b3b2a, sheenColor: 0xd9a07a }),
  'fabric.cloth': (env, name) =>
    createFabric(env, { name, weave: 'cloth', color: 0x5e6b73, sheenColor: 0xc8d4dc }),
  cardboard: (env, name) => createCardboard(env, { name }),
  'glass.window': (env, name) => createWindowGlass(env, { name }),
  'tape.yellow': (env, name) => createTape(env, { name }),
  'paper.label': (env, name) => createPaper(env, { name, color: 0xe9e1c8, roughness: 0.85 }),
  'emissive.tungsten': (env, name) => createEmissive(env, { name, color: 0xffc67a, intensity: 12 }),
  'emissive.neon': (env, name) => createEmissive(env, { name, color: 0xe8fff0, intensity: 5 }),
  'emissive.screen': (env, name) => createScopeScreen(env, { name }),
  'backdrop.forest': (env, name) => createForestBackdrop(env, { name }),
};

/** Environnement des fabriques à partir du contexte de la bibliothèque. */
export const envFromContext = (ctx: MaterialFactoryContext): MaterialEnv => ({
  textures: ctx.textures,
  quality: ctx.quality,
});

export function registerBaseMaterials(library: MaterialLibrary): void {
  for (const id of BASE_MATERIAL_IDS) {
    const recipe = BASE_RECIPES[id];
    library.register(id, (ctx) => recipe(envFromContext(ctx), id));
  }
}
