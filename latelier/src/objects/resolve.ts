/**
 * Résolution d'un `ObjectDef` pour un jeu de paramètres : pièces actives (variantes), étapes
 * actives, quantités. Aucune dépendance à three.js : utilisable dans les tests.
 */
import type { ObjectDef, ObjectParams, PartDef, StepDef } from './types';

export interface ResolvedObject<P extends ObjectParams = ObjectParams> {
  def: ObjectDef<P>;
  params: P;
  /** Toutes les pièces déclarées (actives ou non), dans l'ordre de déclaration. */
  allParts: readonly PartDef<P>[];
  /** Pièces actives pour ces paramètres. */
  parts: readonly PartDef<P>[];
  /** Index des pièces actives. */
  byId: ReadonlyMap<string, PartDef<P>>;
  /** Étapes déclarées actives. */
  steps: readonly StepDef[];
}

/** Fusionne les paramètres fournis avec les valeurs par défaut de l'objet. */
export function mergeParams<P extends ObjectParams>(def: ObjectDef<P>, params?: Partial<ObjectParams>): P {
  return { ...def.defaultParams, ...(params ?? {}) } as P;
}

export function resolveObject<P extends ObjectParams>(
  def: ObjectDef<P>,
  params?: Partial<ObjectParams>,
): ResolvedObject<P> {
  const merged = mergeParams(def, params);
  const allParts = typeof def.parts === 'function' ? def.parts(merged) : def.parts;
  const parts = allParts.filter((p) => (p.enabled ? p.enabled(merged) : true));
  const byId = new Map(parts.map((p) => [p.id, p] as const));
  const declaredSteps = typeof def.steps === 'function' ? def.steps(merged) : def.steps;
  const steps = declaredSteps.filter((s) => (s.enabled ? s.enabled(merged) : true));
  return { def, params: merged, allParts, parts, byId, steps };
}

/** Quantité physique d'une pièce (instances). */
export function partQuantity<P extends ObjectParams>(part: PartDef<P>, params: P): number {
  const q = typeof part.quantity === 'function' ? part.quantity(params) : part.quantity;
  return q !== undefined && Number.isFinite(q) && q > 0 ? Math.round(q) : 1;
}

/** Nombre total de pièces physiques (hors sous-ensembles sans géométrie propre). */
export function countPhysicalParts<P extends ObjectParams>(resolved: ResolvedObject<P>): number {
  let total = 0;
  for (const part of resolved.parts) {
    if (part.kind === 'assembly' && !part.build) continue;
    total += partQuantity(part, resolved.params);
  }
  return total;
}
