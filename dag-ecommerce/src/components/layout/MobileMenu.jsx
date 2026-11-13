import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import Icon from '../ui/Icon';
import { EASE_LUXE } from '../ui/motion-presets';
import { CONTACT_EMAIL, PRIMARY_NAV, SECONDARY_NAV, currentState } from './navigation';

/**
 * Menu plein écran (mobile et tablette) : grands liens révélés en cascade, liens secondaires,
 * e-mail de contact. Modal : focus enfermé, Échap pour fermer, page verrouillée.
 * @param {{ open: boolean, onClose: () => void, pathname: string, wishCount?: number }} props
 */
export default function MobileMenu({ open, onClose, pathname, wishCount = 0 }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const reduced = useReducedMotion();

  useScrollLock(open);
  useFocusTrap(panelRef, open, { onEscape: onClose, initialFocus: closeRef });

  if (typeof document === 'undefined') return null;

  const curtain = reduced
    ? { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0 } } }
    : {
        hidden: { clipPath: 'inset(0% 0% 100% 0%)', transition: { duration: 0.6, ease: EASE_LUXE } },
        shown: {
          clipPath: 'inset(0% 0% 0% 0%)',
          transition: { duration: 0.8, ease: EASE_LUXE, staggerChildren: 0.075, delayChildren: 0.28 },
        },
      };
  const rise = reduced
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : { hidden: { y: '110%' }, shown: { y: '0%', transition: { duration: 0.9, ease: EASE_LUXE } } };
  const fade = reduced
    ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE_LUXE } } };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <Motion.div
          key="menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          tabIndex={-1}
          data-focus-layer
          data-tone-ignore
          className="theme-noir fixed inset-0 z-[60] flex flex-col outline-none"
          variants={curtain}
          initial="hidden"
          animate="shown"
          exit="hidden"
        >
          <div className="container-luxe flex h-[var(--header-h)] shrink-0 items-center justify-between">
            <Link
              to="/"
              onClick={onClose}
              aria-label="DAG — accueil"
              className="flex min-h-11 items-center font-display text-[1.625rem] font-medium leading-none tracking-[0.22em]"
            >
              DAG
            </Link>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Fermer le menu"
              className="-mr-2.5 grid size-11 place-items-center"
            >
              <Icon name="close" size={24} />
            </button>
          </div>

          <div data-lenis-prevent className="scroll-area flex min-h-0 flex-1 flex-col">
            <div className="container-luxe flex flex-1 flex-col justify-between gap-12 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4">
              <nav aria-label="Navigation principale">
                <ul className="border-t border-line">
                  {PRIMARY_NAV.map((item, index) => (
                    <li key={item.to} className="overflow-hidden border-b border-line">
                      <Motion.div variants={rise}>
                        <Link
                          to={item.to}
                          onClick={onClose}
                          aria-current={currentState(item, pathname)}
                          className="group flex items-baseline justify-between gap-4 py-[1.125rem] font-display text-[clamp(2.5rem,11.5vw,4.25rem)] leading-none tracking-[-0.01em] aria-[current]:italic"
                        >
                          <span>{item.label}</span>
                          <span aria-hidden="true" className="eyebrow tabular-nums text-muted group-aria-[current]:text-accent">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        </Link>
                      </Motion.div>
                    </li>
                  ))}
                </ul>
              </nav>

              <Motion.div variants={fade} className="flex flex-col gap-8">
                <nav aria-label="Liens utiles">
                  <ul className="grid grid-cols-2 gap-x-6">
                    {[{ label: wishCount > 0 ? `Favoris (${wishCount})` : 'Favoris', to: '/favoris' }, ...SECONDARY_NAV].map((item) => (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          onClick={onClose}
                          aria-current={pathname === item.to ? 'page' : undefined}
                          className="flex min-h-11 items-center text-[0.9375rem] text-muted transition-colors duration-300 hover:text-fg aria-[current]:text-fg"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="flex flex-col gap-1 border-t border-line pt-6">
                  <p className="eyebrow text-muted">Nous écrire</p>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="flex min-h-11 w-fit items-center font-display text-[1.375rem] leading-none"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </Motion.div>
            </div>
          </div>
        </Motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
