/**
 * Mathématiques de la caméra d'inspection (fonctions pures, testées sans navigateur).
 *
 * Paramétrage orbital : cible T, azimut a (autour de Y, 0 = caméra côté +Z), élévation e
 * (0 = horizon, +π/2 = à la verticale au-dessus) et distance d. Position de la caméra :
 *   C = T + d · (cos e · sin a, sin e, cos e · cos a).
 *
 * Zoom vers un point P (sous le curseur) : homothétie de centre P et de rapport s appliquée à la
 * caméra ET à la cible. L'orientation est inchangée et P, fixe par l'homothétie, garde sa
 * position à l'écran ; la cible glisse vers P (T' − P = s · (T − P)).
 */
import * as THREE from 'three/webgpu';

/** Élévation maximale (évite le blocage de cardan au zénith). */
export const MAX_ELEVATION = THREE.MathUtils.degToRad(88);
/** Élévation minimale (vue légèrement par en dessous possible si l'objet est surélevé). */
export const MIN_ELEVATION = THREE.MathUtils.degToRad(-60);

/** Profondeur inversée : near minimal (m). La précision flottante reste quasi uniforme. */
export const NEAR_MIN_REVERSED = 1e-5;
/**
 * Profondeur standard (WebGL2 sans EXT_clip_control) : rapport far/near maximal. La précision
 * d'un tampon 24 bits se dégrade en z²/near : au-delà de ~1e4, le fond de la pièce scintille.
 */
export const MAX_DEPTH_RATIO_STANDARD = 1e4;
/**
 * Fraction de la distance libre (distance de la caméra à la surface la plus proche) utilisée
 * comme plan near : le point le plus proche du tronc de vision est à une profondeur ≥ distance
 * libre × cos(demi-diagonale du champ) ≈ 0,84 × distance libre pour un champ de 35° en 16:9.
 */
export const NEAR_CLEARANCE_FACTOR = 0.75;
/** Plan near maximal (vue d'ensemble). */
export const NEAR_MAX = 0.05;

/** Écrit dans `out` le décalage cible → caméra. */
export function orbitOffset(
  azimuth: number,
  elevation: number,
  distance: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ce = Math.cos(elevation);
  return out
    .set(ce * Math.sin(azimuth), Math.sin(elevation), ce * Math.cos(azimuth))
    .multiplyScalar(distance);
}

/** Azimut et élévation d'une direction cible → caméra (non nécessairement normée). */
export function orbitAngles(
  direction: THREE.Vector3,
  out: { azimuth: number; elevation: number },
): { azimuth: number; elevation: number } {
  const len = direction.length();
  if (len < 1e-12) {
    out.azimuth = 0;
    out.elevation = 0;
    return out;
  }
  out.azimuth = Math.atan2(direction.x, direction.z);
  out.elevation = Math.asin(THREE.MathUtils.clamp(direction.y / len, -1, 1));
  return out;
}

/** Ramène un angle dans ]−π, π]. */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t <= 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/** Écart angulaire le plus court de `from` vers `to`. */
export function shortestAngle(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Facteur d'amortissement exponentiel indépendant de la cadence : 1 − e^(−k·dt). */
export function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * Math.max(0, dt));
}

/** Distance de cadrage pour qu'une sphère de rayon `radius` tienne dans le champ de vision. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, margin = 1.25): number {
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.2, aspect));
  const fov = Math.min(vFov, hFov);
  return (Math.max(radius, 1e-4) * margin) / Math.sin(fov / 2);
}

/** Taille d'un pixel écran (m) à la distance `distance` pour un champ vertical `fovDeg`. */
export function worldPerPixel(distance: number, fovDeg: number, viewportHeight: number): number {
  return (2 * distance * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)) / Math.max(1, viewportHeight);
}

/**
 * Facteur multiplicatif de distance pour un cran de molette (zoom exponentiel). `deltaY` > 0 =
 * éloignement. Les modes « ligne » et « page » sont ramenés à des pixels.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, sensitivity = 0.0018): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(THREE.MathUtils.clamp(pixels, -400, 400) * sensitivity);
}

/** Clic simple : déplacement < 4 px et durée < 300 ms. */
export function isClick(dx: number, dy: number, durationMs: number): boolean {
  return dx * dx + dy * dy < 16 && durationMs < 300;
}

export interface ZoomResult {
  /** Rapport effectivement appliqué (borné par la distance minimale au point). */
  scale: number;
  distance: number;
}

