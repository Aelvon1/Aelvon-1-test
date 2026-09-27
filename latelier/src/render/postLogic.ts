/**
 * Logique pure du post-traitement (sans three.js ni GPU) : configuration par profil de qualité,
 * « looks » par mode, amortissements, paramètres de mise au point et priorités des contours.
 * Tout ce qui peut être testé unitairement (Vitest) est ici ; `PostFX` n'en est que le câblage.
 */
import type { QualityProfile } from '../core/quality';

export type PostMode = 'home' | 'exploration' | 'inspection';

/** Mise au point de l'inspection : distance caméra → objet et rayon de l'objet (m). */
export interface InspectionFocus {
  distance: number;
  radius: number;
}

export type OutlineKind = 'hover' | 'selected' | 'blocked';

/** Vues de contrôle du pipeline (développement, captures de vérification). */
export type PostDebugView = 'none' | 'ao' | 'aoraw' | 'depth' | 'focus';

/** Ordre des canaux du masque de contour (R = survol, V = sélection, B = bloqué). */
export const OUTLINE_KINDS: readonly OutlineKind[] = ['hover', 'selected', 'blocked'];

/** Priorité d'affichage quand un même maillage appartient à plusieurs listes. */
const OUTLINE_PRIORITY: Readonly<Record<OutlineKind, number>> = { hover: 0, selected: 1, blocked: 2 };

export type PostAntialias = QualityProfile['postAA'];

/** Structure du graphe de post-traitement : tout changement impose une reconstruction. */
export interface PostBuildConfig {
  msaaSamples: 0 | 4;
  ao: boolean;
  /** Résolution relative de l'occlusion ambiante. */
  aoResolution: number;
  /** Échantillons GTAO (constante de compilation : la changer recompile le shader). */
  aoSamples: number;
  bloom: boolean;
  /** Profondeur de champ présente dans le graphe (activée ensuite à la demande, sans recompilation). */
  dof: boolean;
  antialias: PostAntialias;
  grain: boolean;
}

/**
 * Déduit la structure du graphe d'un profil de qualité.
 *
 * Approximation : pas de MSAA sur le repli WebGL2. three r186 y alloue le tampon de profondeur
 * multi-échantillonné en DEPTH_COMPONENT24 alors que la texture de profondeur (flottante en
 * profondeur inversée) est en DEPTH_COMPONENT32F (comparaison `FloatType === gl.FLOAT` erronée
 * dans `setupRenderBufferStorage`) : la résolution par `blitFramebuffer` échoue et l'image est
 * noire. Le SMAA reste actif.
 */
export function resolveBuildConfig(
  profile: QualityProfile,
  backend: 'webgpu' | 'webgl2' = 'webgpu',
): PostBuildConfig {
  return {
    msaaSamples: backend === 'webgl2' ? 0 : profile.msaaSamples,
    ao: profile.ao,
    aoResolution: Math.min(1, Math.max(0.25, profile.aoResolution)),
    // Bas n'a pas d'AO ; Moyen se contente de 12 échantillons (3 directions × 4 pas).
    aoSamples: profile.level >= 2 ? 16 : 12,
    bloom: profile.bloom,
    dof: profile.dof,
    antialias: profile.postAA,
    grain: profile.grain,
  };
}

/** Clé stable d'une configuration (détecte les changements de profil qui ne changent rien). */
export function buildConfigKey(config: PostBuildConfig): string {
  return [
    `msaa${config.msaaSamples}`,
    config.ao ? `ao${config.aoResolution}x${config.aoSamples}` : 'noao',
    config.bloom ? 'bloom' : 'nobloom',
    config.dof ? 'dof' : 'nodof',
    config.antialias,
    config.grain ? 'grain' : 'nograin',
  ].join('|');
}

/**
 * Configuration de secours (pilote qui refuse un shader, mémoire insuffisante…) : ni MSAA,
 * ni AO, ni bloom, ni profondeur de champ ; FXAA + étalonnage + contours seulement.
 */
export function safeBuildConfig(config: PostBuildConfig): PostBuildConfig {
  return { ...config, msaaSamples: 0, ao: false, bloom: false, dof: false, antialias: 'fxaa', grain: false };
}

/**
 * Choisit la configuration à construire en évitant celles qui ont déjà échoué sur ce GPU :
 * la configuration demandée, sinon celle de secours, sinon `null` (rendu direct sans
 * post-traitement, tone mapping AgX assuré par le renderer).
 */
export function selectBuildConfig(
  requested: PostBuildConfig,
  failedKeys: ReadonlySet<string>,
): PostBuildConfig | null {
  if (!failedKeys.has(buildConfigKey(requested))) return requested;
  const safe = safeBuildConfig(requested);
  return failedKeys.has(buildConfigKey(safe)) ? null : safe;
}

/**
 * Nom valide pour une variable WGSL / GLSL (lettre ou « _ » puis lettres, chiffres, « _ » ;
 * pas de « __ » initial, réservé en WGSL). Un nœud TSL nommé (`setName`, `label`) devient une
 * déclaration du shader : « PostFX.aoBlurH » produisait un WGSL invalide (écran noir).
 */
