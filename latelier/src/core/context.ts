/**
 * Contexte applicatif partagé, injecté dans tous les systèmes (pas de singletons globaux).
 */
import type { Engine } from './Engine';
import type { EventBus } from './EventBus';
import type { AppEvents } from './events';
import type { AppStore } from './store';
import type { StateMachine } from './StateMachine';
import type { Input } from './Input';
import type { Physics } from './Physics';
import type { IdleQueue } from './scheduler';
import type { DevParams } from './devParams';
import type { MaterialLibrary } from '../materials/types';
import type { TextureService } from '../textures/types';
import type { AudioApi } from '../audio/types';
import type { PostFX } from '../render/PostFX';

export interface AppContext {
  engine: Engine;
  bus: EventBus<AppEvents>;
  store: AppStore;
  machine: StateMachine;
  input: Input;
  physics: Physics;
  materials: MaterialLibrary;
  textures: TextureService;
  audio: AudioApi;
  postfx: PostFX;
  /** Travaux différés exécutés avec un budget par image. */
  idle: IdleQueue;
  dev: DevParams;
}
