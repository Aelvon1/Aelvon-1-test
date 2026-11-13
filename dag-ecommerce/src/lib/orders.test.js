import { describe, expect, it } from 'vitest';
import { products } from '../data/products';
import { cartTotals, createAtelierItem, createCatalogItem } from './cart';
import {
  DELIVERY_DELAYS,
  MAX_STORED_ORDERS,
  ORDERS_STORAGE_KEY,
  ORDER_ID_PATTERN,
  ORDER_STATUS_DEMO,
  addWorkingDays,
  createOrder,
  deliveryDelay,
  estimateDelivery,
  generateOrderId,
  getOrder,
  listOrders,
  normalizeOrderId,
  sanitizeOrder,
  saveOrder,
} from './orders';
import { SHIPPING_COST } from './pricing';

const essential = products.find((p) => p.slug === 'essential');
const dress = products.find((p) => p.slug === 'dress');

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
    data,
  };
};

/** Stockage qui refuse toute lecture et toute écriture (navigation privée, cookies bloqués). */
const brokenStorage = () => ({
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
});

/** Stockage limité en taille : setItem lève une erreur au-delà de `limit` caractères. */
const tinyStorage = (limit) => {
  const storage = memoryStorage();
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (String(value).length > limit) throw new Error('QuotaExceededError');
    write(key, value);
  };
  return storage;
};

/** Suite déterministe de valeurs dans [0, 1). */
const sequence = (...values) => {
  let index = 0;
  return () => values[index++ % values.length];
};

const customer = {
  email: 'camille@exemple.fr',
  firstName: 'Camille',
  lastName: 'Durand',
  phone: '',
  address: '12 rue de Turenne',
  addressComplement: '',
  postalCode: '75003',
  city: 'Paris',
  country: 'FR',
};

const cart = () => [
  createCatalogItem(essential, essential.colors[0], '95'),
  createCatalogItem(dress, dress.colors[0], '90', { quantity: 2 }),
];

const order = (overrides = {}, options = {}) => {
  const items = overrides.items ?? cart();
  return createOrder({ items, totals: cartTotals(items), customer, giftNote: '', ...overrides }, options);
};

/** Date locale à midi : indépendante du fuseau où tournent les tests. */
const day = (year, month, date) => new Date(year, month - 1, date, 12);
const ymd = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

describe('generateOrderId', () => {
  it('produit un numéro lisible du type DAG-7K2M9Q', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOrderId()).toMatch(ORDER_ID_PATTERN);
  });

  it('n’emploie ni 0, ni O, ni 1, ni I', () => {
    const all = Array.from({ length: 32 }, (_, i) => generateOrderId(() => i / 32)).join('');
    expect(all.replace(/DAG-/g, '')).not.toMatch(/[01OI]/);
  });

  it('est déterministe pour une source d’aléa donnée, bornes comprises', () => {
    expect(generateOrderId(() => 0)).toBe('DAG-222222');
    expect(generateOrderId(() => 0.999999)).toBe('DAG-ZZZZZZ');
    expect(generateOrderId(() => 1)).toBe('DAG-ZZZZZZ');
    expect(generateOrderId(sequence(0, 0.999, 0.5))).toBe('DAG-2ZJ2ZJ');
  });
});

describe('normalizeOrderId', () => {
  it('tolère casse et espaces, écarte le reste', () => {
    expect(normalizeOrderId(' dag-7k2m9q ')).toBe('DAG-7K2M9Q');
    expect(normalizeOrderId('DAG-7K2M9')).toBe('');
    expect(normalizeOrderId('DAG-7K2M9O')).toBe('');
    expect(normalizeOrderId('7K2M9Q')).toBe('');
    expect(normalizeOrderId(undefined)).toBe('');
    expect(normalizeOrderId('../../etc')).toBe('');
  });
});

