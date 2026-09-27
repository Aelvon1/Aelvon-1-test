/**
 * Matériaux de vue de l'inspection (TSL) :
 * - rayons X : fantôme additif, contour lumineux de Fresnel, sans écriture de profondeur ;
 * - faces de coupe : variante double face d'un matériau dont les faces ARRIÈRE (visibles à
 *   travers la coupe) sont remplacées par une couleur unie non éclairée, hachurée en écran ;
 * - plan de coupe : voile translucide à bord lumineux, graduations tous les 5 mm.
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  color,
  dot,
  exp,
  float,
  fract,
  frontFacing,
  fwidth,
  max,
  min,
  mix,
  normalView,
  output,
  positionViewDirection,
  pow,
  screenCoordinate,
  select,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl';

/** Teinte des fantômes (bleu froid des radiographies). */
const XRAY_TINT = 0x86c8ff;
/** Teinte de référence des coupes (rouge brique des dessins techniques). */
const SECTION_TINT = new THREE.Color(0xb4472c);
/** Période des hachures (pixels) et teinte du plan de coupe. */
const HATCH_PERIOD_PX = 7;
const PLANE_TINT = 0x9fdcff;

/** Fantôme additif des rayons X (partagé par tous les maillages concernés). */
export function createXrayMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.name = 'Inspection : rayons X';
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.AdditiveBlending;
  m.side = THREE.DoubleSide;
  m.fog = false;
  // Fresnel : 0 face à la caméra, 1 en incidence rasante (silhouettes, arêtes des volumes).
  const facing = abs(dot(normalView, positionViewDirection));
  const rim = pow(float(1).sub(facing), 2.4);
  m.colorNode = color(XRAY_TINT).mul(rim.mul(0.6).add(0.028));
  m.userData = { viewMaterial: 'xray' };
  return m;
}

/** Couleur unie de coupe d'un matériau : sa teinte de base rapprochée du rouge de coupe. */
export function sectionColorOf(material: THREE.Material): THREE.Color {
  const base = (material as THREE.Material & { color?: unknown }).color;
  const c = base instanceof THREE.Color ? base.clone() : new THREE.Color(0x8a8a8a);
  c.lerp(SECTION_TINT, 0.42);
  // Plancher de luminance : une matière noire reste lisible en coupe.
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (luminance < 0.06) c.lerp(SECTION_TINT, 0.5).addScalar(0.02);
  return c;
}

/** Un matériau peut-il recevoir une face de coupe ? (matériau à nœuds, opaque, simple face) */
export function supportsSectionCap(material: THREE.Material): boolean {
  const m = material as THREE.NodeMaterial;
  return (
    m.isNodeMaterial === true &&
    m.fragmentNode === null &&
    !material.transparent &&
    material.side !== THREE.DoubleSide
  );
}

/**
 * Variante « face de coupe » : double face ; les faces avant gardent le rendu d'origine, les
 * faces arrière reçoivent la couleur de coupe unie, hachurée en diagonale (écran).
 */
export function createSectionCapVariant(material: THREE.Material): THREE.Material {
  const clone = material.clone() as THREE.NodeMaterial;
  clone.name = `${material.name} (coupe)`;
  clone.side = THREE.DoubleSide;
  const cap = color(sectionColorOf(material));
  const s = screenCoordinate.x.add(screenCoordinate.y).div(HATCH_PERIOD_PX);
  // Distance (px) au centre de la hachure la plus proche, anticrénelée.
  const d = abs(fract(s).sub(0.5)).mul(HATCH_PERIOD_PX);
  const line = float(1).sub(smoothstep(0.6, 1.5, d));
  const capColor = mix(cap, cap.mul(0.58), line.mul(0.85));
  clone.outputNode = select(frontFacing, output, vec4(capColor, 1));
  clone.userData = { ...material.userData, shared: false, viewMaterial: 'sectionCap' };
  return clone;
}

/** Paramètres animables du plan de coupe. */
export interface SectionPlaneUniforms {
  /** Dimensions du plan (m). */
  size: { value: THREE.Vector2 };
  /** Intensité globale (0..1) : apparition en fondu. */
  strength: { value: number };
}

/** Plan translucide matérialisant la coupe : bord lumineux + graduations de 5 mm. */
export function createSectionPlaneMaterial(): {
  material: THREE.MeshBasicNodeMaterial;
  uniforms: SectionPlaneUniforms;
} {
  const size = uniform(new THREE.Vector2(0.1, 0.1));
  const strength = uniform(1);
  const m = new THREE.MeshBasicNodeMaterial();
  m.name = 'Inspection : plan de coupe';
  m.transparent = true;
  m.depthWrite = false;
  m.side = THREE.DoubleSide;
  m.fog = false;
  const p = uv();
  // Distance au bord en pixels (largeur constante à l'écran).
  const du = min(p.x, float(1).sub(p.x)).div(max(fwidth(p.x), 1e-6));
  const dv = min(p.y, float(1).sub(p.y)).div(max(fwidth(p.y), 1e-6));
  const edge = min(du, dv);
  const border = float(1).sub(smoothstep(1, 2.4, edge));
  const glow = exp(edge.div(-14)).mul(0.35);
  // Graduations tous les 5 mm, estompées quand elles deviennent trop serrées à l'écran.
  const g = p.mul(size).div(0.005);
  const fw = max(fwidth(g), vec2(1e-6));
  const gd = abs(fract(g.sub(0.5)).sub(0.5)).div(fw);
  const gridLine = float(1).sub(smoothstep(0.4, 1.3, min(gd.x, gd.y)));
  const gridFade = float(1).sub(smoothstep(0.12, 0.35, max(fw.x, fw.y)));
  const alpha = float(0.035).add(border.mul(0.85)).add(glow).add(gridLine.mul(gridFade).mul(0.07));
  m.colorNode = color(PLANE_TINT).mul(float(1).add(border.mul(0.6)));
  m.opacityNode = alpha.mul(strength).clamp(0, 1);
  m.userData = { viewMaterial: 'sectionPlane' };
  return { material: m, uniforms: { size, strength } };
}
