/**
 * Masques d'usure réutilisables (TSL) : arêtes exposées, recoins, rouille, crasse, poussière,
 * traces de doigts.
 *
 * Sources de courbure, par ordre de préférence :
 * 1. attributs géométriques optionnels calculés par `materials/geometry/edgeWear.ts` :
 *    `edgeWear` (arêtes convexes, 0..1), `cavity` (creux concaves, 0..1) et `occlusion`
 *    (1 = dégagé, 0 = enfoui) — détectés à la compilation, par géométrie ;
 * 2. à défaut, courbure estimée par les dérivées écran de la normale géométrique.
 *    Approximation : dépend de la tessellation (un chanfrein/congé doit exister dans la
 *    géométrie) et donne des transitions par triangle, que le bruit de rupture masque.
 */
import {
  Fn,
  attribute,
  dFdx,
  dFdy,
  dot,
  float,
  max,
  min,
  normalWorldGeometry,
  positionWorld,
  saturate,
  smoothstep,
} from 'three/tsl';
import type { FloatInput, FloatNode, Vec4Node } from './types';

/**
 * Courbure moyenne signée (1/m), repère monde : > 0 convexe (arête, bosse), < 0 concave (creux).
 * Sphère de rayon R → 1/R.
 */
export function surfaceCurvature(): FloatNode {
  const n = normalWorldGeometry;
  const p = positionWorld;
  const dnx = dFdx(n);
  const dny = dFdy(n);
  const dpx = dFdx(p);
  const dpy = dFdy(p);
  return dot(dnx, dpx).add(dot(dny, dpy)).div(max(dot(dpx, dpx).add(dot(dpy, dpy)), 1e-20));
}

/**
 * Arêtes convexes (0..1). `radius` (m) : rayon de congé en dessous duquel une surface compte
 * pleinement comme une arête (ex. 0,003 pour une pièce de moteur, 0,01 pour un meuble).
 */
export function edgeMask(radius = 0.004): FloatNode {
  return Fn((builder) => {
    if (builder.geometry.hasAttribute('edgeWear')) return attribute<'float'>('edgeWear', 'float');
    return saturate(surfaceCurvature().mul(radius));
  })();
}

/** Creux concaves et zones occluses (0..1). */
export function cavityMask(radius = 0.004): FloatNode {
  return Fn((builder) => {
    const geometry = builder.geometry;
    const hasCavity = geometry.hasAttribute('cavity');
    const hasOcclusion = geometry.hasAttribute('occlusion');
    if (hasCavity && hasOcclusion) {
      return max(attribute<'float'>('cavity', 'float'), float(1).sub(attribute<'float'>('occlusion', 'float')));
    }
    if (hasCavity) return attribute<'float'>('cavity', 'float');
    if (hasOcclusion) return float(1).sub(attribute<'float'>('occlusion', 'float'));
    return saturate(surfaceCurvature().mul(-radius));
  })();
}

/**
 * Seuillage d'un masque d'usure par un bruit de rupture : plus `amount` (0..1) est grand, plus
 * l'usure gagne des arêtes vers les faces (quelques éclats isolés sur les faces planes au-delà de
 * 0,7). `breakup` : bruit 0..1 (canal A de `grunge` ou `paint`).
 */
export function wearMask(mask: FloatNode, amount: FloatInput, breakup: FloatNode, softness = 0.06): FloatNode {
  const threshold = float(1).sub(amount);
  const value = mask.mul(breakup.mul(1.2).add(0.4)).add(breakup.mul(0.25));
  return smoothstep(threshold.sub(softness), threshold.add(softness), value);
}

/**
 * Rouille : d'abord dans les recoins et sur les arêtes usées, puis en plaques. `coverage` : canal
 * R de la texture `rust` ; `amount` 0..1.
 */
export function rustMask(options: {
  coverage: FloatNode;
  cavity: FloatNode;
  edges?: FloatNode;
  amount: FloatInput;
}): FloatNode {
  const edges = options.edges ?? float(0);
  const value = options.cavity
    .mul(0.75)
    .add(edges.mul(0.3))
    .add(options.coverage.sub(0.5).mul(0.9))
    .add(options.coverage.mul(0.25));
  const threshold = float(1).sub(options.amount);
  return smoothstep(threshold, threshold.add(0.12), value);
}

/** Crasse : taches larges (canal R de `grunge`) renforcées dans les creux. */
export function dirtMask(grunge: Vec4Node, cavity: FloatNode, amount: FloatInput): FloatNode {
  const stains = smoothstep(0.45, 0.85, grunge.r);
  return saturate(stains.mul(0.6).add(cavity.mul(0.8)).mul(amount));
}

/** Poussière déposée sur les faces tournées vers le haut (repère monde). */
export function dustMask(grunge: Vec4Node, amount: FloatInput): FloatNode {
  const up = smoothstep(0.35, 0.95, normalWorldGeometry.y);
  return saturate(up.mul(grunge.g.mul(0.8).add(0.2)).mul(amount));
}

/** Traces de doigts et frottis (canal B de `grunge`). */
export function fingerprintMask(grunge: Vec4Node, amount: FloatInput): FloatNode {
  return saturate(grunge.b.mul(amount));
}

/**
 * Rugosité après traces de doigts : le film gras rapproche la rugosité d'environ 0,35 (surface
 * mate → lustrée, surface polie → voilée).
 */
export function smudgeRoughness(roughness: FloatNode, fingerprints: FloatNode): FloatNode {
  return roughness.add(float(0.35).sub(roughness).mul(fingerprints));
}

/** Assombrissement près du sol (repère monde), pour le décor : `height` en mètres. */
export function groundGrime(height = 0.25): FloatNode {
  return smoothstep(height, 0, positionWorld.y);
}

/** Minimum de deux masques (raccourci lisible). */
export const both = (a: FloatNode, b: FloatNode): FloatNode => min(a, b);
