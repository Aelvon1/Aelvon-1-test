const Legal = () => {
  return (
    <div className="py-12">
      <div className="container-custom">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-display font-bold mb-8">Mentions Légales</h1>

          {/* Éditeur */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Éditeur du site</h2>
            <div className="text-gray-700 space-y-2">
              <p><strong>Raison sociale :</strong> DAG SAS</p>
              <p><strong>Capital social :</strong> 50 000 €</p>
              <p><strong>Siège social :</strong> 123 Rue de la Mode, 75001 Paris, France</p>
              <p><strong>SIRET :</strong> 123 456 789 00010</p>
              <p><strong>RCS :</strong> Paris B 123 456 789</p>
              <p><strong>TVA intracommunautaire :</strong> FR12 123456789</p>
              <p><strong>Téléphone :</strong> +33 1 23 45 67 89</p>
              <p><strong>Email :</strong> contact@dag-belts.com</p>
            </div>
          </section>

          {/* Directeur de publication */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Directeur de publication</h2>
            <p className="text-gray-700">Le directeur de la publication est M. Jean Dupont, Président de DAG SAS.</p>
          </section>

          {/* Hébergement */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Hébergement</h2>
            <div className="text-gray-700 space-y-2">
              <p>Le site est hébergé par :</p>
              <p><strong>Vercel Inc.</strong></p>
              <p>340 S Lemon Ave #4133</p>
              <p>Walnut, CA 91789, USA</p>
            </div>
          </section>

          {/* Propriété intellectuelle */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Propriété intellectuelle</h2>
            <div className="text-gray-700 space-y-3">
              <p>
                L'ensemble de ce site relève de la législation française et internationale sur le droit d'auteur et la propriété intellectuelle.
                Tous les droits de reproduction sont réservés, y compris pour les documents téléchargeables et les représentations iconographiques et photographiques.
              </p>
              <p>
                La reproduction de tout ou partie de ce site sur un support électronique quel qu'il soit est formellement interdite
                sauf autorisation expresse du directeur de la publication.
              </p>
              <p>
                Les marques et logos DAG sont des marques déposées. Toute reproduction totale ou partielle de ces marques
                sans autorisation préalable et écrite de DAG est prohibée.
              </p>
            </div>
          </section>

          {/* Données personnelles */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Protection des données personnelles (RGPD)</h2>
            <div className="text-gray-700 space-y-3">
              <p>
                Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés,
                vous disposez d'un droit d'accès, de rectification, de suppression et d'opposition aux données personnelles vous concernant.
              </p>
              <p>
                Les informations collectées lors de votre commande (nom, prénom, adresse, email, téléphone) sont nécessaires
                au traitement de votre commande et à la gestion de la relation client.
              </p>
              <p>
                Vos données sont conservées pour la durée nécessaire à l'exécution de nos obligations légales et contractuelles.
                Elles ne sont en aucun cas cédées à des tiers.
              </p>
              <p>
                Pour exercer vos droits, vous pouvez nous contacter par email à : <strong>contact@dag-belts.com</strong> ou par courrier
                à l'adresse du siège social.
              </p>
              <p>
                <strong>Responsable du traitement :</strong> DAG SAS
              </p>
            </div>
          </section>

          {/* Cookies */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Cookies</h2>
            <div className="text-gray-700 space-y-3">
              <p>
                Le site DAG utilise des cookies pour améliorer l'expérience utilisateur et analyser le trafic.
              </p>
              <p>
                Les cookies utilisés sont :
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Cookies nécessaires : pour le fonctionnement du panier et la navigation</li>
                <li>Cookies de préférence : pour mémoriser vos choix (langue, etc.)</li>
                <li>Cookies analytiques : pour analyser l'utilisation du site (Google Analytics)</li>
              </ul>
              <p>
                Vous pouvez à tout moment désactiver les cookies dans les paramètres de votre navigateur.
                Cependant, cela peut affecter certaines fonctionnalités du site.
              </p>
            </div>
          </section>

          {/* Conditions générales */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Conditions Générales de Vente (CGV)</h2>
            <div className="text-gray-700 space-y-3">
              <h3 className="font-semibold text-lg mt-4">Article 1 - Prix</h3>
              <p>
                Les prix de nos produits sont indiqués en euros toutes taxes comprises (TVA française au taux en vigueur).
                DAG se réserve le droit de modifier ses prix à tout moment, mais les produits seront facturés sur la base
                des tarifs en vigueur au moment de la validation de la commande.
              </p>

              <h3 className="font-semibold text-lg mt-4">Article 2 - Livraison</h3>
              <p>
                Les délais de livraison sont de 3 à 5 jours ouvrés pour la France métropolitaine. Les frais de port sont
                offerts pour toute commande supérieure à 100€, sinon ils s'élèvent à 7,90€.
              </p>

              <h3 className="font-semibold text-lg mt-4">Article 3 - Droit de rétractation</h3>
              <p>
                Conformément à la législation en vigueur, vous disposez d'un délai de 30 jours à compter de la réception
                de votre commande pour exercer votre droit de rétractation sans avoir à justifier de motifs.
                Les produits doivent être retournés dans leur état d'origine, non portés, avec leur emballage d'origine.
              </p>

              <h3 className="font-semibold text-lg mt-4">Article 4 - Garantie</h3>
              <p>
                Tous nos produits bénéficient d'une garantie de 2 ans contre les défauts de fabrication,
                conformément à la garantie légale de conformité.
              </p>

              <h3 className="font-semibold text-lg mt-4">Article 5 - Responsabilité</h3>
              <p>
                DAG ne saurait être tenue responsable de l'inexécution du contrat en cas de rupture de stock,
                indisponibilité du produit, ou force majeure.
              </p>

              <h3 className="font-semibold text-lg mt-4">Article 6 - Litige</h3>
              <p>
                Les présentes conditions générales de vente sont soumises à la loi française.
                En cas de litige, une solution amiable sera recherchée avant toute action judiciaire.
                À défaut, les tribunaux français seront seuls compétents.
              </p>
            </div>
          </section>

          {/* Médiation */}
          <section className="mb-8">
            <h2 className="text-2xl font-display font-semibold mb-4">Médiation de la consommation</h2>
            <div className="text-gray-700 space-y-3">
              <p>
                Conformément à l'article L. 612-1 du Code de la consommation, il est prévu que le consommateur
                a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution
                amiable d'un litige qui l'opposerait à un professionnel.
              </p>
              <p>
                À cet effet, DAG garantit au consommateur le recours effectif à un dispositif de médiation de la consommation.
              </p>
            </div>
          </section>

          <div className="mt-12 pt-8 border-t border-gray-300 text-sm text-gray-600">
            <p>Dernière mise à jour : Janvier 2026</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Legal;
