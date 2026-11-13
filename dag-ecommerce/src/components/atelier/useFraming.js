import { useCallback, useEffect, useRef, useState } from 'react';

// Durée pendant laquelle la caméra reste sur le détail modifié : le trajet (1,5 s côté scène)
// puis le temps de regarder.
const FOLLOW_MS = 4200;

/**
 * Cadrage de la scène. Deux sources : le cadrage choisi par le visiteur (`pin`, qui reste) et
 * celui qu'appelle une modification (`follow`, qui s'efface après quelques secondes pour revenir
 * au premier — la vue d'ensemble tant que le visiteur n'a rien choisi).
 * @param {{ hasMonogram: boolean, disabled?: boolean }} options
 *   disabled : la caméra ne suit pas les modifications (moins d'animations) ; `pin` reste actif.
 * @returns {{ view: string, pin: (view: string) => void, follow: (view: string) => void }}
 */
export function useFraming({ hasMonogram, disabled = false }) {
  const [pinned, setPinned] = useState('full');
  const [followed, setFollowed] = useState(null);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const pin = useCallback((view) => {
    clearTimeout(timer.current);
    setFollowed(null);
    setPinned(view);
  }, []);

  const follow = useCallback(
    (view) => {
      if (disabled) return;
      clearTimeout(timer.current);
      setFollowed(view);
      timer.current = setTimeout(() => setFollowed(null), FOLLOW_MS);
    },
    [disabled],
  );

  const wanted = followed ?? pinned;
  // le gros plan du monogramme n'existe que s'il y a un monogramme
  const view = wanted === 'monogramme' && !hasMonogram ? 'full' : wanted;
  return { view, pin, follow };
}
