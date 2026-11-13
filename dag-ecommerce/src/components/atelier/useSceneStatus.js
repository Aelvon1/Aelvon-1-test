import { useEffect, useState } from 'react';

let webgl2;

/** WebGL 2 est-il disponible ? Même critère que la scène ; le contexte d'essai est aussitôt libéré. */
export function supportsWebGL2() {
  if (webgl2 !== undefined) return webgl2;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl2 = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

/**
 * Suit l'état de la scène 3D montée sous `root`, d'après l'attribut `data-belt-canvas` que
 * BeltCanvas publie (poster | loading | ready).
 * @param {HTMLElement|null} root
 * @returns {'pending'|'ready'|'failed'}
 *   failed : la scène avait démarré puis est revenue à son image d'attente (contexte perdu, erreur).
 */
export function useSceneStatus(root) {
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    if (!root || typeof MutationObserver === 'undefined') return undefined;
    let started = false;
    const read = () => {
      const state = root.querySelector('[data-belt-canvas]')?.getAttribute('data-belt-canvas');
      if (state === 'ready' || state === 'loading') {
        started = true;
        setStatus(state === 'ready' ? 'ready' : 'pending');
      } else if (state === 'poster' && started) {
        setStatus('failed');
      }
    };
    const observer = new MutationObserver(read);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['data-belt-canvas'] });
    return () => observer.disconnect();
  }, [root]);

  return status;
}
