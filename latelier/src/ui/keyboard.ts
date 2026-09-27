/**
 * Priorité clavier de l'interface.
 *
 * Le moteur écoute le clavier sur `window` en phase de capture (`core/Input.ts`) : il bloque
 * l'action par défaut de Tab, Espace et des flèches, et interprète Espace/flèches/lettres comme
 * des raccourcis (étape suivante, éclater…). Sans arbitrage, un curseur, une arborescence ou un
 * bouton focalisés dans l'interface seraient donc inutilisables au clavier.
 *
 * Ce garde est installé sur `window` en capture AVANT le moteur (appel synchrone dans `mountUi`,
 * avant le chargement) : il voit chaque touche en premier et décide si elle appartient à
 * l'interface. Une touche gardée est retirée au moteur (`stopImmediatePropagation`) SANS
 * `preventDefault` : l'action native (déplacement du focus, activation d'un bouton, curseur)
 * a lieu normalement.
 *
 * Règles :
 * 1. Zones clavier (`registerKeyScope`) : du focus vers la racine, chaque zone peut consommer
 *    la touche (arborescence, grille de l'inventaire, curseurs…).
 * 2. Contextes modaux (chargement, accueil, pause, transition, panneau superposé) : tout reste
 *    à l'interface sauf Échap (fermeture, gérée par le moteur) et ² (debug).
 * 3. Inventaire : Tab et Échap ferment (moteur), le reste appartient à l'interface.
 * 4. Inspection, focus dans l'interface : Tab, Espace et Entrée servent à l'interface ; Échap
 *    rend le focus à la vue 3D ; les lettres restent des raccourcis du moteur.
 * 5. Inspection : F6 / Maj+F6 parcourent les régions de l'interface (`data-region`).
 */
import type { AppStore } from '../core/store';

/** Gestionnaire d'une zone clavier : retourne vrai si la touche est consommée. */
export type KeyScopeHandler = (event: KeyboardEvent) => boolean;

const scopes = new WeakMap<Element, KeyScopeHandler>();

/** Déclare une zone clavier sur un élément. Retourne la fonction de retrait. */
export function registerKeyScope(element: Element, handler: KeyScopeHandler): () => void {
  scopes.set(element, handler);
  return () => {
    if (scopes.get(element) === handler) scopes.delete(element);
  };
}

/** Éléments focalisables (visibles, non désactivés) d'un conteneur, dans l'ordre du document. */
export function focusableIn(container: ParentNode): HTMLElement[] {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...container.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
}

/** Rend le focus à la vue 3D (canvas). */
export function focusScene(): void {
  const canvas = document.getElementById('scene');
  if (canvas instanceof HTMLCanvasElement) canvas.focus({ preventScroll: true });
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

/** Déplace le focus vers la région suivante/précédente de l'interface (F6). */
export function cycleRegions(root: HTMLElement, backwards: boolean): boolean {
  const regions = [...root.querySelectorAll<HTMLElement>('[data-region]')].filter(
    (el) => focusableIn(el).length > 0,
  );
  if (regions.length === 0) return false;
  const active = document.activeElement;
  const current = regions.findIndex((r) => active instanceof Node && r.contains(active));
  const next =
    current < 0
      ? backwards
        ? regions.length - 1
        : 0
      : (current + (backwards ? regions.length - 1 : 1)) % regions.length;
  const region = regions[next]!;
  // Élément préféré de la région (ex. ligne courante de l'arborescence), sinon le premier.
  const preferred = region.querySelector<HTMLElement>('[data-region-focus]') ?? focusableIn(region)[0];
  preferred?.focus();
  return preferred !== undefined;
}

function isTextField(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement)
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset'].includes(el.type);
  return false;
}

/**
 * Installe le garde clavier (à appeler AVANT la création de `Input`). `root` : conteneur de
 * l'interface. Retourne la fonction de désinstallation.
 */
export function installKeyboardGuard(root: HTMLElement, store: AppStore): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const inUi = target !== null && target !== root && root.contains(target);

    // 1. Zones clavier, de l'élément focalisé vers la racine.
    if (inUi) {
      for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
        const handler = scopes.get(el);
        if (handler && handler(event)) {
          event.stopImmediatePropagation();
          return;
        }
      }
    }

    const { phase, overlay } = store.getState();
    const code = event.code;
    // ² reste au moteur (panneau de debug), sauf pendant une saisie.
    if (code === 'Backquote' && !isTextField(target)) return;

    // 2. Contextes modaux.
    const modal =
      overlay !== 'none' ||
      phase === 'loading' ||
      phase === 'home' ||
      phase === 'paused' ||
      phase === 'transition';
    if (modal) {
      if (code !== 'Escape') event.stopImmediatePropagation();
      return;
    }

    // 3. Inventaire.
    if (phase === 'inventory') {
      if (code !== 'Escape' && code !== 'Tab') event.stopImmediatePropagation();
      return;
    }

    // 4-5. Inspection.
    if (phase === 'inspection') {
      if (code === 'F6') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cycleRegions(root, event.shiftKey);
        return;
      }
      if (!inUi) return;
      if (code === 'Escape') {
        event.stopImmediatePropagation();
        focusScene();
        return;
      }
      if (code === 'Tab' || code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
        event.stopImmediatePropagation();
      }
    }
  };
  window.addEventListener('keydown', onKeyDown, { capture: true });
  return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
}
