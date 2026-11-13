import { useEffect, useState } from 'react';

const INITIAL = { scrolled: false, deep: false, direction: 'up' };

/**
 * État de défilement de la page, mis à jour au plus une fois par image et
 * seulement quand il change.
 * @param {{ threshold?: number, deepThreshold?: number, tolerance?: number }} [options]
 *   threshold : px à partir desquels `scrolled` devient vrai (défaut 24)
 *   deepThreshold : px à partir desquels `deep` devient vrai (défaut 360)
 *   tolerance : px de mouvement avant de changer de direction (défaut 6)
 * @returns {{ scrolled: boolean, deep: boolean, direction: 'up'|'down' }}
 */
export function useScrollState({ threshold = 24, deepThreshold = 360, tolerance = 6 } = {}) {
  const [state, setState] = useState(INITIAL);

  useEffect(() => {
    let frame = 0;
    let lastY = Math.max(0, window.scrollY);

    const read = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;
      const moved = Math.abs(delta) > tolerance;
      if (moved) lastY = y;
      setState((previous) => {
        const scrolled = y > threshold;
        const deep = y > deepThreshold;
        let direction = previous.direction;
        if (moved) direction = delta > 0 ? 'down' : 'up';
        if (!scrolled) direction = 'up';
        if (previous.scrolled === scrolled && previous.deep === deep && previous.direction === direction) {
          return previous;
        }
        return { scrolled, deep, direction };
      });
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold, deepThreshold, tolerance]);

  return state;
}
