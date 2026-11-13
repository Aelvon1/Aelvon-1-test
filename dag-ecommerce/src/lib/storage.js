// Accès au stockage local du navigateur, sans jamais lever d'erreur.

/**
 * localStorage, ou null s'il est inaccessible. Quand les données de site sont bloquées (cookies
 * refusés, cadre isolé, certaines navigations privées), lire `window.localStorage` lève déjà
 * SecurityError : l'accès doit donc passer par ici, jamais par une valeur de paramètre par défaut.
 * @returns {Storage|null}
 */
export function localStore() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Prévient quand la valeur enregistrée sous `key` a pu changer hors de cette page : un autre onglet
 * l'a écrite (événement « storage »), ou la page revient du cache de navigation du navigateur
 * (« pageshow » persisté), où elle n'a reçu aucun événement.
 * @param {string} key
 * @param {() => void} onChange
 * @returns {() => void} fonction de désabonnement
 */
export function watchStorageKey(key, onChange) {
  const target = globalThis.window;
  if (!target?.addEventListener) return () => {};
  const onStorage = (event) => {
    // key null : le stockage entier vient d'être vidé
    if (event.key === key || event.key === null) onChange();
  };
  const onPageShow = (event) => {
    if (event.persisted) onChange();
  };
  target.addEventListener('storage', onStorage);
  target.addEventListener('pageshow', onPageShow);
  return () => {
    target.removeEventListener('storage', onStorage);
    target.removeEventListener('pageshow', onPageShow);
  };
}
