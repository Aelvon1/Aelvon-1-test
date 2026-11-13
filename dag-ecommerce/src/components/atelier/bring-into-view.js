import { scrollToTarget } from '../../hooks';

/**
 * Amène `element` dans la zone réellement visible du panneau de l'Atelier : sous la scène
 * collante (mobile) ou l'en-tête (bureau), au-dessus du pied collant. Ne fait rien s'il y est déjà.
 * @param {Element|null} element
 */
export function bringIntoView(element) {
  if (!element) return;
  const stage = document.querySelector('[data-atelier-stage]')?.getBoundingClientRect();
  const header = document.querySelector('header')?.getBoundingClientRect();
  const bar = document.querySelector('[data-atelier-bar]')?.getBoundingClientRect();
  // scène au-dessus du panneau (une colonne) : elle masque le haut de l'écran ; sinon seul l'en-tête compte
  const stacked = stage != null && stage.width >= window.innerWidth - 1;
  const top = stacked ? stage.bottom : Math.max(0, header?.bottom ?? 0);
  const bottom = Math.min(window.innerHeight, bar?.top ?? window.innerHeight);
  const rect = element.getBoundingClientRect();
  if (rect.top < top + 12 || rect.bottom > bottom - 12) scrollToTarget(window.scrollY + rect.top - top - 28);
}
