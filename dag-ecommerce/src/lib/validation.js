// Validation du formulaire de commande — fonctions pures, sans dépendance React.
// Chaque validateur renvoie '' quand la valeur convient, sinon un message en français
// prêt à afficher sous le champ.

/**
 * Pays livrés par la maison. `postal` valide le code une fois normalisé (voir
 * normalizePostalCode) ; `where` ouvre le message d'erreur (« En France, … »).
 */
export const COUNTRIES = [
  { code: 'FR', name: 'France', where: 'En France', postal: /^(?!00)\d{5}$/, postalDigits: 5, postalExample: '75003', phoneExample: '06 12 34 56 78' },
  { code: 'BE', name: 'Belgique', where: 'En Belgique', postal: /^[1-9]\d{3}$/, postalDigits: 4, postalExample: '1000', phoneExample: '0470 12 34 56' },
  { code: 'CH', name: 'Suisse', where: 'En Suisse', postal: /^[1-9]\d{3}$/, postalDigits: 4, postalExample: '1204', phoneExample: '079 123 45 67' },
  { code: 'LU', name: 'Luxembourg', where: 'Au Luxembourg', postal: /^[1-9]\d{3}$/, postalDigits: 4, postalExample: '1249', phoneExample: '621 123 456' },
];

export const DEFAULT_COUNTRY = 'FR';
export const GIFT_NOTE_MAX = 240;

/** Longueurs maximales acceptées (aussi posées en maxLength sur les champs). */
export const MAX_LENGTHS = Object.freeze({
  email: 254,
  firstName: 60,
  lastName: 60,
  phone: 24,
  address: 120,
  addressComplement: 120,
  postalCode: 10,
  city: 80,
  country: 2,
  giftNote: GIFT_NOTE_MAX,
});

/** Champs du formulaire, dans l'ordre d'affichage (sert à trouver le premier champ en erreur). */
export const CHECKOUT_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'address',
  'addressComplement',
  'postalCode',
  'city',
  'country',
  'giftNote',
];

export const REQUIRED_FIELDS = ['email', 'firstName', 'lastName', 'address', 'postalCode', 'city', 'country'];

export const EMPTY_CHECKOUT = Object.freeze({
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  addressComplement: '',
  postalCode: '',
  city: '',
  country: DEFAULT_COUNTRY,
  giftNote: '',
});

const NBSP = '\u00a0';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// lettres (accents compris), espaces, tirets, apostrophes et points : « Jean-Noël », « O’Brien », « St. John »
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
const HAS_LETTER = /\p{L}/u;

/** Texte nettoyé : chaîne, espaces de bord retirés, espaces internes réduits à un seul. */
const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export const isRequired = (field) => REQUIRED_FIELDS.includes(field);

/** Fiche d'un pays livré, ou undefined si le code est inconnu. */
export function getCountry(code) {
  const key = String(code ?? '').toUpperCase();
  return COUNTRIES.find((country) => country.code === key);
}

/** « FR » → « France ». Un code inconnu est rendu tel quel. */
export const countryName = (code) => getCountry(code)?.name ?? String(code ?? '');

/** Retire espaces et préfixe de pays (« L-1249 », « F-75003 », « CH-1204 ») d'un code postal. */
export function normalizePostalCode(value, country = DEFAULT_COUNTRY) {
  const compact = String(value ?? '')
    .toUpperCase()
    .replace(/[\s.]/g, '');
  const code = getCountry(country)?.code ?? DEFAULT_COUNTRY;
  const prefix = { FR: /^F(R)?-?/, BE: /^B(E)?-?/, CH: /^CH-?/, LU: /^L(U)?-?/ }[code];
  return compact.replace(prefix, '');
}

export function validateEmail(value) {
  const email = clean(value);
  if (!email) return 'Indiquez votre adresse e-mail.';
  if (email.length > MAX_LENGTHS.email || !EMAIL_PATTERN.test(email) || email.includes('..')) {
    return `Cette adresse semble incomplète. Exemple${NBSP}: prenom@exemple.fr`;
  }
  return '';
}

/** @param {'firstName'|'lastName'} [kind] */
export function validateName(value, kind = 'firstName') {
  const label = kind === 'lastName' ? 'nom' : 'prénom';
  const name = clean(value);
  if (!name) return `Indiquez votre ${label}.`;
  if (name.length > MAX_LENGTHS[kind] || !NAME_PATTERN.test(name)) {
    return `Vérifiez votre ${label}${NBSP}: lettres, espaces, tirets et apostrophes uniquement.`;
  }
  return '';
}

