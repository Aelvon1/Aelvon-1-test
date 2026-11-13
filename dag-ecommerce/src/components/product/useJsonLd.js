import { useEffect } from 'react';

/**
 * Publie des données structurées (JSON-LD) dans l'en-tête du document tant que la page est montée.
 * @param {object|null} data  objet schema.org ; null : rien n'est publié
 */
export function useJsonLd(data) {
  const json = data ? JSON.stringify(data) : '';

  useEffect(() => {
    if (!json) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = json;
    document.head.appendChild(script);
    return () => script.remove();
  }, [json]);
}
