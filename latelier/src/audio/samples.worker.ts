/**
 * Worker de génération des échantillons audio (bruits, textures d'impacts, réponse
 * impulsionnelle) : le calcul (≈ 150–250 ms) quitte le fil principal, aucune saccade au
 * démarrage du son. Protocole :
 *   { kind: 'shared', id, sampleRate } → { kind: 'shared', id, sampleRate, channels }
 *   { kind: 'impulse', sampleRate }    → { kind: 'impulse', sampleRate, channels }
 */
import {
  ROOM_IMPULSE_SEED,
  ROOM_RT60,
  generateSharedSamples,
  renderRoomImpulse,
  type SharedSampleId,
} from './buffers';
import { mulberry32 } from './math';

export type SampleRequest =
  | { kind: 'shared'; id: SharedSampleId; sampleRate: number }
  | { kind: 'impulse'; sampleRate: number };

export type SampleResponse =
  | { kind: 'shared'; id: SharedSampleId; sampleRate: number; channels: Float32Array[] }
  | { kind: 'impulse'; sampleRate: number; channels: Float32Array[] };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SampleRequest>) => void) | null;
  postMessage(message: SampleResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event: MessageEvent<SampleRequest>) => {
  const request = event.data;
  if (request.kind === 'shared') {
    const data = generateSharedSamples(request.id, request.sampleRate);
    scope.postMessage({ kind: 'shared', id: request.id, sampleRate: request.sampleRate, channels: [data] }, [
      data.buffer as ArrayBuffer,
    ]);
  } else {
    const channels = renderRoomImpulse(request.sampleRate, ROOM_RT60, mulberry32(ROOM_IMPULSE_SEED));
    scope.postMessage(
      { kind: 'impulse', sampleRate: request.sampleRate, channels },
      channels.map((c) => c.buffer as ArrayBuffer),
    );
  }
};
