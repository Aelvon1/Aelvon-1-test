import { useEffect, useState } from 'react';

/**
 * La scène 3D montée sous `ref` est-elle à l'écran, en train de dessiner ?
 * D'après l'attribut `data-belt-canvas` que BeltCanvas publie (poster | loading | ready) : la scène
 * peut ne jamais démarrer (WebGL indisponible), ou retomber sur son image d'attente (contexte perdu,
 * erreur), puis repartir.
 * @param {{ current: HTMLElement|null }} ref  conteneur de BeltCanvas, monté avant lui
 * @returns {boolean}
 */
export function useSceneLive(ref) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    // une scène n'est jamais prête dès son montage : il suffit de suivre les changements de l'attribut
    const observer = new MutationObserver(() => {
      setLive(root.querySelector('[data-belt-canvas]')?.getAttribute('data-belt-canvas') === 'ready');
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-belt-canvas'] });
    return () => observer.disconnect();
  }, [ref]);

  return live;
}
