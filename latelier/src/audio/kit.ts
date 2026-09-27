/**
 * Boîte à outils de synthèse Web Audio : tampons partagés (bruits, textures) créés une seule
 * fois par contexte, et « voix » éphémères qui libèrent (déconnectent) tous leurs nœuds dès que
 * leur dernière source s'est tue.
 */
import { brownNoise, makeSeamless, pinkNoise, renderCrackle, renderImpacts, whiteNoise } from './buffers';
import { applyEnvelope, type EnvelopeSegment } from './envelope';
import { mulberry32, type Rng } from './math';

export type NoiseColor = 'white' | 'pink' | 'brown';

/** Tampons partagés (générés à la demande, une fois par contexte). */
export type SharedBufferId =
  NoiseColor | 'roofImpactsA' | 'roofImpactsB' | 'glassImpacts' | 'sizzlePops' | 'crackle';

export class SynthKit {
  private readonly buffers = new Map<SharedBufferId, AudioBuffer>();
  private readonly curves = new Map<string, Float32Array<ArrayBuffer>>();
  private readonly waves = new Map<string, PeriodicWave>();

  constructor(
    readonly ctx: BaseAudioContext,
    readonly rng: Rng,
  ) {}

  /** Tampon partagé (mono, bouclable sans couture). */
  buffer(id: SharedBufferId): AudioBuffer {
    let buffer = this.buffers.get(id);
    if (!buffer) {
      buffer = this.createBuffer(id);
      this.buffers.set(id, buffer);
    }
    return buffer;
  }

  /**
   * Forme d'onde périodique mise en cache : `harmonics[k]` = amplitude de l'harmonique k + 1
   * (phase sinus).
   */
  periodicWave(key: string, harmonics: readonly number[]): PeriodicWave {
    let wave = this.waves.get(key);
    if (!wave) {
      const real = new Float32Array(harmonics.length + 1);
      const imag = new Float32Array(harmonics.length + 1);
      harmonics.forEach((a, k) => (imag[k + 1] = a));
      wave = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(key, wave);
    }
    return wave;
  }

  /** Crée un tampon mono à partir d'échantillons. */
  fromSamples(samples: Float32Array, channels: Float32Array[] = [samples]): AudioBuffer {
    const buffer = this.ctx.createBuffer(channels.length, samples.length, this.ctx.sampleRate);
    channels.forEach((data, c) => buffer.getChannelData(c).set(data));
    return buffer;
  }

  /** Courbe de saturation douce (tanh) mise en cache par intensité. */
  saturationCurve(drive: number): Float32Array<ArrayBuffer> {
    const key = `tanh:${drive.toFixed(2)}`;
    let curve = this.curves.get(key);
    if (!curve) {
      const n = 1024;
      curve = new Float32Array(new ArrayBuffer(n * 4));
      const norm = Math.tanh(drive);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / norm;
      }
      this.curves.set(key, curve);
    }
    return curve;
  }

  /** Nouvelle voix éphémère dont la sortie est reliée à `destination`. */
  voice(destination: AudioNode, gain = 1): Voice {
    return new Voice(this, destination, gain);
  }

  private createBuffer(id: SharedBufferId): AudioBuffer {
    const sr = this.ctx.sampleRate;
    // Graines fixes : les textures sont identiques d'une session à l'autre (reproductibilité).
    const seeds: Record<SharedBufferId, number> = {
      white: 11,
      pink: 12,
      brown: 13,
      roofImpactsA: 21,
      roofImpactsB: 22,
      glassImpacts: 23,
      sizzlePops: 24,
      crackle: 25,
    };
    const rng = mulberry32(seeds[id]);
    const fade = Math.floor(0.05 * sr);
    let samples: Float32Array;
    switch (id) {
      case 'white':
        samples = whiteNoise(Math.floor(2.3 * sr), rng);
        break;
      case 'pink':
        samples = makeSeamless(pinkNoise(Math.floor(3.1 * sr) + fade, rng), fade);
        break;
      case 'brown':
        samples = makeSeamless(brownNoise(Math.floor(3.7 * sr) + fade, rng), fade);
        break;
      // Durées premières entre elles : les motifs des couches ne se répètent pas ensemble.
      case 'roofImpactsA':
        samples = renderImpacts(sr, { style: 'roof', rate: 34, seconds: 5.3 }, rng);
        break;
      case 'roofImpactsB':
        samples = renderImpacts(sr, { style: 'roof', rate: 28, seconds: 6.1 }, rng);
        break;
      case 'glassImpacts':
        samples = renderImpacts(sr, { style: 'glass', rate: 22, seconds: 4.7 }, rng);
        break;
      case 'sizzlePops':
        samples = renderImpacts(sr, { style: 'sizzle', rate: 260, seconds: 2.9 }, rng);
        break;
      case 'crackle':
        samples = renderCrackle(sr, 3.3, 9, rng);
        break;
    }
    return this.fromSamples(samples);
  }
}

