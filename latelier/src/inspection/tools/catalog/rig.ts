/**
 * Contexte d'animation partagé entre le présentateur et les animations du catalogue.
 *
 * `ToolAnimState` (contrat) ne décrit que le geste « abstrait » (progression, axe, rotation de la
 * pièce). Les outils du catalogue ont besoin de quelques données de plus, calculées par le
 * présentateur au début du geste (profondeur et largeurs de la pièce, côté extérieur de l'objet,
 * durées) et à chaque image (temps nominal, déplacement de la pièce). Elles sont rangées dans un
 * `ToolRigContext` attaché au modèle (WeakMap) : aucune modification du contrat, aucune
 * allocation par image. Un outil animé sans présentateur reçoit un contexte par défaut.
 *
 * Repère « de montage » (celui de l'outil avant animation) : Y = axe de sortie de la pièce,
 * origine = point de travail (ancrage), X et Z perpendiculaires (Z tourné vers la caméra ou
 * aligné sur la pièce selon l'outil).
 */
import type * as THREE from 'three/webgpu';
import type { SoundId } from '../../../audio/types';
import type { MotionKind } from '../../../objects/types';
import { TOOL_APPROACH_SECONDS, TOOL_RETRACT_SECONDS } from '../presenter';

export interface ToolRigContext {
  // --- Données du geste (fixes) ---
  motion: MotionKind;
  direction: 1 | -1;
  /** Profondeur de la pièce derrière le point de travail, le long de −Y (m). */
  depth: number;
  /** Demi-largeurs de la pièce selon X et Z du repère de montage (m). */
  halfX: number;
  halfZ: number;
  /** Côté extérieur de l'objet (loin de son centre), plan XZ du montage, normalisé. */
  outwardX: number;
  outwardZ: number;
  /** Durées nominales (s) : approche, mouvement de la pièce, retrait. */
  approachSeconds: number;
  motionSeconds: number;
  retractSeconds: number;
  // --- Image courante ---
  /** Temps nominal écoulé depuis le début de l'approche (s). */
  seconds: number;
  /** Progression de l'approche (0 → 1 = outil en contact). */
  approachK: number;
  /** Progression du retrait (0 → 1 = outil parti). */
  retractK: number;
  /** Déplacement du point de travail le long de l'axe depuis le début du geste (m). */
  travel: number;
  /** Outils d'appoint (fer tenu avec la pompe ou la tresse) visibles. */
  helpersVisible: boolean;
}

export function createRigContext(): ToolRigContext {
  return {
    motion: 'translate',
    direction: 1,
    depth: 0.004,
    halfX: 0.003,
    halfZ: 0.003,
    outwardX: 1,
    outwardZ: 0,
    approachSeconds: TOOL_APPROACH_SECONDS,
    motionSeconds: 1,
    retractSeconds: TOOL_RETRACT_SECONDS,
    seconds: 0,
    approachK: 1,
    retractK: 0,
    travel: 0,
    helpersVisible: true,
  };
}

const contexts = new WeakMap<THREE.Object3D, ToolRigContext>();

/** Contexte d'animation d'un modèle d'outil (créé à la demande). */
export function rigContext(tool: THREE.Object3D): ToolRigContext {
  let ctx = contexts.get(tool);
  if (!ctx) {
    ctx = createRigContext();
    contexts.set(tool, ctx);
  }
  return ctx;
}

/** Comportement d'un outil vis-à-vis du présentateur. */
export interface ToolBehavior {
  /**
   * `position` : le montage suit le point de travail (les clés appliquent elles-mêmes `spin`) ;
   * `rigid` : il suit aussi la rotation de la pièce (brucelles, extracteur de CI, doigts).
   */
  follow: 'position' | 'rigid';
  /**
   * Orientation autour de l'axe : `camera` (plan de l'outil face à la caméra), `partLong` /
   * `partShort` (X du montage aligné sur la grande / petite largeur de la pièce).
   */
  roll: 'camera' | 'partLong' | 'partShort';
  /** Facteur de la course d'approche (défaut 1). */
  approach?: number;
  /** Repères sonores propres à l'outil (progression du mouvement de la pièce). */
  cues?: (motion: MotionKind, direction: 1 | -1) => readonly ToolCue[];
}

export interface ToolCue {
  /** Progression du mouvement de la pièce (0..1) ; négatif = pendant l'approche (fraction). */
  at: number;
  sound: SoundId;
  volume?: number;
}

export const DEFAULT_BEHAVIOR: ToolBehavior = { follow: 'position', roll: 'camera' };

/** Progression du mouvement de la pièce déduite du temps nominal. */
export function motionProgress(ctx: ToolRigContext): number {
  const s = (ctx.seconds - ctx.approachSeconds) / Math.max(1e-6, ctx.motionSeconds);
  return s <= 0 ? 0 : s >= 1 ? 1 : s;
}

/** Engagement de l'outil (0 = loin, 1 = en contact) : approche puis retrait. */
export function engagement(ctx: ToolRigContext): number {
  return Math.min(ctx.approachK, 1 - ctx.retractK);
}
