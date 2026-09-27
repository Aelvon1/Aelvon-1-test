/**
 * Bus d'événements typé, minimaliste et synchrone.
 *
 * Il transporte les *commandes* et *notifications ponctuelles* entre l'interface React
 * et le moteur 3D (l'état durable, lui, vit dans le store Zustand — voir `store.ts`).
 * Le typage garantit qu'un émetteur et un abonné s'accordent sur la forme de la charge utile.
 */
type Handler<T> = (payload: T) => void;

export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** Abonne `handler` à `type`. Retourne une fonction de désabonnement. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  /** Abonnement à usage unique. */
  once<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  /**
   * Émet un événement. Les exceptions d'un abonné sont isolées (journalisées) pour
   * qu'un composant défaillant ne casse pas la chaîne des autres abonnés.
   */
  emit<K extends keyof Events>(
    type: K,
    ...payload: Events[K] extends undefined ? [payload?: Events[K]] : [payload: Events[K]]
  ): void {
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload[0] as Events[K]);
      } catch (error) {
        console.error(`[EventBus] Erreur dans un abonné de « ${String(type)} » :`, error);
      }
    }
  }

  /** Supprime tous les abonnés (utilisé au démontage de l'application et dans les tests). */
  clear(): void {
    this.handlers.clear();
  }
}
