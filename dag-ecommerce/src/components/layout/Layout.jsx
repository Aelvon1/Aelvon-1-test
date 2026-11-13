import { useEffect } from 'react';
import { scrollToTarget } from '../../hooks/scroll';
import { useLenis } from '../../hooks/useLenis';
import ToastProvider from '../ui/ToastProvider';
import CartDrawer from './CartDrawer';
import Footer from './Footer';
import Header from './Header';
import PageTransition from './PageTransition';
import { ROUTER_MODE } from './router-mode';

/**
 * Liens d'ancre internes (« #id ») : défilement adouci vers la cible, qui reçoit le focus.
 * L'URL n'est pas modifiée. Hors mode « browser », un lien dont la cible manque est neutralisé :
 * le fragment de l'URL y porte la route (HashRouter) ou n'appartient pas au site (cadre isolé).
 */
function useAnchorLinks() {
  useEffect(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const href = anchor?.getAttribute('href');
      // « #/chemin » est une route en mode statique (HashRouter), pas une ancre
      if (!href || !href.startsWith('#') || href.length < 2 || href.startsWith('#/')) return;
      if (scrollToTarget(href, { focus: true }) || ROUTER_MODE !== 'browser') event.preventDefault();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}

/**
 * Coque du site : lien d'évitement, en-tête, contenu, pied de page, panier, notifications,
 * grain photographique, défilement adouci et transition entre pages.
 * @param {{ children: (location: import('react-router-dom').Location) => import('react').ReactNode }} props
 *   children : fonction recevant la « location » à afficher — à passer à <Routes location={…}>.
 */
export default function Layout({ children }) {
  useLenis();
  useAnchorLinks();

  // La coque restaure elle-même le défilement (PageTransition). En mémoire, l'historique du
  // navigateur n'est pas le nôtre : on n'y touche pas.
  useEffect(() => {
    if (ROUTER_MODE === 'memory' || !('scrollRestoration' in window.history)) return undefined;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  return (
    <ToastProvider>
      <a
        href="#contenu"
        className="eyebrow sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-[max(1rem,env(safe-area-inset-left,0px))] focus-visible:top-[max(1rem,env(safe-area-inset-top,0px))] focus-visible:z-[100] focus-visible:bg-accent focus-visible:px-5 focus-visible:py-3.5 focus-visible:text-on-accent"
      >
        Aller au contenu
      </a>
      <Header />
      <main id="contenu" tabIndex={-1} className="min-h-svh outline-none">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
      <CartDrawer />
      <div aria-hidden="true" data-tone-ignore className="grain pointer-events-none fixed inset-0 z-[90]" />
    </ToastProvider>
  );
}
