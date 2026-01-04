export const products = [
  {
    id: 1,
    name: "DAG Essential",
    collection: "Essential",
    description: "La ceinture intemporelle. Cuir pleine fleur, boucle classique, finition irréprochable.",
    longDescription: "Notre modèle emblématique. Confectionnée en cuir pleine fleur sélectionné, la DAG Essential incarne l'élégance discrète. Sa boucle en acier brossé et ses coutures précises garantissent une tenue parfaite, jour après jour. Conçue pour durer, elle accompagne toutes vos tenues avec sobriété.",
    price: 89,
    images: [
      "https://images.unsplash.com/photo-1624222247344-550fb60583c2?w=800&q=80",
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80"
    ],
    colors: [
      { name: "Noir", value: "black", hex: "#0A0A0A" },
      { name: "Marron", value: "brown", hex: "#5D4037" },
      { name: "Cognac", value: "cognac", hex: "#A0522D" }
    ],
    sizes: ["85", "90", "95", "100", "105", "110"],
    material: "Cuir pleine fleur",
    width: "35mm",
    buckle: "Acier brossé",
    stock: true,
    featured: true
  },
  {
    id: 2,
    name: "DAG Matte",
    collection: "Matte",
    description: "Look urbain, finition mate. La ceinture qui s'adapte à votre style moderne.",
    longDescription: "Pour un style plus contemporain. La DAG Matte adopte une boucle noire mate qui apporte une touche résolument urbaine. Son cuir légèrement grainé offre résistance et caractère, parfait pour un quotidien actif sans compromis sur l'élégance.",
    price: 95,
    images: [
      "https://images.unsplash.com/photo-1554900952-e92c023d3b3d?w=800&q=80",
      "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800&q=80"
    ],
    colors: [
      { name: "Noir mat", value: "matte-black", hex: "#1A1A1A" },
      { name: "Gris charbon", value: "charcoal", hex: "#424242" }
    ],
    sizes: ["85", "90", "95", "100", "105", "110"],
    material: "Cuir grainé premium",
    width: "35mm",
    buckle: "Acier noir mat",
    stock: true,
    featured: true
  },
  {
    id: 3,
    name: "DAG Texture",
    collection: "Texture",
    description: "Cuir grainé robuste. Pour un style casual et authentique.",
    longDescription: "Le caractère à l'état pur. La DAG Texture mise sur un cuir grainé expressif qui gagne en patine avec le temps. Plus robuste, elle est pensée pour un usage quotidien intensif tout en conservant une allure soignée. Idéale pour les tenues décontractées.",
    price: 92,
    images: [
      "https://images.unsplash.com/photo-1573381817216-1da91926bf02?w=800&q=80",
      "https://images.unsplash.com/photo-1607522370275-f14206abe5d3?w=800&q=80"
    ],
    colors: [
      { name: "Marron texturé", value: "textured-brown", hex: "#6D4C41" },
      { name: "Noir texturé", value: "textured-black", hex: "#212121" },
      { name: "Tan", value: "tan", hex: "#D2B48C" }
    ],
    sizes: ["85", "90", "95", "100", "105", "110"],
    material: "Cuir grainé italien",
    width: "38mm",
    buckle: "Acier antique",
    stock: true,
    featured: true
  },
  {
    id: 4,
    name: "DAG Dress",
    collection: "Dress",
    description: "Fine et élégante. L'essentiel pour les occasions formelles.",
    longDescription: "La discrétion absolue pour vos tenues formelles. Plus fine (30mm), la DAG Dress est pensée pour accompagner vos costumes avec élégance. Son cuir lisse et sa boucle ultra-propre garantissent une allure impeccable en toutes circonstances.",
    price: 99,
    images: [
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
      "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80"
    ],
    colors: [
      { name: "Noir", value: "black", hex: "#000000" },
      { name: "Marron foncé", value: "dark-brown", hex: "#3E2723" }
    ],
    sizes: ["85", "90", "95", "100", "105"],
    material: "Cuir lisse premium",
    width: "30mm",
    buckle: "Acier poli",
    stock: true,
    featured: false
  },
  {
    id: 5,
    name: "DAG Everyday",
    collection: "Everyday",
    description: "Polyvalente. La ceinture qui passe partout, tous les jours.",
    longDescription: "Le compromis parfait. La DAG Everyday est conçue pour s'adapter à toutes vos tenues, du jean brut au chino habillé. Ni trop fine, ni trop large, elle incarne l'équilibre entre élégance et praticité. Votre alliée du quotidien.",
    price: 85,
    images: [
      "https://images.unsplash.com/photo-1616520477176-3764792cf918?w=800&q=80",
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80"
    ],
    colors: [
      { name: "Noir", value: "black", hex: "#0A0A0A" },
      { name: "Marron", value: "brown", hex: "#5D4037" },
      { name: "Navy", value: "navy", hex: "#1A237E" }
    ],
    sizes: ["85", "90", "95", "100", "105", "110"],
    material: "Cuir italien",
    width: "35mm",
    buckle: "Acier brossé",
    stock: true,
    featured: false
  },
  {
    id: 6,
    name: "DAG Reversible",
    collection: "Essential",
    description: "Deux ceintures en une. Noir d'un côté, marron de l'autre.",
    longDescription: "L'intelligence pratique. Notre ceinture réversible offre deux looks en un seul accessoire. Un système de boucle ingénieux permet de passer du noir au marron en un geste. Parfaite pour les voyages ou pour simplifier votre garde-robe.",
    price: 105,
    images: [
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80",
      "https://images.unsplash.com/photo-1624222247344-550fb60583c2?w=800&q=80"
    ],
    colors: [
      { name: "Noir/Marron", value: "black-brown", hex: "#0A0A0A" }
    ],
    sizes: ["85", "90", "95", "100", "105", "110"],
    material: "Double cuir pleine fleur",
    width: "35mm",
    buckle: "Acier brossé pivotant",
    stock: true,
    featured: true
  }
];

export const collections = [
  {
    name: "Essential",
    description: "Les intemporels qui forment la base d'une garde-robe maîtrisée."
  },
  {
    name: "Matte",
    description: "Look urbain et moderne avec finitions mates."
  },
  {
    name: "Texture",
    description: "Caractère et robustesse pour un style casual authentique."
  },
  {
    name: "Dress",
    description: "Élégance discrète pour les occasions formelles."
  },
  {
    name: "Everyday",
    description: "Polyvalence maximale pour le quotidien."
  }
];
