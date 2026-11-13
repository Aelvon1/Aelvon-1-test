import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_FIELDS,
  COUNTRIES,
  EMPTY_CHECKOUT,
  GIFT_NOTE_MAX,
  MAX_LENGTHS,
  countryName,
  getCountry,
  isRequired,
  normalizeCheckout,
  normalizePostalCode,
  sanitizeCheckoutValues,
  toCustomer,
  validateAddress,
  validateCheckout,
  validateCity,
  validateCountry,
  validateEmail,
  validateField,
  validateGiftNote,
  validateName,
  validatePhone,
  validatePostalCode,
} from './validation';

const valid = {
  email: 'camille@exemple.fr',
  firstName: 'Camille',
  lastName: 'Durand',
  phone: '',
  address: '12 rue de Turenne',
  addressComplement: '',
  postalCode: '75003',
  city: 'Paris',
  country: 'FR',
  giftNote: '',
};

describe('pays livrés', () => {
  it('se limite à la France, la Belgique, la Suisse et le Luxembourg', () => {
    expect(COUNTRIES.map((country) => country.name)).toEqual(['France', 'Belgique', 'Suisse', 'Luxembourg']);
  });

  it('retrouve un pays par son code, sans tenir compte de la casse', () => {
    expect(getCountry('be')?.name).toBe('Belgique');
    expect(getCountry('XX')).toBeUndefined();
    expect(countryName('CH')).toBe('Suisse');
    expect(countryName('XX')).toBe('XX');
    expect(countryName(undefined)).toBe('');
  });
});

describe('validateEmail', () => {
  it('exige une adresse', () => {
    expect(validateEmail('')).toBe('Indiquez votre adresse e-mail.');
    expect(validateEmail('   ')).toBe('Indiquez votre adresse e-mail.');
    expect(validateEmail(undefined)).toBe('Indiquez votre adresse e-mail.');
  });

  it('accepte les adresses usuelles, espaces de bord compris', () => {
    for (const email of ['camille@exemple.fr', ' jean.dupont+dag@mail.exemple.com ', 'a@b.co', 'été@exemple.fr']) {
      expect(validateEmail(email)).toBe('');
    }
  });

  it('refuse les adresses incomplètes avec un exemple', () => {
    for (const email of ['camille', 'camille@', 'camille@exemple', '@exemple.fr', 'ca mille@exemple.fr', 'camille@@exemple.fr', 'camille@exemple..fr', 'camille@exemple.f']) {
      expect(validateEmail(email)).toMatch(/semble incomplète/);
    }
    expect(validateEmail(`${'a'.repeat(250)}@exemple.fr`)).not.toBe('');
  });

  it('refuse une ponctuation restée collée à l’adresse (fin de phrase, copier-coller)', () => {
    for (const email of [
      'jean@gmail.com.',
      'jean@exemple.fr,',
      'a@b.fr;',
      'jean@exemple.fr)',
      '<jean@exemple.fr>',
      '<jean@exemple.fr',
      'mailto:jean@exemple.fr',
      '"jean@exemple.fr"',
      'jean@exemple.fr.',
      'jean@.exemple.fr',
      'jean@-exemple.fr',
      'jean@exemple-.fr',
      'jean@exem_ple.fr',
      '.jean@exemple.fr',
      'jean.@exemple.fr',
    ]) {
      expect(validateEmail(email), email).toMatch(/semble incomplète/);
    }
  });

  it('refuse une extension de domaine qui n’est pas faite de lettres', () => {
    for (const email of ['jean@gmail.c0m', 'jean@exemple.123', 'jean@exemple.f-r', 'jean@192.168.0.1']) {
      expect(validateEmail(email), email).toMatch(/semble incomplète/);
    }
  });

  it('accepte sous-domaines, tirets, chiffres et extensions longues ou internationales', () => {
    for (const email of [
      'jean@mail.exemple.co.uk',
      'jean@mon-domaine.fr',
      'jean@123.fr',
      'j_d-x+tag@exemple.photography',
      "o'brien@exemple.ie",
      'jean@münchen.de',
      'jean@exemple.xn--p1ai',
      'JEAN@EXEMPLE.FR',
    ]) {
      expect(validateEmail(email), email).toBe('');
    }
  });

  it('respecte la typographie française (espace insécable avant les deux-points)', () => {
    expect(validateEmail('x')).toContain('Exemple\u00a0: prenom@exemple.fr');
  });
});

