import PageHero from '../components/editorial/PageHero';
import SectionNav from '../components/editorial/SectionNav';
import { useActiveSection } from '../components/editorial/useActiveSection';
import { useHashAnchor } from '../components/editorial/useHashAnchor';
import { CONTACT_EMAIL } from '../components/layout/navigation';
import { Section, TextLink } from '../components/ui';
import { usePageMeta } from '../hooks';
import { formatPrice } from '../lib/format';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST } from '../lib/pricing';

// Le texte de cette page reprend, sans en changer le fond, les mentions légales existantes
// (identité de l'éditeur, engagements, conditions de vente). Seule la mise en forme a changé.

const two = (n) => String(n).padStart(2, '0');

const COMPANY = [
  ['Raison sociale', 'DAG SAS'],
  ['Capital social', formatPrice(50000)],
  ['Siège social', '123 Rue de la Mode, 75001 Paris, France'],
  ['SIRET', '123 456 789 00010'],
  ['RCS', 'Paris B 123 456 789'],
  ['TVA intracommunautaire', 'FR12 123456789'],
  ['Téléphone', '+33 1 23 45 67 89'],
  ['E-mail', CONTACT_EMAIL],
];

const ARTICLES = [
  {
    title: 'Prix',
    text: 'Les prix de nos produits sont indiqués en euros toutes taxes comprises (TVA française au taux en vigueur). DAG se réserve le droit de modifier ses prix à tout moment, mais les produits seront facturés sur la base des tarifs en vigueur au moment de la validation de la commande.',
  },
  {
    title: 'Livraison',
    text: `Les délais de livraison sont de 3 à 5\xa0jours ouvrés pour la France métropolitaine. Les frais de port sont offerts pour toute commande supérieure à ${formatPrice(FREE_SHIPPING_THRESHOLD)}, sinon ils s’élèvent à ${formatPrice(SHIPPING_COST)}.`,
  },
  {
    title: 'Droit de rétractation',
    text: 'Conformément à la législation en vigueur, vous disposez d’un délai de 30\xa0jours à compter de la réception de votre commande pour exercer votre droit de rétractation sans avoir à justifier de motifs. Les produits doivent être retournés dans leur état d’origine, non portés, avec leur emballage d’origine.',
  },
  {
    title: 'Garantie',
    text: 'Tous nos produits bénéficient d’une garantie de 2\xa0ans contre les défauts de fabrication, conformément à la garantie légale de conformité.',
  },
  {
    title: 'Responsabilité',
    text: 'DAG ne saurait être tenue responsable de l’inexécution du contrat en cas de rupture de stock, indisponibilité du produit, ou force majeure.',
  },
  {
    title: 'Litige',
    text: 'Les présentes conditions générales de vente sont soumises à la loi française. En cas de litige, une solution amiable sera recherchée avant toute action judiciaire. À défaut, les tribunaux français seront seuls compétents.',
  },
];

