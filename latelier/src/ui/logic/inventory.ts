/**
 * Filtrage et tri des fiches de l'inventaire (logique pure, testée sous Node).
 *
 * Recherche insensible aux accents dans le nom, la catégorie, les mots-clés et la description ;
 * tous les mots de la requête doivent être trouvés. Pertinence : nom > catégorie/mots-clés >
 * description ; à pertinence égale, l'ordre du catalogue (catégorie puis nom) est conservé.
 */
import type { CatalogEntry } from '../../core/store';
import { matchesTokens, normalizeText, queryTokens } from './text';

/** Textes normalisés d'une fiche (calculés une fois par catalogue). */
export interface SearchIndexEntry {
  entry: CatalogEntry;
  name: string;
  category: string;
  keywords: string;
  description: string;
  all: string;
}

export function buildSearchIndex(catalog: readonly CatalogEntry[]): SearchIndexEntry[] {
  return catalog.map((entry) => {
    const name = normalizeText(entry.name);
    const category = normalizeText(entry.category);
    const keywords = normalizeText(entry.keywords.join(' '));
    const description = normalizeText(entry.description);
    return { entry, name, category, keywords, description, all: `${name} ${category} ${keywords} ${description}` };
  });
}

/** Pertinence d'une fiche pour des mots de requête (0 = aucune correspondance). */
export function relevance(item: SearchIndexEntry, tokens: readonly string[]): number {
  if (tokens.length === 0) return 1;
  if (!matchesTokens(item.all, tokens)) return 0;
  let score = 0;
  for (const token of tokens) {
    if (item.name.startsWith(token) || item.name.includes(` ${token}`)) score += 6;
    else if (item.name.includes(token)) score += 4;
    else if (item.category.includes(token)) score += 3;
    else if (item.keywords.includes(token)) score += 2;
    else score += 1;
  }
  return score;
}

/**
 * Fiches correspondant à la requête et à la catégorie (`null` = toutes), triées par pertinence
 * décroissante (tri stable : l'ordre du catalogue départage).
 */
export function filterCatalog(
  index: readonly SearchIndexEntry[],
  query: string,
  category: string | null,
): CatalogEntry[] {
  const tokens = queryTokens(query);
  const scored: { entry: CatalogEntry; score: number; order: number }[] = [];
  index.forEach((item, order) => {
    if (category !== null && item.entry.category !== category) return;
    const score = relevance(item, tokens);
    if (score > 0) scored.push({ entry: item.entry, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.entry);
}

/** Catégories présentes dans le catalogue avec leur nombre d'objets, triées (français). */
export function catalogCategories(catalog: readonly CatalogEntry[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of catalog) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Déplacement du focus dans une grille de `count` éléments sur `columns` colonnes (navigation
 * clavier de l'inventaire). Retourne le nouvel index (borné) ou null si la touche est ignorée.
 */
export function gridMove(index: number, count: number, columns: number, key: string): number | null {
  if (count <= 0) return null;
  const cols = Math.max(1, columns);
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case 'ArrowRight':
      return clamp(index + 1);
    case 'ArrowLeft':
      return clamp(index - 1);
    case 'ArrowDown':
      return index + cols < count ? index + cols : index;
    case 'ArrowUp':
      return index - cols >= 0 ? index - cols : index;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'PageDown':
      return clamp(index + cols * 3);
    case 'PageUp':
      return clamp(index - cols * 3);
    default:
      return null;
  }
}
