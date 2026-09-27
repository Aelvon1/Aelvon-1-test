/**
 * Moteur audio (Web Audio API) : tous les sons sont synthétisés à la volée, aucun fichier.
 *
 * - Contexte créé paresseusement au premier `resume()` (geste utilisateur). `loop()` peut être
 *   appelé avant : la boucle est mise en attente et démarre à la création du contexte ; `play()`
 *   avant le démarrage est ignoré (pas d'accumulation de sons joués d'un coup au déblocage).
 * - Bus ambiance / effets / interface → maître (compresseur + limiteur), volumes et coupure par
 *   rampes (aucun clic), réverbération de pièce, spatialisation HRTF des sons positionnés,
 *   auditeur recalé sur la caméra à chaque image.
 * - Un minuteur léger (50 ms) programme les événements aléatoires des boucles avec 300 ms
 *   d'avance sur l'horloge audio (gouttes, parasites, notes de la radio).
 * - Onglet masqué : contexte suspendu (aucun coût CPU), repris au retour.
 */
import type * as THREE from 'three/webgpu';
import type { AudioApi, AudioBus, AudioDebugInfo, LoopHandle, LoopId, PlayOptions, SoundId } from './types';
import { smoothParam } from './envelope';
import { SynthKit, type Voice } from './kit';
import { LOOPS, type LoopControl, type LoopSpec } from './loops';
import { AUDIO_BUSES, Mixer } from './mixer';
import { clamp01, jitter, mulberry32, volumeToGain } from './math';
import { VoiceLimiter } from './scheduling';
import { SOUNDS } from './sounds';

/** Avance de programmation des événements des boucles (s). */
const LOOKAHEAD = 0.3;
/** Période du minuteur de programmation (ms). */
const TICK_MS = 50;
/** Distance de référence des sons ponctuels positionnés (m). */
const SHOT_REF_DISTANCE = 0.8;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Paramètres de l'auditeur (absents sous Firefox : repli sur setPosition/setOrientation). */
interface ListenerParams {
  positionX?: AudioParam;
  positionY?: AudioParam;
  positionZ?: AudioParam;
  forwardX?: AudioParam;
  forwardY?: AudioParam;
  forwardZ?: AudioParam;
  upX?: AudioParam;
  upY?: AudioParam;
  upZ?: AudioParam;
}

function createPanner(ctx: BaseAudioContext, refDistance: number): PannerNode {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = refDistance;
  p.maxDistance = 40;
  // Atténuation un peu plus douce que l'inverse strict : la pièce est petite et réverbérante.
  p.rolloffFactor = 0.85;
  return p;
}

function setPannerPosition(p: PannerNode, pos: Vec3): void {
  const params = p as unknown as { positionX?: AudioParam; positionY?: AudioParam; positionZ?: AudioParam };
  if (params.positionX && params.positionY && params.positionZ) {
    params.positionX.value = pos.x;
    params.positionY.value = pos.y;
    params.positionZ.value = pos.z;
  } else {
    p.setPosition(pos.x, pos.y, pos.z);
  }
}

/** Accès internes du moteur nécessaires aux poignées de boucle. */
interface EngineInternals {
  readonly context: BaseAudioContext | null;
  readonly mixer: Mixer | null;
  readonly kit: SynthKit | null;
  forgetLoop(handle: LoopHandleImpl): void;
}

/** Poignée de boucle : état désiré conservé tant que le contexte n'existe pas. */
class LoopHandleImpl implements LoopHandle {
  private volume: number;
  private intensity: number;
  private position: Vec3 | null;
  private stopped = false;
  private level: GainNode | null = null;
  private panner: PannerNode | null = null;
  private voice: Voice | null = null;
  private control: LoopControl | null = null;

  constructor(
    private readonly engine: EngineInternals,
    readonly id: LoopId,
    private readonly spec: LoopSpec,
    options: PlayOptions,
  ) {
    this.volume = Math.max(0, options.volume ?? 1);
    this.intensity = spec.intensity;
    this.position = options.position
      ? { x: options.position.x, y: options.position.y, z: options.position.z }
      : null;
  }

