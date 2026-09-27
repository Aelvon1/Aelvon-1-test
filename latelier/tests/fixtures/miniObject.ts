/**
 * Objet minimal de test : un boîtier fermé par un couvercle vissé (4 vis), contenant une carte
 * elle-même équipée d'un composant soudé. Sert aux tests du graphe et de la validation.
 */
import * as THREE from 'three/webgpu';
import type { ObjectDef, PartDef } from '../../src/objects/types';

const box = () => new THREE.Object3D();

export type MiniParams = { withBattery: boolean };

const info = { role: 'Test', material: 'Test', dimensions: '1 mm' };

export const miniParts: PartDef<MiniParams>[] = [
  { id: 'case', name: 'Boîtier', build: box, info, explode: { direction: [0, 0, 0], distance: 0 } },
  {
    id: 'lid.screws',
    name: 'Vis du couvercle',
    quantity: 4,
    build: box,
    info,
    explode: { direction: [0, 1, 0], distance: 0.02 },
    removal: {
      motion: 'unscrew',
      axis: [0, 1, 0],
      distance: 0.01,
      turns: 6,
      pitch: 0.0005,
      tool: 'screwdriver',
    },
  },
  {
    id: 'lid',
    name: 'Couvercle',
    build: box,
    info,
    explode: { direction: [0, 1, 0], distance: 0.015 },
    removal: { requires: ['lid.screws'], motion: 'translate', axis: [0, 1, 0], distance: 0.03 },
  },
  {
    id: 'battery',
    name: 'Pile',
    build: box,
    info,
    enabled: (p) => p.withBattery,
    explode: { direction: [1, 0, 0], distance: 0.01 },
    removal: { requires: ['lid'], motion: 'unclip', axis: [0, 1, 0], distance: 0.02 },
  },
  {
    id: 'board',
    name: 'Carte',
    kind: 'assembly',
    build: box,
    info,
    explode: { direction: [0, 1, 0], distance: 0.01 },
    removal: { requires: ['lid', 'battery'], motion: 'translate', axis: [0, 1, 0], distance: 0.02 },
  },
  {
    id: 'board.chip',
    name: 'Puce',
    parent: 'board',
    tags: ['component'],
    build: box,
    info,
    explode: { direction: [0, 1, 0], distance: 0.005 },
    removal: { motion: 'desolder', axis: [0, 1, 0], distance: 0.01, tool: 'iron' },
  },
  {
    id: 'board.cap',
    name: 'Condensateur',
    parent: 'board',
    tags: ['component'],
    build: box,
    info,
    explode: { direction: [0, 1, 0], distance: 0.005 },
    removal: { motion: 'desolder', axis: [0, 1, 0], distance: 0.01, tool: 'iron' },
  },
  {
    id: 'board.pcb',
    name: 'Circuit nu',
    parent: 'board',
    build: box,
    info,
    explode: { direction: [0, 0, 0], distance: 0 },
    removal: { requires: ['#component'], motion: 'translate', axis: [0, -1, 0], distance: 0.01 },
  },
];

export const miniObject: ObjectDef<MiniParams> = {
  id: 'mini',
  name: 'Boîtier de test',
  category: 'Test',
  difficulty: 1,
  estimatedMinutes: 5,
  description: 'Objet de test.',
  paramSchema: [{ key: 'withBattery', label: 'Pile', kind: 'boolean' }],
  defaultParams: { withBattery: true },
  presets: [{ id: 'nobat', label: 'Sans pile', params: { withBattery: false } }],
  parts: miniParts,
  steps: [
    {
      id: 'open',
      title: 'Ouvrir le boîtier',
      description: 'Dévisser puis retirer le couvercle.',
      parts: ['lid.screws', 'lid'],
    },
    {
      id: 'board',
      title: 'Sortir la carte',
      description: 'Soulever la carte.',
      parts: ['board'],
      priority: 5,
    },
    {
      id: 'battery',
      title: 'Retirer la pile',
      description: 'Déclipser la pile.',
      parts: ['battery'],
      priority: 1,
    },
    { id: 'desolder', title: 'Dessouder', description: 'Dessouder les composants.', parts: ['#component'] },
  ],
};
