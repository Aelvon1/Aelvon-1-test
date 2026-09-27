/**
 * Réglages utilisateur : schéma, valeurs par défaut, bornes et persistance localStorage.
 */
export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_LABELS: Record<QualityPreset, string> = {
  low: 'Bas',
  medium: 'Moyen',
  high: 'Élevé',
  ultra: 'Ultra',
};

export type RemovedPlacementSetting = 'auto' | 'stay' | 'park' | 'hide';

export interface Settings {
  /** Version du schéma (migration). */
  version: 1;
  /** Sensibilité souris (multiplicateur, 0.1 à 3). */
  mouseSensitivity: number;
  invertY: boolean;
  /** Champ de vision vertical en degrés (70 à 100). */
  fov: number;
  quality: QualityPreset;
  /** Résolution dynamique pour tenir 60 i/s. */
  dynamicResolution: boolean;
  /** Volumes 0..1. */
  volumeAmbience: number;
  volumeSfx: number;
  volumeUi: number;
  /** Échelle des textes de l'interface (0.8 à 1.6). */
  textScale: number;
  /** Balancement de la caméra à la marche. */
  headBob: boolean;
  /** Profondeur de champ en inspection. */
  depthOfField: boolean;
  /** Placement des pièces retirées (auto = choix de l'objet). */
  removedPlacement: RemovedPlacementSetting;
  /** Le pas à pas cadre automatiquement les pièces de l'étape. */
  autoFrameSteps: boolean;
  /** Afficher les images/seconde dans le HUD. */
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  mouseSensitivity: 1,
  invertY: false,
  fov: 75,
  quality: 'high',
  dynamicResolution: false,
  volumeAmbience: 0.7,
  volumeSfx: 0.8,
  volumeUi: 0.6,
  textScale: 1,
  headBob: true,
  depthOfField: true,
  removedPlacement: 'auto',
  autoFrameSteps: true,
  showFps: false,
};

const STORAGE_KEY = 'latelier.settings.v1';

const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fallback;

/** Valide et complète un objet de réglages quelconque (données corrompues tolérées). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    version: 1,
    mouseSensitivity: clamp(r.mouseSensitivity, 0.1, 3, d.mouseSensitivity),
    invertY: bool(r.invertY, d.invertY),
    fov: clamp(r.fov, 70, 100, d.fov),
    quality: oneOf(r.quality, ['low', 'medium', 'high', 'ultra'] as const, d.quality),
    dynamicResolution: bool(r.dynamicResolution, d.dynamicResolution),
    volumeAmbience: clamp(r.volumeAmbience, 0, 1, d.volumeAmbience),
    volumeSfx: clamp(r.volumeSfx, 0, 1, d.volumeSfx),
    volumeUi: clamp(r.volumeUi, 0, 1, d.volumeUi),
    textScale: clamp(r.textScale, 0.8, 1.6, d.textScale),
    headBob: bool(r.headBob, d.headBob),
    depthOfField: bool(r.depthOfField, d.depthOfField),
    removedPlacement: oneOf(
      r.removedPlacement,
      ['auto', 'stay', 'park', 'hide'] as const,
      d.removedPlacement,
    ),
    autoFrameSteps: bool(r.autoFrameSteps, d.autoFrameSteps),
    showFps: bool(r.showFps, d.showFps),
  };
}

/** Charge les réglages (valeurs par défaut si absents, illisibles ou stockage indisponible). */
export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Settings {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text ? sanitizeSettings(JSON.parse(text)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: Settings,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Stockage plein ou interdit (navigation privée) : on ignore, les réglages restent en mémoire.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
