/**
 * Icônes SVG des outils du catalogue : pictogrammes d'atelier 24 × 24, trait `currentColor`
 * (même style que l'icône de repli du registre : trait 1,7, extrémités arrondies). Dessins
 * originaux, sans marque ni logo.
 */
import type { ToolId } from './ids';

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Clé en L dessinée comme une barre (largeur `w` selon la taille). */
function hexKeyIcon(w: number): string {
  const x = 6.5;
  const y = 3.5;
  const R = 4.5;
  const r = Math.max(0.6, R - w);
  const f = (n: number) => Number(n.toFixed(2));
  return svg(
    `<path d="M${x} 21.5V${f(y + R)}A${R} ${R} 0 0 1 ${f(x + R)} ${y}H19V${f(y + w)}H${f(x + w + r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + w)} ${f(y + w + r)}V21.5Z"/>` +
      `<path d="M${f(x + w / 2)} 19.6v1.2" stroke-width="1.2"/>`,
  );
}

/** Tournevis vertical incliné à 45° : `tip` = dessin de la pointe. */
function screwdriverIcon(tip: string, slim = false): string {
  const handle = slim
    ? '<rect x="10.2" y="1.5" width="3.6" height="10.5" rx="1.2"/><path d="M10.2 4h3.6M11.4 5.8v4.6M12.6 5.8v4.6" stroke-width="1.1"/>'
    : '<rect x="9" y="1.5" width="6" height="9" rx="2.2"/><path d="M11 3.8v4.6M13 3.8v4.6" stroke-width="1.2"/><path d="M10.4 10.5h3.2v1.8h-3.2z"/>';
  const shaftTop = slim ? 12 : 12.3;
  return svg(`<g transform="rotate(45 12 12)">${handle}<path d="M12 ${shaftTop}V19.3"/>${tip}</g>`);
}

const PLIERS_HANDLES =
  '<circle cx="12" cy="11" r="1.5"/>' +
  '<path d="M11 12.3C9.6 15.4 8.2 18.4 7.2 21.5M13 12.3c1.4 3.1 2.8 6.1 3.8 9.2"/>' +
  '<path d="M9.3 16.2c-.8 1.9-1.5 3.7-2.1 5.3M14.7 16.2c.8 1.9 1.5 3.7 2.1 5.3" stroke-width="3.2"/>';

