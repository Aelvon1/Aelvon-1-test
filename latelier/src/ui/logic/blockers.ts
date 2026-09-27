/**
 * État de démontage d'une pièce pour la fiche (logique pure, testée sous Node) : peut-on la
 * retirer / la remonter maintenant, et sinon quelles pièces bloquent (« Bloqué par : … »).
 *
 * Même sémantique que `inspection/graph.ts` (`canRemove` / `canReinsert`) à partir des
 * dépendances copiées dans le store (`InspectionState.dependencies`) :
 * - retrait : toutes les pièces exigées (`requires`) doivent être retirées ;
 * - remontage : les pièces exigées doivent être encore retirées ET les pièces qui l'exigent
 *   (`dependents`) déjà remontées.
 */
import type { PartDependencies, PartDynamic, PartStatic } from '../../core/store';

export type RemovalAvailability =
  | { kind: 'base' } // pièce de base : ne se retire pas
  | { kind: 'ready'; action: 'remove' | 'reinsert' }
  | { kind: 'blocked'; action: 'remove' | 'reinsert'; blockers: string[]; reinsertFirst: boolean }
  | { kind: 'unknown'; action: 'remove' | 'reinsert' }; // dépendances non fournies par le moteur

export function removalAvailability(
  id: string,
  partStatic: Readonly<Record<string, PartStatic>>,
  parts: Readonly<Record<string, PartDynamic>>,
  dependencies: Readonly<Record<string, PartDependencies>> | undefined,
): RemovalAvailability {
  const info = partStatic[id];
  if (!info || !info.removable) return { kind: 'base' };
  const removed = parts[id]?.removed ?? false;
  const action = removed ? 'reinsert' : 'remove';
  const deps = dependencies?.[id];
  if (!deps) return { kind: 'unknown', action };
  const isRemoved = (p: string) => parts[p]?.removed ?? false;
  if (!removed) {
    const blockers = deps.requires.filter((r) => !isRemoved(r));
    return blockers.length
      ? { kind: 'blocked', action, blockers, reinsertFirst: false }
      : { kind: 'ready', action };
  }
  const inPlace = deps.requires.filter((r) => !isRemoved(r));
  const dependents = deps.dependents.filter((d) => isRemoved(d));
  const blockers = [...inPlace, ...dependents];
  return blockers.length
    ? { kind: 'blocked', action, blockers, reinsertFirst: dependents.length > 0 }
    : { kind: 'ready', action };
}
