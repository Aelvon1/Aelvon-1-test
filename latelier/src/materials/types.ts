/**
 * Contrat de la bibliothèque de matériaux PBR (écrits en TSL, `MeshPhysicalNodeMaterial` &
 * co., jamais de ShaderMaterial GLSL).
 */
import type * as THREE from 'three/webgpu';
import type { TextureService } from '../textures/types';

/** Contexte fourni à une fabrique de matériau. */
export interface MaterialFactoryContext {
  textures: TextureService;
  /** 0 = Bas … 3 = Ultra. */
  quality: 0 | 1 | 2 | 3;
  maxAnisotropy: number;
}

/** Fabrique d'un matériau. Appelée une seule fois par identifiant (résultat mis en cache). */
export type MaterialFactory = (ctx: MaterialFactoryContext) => THREE.Material;

/** Surcharges applicables lors de la création d'une variante. */
export interface MaterialOverrides {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  side?: THREE.Side;
  /** Nom de la variante (débogage). */
  name?: string;
}

/** Accès en lecture aux matériaux (fourni aux objets et au décor). */
export interface MaterialProvider {
  /** Matériau partagé (mis en cache). Lève une erreur explicite si l'identifiant est inconnu. */
  get(id: string): THREE.Material;
  /** Indique si un identifiant est enregistré. */
  has(id: string): boolean;
  /**
   * Nouvelle instance basée sur `id` avec surcharges (non partagée : l'appelant en est
   * propriétaire et le moteur la libérera avec l'objet).
   */
  variant(id: string, overrides: MaterialOverrides): THREE.Material;
}

/** Bibliothèque complète (enregistrement + accès). */
export interface MaterialLibrary extends MaterialProvider {
  register(id: string, factory: MaterialFactory, options?: { replace?: boolean }): void;
  /** Supprime et libère les matériaux dont l'identifiant commence par `prefix`. */
  disposeScope(prefix: string): void;
  /** Liste des identifiants enregistrés (panneau de debug). */
  ids(): string[];
}

/**
 * Identifiants de la bibliothèque de base (voir `materials/library.ts`). Les objets et le décor
 * peuvent les utiliser directement ; un objet peut aussi déclarer ses propres matériaux via
 * `ObjectDef.materials`.
 */
export const BASE_MATERIAL_IDS = [
  // --- Métaux ---
  'alu.anodized.blue', // aluminium anodisé satiné bleu pétrole (carters)
  'alu.anodized.black',
  'alu.anodized.red',
  'alu.anodized.silver',
  'alu.machined', // aluminium usiné brut, légères stries
  'steel.ground', // acier rectifié, reflets anisotropes (arbres)
  'steel.blackoxide', // acier bruni (vis BTR, vis sans tête)
  'steel.zinc', // acier zingué (rondelles, circlips)
  'steel.stainless', // inox (bagues/billes de roulement)
  'steel.chrome', // acier chromé (billes, outils)
  'steel.electrical', // tôle magnétique gris foncé, tranche légèrement bleuie
  'steel.spring', // acier à ressort bleui (rondelle ondulée, circlip)
  'copper.enamel', // cuivre émaillé brillant ambré (clearcoat)
  'copper.bare', // cuivre nu (pistes, grille de connexion)
  'nickel', // nickelage des aimants
  'brass', // laiton (pignon, contacts)
  'gold', // or (fils de liaison, dorure)
  'tin', // étain / HASL (pastilles, broches étamées)
  'solder', // soudure étain-plomb brillante (ménisques)
  'solder.flux', // résidu de flux ambré translucide
  // --- Non-métaux techniques ---
  'fiber.glass', // fibre de verre tissée (frette), tissage visible
  'fiber.carbon', // fibre de carbone tissée
  'paper.insulation', // papier isolant d'encoche (type Nomex)
  'varnish.impregnation', // vernis d'imprégnation ambré translucide
  'silicone.red',
  'silicone.black',
  'silicone.yellow',
  'silicone.blue',
  'heatshrink.red',
  'heatshrink.black',
  'heatshrink.yellow',
  'heatshrink.blue',
  'plastic.black', // plastique noir mat (connecteurs, boîtiers)
  'plastic.white',
  'plastic.nylon', // nylon crème (supports, isolants)
  'plastic.pbt.black', // PBT noir des barrettes femelles
  'rubber.black',
  'epoxy.black', // résine de boîtier de CI (mate, clearcoat léger)
  'ceramic.tan', // corps de condensateur céramique beige
  'ceramic.white',
  'ceramic.gray',
  'resistor.black', // corps de résistance CMS noir
  'fr4.core', // âme FR4 (tranche : fibre de verre visible)
  'mask.teal', // vernis épargne bleu sarcelle semi-brillant (clearcoat)
  'silk.white', // sérigraphie blanche
  'silicon.die', // silicium de puce (reflets irisés)
  'glass.clear', // verre (transmission)
  'led.green', // LED (transmission + émission pilotable)
  'led.yellow',
  'led.red',
  'magnet.ndfeb.raw', // NdFeB brut sous le nickel (coupe)
  // --- Atelier (décor) ---
  'wood.bench', // plateau d'établi en bois massif usé
  'wood.plywood',
  'wood.pegboard', // panneau perforé (isorel peint)
  'concrete.floor', // béton taché d'huile
  'paint.wall', // mur peint crème défraîchi
  'metal.painted.olive', // métal peint vert olive, arêtes éclaircies, rouille dans les recoins
  'metal.painted.orange', // orange brûlé
  'metal.painted.teal', // bleu pétrole
  'metal.painted.cream',
  'metal.painted.red', // rouge (extincteur)
  'metal.galvanized',
  'metal.rusty',
  'rubber.mat.green', // tapis antistatique vert
  'fabric.rug', // tapis tissé (sheen)
  'fabric.cloth', // chiffon (sheen)
  'cardboard',
  'glass.window', // vitre (transmission légère)
  'tape.yellow', // ruban adhésif jaune vif
  'paper.label', // étiquette papier
  'emissive.tungsten', // filament/ampoule tungstène
  'emissive.neon', // tube néon légèrement verdâtre
  'emissive.screen', // écran d'oscilloscope phosphore vert
] as const;

export type BaseMaterialId = (typeof BASE_MATERIAL_IDS)[number];
