/**
 * Matériaux TSL des couches du circuit imprimé (enregistrés via `ObjectDef.materials`).
 *
 * - Vernis épargne : sarcelle semi-brillant (vernis + couche « clearcoat »), plus clair au-dessus
 *   du cuivre (le vernis est translucide), relief des pistes calculé par différences centrées du
 *   canal G (cuivre flouté) en repère texture → normale exacte en mm, indépendante de la distance ;
 *   ouvertures (canal A) découpées (alphaTest).
 * - Cuivre : cuivre nu, étamé là où le vernis est ouvert ; découpé hors cuivre (canal R).
 * - Sérigraphie : encre blanche mate légèrement en relief (canal B).
 * - Âme FR4 : résine époxy chargée de tissu de verre ; sur la tranche et les parois des trous, les
 *   torons du tissu 7628 apparaissent en coupe (8 plis) ; sur les faces, tissage toile discret.
 *
 * Chaque matériau dépendant de l'illustration existe en 4 variantes (une par niveau de qualité,
 * clé `…q<n>`) : la construction choisit celle du niveau courant, sans état global.
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  color,
  faceDirection,
  float,
  floor,
  fract,
  length,
  mix,
  mod,
  normalLocal,
  normalize,
  positionLocal,
  select,
  sin,
  smoothstep,
  texture,
  transformNormalToView,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { MaterialFactory, MaterialFactoryContext } from '../../../materials/types';
import { BOARD_H, BOARD_W, T_CORE, Y_CORE_B } from '../constants';
import { artworkRequest, artworkSize, type Face } from './artwork';
import { computeRouting } from './routing';

type Quality = 0 | 1 | 2 | 3;

const requests = new Map<string, ReturnType<typeof artworkRequest>>();

/** Texture d'illustration d'une face (même clé que celle attendue par `prepare`). */
export function artworkTexture(
  ctx: Pick<MaterialFactoryContext, 'textures'>,
  face: Face,
  quality: Quality,
): THREE.Texture {
  const key = `${face}.${quality}`;
  let req = requests.get(key);
  if (!req) {
    req = artworkRequest(computeRouting(), face, quality);
    requests.set(key, req);
  }
  return ctx.textures.get(req);
}

/** Couleurs (sRGB) du vernis. */
export const MASK_OVER_FR4 = 0x0b5461;
export const MASK_OVER_COPPER = 0x14818d;

/**
 * Normale (repère vue) d'une surface plane horizontale en relief : hauteur = canal `channel`
 * × `reliefMm`, face orientée vers `up` (+1 dessus, −1 dessous).
 */
function reliefNormal(
  tex: THREE.Texture,
  face: Face,
  quality: Quality,
  channel: 'g' | 'b',
  reliefMm: number,
  up: 1 | -1,
) {
  const { width, height } = artworkSize(quality, face);
  const e = 1.5;
  const du = e / width;
  const dv = e / height;
  const U = uv();
  const h = (dx: number, dy: number) => {
    const t = texture(tex, U.add(vec2(dx, dy)));
    return channel === 'g' ? t.g : t.b;
  };
  const kx = reliefMm / ((2 * e * BOARD_W) / width);
  const kz = reliefMm / ((2 * e * BOARD_H) / height);
  const sx = h(du, 0).sub(h(-du, 0)).mul(kx);
  const sz = h(0, dv).sub(h(0, -dv)).mul(kz);
  const n = normalize(vec3(sx.negate(), float(up), sz.negate()));
  return transformNormalToView(n).mul(faceDirection);
}

function maskMaterial(face: Face, quality: Quality): MaterialFactory {
  return (ctx) => {
    const tex = artworkTexture(ctx, face, quality);
    const t = texture(tex, uv());
    const m = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide });
    m.name = `Vernis épargne (${face === 'top' ? 'dessus' : 'dessous'})`;
    // Vernis translucide : plus clair et plus vert au-dessus du cuivre.
    m.colorNode = mix(color(MASK_OVER_FR4), color(MASK_OVER_COPPER), t.g.mul(0.35).add(t.r.mul(0.65)));
    m.roughnessNode = mix(float(0.42), float(0.34), t.r);
    m.metalness = 0;
    m.clearcoat = 0.55;
    m.clearcoatRoughness = 0.2;
    m.normalNode = reliefNormal(tex, face, quality, 'g', 0.03, face === 'top' ? 1 : -1);
    m.opacityNode = float(1).sub(t.a);
    m.alphaTest = 0.5;
    return m;
  };
}

