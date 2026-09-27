/**
 * Outils d'ordonnancement pour éviter les saccades : céder la main au navigateur pendant les
 * constructions longues (objets, textures) et étaler le travail sur plusieurs images.
 */

interface SchedulerLike {
  yield?: () => Promise<void>;
}

/** Cède la main au navigateur (rendu, entrées) puis reprend. */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerLike }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Attend la prochaine image. */
export function nextFrame(): Promise<number> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') setTimeout(() => resolve(performance.now()), 16);
    else requestAnimationFrame(resolve);
  });
}

/**
 * Découpe un travail en tranches : `maybeYield()` cède la main si le budget (ms) de la tranche
 * courante est dépassé.
 */
export class TimeSlicer {
  private sliceStart = performance.now();

  constructor(private readonly budgetMs = 8) {}

  async maybeYield(): Promise<void> {
    if (performance.now() - this.sliceStart >= this.budgetMs) {
      await yieldToMain();
      this.sliceStart = performance.now();
    }
  }

  reset(): void {
    this.sliceStart = performance.now();
  }
}

/**
 * File de tâches exécutées pendant les temps morts, avec un budget par image
 * (construction paresseuse du niveau de détail, miniatures…).
 */
export class IdleQueue {
  private readonly tasks: { run: () => void; priority: number }[] = [];

  push(run: () => void, priority = 0): void {
    this.tasks.push({ run, priority });
    this.tasks.sort((a, b) => b.priority - a.priority);
  }

  /** À appeler une fois par image : exécute des tâches tant que le budget n'est pas épuisé. */
  run(budgetMs = 3): void {
    const start = performance.now();
    while (this.tasks.length > 0 && performance.now() - start < budgetMs) {
      const task = this.tasks.shift();
      try {
        task?.run();
      } catch (error) {
        console.error('[IdleQueue] Tâche en échec :', error);
      }
    }
  }

  clear(): void {
    this.tasks.length = 0;
  }

  get size(): number {
    return this.tasks.length;
  }
}
