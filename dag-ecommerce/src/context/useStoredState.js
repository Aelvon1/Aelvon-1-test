import { useCallback, useEffect, useRef, useState } from 'react';
import { watchStorageKey } from '../lib/storage';

/** Marque : la dernière écriture a échoué (stockage refusé ou plein), la mémoire est la seule copie. */
const UNSAVED = Symbol('unsaved');

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * État React conservé dans le stockage local et partagé entre les onglets du site.
 * Il est lu au montage, enregistré à chaque changement fait dans cet onglet, et relu dès qu'un autre
 * onglet l'enregistre : sans cette relecture, chaque onglet réécrirait sa copie par-dessus celle de l'autre.
 * Une valeur qui vient d'être lue n'est jamais réécrite (deux onglets ne se renvoient pas la balle).
 * @template T
 * @param {string} key  clé de stockage surveillée
 * @param {() => T} load  relit la valeur enregistrée — fonction stable, ne lève jamais d'erreur
 * @param {(value: T) => boolean} save  enregistre la valeur — fonction stable, renvoie false si rien n'a pu être écrit
 * @returns {[T, import('react').Dispatch<import('react').SetStateAction<T>>, () => boolean]}
 *   la valeur, sa modification, et `sync()` : relit le stockage sur demande et renvoie false si la valeur
 *   en mémoire n'était plus celle enregistrée (elle vient alors d'être remplacée)
 */
export function useStoredState(key, load, save) {
  const [value, setValue] = useState(load);
  // dernière valeur connue du stockage, ou UNSAVED
  const stored = useRef(value);

  useEffect(() => {
    if (stored.current === value) return;
    stored.current = save(value) ? value : UNSAVED;
  }, [value, save]);

  const sync = useCallback(() => {
    // rien d'enregistré : relire effacerait la seule copie
    if (stored.current === UNSAVED) return true;
    const next = load();
    if (sameJson(next, stored.current)) return true;
    stored.current = next;
    setValue(next);
    return false;
  }, [load]);

  useEffect(() => watchStorageKey(key, sync), [key, sync]);

  return [value, setValue, sync];
}
