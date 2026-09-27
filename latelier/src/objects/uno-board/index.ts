/**
 * Objet « Carte de développement ATELIER-328 » : carte au format et à l'architecture d'une
 * Uno R3 (matériel libre), entièrement démontable (composants, puis couches du circuit).
 */
import type { ObjectDef } from '../types';
import { OBJECT_ID } from './constants';
import { markingKeys, markingMaterials, markingRequest, MARKINGS } from './markings';
import { miscMaterials } from './misc';
import { DEFAULT_PARAMS, type UnoParams } from './params';
import { allParts } from './parts';
import { artworkKey } from './pcb/artwork';
import { artworkTexture, pcbMaterials } from './pcb/materials';
import { computeRoutingAsync } from './pcb/routing';
import { STEPS } from './sequence';

const def: ObjectDef<UnoParams> = {
  id: OBJECT_ID,
  name: 'Carte de développement ATELIER-328',
  category: 'Électronique',
  difficulty: 3,
  estimatedMinutes: 45,
  description:
    'Carte microcontrôleur au format Uno R3 (matériel libre) : ATmega328P sur support, convertisseur USB-série ATmega16U2, régulateurs 5 V et 3,3 V. Dessoudez chaque composant puis séparez les couches du circuit imprimé.',
  keywords: ['arduino', 'uno', 'atmega328p', 'microcontrôleur', 'circuit imprimé', 'pcb', 'cms', 'soudure'],
  paramSchema: [
    {
      key: 'fineDetail',
      label: 'Géométrie fine permanente',
      kind: 'boolean',
      help: 'Construit d’emblée les ménisques et pattes détaillés (sinon chargés à l’approche de la caméra).',
    },
  ],
  defaultParams: DEFAULT_PARAMS,
  parts: allParts,
  steps: STEPS,
  materials: { ...pcbMaterials(), ...markingMaterials(), ...miscMaterials() },
  removedPlacement: 'park',
  presentation: { rotationY: 0, viewDirection: [0.25, 0.8, 0.9], minSurfaceDistance: 0.0015 },
  prepare: async (ctx) => {
    const routing = await computeRoutingAsync((v) => ctx.progress(v * 0.7, 'Routage des pistes…'));
    ctx.shared.routing = routing;
    ctx.progress(0.75, 'Illustration du circuit…');
    const keys: string[] = [];
    for (const face of ['top', 'bottom'] as const) {
      artworkTexture(ctx, face, ctx.quality);
      keys.push(artworkKey(face, ctx.quality));
    }
    // Marquages des composants (demandés ici pour être prêts avant l'affichage).
    for (const id of Object.keys(MARKINGS)) ctx.textures.get(markingRequest(id, ctx.quality));
    keys.push(...markingKeys(ctx.quality));
    let done = 0;
    await Promise.all(
      keys.map((k) =>
        ctx.textures
          .ready(k)
          .then(() => ctx.progress(0.75 + (0.25 * ++done) / keys.length, 'Illustration du circuit…')),
      ),
    );
    ctx.progress(1);
  },
};

export default def;
