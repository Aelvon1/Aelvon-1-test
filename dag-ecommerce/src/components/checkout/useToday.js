import { useEffect, useState } from 'react';

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Intervalle de contrôle, en ms. Comparer deux dates ne coûte rien ; rien n'est rendu tant que le jour ne change pas. */
const CHECK_EVERY = 1000;

/**
 * Date du jour, tenue à jour tant que le composant est affiché. Un onglet laissé ouvert passe minuit,
 * ou un week-end en veille : la date retenue à son ouverture annoncerait alors une livraison plus
 * proche que celle de la commande réellement passée. La valeur ne change (nouvel objet Date) que
 * lorsque le jour change — au fil de l'eau, et dès le retour sur l'onglet.
 * @returns {Date}
 */
export function useToday() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      setToday((current) => (sameDay(current, now) ? current : now));
    };
    const timer = setInterval(refresh, CHECK_EVERY);
    // retour sur l'onglet, sortie de veille, page rendue par le cache de navigation : sans attendre
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, []);

  return today;
}
