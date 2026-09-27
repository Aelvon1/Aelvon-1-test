/**
 * OBJET D'EXEMPLE (développement) — boîtier de dérivation IP55 avec carte témoin.
 *
 * Exemple minimal et complet d'objet démontable, référencé par la section « Ajouter un objet »
 * du README. Un objet = un dossier `objects/<dossier>/` dont `index.ts` exporte par défaut un
 * `ObjectDef` (découverte automatique, aucune modification du moteur) :
 * - `build.ts`    : géométrie (en mm → m), matériaux propres, textures générées ;
 * - `parts.ts`    : pièces (hiérarchie, fiches, éclatement, retrait, rangement) ;
 * - `sequence.ts` : étapes A → Z.
 *
 * Le dossier est préfixé par « _ » : objet de développement, absent de l'inventaire sauf avec
 * `?devobjects=1`, ouvrable directement par `?inspect=_exemple-boitier` (ou `exemple-boitier`).
 *
 * Mouvements illustrés : dévissage (vis instanciées, décalées), translation, décollement du
 * joint, écartement des conducteurs, déclipsage, extraction en basculant, dessoudage (hook de
 * fusion des ménisques), chassage à la presse (membranes).
 */
import type { ObjectDef } from '../types';
import { MATERIALS, OBJECT_ID, type BoxParams } from './build';
import { PARTS } from './parts';
import { STEPS } from './sequence';

const exempleBoitier: ObjectDef<BoxParams> = {
  id: OBJECT_ID,
  name: 'Boîte de dérivation (exemple)',
  category: 'Exemples',
  difficulty: 1,
  estimatedMinutes: 8,
  description:
    'Boîte de dérivation étanche IP55 équipée d’un bornier et d’une carte témoin lumineuse. Objet d’exemple du moteur de démontage.',
  keywords: ['boîtier', 'dérivation', 'bornier', 'électricité', 'exemple'],
  paramSchema: [
    {
      key: 'indicator',
      label: 'Carte témoin',
      kind: 'boolean',
      help: 'Carte à LED signalant la présence de tension (et ses conducteurs de liaison).',
    },
    {
      key: 'color',
      label: 'Teinte du boîtier',
      kind: 'select',
      options: [
        { value: 'gray', label: 'Gris clair (RAL 7035)' },
        { value: 'black', label: 'Noir' },
      ],
    },
  ],
  defaultParams: { indicator: true, color: 'gray' },
  presets: [
    { id: 'standard', label: 'Avec carte témoin', params: { indicator: true } },
    { id: 'simple', label: 'Bornier seul', params: { indicator: false } },
  ],
  parts: PARTS,
  steps: STEPS,
  materials: MATERIALS,
  removedPlacement: 'park',
  presentation: {
    rotationY: -0.3,
    viewDirection: [0.25, 0.9, 1],
    minSurfaceDistance: 0.002,
  },
};

export default exempleBoitier;
