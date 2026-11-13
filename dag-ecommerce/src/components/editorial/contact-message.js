// Formulaire de contact — logique pure. Le site n'a pas de serveur : le message validé est
// remis à la messagerie du visiteur par un lien mailto prérempli, jamais « envoyé » d'ici.
import { ORDER_ID_PATTERN } from '../../lib/orders';
import { validateEmail } from '../../lib/validation';
import { CONTACT_EMAIL } from '../layout/navigation';

const NBSP = '\xa0';

export const SUBJECTS = [
  { value: 'commande', label: 'Question sur une commande' },
  { value: 'produit', label: 'Question sur un produit' },
  { value: 'retour', label: 'Retour ou échange' },
  { value: 'partenariat', label: 'Partenariat' },
  { value: 'autre', label: 'Autre' },
];

export const CONTACT_FIELDS = ['name', 'email', 'subject', 'order', 'message'];
export const EMPTY_CONTACT = Object.freeze({ name: '', email: '', subject: '', order: '', message: '' });

export const NAME_MAX = 80;
export const MESSAGE_MIN = 10;
// Au-delà, certains logiciels de messagerie tronquent le corps d'un lien mailto.
export const MESSAGE_MAX = 1500;
export const ORDER_EXAMPLE = 'DAG-7K2M9Q';

const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export const subjectLabel = (value) => SUBJECTS.find((subject) => subject.value === value)?.label ?? '';

/** « dag 7k2m9q », « 7K2M9Q » → « DAG-7K2M9Q ». Une saisie qui ne ressemble pas à un numéro est rendue nettoyée. */
export function normalizeOrderNumber(value) {
  const compact = clean(value).toUpperCase().replace(/\s/g, '');
  if (!compact) return '';
  const code = compact.replace(/^DAG-?/, '');
  const candidate = `DAG-${code}`;
  return ORDER_ID_PATTERN.test(candidate) ? candidate : compact;
}

/**
 * Valide un champ du formulaire de contact.
 * @returns {string} message d'erreur prêt à afficher, ou '' si le champ convient
 */
export function validateContactField(field, values = {}) {
  const value = values[field];
  switch (field) {
    case 'name': {
      const name = clean(value);
      if (!name) return 'Indiquez votre nom.';
      if (name.length < 2 || name.length > NAME_MAX || !/\p{L}/u.test(name)) return 'Vérifiez votre nom.';
      return '';
    }
    case 'email':
      return validateEmail(value);
    case 'subject':
      return SUBJECTS.some((subject) => subject.value === value) ? '' : 'Choisissez le sujet de votre message.';
    case 'order': {
      const order = normalizeOrderNumber(value);
      if (!order) return '';
      return ORDER_ID_PATTERN.test(order) ? '' : `Ce numéro semble incomplet. Exemple${NBSP}: ${ORDER_EXAMPLE}`;
    }
    case 'message': {
      const message = String(value ?? '').trim();
      if (!message) return 'Écrivez votre message.';
      if (message.length < MESSAGE_MIN) return 'Votre message est un peu court. Dites-nous-en davantage.';
      // le décompte figure dans l'erreur : elle remplace l'aide du champ, où il s'affiche d'ordinaire
      if (message.length > MESSAGE_MAX) {
        return `Votre message compte ${message.length}${NBSP}caractères pour ${MESSAGE_MAX} au plus. Raccourcissez-le un peu.`;
      }
      return '';
    }
    default:
      return '';
  }
}

/**
 * Valide tout le formulaire.
 * @returns {{ valid: boolean, errors: Record<string, string>, firstInvalid: string|null }}
 */
export function validateContact(values = {}) {
  const errors = {};
  for (const field of CONTACT_FIELDS) {
    const message = validateContactField(field, values);
    if (message) errors[field] = message;
  }
  const firstInvalid = CONTACT_FIELDS.find((field) => errors[field]) ?? null;
  return { valid: firstInvalid === null, errors, firstInvalid };
}

/**
 * Compose le courriel à remettre à la messagerie du visiteur.
 * @returns {{ to: string, subject: string, body: string, mailto: string }}
 *   body : texte lisible (retours à la ligne « \n ») · mailto : lien prérempli (retours « \r\n » encodés)
 */
export function buildContactMessage(values = {}) {
  const name = clean(values.name);
  const email = clean(values.email);
  const order = normalizeOrderNumber(values.order);
  const topic = subjectLabel(values.subject) || 'Message';
  const subject = order ? `${topic} — commande ${order}` : topic;
  const message = String(values.message ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  const signature = [name, email, order ? `Commande${NBSP}: ${order}` : ''].filter(Boolean).join('\n');
  const body = `${message}\n\n—\n${signature}`;
  const encode = (text) => encodeURIComponent(text.replace(/\n/g, '\r\n'));
  return {
    to: CONTACT_EMAIL,
    subject,
    body,
    mailto: `mailto:${CONTACT_EMAIL}?subject=${encode(subject)}&body=${encode(body)}`,
  };
}

/** Valeurs initiales à partir de l'URL (« /contact?sujet=retour&commande=DAG-7K2M9Q »). */
export function contactDefaults(searchParams) {
  const subject = searchParams?.get('sujet') ?? '';
  const order = normalizeOrderNumber(searchParams?.get('commande') ?? '');
  return {
    ...EMPTY_CONTACT,
    subject: SUBJECTS.some((entry) => entry.value === subject) ? subject : '',
    order: ORDER_ID_PATTERN.test(order) ? order : '',
  };
}