  get playing(): boolean {
    return !this.stopped;
  }

  get attached(): boolean {
    return this.voice !== null;
  }

  /** Construit le graphe de la boucle (contexte disponible). */
  attach(ctx: BaseAudioContext, kit: SynthKit, mixer: Mixer): void {
    if (this.stopped || this.voice) return;
    const t0 = ctx.currentTime + 0.03;
    const level = ctx.createGain();
    level.gain.value = 0;
    level.gain.setValueAtTime(0, t0);
    level.gain.setTargetAtTime(this.spec.gain * this.volume, t0, Math.max(0.01, this.spec.fadeIn / 3));
    const bus = mixer.buses[this.spec.bus];
    if (this.position) {
      this.panner = createPanner(ctx, this.spec.refDistance);
      setPannerPosition(this.panner, this.position);
      level.connect(this.panner).connect(bus);
    } else {
      level.connect(bus);
    }
    const voice = kit.voice(level, 1);
    voice.own(level);
    if (this.panner) voice.own(this.panner);
    if (this.spec.reverb > 0) {
      // Envoi pris avant la spatialisation : la réverbération ne dépend pas de la distance.
      const send = voice.gain(this.spec.reverb);
      level.connect(send).connect(mixer.sends[this.spec.bus]);
    }
    this.level = level;
    this.voice = voice;
    this.control = this.spec.create(voice, t0, this.intensity);
  }

  setVolume(volume: number, rampSeconds = 0.3): void {
    this.volume = Math.max(0, Number.isFinite(volume) ? volume : 0);
    const ctx = this.engine.context;
    if (!ctx || !this.level || this.stopped) return;
    smoothParam(this.level.gain, this.spec.gain * this.volume, ctx.currentTime, Math.max(0.02, rampSeconds));
  }

  setIntensity(value: number): void {
    this.intensity = clamp01(Number.isFinite(value) ? value : 0);
    const ctx = this.engine.context;
    if (!ctx || !this.control || this.stopped) return;
    this.control.setIntensity(this.intensity, ctx.currentTime);
  }

  setPosition(position: THREE.Vector3): void {
    if (this.position) {
      this.position.x = position.x;
      this.position.y = position.y;
      this.position.z = position.z;
    } else {
      this.position = { x: position.x, y: position.y, z: position.z };
    }
    if (this.panner) {
      setPannerPosition(this.panner, this.position);
      return;
    }
    const ctx = this.engine.context;
    const mixer = this.engine.mixer;
    if (!ctx || !mixer || !this.level || !this.voice || this.stopped) return;
    // Boucle créée sans position : insertion d'un panoramique HRTF.
    const bus = mixer.buses[this.spec.bus];
    this.panner = this.voice.own(createPanner(ctx, this.spec.refDistance));
    setPannerPosition(this.panner, this.position);
    this.level.disconnect(bus);
    this.level.connect(this.panner).connect(bus);
  }

  stop(fadeSeconds = 0.4): void {
    if (this.stopped) return;
    this.stopped = true;
    this.engine.forgetLoop(this);
    const ctx = this.engine.context;
    if (!ctx || !this.level || !this.voice) return;
    const now = ctx.currentTime;
    const fade = Math.max(0.02, fadeSeconds);
    this.control?.release?.(now, fade);
    smoothParam(this.level.gain, 0, now, fade);
    // Arrêt des sources une fois le fondu éteint (< −40 dB) ; la voix se libère d'elle-même.
    this.voice.stopAll(now + fade * 1.7 + 0.02);
    this.control = null;
  }

  schedule(now: number, until: number): void {
    this.control?.schedule?.(now, until);
  }
}

