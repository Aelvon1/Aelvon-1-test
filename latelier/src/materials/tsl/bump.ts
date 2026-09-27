/**
 * Relief procédural : normale perturbée à partir d'une hauteur quelconque (texture, bruit,
 * combinaison), par la méthode du gradient de surface de Mikkelsen (« Bump Mapping
 * Unparametrized Surfaces on the GPU »).
 *
 * Différence avec `bumpMap` de three r186 : celui-ci normalise les dérivées de position, ce qui
 * rend l'intensité du relief dépendante de la distance (il s'efface en vue macro). Ici les
 * dérivées NE sont PAS normalisées : `strength` est une amplitude en mètres (hauteur 1 ⇒
 * `strength` m) et la pente obtenue est la même à toute distance — indispensable pour le zoom
 * macro. Aucune UV ni tangente n'est requise.
 *
 * Approximation : dérivées écran (par bloc de 2×2 pixels) ; au loin le relief fin crénelle un peu
 * (les mipmaps des textures l'atténuent).
 */
import { abs, cross, dFdx, dFdy, dot, faceDirection, normalView, normalize, positionView, sign } from 'three/tsl';
import type { FloatInput, FloatNode, Vec3Node } from './types';

/** Normale (repère vue) perturbée par `height` × `strength` (m). À affecter à `normalNode`. */
export function bumpNormal(height: FloatNode, strength: FloatInput): Vec3Node {
  const n = normalView;
  const dpdx = dFdx(positionView);
  const dpdy = dFdy(positionView);
  const h = height.mul(strength);
  const dhdx = dFdx(h);
  const dhdy = dFdy(h);
  const r1 = cross(dpdy, n);
  const r2 = cross(n, dpdx);
  const det = dot(dpdx, r1).mul(faceDirection);
  const surfGrad = r1.mul(dhdx).add(r2.mul(dhdy)).mul(sign(det));
  return normalize(n.mul(abs(det)).sub(surfGrad));
}