describe('validateName', () => {
  it('exige prénom et nom, avec un message propre à chacun', () => {
    expect(validateName('', 'firstName')).toBe('Indiquez votre prénom.');
    expect(validateName('  ', 'lastName')).toBe('Indiquez votre nom.');
  });

  it('accepte accents, tirets, apostrophes et particules', () => {
    for (const name of ['Camille', 'Jean-Noël', 'Éloïse', 'O’Brien', "D'Artagnan", 'de La Fontaine', 'St. John', 'Zoë']) {
      expect(validateName(name)).toBe('');
    }
  });

  it('refuse chiffres et symboles', () => {
    expect(validateName('Camille2')).toMatch(/Vérifiez votre prénom/);
    expect(validateName('<script>', 'lastName')).toMatch(/Vérifiez votre nom/);
    expect(validateName('camille@exemple.fr')).not.toBe('');
    expect(validateName('-')).not.toBe('');
    expect(validateName('a'.repeat(MAX_LENGTHS.firstName + 1))).not.toBe('');
  });
});

describe('validatePhone', () => {
  it('est facultatif', () => {
    expect(validatePhone('')).toBe('');
    expect(validatePhone('   ')).toBe('');
    expect(validatePhone(undefined)).toBe('');
  });

  it('accepte les formats français courants', () => {
    for (const phone of ['0612345678', '06 12 34 56 78', '06.12.34.56.78', '01-23-45-67-89', '+33 6 12 34 56 78', '+33 (0)6 12 34 56 78', '0033612345678']) {
      expect(validatePhone(phone, 'FR')).toBe('');
    }
  });

  it('refuse un numéro français incomplet ou mal formé', () => {
    for (const phone of ['06 12 34 56', '00 12 34', '061234567890', '+33 6 12 34', 'zéro six', '06 12 34 56 7x']) {
      expect(validatePhone(phone, 'FR')).toMatch(/semble incomplet/);
    }
  });

  it('accepte les numéros des autres pays livrés, nationaux ou internationaux', () => {
    expect(validatePhone('0470 12 34 56', 'BE')).toBe('');
    expect(validatePhone('+32 470 12 34 56', 'BE')).toBe('');
    expect(validatePhone('079 123 45 67', 'CH')).toBe('');
    expect(validatePhone('+41 79 123 45 67', 'CH')).toBe('');
    expect(validatePhone('621 123 456', 'LU')).toBe('');
    expect(validatePhone('26 12 34', 'LU')).toBe('');
    // un numéro étranger saisi pour une livraison en France
    expect(validatePhone('+32 470 12 34 56', 'FR')).toBe('');
  });

  it('refuse un numéro trop court ou trop long ailleurs aussi', () => {
    expect(validatePhone('12 34', 'BE')).not.toBe('');
    expect(validatePhone('+32 12', 'BE')).not.toBe('');
    expect(validatePhone('+1234567890123456', 'CH')).not.toBe('');
  });

  it('donne un exemple adapté au pays', () => {
    expect(validatePhone('1', 'FR')).toContain('06\u00a012\u00a034\u00a056\u00a078');
    expect(validatePhone('1', 'CH')).toContain('079\u00a0123\u00a045\u00a067');
  });
});

describe('validateAddress', () => {
  it('exige une adresse plausible', () => {
    expect(validateAddress('')).toMatch(/^Indiquez votre adresse/);
    expect(validateAddress('12')).toMatch(/semble incomplète/);
    expect(validateAddress('12345')).toMatch(/semble incomplète/);
    expect(validateAddress('12 rue de Turenne')).toBe('');
    expect(validateAddress('Lieu-dit Le Moulin')).toBe('');
  });
});

