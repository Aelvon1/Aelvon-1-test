/**
 * Panneau gauche : arborescence des pièces synchronisée avec la vue 3D.
 * - clic = sélection, double-clic = cadrage, survol = surbrillance 3D ;
 * - œil = masquer/afficher, cible = isoler ; état retiré, en mouvement, bloquant ;
 * - quantités des pièces instanciées (×142), filtre par nom ;
 * - clavier (motif ARIA « tree ») : ↑ ↓ Début Fin, → déplie / enfant, ← replie / parent,
 *   Entrée ou Espace sélectionne. La sélection faite dans la vue 3D déplie et montre la ligne.
 */
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import type { PartDynamic, PartTreeNode } from '../../core/store';
import { useKeyScope, useUi, useUiSound } from '../UiContext';
import { Icon } from '../components/Icon';
import { formatQuantity, plural } from '../logic/format';
import { ancestorsOf, defaultExpanded, filterTree, flattenTree, nodeState, type TreeRow } from '../logic/tree';
import { Highlighted } from '../inventory/InventoryCard';
import { EMPTY, useInspection } from './hooks';

interface RowProps {
  row: TreeRow;
  parts: Readonly<Record<string, PartDynamic>>;
  selected: boolean;
  hovered: boolean;
  isolated: boolean;
  blocker: boolean;
  focus: boolean;
  query: string;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onFrame: (id: string) => void;
  onHover: (id: string | null) => void;
  onHide: (id: string, hidden: boolean) => void;
  onIsolate: (id: string, isolated: boolean) => void;
}

const preventFocus = (e: MouseEvent) => {
  if (e.button === 0) e.preventDefault();
};

