/**
 * Inventaire (Tab, ou E devant l'établi) : planche de liège encadrée, fiches cartonnées
 * punaisées, recherche insensible aux accents + filtre par catégorie, grille défilante prévue
 * pour des dizaines d'objets, navigation clavier complète.
 *
 * Clavier : la recherche prend le focus à l'ouverture ; ↓ passe à la grille ; flèches, Début,
 * Fin, Page↑/↓ parcourent les fiches ; Entrée choisit ; une lettre tapée sur une fiche revient
 * à la recherche ; Échap efface la recherche puis ferme ; Tab ferme (moteur).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { CatalogEntry } from '../../core/store';
import { useAppState, useKeyScope, useUi, useUiSound } from '../UiContext';
import { buildSearchIndex, catalogCategories, filterCatalog, gridMove } from '../logic/inventory';
import { plural } from '../logic/format';
import { Icon } from '../components/Icon';
import { Key } from '../components/Key';
import { InventoryCard } from './InventoryCard';

/** Nombre de colonnes réellement affichées (fiches partageant la position verticale de la première). */
function gridColumns(grid: HTMLElement | null): number {
  if (!grid) return 1;
  const cards = grid.querySelectorAll<HTMLElement>('.inv-cell');
  if (cards.length === 0) return 1;
  const top = cards[0]!.offsetTop;
  let n = 0;
  for (const c of cards) {
    if (c.offsetTop !== top) break;
    n++;
  }
  return Math.max(1, n);
}

