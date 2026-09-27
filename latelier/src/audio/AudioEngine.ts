/**
 * Moteur audio. Version socle : API complète mais silencieuse ; la phase « son » implémente la
 * synthèse procédurale (pluie, néon, pas, outils…).
 */
import type * as THREE from 'three/webgpu';
import type { AudioApi, AudioBus, LoopHandle, LoopId, PlayOptions, SoundId } from './types';

class SilentLoop implements LoopHandle {
  playing = true;
  setVolume(): void {}
  setIntensity(): void {}
  setPosition(): void {}
  stop(): void {
    this.playing = false;
  }
}

export class AudioEngine implements AudioApi {
  started = false;

  async resume(): Promise<void> {
    this.started = true;
  }

  play(_id: SoundId, _options?: PlayOptions): void {}

  loop(_id: LoopId, _options?: PlayOptions): LoopHandle {
    return new SilentLoop();
  }

  setBusVolume(_bus: AudioBus, _volume: number): void {}

  updateListener(_camera: THREE.Camera): void {}

  setMuted(_muted: boolean): void {}
}
