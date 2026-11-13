import { useEffect } from 'react';
import { scrollToTarget } from '../../hooks';

/**
 * Filet de sécurité pour les liens profonds (« /faq#retours », « /legal#cgv ») : à l'arrivée sur la
 * page, si l'URL porte une ancre, on s'y rend — une fois la page montée, puis une fois les polices
 * chargées (la hauteur des textes a pu changer), tant que le visiteur n'a pas défilé lui-même.
 * La coque gère déjà les ancres ; ceci couvre le premier chargement d'une page chargée à la demande.
 */
export function useHashAnchor() {
  useEffect(() => {
    const { hash } = window.location;
    // « #/chemin » est une route en mode statique (HashRouter), pas une ancre
    if (!hash || hash.length < 2 || hash.startsWith('#/')) return undefined;

    let cancelled = false;
    let lastY = null;
    const go = () => {
      if (cancelled) return;
      // le visiteur a repris la main : on ne le déplace plus
      if (lastY !== null && Math.abs(window.scrollY - lastY) > 4) return;
      if (scrollToTarget(hash, { immediate: true })) lastY = window.scrollY;
    };

    const frame = requestAnimationFrame(go);
    document.fonts?.ready.then(() => requestAnimationFrame(go)).catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);
}
