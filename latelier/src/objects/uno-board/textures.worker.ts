/**
 * Générateurs de textures propres à la carte « uno-board », chargés automatiquement dans le
 * worker de textures (`textures/texture.worker.ts`, découverte par `import.meta.glob`).
 * Les noms sont préfixés par l'identifiant de l'objet pour éviter toute collision.
 */
import type { Generator } from '../../textures/generators/types';
import { dieGenerator } from './internals/dieTexture';

export const generators: Record<string, Generator> = {
  'uno-board.die': dieGenerator as Generator,
};
