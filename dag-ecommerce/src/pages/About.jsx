const About = () => {
  return (
    <div className="py-12">
      <div className="container-custom">
        {/* Hero */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-5xl font-display font-bold mb-6">À propos de DAG</h1>
          <p className="text-xl text-gray-700 leading-relaxed">
            L'essentiel. Parfaitement maîtrisé.
          </p>
        </div>

        {/* Story */}
        <div className="max-w-4xl mx-auto mb-20">
          <div className="prose prose-lg max-w-none">
            <p className="text-lg leading-relaxed mb-6">
              DAG est née d'une idée simple : une ceinture doit être belle, solide, et facile à porter tous les jours.
            </p>
            <p className="text-lg leading-relaxed mb-6">
              On conçoit des pièces minimalistes, avec des matières sélectionnées et des finitions propres,
              pour accompagner toutes les tenues — du jean au costume.
            </p>
            <p className="text-lg leading-relaxed mb-6">
              Notre objectif : proposer l'essentiel, parfaitement maîtrisé.
            </p>
          </div>
        </div>

        {/* Values */}
        <div className="bg-dag-light py-16 px-8 mb-20">
          <h2 className="text-3xl font-display font-bold text-center mb-12">Nos Valeurs</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="text-center">
              <h3 className="text-2xl font-display font-semibold mb-4">Style Minimal</h3>
              <p className="text-gray-700 leading-relaxed">
                Des designs épurés et intemporels qui traversent les modes. Une ceinture DAG reste élégante,
                année après année.
              </p>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-display font-semibold mb-4">Matières Solides</h3>
              <p className="text-gray-700 leading-relaxed">
                Cuir pleine fleur, boucles en acier de qualité. Nos ceintures sont conçues pour durer
                et gagner en caractère avec le temps.
              </p>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-display font-semibold mb-4">Détails Soignés</h3>
              <p className="text-gray-700 leading-relaxed">
                Coutures précises, finitions impeccables, boucles parfaitement ajustées.
                Chaque détail compte dans la quête de l'excellence.
              </p>
            </div>
          </div>
        </div>

        {/* Image Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          <div className="aspect-square overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1490114538077-0a7f8cb49891?w=800&q=80"
              alt="Craftsmanship"
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
            />
          </div>
          <div className="flex items-center">
            <div>
              <h2 className="text-3xl font-display font-bold mb-6">L'Art du Détail</h2>
              <p className="text-lg text-gray-700 leading-relaxed mb-4">
                Chaque ceinture DAG est le résultat d'un savoir-faire précis et d'une attention
                méticuleuse portée à chaque étape de fabrication.
              </p>
              <p className="text-lg text-gray-700 leading-relaxed">
                De la sélection du cuir aux finitions finales, nous ne faisons aucun compromis
                sur la qualité. C'est cette exigence qui fait la différence.
              </p>
            </div>
          </div>
        </div>

        {/* Mission */}
        <div className="bg-dag-black text-white py-16 px-8 text-center">
          <h2 className="text-3xl font-display font-bold mb-6">Notre Mission</h2>
          <p className="text-xl max-w-3xl mx-auto leading-relaxed">
            Créer des accessoires essentiels qui allient style, durabilité et fonctionnalité.
            Des pièces que vous porterez avec fierté, jour après jour, sans jamais vous en lasser.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <h2 className="text-3xl font-display font-bold mb-6">Prêt à découvrir DAG ?</h2>
          <a href="/shop" className="inline-block btn-primary text-lg">
            Voir la collection
          </a>
        </div>
      </div>
    </div>
  );
};

export default About;
