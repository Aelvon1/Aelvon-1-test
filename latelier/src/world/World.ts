/**
 * Décor de l'atelier : coque, établi, luminaires, éclairage chaud/froid, atmosphère (brume
 * volumétrique, poussière), pluie sur la vitre, sons d'ambiance, éléments interactifs.
 *
 * API publique utilisée par le reste de l'application (inchangée) : `root`, `bench`,
 * `interactables`, `build`, `update`, `updateHomeCamera`, `setInspectionMode`, `dispose`.
 * Ajouts : `materials`, `lighting`, `propsRoot`, `createBatch`/`addStaticMeshes` (accessoires),
 * `raycastInteractable` (visée du joueur), `lightsOn`/`setLights`.
 *
 * Performance : géométrie statique fusionnée par matériau, chaînettes instanciées, poussière en
 * un seul appel de dessin, ombres statiques recalculées à la demande, aucune allocation par image.
 */
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import type { AppContext } from '../core/context';
import type { FrameInfo } from '../core/Engine';
import type { QualityProfile } from '../core/quality';
import { yieldToMain } from '../core/scheduler';
import type { LoopHandle } from '../audio/types';
import { INSPECTION_VIEW, MAT } from './layout';
import type { BenchInfo, Interactable } from './types';
import { createWorldUniforms, type WorldUniforms } from './uniforms';
import { WorldMaterials } from './materials/WorldMaterials';
import { StaticBatch } from './geometry/StaticBatch';
import type { DecorBuild } from './room/types';
import { buildShell, type GlassRect } from './room/shell';
import { buildBench } from './room/bench';
import { buildLightSwitch, buildNeonFixture, buildPendantBulb } from './room/fixtures';
import { MagnifierLamp } from './room/MagnifierLamp';
import { buildLabels } from './room/labels';
import { createRainGlassMaterial } from './window/rainGlass';
import { Lighting } from './lighting/Lighting';
import { createWindowShaft, type WindowShaft } from './atmosphere/shaft';
import { createFogNode, createFogSettings, type FogSettings } from './atmosphere/fog';
import { Dust } from './atmosphere/dust';
import {
  createBenchInteractable,
  createLampInteractable,
  createSwitchInteractable,
  type HighlightTarget,
} from './interact/interactables';
import { HOME_CAMERA_FOV, homeCameraPose, type HomeCameraPose } from './camera/homeCamera';
import { createStudioBackdrop } from './studioBackdrop';
import { buildProps, type PropsHandle } from './props';

interface AmbienceLoops {
  rainRoof: LoopHandle;
  rainWindow: LoopHandle;
  neonHum: LoopHandle;
  roomTone: LoopHandle;
}

export class World {
  readonly root = new THREE.Group();
  readonly interactables: Interactable[] = [];
  readonly bench: BenchInfo;
  readonly uniforms: WorldUniforms = createWorldUniforms();
  readonly materials: WorldMaterials;
  /** Accessoires (masqués avec la salle en fond studio). */
  readonly propsRoot = new THREE.Group();
  lighting!: Lighting;
  readonly fogSettings: FogSettings = createFogSettings();

