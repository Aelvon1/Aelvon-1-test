/**
 * Machine à états de l'application.
 *
 *   loading → home → exploration ⇄ inventory → transition → inspection → transition → exploration
 *                         ⇅ paused                                   ⇅ inventory (changer d'objet)
 */
export type AppPhase =
  'loading' | 'home' | 'exploration' | 'paused' | 'inventory' | 'transition' | 'inspection';

/** Transitions autorisées (source → cibles). */
export const PHASE_TRANSITIONS: Readonly<Record<AppPhase, readonly AppPhase[]>> = {
  loading: ['home', 'exploration', 'transition'],
  home: ['exploration', 'transition'],
  exploration: ['paused', 'inventory', 'transition', 'home'],
  paused: ['exploration', 'home'],
  inventory: ['exploration', 'transition', 'inspection'],
  transition: ['inspection', 'exploration', 'home'],
  inspection: ['transition', 'inventory', 'exploration', 'home'],
};

export function canTransition(from: AppPhase, to: AppPhase): boolean {
  return from === to || PHASE_TRANSITIONS[from].includes(to);
}
