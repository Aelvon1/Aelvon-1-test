/**
 * Validation des définitions d'objets (exécutée au démarrage en développement et dans les tests).
 * Produit des erreurs explicites : identifiants dupliqués, parents ou dépendances inexistants,
 * cycles, étapes incohérentes, fiches incomplètes, directions nulles…
 */
import { DisassemblyGraph } from '../inspection/graph';
import { resolveObject } from './resolve';
import type { ObjectDef, ObjectParams, PartDef, Vec3 } from './types';

export interface ValidationReport {
  objectId: string;
  /** Contexte (paramètres/préréglage) testé. */
  context: string;
  errors: string[];
  warnings: string[];
}

const isZero = (v: Vec3) => Math.hypot(v[0], v[1], v[2]) < 1e-9;
const finite = (v: Vec3) => v.length === 3 && v.every(Number.isFinite);

/**
 * Valide un objet pour un jeu de paramètres. `knownTools` : identifiants d'outils connus
 * (catalogue du moteur + outils propres à l'objet) ; si omis, les outils ne sont pas vérifiés.
 */
export function validateObject<P extends ObjectParams>(
  def: ObjectDef<P>,
  params?: Partial<ObjectParams>,
  knownTools?: ReadonlySet<string>,
  context = 'paramètres par défaut',
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const report: ValidationReport = { objectId: def.id, context, errors, warnings };

  if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id))
    errors.push(`Identifiant d'objet invalide « ${def.id} » (minuscules, chiffres, tirets).`);
  if (!def.name.trim()) errors.push('Nom d’objet vide.');
  for (const schema of def.paramSchema) {
    if (!(schema.key in def.defaultParams))
      errors.push(`Paramètre « ${schema.key} » sans valeur par défaut.`);
  }

  let resolved;
  try {
    resolved = resolveObject(def, params);
  } catch (error) {
    errors.push(`Résolution impossible : ${(error as Error).message}`);
    return report;
  }
  const { allParts, parts, byId } = resolved;

  // Identifiants uniques (sur toutes les pièces déclarées).
  const seen = new Set<string>();
  for (const p of allParts) {
    if (seen.has(p.id)) errors.push(`Identifiant de pièce dupliqué : « ${p.id} ».`);
    seen.add(p.id);
  }
  const allIds = new Set(allParts.map((p) => p.id));
  const allTags = new Set(parts.flatMap((p) => p.tags ?? []));
  const toolSet = new Set([...(knownTools ?? []), ...(def.tools ?? []).map((t) => t.id)]);

  for (const p of parts) checkPart(p, byId, allIds, allTags, knownTools ? toolSet : null, errors, warnings);

  // Cycles de hiérarchie.
  for (const p of parts) {
    const chain = new Set<string>([p.id]);
    let cur = p.parent ? byId.get(p.parent) : undefined;
    while (cur) {
      if (chain.has(cur.id)) {
        errors.push(`Cycle de hiérarchie impliquant « ${p.id} ».`);
        break;
      }
      chain.add(cur.id);
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
  }

  // Graphe (dépendances développées + règle implicite du parent) et cycles.
  let graph: DisassemblyGraph | null = null;
  try {
    graph = new DisassemblyGraph(parts, resolved.steps, allIds);
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (graph) {
    const cycle = findCycle(
      parts.map((p) => p.id),
      (id) => graph!.requires(id),
    );
    if (cycle) errors.push(`Cycle de dépendances : ${cycle.join(' → ')}.`);
    for (const step of resolved.steps) {
      if (!step.title.trim() || !step.description.trim())
        errors.push(`Étape « ${step.id} » sans titre ou description.`);
      if (step.tool && knownTools && !toolSet.has(step.tool))
        errors.push(`Étape « ${step.id} » : outil inconnu « ${step.tool} ».`);
    }
    const stepIds = new Set<string>();
    for (const step of resolved.steps) {
      if (stepIds.has(step.id)) errors.push(`Identifiant d'étape dupliqué : « ${step.id} ».`);
      stepIds.add(step.id);
    }
    if (!cycle && errors.length === 0) {
      try {
        const order = graph.simulateFullDisassembly();
        const removable = parts.filter((p) => p.removal).length;
        if (order.length !== removable)
          errors.push(`Le démontage A→Z ne retire que ${order.length}/${removable} pièces.`);
      } catch (error) {
        errors.push((error as Error).message);
      }
    }
    const autoSteps = graph.steps.filter((s) => s.auto).length;
    if (autoSteps > 0)
      warnings.push(`${autoSteps} pièce(s) retirable(s) sans étape déclarée (étapes générées).`);
  }
  return report;
}

function checkPart<P extends ObjectParams>(
  p: PartDef<P>,
  byId: ReadonlyMap<string, PartDef<P>>,
  allIds: ReadonlySet<string>,
  allTags: ReadonlySet<string>,
  tools: ReadonlySet<string> | null,
  errors: string[],
  warnings: string[],
): void {
  const where = `Pièce « ${p.id} »`;
  if (!p.id.trim() || /\s/.test(p.id)) errors.push(`${where} : identifiant invalide (espaces interdits).`);
  if (!p.name.trim()) errors.push(`${where} : nom vide.`);
  if (p.parent !== undefined) {
    const parent = byId.get(p.parent);
    if (!parent) {
      if (!allIds.has(p.parent)) errors.push(`${where} : parent inexistant « ${p.parent} ».`);
      else errors.push(`${where} : parent « ${p.parent} » désactivé alors que la pièce est active.`);
    } else if (parent.kind !== 'assembly') {
      errors.push(`${where} : le parent « ${p.parent} » doit être un sous-ensemble (kind: 'assembly').`);
    }
  }
  if (p.kind !== 'assembly' && !p.build) errors.push(`${where} : une pièce doit avoir une fonction build.`);
  if (!p.info.role.trim() || !p.info.material.trim() || !p.info.dimensions.trim()) {
    errors.push(`${where} : fiche incomplète (rôle, matière et dimensions obligatoires).`);
  }
  const e = p.explode;
  if (!(e.distance >= 0) || !Number.isFinite(e.distance))
    errors.push(`${where} : distance d'éclatement invalide.`);
  if (e.direction !== 'radial' && (!finite(e.direction) || (isZero(e.direction) && e.distance > 0))) {
    errors.push(`${where} : direction d'éclatement nulle ou invalide.`);
  }
  if (e.stage !== undefined && (!Number.isInteger(e.stage) || e.stage < 0))
    errors.push(`${where} : étage d'éclatement invalide.`);
  const r = p.removal;
  if (r) {
    if (!finite(r.axis) || isZero(r.axis)) errors.push(`${where} : axe de retrait nul ou invalide.`);
    if (!(r.distance > 0)) errors.push(`${where} : distance de retrait doit être > 0.`);
    if (r.motion === 'unscrew' && (!(r.turns! > 0) || !(r.pitch! > 0)))
      errors.push(`${where} : dévissage sans tours/pas.`);
    if (r.duration !== undefined && !(r.duration > 0)) errors.push(`${where} : durée invalide.`);
    if (r.motion === 'spread' && !r.spread)
      errors.push(`${where} : mouvement « spread » sans paramètre spread.`);
    if (tools && r.tool && !tools.has(r.tool)) errors.push(`${where} : outil inconnu « ${r.tool} ».`);
    for (const ref of r.requires ?? []) {
      if (ref.startsWith('#')) {
        if (!allTags.has(ref.slice(1)))
          warnings.push(`${where} : le tag « ${ref} » ne correspond à aucune pièce active.`);
      } else if (!allIds.has(ref)) {
        errors.push(`${where} : dépendance inexistante « ${ref} ».`);
      } else if (ref === p.id) {
        errors.push(`${where} : dépend d'elle-même.`);
      }
    }
  }
}

/** Recherche d'un cycle (DFS itératif) ; retourne le chemin du cycle ou null. */
export function findCycle(ids: readonly string[], next: (id: string) => readonly string[]): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  for (const start of ids) {
    if (state.get(start)) continue;
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
    const path: string[] = [start];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const succ = next(top.id);
      if (top.i < succ.length) {
        const n = succ[top.i++]!;
        const s = state.get(n) ?? 0;
        if (s === 1) return [...path.slice(path.indexOf(n)), n];
        if (s === 0) {
          state.set(n, 1);
          stack.push({ id: n, i: 0 });
          path.push(n);
        }
      } else {
        state.set(top.id, 2);
        stack.pop();
        path.pop();
      }
    }
  }
  return null;
}

/** Valide un objet pour ses paramètres par défaut et chacun de ses préréglages. */
export function validateObjectAllPresets<P extends ObjectParams>(
  def: ObjectDef<P>,
  knownTools?: ReadonlySet<string>,
): ValidationReport[] {
  const reports = [validateObject(def, undefined, knownTools)];
  for (const preset of def.presets ?? []) {
    reports.push(validateObject(def, preset.params, knownTools, `préréglage « ${preset.label} »`));
  }
  return reports;
}
