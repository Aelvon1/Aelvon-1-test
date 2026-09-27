/**
 * Uniformes TSL partagés par tous les shaders du décor (matériaux émissifs, vitre, brume,
 * poussière). Mis à jour UNE fois par image par `World.update` (aucune allocation).
 *
 * Le temps est le temps du moteur (`FrameInfo.time`) et non le temps interne du renderer :
 * `?time=12.5` fige donc aussi la pluie, la poussière et la brume (captures reproductibles).
 */
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

export function createWorldUniforms() {
  return {
    /** Temps d'animation (s). */
    time: uniform(0),
    /** Puissance de l'ampoule 0..1 (interrupteur × tamisage). */
    bulb: uniform(1),
    /** Puissance du néon 0..1 (interrupteur × scintillement × tamisage). */
    neon: uniform(1),
    /** Puissance de la lampe loupe 0..1. */
    lamp: uniform(1),
    /** Lumière du jour par la fenêtre 0..1. */
    daylight: uniform(1),
    /** Présence de la brume et des faisceaux (0 en fond studio neutre). */
    haze: uniform(1),
    /** Faisceaux volumétriques activés (profil de qualité). */
    volumetrics: uniform(1),
    /** Pixels par mètre à 1 m de distance (taille minimale de la poussière). */
    pixelsPerMeter: uniform(700),
    /** Position de l'ampoule (monde). */
    bulbPosition: uniform(new THREE.Vector3()),
    /** Extrémités du tube néon (monde). */
    neonStart: uniform(new THREE.Vector3()),
    neonEnd: uniform(new THREE.Vector3()),
    /** Position et direction de la lampe loupe (monde), cosinus du demi-angle du cône. */
    lampPosition: uniform(new THREE.Vector3()),
    lampDirection: uniform(new THREE.Vector3(0, -1, 0)),
    lampCosAngle: uniform(Math.cos(0.6)),
    /** Mise en évidence au regard (0..1) par élément interactif. */
    highlightSwitch: uniform(0),
    highlightLamp: uniform(0),
    highlightBench: uniform(0),
  };
}

export type WorldUniforms = ReturnType<typeof createWorldUniforms>;
