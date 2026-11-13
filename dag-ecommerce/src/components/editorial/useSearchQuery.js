import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { paramsWithQuery, queryFromParams } from './faq-content';

// Pendant la frappe, l'URL attend une courte pause : une écriture par caractère épuiserait vite le
// quota de history.replaceState de Safari (100 appels par 30 s), qui lève ensuite une erreur.
const TYPING_PAUSE_MS = 400;
const REPLACE = { replace: true, preventScrollReset: true };

/**
 * Recherche de l'aide, tenue aussi dans l'URL (« /faq?q=retour »). Au retour arrière, la page
 * retrouve ainsi sa recherche — donc la mise en page pour laquelle la position de défilement avait
 * été enregistrée — et l'adresse se partage telle quelle.
 * La saisie vit dans l'état local : le champ répond à la frappe. L'URL la suit sans ajouter d'entrée
 * à l'historique : après une courte pause pendant la frappe, tout de suite pour un geste net.
 * @returns {{ query: string, type: (value: string) => void, search: (value: string) => void }}
 *   type : saisie en cours · search : geste net (suggestion, effacement, sortie du champ)
 */
export function useSearchQuery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const saved = queryFromParams(searchParams);
  const [query, setQuery] = useState(saved);
  const wanted = query.trim();
  const pause = useRef(0);

  useEffect(() => {
    if (wanted === saved) return undefined;
    const href = window.location.href;
    const timer = setTimeout(() => {
      // L'adresse a changé pendant la pause : une navigation est partie, et l'entrée d'historique en cours
      // n'est plus celle de l'aide. Y écrire ramènerait le visiteur ici.
      if (window.location.href === href) setSearchParams((params) => paramsWithQuery(params, wanted), REPLACE);
    }, TYPING_PAUSE_MS);
    pause.current = timer;
    return () => clearTimeout(timer);
  }, [wanted, saved, setSearchParams]);

  const search = (value) => {
    // plus rien n'attend : ce geste écrit lui-même, avant une éventuelle navigation (clic sur un lien)
    clearTimeout(pause.current);
    setQuery(value);
    if (value.trim() !== saved) setSearchParams((params) => paramsWithQuery(params, value), REPLACE);
  };

  return { query, type: setQuery, search };
}