/**
 * Zoom par homothétie de centre `point` : met à jour `target` (en place) et retourne la nouvelle
 * distance cible → caméra. `camera` = position courante de la caméra. Le rapport est borné pour
 * que la caméra reste à `minDistanceToPoint` du point au moins, et que la distance à la cible
 * reste dans [minDistance, maxDistance].
 */
export function zoomTowardPoint(
  target: THREE.Vector3,
  camera: THREE.Vector3,
  distance: number,
  point: THREE.Vector3,
  factor: number,
  limits: { minDistanceToPoint: number; minDistance: number; maxDistance: number },
): ZoomResult {
  let s = factor;
  const toPoint = camera.distanceTo(point);
  if (s < 1 && toPoint > 0) s = Math.max(s, Math.min(1, limits.minDistanceToPoint / toPoint));
  if (distance * s < limits.minDistance) s = Math.min(Math.max(s, limits.minDistance / distance), 1);
  if (distance * s > limits.maxDistance) s = Math.max(Math.min(s, limits.maxDistance / distance), 1);
  target.sub(point).multiplyScalar(s).add(point);
  return { scale: s, distance: distance * s };
}

export interface ClipInput {
  /** Distance de la caméra à la surface la plus proche (objet, tapis), m. */
  clearance: number;
  /** Distance nécessaire pour voir le fond de la pièce, m. */
  farDistance: number;
  /** Profondeur inversée disponible. */
  reversedDepth: boolean;
}

/**
 * Plans near/far ajustés en continu à la distance libre.
 * - Profondeur inversée (tampon flottant) : near peut descendre à 1e-5 m avec un far de
 *   plusieurs mètres, la précision relative restant ~1e-7 à toute profondeur.
 * - Profondeur standard : le rapport far/near est plafonné à 1e4 ; near ne descend donc pas
 *   sous far / 1e4 (≈ 1,2 mm pour 12 m). Compromis documenté : en vue rasante très proche, la
 *   surface la plus proche peut alors être rognée au bord bas de l'image.
 */
export function computeClipRange(input: ClipInput): { near: number; far: number } {
  const far = Math.max(1, input.farDistance);
  const wanted = Math.min(NEAR_MAX, Math.max(0, input.clearance) * NEAR_CLEARANCE_FACTOR);
  const floor = input.reversedDepth ? NEAR_MIN_REVERSED : far / MAX_DEPTH_RATIO_STANDARD;
  return { near: Math.max(floor, wanted), far };
}

/**
 * Distance libre minimale imposée à la caméra : `presentation.minSurfaceDistance`, relevée en
 * profondeur standard pour que le plan near (≥ far/1e4) ne rogne pas la surface visée.
 */
export function effectiveMinSurfaceDistance(minSurface: number, far: number, reversedDepth: boolean): number {
  if (reversedDepth) return minSurface;
  return Math.max(minSurface, far / MAX_DEPTH_RATIO_STANDARD / NEAR_CLEARANCE_FACTOR);
}

/**
 * Élévation minimale pour que la caméra reste au-dessus du plan `floorY + margin` (tapis),
 * cible en `targetY`, distance `distance`.
 */
export function minElevationAboveFloor(
  targetY: number,
  distance: number,
  floorY: number,
  margin: number,
): number {
  const ratio = (floorY + margin - targetY) / Math.max(distance, 1e-9);
  if (ratio <= -1) return MIN_ELEVATION;
  if (ratio >= 1) return MAX_ELEVATION;
  return Math.max(MIN_ELEVATION, Math.asin(ratio));
}

/** Interpolation logarithmique (distances : progression perceptuellement uniforme). */
export function lerpLog(a: number, b: number, t: number): number {
  const la = Math.log(Math.max(a, 1e-9));
  const lb = Math.log(Math.max(b, 1e-9));
  return Math.exp(la + (lb - la) * t);
}

/**
 * Distance maximale le long de `direction` (unitaire) depuis `origin` avant de sortir de la
 * boîte `bounds` (murs de la pièce). Infinity si l'origine est hors de la boîte.
 */
export function distanceInsideBox(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  bounds: THREE.Box3,
): number {
  if (!bounds.containsPoint(origin)) return Infinity;
  let t = Infinity;
  const axes = ['x', 'y', 'z'] as const;
  for (const k of axes) {
    const d = direction[k];
    if (d > 1e-12) t = Math.min(t, (bounds.max[k] - origin[k]) / d);
    else if (d < -1e-12) t = Math.min(t, (bounds.min[k] - origin[k]) / d);
  }
  return t;
}