function copperMaterial(face: Face, quality: Quality): MaterialFactory {
  return (ctx) => {
    const tex = artworkTexture(ctx, face, quality);
    const t = texture(tex, uv());
    const m = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide });
    m.name = `Cuivre (${face === 'top' ? 'dessus' : 'dessous'})`;
    const copper = color(new THREE.Color().setRGB(0.93, 0.6, 0.47, THREE.LinearSRGBColorSpace));
    const tin = color(new THREE.Color().setRGB(0.78, 0.79, 0.8, THREE.LinearSRGBColorSpace));
    m.colorNode = mix(copper, tin, t.a);
    m.metalness = 1;
    m.roughnessNode = mix(float(0.3), float(0.2), t.a);
    m.opacityNode = t.r;
    m.alphaTest = 0.5;
    return m;
  };
}

function silkMaterial(face: Face, quality: Quality): MaterialFactory {
  return (ctx) => {
    const tex = artworkTexture(ctx, face, quality);
    const t = texture(tex, uv());
    const m = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide });
    m.name = `Sérigraphie (${face === 'top' ? 'dessus' : 'dessous'})`;
    m.colorNode = color(0xefefe8);
    m.roughness = 0.78;
    m.metalness = 0;
    m.normalNode = reliefNormal(tex, face, quality, 'b', 0.008, face === 'top' ? 1 : -1);
    m.opacityNode = t.b;
    m.alphaTest = 0.5;
    return m;
  };
}

/** Âme FR4 : tissu de verre en coupe sur la tranche, tissage toile discret sur les faces. */
const coreMaterial: MaterialFactory = () => {
  const m = new THREE.MeshPhysicalNodeMaterial();
  m.name = 'Âme FR4 (verre-époxy)';
  const p = positionLocal.mul(1000); // mm
  const n = normalLocal;
  const resin = color(0x6e6530);
  const glass = color(0xb5ae8c);
  const face = color(0x9f955a);
  // Tranche et parois des trous : coordonnée le long de la paroi et hauteur dans l'épaisseur.
  const s = select(abs(n.x).greaterThan(abs(n.z)), p.z, p.x);
  const y = p.y.sub(Y_CORE_B * 1000);
  const plyT = (T_CORE * 1000) / 8;
  const ply = floor(y.div(plyT));
  const v = fract(y.div(plyT));
  const odd = mod(ply, 2);
  // Torons de trame coupés (ellipses), décalés d'un demi-pas d'un pli à l'autre.
  const u = fract(s.div(0.58).add(odd.mul(0.5)));
  const ell = length(vec2(u.sub(0.5).div(0.38), v.sub(0.5).div(0.36)));
  const weft = smoothstep(1.0, 0.72, ell);
  // Fils de chaîne vus en long entre les ellipses + fines stries de filaments.
  const warp = smoothstep(0.42, 0.3, abs(v.sub(0.5))).mul(0.45);
  const strands = sin(v.mul(80)).mul(0.5).add(0.5).mul(0.12);
  const interPly = smoothstep(0.08, 0.0, v)
    .add(smoothstep(0.92, 1.0, v))
    .mul(0.5);
  const edgeCol = mix(mix(resin, glass, weft.add(warp).add(strands).clamp(0, 1)), resin.mul(0.7), interPly);
  // Faces : tissage toile (pas 0,58 × 0,79 mm), dessus/dessous alternés.
  const wx = sin(p.x.mul((2 * Math.PI) / 0.58));
  const wz = sin(p.z.mul((2 * Math.PI) / 0.79));
  const weave = wx.mul(wz).mul(0.5).add(0.5);
  const faceCol = mix(face, glass, weave.mul(0.22));
  const side = smoothstep(0.5, 0.8, float(1).sub(abs(n.y)));
  m.colorNode = mix(faceCol, edgeCol, side);
  m.roughnessNode = mix(float(0.5), float(0.7), side);
  m.metalness = 0;
  m.sheen = 0.2;
  m.sheenRoughness = 0.6;
  return m;
};

/** Fût de métallisation (cuivre étamé à l'intérieur des trous). */
const platingMaterial: MaterialFactory = () =>
  new THREE.MeshPhysicalNodeMaterial({
    name: 'Métallisation des trous',
    color: new THREE.Color().setRGB(0.8, 0.72, 0.62, THREE.LinearSRGBColorSpace),
    metalness: 1,
    roughness: 0.32,
    side: THREE.DoubleSide,
  });

/** Matériaux propres des couches du circuit (toutes qualités). */
export function pcbMaterials(): Record<string, MaterialFactory> {
  const out: Record<string, MaterialFactory> = {
    'pcb.core': coreMaterial,
    'pcb.plating': platingMaterial,
  };
  for (const q of [0, 1, 2, 3] as const) {
    for (const face of ['top', 'bottom'] as const) {
      out[`pcb.mask.${face}.q${q}`] = maskMaterial(face, q);
      out[`pcb.copper.${face}.q${q}`] = copperMaterial(face, q);
      out[`pcb.silk.${face}.q${q}`] = silkMaterial(face, q);
    }
  }
  return out;
}
