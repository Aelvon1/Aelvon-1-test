import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

/**
 * Déclenche une notification discrète.
 *   const toast = useToast();
 *   toast('Ajouté à vos favoris');
 *   const id = toast({ title, description?, icon? = 'check', duration? = 4500, action?: { label, onClick } });
 *   toast.dismiss(id);
 * Hors d'un <ToastProvider>, la fonction ne fait rien.
 */
export function useToast() {
  return useContext(ToastContext) ?? NOOP;
}

/** Réservé à <ToastProvider> : fonction `toast(…)` portant aussi `toast.dismiss(id)`. */
export function createToastApi(show, dismiss) {
  const toast = (input) => show(input);
  toast.dismiss = dismiss;
  return toast;
}

const NOOP = createToastApi(
  () => null,
  () => {},
);
