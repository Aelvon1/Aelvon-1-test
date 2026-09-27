/**
 * Formatages français de l'interface (logique pure, testée sous Node) : nombres, durées,
 * pluriels, pourcentages, libellés d'instances, difficultés, valeurs de paramètres.
 */
import type { ParamSchema, ParamValue } from '../../objects/types';

/** Espace fine insécable (séparateur des milliers et avant « % » en typographie française). */
export const NARROW_NBSP = ' ';
/** Espace insécable. */
export const NBSP = ' ';

const integerFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Entier au format français (« 1 234 » avec espace fine insécable). */
export function formatInteger(value: number): string {
  return integerFormat.format(Math.round(value)).replace(/\s/g, NARROW_NBSP);
}

/** Nombre décimal français (virgule), `digits` décimales au plus, zéros finaux supprimés. */
export function formatDecimal(value: number, digits = 2): string {
  const factor = 10 ** digits;
  // Arrondi « au plus proche, moitié loin de zéro » (symétrique pour les négatifs).
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
  let text = rounded.toFixed(digits);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  const [int = '0', frac] = text.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const grouped = formatInteger(Math.abs(Number(int)));
  return `${sign}${grouped}${frac ? `,${frac}` : ''}`;
}

/**
 * Pluriel français : singulier pour 0 et 1 (« 0 pièce », « 1 pièce », « 2 pièces »).
 * `plural` par défaut : singulier + « s ».
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatInteger(count)}${NBSP}${Math.abs(count) < 2 ? singular : pluralForm}`;
}

/** Durée estimée en minutes : « 8 min », « 1 h », « 1 h 30 », « 12 h ». */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}${NBSP}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${String(m).padStart(2, '0')}`;
}

/** Pourcentage entier (« 45 % », espace fine insécable). */
export function formatPercent(ratio: number): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  return `${Math.round(clamped * 100)}${NARROW_NBSP}%`;
}

/** Quantité d'une pièce instanciée pour l'arborescence (« ×142 »), vide pour une pièce unique. */
export function formatQuantity(quantity: number): string {
  return quantity > 1 ? `×${formatInteger(quantity)}` : '';
}

/**
 * Libellé d'une instance sélectionnée : « Tôle n° 37/142 » quand le libellé se termine par un
 * numéro (convention « n° N »), sinon « Libellé (37/142) ». Sans quantité connue : le libellé seul.
 */
export function formatInstance(label: string, index: number, quantity: number): string {
  const position = index + 1;
  if (quantity <= 1) return label;
  const numbered = /n°\s*(\d+)\s*$/u.exec(label);
  if (numbered && Number(numbered[1]) === position) return `${label}/${formatInteger(quantity)}`;
  return `${label} (${formatInteger(position)}/${formatInteger(quantity)})`;
}

/** Libellés des niveaux de difficulté (1 à 5). */
export const DIFFICULTY_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Facile',
  2: 'Accessible',
  3: 'Intermédiaire',
  4: 'Avancé',
  5: 'Expert',
};

export function difficultyLabel(level: number): string {
  const l = Math.min(5, Math.max(1, Math.round(level))) as 1 | 2 | 3 | 4 | 5;
  return DIFFICULTY_LABELS[l];
}

/** Valeur d'un paramètre d'objet pour l'affichage (libellé d'option, unité, oui/non). */
export function formatParamValue(schema: ParamSchema, value: ParamValue | undefined): string {
  if (value === undefined) return '—';
  switch (schema.kind) {
    case 'boolean':
      return value === true ? 'Oui' : 'Non';
    case 'select': {
      const option = schema.options.find((o) => o.value === String(value));
      return option ? option.label : String(value);
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      const digits = decimalsOf(schema.step);
      const text = Number.isFinite(n) ? formatDecimal(n, digits) : String(value);
      return schema.unit ? `${text}${NBSP}${schema.unit}` : text;
    }
  }
}

/** Nombre de décimales significatives d'un pas (0.05 → 2, 10 → 0). */
export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  const text = String(step);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Durée en millisecondes pour le panneau de debug (« 16,7 ms »). */
export function formatMs(ms: number): string {
  return `${formatDecimal(ms, 1)}${NBSP}ms`;
}

/** Grand nombre compact (« 1,2 M », « 845 k ») pour les compteurs de debug. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${formatDecimal(value / 1e6, 2)}${NBSP}M`;
  if (abs >= 1e4) return `${formatDecimal(value / 1e3, 1)}${NBSP}k`;
  return formatInteger(value);
}
