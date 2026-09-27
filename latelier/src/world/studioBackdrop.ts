/**
 * Fond studio neutre (mode inspection « fond neutre ») : dégradé de cyclorama en TSL, gris
 * chaud légèrement plus clair au centre, assombri vers les bords et vers le haut, avec un
 * grain très fin pour éviter les bandes de quantification.
 */
import { float, length, mix, screenUV, smoothstep, vec2, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { hash12 } from './materials/tslNoise';

export function createStudioBackdrop(): Node<'vec3'> {
  const uv = screenUV;
  // Horizon du cyclorama un peu sous le centre de l'écran (screenUV.y = 0 en haut) :
  // mur courbe sombre en haut, sol plus clair en bas.
  const floorTone = vec3(0.23, 0.225, 0.215);
  const wallTone = vec3(0.12, 0.118, 0.115);
  const base = mix(wallTone, floorTone, smoothstep(0.3, 0.9, uv.y));
  const radial = length(uv.sub(vec2(0.5, 0.58)).mul(vec2(1.4, 1.0)));
  const vignette = smoothstep(0.95, 0.2, radial).mul(0.55).add(0.45);
  const dither = hash12(uv.mul(1731.7)).sub(0.5).mul(0.004);
  return base.mul(vignette).add(float(dither));
}
