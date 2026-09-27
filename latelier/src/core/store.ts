/**
 * Store Zustand « vanilla » partagé entre le moteur 3D (lecture/écriture directe via
 * `getState`/`setState`) et l'interface React (lecture via `useStore(store, sélecteur)`).
 *
 * Règle d'architecture :
 * - l'ÉTAT DURABLE (phase, réglages, état d'inspection, invites du HUD…) vit ici ;
 * - les COMMANDES et notifications ponctuelles passent par le bus d'événements (`events.ts`).
 * Le moteur est la seule source de vérité pour `inspection` : l'interface ne le modifie jamais
 * directement, elle émet des commandes `inspection:*`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AppPhase } from './phases';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import type { ObjectParams, ParamSchema, ObjectPreset, PartInfo } from '../objects/types';

/** Fiche d'inventaire (calculée à partir du registre, sans construire l'objet). */
export interface CatalogEntry {
  id: string;
  name: string;
  category: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedMinutes: number;
  description: string;
  keywords: readonly string[];
  /** Nombre de pièces physiques (quantités d'instances comprises) avec les paramètres par défaut. */
  partCount: number;
  /** Nombre d'étapes du démontage A → Z avec les paramètres par défaut. */
  stepCount: number;
}

/** Miniature animée d'inventaire : planche de sprites (tour complet). */
export interface Thumbnail {
  /** URL (blob:) d'une image contenant `frames` vues en ligne(s). */
  url: string;
  frames: number;
  columns: number;
  frameWidth: number;
  frameHeight: number;
}

/** Nœud de l'arborescence des pièces (panneau gauche). */
export interface PartTreeNode {
  id: string;
  name: string;
  kind: 'part' | 'assembly';
  /** Nombre de pièces physiques (instances). */
  quantity: number;
  children: PartTreeNode[];
}

/** Données statiques d'une pièce, copiées depuis sa `PartDef` pour l'interface. */
export interface PartStatic {
  id: string;
  name: string;
  parent: string | null;
  kind: 'part' | 'assembly';
  quantity: number;
  info: PartInfo;
  removable: boolean;
  destructive: boolean;
  toolId: string | null;
}

/** État dynamique d'une pièce. */
export interface PartDynamic {
  removed: boolean;
  /** Masquée par l'utilisateur (H) ou par l'isolation. */
  hidden: boolean;
  /** En cours d'animation de retrait/remontage. */
  animating: boolean;
}

/** Résumé d'une étape A → Z pour la frise. */
export interface StepSummary {
  id: string;
  index: number;
  title: string;
  description: string;
  partIds: string[];
  toolId: string | null;
  toolName: string | null;
  /** Icône SVG de l'outil (balisage inline). */
  toolIcon: string | null;
  destructive: boolean;
  status: 'todo' | 'partial' | 'done';
}

export type SectionAxis = 'x' | 'y' | 'z';

export interface InspectionState {
  objectId: string;
  objectName: string;
  params: ObjectParams;
  paramSchema: readonly ParamSchema[];
  presets: readonly ObjectPreset[];
  /** Arborescence des pièces. */
  tree: PartTreeNode[];
  partStatic: Record<string, PartStatic>;
  parts: Record<string, PartDynamic>;
  /** Pièce sélectionnée (+ instance éventuelle). */
  selected: { partId: string; instance: number | null; instanceLabel: string | null } | null;
  hoveredId: string | null;
  mode: 'free' | 'step';
  steps: StepSummary[];
  /** Index de l'étape courante dans la frise (prochaine à exécuter, = steps.length si terminé). */
  stepCursor: number;
  /** Étape en cours d'animation (index) ou null. */
  playingStep: number | null;
  /** Cible d'éclatement 0..1 (le moteur anime la valeur réelle). */
  explode: number;
  labels: boolean;
  knolling: boolean;
  xray: boolean;
  section: { enabled: boolean; axis: SectionAxis; position: number; flip: boolean };
  /** Pièce isolée (I) ou null. */
  isolatedId: string | null;
  neutralBackground: boolean;
  /** Une animation de démontage est en cours (commandes de démontage ignorées). */
  busy: boolean;
  /** Dernier blocage signalé en démontage libre. */
  blocked: { partId: string; blockers: string[] } | null;
  /** Outil actuellement montré en 3D. */
  activeToolId: string | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  /** Construction/préparation en cours (0..1) ou null. */
  buildProgress: number | null;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'warning' | 'error' | 'success';
}

export type Overlay = 'none' | 'settings' | 'controls';

export interface AppState {
  phase: AppPhase;
  loading: { progress: number; label: string; error: string | null };
  /** Backend graphique effectif et capacités. */
  renderer: { backend: 'webgpu' | 'webgl2' | 'none'; reversedDepth: boolean; maxAnisotropy: number };
  settings: Settings;
  /** Panneau superposé (réglages, commandes). */
  overlay: Overlay;
  debugOpen: boolean;
  /** Libellés des touches selon la disposition clavier réelle : event.code → caractère affiché. */
  keyLabels: Record<string, string>;
  hud: {
    /** Invite d'interaction, ex. « Allumer la lampe » (la touche est ajoutée par l'UI). */
    prompt: string | null;
    /** Le réticule vise un objet interactif. */
    targetActive: boolean;
    pointerLocked: boolean;
    /** Message « Cliquer pour reprendre » quand la souris a été libérée hors pause. */
    clickToResume: boolean;
  };
  catalog: CatalogEntry[];
  inventory: {
    query: string;
    category: string | null;
    thumbnails: Record<string, Thumbnail>;
    /** Objet choisi (pendant la transition). */
    pendingObjectId: string | null;
  };
  inspection: InspectionState | null;
  radio: { on: boolean; stationLabel: string };
  stats: { fps: number; frameMs: number; drawCalls: number; triangles: number; pixelRatio: number };
  toasts: Toast[];
}

export type AppStore = StoreApi<AppState>;

export function createInitialState(settings: Settings = DEFAULT_SETTINGS): AppState {
  return {
    phase: 'loading',
    loading: { progress: 0, label: 'Initialisation…', error: null },
    renderer: { backend: 'none', reversedDepth: false, maxAnisotropy: 1 },
    settings,
    overlay: 'none',
    debugOpen: false,
    keyLabels: {},
    hud: { prompt: null, targetActive: false, pointerLocked: false, clickToResume: false },
    catalog: [],
    inventory: { query: '', category: null, thumbnails: {}, pendingObjectId: null },
    inspection: null,
    radio: { on: false, stationLabel: '' },
    stats: { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, pixelRatio: 1 },
    toasts: [],
  };
}

export function createAppStore(settings?: Settings): AppStore {
  return createStore<AppState>()(() => createInitialState(settings));
}

/** Met à jour l'état d'inspection (no-op si aucune inspection n'est ouverte). */
export function patchInspection(store: AppStore, patch: Partial<InspectionState>): void {
  const current = store.getState().inspection;
  if (!current) return;
  store.setState({ inspection: { ...current, ...patch } });
}

let toastId = 0;

/** Affiche un message éphémère dans le HUD. */
export function pushToast(
  store: AppStore,
  message: string,
  kind: Toast['kind'] = 'info',
  ttlMs = 3500,
): void {
  const toast: Toast = { id: ++toastId, message, kind };
  store.setState((s) => ({ toasts: [...s.toasts, toast].slice(-4) }));
  setTimeout(() => {
    store.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== toast.id) }));
  }, ttlMs);
}
