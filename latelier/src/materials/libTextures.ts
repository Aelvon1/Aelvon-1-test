/**
 * Textures procédurales partagées par la bibliothèque de matériaux (clés préfixées `lib/`).
 *
 * Chaque texture est définie une fois (générateur, paramètres, taille de référence, espace
 * colorimétrique) ; la taille réelle suit le profil de qualité (`QUALITY_PROFILES.textureSize`) :
 * Bas = ½, Moyen/Élevé = référence, Ultra = ×2 (plafonnée par le profil). Les textures sont
 * demandées paresseusement : seules celles qu'utilisent les matériaux effectivement créés sont
 * générées.
 */
import type * as THREE from 'three/webgpu';
import { QUALITY_PROFILES } from '../core/quality';
import type { TextureRequest, TextureService } from '../textures/types';

interface LibTextureDef {
  generator: TextureRequest['generator'];
  params?: unknown;
  /** Taille de référence (qualité Élevée) : [largeur, hauteur]. */
  size: readonly [number, number];
  colorSpace: 'srgb' | 'linear';
  wrap?: TextureRequest['wrap'];
  seed?: number;
}

/**
 * Catalogue. Conventions de canaux : voir chaque générateur (`textures/generators/<nom>.ts`).
 */
export const LIB_TEXTURES = {
  /** Bruit multi-échelle : R = large, G = moyen, B = fin, A = très large (données). */
  noise: {
    generator: 'noise',
    params: {
      layers: [
        { scale: 4, octaves: 5 },
        { scale: 16, octaves: 4 },
        { scale: 64, octaves: 3 },
        { scale: 2, octaves: 4 },
      ],
    },
    size: [512, 512],
    colorSpace: 'linear',
  },
  grunge: { generator: 'grunge', params: { scale: 4 }, size: [1024, 1024], colorSpace: 'linear' },
  scratches: { generator: 'scratches', params: {}, size: [1024, 1024], colorSpace: 'linear' },
  brushed: { generator: 'brushed', params: {}, size: [1024, 1024], colorSpace: 'linear' },
  paint: { generator: 'paint', params: {}, size: [1024, 1024], colorSpace: 'linear' },
  /** Peinture au rouleau (murs) : touches longues et verticales. */
  'paint.roller': {
    generator: 'paint',
    params: { direction: Math.PI / 2, spread: 0.12, length: 0.3, width: 0.08, strokes: 260, bristles: 0.3 },
    size: [1024, 1024],
    colorSpace: 'linear',
  },
  rust: { generator: 'rust', params: {}, size: [1024, 1024], colorSpace: 'linear' },
  concrete: { generator: 'concrete', params: {}, size: [1024, 1024], colorSpace: 'linear' },
  'wood.bench': { generator: 'wood', params: { style: 'planks', planks: 5 }, size: [1024, 1024], colorSpace: 'srgb' },
  'wood.plywood': { generator: 'wood', params: { style: 'plywood' }, size: [1024, 1024], colorSpace: 'srgb' },
  cardboard: { generator: 'cardboard', params: {}, size: [1024, 1024], colorSpace: 'srgb' },
  /** Taffetas fin (fibre de verre, âme FR4). */
  'weave.glass': {
    generator: 'weave',
    params: { pattern: 'plain', threads: 24, gap: 0.12, flat: 0.55, fiber: 0.7, irregularity: 0.1 },
    size: [512, 512],
    colorSpace: 'linear',
  },
  /** Sergé 2/2 à mèches plates (carbone). */
  'weave.carbon': {
    generator: 'weave',
    params: { pattern: 'twill', over: 2, threads: 8, gap: 0.03, flat: 0.9, fiber: 0.45, irregularity: 0.06 },
    size: [512, 512],
    colorSpace: 'linear',
  },
  /** Toile de coton (chiffon). */
  'weave.cloth': {
    generator: 'weave',
    params: { pattern: 'plain', threads: 40, gap: 0.1, flat: 0.3, fiber: 0.8, irregularity: 0.25 },
    size: [512, 512],
    colorSpace: 'linear',
  },
  /** Natté grossier (tapis). */
  'weave.rug': {
    generator: 'weave',
    params: { pattern: 'basket', threads: 16, gap: 0.06, flat: 0.2, fiber: 0.9, irregularity: 0.3 },
    size: [512, 512],
    colorSpace: 'linear',
  },
  raindrops: { generator: 'raindrops', params: {}, size: [1024, 1024], colorSpace: 'linear' },
  forest: { generator: 'forest', params: {}, size: [2048, 1024], colorSpace: 'srgb', wrap: 'mirror' },
} as const satisfies Record<string, LibTextureDef>;

export type LibTextureName = keyof typeof LIB_TEXTURES;

const PRESETS = ['low', 'medium', 'high', 'ultra'] as const;

/** Taille effective d'une texture de la bibliothèque selon la qualité (0 = Bas … 3 = Ultra). */
export function libTextureSize(base: readonly [number, number], quality: 0 | 1 | 2 | 3): [number, number] {
  const cap = QUALITY_PROFILES[PRESETS[quality]].textureSize;
  const factor = quality === 0 ? 0.5 : quality === 3 ? 2 : 1;
  const fit = (v: number) => Math.max(64, Math.min(cap, Math.round(v * factor)));
  // Conserve le rapport largeur/hauteur si le plafond s'applique.
  const w = fit(base[0]);
  const h = Math.max(64, Math.round((w / base[0]) * base[1]));
  return [w, h];
}

export const libTextureKey = (name: LibTextureName): string => `lib/${name}`;

/** Demande (ou retrouve) une texture de la bibliothèque. */
export function libTexture(textures: TextureService, quality: 0 | 1 | 2 | 3, name: LibTextureName): THREE.Texture {
  const def: LibTextureDef = LIB_TEXTURES[name];
  const [width, height] = libTextureSize(def.size, quality);
  return textures.get({
    key: libTextureKey(name),
    generator: def.generator,
    width,
    height,
    params: def.params,
    colorSpace: def.colorSpace,
    wrap: def.wrap ?? 'repeat',
    seed: def.seed,
  });
}
