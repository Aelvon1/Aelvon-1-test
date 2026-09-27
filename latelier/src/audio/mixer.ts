/**
 * Table de mixage : bus ambiance / effets / interface, envois vers une réverbération de pièce
 * (réponse impulsionnelle synthétique), bus maître avec compresseur « glue » puis limiteur,
 * coupure (mute) sans clic et mesure de niveau (débogage).
 *
 *   sources ─► bus[x] ──────────────┐
 *          └─► envoi ─► send[x] ─► réverbération ─► retour ─┤
 *                                                            ▼
 *                         maître ─► mute ─► compresseur ─► limiteur ─► sortie
 */
import type { AudioBus } from './types';
import { renderRoomImpulse } from './buffers';
import { smoothParam } from './envelope';
import type { SynthKit } from './kit';
import { mulberry32 } from './math';

export const AUDIO_BUSES: readonly AudioBus[] = ['ambience', 'sfx', 'ui'];

export class Mixer {
  readonly buses: Record<AudioBus, GainNode>;
  /** Envois de réverbération par bus (suivent le volume du bus). */
  readonly sends: Record<AudioBus, GainNode>;
  readonly master: GainNode;
  readonly mute: GainNode;
  readonly analyser: AnalyserNode;
  private readonly nodes: AudioNode[] = [];
  private readonly meterData: Float32Array<ArrayBuffer>;

  constructor(
    readonly ctx: BaseAudioContext,
    kit: SynthKit,
  ) {
    const gain = (value: number) => {
      const g = ctx.createGain();
      g.gain.value = value;
      this.nodes.push(g);
      return g;
    };
    this.master = gain(0.85);
    this.mute = gain(1);
    // Compresseur « glue » doux puis limiteur (crêtes des sons proches, cumul pluie + radio…).
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 10;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.01;
    glue.release.value = 0.25;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.meterData = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    this.nodes.push(glue, limiter, this.analyser);
    this.master.connect(this.mute).connect(glue).connect(limiter).connect(ctx.destination);
    limiter.connect(this.analyser);

    // Réverbération de l'atelier (≈ 0,55 s : béton, mais pièce encombrée).
    const reverb = ctx.createConvolver();
    reverb.normalize = false;
    const [left, right] = renderRoomImpulse(ctx.sampleRate, 0.55, mulberry32(7));
    reverb.buffer = kit.fromSamples(left, [left, right]);
    const returnHp = ctx.createBiquadFilter();
    returnHp.type = 'highpass';
    returnHp.frequency.value = 170;
    const returnGain = gain(0.9);
    this.nodes.push(reverb, returnHp);
    reverb.connect(returnHp).connect(returnGain).connect(this.master);

    this.buses = { ambience: gain(1), sfx: gain(1), ui: gain(1) };
    this.sends = { ambience: gain(1), sfx: gain(1), ui: gain(1) };
    for (const bus of AUDIO_BUSES) {
      this.buses[bus].connect(this.master);
      this.sends[bus].connect(reverb);
    }
  }

  /** Règle le gain d'un bus (et de son envoi de réverbération) sans clic. */
  setBusGain(bus: AudioBus, gainValue: number, seconds = 0.12): void {
    const now = this.ctx.currentTime;
    smoothParam(this.buses[bus].gain, gainValue, now, seconds);
    smoothParam(this.sends[bus].gain, gainValue, now, seconds);
  }

  setMuted(muted: boolean, seconds = 0.2): void {
    smoothParam(this.mute.gain, muted ? 0 : 1, this.ctx.currentTime, seconds);
  }

  /** Niveau efficace de la sortie (0..1), pour le débogage et les tests automatisés. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.meterData);
    let sum = 0;
    for (let i = 0; i < this.meterData.length; i++) sum += this.meterData[i]! * this.meterData[i]!;
    return Math.sqrt(sum / this.meterData.length);
  }

  dispose(): void {
    for (const n of this.nodes) n.disconnect();
    this.nodes.length = 0;
  }
}
