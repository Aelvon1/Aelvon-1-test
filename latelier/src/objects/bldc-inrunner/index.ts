/**
 * Moteur brushless inrunner haut KV — objet démontable ENTIÈREMENT procédural et paramétrique.
 *
 * Organisation :
 * - `params.ts`       : paramètres, préréglages, cotes dérivées et calculs purs (spires ↔ KV…) ;
 * - `lamination.ts`, `sections.ts`, `profile2d.ts`, `windingLayout.ts` : géométrie plane et
 *   tracé du bobinage, purs (testés) ;
 * - `build/*.ts`      : constructions three.js (révolutions, extrusions arrondies, filetages
 *   hélicoïdaux réels, tubes de brins) ;
 * - `materials.ts`    : matériaux TSL propres (émail teinté par phase, tranche de tôle, tissage
 *   de frette, vernis translucide, gaines) ;
 * - `markings.ts`     : textures de marquage (gravure laser, circuit, capteurs) ;
 * - `infos.ts`        : fiches pédagogiques ; `parts.ts` : nomenclature ; `sequence.ts` : étapes.
 */
import type { ObjectDef } from '../types';
import { DEFAULT_PARAMS, OBJECT_ID, PARAM_SCHEMA, PRESETS, type BldcParams } from './params';
import { MATERIALS } from './materials';
import { bldcParts } from './parts';
import { bldcSteps } from './sequence';

const def: ObjectDef<BldcParams> = {
  id: OBJECT_ID,
  name: 'Moteur brushless inrunner',
  category: 'Moteurs',
  difficulty: 4,
  estimatedMinutes: 120,
  description:
    'Moteur sans balais à rotor intérieur, haut KV, pour modèle réduit : carter à ailettes, rotor à aimants néodyme frettés, stator feuilleté bobiné en triphasé, roulements miniatures et capteurs à effet Hall.',
  keywords: [
    'brushless',
    'BLDC',
    'inrunner',
    'moteur',
    'KV',
    'aimant',
    'néodyme',
    'bobinage',
    'stator',
    'roulement',
    'Hall',
    'modélisme',
  ],
  paramSchema: PARAM_SCHEMA,
  presets: PRESETS,
  defaultParams: DEFAULT_PARAMS,
  materials: MATERIALS,
  parts: bldcParts,
  steps: bldcSteps,
  removedPlacement: 'park',
  presentation: {
    rotationY: -0.42,
    // Vue de trois quarts ARRIÈRE : les premières étapes (câble, phases, platine, flasque arrière,
    // calage, rotor) se font côté capteurs ; le pignon reste visible en bout d'arbre.
    viewDirection: [-0.45, 0.6, 1],
    minSurfaceDistance: 0.0015,
  },
};

export default def;
