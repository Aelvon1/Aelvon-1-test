/**
 * Éclairage chaud/froid de l'atelier.
 *
 * Sources :
 * - ampoule tungstène (PointLight chaude, ombres cubiques) : montée en 80 ms, lueur résiduelle
 *   du filament à l'extinction ;
 * - tube néon (RectAreaLight verdâtre, sans ombre) : scintillement piloté par `NeonFlicker` ;
 * - lumière du jour (SpotLight froide placée dehors, ombres : le mur et les petits bois dessinent
 *   la fenêtre au sol) + remplissage diffus du ciel (RectAreaLight dans l'embrasure) ;
 * - lampe loupe (SpotLight de la tête articulée, ombres).
 *
 * Budget d'ombres (profil de qualité) : priorité ampoule → fenêtre → lampe, au plus
 * `shadowCasters` lumières, taille `shadowMapSize`. Le décor étant statique, les cartes
 * d'ombres de l'ampoule et de la fenêtre ne sont recalculées que sur demande
 * (`invalidateShadows`) ; celle de la lampe l'est pendant ses mouvements, et celles de l'ampoule
 * et de la lampe à chaque image en mode inspection (objet animé sur le tapis).
 *
 * Les lumières ne sont jamais retirées ni masquées (intensité 0) : pas de recompilation des
 * shaders lors des bascules.
 */
import * as THREE from 'three/webgpu';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';
import type { QualityProfile } from '../../core/quality';
import type { WorldUniforms } from '../uniforms';
import { NeonFlicker } from './neonFlicker';
import type { WindowShaft } from '../atmosphere/shaft';
import type { MagnifierLamp } from '../room/MagnifierLamp';

/** Intensités nominales (unités physiques three.js, calées à l'œil avec l'exposition AgX = 1). */
export const LIGHT_LEVELS = {
  bulb: 3.2,
  neon: 20,
  daylight: 1.35,
  skyFill: 0.9,
  lamp: 1.4,
  environment: 0.22,
} as const;

let ltcReady = false;

export interface LightingOptions {
  bulbPosition: THREE.Vector3;
  neonStart: THREE.Vector3;
  neonEnd: THREE.Vector3;
  shaft: WindowShaft;
  lamp: MagnifierLamp;
  /** Claquement du starter du néon. */
  onNeonClick: () => void;
}

