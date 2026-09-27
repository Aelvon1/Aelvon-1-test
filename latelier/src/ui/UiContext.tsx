/**
 * Contexte React de l'interface : accès au store (lecture), au bus (commandes) et aux libellés
 * de touches selon la disposition clavier.
 */
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { AppState, AppStore } from '../core/store';
import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/events';

export interface UiServices {
  store: AppStore;
  bus: EventBus<AppEvents>;
}

export const UiContext = createContext<UiServices | null>(null);

export function useUi(): UiServices {
  const services = useContext(UiContext);
  if (!services) throw new Error('useUi() doit être utilisé sous <UiContext.Provider>.');
  return services;
}

/** Sélecteur typé sur l'état global. */
export function useAppState<T>(selector: (state: AppState) => T): T {
  const { store } = useUi();
  return useStore(store, selector);
}

/** Libellé d'une touche physique selon la disposition (ex. KeyW → « Z » en AZERTY). */
export function useKeyLabel(): (code: string) => string {
  const labels = useAppState((s) => s.keyLabels);
  return (code: string) => labels[code] ?? code.replace(/^Key|^Digit/, '');
}
