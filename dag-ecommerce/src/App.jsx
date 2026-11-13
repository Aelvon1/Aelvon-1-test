import { lazy, useEffect } from 'react';
import { BrowserRouter, HashRouter, Route, Routes, matchPath, useLocation } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import ErrorBoundary from './components/layout/ErrorBoundary';
import Layout from './components/layout/Layout';

// Build statique (VITE_STATIC=1) : HashRouter, aucune réécriture d'URL requise côté serveur.
const Router = import.meta.env.VITE_STATIC === '1' ? HashRouter : BrowserRouter;

// Table des routes. Chaque page est chargée à la demande (React.lazy) ; l'attente et la
// transition entre pages sont gérées par la coque (components/layout/PageTransition).
const ROUTES = [
  { path: '/', load: () => import('./pages/Home') },
  { path: '/shop', load: () => import('./pages/Shop') },
  { path: '/product/:id', load: () => import('./pages/ProductDetail') },
  { path: '/atelier', load: () => import('./pages/Atelier') },
  { path: '/checkout', load: () => import('./pages/Checkout') },
  { path: '/confirmation/:orderId', load: () => import('./pages/OrderConfirmation') },
  { path: '/about', load: () => import('./pages/About') },
  { path: '/faq', load: () => import('./pages/FAQ') },
  { path: '/contact', load: () => import('./pages/Contact') },
  { path: '/legal', load: () => import('./pages/Legal') },
  { path: '/guide-des-tailles', load: () => import('./pages/SizeGuide') },
  { path: '/favoris', load: () => import('./pages/Wishlist') },
  // Référence vivante du design system : en développement uniquement.
  ...(import.meta.env.DEV ? [{ path: '/styleguide', load: () => import('./pages/Styleguide') }] : []),
  { path: '*', load: () => import('./pages/NotFound') },
].map((route) => ({ ...route, Page: lazy(route.load) }));

/** Dès qu'une navigation démarre, on charge la page visée : elle est prête quand l'ancienne s'efface. */
function RoutePreloader() {
  const { pathname } = useLocation();
  useEffect(() => {
    const route = ROUTES.find((entry) => matchPath(entry.path, pathname));
    route?.load().catch(() => {});
  }, [pathname]);
  return null;
}

function AppRoutes({ location }) {
  return (
    <Routes location={location}>
      {ROUTES.map((route) => (
        <Route key={route.path} path={route.path} element={<route.Page />} />
      ))}
    </Routes>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <CartProvider>
          <WishlistProvider>
            <RoutePreloader />
            <Layout>{(location) => <AppRoutes location={location} />}</Layout>
          </WishlistProvider>
        </CartProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
