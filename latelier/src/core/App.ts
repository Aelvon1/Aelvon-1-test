/**
 * Racine de composition de l'application : crée les services, construit la salle, relie la
 * machine à états, les entrées, l'interface et les systèmes 3D.
 *
 * Machine à états :
 *   loading → home → exploration ⇄ inventory → transition → inspection → transition → exploration
 *                         ⇅ paused
 */
import { Engine, UpdatePriority } from './Engine';
import { EventBus } from './EventBus';
import type { AppEvents } from './events';
import { createAppStore, pushToast, type AppStore } from './store';
import { StateMachine } from './StateMachine';
import { Input } from './Input';
import { Physics } from './Physics';
import { IdleQueue, nextFrame } from './scheduler';
import { parseDevParams, type DevParams } from './devParams';
import { loadSettings, sanitizeSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from './settings';
import type { AppContext } from './context';
import type { AppPhase } from './phases';
import { WorkerTextureService } from '../textures/TextureService';
import { MaterialLibraryImpl } from '../materials/MaterialLibrary';
import { registerBaseMaterials } from '../materials/library';
import { AudioEngine } from '../audio/AudioEngine';
import { PostFX } from '../render/PostFX';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Inspection } from '../inspection/Inspection';
import { buildCatalog, listObjectDefs } from '../objects/registry';
import { validateObjectAllPresets } from '../objects/validate';
import { TOOL_IDS } from '../inspection/tools/ids';
import { mountUi } from '../ui/mount';
import type { ObjectParams } from '../objects/types';

export class App {
  /** Contexte partagé (exposé pour le débogage). */
  ctx!: AppContext;
  private world!: World;
  private player!: Player;
  private inspection!: Inspection;
  /** Vrai quand la perte du verrouillage souris est volontaire (inventaire, inspection). */
  private expectUnlock = false;
  /** Phase d'où l'inventaire a été ouvert (pour y revenir à la fermeture). */
  private inventoryReturn: 'exploration' | 'inspection' = 'exploration';
  private busyTransition = false;

  private constructor(
    private readonly store: AppStore,
    private readonly bus: EventBus<AppEvents>,
    private readonly machine: StateMachine,
    private readonly dev: DevParams,
  ) {}

  /** Démarre l'application : interface immédiate, puis chargement progressif. */
  static async boot(canvas: HTMLCanvasElement, uiContainer: HTMLElement): Promise<App> {
    const dev = parseDevParams();
    const settings = loadSettings();
    if (dev.quality) settings.quality = dev.quality;
    const store = createAppStore(settings);
    const bus = new EventBus<AppEvents>();
    const machine = new StateMachine(store);
    const app = new App(store, bus, machine, dev);
    if (dev.hideUi) uiContainer.style.display = 'none';
    mountUi(uiContainer, { store, bus });
    // Accès de débogage (console, captures automatisées) : window.__latelier.
    if (import.meta.env.DEV) (window as unknown as { __latelier: unknown }).__latelier = { app, store, bus };
    try {
      await app.load(canvas);
    } catch (error) {
      console.error('[App] Échec du démarrage :', error);
      store.setState({
        loading: {
          progress: 0,
          label: '',
          error:
            error instanceof Error && error.message
              ? `Impossible de démarrer l’atelier : ${error.message}`
              : 'Impossible de démarrer l’atelier : votre navigateur ne prend en charge ni WebGPU ni WebGL 2.',
        },
      });
      throw error;
    }
    return app;
  }

  private progress(value: number, label: string): void {
    this.store.setState({ loading: { progress: Math.min(1, Math.max(0, value)), label, error: null } });
  }

