import { describe, expect, it } from 'vitest';
import { BUCKLES, DEFAULT_BELT, HERO_BELT } from '../../data/atelier';
import { ATELIER_PARAMS, atelierPath } from '../../lib/atelier-url';
import { ATELIER_BASE_PRICE, MONOGRAM_PRICE, atelierPrice } from '../../lib/pricing';
import {
  DRAFT_KEY,
  cleanConfig,
  isDefaultLook,
  nbspUnits,
  priceLines,
  readDraft,
  resolveInitialState,
  sameLook,
  saveDraft,
  viewForEdit,
  withBeltParams,
} from './atelier-state';

/** Stockage en mémoire, avec la même interface que localStorage. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    dump: () => Object.fromEntries(data),
  };
}

const brokenStorage = {
  getItem() {
    throw new Error('lecture refusée');
  },
  setItem() {
    throw new Error('quota dépassé');
  },
};

const searchOf = (path) => path.slice(path.indexOf('?'));
const BORDEAUX = { leather: 'bordeaux', finish: 'graine', buckle: 'laiton', stitch: 'or', width: 30, monogram: 'AB', monogramStyle: 'or' };

describe('cleanConfig', () => {
  it('complète, nettoie le monogramme et retire l’envers', () => {
    expect(cleanConfig({ leather: 'navy', monogram: 'é-b!', lining: 'marron' })).toEqual({
      ...DEFAULT_BELT,
      leather: 'navy',
      monogram: 'EB',
      lining: null,
    });
  });

  it('retombe sur la ceinture par défaut pour une entrée vide ou inconnue', () => {
    expect(cleanConfig(undefined)).toEqual({ ...DEFAULT_BELT });
    expect(cleanConfig({ leather: 'licorne', width: 99 })).toEqual({ ...DEFAULT_BELT });
  });
});

describe('sameLook', () => {
  it('ignore le monogramme', () => {
    expect(sameLook(DEFAULT_BELT, { ...DEFAULT_BELT, monogram: 'DAG', monogramStyle: 'or' })).toBe(true);
    expect(isDefaultLook({ ...DEFAULT_BELT, monogram: 'X' })).toBe(true);
  });

  it('distingue chaque choix de fabrication', () => {
    for (const patch of [{ leather: 'noir' }, { finish: 'mat' }, { buckle: 'poli' }, { stitch: 'ecru' }, { width: 30 }]) {
      expect(sameLook(DEFAULT_BELT, { ...DEFAULT_BELT, ...patch })).toBe(false);
    }
  });
});

describe('brouillon', () => {
  it('enregistre puis relit la composition, la taille et la surface', () => {
    const storage = memoryStorage();
    expect(saveDraft(storage, { config: BORDEAUX, size: '95', surface: 'ivoire' })).toBe(true);
    expect(readDraft(storage)).toEqual({ config: cleanConfig(BORDEAUX), size: '95', surface: 'ivoire', hintSeen: false });
  });

  it('complète le brouillon sans effacer le reste', () => {
    const storage = memoryStorage();
    saveDraft(storage, { config: BORDEAUX, size: '100' });
    saveDraft(storage, { hintSeen: true });
    expect(readDraft(storage)).toMatchObject({ config: cleanConfig(BORDEAUX), size: '100', hintSeen: true });
  });

  it('écarte un contenu abîmé', () => {
    const empty = { config: null, size: null, surface: null, hintSeen: false };
    expect(readDraft(memoryStorage({ [DRAFT_KEY]: '{oups' }))).toEqual(empty);
    expect(readDraft(memoryStorage({ [DRAFT_KEY]: '[1,2]' }))).toEqual(empty);
    expect(readDraft(memoryStorage({ [DRAFT_KEY]: '"texte"' }))).toEqual(empty);
    expect(readDraft(null)).toEqual(empty);
  });

  it('assainit chaque champ', () => {
    const storage = memoryStorage({
      [DRAFT_KEY]: JSON.stringify({ config: { leather: 'licorne', buckle: 'poli', monogram: 'trop-long' }, size: '93', surface: 'rose', hintSeen: 'oui' }),
    });
    expect(readDraft(storage)).toEqual({
      config: { ...DEFAULT_BELT, buckle: 'poli', monogram: 'TRO' },
      size: null,
      surface: null,
      hintSeen: false,
    });
  });

  it('ne lève jamais d’erreur quand le stockage refuse', () => {
    expect(readDraft(brokenStorage)).toEqual({ config: null, size: null, surface: null, hintSeen: false });
    expect(saveDraft(brokenStorage, { size: '95' })).toBe(false);
    expect(saveDraft(null, { size: '95' })).toBe(false);
  });
});

describe('resolveInitialState', () => {
  const draft = { config: cleanConfig(BORDEAUX), size: '95', surface: 'ivoire', hintSeen: true };

  it('ouvre la ceinture par défaut sans URL ni brouillon', () => {
    expect(resolveInitialState('')).toEqual({
      config: { ...DEFAULT_BELT },
      size: null,
      surface: 'noir',
      hintSeen: false,
      source: 'default',
    });
  });

  it('reprend le brouillon quand l’URL ne dit rien', () => {
    expect(resolveInitialState('', draft)).toEqual({ ...draft, source: 'draft' });
  });

  it('donne la priorité à l’URL : le reste revient aux valeurs par défaut', () => {
    const state = resolveInitialState(searchOf(atelierPath({ leather: 'bordeaux' })), {
      ...draft,
      config: cleanConfig({ leather: 'noir', buckle: 'laiton', monogram: 'ZZ' }),
    });
    expect(state.source).toBe('url');
    expect(state.config).toEqual({ ...DEFAULT_BELT, leather: 'bordeaux' });
    expect(state.size).toBeNull();
    expect(state.surface).toBe('ivoire');
  });

  it('accepte un seul paramètre', () => {
    expect(resolveInitialState('?cuir=bordeaux').config).toEqual({ ...DEFAULT_BELT, leather: 'bordeaux' });
  });

  it('reprend la taille du brouillon quand l’URL décrit la même ceinture (rechargement)', () => {
    const state = resolveInitialState(withBeltParams('', BORDEAUX), draft);
    expect(state.source).toBe('url');
    expect(state.config).toEqual(draft.config);
    expect(state.size).toBe('95');
  });

  it('lit la taille portée par un lien', () => {
    expect(resolveInitialState(searchOf(atelierPath(HERO_BELT, '100')), draft).size).toBe('100');
    expect(resolveInitialState(`?${ATELIER_PARAMS.size}=105`, draft)).toMatchObject({ source: 'draft', size: '105' });
    expect(resolveInitialState(`?${ATELIER_PARAMS.size}=105`)).toMatchObject({ source: 'default', size: '105' });
  });

  it('ignore des paramètres abîmés et garde ce qui est valide', () => {
    expect(resolveInitialState('?cuir=licorne&largeur=99&taille=93', draft)).toEqual({ ...draft, source: 'draft' });
    expect(resolveInitialState('?cuir=licorne&largeur=99&mono=%00')).toMatchObject({ source: 'default', config: { ...DEFAULT_BELT } });
    const mixed = resolveInitialState('?cuir=foret&boucle=plastique&mono=a%20b%C3%A9cd');
    expect(mixed.config).toEqual({ ...DEFAULT_BELT, leather: 'foret', monogram: 'ABE' });
  });
});

describe('withBeltParams', () => {
  it('écrit la ceinture et conserve les paramètres étrangers', () => {
    const next = withBeltParams('?utm_source=lettre&cuir=noir&taille=95&mono=XY&style=or', { leather: 'tan', width: 38 });
    expect(next.toString()).toBe('utm_source=lettre&cuir=tan&finition=lisse&boucle=brosse&couture=ton&largeur=38');
  });

  it('n’écrit le monogramme que s’il existe, jamais la taille', () => {
    const next = withBeltParams('', BORDEAUX);
    expect(next.get(ATELIER_PARAMS.monogram)).toBe('AB');
    expect(next.get(ATELIER_PARAMS.monogramStyle)).toBe('or');
    expect(next.has(ATELIER_PARAMS.size)).toBe(false);
    expect(`/atelier?${next}`).toBe(atelierPath(BORDEAUX));
  });

  it('ne modifie pas les paramètres reçus', () => {
    const current = new URLSearchParams('cuir=noir');
    withBeltParams(current, { leather: 'tan' });
    expect(current.toString()).toBe('cuir=noir');
  });
});

describe('viewForEdit', () => {
  it('cadre la partie modifiée', () => {
    expect(viewForEdit('leather', DEFAULT_BELT)).toBe('cuir');
    expect(viewForEdit('finish', DEFAULT_BELT)).toBe('cuir');
    expect(viewForEdit('buckle', DEFAULT_BELT)).toBe('boucle');
    expect(viewForEdit('stitch', DEFAULT_BELT)).toBe('couture');
    expect(viewForEdit('width', DEFAULT_BELT)).toBe('full');
    expect(viewForEdit('autre', DEFAULT_BELT)).toBe('full');
  });

  it('ne cadre le monogramme que s’il y en a un', () => {
    expect(viewForEdit('monogram', { ...DEFAULT_BELT, monogram: 'D' })).toBe('monogramme');
    expect(viewForEdit('monogramStyle', HERO_BELT)).toBe('monogramme');
    expect(viewForEdit('monogram', DEFAULT_BELT)).toBe('full');
  });
});

describe('priceLines', () => {
  it('ne montre que la base pour la ceinture par défaut', () => {
    expect(priceLines(DEFAULT_BELT)).toEqual([{ id: 'base', label: 'Ceinture sur-mesure', amount: ATELIER_BASE_PRICE }]);
  });

  it('détaille le supplément de boucle et le monogramme', () => {
    const lines = priceLines(HERO_BELT);
    expect(lines.map((line) => line.id)).toEqual(['base', 'buckle', 'monogram']);
    expect(lines[1]).toEqual({ id: 'buckle', label: 'Boucle laiton doré', amount: 15 });
    expect(lines[2]).toEqual({ id: 'monogram', label: 'Monogramme DAG', amount: MONOGRAM_PRICE });
  });

  it('a toujours pour somme le prix de l’Atelier', () => {
    for (const buckle of BUCKLES) {
      for (const monogram of ['', 'AB']) {
        const config = { ...DEFAULT_BELT, buckle: buckle.id, monogram };
        const sum = priceLines(config).reduce((total, line) => total + line.amount, 0);
        expect(sum).toBe(atelierPrice(config));
      }
    }
  });
});

describe('nbspUnits', () => {
  it('lie le nombre à son unité', () => {
    expect(nbspUnits('couture écru · 35 mm · 95 cm')).toBe('couture écru · 35\xa0mm · 95\xa0cm');
    expect(nbspUnits('3 mmol')).toBe('3 mmol');
    expect(nbspUnits(null)).toBe('');
  });
});
