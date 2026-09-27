/**
 * Générateur `noise` : bruit fractal périodique en niveaux de gris (ou coloré par deux teintes).
 * Paramètres : { scale?: number (cellules, défaut 8), octaves?: number (défaut 5),
 *               persistence?: number (défaut 0.5), low?: [r,g,b], high?: [r,g,b] (0..255) }.
 */
import type { Generator } from './types';
import { fbm } from './random';

export interface NoiseParams {
  scale?: number;
  octaves?: number;
  persistence?: number;
  low?: readonly [number, number, number];
  high?: readonly [number, number, number];
}

export const noise: Generator<NoiseParams | undefined> = ({ width, height, params, seed }) => {
  const scale = params?.scale ?? 8;
  const octaves = params?.octaves ?? 5;
  const persistence = params?.persistence ?? 0.5;
  const low = params?.low ?? [0, 0, 0];
  const high = params?.high ?? [255, 255, 255];
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = fbm(x / width, y / height, scale, octaves, seed, persistence);
      const i = (y * width + x) * 4;
      out[i] = low[0] + (high[0] - low[0]) * n;
      out[i + 1] = low[1] + (high[1] - low[1]) * n;
      out[i + 2] = low[2] + (high[2] - low[2]) * n;
      out[i + 3] = 255;
    }
  }
  return out;
};
