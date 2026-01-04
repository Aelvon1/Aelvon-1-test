import Header from './Header';
import Footer from './Footer';
import Cart from './Cart';

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pt-20">
        {children}
      </main>
      <Footer />
      <Cart />
    </div>
  );
};

export default Layout;