describe('validatePostalCode', () => {
  it('exige un code postal', () => {
    expect(validatePostalCode('', 'FR')).toBe('Indiquez votre code postal.');
    expect(validatePostalCode('  ', 'BE')).toBe('Indiquez votre code postal.');
  });

  it('France : cinq chiffres', () => {
    for (const code of ['75003', '01000', '20000', '20200', '95880', '75 003', 'F-75003']) {
      expect(validatePostalCode(code, 'FR')).toBe('');
    }
    for (const code of ['7500', '750030', '00100', '75O03', 'ABCDE', '96000', '99123']) {
      expect(validatePostalCode(code, 'FR')).toBe('En France, le code postal compte 5\u00a0chiffres. Exemple\u00a0: 75003');
    }
  });

  it('France : métropole uniquement — outre-mer et Monaco sont refusés, avec la raison', () => {
    // La Réunion, Guadeloupe, Martinique, Guyane, Mayotte, Nouvelle-Calédonie, Polynésie, Monaco
    for (const code of ['97400', '97110', '97200', '97300', '97600', '98800', '98714', '98000', '97 400']) {
      expect(validatePostalCode(code, 'FR'), code).toBe('Ce code postal est hors de France métropolitaine\u00a0: nous ne livrons pas encore l’outre-mer ni Monaco.');
    }
    // la règle ne vaut que pour la France : ailleurs, le message habituel du pays
    expect(validatePostalCode('97400', 'BE')).toMatch(/^En Belgique/);
  });

  it('Belgique, Suisse, Luxembourg : quatre chiffres', () => {
    expect(validatePostalCode('1000', 'BE')).toBe('');
    expect(validatePostalCode('B-1000', 'BE')).toBe('');
    expect(validatePostalCode('1204', 'CH')).toBe('');
    expect(validatePostalCode('CH-1204', 'CH')).toBe('');
    expect(validatePostalCode('1249', 'LU')).toBe('');
    expect(validatePostalCode('L-1249', 'LU')).toBe('');
    expect(validatePostalCode('l 1249', 'LU')).toBe('');

    expect(validatePostalCode('75003', 'BE')).toBe('En Belgique, le code postal compte 4\u00a0chiffres. Exemple\u00a0: 1000');
    expect(validatePostalCode('0999', 'CH')).toBe('En Suisse, le code postal compte 4\u00a0chiffres. Exemple\u00a0: 1204');
    expect(validatePostalCode('75003', 'LU')).toBe('Au Luxembourg, le code postal compte 4\u00a0chiffres. Exemple\u00a0: 1249');
  });

  it('dépend du pays : un même code est valide ici, pas là', () => {
    expect(validatePostalCode('1000', 'BE')).toBe('');
    expect(validatePostalCode('1000', 'FR')).not.toBe('');
  });

  it('retombe sur la France si le pays est inconnu', () => {
    expect(validatePostalCode('75003', 'XX')).toBe('');
    expect(validatePostalCode('75003')).toBe('');
  });
});

describe('normalizePostalCode', () => {
  it('retire espaces et préfixes de pays', () => {
    expect(normalizePostalCode(' 75 003 ', 'FR')).toBe('75003');
    expect(normalizePostalCode('F-75003', 'FR')).toBe('75003');
    expect(normalizePostalCode('l-1249', 'LU')).toBe('1249');
    expect(normalizePostalCode('CH-1204', 'CH')).toBe('1204');
    expect(normalizePostalCode(undefined)).toBe('');
  });
});

describe('validateCity, validateCountry, validateGiftNote', () => {
  it('exige une ville faite de lettres', () => {
    expect(validateCity('')).toBe('Indiquez votre ville.');
    expect(validateCity('75003')).toBe('Vérifiez le nom de votre ville.');
    expect(validateCity('Paris 75003')).toBe('Vérifiez le nom de votre ville.');
    for (const city of ['Paris', 'Saint-Étienne', 'L’Haÿ-les-Roses', 'Lyon 03', 'Esch-sur-Alzette']) {
      expect(validateCity(city)).toBe('');
    }
  });

  it('n’accepte que les pays livrés', () => {
    for (const { code } of COUNTRIES) expect(validateCountry(code)).toBe('');
    expect(validateCountry('ES')).toBe('Choisissez un pays de livraison.');
    expect(validateCountry('')).toBe('Choisissez un pays de livraison.');
  });

  it('limite la longueur du mot d’accompagnement', () => {
    expect(validateGiftNote('')).toBe('');
    expect(validateGiftNote('Joyeux anniversaire\u00a0!')).toBe('');
    expect(validateGiftNote('a'.repeat(GIFT_NOTE_MAX))).toBe('');
    expect(validateGiftNote('a'.repeat(GIFT_NOTE_MAX + 1))).toContain(`${GIFT_NOTE_MAX}\u00a0caractères`);
  });
});

describe('validateField', () => {
  it('délègue au bon validateur', () => {
    expect(validateField('email', { email: 'x' })).toMatch(/semble incomplète/);
    expect(validateField('lastName', { lastName: '' })).toBe('Indiquez votre nom.');
    expect(validateField('addressComplement', { addressComplement: 'Bâtiment B, 3e étage' })).toBe('');
    expect(validateField('addressComplement', { addressComplement: 'x'.repeat(200) })).not.toBe('');
  });

  it('valide code postal et téléphone selon le pays du formulaire', () => {
    expect(validateField('postalCode', { postalCode: '1000', country: 'BE' })).toBe('');
    expect(validateField('postalCode', { postalCode: '1000', country: 'FR' })).not.toBe('');
    expect(validateField('phone', { phone: '621 123 456', country: 'LU' })).toBe('');
    expect(validateField('phone', { phone: '621 123 456', country: 'FR' })).not.toBe('');
  });

  it('ignore un champ inconnu', () => {
    expect(validateField('cardNumber', { cardNumber: '' })).toBe('');
    expect(validateField('email')).toBe('Indiquez votre adresse e-mail.');
  });
});

