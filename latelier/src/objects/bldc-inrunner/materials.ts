/**
 * Matériaux propres au moteur (TSL, `MeshPhysicalNodeMaterial`), déclarés dans
 * `ObjectDef.materials` et enregistrés sous `bldc-inrunner/<clé>`.
 *
 * On ne redéfinit ici que ce que la bibliothèque de base ne peut pas garantir pour ce moteur :
 * teinte d'émail par phase (repérage), tranche bleuie des tôles (face dans la bibliothèque),
 * tissage de la frette à l'échelle réelle, coque de vernis translucide, isolant de fil.
 * Les UV de la frette sont exprimés en millimètres (u = circonférence, v = axe).
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  float,
  floor,
  fract,
  mix,
  mod,
  mx_noise_float,
  positionLocal,
  pow,
  sin,
  uv,
  vec3,
} from 'three/tsl';
import type { MaterialFactory } from '../../materials/types';
import { OBJECT_ID } from './params';

/** Cuivre émaillé : métal cuivre sous une laque colorée brillante (clearcoat). */
function enamel(tint: number, roughness: number): MaterialFactory {
  return () => {
    const m = new THREE.MeshPhysicalNodeMaterial({
      color: tint,
      metalness: 1,
      roughness,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    m.name = 'Cuivre émaillé';
    // Micro-variations de l'émail (tréfilage, étirement du vernis) à l'échelle du dixième de mm.
    m.roughnessNode = float(roughness).add(mx_noise_float(positionLocal.mul(3500)).mul(0.05));
    return m;
  };
}

/** Tranche de tôle : acier découpé, bleui par le recuit (film d'oxyde légèrement irisé). */
const laminationEdge: MaterialFactory = () => {
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: 0x46597a,
    metalness: 0.85,
    roughness: 0.4,
    iridescence: 0.35,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [250, 420],
  });
  m.name = 'Tôle (tranche bleuie)';
  m.roughnessNode = float(0.4).add(mx_noise_float(positionLocal.mul(9000)).mul(0.08));
  return m;
};

/**
 * Frette en fibre d'aramide imprégnée époxy : toile (armure 1/1) de période 0,6 mm. Dans chaque
 * case, le fil du dessus est bombé (profil transversal en sinus) et plonge sous le fil croisé à
 * ses extrémités ; fibres élémentaires en stries fines le long du fil ; vernis époxy (clearcoat).
 */
const sleeveWeave: MaterialFactory = () => {
  const period = 0.6;
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: 0xc99a3a,
    metalness: 0,
    roughness: 0.45,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    sheen: 0.5,
    sheenColor: new THREE.Color(0xffe2a0),
  });
  m.name = 'Fibre d’aramide tissée (frette)';
  const U = uv().x.div(period);
  const V = uv().y.div(period);
  const fu = fract(U);
  const fv = fract(V);
  const parity = mod(floor(U).add(floor(V)), 2);
  const warpTop = sin(fv.mul(Math.PI)).mul(pow(sin(fu.mul(Math.PI)), 0.35));
  const weftTop = sin(fu.mul(Math.PI)).mul(pow(sin(fv.mul(Math.PI)), 0.35));
  const top = mix(warpTop, weftTop, parity);
  const streakWarp = mx_noise_float(vec3(V.mul(38), U.mul(1.5), 0));
  const streakWeft = mx_noise_float(vec3(U.mul(38), V.mul(1.5), 7));
  const fibre = mix(streakWarp, streakWeft, parity).mul(0.08);
  const shade = float(0.42).add(top.mul(0.58)).add(fibre);
  m.colorNode = vec3(0.8, 0.6, 0.2).mul(shade);
  m.roughnessNode = float(0.58).sub(top.mul(0.26));
  return m;
};

/** Vernis d'imprégnation : coque ambrée translucide, brillante, vue des deux côtés. */
const varnishShell: MaterialFactory = () => {
  const m = new THREE.MeshPhysicalNodeMaterial({
    color: 0xc0741f,
    metalness: 0,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  m.name = 'Vernis d’imprégnation';
  // Épaisseur irrégulière (coulures) : l'opacité varie doucement.
  m.opacityNode = float(0.3).add(abs(mx_noise_float(positionLocal.mul(900))).mul(0.22));
  return m;
};

/** Gaine isolante en fibre de verre tressée (sorties de phase, point neutre). */
function braidedSleeve(tint: number): MaterialFactory {
  return () => {
    const m = new THREE.MeshPhysicalNodeMaterial({ color: tint, metalness: 0, roughness: 0.7, sheen: 0.6 });
    m.name = 'Gaine tressée';
    const U = uv().x.mul(24);
    const V = uv().y.mul(3.2);
    const braid = sin(U.add(V).mul(Math.PI))
      .mul(sin(U.sub(V).mul(Math.PI)))
      .mul(0.12);
    m.colorNode = vec3(new THREE.Color(tint).r, new THREE.Color(tint).g, new THREE.Color(tint).b).mul(
      float(0.9).add(braid),
    );
    return m;
  };
}

export const MATERIALS: Record<string, MaterialFactory> = {
  // Approximation (convention du simulateur) : émail teinté par phase pour le repérage — A naturel,
  // B rouge, C bleu. En réalité le fil est identique pour les trois phases (repère par gaine).
  enamelA: enamel(0xe08a45, 0.24),
  enamelB: enamel(0xb2442c, 0.26),
  enamelC: enamel(0x4f6f9c, 0.26),
  laminationEdge,
  sleeveWeave,
  varnishShell,
  sleeveA: braidedSleeve(0xd8b21f),
  sleeveB: braidedSleeve(0xa3231e),
  sleeveC: braidedSleeve(0x1f4fa3),
  sleeveNeutral: braidedSleeve(0xe6e0cf),
};

/** Identifiant complet d'un matériau propre. */
export const own = (key: keyof typeof MATERIALS): string => `${OBJECT_ID}/${key}`;
