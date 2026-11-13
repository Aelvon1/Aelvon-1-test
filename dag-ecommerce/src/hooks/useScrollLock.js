import { useEffect } from 'react';
import { lockScroll, unlockScroll } from './scroll';

/** Verrouille le défilement de la page tant que `active` est vrai (coopère avec Lenis). */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    lockScroll();
    return unlockScroll;
  }, [active]);
}