export const TOOL_ICONS: Record<ToolId, string> = {
  'hex-key-1.5': hexKeyIcon(2.6),
  'hex-key-2': hexKeyIcon(3.1),
  'hex-key-2.5': hexKeyIcon(3.7),
  'screwdriver-phillips': screwdriverIcon(
    '<path d="M10.8 19.3 12 22.3l1.2-3"/><path d="M11.3 20.4h1.4" stroke-width="1"/>',
  ),
  'screwdriver-flat': screwdriverIcon('<path d="M10.9 19.3l.4 2.9h1.4l.4-2.9"/>'),
  'screwdriver-precision': screwdriverIcon('<path d="M11.4 19.3 12 21.6l.6-2.3"/>', true),
  'pliers-flat': svg(
    '<path d="M11 2.5h2l.9 7h-3.8z"/><path d="M12 2.5v6.8" stroke-width="1.1"/>' + PLIERS_HANDLES,
  ),
  'pliers-circlip': svg(
    '<path d="M11.3 9.6 10.3 4.4 9.4 2.8M12.7 9.6l1-5.2.9-1.6"/><circle cx="9.3" cy="2.4" r=".5"/><circle cx="14.7" cy="2.4" r=".5"/>' +
      '<path d="M10.6 14.2c.9.9 1.9.9 2.8 0" stroke-width="1.2"/>' +
      '<circle cx="12" cy="11" r="1.5"/><path d="M11 12.3C9.6 15.4 8.2 18.4 7.2 21.5M13 12.3c1.4 3.1 2.8 6.1 3.8 9.2"/>' +
      '<path d="M9.3 16.2c-.8 1.9-1.5 3.7-2.1 5.3M14.7 16.2c.8 1.9 1.5 3.7 2.1 5.3" stroke-width="3.2"/>',
  ),
  'cutter-flush': svg(
    '<path d="M12 3C9.4 4.8 9.2 7.6 10.8 9.9M12 3c2.6 1.8 2.8 4.6 1.2 6.9M12 3v6.3"/>' + PLIERS_HANDLES,
  ),
  'bearing-puller': svg(
    '<rect x="4" y="5.5" width="16" height="3" rx="1"/><path d="M12 1.5v15.5M9.3 2.3h5.4"/>' +
      '<path d="M5.8 8.5v11.3h2.6M18.2 8.5v11.3h-2.6"/><rect x="8.6" y="15.2" width="6.8" height="3" rx="1" stroke-width="1.3"/>',
  ),
  'arbor-press': svg(
    '<path d="M4.5 21.5h11M6.5 21.5V9"/><rect x="5" y="3.5" width="11" height="5.5" rx="1"/>' +
      '<path d="M12.5 9v7M11.3 16.2h2.4"/><path d="M16 6.2l4.2-3"/><circle cx="20.8" cy="2.8" r="1.2"/>',
  ),
  mallet: svg(
    '<rect x="2.8" y="4.2" width="9.4" height="6.4" rx="1.6" transform="rotate(-35 7.5 7.4)"/><path d="M10.8 10.4l9.6 10.6" stroke-width="2.6"/>',
  ),
  'soldering-iron': svg(
    '<path d="M3 21l3.1-3.1"/><path d="M6.1 17.9l5-5" stroke-width="2.4"/>' +
      '<rect x="11.9" y="4.6" width="4.6" height="10" rx="2.3" transform="rotate(45 14.2 9.6)"/>' +
      '<path d="M17.6 6.4c1.3-1.2 2.6-2 3.9-3.9"/><path d="M4 15.6c.9-.9-.1-1.7.8-2.6" stroke-width="1.2"/>',
  ),
  'desolder-pump': svg(
    '<rect x="9" y="6" width="6" height="12" rx="1.5"/><path d="M10.5 18 12 22l1.5-4"/>' +
      '<path d="M12 6V2.9M9.8 2.5h4.4"/><path d="M15 8.4h1.4v2.6H15" stroke-width="1.3"/>',
  ),
  'desolder-braid': svg(
    '<circle cx="8" cy="8.5" r="5.5"/><circle cx="8" cy="8.5" r="2"/>' +
      '<path d="M12.6 11.6c2.2 2.6 3.9 5.2 8.4 6.6M11.5 13c2.1 2.6 4 5.3 8.8 6.9"/>' +
      '<path d="M15 14.4l-.9 1M17.2 16.4l-.8 1.1M19.4 17.8l-.6 1.2" stroke-width="1"/>',
  ),
  'hot-air': svg(
    '<rect x="9.5" y="1.5" width="5" height="9.5" rx="2.5"/><path d="M9.8 11h4.4M10.6 11l.6 3.6h1.6l.6-3.6"/>' +
      '<path d="M10 17.2q-.8 1 0 2t0 2M12 17.2q-.8 1 0 2t0 2M14 17.2q-.8 1 0 2t0 2" stroke-width="1.3"/>',
  ),
  tweezers: svg(
    '<path d="M8.5 2.5l2.9 19M15.5 2.5l-2.9 19M8.5 2.5h7"/><path d="M9.6 8.2l1.3-.2M14.4 8.2l-1.3-.2" stroke-width="1.2"/>',
  ),
  'ic-extractor': svg(
    '<path d="M6 20.5V9a6 6 0 0 1 12 0v11.5M6 20.5h1.8M18 20.5h-1.8"/>' +
      '<rect x="8.5" y="15.5" width="7" height="3.6" rx=".6" stroke-width="1.3"/><path d="M9.9 19.1v1.6M12 19.1v1.6M14.1 19.1v1.6" stroke-width="1"/>',
  ),
  scalpel: svg(
    '<rect x="13.6" y="1.2" width="3.2" height="13" rx="1" transform="rotate(45 15.2 7.7)"/>' +
      '<path d="M10.8 12.5 3 21c4-1.3 7-3.8 9.6-6.6"/>',
  ),
  spudger: svg(
    '<path d="M4.5 20.5 17.8 3.5l1.8 1.4L6.3 21.9z"/><path d="M5.3 19.5l1.8 1.4" stroke-width="1.2"/>',
  ),
  hands: svg(
    '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 13v-2.5a1.5 1.5 0 0 1 3 0V15c0 4-3 7-7 7h-1.2c-2 0-3.6-1-4.6-2.6L4.6 16a1.5 1.5 0 0 1 2.5-1.7L8 15.5"/>',
  ),
};
