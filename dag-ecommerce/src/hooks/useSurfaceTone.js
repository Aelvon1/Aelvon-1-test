import { useEffect } from 'react';

const SELECTOR =
  '[data-header-tone], .theme-noir, .theme-ivoire, .tone-noir, .tone-ivoire, .tone-papier, .tone-craie';

function toneOf(element, fallback) {
  const explicit = element.getAttribute('data-header-tone');
  if (explicit === 'noir' || explicit === 'ivoire') return explicit;
  if (element.matches('.theme-noir, .tone-noir')) return 'noir';
  if (element.matches('.theme-ivoire, .tone-ivoire, .tone-papier, .tone-craie')) return 'ivoire';
  return fallback;
}

function toneAt(x, y, fallback) {
  for (const element of document.elementsFromPoint(x, y)) {
    // le bandeau lui-même, les calques et le grain ne comptent pas
    if (element.closest('[data-tone-ignore]')) continue;
    const themed = element.closest(SELECTOR);
    return themed ? toneOf(themed, fallback) : fallback;
  }
  return fallback;
}

/**
 * Accorde un bandeau fixe à la surface (« noir » ou « ivoire ») qu'il survole.
 *
 * Chaque descendant de `ref` marqué `data-tone-zone` reçoit `data-tone="noir|ivoire"` selon la
 * surface située sous son propre centre (`data-tone-zone="center"` : sous le centre du bandeau).
 * La surface est l'ancêtre le plus proche portant `.theme-noir` / `.theme-ivoire` (ou `.tone-*`),
 * ou un attribut `data-header-tone="noir|ivoire"` qui force le ton. Les éléments placés sous
 * `[data-tone-ignore]` sont ignorés. Les attributs sont écrits directement dans le DOM :
 * aucun rendu React n'est déclenché pendant le défilement.
 *
 * @param {{ current: HTMLElement|null }} ref  le bandeau
 * @param {{ unified?: boolean, fallback?: 'noir'|'ivoire' }} [options]
 *   unified : toutes les zones prennent le ton du centre (bandeau opaque) · fallback : défaut « noir »
 */
export function useSurfaceTone(ref, { unified = false, fallback = 'noir' } = {}) {
  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const host = ref.current;
      if (!host) return;
      const y = Math.round((host.offsetHeight || 64) / 2);
      const width = document.documentElement.clientWidth;
      const center = toneAt(Math.round(width / 2), y, fallback);
      for (const zone of host.querySelectorAll('[data-tone-zone]')) {
        let tone = center;
        if (!unified && zone.dataset.toneZone !== 'center') {
          const rect = zone.getBoundingClientRect();
          if (rect.width > 0) {
            const x = Math.min(width - 1, Math.max(0, Math.round(rect.left + rect.width / 2)));
            tone = toneAt(x, y, fallback);
          }
        }
        if (zone.dataset.tone !== tone) zone.dataset.tone = tone;
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // contenu qui change : navigation, pages chargées à la demande, sections qui changent de thème
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-header-tone'],
    });

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, unified, fallback]);
}
