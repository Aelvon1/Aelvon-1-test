/**
 * Registre des générateurs intégrés, chargé DANS le worker.
 * Pour ajouter un générateur générique : créer `generators/<nom>.ts` et l'ajouter ici.
 * Pour un générateur propre à un objet : `objects/<id>/textures.worker.ts` exportant
 * `generators` (découverte automatique, aucune modification du moteur).
 */
import type { Generator } from './types';
import { channels, drawlist, normalFromHeight } from './drawlist';
import { noise } from './noise';

export const builtinGenerators: Record<string, Generator> = {
  drawlist: drawlist as Generator,
  channels: channels as Generator,
  normalFromHeight: normalFromHeight as Generator,
  noise: noise as Generator,
};
