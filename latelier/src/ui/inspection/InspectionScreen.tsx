/**
 * Interface de l'inspection, superposée à la vue 3D de l'établi :
 * - barre du haut : Retour (Échap), objet, outils de vue, changer d'objet, réglages, commandes ;
 * - panneau gauche repliable : arborescence des pièces ;
 * - panneau droit repliable : fiche de la pièce / paramètres de l'objet ;
 * - bas : fiche de l'étape et frise du démontage ;
 * - construction en cours : carte de progression.
 *
 * Seuls les panneaux captent la souris (le reste laisse passer les clics vers la vue 3D). Les
 * encarts occupés par les panneaux sont publiés en variables CSS `--inspection-inset-*` (lues
 * par les étiquettes 3D pour ne pas se placer dessous).
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useAppState, useUi, useUiSound } from '../UiContext';
import { Icon } from '../components/Icon';
import { Key } from '../components/Key';
import { PointerFocusContext, usePointerFocusProps } from '../components/controls';
import { BuildProgress } from './BuildProgress';
import { PartTree } from './PartTree';
import { RightPanel } from './RightPanel';
import { StepTimeline } from './StepTimeline';
import { Toolbar } from './Toolbar';
import { useInspection } from './hooks';

function LeftPanel() {
  const { bus } = useUi();
  const { play } = useUiSound();
  const focusProps = usePointerFocusProps();
  const open = useInspection((s) => s.leftPanelOpen, true);
  const treeKey = useInspection((s) => `${s.objectId}|${JSON.stringify(s.params)}|${s.tree.length > 0}`, '');
  const setOpen = (value: boolean) => {
    play(value ? 'ui.open' : 'ui.close');
    bus.emit('inspection:panels', { left: value });
  };
  if (!open) {
    return (
      <button
        type="button"
        className="panel-tab is-left metal"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir l’arborescence des pièces"
        {...focusProps}
      >
        <Icon name="chevronRight" />
        <span className="panel-tab-label">Pièces</span>
      </button>
    );
  }
  return (
    <aside className="panel panel-left metal-dark" aria-label="Pièces" data-region>
      <header className="panel-header">
        <h2 className="panel-title dymo">Pièces</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(false)}
          title="Replier le panneau"
          {...focusProps}
        >
          <Icon name="chevronLeft" title="Replier le panneau" />
        </button>
      </header>
      {/* Clé : arborescence (et dépliage par défaut) recalculée à chaque objet construit. */}
      <PartTree key={treeKey} />
      <footer className="panel-hints">
        <span>Clic&nbsp;: sélectionner</span>
        <span>Double-clic&nbsp;: cadrer</span>
        <span>
          <Key code="F6" /> panneaux au clavier
        </span>
      </footer>
    </aside>
  );
}

function TopBar() {
  const { bus, store } = useUi();
  const { play, hover } = useUiSound();
  const focusProps = usePointerFocusProps();
  const name = useInspection((s) => s.objectName, '');
  const category = useAppState((s) => {
    const id = s.inspection?.objectId;
    return id ? (s.catalog.find((e) => e.id === id)?.category ?? null) : null;
  });
  const openOverlay = (overlay: 'settings' | 'controls') => {
    play('ui.open');
    store.setState({ overlay });
  };
  return (
    <header className="topbar">
      <div className="topbar-left" data-region>
        <button
          type="button"
          className="btn btn-back"
          onMouseEnter={hover}
          onClick={() => {
            play('ui.close');
            bus.emit('inspection:exit');
          }}
          {...focusProps}
        >
          <Icon name="back" /> Retour <Key code="Escape" />
        </button>
        <div className="object-title paper">
          <span className="pin is-petrol" aria-hidden="true" />
          {category && <span className="object-title-cat">{category}</span>}
          <h1 className="object-title-name display">{name}</h1>
        </div>
      </div>
      <Toolbar />
      <div className="topbar-right" data-region>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => bus.emit('inventory:open')}
          title="Choisir un autre objet"
          {...focusProps}
        >
          <Icon name="box" /> Inventaire <Key code="Tab" />
        </button>
        <button type="button" className="icon-btn" onClick={() => openOverlay('controls')} {...focusProps}>
          <Icon name="keyboard" title="Commandes" />
        </button>
        <button type="button" className="icon-btn" onClick={() => openOverlay('settings')} {...focusProps}>
          <Icon name="gear" title="Réglages" />
        </button>
      </div>
    </header>
  );
}

/** Publie les encarts occupés par l'interface (variables CSS lues par les étiquettes 3D). */
function useInsetVariables(root: RefObject<HTMLDivElement | null>): void {
  const leftOpen = useInspection((s) => s.leftPanelOpen, true);
  const rightOpen = useInspection((s) => s.rightPanelOpen, true);
  const sectionOpen = useInspection((s) => s.section.enabled, false);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const docStyle = document.documentElement.style;
    const measure = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const rect = (selector: string) => el.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
      const left = rect('.panel-left');
      const right = rect('.panel-right');
      const top = rect('.topbar');
      const bottom = rect('.timeline');
      const gap = 8;
      docStyle.setProperty('--inspection-inset-left', `${Math.round(left ? left.right + gap : 0)}px`);
      docStyle.setProperty('--inspection-inset-right', `${Math.round(right ? w - right.left + gap : 0)}px`);
      docStyle.setProperty('--inspection-inset-top', `${Math.round(top ? top.bottom + gap : 0)}px`);
      docStyle.setProperty('--inspection-inset-bottom', `${Math.round(bottom ? h - bottom.top + gap : 0)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const selector of ['.panel-left', '.panel-right', '.topbar', '.timeline']) {
      const target = el.querySelector(selector);
      if (target) observer.observe(target);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [root, leftOpen, rightOpen, sectionOpen]);
  // À la sortie de l'inspection, les encarts sont retirés.
  useEffect(
    () => () => {
      const docStyle = document.documentElement.style;
      for (const side of ['left', 'right', 'top', 'bottom']) docStyle.removeProperty(`--inspection-inset-${side}`);
    },
    [],
  );
}

export function InspectionScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ready = useInspection((s) => s.tree.length > 0, false);
  const building = useInspection((s) => s.buildProgress !== null, false);
  const section = useInspection((s) => s.section.enabled, false);
  useInsetVariables(rootRef);
  return (
    <PointerFocusContext.Provider value="release">
      <div
        ref={rootRef}
        className={`inspection-ui${building ? ' is-building' : ''}${ready ? ' is-ready' : ''}${section ? ' has-section' : ''}`}
      >
        <TopBar />
        <LeftPanel />
        <RightPanel />
        <StepTimeline />
        <BuildProgress />
      </div>
    </PointerFocusContext.Provider>
  );
}

/** Pendant la transition vers l'établi : seule la progression de construction est montrée. */
export function TransitionScreen() {
  return (
    <div className="inspection-ui is-transition">
      <BuildProgress />
    </div>
  );
}
