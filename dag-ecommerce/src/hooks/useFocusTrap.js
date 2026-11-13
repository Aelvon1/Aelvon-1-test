import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableIn(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (element) => element.getClientRects().length > 0 && !element.closest('[inert]'),
  );
}

/**
 * Comportement clavier d'un calque modal : enferme le focus dans `ref`, ferme avec
 * Échap, place le focus à l'ouverture et le rend à l'élément déclencheur à la fermeture.
 * @param {{ current: HTMLElement|null }} ref  conteneur du calque (tabIndex -1 conseillé)
 * @param {boolean} active
 * @param {{ onEscape?: () => void, initialFocus?: { current: HTMLElement|null } }} [options]
 */
export function useFocusTrap(ref, active, { onEscape, initialFocus } = {}) {
  // dernière version des options, sans réarmer le piège à chaque rendu
  const latest = useRef({ onEscape, initialFocus });
  useEffect(() => {
    latest.current = { onEscape, initialFocus };
  });

  useEffect(() => {
    if (!active) return undefined;
    const container = ref.current;
    if (!container) return undefined;
    const previous = document.activeElement;

    const target = latest.current.initialFocus?.current ?? container;
    target.focus({ preventScroll: true });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        // seul le calque le plus haut répond
        const layers = document.querySelectorAll('[data-focus-layer]');
        if (layers[layers.length - 1] !== container) return;
        event.stopPropagation();
        latest.current.onEscape?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusableIn(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === container || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref, active]);
}
