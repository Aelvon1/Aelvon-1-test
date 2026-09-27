/**
 * Matériaux propres aux intérieurs des composants (TSL, `MeshPhysicalNodeMaterial`), enregistrés
 * via `ObjectDef.materials` sous `uno-board/int.<clé>`.
 *
 * - Puce de silicium : texture générée (métal, régions, plots), irisation légère de la
 *   passivation dont l'épaisseur varie selon le bloc.
 * - Résine de moulage : noire semi-mate ; les faces ARRIÈRE (visibles à travers le plan de coupe
 *   du moteur ou dans un demi-boîtier retiré) sont rendues comme une matière coupée plus claire,
 *   piquée des billes de silice de la charge (bruit cellulaire en repère local) : le composant
 *   reste lisible en coupe. Approximation : on voit l'intérieur des parois, pas une face de
 *   coupe plane (le moteur ne ferme pas les sections).
 * - Dépôts d'argent, colle chargée argent, lame de quartz dépolie, perles de verre de
 *   scellement, papier imprégné d'électrolyte, feuilles d'aluminium d'anode (gravée, oxydée) et de
 *   cathode.
 */
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  frontFacing,
  mix,
  mx_worley_noise_float,
  positionLocal,
  select,
  smoothstep,
  texture,
  uv,
  vec3,
} from 'three/tsl';
import type { MaterialFactory } from '../../../materials/types';
import type { TextureRequest } from '../../../textures/types';
import { OBJECT_ID } from '../constants';
import { markingRequest } from '../markings';
import { DIE, DIE_BLOCKS, DIE_CORE, bondPads } from './dieLayout';
import type { DieTextureParams } from './dieTexture';

type Quality = 0 | 1 | 2 | 3;

/** Préfixe des matériaux des intérieurs. */
export const INT = 'int.';

/** Résolution de la texture de la puce (px de côté) par niveau de qualité. */
const DIE_RES: Record<Quality, number> = { 0: 512, 1: 1024, 2: 2048, 3: 4096 };

/** Requête de la texture de la puce (clé préfixée par l'objet). */
export function dieTextureRequest(quality: Quality): TextureRequest {
  const params: DieTextureParams = {
    size: DIE.size,
    pads: bondPads().map((p) => ({ side: p.side, x: p.x, z: p.z, bonded: p.pin !== undefined })),
    padSize: DIE.pad,
    blocks: DIE_BLOCKS.map((b) => ({ kind: b.kind, rect: b.rect })),
    core: DIE_CORE,
    // Identifiant de masque et année fictifs (aucun logo ni nom de fabricant).
    marks: ['M328P-D5', '0514'],
  };
  const size = DIE_RES[quality];
  return {
    key: `${OBJECT_ID}/int.die.q${quality}`,
    generator: 'uno-board.die',
    width: size,
    height: size,
    params,
    colorSpace: 'linear',
    wrap: 'clamp',
    mipmaps: true,
    anisotropy: true,
    seed: 328,
  };
}

/** Puce : silicium bleuté sous passivation, lignes d'aluminium dorées, plots à nu. */
function dieMaterial(quality: Quality): MaterialFactory {
  return (ctx) => {
    const t = texture(ctx.textures.get(dieTextureRequest(quality)), uv());
    const metal = t.r;
    const tint = t.g;
    const pad = t.b;
    const m = new THREE.MeshPhysicalNodeMaterial({ name: 'Puce de silicium (ATmega328P)' });
    const base = mix(color(0x252a3f), color(0x5a4668), tint);
    const lines = mix(base, color(0xcdb489), metal.mul(0.8));
    m.colorNode = mix(lines, color(0xbcc0c4), pad);
    m.metalnessNode = mix(mix(float(0.5), float(0.9), metal), float(1), pad);
    m.roughnessNode = mix(mix(float(0.14), float(0.2), metal), float(0.36), pad);
    // Irisation légère : couche de passivation (nitrure/oxyde) d'épaisseur variable.
    m.iridescence = 0.45;
    m.iridescenceIOR = 1.8;
    m.iridescenceThicknessNode = mix(float(260), float(560), tint).add(metal.mul(50));
    return m;
  };
}

/** Couleur hexadécimale sRGB → nœud vec3 dans l'espace de travail linéaire. */
function rgb(hex: number) {
  const c = new THREE.Color(hex);
  return vec3(c.r, c.g, c.b);
}

