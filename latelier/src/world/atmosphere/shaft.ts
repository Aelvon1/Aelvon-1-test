/**
 * Faisceau de lumière du jour entrant par la fenêtre (géométrie partagée par l'éclairage, la
 * brume volumétrique et la poussière). Logique pure.
 *
 * « Espace du faisceau » : un point p se projette le long de la direction de la lumière `dir`
 * sur le plan de la fenêtre (x = planeX) → coordonnées (qy, qz) ; `s` est la distance parcourue
 * depuis ce plan. p est éclairé si s ≥ 0 et (qy, qz) tombe dans un carreau (hors petits bois).
 * Cette transformation étant affine, un rayon de vue reste une droite dans cet espace : son
 * intersection avec le faisceau se calcule par la méthode des dalles (exacte).
 */
import { WINDOW } from '../layout';
import { WINDOW_DETAIL } from '../room/dims';

export interface WindowShaft {
  /** Direction de propagation de la lumière (normalisée, vers l'intérieur). */
  dir: readonly [number, number, number];
  planeX: number;
  z: readonly [number, number];
  y: readonly [number, number];
  /** Axes des petits bois verticaux (z) et horizontaux (y). */
  barsZ: readonly number[];
  barsY: readonly number[];
  barWidth: number;
}

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Faisceau de la fenêtre ouest (ciel couvert en hauteur, légèrement venu du nord-ouest). */
export function createWindowShaft(): WindowShaft {
  const z0 = WINDOW.z[0] + WINDOW_DETAIL.frameWidth;
  const z1 = WINDOW.z[1] - WINDOW_DETAIL.frameWidth;
  const y0 = WINDOW.y[0] + WINDOW_DETAIL.bottomRail;
  const y1 = WINDOW.y[1] - WINDOW_DETAIL.frameWidth;
  const barsZ: number[] = [];
  for (let k = 1; k < WINDOW_DETAIL.cols; k++) barsZ.push(z0 + ((z1 - z0) * k) / WINDOW_DETAIL.cols);
  const barsY: number[] = [];
  for (let k = 1; k < WINDOW_DETAIL.rows; k++) barsY.push(y0 + ((y1 - y0) * k) / WINDOW_DETAIL.rows);
  return {
    dir: normalize3([0.82, -0.52, 0.2]),
    planeX: WINDOW.x,
    z: [z0, z1],
    y: [y0, y1],
    barsZ,
    barsY,
    barWidth: WINDOW_DETAIL.muntinWidth,
  };
}

/** Coordonnées du point dans l'espace du faisceau : [s, qy, qz]. */
export function toShaftSpace(
  shaft: WindowShaft,
  p: readonly [number, number, number],
): [number, number, number] {
  const [dx, dy, dz] = shaft.dir;
  const s = (p[0] - shaft.planeX) / dx;
  return [s, p[1] - s * dy, p[2] - s * dz];
}

/** Le point est-il dans le faisceau (petits bois exclus) ? */
export function shaftContains(shaft: WindowShaft, p: readonly [number, number, number]): boolean {
  const [s, qy, qz] = toShaftSpace(shaft, p);
  if (s < 0 || qy < shaft.y[0] || qy > shaft.y[1] || qz < shaft.z[0] || qz > shaft.z[1]) return false;
  const hw = shaft.barWidth / 2;
  for (const z of shaft.barsZ) if (Math.abs(qz - z) < hw) return false;
  for (const y of shaft.barsY) if (Math.abs(qy - y) < hw) return false;
  return true;
}

/** Tache lumineuse au sol : rectangle englobant (x, z) de l'empreinte du faisceau à y = 0. */
export function shaftFloorFootprint(shaft: WindowShaft): { x: [number, number]; z: [number, number] } {
  const [dx, dy, dz] = shaft.dir;
  const corners: [number, number][] = [];
  for (const y of shaft.y) {
    for (const z of shaft.z) {
      const s = -y / dy;
      corners.push([shaft.planeX + s * dx, z + s * dz]);
    }
  }
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return { x: [Math.min(...xs), Math.max(...xs)], z: [Math.min(...zs), Math.max(...zs)] };
}
