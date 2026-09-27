/**
 * Générateur `wood` : bois (couleur sRGB dans RGB, relief dans A ; périodique).
 *
 * Le fil du bois suit l'axe U (horizontal). Deux styles :
 * - `planks` : lamellé-collé d'établi (lames de largeurs égales le long de V, joints sombres,
 *   teinte propre à chaque lame, cernes « en cathédrale ») ;
 * - `plywood` : contreplaqué déroulé (bouleau) : veinage large et ondulé, contraste faible.
 *
 * Paramètres : { style?: 'planks', planks?: 5, rings?: 7 (cernes par lame), light?: '#aa8056',
 * dark?: '#604028', knots?: 2, wear?: 0.5 (usure claire au centre + crasse dans les joints),
 * stains?: 3 (auréoles de tasse et taches d'huile) }.
 */
import type { Generator } from './types';
import {
  type RGB,
  clamp01,
  fbmField,
  addValueNoise,
  mixRGB,
  normalize,
  num,
  parseRGB,
  raw,
  rng,
  smoothstep,
  stampRadial,
  str,
  wrapIndex,
} from './field';

interface Knot {
  x: number;
  y: number;
  r: number;
}

export const wood: Generator = ({ width, height, params, seed }) => {
  const style = str(params, 'style', 'planks');
  const plywood = style === 'plywood';
  const planks = plywood ? 1 : Math.max(1, Math.round(num(params, 'planks', 5)));
  const rings = num(params, 'rings', plywood ? 4 : 7);
  const light: RGB = parseRGB(raw(params, 'light'), plywood ? [200, 172, 132] : [170, 128, 86]);
  const dark: RGB = parseRGB(raw(params, 'dark'), plywood ? [150, 112, 74] : [96, 64, 40]);
  const knotCount = Math.round(num(params, 'knots', plywood ? 1 : 2));
  const wear = num(params, 'wear', plywood ? 0.15 : 0.5);
  const stainCount = Math.round(num(params, 'stains', plywood ? 0 : 3));
  const rand = rng(seed, 13);

  // Déformations du veinage (périodiques), pores étirés le long du fil.
  const warp = fbmField(width, height, {
    scale: plywood ? 2 : 2,
    scaleY: plywood ? 4 : 10,
    octaves: 4,
    seed,
  });
  const warpFine = fbmField(width, height, { scale: 4, scaleY: 32, octaves: 3, seed: seed + 3 });
  const pores = new Float32Array(width * height);
  addValueNoise(pores, width, height, 24, Math.min(height, 512), seed + 5, 0.6);
  addValueNoise(pores, width, height, 48, Math.min(height, 1024), seed + 6, 0.4);
  normalize(pores);
  const tone = fbmField(width, height, { scale: 3, octaves: 4, seed: seed + 7 });
  const grime = fbmField(width, height, { scale: 6, octaves: 5, seed: seed + 8 });

  // Paramètres propres à chaque lame.
  const plankTint: number[] = [];
  const plankOffset: number[] = [];
  const plankArch: number[] = [];
  const plankWave: number[] = [];
  for (let p = 0; p < planks; p++) {
    plankTint.push((rand() - 0.5) * 0.35);
    plankOffset.push(rand() * 10);
    plankArch.push(0.35 + rand() * 0.45);
    plankWave.push(1 + Math.floor(rand() * 2));
  }
  const knots: Knot[] = [];
  for (let k = 0; k < knotCount; k++) {
    knots.push({ x: rand() * width, y: rand() * height, r: (0.015 + rand() * 0.02) * width });
  }

  // Voûte des cernes par lame et par colonne (précalculée : évite un sinus par pixel).
  const archTable = new Float32Array(planks * width);
  for (let p = 0; p < planks; p++) {
    for (let x = 0; x < width; x++) {
      archTable[p * width + x] =
        plankArch[p]! *
        (0.75 + 0.25 * Math.sin(2 * Math.PI * ((x / width) * plankWave[p]! + plankOffset[p]!)));
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const plankH = height / planks;
  for (let y = 0; y < height; y++) {
    const p = Math.min(planks - 1, Math.floor(y / plankH));
    const ly = (y - p * plankH) / plankH; // 0..1 dans la lame
    // Joint entre lames (sombre, creux).
    const seamDist = Math.min(ly, 1 - ly) * plankH;
    const seam = plywood ? 0 : smoothstep(2.2, 0.4, seamDist);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      // Cernes en cathédrale : distance à un axe fictif sous la surface, modulée le long du fil.
      const arch = archTable[p * width + x]!;
      const dy = (ly - 0.5) * (plywood ? 3 : 1.2);
      let ringCoord = Math.sqrt(dy * dy + arch * arch) + (warp[i]! - 0.5) * (plywood ? 1.2 : 0.35);
      ringCoord += (warpFine[i]! - 0.5) * 0.04;
      // Nœuds : distorsion locale des cernes + cœur sombre.
      let knotCore = 0;
      for (const k of knots) {
        const kx = wrapDelta(x - k.x, width);
        const ky = wrapDelta(y - k.y, height);
        const d2 = (kx * kx) / (k.r * k.r * 4) + (ky * ky) / (k.r * k.r);
        if (d2 < 16) {
          ringCoord += Math.exp(-d2 * 0.5) * 0.25;
          knotCore = Math.max(knotCore, smoothstep(1.2, 0.3, Math.sqrt(d2)));
        }
      }
      const t = frac(ringCoord * rings + plankOffset[p]!);
      // Bois final (sombre) : transition nette puis retour brutal au bois de printemps.
      const late = smoothstep(0.62, 0.9, t) * smoothstep(1, 0.92, t);
      const poreDark = smoothstep(0.55, 0.9, pores[i]!) * 0.5;
      const streak = (pores[i]! - 0.5) * 0.35;
      let shade = clamp01(
        0.18 + late * 0.55 + poreDark * 0.3 + streak + (tone[i]! - 0.5) * 0.4 + plankTint[p]!,
      );
      shade = clamp01(shade + knotCore * 0.7);
      let c = mixRGB(light, dark, shade);
      // Usure : zone centrale éclaircie et désaturée ; crasse près des joints.
      const centerWear = wear * smoothstep(0.55, 0.05, Math.abs(ly - 0.5) * (plywood ? 1 : 0.6)) * tone[i]!;
      c = mixRGB(c, [c[0] * 1.08 + 12, c[1] * 1.06 + 10, c[2] * 1.04 + 8], clamp01(centerWear));
      const dirt = clamp01(seam * 0.8 + wear * smoothstep(0.55, 0.85, grime[i]!) * 0.4);
      c = mixRGB(c, [c[0] * 0.45, c[1] * 0.4, c[2] * 0.36], dirt);
      out[i * 4] = c[0];
      out[i * 4 + 1] = c[1];
      out[i * 4 + 2] = c[2];
      // Relief : bois final légèrement en saillie (érosion du bois de printemps), pores et joints creux.
      out[i * 4 + 3] = clamp01(0.55 + late * 0.2 - poreDark * 0.4 - seam * 0.5) * 255;
    }
  }

  // Taches : auréoles de tasse (anneau sombre) et taches d'huile (disque sombre diffus).
  const stainField = new Float32Array(width * height);
  for (let s = 0; s < stainCount; s++) {
    const cx = rand() * width;
    const cy = rand() * height;
    const ring = rand() < 0.5;
    const r = (ring ? 0.04 : 0.05 + rand() * 0.05) * width;
    const strength = ring ? 0.12 + rand() * 0.1 : 0.2 + rand() * 0.2;
    stampRadial(stainField, width, height, cx, cy, r, (d, lx, ly) => {
      if (ring) {
        const angle = Math.atan2(ly, lx);
        const wobble = 0.03 * Math.sin(angle * 5 + s);
        const band = smoothstep(0.16, 0.0, Math.abs(d - 0.84 - wobble)) + smoothstep(0.85, 0.0, d) * 0.15;
        const gap = smoothstep(-0.4, 0.2, Math.sin(angle + s * 1.7));
        return band * gap * strength;
      }
      return smoothstep(1, 0.3, d) * strength * 0.8;
    });
  }
  for (let i = 0; i < stainField.length; i++) {
    const a = stainField[i]!;
    if (a <= 0) continue;
    const k = 1 - a;
    out[i * 4] = out[i * 4]! * k;
    out[i * 4 + 1] = out[i * 4 + 1]! * k;
    out[i * 4 + 2] = out[i * 4 + 2]! * k * 0.97;
  }
  return out;
};

const frac = (v: number): number => v - Math.floor(v);

/** Écart signé le plus court sur un tore de période `n`. */
const wrapDelta = (d: number, n: number): number => {
  const m = wrapIndex(d, n);
  return m > n / 2 ? m - n : m;
};
