import { useEffect } from 'react';

const SITE = 'DAG';

function metaElement(selector) {
  return typeof document === 'undefined' ? null : document.head.querySelector(selector);
}

// Valeurs par défaut : celles d'index.html, lues une fois au chargement du module.
const DEFAULTS = {
  title: typeof document === 'undefined' ? SITE : document.title,
  description: metaElement('meta[name="description"]')?.getAttribute('content') ?? '',
  ogTitle: metaElement('meta[property="og:title"]')?.getAttribute('content') ?? '',
  ogDescription: metaElement('meta[property="og:description"]')?.getAttribute('content') ?? '',
};

function setMeta(selector, content) {
  const element = metaElement(selector);
  if (element && content != null) element.setAttribute('content', content);
}

/**
 * Titre et description de la page courante.
 * `usePageMeta({ title: 'La collection', description: '…' })` → « La collection — DAG ».
 * Sans titre, le titre par défaut du site est conservé. Les valeurs d'origine sont
 * restaurées au démontage de la page.
 * @param {{ title?: string, description?: string }} [meta]
 */
export function usePageMeta({ title, description } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE}` : DEFAULTS.title;
    document.title = fullTitle;
    setMeta('meta[property="og:title"]', fullTitle);
    if (description) {
      setMeta('meta[name="description"]', description);
      setMeta('meta[property="og:description"]', description);
    }
    return () => {
      document.title = DEFAULTS.title;
      setMeta('meta[name="description"]', DEFAULTS.description);
      setMeta('meta[property="og:title"]', DEFAULTS.ogTitle);
      setMeta('meta[property="og:description"]', DEFAULTS.ogDescription);
    };
  }, [title, description]);
}