  private async load(canvas: HTMLCanvasElement): Promise<void> {
    const { store, bus, machine, dev } = this;
    const settings = store.getState().settings;

    this.progress(0.02, 'Initialisation du rendu…');
    await nextFrame();
    const engine = await Engine.create({
      canvas,
      forceWebGL: dev.backend === 'webgl',
      quality: settings.quality,
      frozenTime: dev.frozenTime,
    });
    engine.setDynamicResolution(settings.dynamicResolution);
    engine.camera.fov = settings.fov;
    store.setState({
      renderer: {
        backend: engine.backend,
        reversedDepth: engine.reversedDepth,
        maxAnisotropy: engine.maxAnisotropy,
      },
    });
    if (engine.backend === 'webgl2') console.info('[App] WebGPU indisponible : repli WebGL 2.');

    this.progress(0.08, 'Initialisation de la physique…');
    const physics = await Physics.create();

    this.progress(0.12, 'Préparation des matériaux…');
    const textures = new WorkerTextureService(engine.maxAnisotropy);
    const materials = new MaterialLibraryImpl({
      textures,
      quality: engine.quality.level,
      maxAnisotropy: engine.maxAnisotropy,
    });
    registerBaseMaterials(materials);
    const audio = new AudioEngine();
    const postfx = new PostFX(engine, store);
    postfx.init();
    const input = new Input(canvas, store);
    const ctx: AppContext = {
      engine,
      bus,
      store,
      machine,
      input,
      physics,
      materials,
      textures,
      audio,
      postfx,
      idle: new IdleQueue(),
      dev,
    };
    this.ctx = ctx;

    // Catalogue + validation des définitions (développement).
    store.setState({ catalog: buildCatalog() });
    if (import.meta.env.DEV) this.validateObjects();

    // Salle.
    this.world = new World(ctx);
    await this.world.build((p, label) => this.progress(0.15 + p * 0.65, label));
    this.progress(0.82, 'Génération des textures…');
    await textures.whenIdle();

    this.player = new Player(ctx, this.world);
    this.player.init();
    this.inspection = new Inspection(ctx, this.world);

    // Boucle : ordre des mises à jour.
    engine.add({ update: (f) => this.updateHomeCamera(f.time) }, UpdatePriority.controllers - 1);
    engine.add(this.player, UpdatePriority.controllers);
    engine.add(this.world, UpdatePriority.world);
    engine.add(this.inspection, UpdatePriority.inspection);
    engine.add({ update: () => ctx.idle.run(3) }, UpdatePriority.inspection + 1);
    engine.add({ update: () => audio.updateListener(engine.camera) }, UpdatePriority.audio);
    engine.add(postfx, UpdatePriority.render);
    engine.setStatsListener((stats) => store.setState({ stats }));

    this.wireEvents();
    this.applySettings(settings);

    // Pré-compilation des shaders pour éviter les saccades au premier affichage.
    this.progress(0.9, 'Compilation des shaders…');
    this.world.updateHomeCamera(engine.camera, 0);
    try {
      await engine.renderer.compileAsync(engine.scene, engine.camera);
    } catch (error) {
      console.warn('[App] Pré-compilation partielle :', error);
    }
    this.progress(1, 'Prêt');
    engine.start();

    const previewId = dev.raw.get('preview');
    if (import.meta.env.DEV && previewId) {
      // Banc de prévisualisation d'objet (mise au point de la géométrie).
      const { startPreview } = await import('../dev/preview');
      machine.go('transition');
      machine.go('inspection');
      postfx.setMode('inspection');
      await startPreview(ctx, this.world, previewId);
    } else if (dev.inspect) {
      machine.go('transition');
      await this.openObject(dev.inspect);
    } else if (dev.skipHome) {
      machine.go('exploration');
      this.enterExploration(false);
    } else {
      machine.go('home');
      postfx.setMode('home');
    }
    if (dev.debug) store.setState({ debugOpen: true });
  }

  private validateObjects(): void {
    for (const def of listObjectDefs()) {
      for (const report of validateObjectAllPresets(def, new Set<string>(TOOL_IDS))) {
        for (const w of report.warnings) console.warn(`[validation] ${def.id} (${report.context}) : ${w}`);
        if (report.errors.length) {
          console.error(`[validation] ${def.id} (${report.context}) :\n - ${report.errors.join('\n - ')}`);
          pushToast(this.store, `Définition invalide : ${def.name} (voir la console)`, 'error', 8000);
        }
      }
    }
  }

  private updateHomeCamera(time: number): void {
    if (this.machine.phase !== 'home') return;
    const camera = this.ctx.engine.camera;
    const cam = this.dev.cam;
    if (cam && cam.length >= 6) {
      camera.position.set(cam[0]!, cam[1]!, cam[2]!);
      camera.lookAt(cam[3]!, cam[4]!, cam[5]!);
    } else {
      this.world.updateHomeCamera(camera, time);
    }
  }

  // --- Événements et entrées ------------------------------------------------------------

