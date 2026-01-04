# DAG - Site E-commerce Premium

Site e-commerce moderne et élégant pour la marque de ceintures premium **DAG**.

## 🎯 Caractéristiques

### Fonctionnalités principales
- ✅ **Boutique en ligne complète** avec catalogue de produits
- ✅ **Fiches produit détaillées** (photos, prix, tailles, couleurs, stock)
- ✅ **Panier d'achat dynamique** avec gestion des quantités
- ✅ **Processus de checkout** (livraison + paiement)
- ✅ **Pages informatives** (À propos, FAQ, Contact, Mentions légales)
- ✅ **Design responsive** (mobile & desktop)
- ✅ **Performance optimisée**
- ✅ **Prêt pour intégration Stripe**

### Technologies utilisées
- **React 18** - Framework UI
- **Vite** - Build tool ultra-rapide
- **React Router** - Navigation
- **Tailwind CSS** - Design système
- **Context API** - Gestion d'état du panier
- **LocalStorage** - Persistance du panier

## 🚀 Installation

### Prérequis
- Node.js 18+ et npm

### Étapes d'installation

```bash
# Cloner le projet
git clone <url-du-repo>
cd dag-ecommerce

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Ouvrir http://localhost:5173
```

## 📁 Structure du projet

```
dag-ecommerce/
├── src/
│   ├── components/       # Composants réutilisables
│   │   ├── Header.jsx    # En-tête avec navigation
│   │   ├── Footer.jsx    # Pied de page
│   │   ├── Cart.jsx      # Panier coulissant
│   │   └── Layout.jsx    # Layout principal
│   ├── pages/            # Pages de l'application
│   │   ├── Home.jsx      # Page d'accueil
│   │   ├── Shop.jsx      # Catalogue produits
│   │   ├── ProductDetail.jsx  # Fiche produit
│   │   ├── Checkout.jsx  # Processus de commande
│   │   ├── About.jsx     # À propos
│   │   ├── FAQ.jsx       # Questions fréquentes
│   │   ├── Contact.jsx   # Formulaire de contact
│   │   └── Legal.jsx     # Mentions légales
│   ├── context/          # Contextes React
│   │   └── CartContext.jsx  # Gestion du panier
│   ├── data/             # Données statiques
│   │   └── products.js   # Catalogue de produits DAG
│   ├── App.jsx           # Composant racine
│   ├── main.jsx          # Point d'entrée
│   └── index.css         # Styles globaux
├── public/               # Fichiers statiques
├── tailwind.config.js    # Configuration Tailwind
└── package.json          # Dépendances du projet
```

## 🛍️ Collections DAG

Le site présente 5 collections de ceintures premium :

1. **DAG Essential** - Classique intemporelle (89€)
2. **DAG Matte** - Look urbain avec finition mate (95€)
3. **DAG Texture** - Cuir grainé robuste (92€)
4. **DAG Dress** - Fine et élégante pour tenues formelles (99€)
5. **DAG Everyday** - Polyvalente pour le quotidien (85€)
6. **DAG Reversible** - Deux ceintures en une (105€)

## 🎨 Design

### Palette de couleurs
- **DAG Black** : `#0A0A0A` - Noir profond
- **DAG Gray** : `#2A2A2A` - Gris foncé
- **DAG Light** : `#F5F5F5` - Gris clair
- **DAG Accent** : `#C9A96E` - Or/Bronze

### Typographie
- **Display** : Playfair Display (titres)
- **Corps** : Inter (texte)

## 🔧 Scripts disponibles

```bash
# Développement
npm run dev

# Build de production
npm run build

# Prévisualiser le build
npm run preview

# Linter
npm run lint
```

## 💳 Intégration Stripe (à venir)

Le site est prêt pour l'intégration de Stripe pour les paiements :

1. Créer un compte Stripe
2. Installer `@stripe/stripe-js` et `@stripe/react-stripe-js`
3. Configurer les clés API dans `.env`
4. Remplacer le formulaire de paiement par Stripe Elements
5. Créer un backend pour gérer les paiements

## 📱 Responsive Design

Le site est entièrement responsive avec des breakpoints :
- **Mobile** : < 768px
- **Tablette** : 768px - 1024px
- **Desktop** : > 1024px

## 🌐 Fonctionnalités futures

- [ ] Intégration Stripe pour paiements réels
- [ ] Backend pour gestion des commandes
- [ ] Système de comptes utilisateurs
- [ ] Wishlist / favoris
- [ ] Filtres avancés (prix, couleur, taille)
- [ ] Système d'avis clients
- [ ] Newsletter fonctionnelle
- [ ] Mode sombre
- [ ] Multilingue (FR/EN)

## 🔒 Sécurité

- Validation des formulaires côté client
- Protection RGPD
- Paiements sécurisés via Stripe (à intégrer)
- Aucune donnée bancaire stockée

## 📄 Licence

Ce projet est un site e-commerce pour la marque DAG.

## 👤 Contact

Pour toute question : contact@dag-belts.com

---

**DAG** - L'essentiel. Parfaitement maîtrisé.