export function InventoryScreen() {
  const { bus, store } = useUi();
  const { play, hover } = useUiSound();
  const catalog = useAppState((s) => s.catalog);
  const { query, category, thumbnails } = useAppState(
    useShallow((s) => ({ query: s.inventory.query, category: s.inventory.category, thumbnails: s.inventory.thumbnails })),
  );
  const benchId = useAppState((s) => s.inspection?.objectId ?? null);
  const [focusIndex, setFocusIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const searchId = useId();
  const chipsName = useId();

  const index = useMemo(() => buildSearchIndex(catalog), [catalog]);
  const results = useMemo(() => filterCatalog(index, query, category), [index, query, category]);
  const categories = useMemo(() => catalogCategories(catalog), [catalog]);
  const activeIndex = Math.min(focusIndex, Math.max(0, results.length - 1));

  // Miniatures manquantes demandées au moteur à l'ouverture (rendu étalé, une vue par image).
  useEffect(() => {
    const missing = store
      .getState()
      .catalog.filter((e) => !store.getState().inventory.thumbnails[e.id])
      .map((e) => e.id);
    if (missing.length) bus.emit('inventory:thumbnails', { objectIds: missing });
  }, [bus, store]);

  // Focus sur la recherche à l'ouverture, à l'image suivante : la touche qui a ouvert
  // l'inventaire (E) ne doit pas s'écrire dans le champ.
  useEffect(() => {
    const id = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);

  const setQuery = (value: string) => {
    store.setState((s) => ({ inventory: { ...s.inventory, query: value } }));
    setFocusIndex(0);
  };
  const setCategory = (value: string | null) => {
    play('ui.click');
    store.setState((s) => ({ inventory: { ...s.inventory, category: value } }));
    setFocusIndex(0);
  };

  const select = useCallback(
    (entry: CatalogEntry) => {
      play('ui.stamp');
      bus.emit('inventory:select', { objectId: entry.id });
    },
    [bus, play],
  );

  const focusCard = (i: number) => {
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  useKeyScope(searchRef, (e) => {
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault();
      focusCard(activeIndex);
      return true;
    }
    if (e.key === 'Enter' && results[0]) {
      e.preventDefault();
      select(results[0]);
      return true;
    }
    if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
      return true;
    }
    return false;
  });

  useKeyScope(gridRef, (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    const next = gridMove(activeIndex, results.length, gridColumns(gridRef.current), e.key);
    if (next !== null) {
      e.preventDefault();
      if (e.key === 'ArrowUp' && next === activeIndex) searchRef.current?.focus();
      else {
        setFocusIndex(next);
        focusCard(next);
      }
      return true;
    }
    // Saisie directe : retour à la recherche (le caractère y est inscrit par le navigateur).
    if (e.key.length === 1 && e.key !== ' ') {
      searchRef.current?.focus();
      return true;
    }
    return false;
  });

  const onFocusIndex = useCallback((i: number) => setFocusIndex(i), []);
  const total = catalog.length;

  return (
    <div className="screen inventory-screen" role="dialog" aria-modal="true" aria-labelledby={`${searchId}-title`}>
      <div className="inv-board">
        <header className="inv-header">
          <div className="inv-title-block">
            <span className="dymo is-orange inv-kicker">Inventaire</span>
            <h2 id={`${searchId}-title`} className="inv-title display">
              Choisissez un objet à démonter
            </h2>
            <p className="inv-count type">
              {plural(total, 'objet')} au tiroir{benchId ? ' · un objet sur l’établi' : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ink inv-close paper"
            onMouseEnter={hover}
            onClick={() => bus.emit('inventory:close')}
          >
            <Icon name="close" /> Fermer <Key code="Tab" />
          </button>
        </header>

        <div className="inv-filters">
          <label className="inv-search paper" htmlFor={searchId}>
            <Icon name="search" />
            <span className="sr-only">Rechercher un objet</span>
            <input
              ref={searchRef}
              id={searchId}
              className="inv-search-input"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Rechercher : nom, catégorie, mot-clé…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-controls={`${searchId}-grid`}
            />
            {query && (
              <button type="button" className="icon-btn inv-search-clear" onClick={() => setQuery('')}>
                <Icon name="close" title="Effacer la recherche" />
              </button>
            )}
          </label>
          <div className="inv-chips" role="radiogroup" aria-label="Catégorie">
            {[{ name: null as string | null, count: total }, ...categories].map((c) => {
              const checked = category === c.name;
              return (
                <label key={c.name ?? '*'} className={`inv-chip${checked ? ' is-checked' : ''}`}>
                  <input
                    type="radio"
                    name={chipsName}
                    checked={checked}
                    onChange={() => setCategory(c.name)}
                  />
                  <span>{c.name ?? 'Toutes'}</span>
                  <span className="inv-chip-count">{c.count}</span>
                </label>
              );
            })}
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {plural(results.length, 'résultat')}
        </p>

        {results.length === 0 && (
          <div className="inv-empty paper">
            <span className="tape top-center" aria-hidden="true" />
            <p className="display">
              {query ? `Rien dans le tiroir ne correspond à « ${query} ».` : 'Aucun objet dans cette catégorie.'}
            </p>
            <button
              type="button"
              className="btn btn-ink"
              onClick={() => {
                setQuery('');
                setCategory(null);
                searchRef.current?.focus();
              }}
            >
              Effacer la recherche et le filtre
            </button>
          </div>
        )}
        {/* Grille toujours montée (zone clavier enregistrée une fois), masquée si vide. */}
        <ul
          ref={gridRef}
          id={`${searchId}-grid`}
          className="inv-grid scroll"
          aria-label="Objets"
          hidden={results.length === 0}
        >
          {results.map((entry, i) => (
            <InventoryCard
              key={entry.id}
              entry={entry}
              thumb={thumbnails[entry.id]}
              query={query}
              index={i}
              focusable={i === activeIndex}
              onBench={entry.id === benchId}
              onSelect={select}
              onFocusIndex={onFocusIndex}
              onHover={hover}
            />
          ))}
        </ul>

        <footer className="inv-hints">
          <span>
            <Key code="ArrowLeft" />
            <Key code="ArrowUp" />
            <Key code="ArrowDown" />
            <Key code="ArrowRight" /> parcourir
          </span>
          <span>
            <Key code="Enter" /> démonter
          </span>
          <span>
            <Key code="Tab" /> ou <Key code="Escape" /> fermer
          </span>
        </footer>
      </div>
    </div>
  );
}
