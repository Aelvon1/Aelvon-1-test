import { useEffect, useState } from 'react';

/**
 * Repère de lecture pour un sommaire : renvoie l'id de la section en cours, c'est-à-dire la
 * dernière dont le haut a franchi la ligne de lecture (un tiers de l'écran par défaut).
 * @param {string[]} ids  ids des sections, dans l'ordre de la page
 * @param {{ line?: number }} [options]  line : position de la ligne de lecture (0 = haut, 1 = bas de l'écran)
 * @returns {string|null}
 */
export function useActiveSection(ids, { line = 0.34 } = {}) {
  const key = ids.join('|');
  const [active, setActive] = useState(null);

  useEffect(() => {
    const list = key ? key.split('|') : [];
    if (!list.length) return undefined;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const limit = window.innerHeight * line;
      let current = list[0];
      for (const id of list) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top <= limit) current = id;
      }
      // bas de page atteint : la dernière section l'emporte, même courte
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const last = document.getElementById(list[list.length - 1]);
      if (atEnd && last && last.getBoundingClientRect().top < window.innerHeight) current = list[list.length - 1];
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
  }, [key, line]);

  return active && ids.includes(active) ? active : (ids[0] ?? null);
}
