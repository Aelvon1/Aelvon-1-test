/**
 * Étapes du démontage A → Z. L'ordre final est un tri topologique déduit des `requires`,
 * départagé par l'ordre de déclaration (ou `priority`). Une étape dont toutes les pièces sont
 * désactivées par les paramètres (variante sans carte témoin) disparaît automatiquement.
 */
import type { StepDef } from '../types';

export const STEPS: readonly StepDef[] = [
  {
    id: 'lid.screws',
    title: 'Dévisser le couvercle',
    description: 'Desserrer les quatre vis d’angle au tournevis cruciforme, en croix.',
    parts: ['screws'],
    tool: 'screwdriver-phillips',
  },
  {
    id: 'lid',
    title: 'Déposer le couvercle',
    description: 'Soulever le couvercle bien à plat : le joint reste dans sa gorge.',
    parts: ['lid'],
  },
  {
    id: 'wires',
    title: 'Débrancher les conducteurs',
    description: 'Desserrer les bornes puis extraire les conducteurs marron et bleu.',
    parts: ['wires'],
  },
  {
    id: 'board',
    title: 'Sortir la carte témoin',
    description: 'Dévisser les deux vis de la carte puis la soulever hors de ses plots.',
    parts: ['board.screws', 'board'],
    focus: ['board'],
  },
  {
    id: 'terminal',
    title: 'Déclipser le bornier',
    description: 'Faire levier sur le clip avec un tournevis plat et sortir le bornier de ses glissières.',
    parts: ['terminal'],
  },
  {
    id: 'desolder',
    title: 'Dessouder les composants',
    description: 'Chauffer les soudures au fer, aspirer l’étain et retirer la LED puis la résistance.',
    parts: ['#soldered'],
    tool: 'soldering-iron',
  },
  {
    id: 'gasket',
    title: 'Retirer le joint',
    description: 'Décoller le joint de la gorge du couvercle avec un levier plastique.',
    parts: ['lid.gasket'],
  },
  {
    id: 'grommets',
    title: 'Chasser les membranes',
    description: 'Pousser les membranes passe-câbles depuis l’intérieur de la boîte.',
    parts: ['grommets'],
  },
];
