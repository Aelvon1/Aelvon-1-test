import { useEffect, useState } from 'react';

// Une section rejointe par son ancre se pose à quelques pixels près.
const LANDING_SLACK = 4;

/**
 * Section en cours de lecture : la dernière dont le haut a franchi la ligne de lecture.
 * @param {Array<{ id: string, top: number, height: number }>} sections  dans l'ordre de la page ; top : distance au haut de l'écran
 * @param {{ viewport: number, line?: number, landing?: number|null }} frame
 *   viewport : hauteur de l'écran · line : position de la ligne de lecture (0 = haut, 1 = bas de l'écran)
 *   landing : distance au haut de l'écran où une ancre pose sa section (scroll-padding-top) ; null : sections sans ancres.
 *   Avec des ancres, la ligne ne s'éloigne jamais du point d'arrivée de plus que la plus courte des sections :
 *   sinon la section qui suit une section courte aurait déjà franchi la ligne, et serait marquée à sa place.
 * @returns {string|null}
 */
export function activeSectionId(sections, { viewport, line = 0.34, landing = null }) {
  if (!sections.length) return null;
  let limit = viewport * line;
  if (landing != null) {
    const shortest = Math.min(...sections.map((section) => section.height));
    limit = Math.min(limit, landing + Math.max(LANDING_SLACK, shortest - LANDING_SLACK));
  }
  let current = sections[0].id;
  for (const section of sections) {
    if (section.top <= limit) current = section.id;
  }
  return current;
}

/**
 * Repère de lecture pour un sommaire : renvoie l'id de la section en cours, c'est-à-dire la
 * dernière dont le haut a franchi la ligne de lecture (un tiers de l'écran par défaut).
 * @param {string[]} ids  ids des sections, dans l'ordre de la page
 * @param {{ line?: number, anchored?: boolean }} [options]
 *   line : position de la ligne de lecture (0 = haut, 1 = bas de l'écran)
 *   anchored : les sections sont rejointes par des liens d'ancre (sommaire) — la section rejointe est
 *   alors toujours celle marquée, même courte (voir activeSectionId). À couper pour une suite sans ancres.
 * @returns {string|null}
 */
export function useActiveSection(ids, { line = 0.34, anchored = true } = {}) {
  const key = ids.join('|');
  const [active, setActive] = useState(null);

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (!list.length) return undefined;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const sections = [];
      for (const id of list) {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        if (rect) sections.push({ id, top: rect.top, height: rect.height });
      }
      // une ancre pose sa section sous l'en-tête : c'est le scroll-padding-top du document
      const landing = anchored ? Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0 : null;
      let current = activeSectionId(sections, { viewport: window.innerHeight, line, landing }) ?? list[0];
      // bas de page atteint : la dernière section l'emporte, même courte
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const last = sections[sections.length - 1];
      if (atEnd && last?.id === list[list.length - 1] && last.top < window.innerHeight) current = last.id;
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [key, line, anchored]);

  return active && ids.includes(active) ? active : (ids[0] ?? null);
}
