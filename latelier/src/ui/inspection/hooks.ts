/**
 * Accès typé à l'état d'inspection (null hors inspection).
 */
import type { InspectionState } from '../../core/store';
import { useAppState } from '../UiContext';

/**
 * Sélecteur sur `store.inspection` ; `fallback` est retourné hors inspection. Le sélecteur doit
 * retourner une valeur stable (champ du store, primitive) : pas d'objet recréé à chaque appel.
 */
export function useInspection<T>(selector: (state: InspectionState) => T, fallback: T): T {
  return useAppState((s) => (s.inspection ? selector(s.inspection) : fallback));
}

const EMPTY_OBJECT = Object.freeze({}) as Readonly<Record<string, never>>;
const EMPTY_ARRAY = Object.freeze([]) as readonly never[];

/** Valeurs vides partagées (références stables pour les sélecteurs). */
export const EMPTY = { object: EMPTY_OBJECT, array: EMPTY_ARRAY };
