import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Atelier from './pages/Atelier';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import About from './pages/About';
import FAQ from './pages/FAQ';
import Contact from './pages/Contact';
import Legal from './pages/Legal';
import SizeGuide from './pages/SizeGuide';
import Wishlist from './pages/Wishlist';
import NotFound from './pages/NotFound';

// Build statique (VITE_STATIC=1) : HashRouter, aucune réécriture d'URL requise côté serveur.
const Router = import.meta.env.VITE_STATIC === '1' ? HashRouter : BrowserRouter;

function App() {
  return (
    <Router>
      <CartProvider>
        <WishlistProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/product/:id" element={<ProductDetail />} />
              <Route path="/atelier" element={<Atelier />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/confirmation/:orderId" element={<OrderConfirmation />} />
              <Route path="/about" element={<About />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="/guide-des-tailles" element={<SizeGuide />} />
              <Route path="/favoris" element={<Wishlist />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </WishlistProvider>
      </CartProvider>
    </Router>
  );
}

export default App;
