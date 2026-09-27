/**
 * Enregistrement de la bibliothèque de base (identifiants `BASE_MATERIAL_IDS`).
 *
 * Version provisoire du socle : chaque identifiant reçoit un `MeshPhysicalNodeMaterial` simple
 * (couleur, métal, rugosité). La phase « direction artistique » remplace ces fabriques par des
 * matériaux TSL complets (usure, anisotropie, clearcoat, tissage…).
 */
import * as THREE from 'three/webgpu';
import { BASE_MATERIAL_IDS, type BaseMaterialId, type MaterialLibrary } from './types';

type Simple = [color: number, metalness: number, roughness: number];

const SIMPLE: Partial<Record<BaseMaterialId, Simple>> = {
  'alu.anodized.blue': [0x2c5d73, 0.9, 0.4],
  'alu.anodized.black': [0x1d1f22, 0.85, 0.45],
  'alu.anodized.red': [0x8c2320, 0.9, 0.4],
  'alu.anodized.silver': [0xb8bcc2, 1, 0.35],
  'alu.machined': [0xc9ccd0, 1, 0.3],
  'steel.ground': [0xc4c7cc, 1, 0.2],
  'steel.blackoxide': [0x232426, 0.8, 0.45],
  'steel.zinc': [0xb9bec4, 1, 0.35],
  'steel.stainless': [0xcfd3d8, 1, 0.18],
  'steel.chrome': [0xe6e8ea, 1, 0.06],
  'steel.electrical': [0x4a4d52, 0.85, 0.5],
  'steel.spring': [0x3a4556, 0.9, 0.35],
  'copper.enamel': [0xc2702f, 1, 0.2],
  'copper.bare': [0xd08850, 1, 0.3],
  nickel: [0xc9c6bd, 1, 0.22],
  brass: [0xc9a04a, 1, 0.3],
  gold: [0xe8b64c, 1, 0.2],
  tin: [0xc9ccce, 1, 0.3],
  solder: [0xd5d7d9, 1, 0.12],
  'solder.flux': [0xb0782a, 0, 0.2],
  'fiber.glass': [0xd9d4c2, 0, 0.5],
  'fiber.carbon': [0x1a1a1c, 0.2, 0.35],
  'paper.insulation': [0xd8c9a0, 0, 0.85],
  'varnish.impregnation': [0xb46a24, 0, 0.15],
  'silicone.red': [0xa3231e, 0, 0.6],
  'silicone.black': [0x1b1b1b, 0, 0.6],
  'silicone.yellow': [0xd9b21f, 0, 0.6],
  'silicone.blue': [0x1f4fa3, 0, 0.6],
  'heatshrink.red': [0x9a1f1a, 0, 0.5],
  'heatshrink.black': [0x151515, 0, 0.5],
  'heatshrink.yellow': [0xd2ae1c, 0, 0.5],
  'heatshrink.blue': [0x1d4796, 0, 0.5],
  'plastic.black': [0x161616, 0, 0.55],
  'plastic.white': [0xe8e6e0, 0, 0.5],
  'plastic.nylon': [0xe3dcc6, 0, 0.55],
  'plastic.pbt.black': [0x121212, 0, 0.6],
  'rubber.black': [0x141414, 0, 0.85],
  'epoxy.black': [0x151516, 0, 0.6],
  'ceramic.tan': [0xa98b64, 0, 0.6],
  'ceramic.white': [0xe9e6de, 0, 0.5],
  'ceramic.gray': [0x8d8f91, 0, 0.55],
  'resistor.black': [0x111111, 0, 0.5],
  'fr4.core': [0xb9a86a, 0, 0.7],
  'mask.teal': [0x0f6a73, 0, 0.35],
  'silk.white': [0xf2f2ee, 0, 0.7],
  'silicon.die': [0x55586a, 0.6, 0.2],
  'glass.clear': [0xffffff, 0, 0.05],
  'led.green': [0x7cff7a, 0, 0.2],
  'led.yellow': [0xffd23c, 0, 0.2],
  'led.red': [0xff3b2f, 0, 0.2],
  'magnet.ndfeb.raw': [0x6d6a66, 0.8, 0.5],
  'wood.bench': [0x8a6a45, 0, 0.7],
  'wood.plywood': [0xb99a6c, 0, 0.75],
  'wood.pegboard': [0x9b8563, 0, 0.8],
  'concrete.floor': [0x77746e, 0, 0.9],
  'paint.wall': [0xc9c0a6, 0, 0.9],
  'metal.painted.olive': [0x5b6340, 0.3, 0.6],
  'metal.painted.orange': [0xb5541f, 0.3, 0.55],
  'metal.painted.teal': [0x1f4e5a, 0.3, 0.55],
  'metal.painted.cream': [0xd8ceb0, 0.3, 0.6],
  'metal.painted.red': [0xa01d17, 0.3, 0.45],
  'metal.galvanized': [0x9ea4a6, 1, 0.45],
  'metal.rusty': [0x6e4128, 0.4, 0.85],
  'rubber.mat.green': [0x2f5f45, 0, 0.8],
  'fabric.rug': [0x7b3b2a, 0, 0.95],
  'fabric.cloth': [0x5e6b73, 0, 0.95],
  cardboard: [0xa9804f, 0, 0.9],
  'glass.window': [0xb9d0d8, 0, 0.05],
  'tape.yellow': [0xf2c21b, 0, 0.5],
  'paper.label': [0xe9e1c8, 0, 0.85],
  'emissive.tungsten': [0xffc67a, 0, 0.5],
  'emissive.neon': [0xe8fff0, 0, 0.5],
  'emissive.screen': [0x46ff8a, 0, 0.3],
};

export function registerBaseMaterials(library: MaterialLibrary): void {
  for (const id of BASE_MATERIAL_IDS) {
    const [color, metalness, roughness] = SIMPLE[id] ?? [0x888888, 0, 0.6];
    library.register(id, () => {
      const m = new THREE.MeshPhysicalNodeMaterial({ color, metalness, roughness });
      if (id.startsWith('emissive.') || id.startsWith('led.')) {
        m.emissive = new THREE.Color(color);
        m.emissiveIntensity = id.startsWith('led.') ? 0.2 : 2;
      }
      return m;
    });
  }
}