  /** Tout ce qui est masqué en fond studio neutre. */
  private readonly roomRoot = new THREE.Group();
  private lamp: MagnifierLamp | null = null;
  private dust: Dust | null = null;
  private glass: THREE.Mesh | null = null;
  private glassRect: GlassRect | null = null;
  private readonly glassMaterials: { full: THREE.Material | null; simple: THREE.Material | null } = {
    full: null,
    simple: null,
  };
  private shaft: WindowShaft = createWindowShaft();
  private switchLever: THREE.Group | null = null;
  private switchPosition = new THREE.Vector3();
  private props: PropsHandle | null = null;
  private loops: AmbienceLoops | null = null;
  private neonHumLevel = -1;
  private neonHumVolume = -1;
  private readonly disposers: (() => void)[] = [];
  private readonly highlights: Record<'switch' | 'lamp' | 'bench', HighlightTarget> = {
    switch: { target: 0 },
    lamp: { target: 0 },
    bench: { target: 0 },
  };
  private readonly inspection = { active: false, neutral: false, lampWasOn: true };
  private studioBackdrop: Node<'vec3'> | null = null;
  private savedBackground: {
    node: Node | null | undefined;
    color: THREE.Color | THREE.Texture | null;
  } | null = null;
  private readonly homePose: HomeCameraPose = { position: [0, 0, 0], target: [0, 0, 0] };
  private readonly raycaster = new THREE.Raycaster();
  private readonly rayHits: THREE.Intersection[] = [];
  private readonly rayTargets: THREE.Object3D[] = [];
  private readonly lampAudioPosition = new THREE.Vector3();
  private built = false;

  constructor(protected readonly ctx: AppContext) {
    this.root.name = 'Atelier';
    this.roomRoot.name = 'Salle';
    this.propsRoot.name = 'Accessoires';
    const matCenter = new THREE.Vector3(...MAT.center);
    this.bench = {
      matCenter,
      matSize: new THREE.Vector2(MAT.size[0], MAT.size[1]),
      viewPosition: matCenter.clone().add(new THREE.Vector3(...INSPECTION_VIEW.offset)),
    };
    this.materials = new WorldMaterials(ctx, this.uniforms);
  }

  /** Lumières de la pièce allumées (interrupteur). */
  get lightsOn(): boolean {
    return this.lighting?.lightsOn ?? true;
  }

  // --- Construction -----------------------------------------------------------------------

  async build(progress: (value: number, label: string) => void): Promise<void> {
    const { ctx } = this;
    const { engine, physics } = ctx;
    const b: DecorBuild = {
      batch: new StaticBatch(),
      overlays: new StaticBatch(),
      group: this.roomRoot,
      materials: this.materials,
      colliders: [],
    };

    progress(0.05, 'Construction de la salle…');
    this.glassRect = buildShell(b);
    await yieldToMain();
    progress(0.15, 'Établi et panneau perforé…');
    const bench = buildBench(b);
    // Le plateau reste visible en fond studio : il sort de la salle.
    this.root.add(bench.top);
    await yieldToMain();
    progress(0.25, 'Luminaires…');
    const bulb = buildPendantBulb(b);
    const neon = buildNeonFixture(b);
    const lightSwitch = buildLightSwitch(b);
    this.switchLever = lightSwitch.lever;
    this.switchPosition.copy(lightSwitch.position);
    const lamp = new MagnifierLamp(b);
    this.lamp = lamp;
    buildLabels(ctx, b);
    this.buildWindowGlass();
    await yieldToMain();

    progress(0.35, 'Fusion de la géométrie…');
    for (const mesh of b.batch.build((id) => this.materials.get(id), 'Décor')) this.roomRoot.add(mesh);
    for (const mesh of b.overlays.build((id) => this.materials.get(id), 'Décalques')) {
      mesh.renderOrder = 1;
      this.roomRoot.add(mesh);
    }
    for (const spec of b.colliders) this.disposers.push(physics.addStatic(spec));

    progress(0.42, 'Éclairage…');
    this.lighting = new Lighting(engine.scene, this.uniforms, {
      bulbPosition: bulb.lightPosition,
      neonStart: neon.start,
      neonEnd: neon.end,
      shaft: this.shaft,
      lamp,
      onNeonClick: () => this.onNeonClick(),
    });
    if (ctx.dev.frozenTime !== null) this.lighting.neonFlicker.randomBursts = false;
    this.lighting.setLights(true, true);

    progress(0.48, 'Atmosphère…');
    engine.scene.fogNode = createFogNode(this.uniforms, this.fogSettings, this.shaft);
    this.dust = new Dust(this.uniforms, this.shaft);

    this.root.add(this.roomRoot, this.propsRoot, this.lighting.group, this.dust.sprite);
    this.setupInteractables(bench.targets, lightSwitch.targets);
    this.setupAudio(neon.start, neon.end);

    this.applyQuality(engine.quality);
    this.disposers.push(engine.onQualityChange((profile) => this.applyQuality(profile)));

    progress(0.55, 'Accessoires…');
    this.props = await buildProps(ctx, this, (v, label) => progress(0.55 + v * 0.25, label));
    this.interactables.push(...this.props.interactables);

    engine.scene.add(this.root);
    engine.scene.background = new THREE.Color(0x0b0c0e);

    progress(0.85, 'Textures du décor…');
    await ctx.textures.whenIdle();
    progress(0.93, 'Lumière de la salle…');
    this.uniforms.time.value = ctx.dev.frozenTime ?? 0;
    this.lighting.update(0);
    this.lighting.captureEnvironment(
      engine.renderer,
      engine.quality.envMapSize,
      this.dust ? [this.dust.sprite] : [],
    );
    this.lighting.invalidateShadows();
    this.built = true;
    progress(1, 'Salle prête');
  }