describe('createOrder', () => {
  it('assemble la commande : numéro, date, lignes, totaux, client, mot, statut', () => {
    const items = cart();
    const totals = cartTotals(items);
    const created = createOrder(
      { items, totals, customer, giftNote: '  Joyeux anniversaire.  ' },
      { now: '2026-11-13T09:30:00.000Z', random: () => 0.5 },
    );
    expect(Object.keys(created)).toEqual(['id', 'createdAt', 'items', 'totals', 'customer', 'gift', 'giftNote', 'status']);
    expect(created.id).toBe('DAG-JJJJJJ');
    expect(created.createdAt).toBe('2026-11-13T09:30:00.000Z');
    expect(created.items).toHaveLength(2);
    expect(created.items[0]).toMatchObject({ name: 'DAG Essential', subtitle: 'Noir · 95 cm', price: 89, quantity: 1, custom: false });
    expect(created.items[1]).toMatchObject({ name: 'DAG Dress', quantity: 2 });
    expect(created.totals).toEqual({ subtotal: 89 + 99 * 2, shipping: 0, total: 89 + 99 * 2, count: 3 });
    expect(created.customer).toEqual(customer);
    expect(created.gift).toBe(true);
    expect(created.giftNote).toBe('Joyeux anniversaire.');
    expect(created.status).toBe(ORDER_STATUS_DEMO);
  });

  it('retient qu’une commande est un cadeau, même sans mot d’accompagnement', () => {
    expect(order({ gift: true, giftNote: '' })).toMatchObject({ gift: true, giftNote: '' });
    expect(order({ gift: true, giftNote: '   ' })).toMatchObject({ gift: true, giftNote: '' });
    expect(order({ gift: false, giftNote: '' }).gift).toBe(false);
    expect(order().gift).toBe(false);
    // un mot d'accompagnement suffit à en faire un cadeau ; seul le booléen true compte sinon
    expect(order({ giftNote: 'Pour toi.' }).gift).toBe(true);
    expect(order({ gift: 'oui' }).gift).toBe(false);
  });

  it('fige les lignes : modifier le panier ensuite ne change pas la commande', () => {
    const items = cart();
    const created = order({ items });
    items[0].quantity = 9;
    items[0].selectedColor.name = 'Autre';
    expect(created.items[0].quantity).toBe(1);
    expect(created.items[0].selectedColor.name).toBe('Noir');
  });

  it('conserve une création de l’Atelier avec sa configuration', () => {
    const custom = createAtelierItem({ leather: 'bordeaux', finish: 'graine', buckle: 'laiton', stitch: 'or', width: 38, monogram: 'AD' }, '100');
    const created = order({ items: [custom] });
    expect(created.items[0]).toMatchObject({ custom: true, productId: null, slug: null, image: null, monogram: 'AD' });
    expect(created.items[0].belt).toMatchObject({ leather: 'bordeaux', buckle: 'laiton' });
  });

  it('reprend les frais de port du panier', () => {
    const items = [createCatalogItem(essential, essential.colors[0], '95')];
    expect(order({ items }).totals).toEqual({ subtotal: 89, shipping: SHIPPING_COST, total: 96.9, count: 1 });
  });

  it('recalcule des totaux absents ou incohérents', () => {
    const expected = cartTotals(cart());
    expect(order({ totals: undefined }).totals).toEqual(expected);
    expect(order({ totals: { subtotal: 'x', shipping: 0, total: NaN } }).totals).toEqual(expected);
    expect(order({ totals: { subtotal: -1, shipping: 0, total: 10 } }).totals).toEqual(expected);
  });

  it('ne garde du client que les champs attendus, en texte', () => {
    const created = order({ customer: { ...customer, cardNumber: '4242 4242 4242 4242', phone: 612345678, city: '  Paris ' } });
    expect(created.customer).not.toHaveProperty('cardNumber');
    expect(created.customer.phone).toBe('');
    expect(created.customer.city).toBe('Paris');
  });

  it('évite un numéro déjà attribué', () => {
    const random = sequence(...Array(6).fill(0), ...Array(6).fill(0.5));
    expect(order({}, { random, taken: ['DAG-222222'] }).id).toBe('DAG-JJJJJJ');
  });

  it('renvoie null pour un panier vide ou invalide', () => {
    expect(createOrder({ items: [], totals: {}, customer })).toBeNull();
    expect(createOrder({ items: [{ nope: true }], customer })).toBeNull();
    expect(createOrder()).toBeNull();
  });

  it('retombe sur la date du jour si la date fournie est invalide', () => {
    const created = order({}, { now: 'pas une date' });
    expect(Number.isNaN(new Date(created.createdAt).getTime())).toBe(false);
  });
});

