/**
 * Fenêtre superposée (réglages, commandes) : dialogue modal accessible.
 * - focus placé sur `[data-autofocus]` (ou le premier élément focalisable) à l'ouverture,
 *   rendu à l'élément d'origine à la fermeture ;
 * - Tab / Maj+Tab bouclent dans la fenêtre ;
 * - clic sur le fond ou Échap (géré par le moteur via `store.overlay`) : fermeture.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { focusableIn } from '../keyboard';
import { useKeyScope, useUiSound } from '../UiContext';
import { Icon } from './Icon';
import { Key } from './Key';

export function Modal({
  title,
  onClose,
  children,
  className,
  footer,
  badge,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  /** Étiquette décorative au-dessus du titre. */
  badge?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { play } = useUiSound();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = ref.current;
    const target = el?.querySelector<HTMLElement>('[data-autofocus]') ?? (el ? focusableIn(el)[0] : undefined);
    target?.focus({ preventScroll: true });
    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useKeyScope(ref, (e) => {
    if (e.key !== 'Tab' || !ref.current) return false;
    const items = focusableIn(ref.current);
    if (items.length === 0) return false;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
      return true;
    }
    if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
      return true;
    }
    return false;
  });

  const close = () => {
    play('ui.close');
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={className ? `modal paper ${className}` : 'modal paper'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <span className="tape top-left" aria-hidden="true" />
        <span className="tape top-right" aria-hidden="true" />
        <header className="modal-header">
          {badge}
          <h2 id={titleId} className="modal-title display">
            {title}
          </h2>
          <button type="button" className="btn btn-ink btn-sm modal-close" onClick={close}>
            <Icon name="close" /> Fermer <Key code="Escape" />
          </button>
        </header>
        <div className="modal-body scroll">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