const SECTIONS = [
  {
    id: 'editeur',
    title: 'Éditeur du site',
    body: (
      <dl className="border-t border-line">
        {COMPANY.map(([label, value]) => (
          <div key={label} className="grid gap-x-6 gap-y-1 border-b border-line py-3.5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-baseline">
            <dt className="text-[0.8125rem] text-muted">{label}</dt>
            <dd className="font-medium text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    ),
  },
  {
    id: 'publication',
    title: 'Directeur de publication',
    body: <p>Le directeur de la publication est M.&nbsp;Jean Dupont, Président de DAG SAS.</p>,
  },
  {
    id: 'hebergement',
    title: 'Hébergement',
    body: (
      <>
        <p>Le site est hébergé par&nbsp;:</p>
        <address className="not-italic">
          <strong>Vercel Inc.</strong>
          <br />
          340 S Lemon Ave #4133
          <br />
          Walnut, CA 91789, USA
        </address>
      </>
    ),
  },
  {
    id: 'propriete',
    title: 'Propriété intellectuelle',
    body: (
      <>
        <p>
          L’ensemble de ce site relève de la législation française et internationale sur le droit d’auteur et la propriété
          intellectuelle. Tous les droits de reproduction sont réservés, y compris pour les documents téléchargeables et les
          représentations iconographiques et photographiques.
        </p>
        <p>
          La reproduction de tout ou partie de ce site sur un support électronique quel qu’il soit est formellement interdite sauf
          autorisation expresse du directeur de la publication.
        </p>
        <p>
          Les marques et logos DAG sont des marques déposées. Toute reproduction totale ou partielle de ces marques sans autorisation
          préalable et écrite de DAG est prohibée.
        </p>
      </>
    ),
  },
  {
    id: 'donnees',
    title: 'Protection des données personnelles (RGPD)',
    short: 'Données personnelles (RGPD)',
    body: (
      <>
        <p>
          Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés, vous disposez
          d’un droit d’accès, de rectification, de suppression et d’opposition aux données personnelles vous concernant.
        </p>
        <p>
          Les informations collectées lors de votre commande (nom, prénom, adresse, e-mail, téléphone) sont nécessaires au traitement
          de votre commande et à la gestion de la relation client.
        </p>
        <p>
          Vos données sont conservées pour la durée nécessaire à l’exécution de nos obligations légales et contractuelles. Elles ne
          sont en aucun cas cédées à des tiers.
        </p>
        <p>
          Pour exercer vos droits, vous pouvez nous contacter par e-mail à&nbsp;:{' '}
          <TextLink href={`mailto:${CONTACT_EMAIL}`} underline="always" tone="fg" className="font-medium">
            {CONTACT_EMAIL}
          </TextLink>{' '}
          ou par courrier à l’adresse du siège social.
        </p>
        <p>
          <strong>Responsable du traitement&nbsp;:</strong> DAG SAS
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <>
        <p>Le site DAG utilise des cookies pour améliorer l’expérience utilisateur et analyser le trafic.</p>
        <p>Les cookies utilisés sont&nbsp;:</p>
        <ul className="flex flex-col gap-2 border-l border-line pl-5">
          <li>Cookies nécessaires&nbsp;: pour le fonctionnement du panier et la navigation</li>
          <li>Cookies de préférence&nbsp;: pour mémoriser vos choix (langue, etc.)</li>
          <li>Cookies analytiques&nbsp;: pour analyser l’utilisation du site (Google Analytics)</li>
        </ul>
        <p>
          Vous pouvez à tout moment désactiver les cookies dans les paramètres de votre navigateur. Cependant, cela peut affecter
          certaines fonctionnalités du site.
        </p>
      </>
    ),
  },
  {
    id: 'cgv',
    title: 'Conditions générales de vente (CGV)',
    short: 'Conditions générales de vente',
    body: (
      <div className="flex flex-col gap-9">
        {ARTICLES.map((article, index) => (
          <div key={article.title}>
            <h3 className="text-subtitle lining-nums">
              <span className="text-muted">Article {index + 1}&nbsp;—</span> {article.title}
            </h3>
            <p className="mt-3">{article.text}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'mediation',
    title: 'Médiation de la consommation',
    body: (
      <>
        <p>
          Conformément à l’article L.&nbsp;612-1 du Code de la consommation, il est prévu que le consommateur a le droit de recourir
          gratuitement à un médiateur de la consommation en vue de la résolution amiable d’un litige qui l’opposerait à un
          professionnel.
        </p>
        <p>À cet effet, DAG garantit au consommateur le recours effectif à un dispositif de médiation de la consommation.</p>
      </>
    ),
  },
];

const UPDATED = 'Dernière mise à jour\xa0: janvier 2026';

export default function Legal() {
  usePageMeta({
    title: 'Mentions légales',
    description:
      'Mentions légales du site DAG\xa0: éditeur, hébergement, propriété intellectuelle, protection des données personnelles, cookies, conditions générales de vente et médiation.',
  });

  useHashAnchor();

  const active = useActiveSection(SECTIONS.map((section) => section.id));
  const navItems = SECTIONS.map((section) => ({ id: section.id, label: section.short ?? section.title }));

  return (
    <>
      <PageHero
        eyebrow="Informations légales"
        title="Mentions *légales*."
        lead="L’éditeur du site, vos données personnelles, les cookies et les conditions générales de vente."
        aside={<p className="eyebrow mt-6 text-muted">{UPDATED}</p>}
      />

      <Section tone="ivoire" className="!pt-[clamp(3.5rem,7vw,7rem)]">
        <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-6">
          <aside className="lg:col-span-3">
            <SectionNav items={navItems} active={active} label="Sommaire des mentions légales" title="Sommaire" className="lg:sticky lg:top-header" />
          </aside>

          <div className="lg:col-span-8 lg:col-start-5">
            {SECTIONS.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-titre`}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline gap-y-6 border-t border-line py-12 first:border-t-0 first:pt-0 lg:gap-y-8 lg:py-16"
              >
                <span aria-hidden="true" className="eyebrow tabular-nums text-accent">
                  {two(index + 1)}
                </span>
                <h2 id={`${section.id}-titre`} className="text-title max-w-[22ch]">
                  {section.title}
                </h2>
                <div className="col-span-2 flex max-w-[68ch] flex-col gap-5 leading-[1.8] text-fg/85 lg:col-span-1 lg:col-start-2 [&_strong]:font-semibold [&_strong]:text-fg">
                  {section.body}
                </div>
              </section>
            ))}
            <p className="border-t border-line pt-8 text-[0.8125rem] text-muted">{UPDATED}</p>
          </div>
        </div>
      </Section>
    </>
  );
}
