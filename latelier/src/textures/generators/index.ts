/**
 * Registre des générateurs intégrés, chargé DANS le worker.
 * Pour ajouter un générateur générique : créer `generators/<nom>.ts` et l'ajouter ici.
 * Pour un générateur propre à un objet : `objects/<id>/textures.worker.ts` exportant
 * `generators` (découverte automatique, aucune modification du moteur).
 */
import type { Generator } from './types';
import { channels, drawlist, normalFromHeight } from './drawlist';
import { noise } from './noise';
import { grunge } from './grunge';
import { scratches } from './scratches';
import { brushed } from './brushed';
import { wood } from './wood';
import { concrete } from './concrete';
import { rust } from './rust';
import { weave } from './weave';
import { paint } from './paint';
import { cardboard } from './cardboard';
import { forest } from './forest';
import { raindrops } from './raindrops';
import { label } from './label';

export const builtinGenerators: Record<string, Generator> = {
  drawlist: drawlist as Generator,
  channels: channels as Generator,
  normalFromHeight: normalFromHeight as Generator,
  noise: noise as Generator,
  grunge,
  scratches,
  brushed,
  wood,
  concrete,
  rust,
  weave,
  paint,
  cardboard,
  forest,
  raindrops,
  label,
};
