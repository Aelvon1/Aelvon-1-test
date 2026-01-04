import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';

const Checkout = () => {
  const navigate = useNavigate();
  const { cartItems, getCartTotal, clearCart } = useCart();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    // Shipping
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'France',
    // Payment
    cardNumber: '',
    cardName: '',
    expiryDate: '',
    cvv: '',
  });

  const shippingCost = getCartTotal() >= 100 ? 0 : 7.90;
  const totalWithShipping = getCartTotal() + shippingCost;

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmitShipping = (e) => {
    e.preventDefault();
    setStep(2);
    window.scrollTo(0, 0);
  };

  const handleSubmitPayment = (e) => {
    e.preventDefault();
    // Ici, vous intégrerez Stripe
    alert('Commande validée ! (Intégration Stripe à venir)');
    clearCart();
    navigate('/');
  };

  if (cartItems.length === 0) {
    return (
      <div className="container-custom py-20 text-center">
        <h1 className="text-3xl font-display font-bold mb-4">Votre panier est vide</h1>
        <p className="text-gray-600 mb-8">Ajoutez des produits pour continuer.</p>
        <button onClick={() => navigate('/shop')} className="btn-primary">
          Découvrir la boutique
        </button>
      </div>
    );
  }

  return (
    <div className="py-12">
      <div className="container-custom">
        <h1 className="text-4xl font-display font-bold mb-8">Finaliser la commande</h1>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center mb-12">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center ${step >= 1 ? 'text-dag-black' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                step >= 1 ? 'bg-dag-black text-white' : 'bg-gray-200'
              }`}>
                1
              </div>
              <span className="ml-2 font-medium hidden md:inline">Livraison</span>
            </div>
            <div className="w-12 h-0.5 bg-gray-300" />
            <div className={`flex items-center ${step >= 2 ? 'text-dag-black' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                step >= 2 ? 'bg-dag-black text-white' : 'bg-gray-200'
              }`}>
                2
              </div>
              <span className="ml-2 font-medium hidden md:inline">Paiement</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form */}
          <div className="lg:col-span-2">
            {step === 1 ? (
              <form onSubmit={handleSubmitShipping} className="bg-white border border-gray-200 p-8">
                <h2 className="text-2xl font-display font-semibold mb-6">Informations de livraison</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Prénom *</label>
                    <input
                      type="text"
                      name="firstName"
                      required
                      value={formData.firstName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Nom *</label>
                    <input
                      type="text"
                      name="lastName"
                      required
                      value={formData.lastName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Email *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Téléphone *</label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Adresse *</label>
                  <input
                    type="text"
                    name="address"
                    required
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Code postal *</label>
                    <input
                      type="text"
                      name="postalCode"
                      required
                      value={formData.postalCode}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Ville *</label>
                    <input
                      type="text"
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Pays *</label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    >
                      <option>France</option>
                      <option>Belgique</option>
                      <option>Suisse</option>
                      <option>Luxembourg</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="w-full btn-primary">
                  Continuer vers le paiement
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitPayment} className="bg-white border border-gray-200 p-8">
                <h2 className="text-2xl font-display font-semibold mb-6">Informations de paiement</h2>

                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 text-blue-800 text-sm">
                  ℹ️ Mode démo : Cette page est prête pour l'intégration Stripe. Aucun paiement réel ne sera effectué.
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Numéro de carte *</label>
                  <input
                    type="text"
                    name="cardNumber"
                    required
                    placeholder="1234 5678 9012 3456"
                    value={formData.cardNumber}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">Nom sur la carte *</label>
                  <input
                    type="text"
                    name="cardName"
                    required
                    value={formData.cardName}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div>
                    <label className="block text-sm font-medium mb-2">Date d'expiration *</label>
                    <input
                      type="text"
                      name="expiryDate"
                      required
                      placeholder="MM/AA"
                      value={formData.expiryDate}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">CVV *</label>
                    <input
                      type="text"
                      name="cvv"
                      required
                      placeholder="123"
                      maxLength="3"
                      value={formData.cvv}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 focus:outline-none focus:border-dag-black"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 btn-secondary"
                  >
                    Retour
                  </button>
                  <button type="submit" className="flex-1 btn-primary">
                    Valider la commande
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-dag-light p-6 sticky top-24">
              <h2 className="text-xl font-display font-semibold mb-6">Récapitulatif</h2>

              <div className="space-y-4 mb-6">
                {cartItems.map((item) => (
                  <div key={item.cartItemId} className="flex gap-4 pb-4 border-b border-gray-300">
                    <img
                      src={item.images[0]}
                      alt={item.name}
                      className="w-16 h-16 object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-medium text-sm">{item.name}</h3>
                      <p className="text-xs text-gray-600">
                        {item.selectedColor.name} • {item.selectedSize}cm
                      </p>
                      <p className="text-sm">Qté: {item.quantity}</p>
                    </div>
                    <p className="font-medium">{item.price * item.quantity}€</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span>Sous-total</span>
                  <span className="font-medium">{getCartTotal()}€</span>
                </div>
                <div className="flex justify-between">
                  <span>Livraison</span>
                  <span className="font-medium">
                    {shippingCost === 0 ? 'Gratuit' : `${shippingCost}€`}
                  </span>
                </div>
                {getCartTotal() < 100 && (
                  <p className="text-xs text-gray-600">
                    Plus que {(100 - getCartTotal()).toFixed(2)}€ pour la livraison gratuite !
                  </p>
                )}
              </div>

              <div className="border-t border-gray-400 pt-4 mb-6">
                <div className="flex justify-between items-center text-xl font-semibold">
                  <span>Total</span>
                  <span>{totalWithShipping.toFixed(2)}€</span>
                </div>
              </div>

              <div className="text-xs text-gray-600 space-y-2">
                <p>✓ Paiement 100% sécurisé</p>
                <p>✓ Retours gratuits sous 30 jours</p>
                <p>✓ Garantie 2 ans</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
