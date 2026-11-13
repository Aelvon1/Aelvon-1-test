import { useEffect, useState } from 'react';

/**
 * État de chargement d'une image : 'loading' | 'loaded' | 'error'.
 * L'image est demandée hors du document (elle sort ensuite du cache du navigateur).
 * @param {string|null|undefined} src
 */
export function useImageStatus(src) {
  const [state, setState] = useState({ src: null, status: 'loading' });

  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setState({ src, status: 'loaded' });
    };
    image.onerror = () => {
      if (!cancelled) setState({ src, status: 'error' });
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!src) return 'error';
  return state.src === src ? state.status : 'loading';
}
