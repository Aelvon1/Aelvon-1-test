/**
 * Panneau droit repliable : onglets « Pièce » (fiche de la sélection) et « Objet » (préréglages,
 * paramètres, remise en état). Une nouvelle sélection ou un double-clic dans la vue ramène sur
 * la fiche de la pièce.
 */
import { useEffect, useRef, useState } from 'react';
import { useBusEvent, useUi, useUiSound } from '../UiContext';
import { Icon } from '../components/Icon';
import { usePointerFocusProps } from '../components/controls';
import { PartSheet } from './PartSheet';
import { ObjectPanel } from './ObjectPanel';
import { useInspection } from './hooks';

type Tab = 'part' | 'object';

export function RightPanel() {
  const { bus, store } = useUi();
  const { play } = useUiSound();
  const focusProps = usePointerFocusProps();
  const open = useInspection((s) => s.rightPanelOpen, true);
  const paramsKey = useInspection((s) => JSON.stringify(s.params), '');
  const [tab, setTab] = useState<Tab>('part');
  const [flash, setFlash] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Nouvelle sélection : retour sur la fiche de la pièce (abonnement, pas de setState en rendu).
  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const id = state.inspection?.selected?.partId ?? null;
        if (id && id !== (previous.inspection?.selected?.partId ?? null)) setTab('part');
      }),
    [store],
  );

  // Double-clic dans la vue : panneau ouvert sur la fiche, brève mise en évidence.
  useBusEvent('inspection:focusInfo', () => {
    setTab('part');
    setFlash((n) => n + 1);
    if (!store.getState().inspection?.rightPanelOpen) bus.emit('inspection:panels', { right: true });
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const setOpen = (value: boolean) => {
    play(value ? 'ui.open' : 'ui.close');
    bus.emit('inspection:panels', { right: value });
  };

  if (!open) {
    return (
      <button
        type="button"
        className="panel-tab is-right metal"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le panneau de la fiche"
        {...focusProps}
      >
        <Icon name="chevronLeft" />
        <span className="panel-tab-label">Fiche</span>
      </button>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'part', label: 'Pièce' },
    { id: 'object', label: 'Objet' },
  ];

  return (
    <aside className="panel panel-right metal-dark" aria-label="Fiche et paramètres" data-region>
      <header className="panel-header">
        <div className="panel-tabs" role="tablist" aria-label="Contenu du panneau">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`rp-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="rp-body"
              className={`panel-tab-btn${tab === t.id ? ' is-active' : ''}`}
              onClick={() => {
                play('ui.click');
                setTab(t.id);
              }}
              {...focusProps}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setOpen(false)}
          title="Replier le panneau"
          {...focusProps}
        >
          <Icon name="chevronRight" title="Replier le panneau" />
        </button>
      </header>
      <div
        ref={bodyRef}
        id="rp-body"
        role="tabpanel"
        aria-labelledby={`rp-tab-${tab}`}
        className={`panel-body scroll${flash ? ' is-flash' : ''}`}
        key={tab === 'part' ? `part-${flash}` : 'object'}
      >
        {tab === 'part' ? <PartSheet /> : <ObjectPanel key={paramsKey} />}
      </div>
    </aside>
  );
}
