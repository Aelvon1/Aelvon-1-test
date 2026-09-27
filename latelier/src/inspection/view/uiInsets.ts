/**
 * Encarts de l'écran recouverts par l'interface d'inspection (panneaux, barre, frise), publiés
 * par l'interface en variables CSS EN LIGNE sur `<html>` : `--inspection-inset-left|top|right|
 * bottom` (px). Lecture directe du style en ligne : aucun recalcul de style, appel possible à
 * chaque image.
 */
import type { ScreenInsets } from '../camera/types';

const NAMES = [
  '--inspection-inset-left',
  '--inspection-inset-top',
  '--inspection-inset-right',
  '--inspection-inset-bottom',
] as const;

/**
 * Lit les encarts publiés dans `out` (valeur absente = 0). Faux si l'interface n'en publie
 * aucun (hors inspection, interface non montée, tests sous Node).
 */
export function readUiInsets(out: ScreenInsets): boolean {
  if (typeof document === 'undefined') return false;
  const style = document.documentElement.style;
  let found = false;
  for (let i = 0; i < NAMES.length; i++) {
    const value = parseFloat(style.getPropertyValue(NAMES[i]!));
    const px = Number.isFinite(value) ? value : 0;
    if (Number.isFinite(value)) found = true;
    if (i === 0) out.left = px;
    else if (i === 1) out.top = px;
    else if (i === 2) out.right = px;
    else out.bottom = px;
  }
  return found;
}

/** Deux jeux d'encarts identiques ? */
export function sameInsets(a: ScreenInsets, b: ScreenInsets): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}
