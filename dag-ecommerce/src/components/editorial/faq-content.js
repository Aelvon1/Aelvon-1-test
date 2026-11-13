// Aide — questions et réponses. Les chiffres viennent des règles partagées (lib/*), jamais recopiés.
// Une réponse est une liste de blocs :
//   - un paragraphe : chaîne, ou tableau de fragments (chaîne | { label, to } | { label, href })
//   - une liste de définitions : { terms: [[terme, définition], …] }
import { formatPrice } from '../../lib/format';
import { deliveryDelay } from '../../lib/orders';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST } from '../../lib/pricing';
import { SIZE_ALLOWANCE_CM, recommendSize } from '../../lib/sizing';
import { COUNTRIES } from '../../lib/validation';
import { CONTACT_EMAIL } from '../layout/navigation';

const NBSP = '\xa0';
const FR = deliveryDelay('FR');
const NEIGHBOURS = deliveryDelay('BE');
// Chaque pays avec sa préposition (« en France », « au Luxembourg »), telle que la donne COUNTRIES[].where.
const COUNTRY_LIST = new Intl.ListFormat('fr', { style: 'long', type: 'conjunction' }).format(
  COUNTRIES.map((country) => country.where.charAt(0).toLowerCase() + country.where.slice(1)),
);
const EXAMPLE_WAIST = 85;
const EXAMPLE_SIZE = recommendSize(EXAMPLE_WAIST)?.size ?? String(EXAMPLE_WAIST + SIZE_ALLOWANCE_CM);

