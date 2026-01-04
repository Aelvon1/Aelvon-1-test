import { useState } from 'react';

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState(null);

  const faqs = [
    {
      category: "Commande & Livraison",
      questions: [
        {
          q: "Quels sont les délais de livraison ?",
          a: "Nous livrons en 3 à 5 jours ouvrés en France métropolitaine. Pour la Belgique, la Suisse et le Luxembourg, comptez 5 à 7 jours ouvrés."
        },
        {
          q: "La livraison est-elle gratuite ?",
          a: "Oui, la livraison est gratuite pour toute commande de 100€ ou plus. En dessous, les frais de port sont de 7,90€."
        },
        {
          q: "Puis-je suivre ma commande ?",
          a: "Absolument. Dès l'expédition de votre commande, vous recevrez un email avec un numéro de suivi pour suivre votre colis en temps réel."
        },
        {
          q: "Livrez-vous à l'international ?",
          a: "Actuellement, nous livrons en France, Belgique, Suisse et Luxembourg. Nous prévoyons d'étendre nos zones de livraison prochainement."
        }
      ]
    },
    {
      category: "Produits & Tailles",
      questions: [
        {
          q: "Comment choisir la bonne taille de ceinture ?",
          a: "Mesurez votre tour de taille habituel (là où vous portez votre pantalon) et ajoutez 15cm. Par exemple, si votre tour de taille est de 85cm, choisissez une ceinture en taille 100cm. Notre guide des tailles détaillé est disponible sur chaque fiche produit."
        },
        {
          q: "Quelle est la différence entre les collections ?",
          a: "Essential : classique et intemporelle. Matte : look urbain avec finition mate. Texture : cuir grainé robuste. Dress : fine et élégante pour tenues formelles. Everyday : polyvalente pour tous les jours."
        },
        {
          q: "Les ceintures sont-elles en cuir véritable ?",
          a: "Oui, toutes nos ceintures sont fabriquées en cuir pleine fleur de haute qualité, sélectionné pour sa durabilité et sa patine naturelle."
        },
        {
          q: "Comment entretenir ma ceinture DAG ?",
          a: "Nettoyez régulièrement avec un chiffon doux et sec. Pour nourrir le cuir, utilisez un produit d'entretien adapté 2 à 3 fois par an. Évitez l'exposition prolongée à l'eau et à la chaleur directe."
        }
      ]
    },
    {
      category: "Retours & Échanges",
      questions: [
        {
          q: "Puis-je retourner un produit ?",
          a: "Oui, vous disposez de 30 jours après réception pour retourner un produit non porté, dans son emballage d'origine, avec tous ses accessoires."
        },
        {
          q: "Les retours sont-ils gratuits ?",
          a: "Oui, les retours sont entièrement gratuits. Nous vous envoyons une étiquette de retour prépayée par email."
        },
        {
          q: "Comment échanger ma ceinture ?",
          a: "Pour un échange (taille ou couleur), contactez-nous via le formulaire de contact ou par email à contact@dag-belts.com. Nous organiserons l'échange dans les plus brefs délais."
        },
        {
          q: "Quand serai-je remboursé ?",
          a: "Le remboursement est effectué dans les 5 jours ouvrés suivant la réception du produit retourné, sur le même moyen de paiement utilisé lors de l'achat."
        }
      ]
    },
    {
      category: "Paiement & Sécurité",
      questions: [
        {
          q: "Quels moyens de paiement acceptez-vous ?",
          a: "Nous acceptons les cartes bancaires (Visa, Mastercard, American Express) via notre système de paiement sécurisé Stripe."
        },
        {
          q: "Le paiement est-il sécurisé ?",
          a: "Absolument. Toutes les transactions sont sécurisées via Stripe, qui utilise le cryptage SSL et respecte les normes PCI-DSS."
        },
        {
          q: "Mes données sont-elles protégées ?",
          a: "Oui, nous ne stockons aucune information bancaire. Vos données personnelles sont protégées conformément au RGPD."
        }
      ]
    },
    {
      category: "Garantie & SAV",
      questions: [
        {
          q: "Quelle est la garantie sur les produits ?",
          a: "Toutes nos ceintures bénéficient d'une garantie de 2 ans contre les défauts de fabrication. Cette garantie ne couvre pas l'usure normale du produit."
        },
        {
          q: "Que faire en cas de défaut ?",
          a: "Contactez notre service client avec des photos du défaut. Nous évaluerons le problème et procéderons à un échange ou un remboursement si nécessaire."
        },
        {
          q: "Comment contacter le service client ?",
          a: "Par email : contact@dag-belts.com ou via notre formulaire de contact. Nous répondons sous 24h ouvrées."
        }
      ]
    }
  ];

  const toggleQuestion = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  let questionIndex = 0;

  return (
    <div className="py-12">
      <div className="container-custom">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-5xl font-display font-bold mb-6">Questions Fréquentes</h1>
          <p className="text-lg text-gray-700">
            Vous avez des questions ? Nous avons les réponses. Si vous ne trouvez pas ce que vous cherchez,
            n'hésitez pas à nous contacter.
          </p>
        </div>

        {/* FAQ Sections */}
        <div className="max-w-4xl mx-auto space-y-12">
          {faqs.map((category, categoryIndex) => (
            <div key={categoryIndex}>
              <h2 className="text-2xl font-display font-bold mb-6 pb-3 border-b-2 border-dag-black">
                {category.category}
              </h2>
              <div className="space-y-4">
                {category.questions.map((faq) => {
                  const currentIndex = questionIndex++;
                  return (
                    <div
                      key={currentIndex}
                      className="border border-gray-200 bg-white overflow-hidden"
                    >
                      <button
                        onClick={() => toggleQuestion(currentIndex)}
                        className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-dag-light transition-colors"
                      >
                        <span className="font-semibold pr-8">{faq.q}</span>
                        <svg
                          className={`w-6 h-6 flex-shrink-0 transition-transform ${
                            openIndex === currentIndex ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {openIndex === currentIndex && (
                        <div className="px-6 py-4 bg-dag-light border-t border-gray-200">
                          <p className="text-gray-700 leading-relaxed">{faq.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-16 text-center bg-dag-light py-12 px-8">
          <h2 className="text-2xl font-display font-bold mb-4">Vous ne trouvez pas votre réponse ?</h2>
          <p className="text-gray-700 mb-6">
            Notre équipe est là pour vous aider. Contactez-nous et nous vous répondrons dans les plus brefs délais.
          </p>
          <a href="/contact" className="inline-block btn-primary">
            Nous contacter
          </a>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
