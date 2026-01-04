import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { products, collections } from '../data/products';

const Shop = () => {
  const [searchParams] = useSearchParams();
  const [filteredProducts, setFilteredProducts] = useState(products);
  const [selectedCollection, setSelectedCollection] = useState(searchParams.get('collection') || 'all');

  useEffect(() => {
    if (selectedCollection === 'all') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(
        products.filter(p => p.collection.toLowerCase() === selectedCollection.toLowerCase())
      );
    }
  }, [selectedCollection]);

  return (
    <div className="py-12">
      <div className="container-custom">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Boutique</h1>
          <p className="text-lg text-gray-600 max-w-2xl">
            Découvrez notre collection de ceintures premium. Chaque modèle est conçu pour allier style, durabilité et confort.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-12">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setSelectedCollection('all')}
              className={`px-6 py-2 font-medium transition-all ${
                selectedCollection === 'all'
                  ? 'bg-dag-black text-white'
                  : 'bg-white border-2 border-dag-black text-dag-black hover:bg-dag-black hover:text-white'
              }`}
            >
              Toutes
            </button>
            {collections.map((collection) => (
              <button
                key={collection.name}
                onClick={() => setSelectedCollection(collection.name.toLowerCase())}
                className={`px-6 py-2 font-medium transition-all ${
                  selectedCollection === collection.name.toLowerCase()
                    ? 'bg-dag-black text-white'
                    : 'bg-white border-2 border-dag-black text-dag-black hover:bg-dag-black hover:text-white'
                }`}
              >
                {collection.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProducts.map((product) => (
            <Link
              key={product.id}
              to={`/product/${product.id}`}
              className="group bg-white border border-gray-200 overflow-hidden hover:shadow-xl transition-all duration-300"
            >
              <div className="aspect-square overflow-hidden bg-dag-light">
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      {product.collection}
                    </p>
                    <h3 className="font-display font-semibold text-xl">{product.name}</h3>
                  </div>
                  <p className="text-xl font-semibold">{product.price}€</p>
                </div>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{product.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {product.colors.map((color) => (
                    <div
                      key={color.value}
                      className="w-6 h-6 rounded-full border-2 border-gray-300"
                      style={{ backgroundColor: color.hex }}
                      title={color.name}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{product.material}</span>
                  {product.stock ? (
                    <span className="text-green-600 font-medium">En stock</span>
                  ) : (
                    <span className="text-red-600 font-medium">Épuisé</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-xl text-gray-600">Aucun produit trouvé dans cette collection.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Shop;