/**
 * Voix éphémère : crée ses nœuds, programme ses sources, puis se déconnecte entièrement à la fin
 * de la dernière source (aucune fuite de nœuds).
 */
export class Voice {
  /** Gain de sortie (volume de la voix). */
  readonly out: GainNode;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private live = 0;
  private endTime = 0;
  private released = false;

  constructor(
    readonly kit: SynthKit,
    destination: AudioNode,
    gain: number,
  ) {
    this.out = kit.ctx.createGain();
    this.out.gain.value = gain;
    this.out.connect(destination);
    this.nodes.push(this.out);
  }

  get ctx(): BaseAudioContext {
    return this.kit.ctx;
  }

  get rng(): Rng {
    return this.kit.rng;
  }

  /** Fin programmée la plus tardive (temps audio). */
  get end(): number {
    return this.endTime;
  }

  /** Oscillateur démarré à `t0`, arrêté à `t1` (`Infinity` : jusqu'à `stopAll`). */
  osc(type: OscillatorType, frequency: number, t0: number, t1: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = frequency;
    this.addSource(o, t0, t1);
    return o;
  }

  /** Oscillateur à forme d'onde personnalisée (harmoniques). */
  periodic(wave: PeriodicWave, frequency: number, t0: number, t1: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.setPeriodicWave(wave);
    o.frequency.value = frequency;
    this.addSource(o, t0, t1);
    return o;
  }

  /** Lecture d'un bruit partagé à partir d'une position aléatoire. */
  noise(color: NoiseColor, t0: number, t1: number, rate = 1): AudioBufferSourceNode {
    return this.sample(this.kit.buffer(color), t0, t1, { loop: true, rate });
  }

  /** Lecture d'un tampon (position de départ aléatoire si `loop`). */
  sample(
    buffer: AudioBuffer,
    t0: number,
    t1: number,
    options: { loop?: boolean; rate?: number; offset?: number } = {},
  ): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = options.loop ?? false;
    s.playbackRate.value = options.rate ?? 1;
    const offset = options.offset ?? (s.loop ? this.rng() * buffer.duration : 0);
    this.addSource(s, t0, t1, offset);
    return s;
  }

  filter(type: BiquadFilterType, frequency: number, q = 0.707, gainDb = 0): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    f.gain.value = gainDb;
    this.nodes.push(f);
    return f;
  }

  gain(value = 1): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    this.nodes.push(g);
    return g;
  }

  /** Gain piloté par une enveloppe démarrant à `t0`. */
  env(segments: readonly EnvelopeSegment[], t0: number, scale = 1): GainNode {
    const g = this.gain(0);
    applyEnvelope(g.gain, segments, t0, scale);
    return g;
  }

  shaper(drive: number): WaveShaperNode {
    const w = this.ctx.createWaveShaper();
    w.curve = this.kit.saturationCurve(drive);
    w.oversample = '2x';
    this.nodes.push(w);
    return w;
  }

  panner(pan: number): StereoPannerNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    this.nodes.push(p);
    return p;
  }

  /** Relie les nœuds en série ; le dernier est relié à la sortie de la voix. */
  chain(...nodes: AudioNode[]): void {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
    nodes[nodes.length - 1]?.connect(this.out);
  }

  /** Enregistre un nœud créé ailleurs pour qu'il soit libéré avec la voix. */
  own<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  /** Arrête immédiatement (ou à `when`) toutes les sources. */
  stopAll(when: number): void {
    for (const s of this.sources) {
      try {
        s.stop(when);
      } catch {
        // Source déjà arrêtée : rien à faire.
      }
    }
  }

  private addSource(node: AudioScheduledSourceNode, t0: number, t1: number, offset?: number): void {
    this.nodes.push(node);
    this.sources.push(node);
    this.live++;
    this.endTime = Math.max(this.endTime, t1);
    node.onended = () => {
      this.live--;
      if (this.live <= 0) this.release();
    };
    if (node instanceof AudioBufferSourceNode) node.start(t0, offset ?? 0);
    else node.start(t0);
    if (Number.isFinite(t1)) node.stop(Math.max(t0 + 0.001, t1));
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    for (const n of this.nodes) n.disconnect();
    for (const s of this.sources) s.onended = null;
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}
