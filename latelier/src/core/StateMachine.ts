import type { AppStore } from './store';
import { canTransition, type AppPhase } from './phases';

type Listener = (to: AppPhase, from: AppPhase) => void;

/**
 * Machine à états de l'application : garde les transitions valides, met à jour le store et
 * notifie les systèmes abonnés (entrée/sortie de phase).
 */
export class StateMachine {
  private readonly listeners = new Set<Listener>();

  constructor(private readonly store: AppStore) {}

  get phase(): AppPhase {
    return this.store.getState().phase;
  }

  /** Tente une transition ; retourne `false` (et journalise en dev) si elle est interdite. */
  go(to: AppPhase): boolean {
    const from = this.phase;
    if (from === to) return true;
    if (!canTransition(from, to)) {
      if (import.meta.env.DEV) console.warn(`[StateMachine] Transition interdite : ${from} → ${to}`);
      return false;
    }
    this.store.setState({ phase: to });
    for (const listener of [...this.listeners]) {
      try {
        listener(to, from);
      } catch (error) {
        console.error('[StateMachine] Erreur dans un abonné :', error);
      }
    }
    return true;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