  /** Lot statique pour les accessoires (fusion par matériau). */
  createBatch(): StaticBatch {
    return new StaticBatch();
  }

  /** Fusionne un lot et ajoute les maillages aux accessoires. */
  addStaticMeshes(batch: StaticBatch, name = 'Accessoires'): THREE.Mesh[] {
    const meshes = batch.build((id) => this.materials.get(id), name);
    for (const mesh of meshes) this.propsRoot.add(mesh);
    return meshes;
  }

  private buildWindowGlass(): void {
    const rect = this.glassRect;
    if (!rect) return;
    const geometry = new THREE.PlaneGeometry(rect.z[1] - rect.z[0], rect.y[1] - rect.y[0]);
    const glass = new THREE.Mesh(geometry, this.glassMaterial(this.ctx.engine.quality.rainOnGlass));
    glass.name = 'Vitre';
    glass.position.set(rect.x, (rect.y[0] + rect.y[1]) / 2, (rect.z[0] + rect.z[1]) / 2);
    glass.rotation.y = Math.PI / 2;
    glass.castShadow = false;
    glass.receiveShadow = false;
    this.glass = glass;
    this.roomRoot.add(glass);
  }

  private glassMaterial(full: boolean): THREE.Material {
    const key = full ? 'full' : 'simple';
    let material = this.glassMaterials[key];
    if (!material) {
      material = this.materials.adopt(
        `world.glass.rain.${key}`,
        createRainGlassMaterial(this.uniforms, { full }),
      );
      this.glassMaterials[key] = material;
    }
    return material;
  }

  private setupInteractables(benchTargets: THREE.Mesh[], switchTargets: THREE.Mesh[]): void {
    const { ctx } = this;
    const lamp = this.lamp!;
    this.interactables.push(
      createSwitchInteractable({
        targets: switchTargets,
        isOn: () => this.lightsOn,
        toggle: () => this.setLights(!this.lightsOn),
        highlight: this.highlights.switch,
      }),
      createLampInteractable({
        targets: lamp.targets,
        isOn: () => lamp.isOn,
        toggle: () => {
          lamp.setOn(!lamp.isOn);
          ctx.audio.play('lamp.toggle', { position: lamp.light.getWorldPosition(this.lampAudioPosition) });
        },
        highlight: this.highlights.lamp,
      }),
      createBenchInteractable({
        targets: benchTargets,
        open: () => ctx.bus.emit('inventory:open'),
        highlight: this.highlights.bench,
      }),
    );
  }

