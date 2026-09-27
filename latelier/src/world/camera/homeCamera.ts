/**
 * Travelling de l'écran d'accueil : boucle lente et déterministe (fonction pure du temps).
 *
 * Plan-séquence de ~70 s : vue large depuis la porte → approche de l'établi et du tapis →
 * panoramique vers la fenêtre pluvieuse → gros plan sur la pluie → contre-plongée vers le néon →
 * recul. Positions et cibles suivent deux courbes de Catmull-Rom fermées (C1), avec un très
 * léger flottement « caméra à l'épaule ». Aucune allocation : le résultat est écrit dans `out`.
 */

export type Vec3Array = [number, number, number];

export interface HomeCameraKey {
  position: Vec3Array;
  target: Vec3Array;
}

/** Images clés (repère monde, voir `layout.ts`). */
export const HOME_CAMERA_KEYS: readonly HomeCameraKey[] = [
  { position: [1.55, 1.78, 1.5], target: [-0.85, 1.05, -1.55] },
  { position: [0.55, 1.6, 0.35], target: [-0.8, 0.98, -1.58] },
  { position: [-0.3, 1.36, -0.6], target: [-0.85, 0.97, -1.62] },
  { position: [-1.0, 1.42, -0.42], target: [-2.5, 1.45, -0.7] },
  { position: [-1.5, 1.5, 0.2], target: [-2.5, 1.5, -0.75] },
  { position: [-0.9, 1.3, 0.72], target: [-0.8, 2.35, -1.5] },
  { position: [0.6, 1.55, 1.3], target: [-0.5, 1.6, -1.2] },
];

/** Durée d'un segment entre deux clés (s). */
export const HOME_SEGMENT_SECONDS = 10;
/** Champ de vision vertical du travelling (°). */
export const HOME_CAMERA_FOV = 55;

export interface HomeCameraPose {
  position: Vec3Array;
  target: Vec3Array;
}

/** Catmull-Rom uniforme, composante par composante. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Pose de la caméra d'accueil au temps `time` (s), écrite dans `out`. */
export function homeCameraPose(
  time: number,
  out: HomeCameraPose,
  keys: readonly HomeCameraKey[] = HOME_CAMERA_KEYS,
): HomeCameraPose {
  const n = keys.length;
  const loop = n * HOME_SEGMENT_SECONDS;
  const u = ((time % loop) + loop) % loop;
  const seg = Math.floor(u / HOME_SEGMENT_SECONDS);
  // Lissage de la vitesse dans chaque segment : légère insistance sur chaque plan.
  const raw = (u - seg * HOME_SEGMENT_SECONDS) / HOME_SEGMENT_SECONDS;
  const t = raw + Math.sin(raw * Math.PI * 2) * -0.06;
  const k0 = keys[(seg - 1 + n) % n]!;
  const k1 = keys[seg]!;
  const k2 = keys[(seg + 1) % n]!;
  const k3 = keys[(seg + 2) % n]!;
  for (let i = 0; i < 3; i++) {
    out.position[i] = catmullRom(k0.position[i]!, k1.position[i]!, k2.position[i]!, k3.position[i]!, t);
    out.target[i] = catmullRom(k0.target[i]!, k1.target[i]!, k2.target[i]!, k3.target[i]!, t);
  }
  // Flottement « à l'épaule » (quelques millimètres, fréquences incommensurables).
  out.position[0] += Math.sin(time * 0.53) * 0.01;
  out.position[1] += Math.sin(time * 0.71 + 1.3) * 0.007;
  out.position[2] += Math.sin(time * 0.43 + 2.1) * 0.009;
  out.target[1] += Math.sin(time * 0.37 + 0.4) * 0.01;
  return out;
}
