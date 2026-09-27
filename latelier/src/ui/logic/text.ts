/**
 * Recherche textuelle insensible à la casse, aux accents et à la ponctuation (logique pure,
 * testée sous Node) : « moteur electrique » trouve « Moteur électrique », « oeil » trouve
 * « Œil », « ø28 » trouve « Ø 28 »…
 */

/** Ligatures et lettres sans décomposition Unicode, repliées vers leur équivalent ASCII. */
const SPECIAL_FOLDS: Record<string, string> = {
  œ: 'oe',
  æ: 'ae',
  ß: 'ss',
  ø: 'o',
  đ: 'd',
  ł: 'l',
  ı: 'i',
  '’': "'",
  '‘': "'",
  '`': "'",
  '´': "'",
};

/** Marques diacritiques combinantes (après décomposition NFD). */
const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Replie UN caractère : minuscules, sans accent, ligatures développées. Le résultat peut
 * compter 0, 1 ou 2 caractères (utilisé pour relier le texte replié au texte d'origine).
 */
export function foldChar(char: string): string {
  const lower = char.toLowerCase();
  const special = SPECIAL_FOLDS[lower];
  if (special !== undefined) return special;
  return lower.normalize('NFD').replace(COMBINING_MARKS, '');
}

/** Replie un texte caractère par caractère (voir `foldChar`), sans toucher à la ponctuation. */
export function foldText(text: string): string {
  let out = '';
  for (const char of text) out += foldChar(char);
  return out;
}

/**
 * Normalise un texte pour la comparaison : repli (`foldText`), toute suite de caractères qui
 * n'est ni lettre ni chiffre devient une espace simple, espaces de bord supprimées.
 */
export function normalizeText(text: string): string {
  return foldText(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Mots d'une requête normalisée (vide si la requête ne contient que des espaces). */
export function queryTokens(query: string): string[] {
  const normalized = normalizeText(query);
  return normalized ? normalized.split(' ') : [];
}

/**
 * Vrai si TOUS les mots de la requête figurent dans le texte (déjà normalisé), en sous-chaîne.
 * Les chiffres collés aux lettres sont aussi cherchés sans l'espace (« o28 » ≈ « o 28 »).
 */
export function matchesTokens(normalizedHaystack: string, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const compact = normalizedHaystack.replace(/ /g, '');
  return tokens.every((t) => normalizedHaystack.includes(t) || compact.includes(t));
}

/** Plage [début, fin[ dans le texte d'ORIGINE. */
export interface TextRange {
  start: number;
  end: number;
}

/**
 * Plages du texte d'origine correspondant aux mots de la requête (surlignage des résultats).
 * La correspondance se fait sur le texte replié ; chaque caractère replié est relié à son
 * caractère d'origine, ce qui gère les accents et les ligatures (« Œ » → « oe »).
 */
export function highlightRanges(text: string, query: string): TextRange[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0 || !text) return [];
  // Texte replié + index d'origine de chaque caractère replié.
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const f = foldChar(char);
    for (let k = 0; k < f.length; k++) origin.push(index);
    folded += f;
    index += char.length;
  }
  const marked = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    let from = 0;
    while (from <= folded.length - token.length) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      const start = origin[at]!;
      const lastOrigin = origin[at + token.length - 1]!;
      // Fin : caractère d'origine suivant (gère les paires de substitution).
      const end = lastOrigin + (text.codePointAt(lastOrigin)! > 0xffff ? 2 : 1);
      for (let i = start; i < end; i++) marked[i] = true;
      from = at + token.length;
    }
  }
  const ranges: TextRange[] = [];
  for (let i = 0; i < marked.length; i++) {
    if (!marked[i]) continue;
    const start = i;
    while (i < marked.length && marked[i]) i++;
    ranges.push({ start, end: i });
  }
  return ranges;
}

/** Découpe un texte en segments (surlignés ou non) selon des plages triées et disjointes. */
export function splitByRanges(
  text: string,
  ranges: readonly TextRange[],
): { text: string; highlighted: boolean }[] {
  const out: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) out.push({ text: text.slice(cursor, r.start), highlighted: false });
    out.push({ text: text.slice(r.start, r.end), highlighted: true });
    cursor = r.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), highlighted: false });
  return out;
}
