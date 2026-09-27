/**
 * Palette de la direction artistique : teintes désaturées d'atelier (vert olive, orange brûlé,
 * bleu pétrole, crème, rouille) relevées de touches vives (ruban jaune, voyants, étiquettes).
 * Valeurs sRGB (hex) ; à utiliser pour le décor comme pour les objets.
 */
export const PALETTE = {
  // Teintes principales désaturées.
  olive: 0x5a6340,
  oliveDark: 0x3d4430,
  burntOrange: 0xb35a2a,
  petrol: 0x245563,
  petrolDark: 0x173a44,
  cream: 0xd9ceb0,
  creamDark: 0xb9ad8e,
  rust: 0x8a4b2a,
  rustDark: 0x4a2716,
  rustLight: 0xb0622c,
  // Neutres.
  charcoal: 0x232427,
  graphite: 0x3a3c40,
  steel: 0xb6bbc0,
  concrete: 0x86827a,
  // Touches vives.
  tapeYellow: 0xf2c21b,
  signalRed: 0xb0261c,
  ledGreen: 0x5dff6a,
  ledYellow: 0xffc933,
  ledRed: 0xff3324,
  phosphor: 0x5cff8f,
  // Sous-couches et états de surface.
  primerRed: 0x8c4a38, // minium
  primerGray: 0x8d8e88,
  bareSteel: 0xa9adb1,
  dirt: 0x3b3326,
  dust: 0xa39c8c,
  oil: 0x1b1712,
} as const;

export type PaletteName = keyof typeof PALETTE;