const mail = { label: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` };
const contactForm = (label = 'formulaire de contact', query = '') => ({ label, to: `/contact${query}` });

export const FAQ_CATEGORIES = [
  {
    id: 'livraison',
    title: 'Commande et livraison',
    short: 'Livraison',
    questions: [
      {
        id: 'delais',
        q: `Quels sont les délais de livraison${NBSP}?`,
        a: [
          `Nous livrons en ${FR.minDays} à ${FR.maxDays}${NBSP}jours ouvrés en France métropolitaine. Pour la Belgique, la Suisse et le Luxembourg, comptez ${NEIGHBOURS.minDays} à ${NEIGHBOURS.maxDays}${NBSP}jours ouvrés.`,
        ],
      },
      {
        id: 'frais',
        q: `La livraison est-elle gratuite${NBSP}?`,
        a: [
          `Oui, la livraison est offerte pour toute commande de ${formatPrice(FREE_SHIPPING_THRESHOLD)} ou plus. En dessous, les frais de port sont de ${formatPrice(SHIPPING_COST)}.`,
        ],
      },
      {
        id: 'suivi',
        q: `Puis-je suivre ma commande${NBSP}?`,
        a: [
          'Absolument. Dès l’expédition de votre commande, vous recevez un e-mail avec un numéro de suivi, pour suivre votre colis en temps réel.',
        ],
      },
      {
        id: 'international',
        q: `Livrez-vous à l’international${NBSP}?`,
        a: [`Actuellement, nous livrons ${COUNTRY_LIST}. Nous prévoyons d’étendre nos zones de livraison prochainement.`],
      },
    ],
  },
  {
    id: 'produits',
    title: 'Produits et tailles',
    short: 'Produits',
    questions: [
      {
        id: 'taille',
        q: `Comment choisir la bonne taille de ceinture${NBSP}?`,
        a: [
          `Mesurez votre tour de taille, là où vous portez votre pantalon, et ajoutez ${SIZE_ALLOWANCE_CM}${NBSP}cm. Par exemple, pour un tour de taille de ${EXAMPLE_WAIST}${NBSP}cm, choisissez une ceinture en taille ${EXAMPLE_SIZE}.`,
          ['Notre ', { label: 'guide des tailles', to: '/guide-des-tailles' }, ' détaille la mesure et calcule votre taille pour vous.'],
        ],
      },
      {
        id: 'collections',
        q: `Quelle est la différence entre les collections${NBSP}?`,
        a: [
          {
            terms: [
              ['Essential', 'classique et intemporelle.'],
              ['Matte', 'look urbain, finition mate.'],
              ['Texture', 'cuir grainé, robuste.'],
              ['Dress', 'fine et élégante, pour les tenues formelles.'],
              ['Everyday', 'polyvalente, pour tous les jours.'],
            ],
          },
          ['Toutes sont à découvrir dans ', { label: 'la collection', to: '/shop' }, '.'],
        ],
      },
      {
        id: 'cuir',
        q: `Les ceintures sont-elles en cuir véritable${NBSP}?`,
        a: [
          'Oui, toutes nos ceintures sont fabriquées en cuir pleine fleur de haute qualité, sélectionné pour sa durabilité et sa patine naturelle.',
        ],
      },
      {
        id: 'entretien',
        q: `Comment entretenir ma ceinture DAG${NBSP}?`,
        a: [
          `Nettoyez-la régulièrement avec un chiffon doux et sec. Pour nourrir le cuir, utilisez un produit d’entretien adapté 2 à 3${NBSP}fois par an. Évitez l’exposition prolongée à l’eau et à la chaleur directe.`,
        ],
      },
    ],
  },
  {
    id: 'retours',
    title: 'Retours et échanges',
    short: 'Retours',
    questions: [
      {
        id: 'retour',
        q: `Puis-je retourner un produit${NBSP}?`,
        a: [
          `Oui, vous disposez de 30${NBSP}jours après réception pour retourner un produit non porté, dans son emballage d’origine, avec tous ses accessoires.`,
        ],
      },
      {
        id: 'retour-gratuit',
        q: `Les retours sont-ils gratuits${NBSP}?`,
        a: ['Oui, les retours sont entièrement gratuits. Nous vous envoyons une étiquette de retour prépayée par e-mail.'],
      },
      {
        id: 'echange',
        q: `Comment échanger ma ceinture${NBSP}?`,
        a: [
          [
            'Pour un échange de taille ou de couleur, contactez-nous via le ',
            contactForm('formulaire de contact', '?sujet=retour'),
            ' ou par e-mail à ',
            mail,
            '. Nous organiserons l’échange dans les plus brefs délais.',
          ],
        ],
      },
      {
        id: 'remboursement',
        q: `Quand serai-je remboursé${NBSP}?`,
        a: [
          `Le remboursement est effectué dans les 5${NBSP}jours ouvrés suivant la réception du produit retourné, sur le moyen de paiement utilisé lors de l’achat.`,
        ],
      },
    ],
  },
  {
    id: 'paiement',
    title: 'Paiement et sécurité',
    short: 'Paiement',
    questions: [
      {
        id: 'moyens',
        q: `Quels moyens de paiement acceptez-vous${NBSP}?`,
        a: [
          'Le paiement par carte bancaire (Visa, Mastercard, American Express) sera pris en charge par Stripe, notre prestataire de paiement sécurisé, dès sa mise en service.',
          'D’ici là, aucune somme n’est prélevée et aucune donnée bancaire ne vous est demandée sur ce site.',
        ],
      },
      {
        id: 'securite',
        q: `Le paiement est-il sécurisé${NBSP}?`,
        a: [
          'Absolument. Toutes les transactions seront confiées à Stripe, qui chiffre les échanges (SSL) et respecte la norme PCI-DSS. DAG ne conserve aucune donnée bancaire.',
        ],
      },
      {
        id: 'donnees',
        q: `Mes données sont-elles protégées${NBSP}?`,
        a: [
          ['Oui. Nous ne stockons aucune information bancaire, et vos données personnelles sont protégées conformément au RGPD. Le détail figure dans nos ', { label: 'mentions légales', to: '/legal#donnees' }, '.'],
        ],
      },
    ],
  },
  {
    id: 'garantie',
    title: 'Garantie et service',
    short: 'Garantie',
    questions: [
      {
        id: 'garantie-duree',
        q: `Quelle est la garantie sur les produits${NBSP}?`,
        a: [
          `Toutes nos ceintures bénéficient d’une garantie de 2${NBSP}ans contre les défauts de fabrication. Cette garantie ne couvre pas l’usure normale du produit.`,
        ],
      },
      {
        id: 'defaut',
        q: `Que faire en cas de défaut${NBSP}?`,
        a: [
          [
            { label: 'Contactez notre service client', to: '/contact?sujet=produit' },
            ' avec des photos du défaut. Nous évaluerons le problème et procéderons à un échange ou à un remboursement si nécessaire.',
          ],
        ],
      },
      {
        id: 'service-client',
        q: `Comment contacter le service client${NBSP}?`,
        a: [['Par e-mail à ', mail, ', ou via notre ', contactForm(), `. Nous répondons sous 24${NBSP}h ouvrées.`]],
      },
    ],
  },
];

export const FAQ_COUNT = FAQ_CATEGORIES.reduce((total, category) => total + category.questions.length, 0);

const inlineText = (block) => (typeof block === 'string' ? block : block.map((part) => (typeof part === 'string' ? part : part.label)).join(''));

/** Réponse en texte brut (recherche, données structurées). */
export function answerText(answer) {
  return answer
    .map((block) => (block.terms ? block.terms.map(([term, text]) => `${term}${NBSP}: ${text}`).join(' ') : inlineText(block)))
    .join(' ');
}

/**
 * Replie un texte pour la comparaison : minuscules, sans accents, apostrophes et espaces unifiées.
 * Caractère par caractère : la longueur est conservée, les positions restent valables dans l'original.
 */
export function fold(text) {
  let out = '';
  for (const char of String(text ?? '')) {
    if (char.length > 1) {
      out += char; // hors du plan de base : laissé tel quel
      continue;
    }
    const base = char.normalize('NFD')[0].toLowerCase();
    out += base === '’' || base === '‘' ? "'" : /\s/.test(base) ? ' ' : base.length === 1 ? base : char;
  }
  return out;
}

/** Mots cherchés : la requête repliée, découpée sur les espaces. */
export const searchTerms = (query) => fold(query).split(' ').filter(Boolean);

/** Paramètre d'URL qui porte la recherche (« /faq?q=retour ») : elle survit ainsi à un aller-retour dans l'historique. */
export const QUERY_PARAM = 'q';

/** Recherche inscrite dans l'URL, sans espaces autour ; '' s'il n'y en a pas. */
export const queryFromParams = (searchParams) => (searchParams?.get(QUERY_PARAM) ?? '').trim();

/**
 * Les paramètres de l'URL avec la recherche en cours ; une recherche vide retire le paramètre.
 * @returns {URLSearchParams} une copie : les paramètres reçus ne sont pas modifiés
 */
export function paramsWithQuery(searchParams, query) {
  const next = new URLSearchParams(searchParams ?? undefined);
  const value = String(query ?? '').trim();
  if (value) next.set(QUERY_PARAM, value);
  else next.delete(QUERY_PARAM);
  return next;
}

/**
 * Filtre l'aide : une question est retenue si chacun des mots cherchés figure dans son intitulé,
 * sa réponse ou le nom de sa rubrique. Sans mot cherché, tout est renvoyé.
 * @returns {Array<object>} les rubriques, chacune avec ses seules questions retenues (rubriques vides incluses)
 */
export function filterFaq(query, categories = FAQ_CATEGORIES) {
  const terms = searchTerms(query);
  if (!terms.length) return categories;
  return categories.map((category) => ({
    ...category,
    questions: category.questions.filter((question) => {
      const haystack = fold(`${question.q} ${answerText(question.a)} ${category.title}`);
      return terms.every((term) => haystack.includes(term));
    }),
  }));
}

/**
 * Découpe un intitulé en segments { text, match } pour surligner les mots cherchés.
 * @returns {Array<{ text: string, match: boolean }>}
 */
export function highlightParts(text, query) {
  const terms = searchTerms(query);
  const source = String(text ?? '');
  if (!terms.length) return [{ text: source, match: false }];
  const folded = fold(source);
  const marks = new Array(source.length).fill(false);
  for (const term of terms) {
    let from = folded.indexOf(term);
    while (from !== -1) {
      for (let i = from; i < from + term.length; i += 1) marks[i] = true;
      from = folded.indexOf(term, from + term.length);
    }
  }
  const parts = [];
  for (let i = 0; i < source.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.match === marks[i]) last.text += source[i];
    else parts.push({ text: source[i], match: marks[i] });
  }
  return parts;
}

/** Données structurées schema.org (FAQPage) de toute l'aide. */
export function faqJsonLd(categories = FAQ_CATEGORIES) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: categories.flatMap((category) =>
      category.questions.map((question) => ({
        '@type': 'Question',
        name: question.q.replaceAll(NBSP, ' '),
        acceptedAnswer: { '@type': 'Answer', text: answerText(question.a).replaceAll(NBSP, ' ') },
      })),
    ),
  };
}
