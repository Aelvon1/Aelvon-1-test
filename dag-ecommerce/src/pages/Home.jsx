import { Link } from 'react-router-dom';
import { products } from '../data/products';

const Home = () => {
  const featuredProducts = products.filter(p => p.featured);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative h-[90vh] flex items-center justify-center bg-dag-light overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=1600&q=80"
            alt="DAG Belt"
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="relative z-10 text-center container-custom">
          <h1 className="text-5xl md:text-7xl font-display font-bold mb-6 tracking-tight">
            DAG
          </h1>
          <p className="text-xl md:text-2xl mb-4 max-w-2xl mx-auto tracking-wide">
            La ceinture, en mieux.
          </p>
          <p className="text-lg md:text-xl text-gray-700 mb-8 max-w-2xl mx-auto">
            Finitions nettes. Tenue parfaite. Le détail qui change tout.
          </p>
          <Link to="/shop" className="inline-block btn-primary text-lg">
            Découvrir la collection
          </Link>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-white">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-dag-light flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-semibold mb-3">Style Minimal</h3>
              <p className="text-gray-600">
                Élégance sobre et intemporelle. Une ceinture qui s'adapte à toutes vos tenues.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-dag-light flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-semibold mb-3">Matières Solides</h3>
              <p className="text-gray-600">
                Cuir premium sélectionné. Conçu pour durer, gagner en patine et en caractère.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-dag-light flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-display font-semibold mb-3">Détails Soignés</h3>
              <p className="text-gray-600">
                Boucles précises, coutures nettes, finitions impeccables. L'excellence dans chaque détail.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20 bg-dag-light">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-display font-bold mb-4">Nos Essentiels</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Une sélection de ceintures conçues pour accompagner votre style au quotidien.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {featuredProducts.map((product) => (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="group bg-white overflow-hidden hover:shadow-xl transition-shadow duration-300"
              >
                <div className="aspect-square overflow-hidden">
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-display font-semibold text-lg mb-2">{product.name}</h3>
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">{product.description}</p>
                  <p className="text-lg font-semibold">{product.price}€</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link to="/shop" className="inline-block btn-secondary">
              Voir toute la collection
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-dag-black text-white">
        <div className="container-custom text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-6">
            L'essentiel. Parfaitement maîtrisé.
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            DAG est née d'une idée simple : une ceinture doit être belle, solide, et facile à porter tous les jours.
          </p>
          <Link to="/about" className="inline-block bg-white text-dag-black px-8 py-3 font-medium tracking-wide hover:bg-gray-200 transition-colors">
            Découvrir notre histoire
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
