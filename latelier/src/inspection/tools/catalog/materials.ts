/**
 * Matériaux des outils : variantes de la bibliothèque de base (mêmes graphes TSL, donc mêmes
 * programmes GPU que les pièces) et deux fabriques en mappage LOCAL (fonte peinte de la presse,
 * bois du maillet) : la texture doit suivre l'outil qui bouge.
 *
 * Chaque construction d'outil reçoit ses propres instances (non partagées) : le présentateur
 * règle leur opacité (fondu d'approche) sans toucher aux matériaux des objets.
 */
import type * as THREE from 'three/webgpu';
import type { ToolBuildContext } from '../../../objects/types';
import { createPaintedMetal } from '../../../materials/factories/metal';
import { createWood } from '../../../materials/factories/workshop';

/** Couleurs des manches et poignées (marques inventées : aucune charte réelle). */
export const TOOL_COLORS = {
  red: 0xb3281f,
  yellow: 0xe0a91a,
  blue: 0x2a5b9c,
  orange: 0xd4621b,
  green: 0x1f7a50,
  charcoal: 0x2a2c30,
  black: 0x141416,
  cream: 0xe9e2cf,
  glove: 0x2d3947,
  castTeal: 0x2d5a63,
} as const;

/** Qualité de rendu transmise (facultativement) dans le contexte de construction. */
export function qualityOf(ctx: ToolBuildContext): 0 | 1 | 2 | 3 {
  const q: unknown = (ctx as { quality?: unknown }).quality;
  return q === 0 || q === 1 || q === 2 || q === 3 ? q : 2;
}

export interface ToolMaterials {
  /** Acier chrome-vanadium satiné (clés, tiges, têtes de pinces). */
  chrome(): THREE.Material;
  /** Chrome brillant (bagues, écrous, tige de piston). */
  polished(): THREE.Material;
  stainless(): THREE.Material;
  blackOxide(): THREE.Material;
  plastic(color: number, roughness?: number): THREE.Material;
  rubber(color: number): THREE.Material;
  anodized(kind: 'silver' | 'red' | 'blue' | 'black'): THREE.Material;
  machined(): THREE.Material;
  copper(): THREE.Material;
  tin(): THREE.Material;
  nylon(): THREE.Material;
  ptfe(): THREE.Material;
  silicone(): THREE.Material;
  castIron(color: number): THREE.Material;
  wood(): THREE.Material;
  /** Nitrile de gant ; alpha par sommet (fondu vers la base des doigts). */
  glove(): THREE.Material;
  /** Gaine de câble silicone ; alpha par sommet (le câble s'efface au loin). */
  cable(): THREE.Material;
}

/** Jeu de matériaux d'UNE construction d'outil (instances mises en cache par clé). */
export function toolMaterials(ctx: ToolBuildContext): ToolMaterials {
  const cache = new Map<string, THREE.Material>();
  const once = (key: string, create: () => THREE.Material): THREE.Material => {
    let m = cache.get(key);
    if (!m) {
      m = create();
      cache.set(key, m);
    }
    return m;
  };
  const env = { textures: ctx.textures, quality: qualityOf(ctx) };
  const v = ctx.materials;
  return {
    chrome: () =>
      once('chrome', () => v.variant('steel.chrome', { roughness: 0.2, name: 'outil/chrome satiné' })),
    polished: () => once('polished', () => v.variant('steel.chrome', { name: 'outil/chrome' })),
    stainless: () => once('stainless', () => v.variant('steel.stainless', { name: 'outil/inox' })),
    blackOxide: () => once('blackoxide', () => v.variant('steel.blackoxide', { name: 'outil/acier bruni' })),
    plastic: (color, roughness = 0.4) =>
      once(`plastic.${color}.${roughness}`, () =>
        v.variant('plastic.black', { color, roughness, name: 'outil/plastique' }),
      ),
    rubber: (color) =>
      once(`rubber.${color}`, () => v.variant('rubber.black', { color, name: 'outil/élastomère' })),
    anodized: (kind) =>
      once(`alu.${kind}`, () => v.variant(`alu.anodized.${kind}`, { name: `outil/alu ${kind}` })),
    machined: () => once('machined', () => v.variant('alu.machined', { name: 'outil/alu usiné' })),
    copper: () => once('copper', () => v.variant('copper.bare', { name: 'outil/cuivre' })),
    tin: () => once('tin', () => v.variant('tin', { name: 'outil/étamage' })),
    nylon: () => once('nylon', () => v.variant('plastic.nylon', { name: 'outil/nylon' })),
    ptfe: () => once('ptfe', () => v.variant('plastic.white', { roughness: 0.35, name: 'outil/PTFE' })),
    silicone: () => once('silicone', () => v.variant('silicone.black', { name: 'outil/silicone' })),
    castIron: (color) =>
      once(`cast.${color}`, () =>
        createPaintedMetal(env, {
          name: 'outil/fonte peinte',
          color,
          space: 'local',
          scale: 25,
          wear: 0.35,
          rust: 0.1,
          dirt: 0.3,
          roughness: 0.5,
          edgeRadius: 0.004,
        }),
      ),
    wood: () =>
      once('wood', () =>
        createWood(env, {
          name: 'outil/bois de manche',
          space: 'local',
          scale: 6,
          tint: 0xd9b88a,
          wear: 0.4,
        }),
      ),
    glove: () =>
      once('glove', () => {
        const m = v.variant('rubber.black', {
          color: TOOL_COLORS.glove,
          roughness: 0.6,
          name: 'outil/gant nitrile',
        });
        m.vertexColors = true;
        return m;
      }),
    cable: () =>
      once('cable', () => {
        const m = v.variant('silicone.black', { color: 0x1c1d20, name: 'outil/câble silicone' });
        m.vertexColors = true;
        return m;
      }),
  };
}
