/**
 * Interface : recherche insensible aux accents et filtrage de l'inventaire (logique pure).
 */
import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../src/core/store';
import {
  foldText,
  highlightRanges,
  matchesTokens,
  normalizeText,
  queryTokens,
  splitByRanges,
} from '../src/ui/logic/text';
import { buildSearchIndex, catalogCategories, filterCatalog, gridMove } from '../src/ui/logic/inventory';

const entry = (over: Partial<CatalogEntry> & { id: string; name: string }): CatalogEntry => ({
  category: 'Divers',
  difficulty: 2,
  estimatedMinutes: 30,
  description: '',
  keywords: [],
  partCount: 10,
  stepCount: 4,
  ...over,
});

const CATALOG: CatalogEntry[] = [
  entry({
    id: 'uno',
    name: 'Carte de développement ATELIER-328',
    category: 'Électronique',
    keywords: ['arduino', 'microcontrôleur', 'soudure'],
    description: 'Carte microcontrôleur : dessoudez chaque composant.',
  }),
  entry({
    id: 'bldc',
    name: 'Moteur brushless inrunner',
    category: 'Moteurs',
    keywords: ['bobinage', 'aimants', 'roulements'],
    description: 'Moteur électrique sans balais à rotor intérieur.',
  }),
  entry({
    id: 'fan',
    name: 'Ventilateur de bureau',
    category: 'Électroménager',
    keywords: ['moteur à bague de déphasage'],
    description: 'Hélice, grille et moteur.',
  }),
  entry({ id: 'oeil', name: 'Œilleton de porte', category: 'Quincaillerie', description: 'Lentille grand angle.' }),
];

describe('normalisation du texte', () => {
  it('retire accents, majuscules, ligatures et ponctuation', () => {
    expect(normalizeText('Électronique')).toBe('electronique');
    expect(normalizeText('  Œilleton — Ø 28 × 48 mm ')).toBe('oeilleton o 28 48 mm');
    expect(normalizeText('Déphasage/Bague')).toBe('dephasage bague');
    expect(foldText('ÇÀÉÈÊËÎÏÔÛÙÜŸ')).toBe('caeeeeiiouuuy');
  });

  it('découpe la requête en mots', () => {
    expect(queryTokens('  moteur   ELECTRIQUE ')).toEqual(['moteur', 'electrique']);
    expect(queryTokens('   ')).toEqual([]);
  });

  it('exige tous les mots, en sous-chaîne, y compris sans espace entre lettres et chiffres', () => {
    const hay = normalizeText('Moteur 3650 (Ø 36 × 50 mm)');
    expect(matchesTokens(hay, ['mot', '3650'])).toBe(true);
    expect(matchesTokens(hay, ['o36'])).toBe(true);
    expect(matchesTokens(hay, ['moteur', 'pompe'])).toBe(false);
    expect(matchesTokens(hay, [])).toBe(true);
  });
});

describe('surlignage', () => {
  it('retrouve les plages dans le texte d’origine malgré les accents', () => {
    const text = 'Carte électronique';
    const ranges = highlightRanges(text, 'electro');
    expect(ranges).toEqual([{ start: 6, end: 13 }]);
    expect(text.slice(6, 13)).toBe('électro');
  });

  it('gère les ligatures (« oe » dans « Œil ») et plusieurs mots', () => {
    const text = 'Œilleton de porte';
    expect(highlightRanges(text, 'oeil')).toEqual([{ start: 0, end: 3 }]);
    const segs = splitByRanges(text, highlightRanges(text, 'porte oeil'));
    expect(segs.filter((s) => s.highlighted).map((s) => s.text)).toEqual(['Œil', 'porte']);
    expect(segs.map((s) => s.text).join('')).toBe(text);
  });

  it('ne surligne rien pour une requête vide', () => {
    expect(highlightRanges('Moteur', '  ')).toEqual([]);
  });
});

describe('filtrage de l’inventaire', () => {
  const index = buildSearchIndex(CATALOG);

  it('sans requête ni catégorie : tout, dans l’ordre du catalogue', () => {
    expect(filterCatalog(index, '', null).map((e) => e.id)).toEqual(['uno', 'bldc', 'fan', 'oeil']);
  });

  it('cherche dans le nom, la catégorie, les mots-clés et la description, sans accents', () => {
    expect(filterCatalog(index, 'electronique', null).map((e) => e.id)).toEqual(['uno']);
    expect(filterCatalog(index, 'ARDUINO', null).map((e) => e.id)).toEqual(['uno']);
    expect(filterCatalog(index, 'balais', null).map((e) => e.id)).toEqual(['bldc']);
    expect(filterCatalog(index, 'oeilleton', null).map((e) => e.id)).toEqual(['oeil']);
    expect(filterCatalog(index, 'microcontroleur', null).map((e) => e.id)).toEqual(['uno']);
  });

  it('classe les correspondances du nom avant celles de la description', () => {
    // « moteur » : nom de bldc, mot-clé et description de fan.
    expect(filterCatalog(index, 'moteur', null).map((e) => e.id)).toEqual(['bldc', 'fan']);
  });

  it('combine requête et catégorie', () => {
    expect(filterCatalog(index, 'moteur', 'Électroménager').map((e) => e.id)).toEqual(['fan']);
    expect(filterCatalog(index, '', 'Moteurs').map((e) => e.id)).toEqual(['bldc']);
    expect(filterCatalog(index, 'arduino', 'Moteurs')).toEqual([]);
  });

  it('liste les catégories triées avec leurs effectifs', () => {
    expect(catalogCategories(CATALOG)).toEqual([
      { name: 'Électroménager', count: 1 },
      { name: 'Électronique', count: 1 },
      { name: 'Moteurs', count: 1 },
      { name: 'Quincaillerie', count: 1 },
    ]);
  });
});

describe('navigation clavier dans la grille', () => {
  it('se déplace par cases et par lignes, bornée', () => {
    // 10 fiches sur 4 colonnes.
    expect(gridMove(0, 10, 4, 'ArrowRight')).toBe(1);
    expect(gridMove(0, 10, 4, 'ArrowLeft')).toBe(0);
    expect(gridMove(1, 10, 4, 'ArrowDown')).toBe(5);
    expect(gridMove(7, 10, 4, 'ArrowDown')).toBe(7);
    expect(gridMove(5, 10, 4, 'ArrowUp')).toBe(1);
    expect(gridMove(2, 10, 4, 'ArrowUp')).toBe(2);
    expect(gridMove(3, 10, 4, 'End')).toBe(9);
    expect(gridMove(9, 10, 4, 'Home')).toBe(0);
    expect(gridMove(0, 10, 4, 'PageDown')).toBe(9);
    expect(gridMove(0, 10, 4, 'a')).toBeNull();
    expect(gridMove(0, 0, 4, 'ArrowRight')).toBeNull();
  });
});
