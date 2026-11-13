// Défilement : registre de l'instance Lenis, défilement programmatique et
// verrouillage du corps de page pour les calques. Aucun état React ici.

let lenis = null;
let locks = 0;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Réservé à la coque : enregistre (ou retire) l'instance Lenis active. */
export function registerLenis(instance) {
  lenis = instance;
  if (lenis && locks > 0) lenis.stop();
}

export const getLenis = () => lenis;

function resolveElement(target) {
  if (target instanceof Element) return target;
  if (typeof target !== 'string') return null;
  if (target.startsWith('#')) return document.getElementById(decodeURIComponent(target.slice(1)));
  try {
    return document.querySelector(target);
  } catch {
    return null;
  }
}

/**
 * Fait défiler la page vers une position (px), un élément ou un sélecteur / « #id ».
 * Passe par Lenis quand il est actif, sinon par le défilement natif.
 * @param {number|string|Element} target
 * @param {{ offset?: number, immediate?: boolean, focus?: boolean }} [options]
 *   offset : décalage en px · immediate : sans animation · focus : donne le focus à la cible
 * @returns {boolean} false si la cible est introuvable
 */
export function scrollToTarget(target, { offset = 0, immediate = false, focus = false } = {}) {
  const element = typeof target === 'number' ? null : resolveElement(target);
  if (typeof target !== 'number' && !element) return false;
  const instant = immediate || prefersReducedMotion();

  if (lenis) {
    // saut immédiat (changement de page) : Lenis doit d'abord connaître la nouvelle hauteur du document
    if (instant) lenis.resize();
    lenis.scrollTo(element ?? target, { offset, immediate: instant, force: true });
  } else {
    let top = target;
    if (element) {
      const marginTop = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
      const paddingTop = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      top = element.getBoundingClientRect().top + window.scrollY - marginTop - paddingTop;
    }
    window.scrollTo({ top: Math.max(0, top + offset), behavior: instant ? 'instant' : 'smooth' });
  }

  if (focus && element) {
    if (!element.hasAttribute('tabindex') && element.tabIndex < 0) element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
  }
  return true;
}

/** Retour en haut de page. */
export function scrollToTop({ immediate = false } = {}) {
  return scrollToTarget(0, { immediate });
}

/** Verrouille le défilement de la page (compté : chaque appel doit être suivi d'un unlockScroll). */
export function lockScroll() {
  locks += 1;
  if (locks !== 1) return;
  const root = document.documentElement;
  const gap = Math.max(0, window.innerWidth - root.clientWidth);
  root.style.setProperty('--scroll-lock-gap', `${gap}px`);
  root.classList.add('scroll-locked');
  lenis?.stop();
}

export function unlockScroll() {
  if (locks === 0) return;
  locks -= 1;
  if (locks !== 0) return;
  const root = document.documentElement;
  root.classList.remove('scroll-locked');
  root.style.setProperty('--scroll-lock-gap', '0px');
  lenis?.start();
}