export function isValidShaderIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith('__') && name !== '_';
}

/** Réglages visuels continus propres à chaque mode (interpolés en douceur). */
export interface ModeLook {
  /** Force du vignettage 0..1. */
  vignette: number;
  /** Intensité de l'étalonnage chaud/froid 0..1. */
  splitTone: number;
  /** Amplitude du grain (en fraction de la plage d'affichage). */
  grain: number;
  /** Intensité du bloom (multiplie la force de base). */
  bloom: number;
}

export const MODE_LOOKS: Readonly<Record<PostMode, ModeLook>> = {
  // Accueil : cadrage « photo » plus marqué, grain un peu plus présent.
  home: { vignette: 0.55, splitTone: 1, grain: 0.03, bloom: 1.1 },
  exploration: { vignette: 0.3, splitTone: 1, grain: 0.022, bloom: 1 },
  // Inspection : grain discret pour ne pas brouiller les marquages fins.
  inspection: { vignette: 0.34, splitTone: 0.8, grain: 0.014, bloom: 0.85 },
};

/** Assombrissement par défaut de l'arrière-plan en inspection (0..1). */
export const DEFAULT_BACKGROUND_DIM = 0.35;

/**
 * Amortissement exponentiel indépendant de la cadence : `rate` en 1/s (≈ 63 % du chemin en
 * 1/rate secondes).
 */
export function damp(current: number, target: number, rate: number, dt: number): number {
  if (dt <= 0) return current;
  const k = 1 - Math.exp(-rate * dt);
  const next = current + (target - current) * k;
  return Math.abs(target - next) < 1e-5 ? target : next;
}

/** Paramètres dérivés d'une mise au point, prêts pour les uniformes. */
export interface FocusParams {
  /** Distance de mise au point (m). */
  distance: number;
  /** Demi-épaisseur de la zone nette autour de la distance de mise au point (m). */
  band: number;
  /** Distance au-delà de la zone nette pour atteindre le flou maximal (m). */
  ramp: number;
  /** Début et fin de l'assombrissement de l'arrière-plan (m, distance à la caméra). */
  dimStart: number;
  dimEnd: number;
}

/**
 * Convertit une mise au point {distance, rayon} en paramètres de profondeur de champ.
 * L'objet entier (distance ± rayon, plus une marge) reste net ; le flou croît ensuite sur
 * une distance proportionnelle à la distance de mise au point (plus court en macro).
 */
export function computeFocusParams(
  focus: InspectionFocus,
  out: FocusParams = { distance: 0, band: 0, ramp: 0, dimStart: 0, dimEnd: 0 },
): FocusParams {
  const distance = Math.max(0.02, focus.distance);
  const radius = Math.max(0.005, focus.radius);
  out.distance = distance;
  out.band = radius * 1.1 + distance * 0.02;
  out.ramp = Math.min(1.2, Math.max(0.06, distance * 0.45));
  out.dimStart = distance + out.band + Math.max(0.03, radius * 0.25);
  out.dimEnd = out.dimStart + Math.min(1.5, Math.max(0.35, distance * 0.9));
  return out;
}

/** Rayon de flou maximal (px) selon la hauteur de l’image : 8 px en 1080p (doublé par la passe de bokeh). */
export function bokehPixels(bufferHeight: number, amount: number): number {
  return 8 * (Math.max(1, bufferHeight) / 1080) * Math.min(1, Math.max(0, amount));
}

/** Rayon GTAO (m) adapté à l'échelle observée : pièce entière ou objet vu de près. */
export function aoRadiusFor(mode: PostMode, focus: InspectionFocus | null): number {
  if (mode !== 'inspection' || !focus) return 0.32;
  return Math.min(0.32, Math.max(0.012, focus.radius * 0.35));
}

/** Intensité pulsée du contour « bloqué » (0.45..1, 2,2 Hz). */
export function blockedPulse(time: number): number {
  return 0.725 + 0.275 * Math.sin(time * Math.PI * 2 * 2.2);
}

/**
 * Attribue à chaque maillage le type de contour le plus prioritaire (bloqué > sélection >
 * survol). Générique pour être testable sans three.js.
 */
export function resolveOutlineKinds<T>(
  lists: Readonly<Record<OutlineKind, readonly T[]>>,
  expand: (item: T, visit: (leaf: T) => void) => void,
  out: Map<T, OutlineKind> = new Map(),
): Map<T, OutlineKind> {
  out.clear();
  for (const kind of OUTLINE_KINDS) {
    for (const item of lists[kind]) {
      expand(item, (leaf) => {
        const previous = out.get(leaf);
        if (previous === undefined || OUTLINE_PRIORITY[kind] > OUTLINE_PRIORITY[previous])
          out.set(leaf, kind);
      });
    }
  }
  return out;
}

/** Graine du grain animé : 24 motifs par seconde (cadence « pellicule »), bornée pour rester exacte en flottant. */
export function grainSeed(time: number): number {
  const frame = Math.floor(Math.max(0, time) * 24);
  return (frame % 97) * 9973;
}
