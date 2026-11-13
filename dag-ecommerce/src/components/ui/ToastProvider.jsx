import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import Icon from './Icon';
import { EASE_LUXE } from './motion-presets';
import { ToastContext, createToastApi } from './toast-context';

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = 4500;
let sequence = 0;

function Toast({ toast, onDismiss }) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !(toast.duration > 0)) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.duration, onDismiss]);

  return (
    <Motion.li
      layout={reduced ? false : 'position'}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: reduced ? 0 : 0.55, ease: EASE_LUXE }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="tone-noir pointer-events-auto flex w-full max-w-[26rem] items-center gap-3.5 border border-ivoire/15 bg-fusain py-2 pl-4 pr-1.5 shadow-[0_18px_50px_-18px_rgb(0_0_0/0.65)] sm:w-[24rem]"
    >
      <Icon name={toast.icon ?? 'check'} size={18} className="text-accent" />
      <div className="min-w-0 flex-1 py-1.5">
        <p className="text-sm leading-snug text-fg">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{toast.description}</p> : null}
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action.onClick?.();
            onDismiss(toast.id);
          }}
          className="min-h-11 shrink-0 px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-accent transition-colors duration-300 hover:text-fg"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fermer la notification"
        className="grid size-11 shrink-0 place-items-center text-muted transition-colors duration-300 hover:text-fg"
      >
        <Icon name="close" size={16} />
      </button>
    </Motion.li>
  );
}

/**
 * Fournit `useToast()` à l'application et affiche les notifications (région aria-live polie),
 * empilées en bas de l'écran, refermées automatiquement.
 * @param {{ children?: import('react').ReactNode }} props
 */
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((input) => {
    const options = typeof input === 'string' ? { title: input } : (input ?? {});
    sequence += 1;
    const id = `toast-${sequence}`;
    setToasts((list) => [...list, { duration: DEFAULT_DURATION, ...options, id }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const api = useMemo(() => createToastApi(show, dismiss), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document === 'undefined'
        ? null
        : createPortal(
            <div
              role="region"
              aria-label="Notifications"
              data-tone-ignore
              className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
            >
              <ul aria-live="polite" aria-relevant="additions" className="flex flex-col items-center gap-2 sm:items-start">
                <AnimatePresence initial={false}>
                  {toasts.map((toast) => (
                    <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
                  ))}
                </AnimatePresence>
              </ul>
            </div>,
            document.body,
          )}
    </ToastContext.Provider>
  );
}
