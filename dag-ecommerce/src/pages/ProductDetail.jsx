import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { products } from '../data/products';
import { useCart } from '../context/CartContext';

const ProductDetail = () => {
  const { id } = useParams();
  const product = products.find(p => p.id === parseInt(id));
  const { addToCart } = useCart();

  const [selectedColor, setSelectedColor] = useState(product?.colors[0]);
  const [selectedSize, setSelectedSize] = useState(product?.sizes[0]);
  const [selectedImage, setSelectedImage] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  if (!product) {
    return (
      <div className="container-custom py-20 text-center">
        <h1 className="text-3xl font-display font-bold mb-4">Produit introuvable</h1>
        <Link to="/shop" className="btn-primary">
          Retour à la boutique
        </Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    addToCart(product, selectedColor, selectedSize);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <div className="py-12">
      <div className="container-custom">
        {/* Breadcrumb */}
        <nav className="mb-8 text-sm">
          <Link to="/" className="text-gray-600 hover:text-dag-black">Accueil</Link>
          <span className="mx-2 text-gray-400">/</span>
          <Link to="/shop" className="text-gray-600 hover:text-dag-black">Boutique</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="font-medium">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Images */}
          <div>
            <div className="aspect-square bg-dag-light mb-4 overflow-hidden">
              <img
                src={product.images[selectedImage]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-4">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`aspect-square bg-dag-light overflow-hidden border-2 transition-colors ${
                      selectedImage === index ? 'border-dag-black' : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={image}
                      alt={`${product.name} ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div>
            <div className="mb-6">
              <p className="text-sm text-gray-600 uppercase tracking-wider mb-2">
                Collection {product.collection}
              </p>
              <h1 className="text-4xl font-display font-bold mb-4">{product.name}</h1>
              <p className="text-3xl font-semibold mb-6">{product.price}€</p>
              <p className="text-lg text-gray-700 leading-relaxed">{product.longDescription}</p>
            </div>

            {/* Color Selection */}
            <div className="mb-6">
              <label className="block text-sm font-semibold mb-3">
                Couleur : <span className="font-normal text-gray-600">{selectedColor.name}</span>
              </label>
              <div className="flex flex-wrap gap-3">
                {product.colors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color)}
                    className={`w-12 h-12 rounded-full border-4 transition-all ${
                      selectedColor.value === color.value
                        ? 'border-dag-black scale-110'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* Size Selection */}
            <div className="mb-8">
              <label className="block text-sm font-semibold mb-3">
                Taille : <span className="font-normal text-gray-600">{selectedSize}cm</span>
              </label>
              <div className="grid grid-cols-6 gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`py-3 border-2 font-medium transition-all ${
                      selectedSize === size
                        ? 'border-dag-black bg-dag-black text-white'
                        : 'border-gray-300 hover:border-dag-black'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-600 mt-3">
                💡 Pour trouver votre taille : mesurez votre tour de taille habituel et ajoutez 15cm.
              </p>
            </div>

            {/* Add to Cart */}
            <div className="mb-8">
              <button
                onClick={handleAddToCart}
                disabled={!product.stock}
                className="w-full btn-primary disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {product.stock ? 'Ajouter au panier' : 'Épuisé'}
              </button>
              {showSuccess && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 text-green-800 text-center">
                  ✓ Produit ajouté au panier
                </div>
              )}
            </div>

            {/* Product Details */}
            <div className="border-t pt-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Matière</span>
                <span className="font-medium">{product.material}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Largeur</span>
                <span className="font-medium">{product.width}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Boucle</span>
                <span className="font-medium">{product.buckle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Disponibilité</span>
                <span className={product.stock ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                  {product.stock ? 'En stock' : 'Épuisé'}
                </span>
              </div>
            </div>

            {/* Additional Info */}
            <div className="mt-8 bg-dag-light p-6">
              <h3 className="font-semibold mb-3">Livraison & Retours</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>• Livraison gratuite dès 100€ d'achat</li>
                <li>• Retours gratuits sous 30 jours</li>
                <li>• Livraison en 3-5 jours ouvrés</li>
                <li>• Garantie 2 ans sur tous nos produits</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Related Products */}
        <div className="mt-20">
          <h2 className="text-3xl font-display font-bold mb-8">Vous aimerez aussi</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {products
              .filter(p => p.id !== product.id && p.collection === product.collection)
              .slice(0, 4)
              .map((relatedProduct) => (
                <Link
                  key={relatedProduct.id}
                  to={`/product/${relatedProduct.id}`}
                  className="group bg-white border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow"
                >
                  <div className="aspect-square overflow-hidden bg-dag-light">
                    <img
                      src={relatedProduct.images[0]}
                      alt={relatedProduct.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold mb-2">{relatedProduct.name}</h3>
                    <p className="text-lg font-semibold">{relatedProduct.price}€</p>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
