import { Suspense, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { scrollToTarget } from '../../hooks/scroll';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import ErrorBoundary from './ErrorBoundary';
import PageFallback from './PageFallback';

const EXIT_MS = 320;
// positions de défilement par entrée d'historique, pour le retour arrière
const positions = new Map();

// Ancre dont la cible n'est pas encore montée : délai d'attente une fois la page affichée,
// et plafond absolu (page qui ne finirait jamais de se charger).
const ANCHOR_WAIT_MS = 2000;
const ANCHOR_GIVE_UP_MS = 15000;
// au-delà de cet écart, c'est le visiteur qui a défilé : on ne le déplace plus
const VISITOR_MOVED_PX = 4;

/**
 * Rejoint une ancre (« /faq#retours ») dont la cible n'existe pas encore : page chargée à la
 * demande, contenu qui finit de se monter. Réessaie à chaque image jusqu'à ce que la cible
 * existe — au plus ANCHOR_WAIT_MS après l'affichage de la page, le temps de chargement ne compte
 * pas — puis se recale une fois les polices chargées (la hauteur des textes a pu changer).
 * S'arrête dès que le visiteur défile lui-même. Les sauts sont immédiats et idempotents : une
 * page qui rejoint elle-même son ancre (useHashAnchor) arrive au même endroit, sans conflit.
 * @param {string} hash  « #id »
 * @param {{ focus?: boolean }} [options]  focus : la cible reçoit le focus quand elle est atteinte
 * @returns {() => void} annulation
 */
function followAnchor(hash, { focus = false } = {}) {
  const started = performance.now();
  let previous = started;
  let waited = 0;
  let frame = 0;
  let cancelled = false;
  let expectedY = window.scrollY;

  const visitorMoved = () => Math.abs(window.scrollY - expectedY) > VISITOR_MOVED_PX;
  const jump = (withFocus) => {
    if (!scrollToTarget(hash, { immediate: true, focus: withFocus })) return false;
    expectedY = window.scrollY;
    return true;
  };

  const realign = () => {
    frame = requestAnimationFrame(() => {
      if (!cancelled && !visitorMoved()) jump(false);
    });
  };

  const attempt = (now) => {
    if (cancelled || visitorMoved()) return;
    // le focus ne quitte <main> (ou le document) pour la cible que s'il n'a pas été placé ailleurs entre-temps
    const active = document.activeElement;
    const focusFree = !active || active === document.body || active.id === 'contenu';
    if (jump(focus && focusFree)) {
      document.fonts?.ready.then(() => !cancelled && realign()).catch(() => {});
      return;
    }
    if (!document.querySelector('[data-page-fallback]')) waited += now - previous;
    previous = now;
    if (waited < ANCHOR_WAIT_MS && now - started < ANCHOR_GIVE_UP_MS) frame = requestAnimationFrame(attempt);
  };

  frame = requestAnimationFrame(attempt);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}

/**
 * Transition entre pages : la page sortante s'efface, la suivante apparaît en fondu, le
 * défilement revient en haut (ou à sa position d'origine lors d'un retour arrière) et le focus
 * rejoint le contenu de la nouvelle page.
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

  // Défilement. « arrival » : premier affichage du site — le chemin n'a pas encore changé
  // (reste vrai quand StrictMode rejoue l'effet au montage).
  const scrolledPath = useRef(shown.pathname);
  useLayoutEffect(() => {
    const { navigationType: type, key, hash } = latest.current;
    const arrival = scrolledPath.current === shown.pathname;
    scrolledPath.current = shown.pathname;

    if (hash) {
      // changement de page vers une ancre : la cible reçoit aussi le focus (comme un lien « #id »)
      if (scrollToTarget(hash, { immediate: true, focus: !arrival })) return undefined;
      // la cible n'est pas encore là : la nouvelle page part du haut, l'ancre est rejointe dès qu'elle existe
      if (!arrival) scrollToTarget(0, { immediate: true });
      return followAnchor(hash, { focus: !arrival });
    }
    if (arrival) return undefined;

    const saved = type === 'POP' ? positions.get(key) : undefined;
    scrollToTarget(saved ?? 0, { immediate: true });
    if (!saved) return undefined;
    const frame = requestAnimationFrame(() => scrollToTarget(saved, { immediate: true }));
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

  // Focus. Après un changement de page (pas au premier affichage, ni pour des paramètres ou une
  // ancre), il rejoint <main> : la tabulation suivante entre dans la nouvelle page au lieu de
  // repartir de l'en-tête, et les lecteurs d'écran reprennent au début du contenu. Cet effet passe
  // après ceux de la page : si elle a déjà placé le focus chez elle (titre de la confirmation de
  // commande, cible d'une ancre), il y reste. Un calque modal ouvert garde aussi le sien.
  const focusedPath = useRef(shown.pathname);
  useEffect(() => {
    if (focusedPath.current === shown.pathname) return;
    focusedPath.current = shown.pathname;
    const main = document.getElementById('contenu');
    const active = document.activeElement;
    if (!main || main.contains(active)) return;
    if (active instanceof Element && active.closest('[data-focus-layer]')) return;
    main.focus({ preventScroll: true });
  }, [shown.pathname]);

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