export class AudioEngine implements AudioApi, EngineInternals {
  private ctx: AudioContext | null = null;
  private mixerNode: Mixer | null = null;
  private synthKit: SynthKit | null = null;
  private unsupported = false;
  private readonly rng = mulberry32((Date.now() ^ 0x5bd1e995) >>> 0);
  private readonly limiter = new VoiceLimiter();
  private readonly loops = new Set<LoopHandleImpl>();
  private readonly busVolumes: Record<AudioBus, number> = { ambience: 0.7, sfx: 0.8, ui: 0.6 };
  private muted = false;
  private suspendedByVisibility = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Dernier état de l'auditeur (évite les mises à jour inutiles). */
  private readonly listenerState = new Float64Array(9).fill(Number.NaN);
  private readonly listenerScratch = new Float64Array(9);
  private readonly disposers: (() => void)[] = [];

  get started(): boolean {
    return this.ctx?.state === 'running';
  }

  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  get mixer(): Mixer | null {
    return this.mixerNode;
  }

  get kit(): SynthKit | null {
    return this.synthKit;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    try {
      // Si le navigateur refuse (pas de geste), la promesse peut rester en attente : on borne.
      await Promise.race([ctx.resume(), new Promise<void>((resolve) => setTimeout(resolve, 1000))]);
    } catch (error) {
      console.warn('[Audio] Reprise du contexte impossible :', error);
    }
  }

  play(id: SoundId, options: PlayOptions = {}): void {
    const ctx = this.ctx;
    const kit = this.synthKit;
    const mixer = this.mixerNode;
    // Avant le démarrage (ou onglet masqué) : son ignoré.
    if (!ctx || !kit || !mixer || ctx.state !== 'running') return;
    const spec = SOUNDS[id];
    if (!spec) return;
    const now = ctx.currentTime;
    if (!this.limiter.canStart(id, now, spec.maxVoices, spec.minInterval)) return;
    const volume = Math.max(0, options.volume ?? 1) * spec.gain * jitter(this.rng, spec.volumeJitter);
    if (volume <= 1e-4) return;
    const pitch = Math.max(0.25, options.pitch ?? 1) * jitter(this.rng, spec.pitchJitter);
    const bus = mixer.buses[spec.bus];
    let destination: AudioNode = bus;
    let panner: PannerNode | null = null;
    if (options.position) {
      panner = createPanner(ctx, SHOT_REF_DISTANCE);
      setPannerPosition(panner, options.position);
      panner.connect(bus);
      destination = panner;
    }
    const voice = kit.voice(destination, volume);
    if (panner) voice.own(panner);
    if (spec.reverb > 0) {
      const send = voice.gain(spec.reverb);
      voice.out.connect(send).connect(mixer.sends[spec.bus]);
    }
    // Petite marge : la programmation tombe toujours dans le futur de l'horloge audio.
    spec.recipe({ v: voice, t: now + 0.005, p: pitch, rng: this.rng });
    this.limiter.register(id, now, voice.end);
  }

  loop(id: LoopId, options: PlayOptions = {}): LoopHandle {
    const spec = LOOPS[id];
    const handle = new LoopHandleImpl(this, id, spec, options);
    this.loops.add(handle);
    if (this.ctx && this.synthKit && this.mixerNode) handle.attach(this.ctx, this.synthKit, this.mixerNode);
    return handle;
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    this.busVolumes[bus] = clamp01(Number.isFinite(volume) ? volume : 0);
    this.mixerNode?.setBusGain(bus, volumeToGain(this.busVolumes[bus]));
  }

