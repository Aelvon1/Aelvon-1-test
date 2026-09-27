/**
 * Animation d'une planche de sprites en grille par CSS `steps()` (logique pure, testée sous Node).
 *
 * Deux animations imbriquées synchronisées : les colonnes défilent (steps(colonnes)) pendant
 * `period / lignes`, les lignes défilent (steps(lignes)) pendant `period`. Les deux démarrent
 * ensemble et restent en phase (même ligne de temps du document).
 */
import type { Thumbnail } from '../../core/store';

export interface SpriteAnimation {
  columns: number;
  /** Lignes animées (lignes complètes uniquement). */
  rows: number;
  /** Lignes de la planche (dimensionnement de l'image). */
  sheetRows: number;
  /** Vues effectivement montrées. */
  frames: number;
  /** Durée d'un tour complet (s) et d'une ligne (s). */
  period: number;
  rowPeriod: number;
  /** Décalage vertical final (fraction de la hauteur de planche) pour la dernière ligne animée. */
  rowTravel: number;
}

/**
 * Paramètres d'animation. Approximation : si la dernière ligne de la planche est incomplète,
 * elle est ignorée (le tour saute alors les dernières vues) — la planche du moteur (24 vues en
 * 6 × 4) est toujours complète.
 */
export function spriteAnimation(thumb: Pick<Thumbnail, 'frames' | 'columns'>, secondsPerFrame: number): SpriteAnimation {
  const columns = Math.max(1, Math.min(thumb.columns, thumb.frames));
  const sheetRows = Math.max(1, Math.ceil(thumb.frames / columns));
  const rows = thumb.frames % columns === 0 ? sheetRows : Math.max(1, Math.floor(thumb.frames / columns));
  const frames = rows * columns;
  const period = Math.max(0.1, frames * secondsPerFrame);
  return {
    columns,
    rows,
    sheetRows,
    frames,
    period,
    rowPeriod: period / rows,
    rowTravel: rows / sheetRows,
  };
}

/** Position (colonne, ligne) de la vue affichée au temps `t` (s) : même calcul que le CSS. */
export function spriteFrameAt(anim: SpriteAnimation, t: number): { column: number; row: number } {
  const u = (((t % anim.period) + anim.period) % anim.period) / anim.period;
  const row = Math.min(anim.rows - 1, Math.floor(u * anim.rows));
  const v = (((t % anim.rowPeriod) + anim.rowPeriod) % anim.rowPeriod) / anim.rowPeriod;
  const column = Math.min(anim.columns - 1, Math.floor(v * anim.columns));
  return { column, row };
}
