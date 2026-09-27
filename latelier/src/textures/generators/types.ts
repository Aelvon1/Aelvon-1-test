/**
 * Signature commune des générateurs exécutés dans le worker de textures.
 * Un générateur retourne des pixels RGBA 8 bits NON prémultipliés (largeur × hauteur × 4).
 */
export interface GeneratorInput<P = unknown> {
  width: number;
  height: number;
  params: P;
  seed: number;
}

export type Generator<P = unknown> = (input: GeneratorInput<P>) => Uint8ClampedArray;

/** Module de générateurs (fichiers `objects/<id>/textures.worker.ts`) : export `generators`. */
export interface GeneratorModule {
  generators: Record<string, Generator>;
}
