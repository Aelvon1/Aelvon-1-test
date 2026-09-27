/**
 * Carte des événements du bus (commandes UI → moteur et notifications moteur → UI).
 * Les charges utiles sont des objets simples (sérialisables), jamais des objets three.js.
 */
import type { ObjectParams } from '../objects/types';
import type { SectionAxis } from './store';
import type { Settings } from './settings';
import type { SoundId } from '../audio/types';

export type StepCommand = { kind: 'next' } | { kind: 'prev' } | { kind: 'goto'; index: number };

export interface AppEvents {
  // --- Application ---
  /** Bouton « Entrer » de l'écran d'accueil (geste utilisateur : audio + verrouillage souris). */
  'app:enter': undefined;
  /** Reprendre l'exploration (menu pause ou « cliquer pour reprendre »). */
  'app:resume': undefined;
  /** Retour à l'écran d'accueil. */
  'app:home': undefined;
  /** Mise à jour partielle des réglages (appliquée + sauvegardée par le moteur). */
  'settings:update': Partial<Settings>;
  /** Réinitialiser les réglages par défaut. */
  'settings:reset': undefined;
  /** Son d'interface déclenché par l'UI. */
  'ui:sound': SoundId;

  // --- Inventaire ---
  'inventory:open': undefined;
  'inventory:close': undefined;
  /** Choix d'un objet : transition vers l'établi puis inspection. */
  'inventory:select': { objectId: string; params?: ObjectParams };
  /** L'UI demande la génération des miniatures (première ouverture). */
  'inventory:thumbnails': { objectIds: string[] };

  // --- Inspection : commandes ---
  'inspection:exit': undefined;
  'inspection:mode': { mode: 'free' | 'step' };
  'inspection:step': StepCommand;
  'inspection:explode': { value: number; animate?: boolean };
  'inspection:toggleExplode': undefined;
  'inspection:select': { partId: string | null; instance?: number | null };
  'inspection:hover': { partId: string | null };
  /** Démontage libre : retirer (ou remonter si déjà retirée) une pièce. */
  'inspection:toggleRemove': { partId: string };
  'inspection:frame': { partId?: string };
  'inspection:resetView': undefined;
  'inspection:resetObject': undefined;
  'inspection:setHidden': { partId: string; hidden: boolean };
  'inspection:isolate': { partId: string | null };
  'inspection:showAll': undefined;
  'inspection:labels': { enabled: boolean };
  'inspection:knolling': { enabled: boolean };
  'inspection:xray': { enabled: boolean };
  'inspection:section': { enabled?: boolean; axis?: SectionAxis; position?: number; flip?: boolean };
  'inspection:neutralBackground': { enabled: boolean };
  'inspection:panels': { left?: boolean; right?: boolean };
  /** Reconstruire l'objet avec d'autres paramètres (préréglage, KV…). */
  'inspection:params': { params: ObjectParams };

  // --- Notifications moteur → UI ---
  'inspection:blocked': { partId: string; blockers: string[] };
  'inspection:stepStarted': { index: number };
  'inspection:stepFinished': { index: number };
  /** Demande à l'UI de se focaliser sur la fiche d'une pièce (double-clic). */
  'inspection:focusInfo': { partId: string };
}