describe('validateCheckout', () => {
  it('valide un formulaire complet, téléphone et complément facultatifs', () => {
    expect(validateCheckout(valid)).toEqual({ valid: true, errors: {}, firstInvalid: null });
    expect(validateCheckout({ ...valid, phone: '06 12 34 56 78', addressComplement: 'Bâtiment B' }).valid).toBe(true);
  });

  it('signale tous les champs requis d’un formulaire vide et désigne le premier', () => {
    const result = validateCheckout(EMPTY_CHECKOUT);
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(['email', 'firstName', 'lastName', 'address', 'postalCode', 'city']);
    expect(result.firstInvalid).toBe('email');
  });

  it('désigne le premier champ en erreur dans l’ordre d’affichage', () => {
    const result = validateCheckout({ ...valid, city: '', postalCode: '123', phone: 'abc' });
    expect(Object.keys(result.errors)).toEqual(['postalCode', 'city', 'phone']);
    expect(result.firstInvalid).toBe('postalCode');
  });

  it('place le pays avant les champs qui en dépendent (code postal, téléphone)', () => {
    const at = (field) => CHECKOUT_FIELDS.indexOf(field);
    expect(at('country')).toBeGreaterThan(-1);
    expect(at('country')).toBeLessThan(at('postalCode'));
    expect(at('country')).toBeLessThan(at('phone'));
  });

  it('refuse une commande vers l’outre-mer ou Monaco', () => {
    const result = validateCheckout({ ...valid, postalCode: '97400', city: 'Saint-Denis' });
    expect(result.valid).toBe(false);
    expect(result.firstInvalid).toBe('postalCode');
  });

  it('tolère une entrée absente', () => {
    expect(validateCheckout().valid).toBe(false);
    expect(validateCheckout(undefined).firstInvalid).toBe('email');
  });

  it('ne demande aucune donnée bancaire', () => {
    expect(CHECKOUT_FIELDS.join(' ')).not.toMatch(/card|carte|cvv|cvc|iban|expir/i);
  });

  it('connaît les champs requis', () => {
    expect(isRequired('email')).toBe(true);
    expect(isRequired('phone')).toBe(false);
    expect(isRequired('addressComplement')).toBe(false);
    expect(isRequired('giftNote')).toBe(false);
  });
});

describe('sanitizeCheckoutValues', () => {
  it('ne garde que les champs connus, sous forme de chaînes bornées', () => {
    const values = sanitizeCheckoutValues({
      email: 'camille@exemple.fr',
      firstName: 42,
      city: null,
      cardNumber: '4242',
      country: 'be',
      address: 'x'.repeat(500),
    });
    expect(values.email).toBe('camille@exemple.fr');
    expect(values.firstName).toBe('');
    expect(values.city).toBe('');
    expect(values.country).toBe('BE');
    expect(values.address).toHaveLength(MAX_LENGTHS.address);
    expect(values).not.toHaveProperty('cardNumber');
    expect(Object.keys(values)).toEqual(Object.keys(EMPTY_CHECKOUT));
  });

  it('revient au formulaire vide pour une entrée inexploitable', () => {
    for (const raw of [null, undefined, 'texte', 12, []]) {
      expect(sanitizeCheckoutValues(raw)).toEqual(EMPTY_CHECKOUT);
    }
    expect(sanitizeCheckoutValues({ country: 'ES' }).country).toBe('FR');
  });
});

describe('normalizeCheckout et toCustomer', () => {
  const typed = {
    ...valid,
    email: '  camille@exemple.fr ',
    firstName: ' Camille  ',
    lastName: 'Durand   Martin',
    address: ' 12  rue de Turenne ',
    postalCode: ' l-1249 ',
    city: ' Luxembourg ',
    country: 'LU',
    giftNote: '  Joyeux anniversaire.\r\nÀ très vite.  ',
  };

  it('retire les espaces superflus et normalise le code postal', () => {
    expect(normalizeCheckout(typed)).toMatchObject({
      email: 'camille@exemple.fr',
      firstName: 'Camille',
      lastName: 'Durand Martin',
      address: '12 rue de Turenne',
      postalCode: '1249',
      city: 'Luxembourg',
      country: 'LU',
      giftNote: 'Joyeux anniversaire.\nÀ très vite.',
    });
  });

  it('produit les coordonnées du client, sans le mot d’accompagnement', () => {
    const customer = toCustomer(typed);
    expect(customer).not.toHaveProperty('giftNote');
    expect(Object.keys(customer)).toEqual(['email', 'firstName', 'lastName', 'phone', 'address', 'addressComplement', 'postalCode', 'city', 'country']);
    expect(customer.postalCode).toBe('1249');
  });

  it('reste valide une fois normalisé', () => {
    expect(validateCheckout(normalizeCheckout(typed)).valid).toBe(true);
  });
});
