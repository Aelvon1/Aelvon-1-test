/**
 * API publique de la bibliothèque de matériaux, pour le décor et les objets.
 *
 * - Matériaux de base : `ctx.materials.get('<id>')` (identifiants `BASE_MATERIAL_IDS`) ;
 *   variantes : `ctx.materials.variant('<id>', { color, roughness, map, … })`.
 * - Matériaux sur mesure : fabriques paramétrables ci-dessous (ex. `createPaintedMetal(env,
 *   { color, wear, rust })`), où `env` = `{ textures, quality }` (services du contexte). À
 *   enregistrer de préférence dans la bibliothèque (`ObjectDef.materials` ou `register`) pour
 *   qu'ils soient partagés et libérés avec leur portée.
 * - Aides TSL pour écrire ses propres nœuds : mappage triplanaire, relief, masques d'usure.
 * - Géométrie : `applyEdgeWear` / `applyOcclusion` ajoutent les attributs lus par les masques.
 * - Émission pilotable (LED, lampes, écran) : `setMaterialGlow(material, v)`.
 */
export { BASE_MATERIAL_IDS, type BaseMaterialId } from './types';
export { PALETTE, type PaletteName } from './palette';
export { LIB_TEXTURES, libTexture, libTextureKey, libTextureSize, type LibTextureName } from './libTextures';
export {
  SurfaceKit,
  surfaceFrame,
  triplanar,
  GRUNGE_REPEATS_PER_METER,
  type MaterialEnv,
  type MappingOptions,
  type MappingSpace,
  type SurfaceFrame,
} from './tsl/surface';
export { bumpNormal } from './tsl/bump';
export { rgb, toColorNode, luma, desaturate, paintVariation } from './tsl/color';
export {
  surfaceCurvature,
  edgeMask,
  cavityMask,
  wearMask,
  rustMask,
  dirtMask,
  dustMask,
  fingerprintMask,
  smudgeRoughness,
  groundGrime,
} from './tsl/wear';
export type { FloatNode, Vec2Node, Vec3Node, Vec4Node, FloatInput, ColorInput } from './tsl/types';
export {
  createBareMetal,
  createAnodized,
  createGroundSteel,
  createPaintedMetal,
  createGalvanized,
  createRustyMetal,
  rustColor,
  type BareMetalOptions,
  type AnodizedOptions,
  type GroundSteelOptions,
  type PaintedMetalOptions,
  type GalvanizedOptions,
  type RustyMetalOptions,
} from './factories/metal';
export {
  createPlastic,
  createRubber,
  createSilicone,
  createHeatShrink,
  createCeramic,
  createEpoxy,
  createSolderMask,
  createSilkscreen,
  createWovenComposite,
  createFr4,
  createPaper,
  createSiliconDie,
  createResin,
  type PlasticOptions,
  type SolderMaskOptions,
  type WovenCompositeOptions,
  type PaperOptions,
  type ResinOptions,
} from './factories/dielectric';
export {
  createGlass,
  createWindowGlass,
  createLed,
  createEmissive,
  createScopeScreen,
  createForestBackdrop,
  makeGlowable,
  setMaterialGlow,
  type GlassOptions,
  type WindowGlassOptions,
  type EmissiveOptions,
  type GlowUserData,
} from './factories/optics';
export {
  createWood,
  createConcrete,
  createWallPaint,
  createPegboard,
  createCardboard,
  createFabric,
  createTape,
  createAntistaticMat,
  type WoodOptions,
  type ConcreteOptions,
  type WallPaintOptions,
  type PegboardOptions,
  type CardboardOptions,
  type FabricOptions,
} from './factories/workshop';
export {
  computeEdgeWear,
  applyEdgeWear,
  computeOcclusion,
  applyOcclusion,
  weldByPosition,
  type EdgeWearOptions,
  type OcclusionOptions,
} from './geometry/edgeWear';
export { createBevelledBox, type BevelledBoxOptions } from './geometry/bevelledBox';
