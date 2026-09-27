/**
 * Couleurs en nœuds TSL (espace linéaire de travail) et petites opérations de teinte.
 */
import * as THREE from 'three/webgpu';
import { dot, float, mix, vec3 } from 'three/tsl';
import type { ColorInput, FloatInput, Vec3Node } from './types';

/** Couleur three.js (hex sRGB, chaîne CSS, `Color`) → nœud vec3 linéaire. */
export function rgb(value: THREE.ColorRepresentation): Vec3Node {
  const c = new THREE.Color(value);
  return vec3(c.r, c.g, c.b);
}

/** Accepte un nœud ou une valeur three.js. */
export function toColorNode(value: ColorInput): Vec3Node {
  return typeof value === 'object' && value !== null && 'isNode' in value ? value : rgb(value);
}

/** Luminance (Rec. 709, espace linéaire). */
export function luma(c: Vec3Node) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/** Désaturation partielle (0 = inchangé, 1 = gris). */
export function desaturate(c: Vec3Node, amount: FloatInput): Vec3Node {
  return mix(c, vec3(luma(c)), amount);
}

/**
 * Variation « peinte à la main » : module la luminosité autour de 1 (`v` ∈ [0, 1], 0,5 = neutre)
 * et décale légèrement la teinte vers le chaud dans les zones claires.
 */
export function paintVariation(c: Vec3Node, v: FloatInput, amount: FloatInput): Vec3Node {
  const k = (typeof v === 'number' ? float(v) : v).sub(0.5).mul(amount);
  return c.mul(vec3(k.mul(1.1).add(1), k.add(1), k.mul(0.85).add(1)));
}