  private setupAudio(neonStart: THREE.Vector3, neonEnd: THREE.Vector3): void {
    const audio = this.ctx.audio;
    const rect = this.glassRect;
    const windowCenter = rect
      ? new THREE.Vector3(rect.x + 0.1, (rect.y[0] + rect.y[1]) / 2, (rect.z[0] + rect.z[1]) / 2)
      : new THREE.Vector3(-2.5, 1.5, -0.65);
    const neonCenter = new THREE.Vector3().addVectors(neonStart, neonEnd).multiplyScalar(0.5);
    // Les boucles peuvent être créées avant `resume()` (démarrage au premier geste).
    this.loops = {
      rainRoof: audio.loop('rain.roof', { volume: 0.5 }),
      rainWindow: audio.loop('rain.window', { volume: 0.75, position: windowCenter }),
      neonHum: audio.loop('neon.hum', { volume: 0.3, position: neonCenter }),
      roomTone: audio.loop('room.tone', { volume: 0.4 }),
    };
  }

  private onNeonClick(): void {
    const { lighting } = this;
    if (!lighting) return;
    this.ctx.audio.play('neon.flicker', {
      position: this.uniforms.neonStart.value.clone().lerp(this.uniforms.neonEnd.value, 0.9),
      volume: 0.6,
    });
  }

  // --- États ------------------------------------------------------------------------------

  /** Interrupteur mural (ampoule + néon). */
  setLights(on: boolean): void {
    if (!this.lighting) return;
    this.lighting.setLights(on);
    if (this.switchLever) this.switchLever.rotation.x = on ? -0.38 : 0.38;
    this.ctx.audio.play('switch.toggle', { position: this.switchPosition });
  }

  private applyQuality(profile: QualityProfile): void {
    this.lighting?.applyQuality(profile);
    this.dust?.setCount(profile.dustParticles);
    this.uniforms.volumetrics.value = profile.volumetrics ? 1 : 0;
    if (this.glass) this.glass.material = this.glassMaterial(profile.rainOnGlass);
    if (this.built && this.lighting && this.lighting.environmentSize !== profile.envMapSize) {
      // Recapture différée (hors de la pile de l'événement d'interface).
      this.ctx.idle.push(() => {
        this.lighting.captureEnvironment(
          this.ctx.engine.renderer,
          profile.envMapSize,
          this.dust ? [this.dust.sprite] : [],
        );
      });
    }
  }

  /**
   * Mode inspection :
   * - `active` : ambiance tamisée, lampe loupe allumée et orientée vers le tapis ;
   * - `neutral` : salle et accessoires masqués (sauf plateau et tapis), fond studio dégradé,
   *   brume et poussière coupées.
   * Le retour restaure exactement l'état précédent (lampe allumée/éteinte, fond, brume).
   */
  setInspectionMode(state: { active: boolean; neutral: boolean }): void {
    const s = this.inspection;
    const lamp = this.lamp;
    if (!this.lighting || !lamp) return;
    const neutral = state.active && state.neutral;
    if (state.active !== s.active) {
      if (state.active) {
        s.lampWasOn = lamp.isOn;
        lamp.setOn(true);
        lamp.setPose('inspect');
        this.lighting.setDim(0.6);
      } else {
        lamp.setOn(s.lampWasOn);
        lamp.setPose('idle');
        this.lighting.setDim(1);
      }
      this.lighting.setInspection(state.active);
      s.active = state.active;
    }
    if (neutral !== s.neutral) {
      const scene = this.ctx.engine.scene;
      if (neutral) {
        this.savedBackground = {
          node: scene.backgroundNode,
          color: scene.background as THREE.Color | THREE.Texture | null,
        };
        this.studioBackdrop ??= createStudioBackdrop();
        scene.backgroundNode = this.studioBackdrop;
      } else if (this.savedBackground) {
        scene.backgroundNode = this.savedBackground.node ?? null;
        scene.background = this.savedBackground.color;
        this.savedBackground = null;
      }
      this.roomRoot.visible = !neutral;
      this.propsRoot.visible = !neutral;
      if (this.dust) this.dust.sprite.visible = !neutral && this.dust.sprite.count > 0;
      this.uniforms.haze.value = neutral ? 0 : 1;
      this.lighting.setNeutral(neutral);
      s.neutral = neutral;
    }
  }

