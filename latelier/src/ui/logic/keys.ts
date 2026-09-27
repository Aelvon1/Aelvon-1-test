/**
 * Libellés de touches et tableau des commandes (logique pure, testée sous Node).
 *
 * Deux familles de touches :
 * - POSITIONS physiques (`code`, ex. `KeyW`) pour les déplacements : le libellé dépend de la
 *   disposition (« Z » en AZERTY, « W » en QWERTY), fourni par `store.keyLabels` ;
 * - CARACTÈRES pour les raccourcis mnémotechniques (X éclater, L étiquettes…) : le moteur lit
 *   `event.key`, la lettre affichée est donc la lettre elle-même, quelle que soit la disposition.
 */

/** Libellés français des touches spéciales (repli si `keyLabels` ne les contient pas). */
const SPECIAL: Record<string, string> = {
  Tab: 'Tab',
  Space: 'Espace',
  Escape: 'Échap',
  ShiftLeft: 'Maj',
  ShiftRight: 'Maj',
  ControlLeft: 'Ctrl',
  AltLeft: 'Alt',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: 'Entrée',
  Backquote: '²',
  F6: 'F6',
  Home: 'Début',
  End: 'Fin',
};

/** Libellé d'une touche physique d'après la table de la disposition (`store.keyLabels`). */
export function keyLabelFor(labels: Readonly<Record<string, string>>, code: string): string {
  const known = labels[code];
  if (known) return known === ' ' ? 'Espace' : known;
  return SPECIAL[code] ?? code.replace(/^Key|^Digit|^Numpad/, '');
}

/** Élément d'une combinaison : touche physique, caractère, ou geste souris. */
export type KeyToken =
  | { code: string }
  | { char: string }
  | { mouse: 'left' | 'right' | 'middle' | 'wheel' | 'move' | 'double' | 'drag-left' | 'drag-right' };

/** Une commande : alternatives (chacune une combinaison de jetons) et libellé. */
export interface ControlBinding {
  label: string;
  combos: readonly (readonly KeyToken[])[];
}

export interface ControlSection {
  title: string;
  bindings: readonly ControlBinding[];
}

const code = (c: string): KeyToken => ({ code: c });
const char = (c: string): KeyToken => ({ char: c });

/** Commandes d'exploration (salle). */
export const EXPLORATION_CONTROLS: ControlSection = {
  title: 'Dans l’atelier',
  bindings: [
    {
      label: 'Se déplacer',
      combos: [
        [code('KeyW'), code('KeyA'), code('KeyS'), code('KeyD')],
        [code('ArrowUp'), code('ArrowLeft'), code('ArrowDown'), code('ArrowRight')],
      ],
    },
    { label: 'Regarder', combos: [[{ mouse: 'move' }]] },
    { label: 'Courir', combos: [[code('ShiftLeft')]] },
    { label: 'S’accroupir', combos: [[code('KeyC')]] },
    { label: 'Interagir (lampe, radio, établi…)', combos: [[code('KeyE')]] },
    { label: 'Inventaire', combos: [[code('Tab')]] },
    { label: 'Pause', combos: [[code('Escape')]] },
    { label: 'Panneau de debug', combos: [[code('Backquote')]] },
  ],
};

/** Commandes de l'inspection (démontage). */
export const INSPECTION_CONTROLS: ControlSection = {
  title: 'Sur l’établi (démontage)',
  bindings: [
    { label: 'Tourner autour', combos: [[{ mouse: 'drag-left' }]] },
    { label: 'Déplacer la vue', combos: [[{ mouse: 'drag-right' }], [{ mouse: 'middle' }]] },
    { label: 'Zoom (jusqu’au macro)', combos: [[{ mouse: 'wheel' }]] },
    { label: 'Sélectionner une pièce', combos: [[{ mouse: 'left' }]] },
    { label: 'Cadrer et ouvrir la fiche', combos: [[{ mouse: 'double' }]] },
    { label: 'Étape suivante', combos: [[code('Space')], [code('ArrowRight')]] },
    { label: 'Étape précédente', combos: [[code('ArrowLeft')]] },
    { label: 'Vue éclatée', combos: [[char('X')]] },
    { label: 'Étiquettes', combos: [[char('L')]] },
    { label: 'Vue rangée', combos: [[char('K')]] },
    { label: 'Coupe', combos: [[char('C')]] },
    { label: 'Cadrer la sélection', combos: [[char('F')]] },
    { label: 'Recentrer la vue', combos: [[char('R')]] },
    { label: 'Isoler la sélection', combos: [[char('I')]] },
    { label: 'Masquer la sélection', combos: [[char('H')]] },
    { label: 'Tout afficher', combos: [[code('ShiftLeft'), char('H')]] },
    { label: 'Changer d’objet', combos: [[code('Tab')]] },
    { label: 'Panneaux au clavier', combos: [[code('F6')]] },
    { label: 'Retour à l’atelier', combos: [[code('Escape')]] },
  ],
};

/** Texte d'un jeton (pour les libellés accessibles et les tests). */
export function tokenText(labels: Readonly<Record<string, string>>, token: KeyToken): string {
  if ('code' in token) return keyLabelFor(labels, token.code);
  if ('char' in token) return token.char;
  switch (token.mouse) {
    case 'left':
      return 'Clic gauche';
    case 'right':
      return 'Clic droit';
    case 'middle':
      return 'Clic molette + glisser';
    case 'wheel':
      return 'Molette';
    case 'move':
      return 'Souris';
    case 'double':
      return 'Double-clic';
    case 'drag-left':
      return 'Clic gauche + glisser';
    case 'drag-right':
      return 'Clic droit + glisser';
  }
}

/** Combinaison lisible (« Maj + H », « Z Q S D »). */
export function comboText(labels: Readonly<Record<string, string>>, combo: readonly KeyToken[]): string {
  const isModifier = (t: KeyToken) => 'code' in t && /^(Shift|Control|Alt)/.test(t.code);
  const parts = combo.map((t) => tokenText(labels, t));
  return combo.some(isModifier) ? parts.join(' + ') : parts.join(' ');
}
