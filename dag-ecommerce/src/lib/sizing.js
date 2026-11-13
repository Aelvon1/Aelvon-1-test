// Guide des tailles DAG.
// Règle maison : tour de taille (là où se porte le pantalon) + 15 cm,
// arrondi à la taille disponible la plus proche (pas de 5 cm).
import { SIZES } from '../data/atelier';

export const SIZE_ALLOWANCE_CM = 15;
export const WAIST_MIN_CM = 60;
export const WAIST_MAX_CM = 115;

/** Correspondance indicative taille de pantalon FR → tour de taille (cm). */
export const TROUSER_SIZES_FR = [
  { fr: '36', waist: 72 },
  { fr: '38', waist: 76 },
  { fr: '40', waist: 80 },
  { fr: '42', waist: 84 },
  { fr: '44', waist: 88 },
  { fr: '46', waist: 92 },
  { fr: '48', waist: 96 },
  { fr: '50', waist: 100 },
  { fr: '52', waist: 104 },
];

export const inchesToCm = (inches) => Math.round(Number(inches) * 2.54);

/**
 * Taille de ceinture recommandée pour un tour de taille en cm.
 * @param {number} waistCm
 * @param {string[]} [available] tailles proposées pour le modèle (défaut : toutes)
 * @returns {{ size: string, ideal: number, exact: boolean, outOfRange: boolean } | null}
 *   size : taille conseillée · ideal : longueur idéale avant arrondi ·
 *   exact : la taille idéale existe · outOfRange : hors de la gamme disponible
 */
export function recommendSize(waistCm, available = SIZES) {
  const waist = Number(waistCm);
  if (!Number.isFinite(waist) || waist < WAIST_MIN_CM || waist > WAIST_MAX_CM || !available?.length) return null;
  const sizes = available.map(Number).sort((a, b) => a - b);
  const ideal = waist + SIZE_ALLOWANCE_CM;
  // à égalité de distance, on conseille la taille au-dessus (plus confortable)
  const nearest = sizes.reduce((best, s) => (Math.abs(s - ideal) <= Math.abs(best - ideal) ? s : best), sizes[0]);
  const outOfRange = ideal < sizes[0] - 2.5 || ideal > sizes[sizes.length - 1] + 2.5;
  return { size: String(nearest), ideal, exact: nearest === ideal, outOfRange };
}

/** Tableau de correspondance complet (tour de taille → taille DAG) pour l'affichage. */
export function sizeChart(available = SIZES) {
  return available.map((size) => {
    const length = Number(size);
    return {
      size: String(size),
      waistMin: length - SIZE_ALLOWANCE_CM - 2,
      waistMax: length - SIZE_ALLOWANCE_CM + 2,
      trouserFr: TROUSER_SIZES_FR.filter((t) => Math.abs(t.waist + SIZE_ALLOWANCE_CM - length) <= 2).map((t) => t.fr),
    };
  });
}
