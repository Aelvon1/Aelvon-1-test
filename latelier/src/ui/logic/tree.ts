/**
 * Arborescence des pièces (panneau gauche de l'inspection) : aplatissement selon les nœuds
 * dépliés, filtrage par nom, états agrégés des sous-ensembles (logique pure, testée sous Node).
 */
import type { PartDynamic, PartStatic, PartTreeNode } from '../../core/store';
import { matchesTokens, normalizeText, queryTokens } from './text';

/** Ligne affichée de l'arborescence (navigation clavier + rendu). */
export interface TreeRow {
  node: PartTreeNode;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  expanded: boolean;
  /** Position (1..n) parmi les frères et nombre de frères (attributs ARIA). */
  posInSet: number;
  setSize: number;
}

/**
 * Lignes visibles (pré-ordre). Avec un filtre actif (`forcedOpen`), les ancêtres des résultats
 * sont dépliés d'office.
 */
export function flattenTree(
  roots: readonly PartTreeNode[],
  expanded: ReadonlySet<string>,
  visible: ReadonlySet<string> | null = null,
  forcedOpen: ReadonlySet<string> | null = null,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (nodes: readonly PartTreeNode[], depth: number, parentId: string | null) => {
    const shown = visible ? nodes.filter((n) => visible.has(n.id)) : nodes;
    shown.forEach((node, i) => {
      const children = visible ? node.children.filter((c) => visible.has(c.id)) : node.children;
      const hasChildren = children.length > 0;
      const isOpen = hasChildren && (expanded.has(node.id) || (forcedOpen?.has(node.id) ?? false));
      rows.push({
        node,
        depth,
        parentId,
        hasChildren,
        expanded: isOpen,
        posInSet: i + 1,
        setSize: shown.length,
      });
      if (isOpen) walk(node.children, depth + 1, node.id);
    });
  };
  walk(roots, 0, null);
  return rows;
}

/**
 * Filtre par nom : identifiants visibles (correspondances + leurs ancêtres + tout le sous-arbre
 * d'un sous-ensemble correspondant) et ancêtres à déplier. `null` si la requête est vide.
 */
export function filterTree(
  roots: readonly PartTreeNode[],
  query: string,
): { visible: Set<string>; open: Set<string>; matches: number } | null {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return null;
  const visible = new Set<string>();
  const open = new Set<string>();
  let matches = 0;
  const addSubtree = (node: PartTreeNode) => {
    visible.add(node.id);
    node.children.forEach(addSubtree);
  };
  const walk = (node: PartTreeNode, ancestors: string[]): boolean => {
    if (matchesTokens(normalizeText(node.name), tokens)) {
      matches++;
      addSubtree(node);
      for (const a of ancestors) {
        visible.add(a);
        open.add(a);
      }
      // Les descendants peuvent aussi correspondre : on continue pour compter et déplier.
      node.children.forEach((c) => walk(c, [...ancestors, node.id]));
      return true;
    }
    let any = false;
    for (const c of node.children) any = walk(c, [...ancestors, node.id]) || any;
    return any;
  };
  roots.forEach((r) => walk(r, []));
  return { visible, open, matches };
}

/** Sous-ensembles dépliés par défaut : les racines et leurs enfants directs de type sous-ensemble. */
export function defaultExpanded(roots: readonly PartTreeNode[]): Set<string> {
  const out = new Set<string>();
  for (const root of roots) {
    if (root.children.length) out.add(root.id);
    if (roots.length === 1)
      for (const child of root.children)
        if (child.kind === 'assembly' && child.children.length) out.add(child.id);
  }
  return out;
}

/** Ancêtres d'une pièce (du parent direct à la racine), d'après les données statiques. */
export function ancestorsOf(partStatic: Readonly<Record<string, PartStatic>>, id: string): string[] {
  const out: string[] = [];
  let current = partStatic[id]?.parent ?? null;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    out.push(current);
    current = partStatic[current]?.parent ?? null;
  }
  return out;
}

/** État agrégé d'un nœud : pièces retirées / total du sous-arbre (nœuds, pas instances). */
export interface NodeState {
  removed: boolean;
  /** Une partie seulement du sous-arbre est retirée. */
  partial: boolean;
  hidden: boolean;
  animating: boolean;
}

export function nodeState(node: PartTreeNode, parts: Readonly<Record<string, PartDynamic>>): NodeState {
  const own = parts[node.id];
  let removedCount = 0;
  let total = 0;
  const walk = (n: PartTreeNode) => {
    for (const c of n.children) {
      total++;
      if (parts[c.id]?.removed) removedCount++;
      walk(c);
    }
  };
  walk(node);
  const removed = own?.removed ?? false;
  return {
    removed,
    partial: !removed && removedCount > 0 && total > 0,
    hidden: own?.hidden ?? false,
    animating: own?.animating ?? false,
  };
}