const TreeRowView = memo(function TreeRowView({
  row,
  parts,
  selected,
  hovered,
  isolated,
  blocker,
  focus,
  query,
  onToggle,
  onSelect,
  onFrame,
  onHover,
  onHide,
  onIsolate,
}: RowProps) {
  const { node } = row;
  const state = nodeState(node, parts);
  const classes = ['tree-row'];
  if (selected) classes.push('is-selected');
  if (hovered) classes.push('is-hovered');
  if (state.removed) classes.push('is-removed');
  if (state.partial) classes.push('is-partial');
  if (state.hidden) classes.push('is-hidden');
  if (state.animating) classes.push('is-animating');
  if (blocker) classes.push('is-blocker');
  if (node.kind === 'assembly') classes.push('is-assembly');
  const statusText = [
    state.removed ? 'retirée' : state.partial ? 'partiellement démontée' : null,
    state.hidden ? 'masquée' : null,
    isolated ? 'isolée' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div
      role="treeitem"
      id={`tree-${node.id}`}
      className={classes.join(' ')}
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={selected}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-label={`${node.name}${node.quantity > 1 ? `, ${node.quantity} exemplaires` : ''}${statusText ? `, ${statusText}` : ''}`}
      tabIndex={focus ? 0 : -1}
      data-region-focus={focus || undefined}
      data-id={node.id}
      style={{ '--depth': row.depth } as CSSProperties}
      onMouseDown={preventFocus}
      onClick={() => onSelect(node.id)}
      onDoubleClick={() => onFrame(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="tree-indent" aria-hidden="true" />
      {row.hasChildren ? (
        <button
          type="button"
          className={`tree-twisty${row.expanded ? ' is-open' : ''}`}
          tabIndex={-1}
          aria-hidden="true"
          onMouseDown={preventFocus}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
        >
          <Icon name="chevronRight" />
        </button>
      ) : (
        <span className="tree-twisty is-leaf" aria-hidden="true" />
      )}
      <span className="tree-name" aria-hidden="true">
        <Highlighted text={node.name} query={query} />
      </span>
      {node.quantity > 1 && (
        <span className="tree-qty mono" aria-hidden="true">
          {formatQuantity(node.quantity)}
        </span>
      )}
      {state.animating && <span className="tree-busy" aria-hidden="true" />}
      <span className="tree-actions" aria-hidden="true">
        <button
          type="button"
          className={`tree-action${isolated ? ' is-on' : ''}`}
          tabIndex={-1}
          title={isolated ? 'Ne plus isoler (I)' : 'Isoler (I)'}
          onMouseDown={preventFocus}
          onClick={(e) => {
            e.stopPropagation();
            onIsolate(node.id, !isolated);
          }}
        >
          <Icon name="isolate" />
        </button>
        <button
          type="button"
          className={`tree-action${state.hidden ? ' is-on' : ''}`}
          tabIndex={-1}
          title={state.hidden ? 'Afficher' : 'Masquer (H)'}
          onMouseDown={preventFocus}
          onClick={(e) => {
            e.stopPropagation();
            onHide(node.id, !state.hidden);
          }}
        >
          <Icon name={state.hidden ? 'eyeOff' : 'eye'} />
        </button>
      </span>
    </div>
  );
});

export function PartTree() {
  const { bus, store } = useUi();
  const { play } = useUiSound();
  const tree = useInspection((s) => s.tree, EMPTY.array as readonly PartTreeNode[]);
  const parts = useInspection((s) => s.parts, EMPTY.object as Readonly<Record<string, PartDynamic>>);
  const selectedId = useInspection((s) => s.selected?.partId ?? null, null);
  const hoveredId = useInspection((s) => s.hoveredId, null);
  const isolatedId = useInspection((s) => s.isolatedId, null);
  const blocked = useInspection((s) => s.blocked, null);
  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(tree));
  const [focusId, setFocusId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const treeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();

  const filter = useMemo(() => filterTree(tree, query), [tree, query]);
  const rows = useMemo(
    () => flattenTree(tree, expanded, filter?.visible ?? null, filter?.open ?? null),
    [tree, expanded, filter],
  );
  const blockers = useMemo(() => new Set(blocked?.blockers ?? []), [blocked]);
  const counts = useMemo(() => {
    let total = 0;
    let removed = 0;
    const walk = (nodes: readonly PartTreeNode[]) => {
      for (const n of nodes) {
        if (n.kind === 'part') {
          total++;
          if (parts[n.id]?.removed) removed++;
        }
        walk(n.children);
      }
    };
    walk(tree);
    return { total, removed };
  }, [tree, parts]);

  // Sélection venue de la vue 3D : déplier ses ancêtres (abonnement : pas de setState en rendu).
  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const id = state.inspection?.selected?.partId ?? null;
        if (!id || id === (previous.inspection?.selected?.partId ?? null)) return;
        const ancestors = ancestorsOf(state.inspection?.partStatic ?? {}, id);
        setFocusId(id);
        if (ancestors.length)
          setExpanded((prev) => (ancestors.every((a) => prev.has(a)) ? prev : new Set([...prev, ...ancestors])));
      }),
    [store],
  );

  // La ligne sélectionnée reste visible dans la liste.
  useEffect(() => {
    if (!selectedId) return;
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, rows]);

  // Rappels stables (lignes mémoïsées) : l'état courant est relu dans le store au moment du clic.
  const toggle = useCallback(
    (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const select = useCallback(
    (id: string) => {
      play('ui.click');
      setFocusId(id);
      const current = store.getState().inspection?.selected?.partId ?? null;
      bus.emit('inspection:select', { partId: current === id ? null : id });
    },
    [bus, store, play],
  );
  const frame = useCallback(
    (id: string) => {
      bus.emit('inspection:select', { partId: id });
      bus.emit('inspection:frame', { partId: id });
    },
    [bus],
  );
  const hover = useCallback((id: string | null) => bus.emit('inspection:hover', { partId: id }), [bus]);
  const hide = useCallback(
    (id: string, hidden: boolean) => {
      play('ui.click');
      bus.emit('inspection:setHidden', { partId: id, hidden });
    },
    [bus, play],
  );
  const isolate = useCallback(
    (id: string, on: boolean) => {
      play('ui.click');
      bus.emit('inspection:isolate', { partId: on ? id : null });
    },
    [bus, play],
  );

  const currentFocus = rows.some((r) => r.node.id === focusId) ? focusId : (selectedId ?? rows[0]?.node.id ?? null);
  const focusRow = (id: string) => {
    setFocusId(id);
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest' });
  };

  useKeyScope(treeRef, (e) => {
    if (e.target === searchRef.current || rows.length === 0) return false;
    const index = Math.max(
      0,
      rows.findIndex((r) => r.node.id === currentFocus),
    );
    const row = rows[index]!;
    switch (e.key) {
      case 'ArrowDown':
        focusRow(rows[Math.min(rows.length - 1, index + 1)]!.node.id);
        break;
      case 'ArrowUp':
        focusRow(rows[Math.max(0, index - 1)]!.node.id);
        break;
      case 'Home':
        focusRow(rows[0]!.node.id);
        break;
      case 'End':
        focusRow(rows[rows.length - 1]!.node.id);
        break;
      case 'ArrowRight':
        if (row.hasChildren && !row.expanded) toggle(row.node.id);
        else if (row.hasChildren) focusRow(rows[index + 1]!.node.id);
        break;
      case 'ArrowLeft':
        if (row.hasChildren && row.expanded) toggle(row.node.id);
        else if (row.parentId) focusRow(row.parentId);
        break;
      case 'Enter':
      case ' ':
        select(row.node.id);
        break;
      default:
        return false;
    }
    e.preventDefault();
    return true;
  });

  useKeyScope(searchRef, (e) => {
    if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
      return true;
    }
    if (e.key === 'ArrowDown' && rows[0]) {
      e.preventDefault();
      focusRow(currentFocus ?? rows[0].node.id);
      return true;
    }
    return false;
  });

  return (
    <div className="part-tree">
      <div className="panel-sub">
        <label className="tree-search" htmlFor={searchId}>
          <Icon name="search" />
          <span className="sr-only">Filtrer les pièces</span>
          <input
            ref={searchRef}
            id={searchId}
            className="input tree-search-input"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Filtrer les pièces…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p className="tree-counts type">
          {plural(counts.total, 'pièce')} · {plural(counts.removed, 'retirée')}
          {filter && ` · ${plural(filter.matches, 'résultat')}`}
        </p>
      </div>
      <div
        ref={treeRef}
        className="tree scroll"
        role="tree"
        aria-label="Arborescence des pièces"
        aria-multiselectable={false}
      >
        {rows.map((row) => (
          <TreeRowView
            key={row.node.id}
            row={row}
            parts={parts}
            selected={row.node.id === selectedId}
            hovered={row.node.id === hoveredId}
            isolated={row.node.id === isolatedId}
            blocker={blockers.has(row.node.id)}
            focus={row.node.id === currentFocus}
            query={query}
            onToggle={toggle}
            onSelect={select}
            onFrame={frame}
            onHover={hover}
            onHide={hide}
            onIsolate={isolate}
          />
        ))}
        {rows.length === 0 && (
          <p className="tree-empty">{query ? 'Aucune pièce ne correspond.' : 'Préparation des pièces…'}</p>
        )}
      </div>
    </div>
  );
}