  // --- Boucle ---------------------------------------------------------------------------

  update(frame: FrameInfo): void {
    if (!this.built) return;
    const u = this.uniforms;
    u.time.value = frame.time;
    const camera = this.ctx.engine.camera;
    const fovRad = (camera.fov * Math.PI) / 180;
    u.pixelsPerMeter.value = this.ctx.engine.canvas.height / (2 * Math.tan(fovRad / 2));
    // Surbrillances lissées.
    const k = Math.min(1, frame.dt * 10);
    u.highlightSwitch.value += (this.highlights.switch.target - u.highlightSwitch.value) * k;
    u.highlightLamp.value += (this.highlights.lamp.target - u.highlightLamp.value) * k;
    u.highlightBench.value += (this.highlights.bench.target - u.highlightBench.value) * k;

    // Pendant le mouvement du bras, seule l'ombre de la lampe est recalculée (Lighting) ; les
    // ombres statiques (ampoule, fenêtre) le sont une fois le bras immobile.
    const wasMoving = this.lamp?.moving ?? false;
    this.lamp?.update(frame.dt);
    this.lighting.update(frame.dt);
    if (wasMoving && !(this.lamp?.moving ?? false)) this.lighting.invalidateShadows();
    this.updateAudio();
    this.props?.update(frame);
  }

  private updateAudio(): void {
    const loops = this.loops;
    if (!loops) return;
    const flicker = this.lighting.neonFlicker;
    const volume = flicker.powered ? 0.3 : 0;
    if (volume !== this.neonHumVolume) {
      loops.neonHum.setVolume(volume, 0.08);
      this.neonHumVolume = volume;
    }
    const level = Math.round(flicker.buzz * 20) / 20;
    if (level !== this.neonHumLevel) {
      loops.neonHum.setIntensity(level);
      this.neonHumLevel = level;
    }
  }

  /** Caméra lente de l'écran d'accueil (déterministe en fonction du temps). */
  updateHomeCamera(camera: THREE.PerspectiveCamera, time: number): void {
    const pose = homeCameraPose(time, this.homePose);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    if (camera.fov !== HOME_CAMERA_FOV) {
      camera.fov = HOME_CAMERA_FOV;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Élément interactif visé par un rayon (visée du joueur), le plus proche dans sa distance
   * d'interaction, ou `null`.
   */
  raycastInteractable(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
  ): { interactable: Interactable; distance: number } | null {
    this.raycaster.set(origin, direction);
    this.raycaster.far = 3;
    this.rayTargets.length = 0;
    for (const it of this.interactables) for (const t of it.targets) this.rayTargets.push(t);
    this.rayHits.length = 0;
    this.raycaster.intersectObjects(this.rayTargets, true, this.rayHits);
    for (const hit of this.rayHits) {
      for (const it of this.interactables) {
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          if (it.targets.includes(o)) {
            return hit.distance <= (it.maxDistance ?? 1.8)
              ? { interactable: it, distance: hit.distance }
              : null;
          }
          o = o.parent;
        }
      }
    }
    return null;
  }

  dispose(): void {
    this.props?.dispose();
    this.props = null;
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    if (this.loops) {
      for (const loop of Object.values(this.loops)) loop.stop(0.3);
      this.loops = null;
    }
    const scene = this.ctx.engine.scene;
    scene.remove(this.root);
    scene.fogNode = null;
    if (this.inspection.neutral && this.savedBackground) {
      scene.backgroundNode = this.savedBackground.node ?? null;
      scene.background = this.savedBackground.color;
    }
    this.lighting?.dispose();
    this.dust?.dispose();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.materials.dispose();
    this.ctx.textures.disposeScope('world/');
    this.built = false;
  }
}
