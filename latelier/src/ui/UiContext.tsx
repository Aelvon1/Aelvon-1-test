/**
 * Contexte React de l'interface : accès au store (lecture), au bus (commandes), aux libellés de
 * touches selon la disposition clavier et aux sons d'interface.
 */
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { useStore } from 'zustand';
import type { AppState, AppStore } from '../core/store';
import type { EventBus } from '../core/EventBus';
import type { AppEvents } from '../core/events';
import type { SoundId } from '../audio/types';
import { registerKeyScope, type KeyScopeHandler } from './keyboard';
import { keyLabelFor } from './logic/keys';

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

/** Sélecteur typé sur l'état global (le sélecteur doit retourner une valeur stable). */
export function useAppState<T>(selector: (state: AppState) => T): T {
  const { store } = useUi();
  return useStore(store, selector);
}

/** Libellé d'une touche physique selon la disposition (ex. KeyW → « Z » en AZERTY). */
export function useKeyLabel(): (code: string) => string {
  const labels = useAppState((s) => s.keyLabels);
  return useCallback((code: string) => keyLabelFor(labels, code), [labels]);
}

/** Intervalle minimal entre deux sons de survol (évite la mitraille en balayant une liste). */
const HOVER_SOUND_INTERVAL_MS = 70;

/** Sons d'interface (événement `ui:sound`, joués par le moteur audio sur le bus « interface »). */
export function useUiSound(): { play: (id: SoundId) => void; hover: () => void } {
  const { bus } = useUi();
  const lastHover = useRef(0);
  const play = useCallback((id: SoundId) => bus.emit('ui:sound', id), [bus]);
  const hover = useCallback(() => {
    const now = performance.now();
    if (now - lastHover.current < HOVER_SOUND_INTERVAL_MS) return;
    lastHover.current = now;
    bus.emit('ui:sound', 'ui.hover');
  }, [bus]);
  return { play, hover };
}

/** Zone clavier (voir `keyboard.ts`) : le gestionnaire le plus récent est toujours utilisé. */
export function useKeyScope(ref: RefObject<HTMLElement | null>, handler: KeyScopeHandler): void {
  const onKey = useEffectEvent((event: KeyboardEvent) => handler(event));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerKeyScope(el, (event) => onKey(event));
  }, [ref]);
}

/** Abonnement à un événement du bus pendant la vie du composant. */
export function useBusEvent<K extends keyof AppEvents>(type: K, handler: (payload: AppEvents[K]) => void): void {
  const { bus } = useUi();
  const onEvent = useEffectEvent((payload: AppEvents[K]) => handler(payload));
  useEffect(() => bus.on(type, (payload) => onEvent(payload)), [bus, type]);
}