export class Lighting {
  readonly group = new THREE.Group();
  readonly bulb: THREE.PointLight;
  readonly neon: THREE.RectAreaLight;
  readonly daylight: THREE.SpotLight;
  readonly skyFill: THREE.RectAreaLight;
  readonly neonFlicker: NeonFlicker;
  /** Puissances courantes (0..1) après rampes. */
  bulbPower = 1;
  private switchOn = true;
  private dim = 1;
  private dimTarget = 1;
  private neutral = false;
  private inspection = false;
  private profile: QualityProfile | null = null;
  private envTarget: THREE.RenderTarget | null = null;
  private envSize = 0;
  private readonly lamp: MagnifierLamp;
  private readonly casters: (THREE.PointLight | THREE.SpotLight)[];
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly u: WorldUniforms,
    options: LightingOptions,
  ) {
    if (!ltcReady) {
      // Tables LTC des lumières surfaciques (une fois pour toute l'application).
      THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
      ltcReady = true;
    }
    this.group.name = 'Éclairage';
    this.lamp = options.lamp;

    // Ampoule.
    this.bulb = new THREE.PointLight(0xffb066, LIGHT_LEVELS.bulb, 0, 2);
    this.bulb.name = 'Ampoule tungstène';
    this.bulb.position.copy(options.bulbPosition);
    this.bulb.shadow.camera.near = 0.035;
    this.bulb.shadow.camera.far = 9;
    this.bulb.shadow.bias = -0.0015;
    this.bulb.shadow.normalBias = 0.015;
    this.bulb.shadow.radius = 2.5;

    // Néon : surface émissive tournée vers le bas, légèrement plus large que le tube.
    const neonCenter = new THREE.Vector3().addVectors(options.neonStart, options.neonEnd).multiplyScalar(0.5);
    this.neon = new THREE.RectAreaLight(
      0xd9ffe4,
      LIGHT_LEVELS.neon,
      options.neonStart.distanceTo(options.neonEnd),
      0.05,
    );
    this.neon.name = 'Néon';
    this.neon.position.copy(neonCenter).add(new THREE.Vector3(0, -0.012, 0));
    this.neon.lookAt(neonCenter.x, 0, neonCenter.z);

    // Lumière du jour : projecteur placé dehors dans l'axe du faisceau.
    const shaft = options.shaft;
    const dir = new THREE.Vector3(...shaft.dir);
    const windowCenter = new THREE.Vector3(
      shaft.planeX,
      (shaft.y[0] + shaft.y[1]) / 2,
      (shaft.z[0] + shaft.z[1]) / 2,
    );
    this.daylight = new THREE.SpotLight(0x8fb2de, LIGHT_LEVELS.daylight, 0, 0.19, 0.55, 0);
    this.daylight.name = 'Lumière du jour';
    this.daylight.position.copy(windowCenter).addScaledVector(dir, -6);
    this.daylight.target.position.copy(windowCenter).addScaledVector(dir, 2);
    this.daylight.shadow.camera.near = 4;
    this.daylight.shadow.camera.far = 11;
    this.daylight.shadow.bias = -0.0004;
    this.daylight.shadow.normalBias = 0.02;
    this.daylight.shadow.radius = 5;

    // Ciel diffus dans l'embrasure (lumière froide douce sur l'établi et le mur).
    this.skyFill = new THREE.RectAreaLight(
      0x9bb8e0,
      LIGHT_LEVELS.skyFill,
      shaft.z[1] - shaft.z[0],
      shaft.y[1] - shaft.y[0],
    );
    this.skyFill.name = 'Ciel (embrasure)';
    // Au nu intérieur du mur : la vitre et les petits bois sont DERRIÈRE la surface émettrice
    // (lumière unilatérale), sinon leur reflet spéculaire voile la vue extérieure.
    this.skyFill.position.set(shaft.planeX + 0.012, windowCenter.y, windowCenter.z);
    this.skyFill.lookAt(0, windowCenter.y - 0.3, windowCenter.z);

    this.group.add(this.bulb, this.neon, this.daylight, this.daylight.target, this.skyFill);
    this.group.add(this.lamp.light, this.lamp.light.target);

    this.casters = [this.bulb, this.daylight, this.lamp.light];
    for (const light of this.casters) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
    }

    this.neonFlicker = new NeonFlicker(1337, options.onNeonClick);
    this.neonFlicker.setPower(true, true);

    u.bulbPosition.value.copy(options.bulbPosition);
    u.neonStart.value.copy(options.neonStart);
    u.neonEnd.value.copy(options.neonEnd);
  }

  get lightsOn(): boolean {
    return this.switchOn;
  }

  /** Interrupteur mural : ampoule + néon. */
  setLights(on: boolean, instant = false): void {
    this.switchOn = on;
    this.neonFlicker.setPower(on, instant);
    if (instant) this.bulbPower = on ? 1 : 0;
  }

  /** Tamisage d'ambiance (mode inspection). */
  setDim(factor: number, instant = false): void {
    this.dimTarget = factor;
    if (instant) this.dim = factor;
  }

  setInspection(active: boolean): void {
    this.inspection = active;
    this.updateShadowSchedule();
    this.invalidateShadows();
  }

  setNeutral(neutral: boolean): void {
    this.neutral = neutral;
    this.invalidateShadows();
  }

  /** Demande le recalcul des cartes d'ombres statiques (décor modifié, qualité…). */
  invalidateShadows(): void {
    for (const light of this.casters) if (light.castShadow) light.shadow.needsUpdate = true;
  }

  applyQuality(profile: QualityProfile): void {
    this.profile = profile;
    const count = profile.shadows ? profile.shadowCasters : 0;
    this.casters.forEach((light, i) => {
      light.castShadow = i < count;
    });
    const size = profile.shadowMapSize;
    this.bulb.shadow.mapSize.setScalar(Math.max(256, Math.min(1024, size / 2)));
    this.daylight.shadow.mapSize.setScalar(size);
    this.lamp.light.shadow.mapSize.setScalar(Math.min(2048, size));
    this.updateShadowSchedule();
    this.invalidateShadows();
  }

  private updateShadowSchedule(): void {
    this.bulb.shadow.autoUpdate = this.inspection;
    this.daylight.shadow.autoUpdate = false;
    this.lamp.light.shadow.autoUpdate = this.inspection || this.lamp.moving;
  }

  update(dt: number): void {
    const u = this.u;
    // Ampoule : chauffe rapide, refroidissement plus lent (lueur du filament).
    const target = this.switchOn ? 1 : 0;
    const rate = this.switchOn ? 14 : 5;
    this.bulbPower += (target - this.bulbPower) * Math.min(1, dt * rate);
    if (Math.abs(target - this.bulbPower) < 1e-3) this.bulbPower = target;
    this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 2.5);
    this.neonFlicker.update(dt);

    const bulb = this.bulbPower * this.dim;
    const neon = this.neonFlicker.output * (0.35 + 0.65 * this.dim);
    const lamp = this.lamp.power;
    u.bulb.value = bulb;
    u.neon.value = neon;
    u.lamp.value = lamp;
    this.bulb.intensity = LIGHT_LEVELS.bulb * bulb;
    this.neon.intensity = LIGHT_LEVELS.neon * neon;
    this.lamp.light.intensity = LIGHT_LEVELS.lamp * lamp;
    const daylight = u.daylight.value * (this.neutral ? 0.35 : 1);
    this.daylight.intensity = LIGHT_LEVELS.daylight * daylight;
    this.skyFill.intensity = LIGHT_LEVELS.skyFill * daylight;
    // Environnement : capturé lumières allumées, atténué quand elles baissent.
    const roomLight = Math.max(bulb, neon * 0.7);
    this.scene.environmentIntensity = LIGHT_LEVELS.environment * (0.18 + 0.82 * roomLight);

    // Uniformes de la lampe (brume et poussière).
    const light = this.lamp.light;
    light.getWorldPosition(u.lampPosition.value);
    light.target.getWorldPosition(this.tmp);
    u.lampDirection.value.subVectors(this.tmp, u.lampPosition.value).normalize();
    u.lampCosAngle.value = Math.cos(light.angle);

    if (this.lamp.moving) light.shadow.needsUpdate = light.castShadow;
    this.lamp.light.shadow.autoUpdate = this.inspection;
  }

  /**
   * Carte d'environnement pré-filtrée capturée DEPUIS la salle (cube au centre, à hauteur
   * d'yeux) → `scene.environment`. `hide` : objets à masquer pendant la capture (poussière…).
   */
  captureEnvironment(renderer: THREE.WebGPURenderer, size: number, hide: THREE.Object3D[]): void {
    const hidden = hide.filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    const haze = this.u.haze.value;
    this.u.haze.value = 0;
    const previous = this.envTarget;
    this.scene.environment = null;
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      this.envTarget = pmrem.fromScene(this.scene, 0, 0.05, 20, {
        size,
        position: new THREE.Vector3(0, 1.45, 0.1),
      });
      this.envSize = size;
      this.scene.environment = this.envTarget.texture;
    } catch (error) {
      console.warn('[Lighting] Capture de l’environnement impossible :', error);
    } finally {
      pmrem.dispose();
      previous?.dispose();
      this.u.haze.value = haze;
      for (const o of hidden) o.visible = true;
    }
  }

  /** Taille de la carte d'environnement actuelle (px). */
  get environmentSize(): number {
    return this.envSize;
  }

  get quality(): QualityProfile | null {
    return this.profile;
  }

  dispose(): void {
    this.envTarget?.dispose();
    this.envTarget = null;
    if (this.scene.environment) this.scene.environment = null;
    for (const light of this.casters) light.shadow.dispose();
    this.group.removeFromParent();
  }
}
