import { describe, expect, it } from 'vitest';
import { EMPTY_CHECKOUT } from '../../lib/validation';
import { CHECKOUT_DRAFT_KEY, clearDraft, loadDraft, saveDraft } from './draft';

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    removeItem: (key) => {
      delete data[key];
    },
    data,
  };
};

const brokenStorage = () => ({
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
});

const values = { ...EMPTY_CHECKOUT, email: 'camille@exemple.fr', firstName: 'Camille', city: 'Bruxelles', country: 'BE', giftNote: 'Pour toi.' };

describe('brouillon de commande', () => {
  it('part d’un formulaire vide', () => {
    expect(loadDraft(memoryStorage())).toEqual({ values: EMPTY_CHECKOUT, gift: false });
  });

  it('enregistre puis relit la saisie et la case cadeau', () => {
    const storage = memoryStorage();
    saveDraft({ values, gift: true }, storage);
    expect(Object.keys(storage.data)).toEqual([CHECKOUT_DRAFT_KEY]);
    expect(loadDraft(storage)).toEqual({ values, gift: true });
  });

  it('n’enregistre rien d’autre que la saisie', () => {
    const storage = memoryStorage();
    saveDraft({ values, gift: false, errors: { email: 'x' }, step: 2 }, storage);
    expect(Object.keys(JSON.parse(storage.data[CHECKOUT_DRAFT_KEY]))).toEqual(['values', 'gift']);
  });

  it('valide ce qui est relu', () => {
    const storage = memoryStorage({
      [CHECKOUT_DRAFT_KEY]: JSON.stringify({ values: { email: 42, city: 'Paris', country: 'ES', cardNumber: '4242' }, gift: 'oui' }),
    });
    const draft = loadDraft(storage);
    expect(draft.gift).toBe(false);
    expect(draft.values).toEqual({ ...EMPTY_CHECKOUT, city: 'Paris' });
  });

  it('efface le brouillon', () => {
    const storage = memoryStorage();
    saveDraft({ values, gift: true }, storage);
    clearDraft(storage);
    expect(storage.data).toEqual({});
    expect(loadDraft(storage)).toEqual({ values: EMPTY_CHECKOUT, gift: false });
  });

  it('ne lève jamais d’erreur : contenu illisible, stockage absent ou qui refuse', () => {
    expect(loadDraft(memoryStorage({ [CHECKOUT_DRAFT_KEY]: '{oups' }))).toEqual({ values: EMPTY_CHECKOUT, gift: false });
    expect(loadDraft(memoryStorage({ [CHECKOUT_DRAFT_KEY]: '"texte"' }))).toEqual({ values: EMPTY_CHECKOUT, gift: false });
    expect(loadDraft(null)).toEqual({ values: EMPTY_CHECKOUT, gift: false });
    expect(() => saveDraft({ values, gift: true }, null)).not.toThrow();
    expect(() => clearDraft(null)).not.toThrow();

    const broken = brokenStorage();
    expect(loadDraft(broken)).toEqual({ values: EMPTY_CHECKOUT, gift: false });
    expect(() => saveDraft({ values, gift: true }, broken)).not.toThrow();
    expect(() => clearDraft(broken)).not.toThrow();
  });
});
