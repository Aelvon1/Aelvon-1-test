import { useEffect } from 'react';
import { scrollToTarget } from '../../hooks/scroll';
import { useLenis } from '../../hooks/useLenis';
import ToastProvider from '../ui/ToastProvider';
import CartDrawer from './CartDrawer';
import Footer from './Footer';
import Header from './Header';
import PageTransition from './PageTransition';

/** Liens d'ancre internes (« #id ») : défilement adouci vers la cible, qui reçoit le focus. */
function useAnchorLinks() {
  useEffect(() => {
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const href = anchor?.getAttribute('href');
      // « #/chemin » est une route en mode statique (HashRouter), pas une ancre
      if (!href || !href.startsWith('#') || href.length < 2 || href.startsWith('#/')) return;
      if (scrollToTarget(href, { focus: true })) event.preventDefault();
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

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined;
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
        className="eyebrow sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[100] focus-visible:bg-accent focus-visible:px-5 focus-visible:py-3.5 focus-visible:text-on-accent"
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