/** Résine de moulage (option : marquage laser du dessus). */
function resinMaterial(marking: { id: string; quality: Quality } | null): MaterialFactory {
  return (ctx) => {
    const m = new THREE.MeshPhysicalNodeMaterial({ name: 'Résine de moulage époxy', side: THREE.DoubleSide });
    // Billes de silice (charge ≈ 70–85 % en masse) : cellules de ≈ 50 µm.
    const cells = mx_worley_noise_float(positionLocal.mul(20000));
    const filler = smoothstep(0.34, 0.22, cells);
    const cut = mix(color(0x2c2c30), color(0x8f8e88), filler);
    // Marquage laser éventuel : R = gravure (plus claire, plus mate), G = zones polies.
    const mark = marking
      ? texture(ctx.textures.get(markingRequest(marking.id, marking.quality)), uv())
      : null;
    const front = mark ? mix(rgb(0x151517), rgb(0x6a6b6e), mark.r) : rgb(0x151517);
    const roughFront = mark ? mix(float(0.55), float(0.85), mark.r) : float(0.62);
    const gloss = mark ? mix(float(1), float(0.5), mark.g) : float(1);
    m.colorNode = select(frontFacing, front, cut);
    m.roughnessNode = select(frontFacing, roughFront.mul(gloss), float(0.78));
    m.metalness = 0;
    m.clearcoat = 0.12;
    m.clearcoatRoughness = 0.5;
    return m;
  };
}

const physical =
  (name: string, params: THREE.MeshPhysicalNodeMaterialParameters): MaterialFactory =>
  () =>
    new THREE.MeshPhysicalNodeMaterial({ name, ...params });

/** Matériaux des intérieurs (clés sans préfixe d'objet ; `own()` y accède par `int.<clé>`). */
export function internalsMaterials(): Record<string, MaterialFactory> {
  const out: Record<string, MaterialFactory> = {
    [`${INT}resin`]: resinMaterial(null),
    // Dépôt d'argent électrolytique (bouts des doigts, îlot, électrodes du quartz, contacts).
    [`${INT}silver`]: physical('Argent déposé', { color: 0xe4e1dc, metalness: 1, roughness: 0.2 }),
    // Colle époxy chargée d'argent (fixation de la puce, collage de la lame de quartz).
    [`${INT}silverEpoxy`]: physical('Colle époxy chargée argent', {
      color: 0x8c8d8a,
      metalness: 0.35,
      roughness: 0.62,
    }),
    // Lame de quartz taillée AT, faces rodées : translucide, dépolie.
    [`${INT}quartz`]: physical('Quartz (lame taillée AT)', {
      color: 0xeef2f3,
      metalness: 0,
      roughness: 0.3,
      transmission: 0.82,
      thickness: 0.0001,
      ior: 1.54,
    }),
    // Verre de scellement verre-métal (perles des traversées) : verre sombre verdâtre, brillant.
    [`${INT}glassSeal`]: physical('Verre de scellement', {
      color: 0x223a2f,
      metalness: 0,
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    // Papier séparateur (kraft) imprégné d'électrolyte : brun, légèrement humide.
    [`${INT}paper`]: physical('Papier imprégné d’électrolyte', {
      color: 0x86653c,
      metalness: 0,
      roughness: 0.62,
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
    }),
    // Anode : aluminium gravé (surface spongieuse, mate) couvert d'alumine formée (reflets ténus).
    [`${INT}anode`]: physical('Feuille d’anode (aluminium gravé et oxydé)', {
      color: 0x8e9296,
      metalness: 0.8,
      roughness: 0.55,
      iridescence: 0.3,
      iridescenceIOR: 1.65,
      iridescenceThicknessRange: [120, 200],
    }),
    // Cathode : aluminium mince, légèrement gravé.
    [`${INT}cathode`]: physical('Feuille de cathode (aluminium)', {
      color: 0xb6babe,
      metalness: 0.9,
      roughness: 0.42,
    }),
  };
  for (const q of [0, 1, 2, 3] as const) {
    out[`${INT}die.q${q}`] = dieMaterial(q);
    out[`${INT}resin.u4top.q${q}`] = resinMaterial({ id: 'u4.top', quality: q });
  }
  return out;
}
