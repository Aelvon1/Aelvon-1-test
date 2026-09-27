/**
 * Frise des étapes et paramètres d'objet (logique pure, testée sous Node).
 */
import type { StepSummary } from '../../core/store';
import type { ObjectParams, ObjectPreset, ParamSchema, ParamValue } from '../../objects/types';

/** Avancement du démontage A → Z. */
export interface StepProgress {
  total: number;
  done: number;
  partial: number;
  /** 0..1 (les étapes partielles comptent pour moitié). */
  ratio: number;
}

export function stepProgress(steps: readonly StepSummary[]): StepProgress {
  let done = 0;
  let partial = 0;
  for (const s of steps) {
    if (s.status === 'done') done++;
    else if (s.status === 'partial') partial++;
  }
  const total = steps.length;
  return { total, done, partial, ratio: total ? (done + partial * 0.5) / total : 0 };
}

/** Libellé d'état d'une étape (lecteurs d'écran, infobulles). */
export function stepStatusLabel(step: StepSummary, cursor: number, playing: number | null): string {
  if (playing === step.index) return 'en cours';
  if (step.status === 'done') return 'terminée';
  if (step.status === 'partial') return 'commencée';
  return step.index === cursor ? 'prochaine étape' : 'à faire';
}

/** Valeurs égales (les paramètres « select » sont des chaînes, les nombres tolèrent 1e-9). */
function sameValue(a: ParamValue | undefined, b: ParamValue | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return a === b;
}

/** Préréglage correspondant exactement aux paramètres courants (sur les clés qu'il fixe). */
export function matchingPreset(presets: readonly ObjectPreset[], params: ObjectParams): ObjectPreset | null {
  for (const preset of presets) {
    const entries = Object.entries(preset.params);
    if (entries.length && entries.every(([k, v]) => sameValue(params[k], v as ParamValue | undefined)))
      return preset;
  }
  return null;
}

/** Clés dont la valeur diffère entre deux jeux de paramètres (limité au schéma). */
export function changedParams(
  schema: readonly ParamSchema[],
  a: ObjectParams,
  b: ObjectParams,
): string[] {
  return schema.filter((s) => !sameValue(a[s.key], b[s.key])).map((s) => s.key);
}

/** Valeur bornée et arrondie au pas d'un paramètre numérique. */
export function snapParam(schema: Extract<ParamSchema, { kind: 'number' }>, value: number): number {
  const clamped = Math.min(schema.max, Math.max(schema.min, value));
  if (!(schema.step > 0)) return clamped;
  const snapped = schema.min + Math.round((clamped - schema.min) / schema.step) * schema.step;
  // Élimine le bruit binaire (0.1 + 0.2…) selon la précision du pas.
  return Number(Math.min(schema.max, snapped).toPrecision(12));
}