  updateListener(camera: THREE.Camera): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const next = this.listenerScratch;
    // Position (colonne 3), avant = −Z local (colonne 2), haut = +Y local (colonne 1).
    next[0] = e[12]!;
    next[1] = e[13]!;
    next[2] = e[14]!;
    next[3] = -e[8]!;
    next[4] = -e[9]!;
    next[5] = -e[10]!;
    next[6] = e[4]!;
    next[7] = e[5]!;
    next[8] = e[6]!;
    const s = this.listenerState;
    let changed = false;
    for (let i = 0; i < 9; i++) {
      if (!(Math.abs(next[i]! - s[i]!) < 1e-5)) changed = true;
      s[i] = next[i]!;
    }
    if (!changed) return;
    const l = ctx.listener as unknown as ListenerParams;
    if (
      l.positionX &&
      l.positionY &&
      l.positionZ &&
      l.forwardX &&
      l.forwardY &&
      l.forwardZ &&
      l.upX &&
      l.upY &&
      l.upZ
    ) {
      l.positionX.value = s[0]!;
      l.positionY.value = s[1]!;
      l.positionZ.value = s[2]!;
      l.forwardX.value = s[3]!;
      l.forwardY.value = s[4]!;
      l.forwardZ.value = s[5]!;
      l.upX.value = s[6]!;
      l.upY.value = s[7]!;
      l.upZ.value = s[8]!;
    } else {
      ctx.listener.setPosition(s[0]!, s[1]!, s[2]!);
      ctx.listener.setOrientation(s[3]!, s[4]!, s[5]!, s[6]!, s[7]!, s[8]!);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.mixerNode?.setMuted(muted);
  }

  /** Débogage : état du contexte, boucles actives, niveau de sortie. */
  debugInfo(): AudioDebugInfo {
    const ctx = this.ctx;
    return {
      state: this.unsupported ? 'unsupported' : (ctx?.state ?? 'none'),
      sampleRate: ctx?.sampleRate ?? 0,
      loops: [...this.loops].map((l) => l.id),
      level: this.mixerNode && ctx?.state === 'running' ? this.mixerNode.level() : 0,
      muted: this.muted,
    };
  }

  forgetLoop(handle: LoopHandleImpl): void {
    this.loops.delete(handle);
  }

  dispose(): void {
    for (const loop of [...this.loops]) loop.stop(0.05);
    this.loops.clear();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.mixerNode?.dispose();
    this.mixerNode = null;
    this.synthKit = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }

  // --- Interne ---------------------------------------------------------------------------

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.unsupported) return null;
    const Ctor =
      typeof window === 'undefined'
        ? undefined
        : (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctor) {
      this.unsupported = true;
      console.warn('[Audio] Web Audio indisponible : l’atelier restera silencieux.');
      return null;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch (error) {
      this.unsupported = true;
      console.warn('[Audio] Création du contexte audio impossible :', error);
      return null;
    }
    this.ctx = ctx;
    this.synthKit = new SynthKit(ctx, this.rng);
    this.mixerNode = new Mixer(ctx, this.synthKit);
    for (const bus of AUDIO_BUSES) {
      this.mixerNode.buses[bus].gain.value = volumeToGain(this.busVolumes[bus]);
      this.mixerNode.sends[bus].gain.value = volumeToGain(this.busVolumes[bus]);
    }
    if (this.muted) this.mixerNode.mute.gain.value = 0;
    // Boucles demandées avant la création du contexte.
    for (const loop of this.loops) loop.attach(ctx, this.synthKit, this.mixerNode);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.installLifecycle(ctx);
    return ctx;
  }

  /** Programme les événements des boucles sur l'horloge audio. */
  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const loop of this.loops) loop.schedule(now, now + LOOKAHEAD);
  }

  private installLifecycle(ctx: AudioContext): void {
    const onVisibility = () => {
      if (document.hidden) {
        if (ctx.state === 'running') {
          this.suspendedByVisibility = true;
          void ctx.suspend().catch(() => undefined);
        }
      } else if (this.suspendedByVisibility) {
        this.suspendedByVisibility = false;
        void ctx.resume().catch(() => undefined);
      }
    };
    // Contexte bloqué par la politique d'autolecture : le prochain geste le débloque.
    const onGesture = () => {
      if (ctx.state === 'suspended' && !this.suspendedByVisibility && !document.hidden) {
        void ctx.resume().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    this.disposers.push(
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('pointerdown', onGesture, true),
      () => window.removeEventListener('keydown', onGesture, true),
    );
  }
}