  private wireEvents(): void {
    const { bus, store, machine, ctx } = this;
    const { input, audio } = ctx;

    bus.on('app:enter', () => {
      void audio.resume();
      audio.play('ui.click');
      if (machine.go('exploration')) this.enterExploration(true);
    });

    bus.on('app:resume', () => {
      store.setState({ overlay: 'none' });
      if (machine.phase === 'paused' || machine.phase === 'exploration') {
        void audio.resume();
        machine.go('exploration');
        this.enterExploration(true);
      }
    });

    bus.on('app:home', () => {
      store.setState({ overlay: 'none' });
      this.player.setActive(false);
      this.expectUnlock = true;
      input.exitPointerLock();
      if (machine.phase === 'inspection') void this.inspection.close(this.player.getEyePose());
      machine.go('home');
      ctx.postfx.setMode('home');
    });

    bus.on('settings:update', (patch) => {
      const next = sanitizeSettings({ ...store.getState().settings, ...patch });
      this.applySettings(next);
    });
    bus.on('settings:reset', () => this.applySettings({ ...DEFAULT_SETTINGS }));
    bus.on('ui:sound', (id) => audio.play(id));

    bus.on('inventory:open', () => this.openInventory());
    bus.on('inventory:close', () => this.closeInventory(true));
    bus.on('inventory:select', ({ objectId, params }) => {
      if (machine.phase !== 'inventory') return;
      store.setState((s) => ({ inventory: { ...s.inventory, pendingObjectId: objectId } }));
      if (machine.go('transition')) void this.openObject(objectId, params);
    });
    bus.on('inventory:thumbnails', ({ objectIds }) => void this.inspection.renderThumbnails(objectIds));

    bus.on('inspection:exit', () => void this.exitInspection());

    input.onPointerLockChange((locked) => {
      if (locked) {
        store.setState((s) => ({ hud: { ...s.hud, clickToResume: false } }));
        return;
      }
      if (this.expectUnlock) {
        this.expectUnlock = false;
        return;
      }
      if (machine.phase === 'exploration') {
        this.player.setActive(false);
        machine.go('paused');
      }
    });

    // Clic sur le canvas en exploration sans verrouillage : reprise.
    ctx.engine.canvas.addEventListener('click', () => {
      if (machine.phase === 'exploration' && !input.pointerLocked) this.enterExploration(true);
    });

    input.onKeyDown((key) => {
      if (key.repeat) return;
      const phase = machine.phase;
      if (key.code === 'Backquote' && !key.inTextField) {
        store.setState((s) => ({ debugOpen: !s.debugOpen }));
        return;
      }
      if (key.code === 'Tab') {
        key.preventDefault();
        if (phase === 'exploration' || phase === 'inspection') this.openInventory();
        else if (phase === 'inventory') this.closeInventory(true);
        return;
      }
      if (key.code === 'Escape') {
        if (store.getState().overlay !== 'none') {
          store.setState({ overlay: 'none' });
          return;
        }
        if (phase === 'inventory') this.closeInventory(false);
        else if (phase === 'inspection') void this.exitInspection();
      }
    });
  }

  private enterExploration(requestLock: boolean): void {
    const { store, ctx } = this;
    this.player.setActive(true);
    ctx.postfx.setMode('exploration');
    store.setState((s) => ({ hud: { ...s.hud, clickToResume: true } }));
    if (requestLock) {
      void ctx.input.requestPointerLock().then((ok) => {
        store.setState((s) => ({ hud: { ...s.hud, clickToResume: !ok } }));
      });
    }
  }

  private openInventory(): void {
    const { machine, ctx, store } = this;
    const phase = machine.phase;
    if (phase !== 'exploration' && phase !== 'inspection') return;
    this.inventoryReturn = phase;
    this.player.setActive(false);
    if (ctx.input.pointerLocked) {
      this.expectUnlock = true;
      ctx.input.exitPointerLock();
    }
    if (machine.go('inventory')) {
      ctx.audio.play('ui.open');
      store.setState((s) => ({ hud: { ...s.hud, prompt: null, targetActive: false } }));
    }
  }

  /** Ferme l'inventaire. `gesture` : l'appel provient d'un geste permettant de recapturer la souris. */
  private closeInventory(gesture: boolean): void {
    const { machine, ctx } = this;
    if (machine.phase !== 'inventory') return;
    ctx.audio.play('ui.close');
    if (this.inventoryReturn === 'inspection' && this.store.getState().inspection) {
      machine.go('inspection');
      return;
    }
    machine.go('exploration');
    this.enterExploration(gesture);
  }

  private async openObject(objectId: string, params?: ObjectParams): Promise<void> {
    if (this.busyTransition) return;
    this.busyTransition = true;
    try {
      this.player.setActive(false);
      await this.inspection.open(objectId, params);
      this.machine.go('inspection');
    } catch (error) {
      console.error('[App] Ouverture de l’objet impossible :', error);
      pushToast(this.store, `Impossible d’ouvrir l’objet : ${(error as Error).message}`, 'error', 6000);
      this.machine.go('exploration');
      this.enterExploration(false);
    } finally {
      this.busyTransition = false;
      this.store.setState((s) => ({ inventory: { ...s.inventory, pendingObjectId: null } }));
    }
  }

  private async exitInspection(): Promise<void> {
    const { machine } = this;
    if (this.busyTransition || machine.phase !== 'inspection') return;
    this.busyTransition = true;
    try {
      machine.go('transition');
      await this.inspection.close(this.player.getEyePose());
      machine.go('exploration');
      this.enterExploration(false);
    } finally {
      this.busyTransition = false;
    }
  }

  private applySettings(settings: Settings): void {
    const { store, ctx } = this;
    store.setState({ settings });
    saveSettings(settings);
    ctx.engine.setQuality(settings.quality);
    ctx.engine.setDynamicResolution(settings.dynamicResolution);
    ctx.audio.setBusVolume('ambience', settings.volumeAmbience);
    ctx.audio.setBusVolume('sfx', settings.volumeSfx);
    ctx.audio.setBusVolume('ui', settings.volumeUi);
    const phase: AppPhase = this.machine.phase;
    if (phase === 'exploration' || phase === 'paused' || phase === 'home') {
      ctx.engine.camera.fov = settings.fov;
      ctx.engine.camera.updateProjectionMatrix();
    }
  }
}
