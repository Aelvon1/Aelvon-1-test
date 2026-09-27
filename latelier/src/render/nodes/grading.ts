/**
 * Étalonnage final en espace d'affichage (après tone mapping AgX + sRGB) : split-toning
 * chaud/froid, vignettage et grain animé. Fonctions TSL pures, sans état.
 */
import type * as THREE from 'three/webgpu';
import { clamp, float, hash, length, luminance, max, mix, screenCoordinate, smoothstep, uv, vec2, vec3 } from 'three/tsl';

type FloatNode = THREE.Node<'float'>;
type Vec3Node = THREE.Node<'vec3'>;

/** Teintes multiplicatives de luminance ≈ 1 (Rec. 709) : l'étalonnage ne change pas l'exposition. */
const SHADOW_TINT: readonly [number, number, number] = [0.93, 0.99, 1.09];
const HIGHLIGHT_TINT: readonly [number, number, number] = [1.055, 1.0, 0.9];
/** Léger voile bleu-pétrole dans les noirs (évite des ombres « mortes »). */
const SHADOW_LIFT: readonly [number, number, number] = [-0.002, 0.003, 0.009];

/**
 * Split-toning discret : ombres légèrement bleutées, hautes lumières chaudes, un soupçon de
 * contraste. `strength` 0..1 (0 = identité).
 */
export function splitTone(color: Vec3Node, strength: FloatNode): Vec3Node {
  const luma = luminance(color);
  const shadowWeight = float(1).sub(smoothstep(0.02, 0.42, luma)).mul(strength);
  const highlightWeight = smoothstep(0.45, 0.95, luma).mul(strength);
  const shadowTint = mix(vec3(1), vec3(...SHADOW_TINT), shadowWeight);
  const highlightTint = mix(vec3(1), vec3(...HIGHLIGHT_TINT), highlightWeight);
  const toned = color.mul(shadowTint).mul(highlightTint).add(vec3(...SHADOW_LIFT).mul(shadowWeight));
  // Contraste doux autour du gris moyen d'affichage (AgX est volontairement plat).
  const contrasted = mix(vec3(0.46), toned, float(1).add(strength.mul(0.06)));
  return max(contrasted, vec3(0));
}

/**
 * Vignettage elliptique doux, corrigé du rapport d'aspect (`aspect` = largeur / hauteur).
 * Retourne le facteur multiplicatif (1 au centre).
 */
export function vignetteFactor(aspect: FloatNode, strength: FloatNode): FloatNode {
  const centered = uv().sub(0.5).mul(vec2(aspect.mul(0.78), 1));
  const d = length(centered);
  const falloff = smoothstep(0.32, 0.92, d);
  return float(1).sub(falloff.mul(falloff).mul(strength));
}

/**
 * Grain animé (bruit blanc par pixel, 24 motifs/s), plus visible dans les tons moyens et les
 * ombres, comme un grain argentique. Inclut le tramage anti-bandes (±½ niveau sur 8 bits) :
 * `amount` = 0 ne laisse que le tramage.
 */
export function filmGrain(color: Vec3Node, amount: FloatNode, seed: FloatNode): Vec3Node {
  const pixelSeed = screenCoordinate.x.floor().add(screenCoordinate.y.floor().mul(4096)).add(seed);
  const noise = hash(pixelSeed).sub(0.5);
  const luma = clamp(luminance(color), 0, 1);
  // Réponse en cloche : discret dans les noirs profonds et les blancs.
  const response = float(1).sub(luma.sub(0.42).abs().mul(1.4)).max(0.25);
  const grain = noise.mul(amount.mul(response).add(1 / 255));
  // Grain légèrement chromatique (bleu plus bruité, comme une émulsion).
  return color.add(vec3(grain, grain, grain.mul(1.15)));
}