/** Téléphone : facultatif. Formats nationaux et internationaux (+33, 0033…) acceptés. */
export function validatePhone(value, country = DEFAULT_COUNTRY) {
  const phone = clean(value);
  if (!phone) return '';
  const example = (getCountry(country) ?? COUNTRIES[0]).phoneExample.replace(/ /g, NBSP);
  const message = `Ce numéro semble incomplet. Exemple${NBSP}: ${example}`;
  if (phone.length > MAX_LENGTHS.phone || !/^(\+|\(?\d)[\d\s.()-]*$/.test(phone)) return message;

  const digits = phone.replace(/\D/g, '');
  const international = phone.startsWith('+') || digits.startsWith('00');
  if (international) {
    const number = phone.startsWith('+') ? digits : digits.slice(2);
    // +33 (0)6 12 34 56 78 : neuf chiffres après l'indicatif, zéro de tête toléré
    if (number.startsWith('33')) return /^0?[1-9]\d{8}$/.test(number.slice(2)) ? '' : message;
    return number.length >= 8 && number.length <= 15 ? '' : message;
  }
  if ((getCountry(country)?.code ?? DEFAULT_COUNTRY) === 'FR') return /^0[1-9]\d{8}$/.test(digits) ? '' : message;
  return digits.length >= 6 && digits.length <= 12 ? '' : message;
}

export function validateAddress(value) {
  const address = clean(value);
  if (!address) return `Indiquez votre adresse${NBSP}: numéro et nom de la voie.`;
  if (address.length < 4 || address.length > MAX_LENGTHS.address || !HAS_LETTER.test(address)) {
    return `Cette adresse semble incomplète. Exemple${NBSP}: 12 rue de Turenne`;
  }
  return '';
}

export function validateAddressComplement(value) {
  return clean(value).length > MAX_LENGTHS.addressComplement ? 'Ce complément est trop long.' : '';
}

export function validatePostalCode(value, country = DEFAULT_COUNTRY) {
  const entry = getCountry(country) ?? COUNTRIES[0];
  const postalCode = normalizePostalCode(value, entry.code);
  if (!postalCode) return 'Indiquez votre code postal.';
  if (!entry.postal.test(postalCode)) {
    return `${entry.where}, le code postal compte ${entry.postalDigits}${NBSP}chiffres. Exemple${NBSP}: ${entry.postalExample}`;
  }
  return '';
}

export function validateCity(value) {
  const city = clean(value);
  if (!city) return 'Indiquez votre ville.';
  if (city.length > MAX_LENGTHS.city || !HAS_LETTER.test(city) || /\d{3,}/.test(city)) {
    return 'Vérifiez le nom de votre ville.';
  }
  return '';
}

export function validateCountry(value) {
  return getCountry(value) ? '' : 'Choisissez un pays de livraison.';
}

export function validateGiftNote(value) {
  const note = String(value ?? '').trim();
  return note.length > GIFT_NOTE_MAX ? `Votre mot dépasse ${GIFT_NOTE_MAX}${NBSP}caractères.` : '';
}

/**
 * Valide un champ dans le contexte du formulaire (le code postal et le téléphone
 * dépendent du pays choisi).
 * @param {string} field  nom du champ (voir CHECKOUT_FIELDS)
 * @param {Record<string, string>} values
 * @returns {string} message d'erreur, ou '' si le champ est valide
 */
export function validateField(field, values = {}) {
  const value = values[field];
  switch (field) {
    case 'email':
      return validateEmail(value);
    case 'firstName':
    case 'lastName':
      return validateName(value, field);
    case 'phone':
      return validatePhone(value, values.country);
    case 'address':
      return validateAddress(value);
    case 'addressComplement':
      return validateAddressComplement(value);
    case 'postalCode':
      return validatePostalCode(value, values.country);
    case 'city':
      return validateCity(value);
    case 'country':
      return validateCountry(value);
    case 'giftNote':
      return validateGiftNote(value);
    default:
      return '';
  }
}

/**
 * Valide tout le formulaire.
 * @returns {{ valid: boolean, errors: Record<string, string>, firstInvalid: string|null }}
 *   errors : uniquement les champs en erreur · firstInvalid : premier champ en erreur, dans l'ordre d'affichage
 */
export function validateCheckout(values = {}) {
  const errors = {};
  for (const field of CHECKOUT_FIELDS) {
    const message = validateField(field, values);
    if (message) errors[field] = message;
  }
  const firstInvalid = CHECKOUT_FIELDS.find((field) => errors[field]) ?? null;
  return { valid: firstInvalid === null, errors, firstInvalid };
}

/**
 * Ne garde que les champs connus, sous forme de chaînes bornées. Sert à relire un brouillon
 * enregistré (sessionStorage) : tout ce qui est inattendu est écarté, rien ne lève d'erreur.
 */
export function sanitizeCheckoutValues(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const values = { ...EMPTY_CHECKOUT };
  for (const field of CHECKOUT_FIELDS) {
    if (typeof source[field] === 'string') values[field] = source[field].slice(0, MAX_LENGTHS[field]);
  }
  values.country = getCountry(values.country)?.code ?? DEFAULT_COUNTRY;
  return values;
}

/** Valeurs prêtes à enregistrer : espaces superflus retirés, code postal normalisé. */
export function normalizeCheckout(values = {}) {
  const safe = sanitizeCheckoutValues(values);
  return {
    email: clean(safe.email),
    firstName: clean(safe.firstName),
    lastName: clean(safe.lastName),
    phone: clean(safe.phone),
    address: clean(safe.address),
    addressComplement: clean(safe.addressComplement),
    postalCode: normalizePostalCode(safe.postalCode, safe.country),
    city: clean(safe.city),
    country: safe.country,
    giftNote: safe.giftNote.replace(/\r\n?/g, '\n').trim(),
  };
}

/** Coordonnées du client pour la commande : le formulaire normalisé, sans le mot d'accompagnement. */
export function toCustomer(values = {}) {
  const customer = normalizeCheckout(values);
  delete customer.giftNote;
  return customer;
}