describe('saveOrder, getOrder, listOrders', () => {
  it('enregistre sous une seule clé et relit la commande à l’identique', () => {
    const storage = memoryStorage();
    const created = order({ giftNote: 'Pour toi.' });
    expect(saveOrder(created, storage)).toBe(true);
    expect(Object.keys(storage.data)).toEqual([ORDERS_STORAGE_KEY]);
    expect(getOrder(created.id, storage)).toEqual(created);
    expect(getOrder(` ${created.id.toLowerCase()} `, storage)).toEqual(created);
  });

  it('renvoie null pour un numéro inconnu, absent ou mal formé', () => {
    const storage = memoryStorage();
    saveOrder(order(), storage);
    expect(getOrder('DAG-ZZZZZZ', storage)).toBeNull();
    expect(getOrder('', storage)).toBeNull();
    expect(getOrder(undefined, storage)).toBeNull();
    expect(getOrder('n’importe quoi', storage)).toBeNull();
  });

  it('liste de la plus récente à la plus ancienne', () => {
    const storage = memoryStorage();
    const first = order({}, { now: '2026-11-10T10:00:00Z', random: () => 0.1 });
    const second = order({}, { now: '2026-11-12T10:00:00Z', random: () => 0.2 });
    const third = order({}, { now: '2026-11-11T10:00:00Z', random: () => 0.3 });
    for (const entry of [first, second, third]) saveOrder(entry, storage);
    expect(listOrders(storage).map((entry) => entry.id)).toEqual([second.id, third.id, first.id]);
  });

  it(`ne conserve que les ${MAX_STORED_ORDERS} commandes les plus récentes`, () => {
    const storage = memoryStorage();
    const ids = [];
    for (let i = 0; i < MAX_STORED_ORDERS + 3; i += 1) {
      const created = order({}, { now: new Date(Date.UTC(2026, 10, 1 + i, 10)), random: () => i / 32 });
      ids.push(created.id);
      expect(saveOrder(created, storage)).toBe(true);
    }
    const stored = listOrders(storage);
    expect(stored).toHaveLength(MAX_STORED_ORDERS);
    expect(stored[0].id).toBe(ids.at(-1));
    expect(stored.map((entry) => entry.id)).not.toContain(ids[0]);
    expect(getOrder(ids[0], storage)).toBeNull();
    expect(JSON.parse(storage.data[ORDERS_STORAGE_KEY])).toHaveLength(MAX_STORED_ORDERS);
  });

  it('remplace une commande réenregistrée au lieu de la dupliquer', () => {
    const storage = memoryStorage();
    const created = order();
    saveOrder(created, storage);
    saveOrder({ ...created, giftNote: 'Corrigé.' }, storage);
    expect(listOrders(storage)).toHaveLength(1);
    expect(getOrder(created.id, storage).giftNote).toBe('Corrigé.');
  });

  it('valide ce qui est relu : écarte les entrées malformées, garde les bonnes', () => {
    const good = order();
    const storage = memoryStorage({
      [ORDERS_STORAGE_KEY]: JSON.stringify([
        null,
        'texte',
        { id: 'DAG-222222' },
        { ...good, id: 'pas-un-numero' },
        { ...good, id: 'DAG-333333', createdAt: 'hier' },
        { ...good, id: 'DAG-444444', items: [] },
        { ...good, id: 'DAG-555555', items: [{ name: 'sans prix' }] },
        good,
        good,
      ]),
    });
    expect(listOrders(storage)).toEqual([good]);
  });

  it('répare une commande partiellement abîmée plutôt que de la perdre', () => {
    const good = order();
    const storage = memoryStorage({
      [ORDERS_STORAGE_KEY]: JSON.stringify([{ ...good, totals: { subtotal: 'x' }, customer: null, giftNote: 12, status: '' }]),
    });
    const [read] = listOrders(storage);
    expect(read.totals).toEqual(good.totals);
    expect(read.customer.firstName).toBe('');
    expect(read.giftNote).toBe('');
    expect(read.status).toBe(ORDER_STATUS_DEMO);
  });

  it('ne lève jamais d’erreur : contenu illisible, stockage absent ou qui refuse', () => {
    expect(listOrders(memoryStorage({ [ORDERS_STORAGE_KEY]: '{oups' }))).toEqual([]);
    expect(listOrders(memoryStorage({ [ORDERS_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
    expect(listOrders(null)).toEqual([]);
    expect(getOrder('DAG-222222', null)).toBeNull();
    expect(saveOrder(order(), null)).toBe(false);

    const broken = brokenStorage();
    expect(listOrders(broken)).toEqual([]);
    expect(getOrder('DAG-222222', broken)).toBeNull();
    expect(saveOrder(order(), broken)).toBe(false);
  });

  it('refuse d’enregistrer une commande invalide', () => {
    const storage = memoryStorage();
    expect(saveOrder(null, storage)).toBe(false);
    expect(saveOrder({ id: 'DAG-222222' }, storage)).toBe(false);
    expect(storage.data).toEqual({});
  });

  it('abandonne les vignettes embarquées quand la place manque', () => {
    const custom = createAtelierItem({ leather: 'cognac' }, '95', { image: `data:image/png;base64,${'A'.repeat(20000)}` });
    const created = order({ items: [custom] });
    expect(created.items[0].image).toMatch(/^data:/);

    const storage = tinyStorage(6000);
    expect(saveOrder(created, storage)).toBe(true);
    const read = getOrder(created.id, storage);
    expect(read.items[0].image).toBeNull();
    expect(read.items[0].belt.leather).toBe('cognac');
  });

  it('garde au moins la dernière commande si les anciennes ne tiennent plus', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 4; i += 1) saveOrder(order({}, { now: new Date(Date.UTC(2026, 10, 1 + i)), random: () => i / 32 }), storage);
    const size = storage.data[ORDERS_STORAGE_KEY].length;
    const write = storage.setItem;
    storage.setItem = (key, value) => {
      if (String(value).length > size / 2) throw new Error('QuotaExceededError');
      write(key, value);
    };
    const latest = order({}, { now: new Date(Date.UTC(2026, 10, 20)), random: () => 0.9 });
    expect(saveOrder(latest, storage)).toBe(true);
    expect(listOrders(storage).map((entry) => entry.id)).toEqual([latest.id]);
  });
});

describe('sanitizeOrder', () => {
  it('accepte une commande créée par createOrder, y compris après un aller-retour JSON', () => {
    const created = order({ giftNote: 'Pour toi.' });
    expect(sanitizeOrder(created)).toEqual(created);
    expect(sanitizeOrder(JSON.parse(JSON.stringify(created)))).toEqual(created);
  });

  it('conserve l’indication cadeau, et la déduit du mot pour une commande plus ancienne', () => {
    const gifted = order({ gift: true });
    expect(sanitizeOrder(JSON.parse(JSON.stringify(gifted))).gift).toBe(true);
    const { gift, ...legacy } = order({ giftNote: 'Pour toi.' });
    expect(gift).toBe(true);
    expect(sanitizeOrder(legacy).gift).toBe(true);
    const { gift: none, ...plain } = order();
    expect(none).toBe(false);
    expect(sanitizeOrder(plain).gift).toBe(false);
  });

  it('ne rechiffre pas une commande passée : elle garde le prix et le nom du jour de l’achat', () => {
    const created = order();
    const past = { ...created, items: created.items.map((item) => ({ ...item, price: 59, name: 'Ancien nom' })), totals: { subtotal: 177, shipping: 0, total: 177 } };
    const read = sanitizeOrder(past);
    expect(read.items.map((item) => item.price)).toEqual([59, 59]);
    expect(read.items[0].name).toBe('Ancien nom');
    expect(read.totals.total).toBe(177);
  });

  it('renvoie null pour ce qui n’est pas une commande', () => {
    for (const raw of [null, undefined, 'DAG-222222', 42, [], {}]) expect(sanitizeOrder(raw)).toBeNull();
  });
});

describe('addWorkingDays', () => {
  it('saute samedi et dimanche', () => {
    // vendredi 13 novembre 2026
    expect(ymd(addWorkingDays(day(2026, 11, 13), 1))).toEqual([2026, 11, 16]);
    expect(ymd(addWorkingDays(day(2026, 11, 13), 5))).toEqual([2026, 11, 20]);
    expect(ymd(addWorkingDays(day(2026, 11, 13), 0))).toEqual([2026, 11, 13]);
  });

  it('ne tombe jamais un week-end', () => {
    for (let offset = 0; offset < 14; offset += 1) {
      for (let days = 1; days <= 7; days += 1) {
        const result = addWorkingDays(day(2026, 11, 1 + offset), days);
        expect([0, 6]).not.toContain(result.getDay());
      }
    }
  });
});

describe('estimateDelivery', () => {
  it('compte 3 et 5 jours ouvrés depuis un lundi', () => {
    const { earliest, latest } = estimateDelivery(day(2026, 11, 9));
    expect(ymd(earliest)).toEqual([2026, 11, 12]); // jeudi
    expect(ymd(latest)).toEqual([2026, 11, 16]); // lundi suivant
  });

  it('enjambe le week-end depuis un jeudi ou un vendredi', () => {
    expect(ymd(estimateDelivery(day(2026, 11, 12)).earliest)).toEqual([2026, 11, 17]); // jeudi → mardi
    const friday = estimateDelivery(day(2026, 11, 13));
    expect(ymd(friday.earliest)).toEqual([2026, 11, 18]); // mercredi
    expect(ymd(friday.latest)).toEqual([2026, 11, 20]); // vendredi
  });

  it('part du lundi pour une commande passée le week-end', () => {
    const saturday = estimateDelivery(day(2026, 11, 14));
    const sunday = estimateDelivery(day(2026, 11, 15));
    expect(ymd(saturday.earliest)).toEqual([2026, 11, 18]);
    expect(ymd(saturday.latest)).toEqual([2026, 11, 20]);
    expect(ymd(sunday.earliest)).toEqual([2026, 11, 18]);
    expect(ymd(sunday.latest)).toEqual([2026, 11, 20]);
  });

  it('passe le mois et l’année', () => {
    const { earliest, latest } = estimateDelivery(day(2026, 12, 29)); // mardi
    expect(ymd(earliest)).toEqual([2027, 1, 1]);
    expect(ymd(latest)).toEqual([2027, 1, 5]);
  });

  it('accepte une date ISO, comme celle d’une commande', () => {
    const created = order({}, { now: day(2026, 11, 9) });
    const { earliest, latest } = estimateDelivery(created.createdAt);
    expect(ymd(earliest)).toEqual([2026, 11, 12]);
    expect(ymd(latest)).toEqual([2026, 11, 16]);
    expect(earliest).toBeInstanceOf(Date);
    expect(latest.getTime()).toBeGreaterThan(earliest.getTime());
  });

  it('accepte un autre délai (livraison hors de France)', () => {
    const { earliest, latest } = estimateDelivery(day(2026, 11, 9), deliveryDelay('BE'));
    expect(ymd(earliest)).toEqual([2026, 11, 16]);
    expect(ymd(latest)).toEqual([2026, 11, 18]);
  });

  it('renvoie null pour une date invalide, sans lever d’erreur', () => {
    expect(estimateDelivery('pas une date')).toBeNull();
    expect(estimateDelivery(undefined)).toBeNull();
    expect(estimateDelivery(null)).toBeNull();
  });
});

describe('deliveryDelay', () => {
  it('annonce 3 à 5 jours ouvrés en France, 5 à 7 pour les autres pays livrés', () => {
    expect(deliveryDelay('FR')).toEqual({ minDays: 3, maxDays: 5 });
    expect(deliveryDelay('fr')).toEqual({ minDays: 3, maxDays: 5 });
    for (const country of ['BE', 'CH', 'LU']) expect(deliveryDelay(country)).toEqual({ minDays: 5, maxDays: 7 });
    expect(deliveryDelay(undefined)).toBe(DELIVERY_DELAYS.FR);
    expect(deliveryDelay('XX')).toBe(DELIVERY_DELAYS.FR);
  });
});
