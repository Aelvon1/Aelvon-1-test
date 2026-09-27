/**
 * Identifiants des outils du catalogue du moteur (modèles 3D animés dans `inspection/tools/`).
 * Les données d'objets référencent ces identifiants dans `RemovalSpec.tool` / `StepDef.tool` ;
 * un objet peut aussi déclarer ses propres outils via `ObjectDef.tools`.
 */
export const TOOL_IDS = [
  'hex-key-1.5', // clé Allen 1,5 mm (vis sans tête du pignon)
  'hex-key-2', // clé Allen 2 mm
  'hex-key-2.5', // clé Allen 2,5 mm (vis BTR M3)
  'screwdriver-phillips', // tournevis cruciforme
  'screwdriver-flat', // tournevis plat
  'screwdriver-precision', // tournevis de précision
  'pliers-flat', // pince plate
  'pliers-circlip', // pince à circlips
  'cutter-flush', // pince coupante
  'bearing-puller', // extracteur de roulements
  'arbor-press', // presse à main
  'mallet', // maillet
  'soldering-iron', // fer à souder sur station
  'desolder-pump', // pompe à dessouder
  'desolder-braid', // tresse à dessouder
  'hot-air', // station à air chaud
  'tweezers', // brucelles
  'ic-extractor', // extracteur de circuits intégrés
  'scalpel', // scalpel / grattoir (vernis, décapsulation)
  'spudger', // levier plastique
  'hands', // à la main
] as const;

export type ToolId = (typeof TOOL_IDS)[number];
