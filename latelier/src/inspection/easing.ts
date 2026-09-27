/**
 * Fonctions d'interpolation du moteur d'inspection (pures, sans three.js).
 * Toutes prennent u ∈ [0, 1] (bornées) et retournent une valeur dans [0, 1] sauf mention.
 */

export const clamp01 = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u);

/** Progression locale de `u` dans l'intervalle [a, b], bornée à [0, 1]. */
export const segment = (u: number, a: number, b: number): number => (b <= a ? (u >= b ? 1 : 0) : clamp01((u - a) / (b - a)));

export const easeInOutCubic = (u: number): number => {
  const t = clamp01(u);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

export const easeOutCubic = (u: number): number => 1 - (1 - clamp01(u)) ** 3;
export const easeInCubic = (u: number): number => clamp01(u) ** 3;
export const easeInQuad = (u: number): number => clamp01(u) ** 2;
export const easeOutQuad = (u: number): number => 1 - (1 - clamp01(u)) ** 2;
export const easeInOutSine = (u: number): number => -(Math.cos(Math.PI * clamp01(u)) - 1) / 2;
export const smoothstep = (u: number): number => {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
};

/**
 * Profil de vitesse trapézoïdal intégré : accélération sur [0, a], vitesse constante, puis
 * décélération sur [1 − a, 1]. Retourne la position normalisée (0 → 1), monotone.
 */
export function trapezoid(u: number, a = 0.2): number {
  const t = clamp01(u);
  const acc = Math.min(Math.max(a, 1e-4), 0.5);
  // Vitesse de croisière v telle que l'aire totale vaille 1 : v · (1 − acc) = 1.
  const v = 1 / (1 - acc);
  if (t < acc) return (0.5 * v * t * t) / acc;
  if (t > 1 - acc) {
    const r = 1 - t;
    return 1 - (0.5 * v * r * r) / acc;
  }
  return 0.5 * v * acc + v * (t - acc);
}

/**
 * Rebond amorti (pose d'un objet) : 0 → 1 avec un petit rebond de hauteur relative `bounce`.
 * Retourne une HAUTEUR relative (1 = hauteur de départ, 0 = posé).
 */
export function dropHeight(u: number, bounce = 0.08): number {
  const t = clamp01(u);
  const hit = 0.62;
  if (t < hit) {
    const k = t / hit;
    return 1 - k * k;
  }
  const k = (t - hit) / (1 - hit);
  return bounce * Math.sin(Math.PI * k) * (1 - k * 0.5);
}
