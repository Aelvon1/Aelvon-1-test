import { useEffect } from 'react';
import Lenis from 'lenis';
import { registerLenis } from './scroll';
import { usePrefersReducedMotion } from './useMediaQuery';

/**
 * Réservé à la coque (Layout) : active le défilement adouci.
 * Désactivé si l'utilisateur préfère moins d'animations ; le tactile reste natif.
 */
export function useLenis() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return undefined;
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.1,
      wheelMultiplier: 0.9,
      // les zones défilantes imbriquées (calques, tableaux, listes) défilent nativement
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
    });
    registerLenis(lenis);
    return () => {
      registerLenis(null);
      lenis.destroy();
    };
  }, [reduced]);
}
