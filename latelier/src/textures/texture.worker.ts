/**
 * Worker de génération de textures procédurales (OffscreenCanvas + calcul CPU).
 * Protocole : { id, generator, width, height, params, seed } → { id, data, width, height } | { id, error }.
 */
import { builtinGenerators } from './generators';
import type { Generator, GeneratorModule } from './generators/types';

interface Request {
  id: number;
  generator: string;
  width: number;
  height: number;
  params: unknown;
  seed: number;
}

const registry: Record<string, Generator> = { ...builtinGenerators };

// Générateurs propres aux objets : découverte automatique (aucune modification du moteur).
const objectModules = import.meta.glob<GeneratorModule>('../objects/*/textures.worker.ts', { eager: true });
for (const [path, mod] of Object.entries(objectModules)) {
  for (const [name, generator] of Object.entries(mod.generators ?? {})) {
    if (registry[name]) console.warn(`[texture.worker] Générateur « ${name} » redéfini par ${path}.`);
    registry[name] = generator;
  }
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (event: MessageEvent<Request>) => {
  const { id, generator, width, height, params, seed } = event.data;
  try {
    const fn = registry[generator];
    if (!fn) throw new Error(`Générateur de texture inconnu : « ${generator} ».`);
    const data = fn({ width, height, params, seed });
    if (data.length !== width * height * 4) {
      throw new Error(
        `Le générateur « ${generator} » a produit ${data.length} octets au lieu de ${width * height * 4}.`,
      );
    }
    scope.postMessage({ id, data, width, height }, [data.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
