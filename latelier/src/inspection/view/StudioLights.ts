/**
 * Éclairage d'appoint de l'inspection (esprit « lampe loupe » de studio), actif seulement en
 * inspection :
 * - lumière principale douce (projecteur à pénombre totale, blanc neutre-chaud) venant du haut,
 *   décalée de 40° de la caméra et la suivant à 60 % en azimut : le relief reste lisible quel que
 *   soit l'angle de vue sans que les ombres propres « tournent » avec la caméra ;
 * - contre-jour froid à l'opposé de la caméra, qui détache les silhouettes du fond.
 * Aucune ombre portée (la lampe loupe du décor projette déjà l'ombre de l'objet) : budget
 * d'ombres inchangé. Les lumières restent dans la scène (intensité nulle hors inspection) pour
 * éviter toute recompilation des shaders à l'entrée et à la sortie.
 */
import * as THREE from 'three/webgpu';
import { orbitOffset } from '../camera/orbitMath';

/** Intensités nominales (candela, décroissance physique en 1/d²). */
const KEY_INTENSITY = 2.6;
const RIM_INTENSITY = 3.2;
/** Distance des projecteurs au centre de l'objet (m). */
const LIGHT_DISTANCE = 0.9;
/** Montée/descente (1/s). */
const FADE_RATE = 2.5;

const _offset = new THREE.Vector3();
const _camDir = new THREE.Vector3();

export class StudioLights {
  readonly group = new THREE.Group();
  private readonly key: THREE.SpotLight;
  private readonly rim: THREE.SpotLight;
  private level = 0;
  private target = 0;
  private readonly center = new THREE.Vector3();
  private radius = 0.1;
  /** Azimut de référence de la présentation de l'objet (vue initiale). */
  private baseAzimuth = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'Inspection : éclairage studio';
    this.key = new THREE.SpotLight(0xfff1e0, 0, 0, 0.5, 1, 2);
    this.key.name = 'Studio : principale';
    this.rim = new THREE.SpotLight(0xcfe3ff, 0, 0, 0.5, 1, 2);
    this.rim.name = 'Studio : contre-jour';
    for (const light of [this.key, this.rim]) {
      light.castShadow = false;
      this.group.add(light, light.target);
    }
    scene.add(this.group);
  }

  /** Active/désactive (fondu). */
  setActive(active: boolean): void {
    this.target = active ? 1 : 0;
  }

  /** Objet éclairé : centre, rayon (cône des projecteurs) et azimut de présentation. */
  setSubject(center: THREE.Vector3, radius: number, baseAzimuth?: number): void {
    this.center.copy(center);
    this.radius = Math.max(0.01, radius);
    if (baseAzimuth !== undefined) this.baseAzimuth = baseAzimuth;
  }

  update(dt: number, camera: THREE.Camera): void {
    const k = 1 - Math.exp(-FADE_RATE * dt);
    this.level += (this.target - this.level) * k;
    if (Math.abs(this.target - this.level) < 1e-3) this.level = this.target;
    this.key.intensity = KEY_INTENSITY * this.level;
    this.rim.intensity = RIM_INTENSITY * this.level;
    if (this.level === 0) return;
    _camDir.subVectors(camera.position, this.center);
    const camAzimuth = Math.atan2(_camDir.x, _camDir.z);
    // Suivi partiel de la caméra (au plus court autour de l'azimut de présentation).
    const delta = Math.atan2(Math.sin(camAzimuth - this.baseAzimuth), Math.cos(camAzimuth - this.baseAzimuth));
    const follow = this.baseAzimuth + delta * 0.6;
    this.place(this.key, follow + 0.7, THREE.MathUtils.degToRad(52));
    this.place(this.rim, camAzimuth + Math.PI + 0.35, THREE.MathUtils.degToRad(28));
  }

  private place(light: THREE.SpotLight, azimuth: number, elevation: number): void {
    const distance = Math.max(LIGHT_DISTANCE, this.radius * 5);
    light.position.copy(this.center).add(orbitOffset(azimuth, elevation, distance, _offset));
    light.target.position.copy(this.center);
    // Cône ajusté à l'objet (+ marge), pénombre totale : bord très doux.
    light.angle = Math.min(1.2, Math.atan((this.radius * 1.8) / distance) + 0.08);
    light.distance = 0;
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
  }

  dispose(): void {
    this.group.removeFromParent();
    this.key.dispose();
    this.rim.dispose();
  }
}
