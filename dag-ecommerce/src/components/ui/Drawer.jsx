import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import Icon from './Icon';
import { EASE_LUXE } from './motion-presets';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import { cn } from './cn';

const SIDES = {
  right: { panel: 'inset-y-0 right-0 h-full w-full border-l', hidden: { x: '100%' }, shown: { x: 0 } },
  left: { panel: 'inset-y-0 left-0 h-full w-full border-r', hidden: { x: '-100%' }, shown: { x: 0 } },
  bottom: { panel: 'inset-x-0 bottom-0 max-h-[88dvh] w-full border-t', hidden: { y: '100%' }, shown: { y: 0 } },
};

const WIDTHS = { sm: 'sm:max-w-[24rem]', md: 'sm:max-w-[30rem]', lg: 'sm:max-w-[38rem]' };

/**
 * Tiroir latéral (ou feuille basse) modal : focus enfermé, Échap et clic sur le voile
 * pour fermer, défilement de la page verrouillé, focus rendu au déclencheur à la fermeture.
 * @param {{
 *   open: boolean, onClose: () => void, title: import('react').ReactNode,
 *   side?: 'right'|'left'|'bottom', size?: 'sm'|'md'|'lg', tone?: 'ivoire'|'noir',
 *   footer?: import('react').ReactNode, padded?: boolean, closeLabel?: string,
 *   initialFocus?: { current: HTMLElement|null }, className?: string,
 *   children?: import('react').ReactNode
 * }} props
 *   title : intitulé visible, sert de nom accessible · footer : zone fixe sous la zone défilante
 *   padded : marges internes de la zone défilante (défaut true) · size : largeur maximale (côtés)
 */
export default function Drawer({
  open,
  onClose,
  title,
  side = 'right',
  size = 'md',
  tone = 'ivoire',
  footer,
  padded = true,
  closeLabel = 'Fermer',
  initialFocus,
  className,
  children,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const reduced = useReducedMotion();
  const placement = SIDES[side] ?? SIDES.right;

  useScrollLock(open);
  useFocusTrap(panelRef, open, { onEscape: onClose, initialFocus });

  if (typeof document === 'undefined') return null;

  const slide = reduced ? { duration: 0 } : { duration: 0.75, ease: EASE_LUXE };
  const fade = reduced ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="drawer" className="fixed inset-0 z-[70]" data-tone-ignore>
          <Motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-noir/65"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            onClick={onClose}
          />
          <Motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-focus-layer
            className={cn(
              'absolute flex flex-col border-line outline-none',
              tone === 'noir' ? 'theme-noir' : 'theme-ivoire',
              placement.panel,
              side !== 'bottom' && (WIDTHS[size] ?? WIDTHS.md),
              className,
            )}
            initial={placement.hidden}
            animate={placement.shown}
            exit={placement.hidden}
            transition={slide}
          >
            <header className="flex min-h-[4.75rem] shrink-0 items-center justify-between gap-4 border-b border-line pl-6 pr-3 sm:pl-8 sm:pr-5">
              <h2 id={titleId} className="font-display text-[1.75rem] leading-none">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="grid size-11 shrink-0 place-items-center text-fg transition-colors duration-300 hover:text-accent"
              >
                <Icon name="close" size={22} />
              </button>
            </header>
            <div data-lenis-prevent className={cn('scroll-area min-h-0 flex-1', padded && 'px-6 py-6 sm:px-8')}>
              {children}
            </div>
            {footer ? <footer className="shrink-0 border-t border-line px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-8">{footer}</footer> : null}
          </Motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
