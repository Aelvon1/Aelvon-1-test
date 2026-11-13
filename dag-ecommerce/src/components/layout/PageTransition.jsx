import { Suspense, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { scrollToTarget } from '../../hooks/scroll';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import ErrorBoundary from './ErrorBoundary';
import PageFallback from './PageFallback';

const EXIT_MS = 320;
// positions de défilement par entrée d'historique, pour le retour arrière
const positions = new Map();

/**
 * Transition entre pages : la page sortante s'efface, la suivante apparaît en fondu, le
 * défilement revient en haut (ou à sa position d'origine lors d'un retour arrière).
 * Seul le chemin déclenche la transition : un changement de paramètres (?…) ou d'ancre est immédiat.
 * Uniquement de l'opacité — au repos, aucun ancêtre du contenu ne porte de transform, de filter
 * ni de will-change : position: sticky et position: fixed fonctionnent dans les pages.
 * @param {{ children: (location: import('react-router-dom').Location) => import('react').ReactNode }} props
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(location);
  const [, startTransition] = useTransition();

  const leaving = location.pathname !== shown.pathname;
  // même page (paramètres, ancre) : on suit sans transition
  if (!leaving && location !== shown) setShown(location);

  useEffect(() => {
    if (!leaving) return undefined;
    positions.set(shown.key, window.scrollY);
    // startTransition : si la page suivante se charge encore, l'ancienne reste montée (invisible)
    const timer = setTimeout(() => startTransition(() => setShown(location)), reduced ? 0 : EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, location, shown.key, reduced]);

  const latest = useRef({ navigationType, key: shown.key, hash: shown.hash });
  useLayoutEffect(() => {
    latest.current = { navigationType, key: shown.key, hash: shown.hash };
  });

  const mounted = useRef(false);
  useLayoutEffect(() => {
    const { navigationType: type, key, hash } = latest.current;
    const initial = !mounted.current;
    mounted.current = true;
    let frame = 0;

    if (hash) {
      // l'ancre peut appartenir à un contenu qui finit de se monter : on réessaie à l'image suivante
      if (!scrollToTarget(hash, { immediate: true })) {
        frame = requestAnimationFrame(() => {
          if (!scrollToTarget(hash, { immediate: true }) && !initial) scrollToTarget(0, { immediate: true });
        });
      }
    } else if (!initial) {
      const saved = type === 'POP' ? positions.get(key) : undefined;
      scrollToTarget(saved ?? 0, { immediate: true });
      if (saved) frame = requestAnimationFrame(() => scrollToTarget(saved, { immediate: true }));
    }
    return () => cancelAnimationFrame(frame);
  }, [shown.pathname]);

  // une ancre qui change sur la même page : défilement doux vers la cible
  const firstHash = useRef(true);
  useEffect(() => {
    if (firstHash.current) {
      firstHash.current = false;
      return;
    }
    if (shown.hash) scrollToTarget(shown.hash);
  }, [shown.hash]);

  return (
    <div className="page-stage" data-leaving={leaving && !reduced}>
      <Suspense fallback={<PageFallback />}>
        <div key={shown.pathname} className="page-enter">
          <ErrorBoundary resetKey={shown.pathname}>{children(shown)}</ErrorBoundary>
        </div>
      </Suspense>
    </div>
  );
}
