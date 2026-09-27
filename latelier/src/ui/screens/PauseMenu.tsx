/**
 * Menu pause (souris libérée en exploration) : planchette à pince, tampon « Pause »,
 * Reprendre / Réglages / Commandes / Accueil. Flèches ↑ ↓ et Tab pour naviguer.
 */
import { useRef, type RefObject } from 'react';
import { useKeyScope, useUi, useUiSound } from '../UiContext';
import { focusableIn } from '../keyboard';
import { Icon } from '../components/Icon';
import { Stamp } from '../components/Stamp';

/** Zone clavier d'un menu vertical : ↑ ↓ Début Fin déplacent le focus entre les boutons. */
export function useMenuArrows(ref: RefObject<HTMLElement | null>): void {
  useKeyScope(ref, (e) => {
    if (!ref.current || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return false;
    const items = focusableIn(ref.current);
    if (items.length === 0) return false;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? (current + 1) % items.length
        : e.key === 'ArrowUp'
          ? current <= 0
            ? items.length - 1
            : current - 1
          : e.key === 'Home'
            ? 0
            : items.length - 1;
    e.preventDefault();
    items[next]!.focus();
    return true;
  });
}

export function PauseMenu() {
  const { bus, store } = useUi();
  const { play, hover } = useUiSound();
  const menuRef = useRef<HTMLElement>(null);
  useMenuArrows(menuRef);
  const open = (overlay: 'settings' | 'controls') => {
    play('ui.open');
    store.setState({ overlay });
  };
  return (
    <div className="screen pause-screen">
      <div className="clipboard paper">
        <span className="clipboard-clip" aria-hidden="true" />
        <Stamp className="pause-stamp">Pause</Stamp>
        <h2 className="sr-only">Pause</h2>
        <nav ref={menuRef} className="menu-list" aria-label="Menu pause">
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            autoFocus
            onMouseEnter={hover}
            onClick={() => bus.emit('app:resume')}
          >
            <Icon name="play" /> Reprendre
          </button>
          <button type="button" className="btn btn-ink btn-block" onMouseEnter={hover} onClick={() => open('settings')}>
            <Icon name="gear" /> Réglages
          </button>
          <button type="button" className="btn btn-ink btn-block" onMouseEnter={hover} onClick={() => open('controls')}>
            <Icon name="keyboard" /> Commandes
          </button>
          <button
            type="button"
            className="btn btn-ink btn-block"
            onMouseEnter={hover}
            onClick={() => {
              play('ui.close');
              bus.emit('app:home');
            }}
          >
            <Icon name="home" /> Accueil
          </button>
        </nav>
        <p className="pause-note">La souris est libérée. « Reprendre » la capture à nouveau.</p>
      </div>
    </div>
  );
}
