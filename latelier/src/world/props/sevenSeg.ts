/**
 * Codage des afficheurs 7 segments (alimentation, station à air chaud, multimètre).
 *
 * Bits des segments (convention usuelle) : a = 1 (haut), b = 2 (haut droit), c = 4 (bas
 * droit), d = 8 (bas), e = 16 (bas gauche), f = 32 (haut gauche), g = 64 (milieu). Le shader
 * TSL lit les codes (0..127) dans des uniformes et extrait chaque bit. Module PUR (tests).
 */

export const SEGMENT_BITS = { a: 1, b: 2, c: 4, d: 8, e: 16, f: 32, g: 64 } as const;

/** Codes des caractères affichables. */
export const GLYPHS: Readonly<Record<string, number>> = {
  '0': 0b0111111,
  '1': 0b0000110,
  '2': 0b1011011,
  '3': 0b1001111,
  '4': 0b1100110,
  '5': 0b1101101,
  '6': 0b1111101,
  '7': 0b0000111,
  '8': 0b1111111,
  '9': 0b1101111,
  '-': 0b1000000,
  ' ': 0,
  E: 0b1111001,
  r: 0b1010000,
  H: 0b1110110,
  L: 0b0111000,
  o: 0b1011100,
};

/** Résultat d'un formatage : un code par chiffre (gauche → droite) et position du point. */
export interface DisplayCodes {
  codes: number[];
  /** Indice du chiffre portant le point décimal (−1 : aucun). */
  dp: number;
}

/**
 * Formate une valeur sur `digits` chiffres avec `decimals` décimales, alignée à droite, zéros
 * non significatifs éteints (sauf celui des unités). Dépassement → « -- ».
 */
export function formatDisplay(value: number, digits: number, decimals: number): DisplayCodes {
  const scaled = Math.round(Math.abs(value) * 10 ** decimals);
  const negative = value < 0 && scaled !== 0;
  const text = String(scaled).padStart(decimals + 1, '0');
  const available = digits - (negative ? 1 : 0);
  if (text.length > available) {
    return { codes: new Array<number>(digits).fill(GLYPHS['-']!), dp: -1 };
  }
  const padded = (negative ? '-' : '') + text;
  const chars = padded.padStart(digits, ' ').split('');
  const codes = chars.map((c) => GLYPHS[c] ?? 0);
  const dp = decimals > 0 ? digits - 1 - decimals : -1;
  return { codes, dp };
}

/** Code d'un texte court (ex. « Err », « HI »), aligné à gauche. */
export function formatText(text: string, digits: number): DisplayCodes {
  const codes: number[] = [];
  for (let i = 0; i < digits; i++) codes.push(GLYPHS[text[i] ?? ' '] ?? 0);
  return { codes, dp: -1 };
}

/** Vrai si le segment `bit` est allumé dans `code`. */
export function segmentOn(code: number, bit: number): boolean {
  return (Math.floor(code / bit) & 1) === 1;
}
