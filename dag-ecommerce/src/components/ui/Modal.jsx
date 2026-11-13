import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import Icon from './Icon';
import { EASE_LUXE } from './motion-presets';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import { cn } from './cn';

const SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

/**
 * Fenêtre modale centrée (feuille basse sur mobile) : focus enfermé, Échap et clic sur le
 * voile pour fermer, défilement de la page verrouillé, focus rendu au déclencheur.
 * @param {{
 *   open: boolean, onClose: () => void, title: import('react').ReactNode,
 *   description?: import('react').ReactNode, size?: 'sm'|'md'|'lg'|'xl', tone?: 'ivoire'|'noir',
 *   footer?: import('react').ReactNode, padded?: boolean, closeLabel?: string,
 *   initialFocus?: { current: HTMLElement|null }, className?: string,
 *   children?: import('react').ReactNode
 * }} props
 *   title : intitulé visible, sert de nom accessible · description : chapeau sous le titre
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
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
  const descriptionId = useId();
  const panelRef = useRef(null);
  const reduced = useReducedMotion();

  useScrollLock(open);
  useFocusTrap(panelRef, open, { onEscape: onClose, initialFocus });

  if (typeof document === 'undefined') return null;

  const rise = reduced ? { duration: 0 } : { duration: 0.7, ease: EASE_LUXE };
  const fade = reduced ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="modal" className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-8" data-tone-ignore>
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
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            data-focus-layer
            className={cn(
              'relative flex max-h-[90dvh] w-full flex-col outline-none sm:max-h-[min(86dvh,54rem)]',
              tone === 'noir' ? 'theme-noir border border-line' : 'theme-ivoire',
              SIZES[size] ?? SIZES.md,
              className,
            )}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={rise}
          >
            <header className="flex shrink-0 items-start justify-between gap-6 border-b border-line py-5 pl-6 pr-3 sm:pl-9 sm:pr-5">
              <div className="min-w-0 py-1.5">
                <h2 id={titleId} className="font-display text-[1.75rem] leading-[1.1] sm:text-[2rem]">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="grid size-11 shrink-0 place-items-center text-fg transition-colors duration-300 hover:text-accent"
              >
                <Icon name="close" size={22} />
              </button>
            </header>
            <div data-lenis-prevent className={cn('scroll-area min-h-0 flex-1', padded && 'px-6 py-7 sm:px-9 sm:py-8')}>
              {children}
            </div>
            {footer ? <footer className="shrink-0 border-t border-line px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:px-9 sm:pb-5">{footer}</footer> : null}
          </Motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
