/**
 * Contrat du moteur audio (Web Audio API, sons entièrement synthétisés).
 * Le contexte audio n'est démarré qu'après un geste utilisateur (bouton « Entrer »).
 */
import type * as THREE from 'three/webgpu';

/** Sons ponctuels. */
export type SoundId =
  | 'ui.click'
  | 'ui.hover'
  | 'ui.open'
  | 'ui.close'
  | 'ui.error'
  | 'ui.stamp' // coup de tampon (inventaire)
  | 'step.concrete'
  | 'step.rug'
  | 'switch.toggle'
  | 'lamp.toggle'
  | 'radio.toggle'
  | 'fan.toggle'
  | 'screw.unscrew' // cliquetis de dévissage (joué en boucle courte pendant la rotation)
  | 'screw.tighten'
  | 'snap.click' // déclic (connecteur, clip)
  | 'magnet.clack' // claquement magnétique
  | 'magnet.release' // décrochage brusque
  | 'press.creak' // extraction à la presse / extracteur
  | 'press.pop'
  | 'part.drop.metal' // pièce posée sur le tapis
  | 'part.drop.small'
  | 'part.drop.plastic'
  | 'wire.unwind' // frottement du fil
  | 'cut.crack' // opération destructive
  | 'tool.pickup'
  | 'neon.flicker'; // claquement du starter du néon

/**
 * Sons continus (boucles contrôlables). `setIntensity` (0..1) selon la boucle :
 * pluie → force de l'averse ; néon → grésillement/crépitements (tube fatigué, scintillement) ;
 * ventilateur → vitesse (montée/descente en régime) ; radio → qualité de réception (1 = nette) ;
 * fer → grésillement ; air chaud → débit ; oscilloscope, fond de pièce → niveau.
 * Positions conseillées : pluie sur la vitre à la fenêtre, néon au tube, radio/ventilateur
 * à l'appareil ; `rain.roof` et `room.tone` non positionnés (sons diffus).
 */
export type LoopId =
  | 'rain.roof'
  | 'rain.window'
  | 'neon.hum'
  | 'room.tone'
  | 'fan.motor'
  | 'radio.music'
  | 'iron.sizzle' // grésillement du fer
  | 'hotair.blow' // souffle de la station à air chaud
  | 'oscilloscope.whine';

export type AudioBus = 'ambience' | 'sfx' | 'ui';

export interface PlayOptions {
  /** Volume relatif (0..1+, défaut 1). */
  volume?: number;
  /** Facteur de hauteur (défaut 1, légère variation aléatoire ajoutée automatiquement). */
  pitch?: number;
  /** Position monde pour spatialisation (sinon son « non positionné »). */
  position?: THREE.Vector3;
}

export interface LoopHandle {
  /** Ajuste le volume en douceur (0..1). */
  setVolume(volume: number, rampSeconds?: number): void;
  /** Paramètre expressif propre à la boucle (ex. intensité du grésillement), 0..1. */
  setIntensity(value: number): void;
  setPosition(position: THREE.Vector3): void;
  stop(fadeSeconds?: number): void;
  readonly playing: boolean;
}

export interface AudioApi {
  /** Démarre/reprend le contexte (doit être appelé dans un gestionnaire de geste utilisateur). */
  resume(): Promise<void>;
  readonly started: boolean;
  play(id: SoundId, options?: PlayOptions): void;
  loop(id: LoopId, options?: PlayOptions): LoopHandle;
  setBusVolume(bus: AudioBus, volume: number): void;
  /** Met à jour l'auditeur (position/orientation caméra). */
  updateListener(camera: THREE.Camera): void;
  /** Coupe/rétablit tout (pause). */
  setMuted(muted: boolean): void;
  /** Débogage (facultatif) : état du contexte, boucles actives, niveau de sortie. */
  debugInfo?(): AudioDebugInfo;
  /** Libère le contexte audio et toutes les boucles (facultatif). */
  dispose?(): void;
}

/** État de débogage du moteur audio. */
export interface AudioDebugInfo {
  state: AudioContextState | 'none' | 'unsupported';
  sampleRate: number;
  /** Boucles actives (ou en attente du démarrage du contexte). */
  loops: LoopId[];
  /** Niveau efficace de la sortie (0..1). */
  level: number;
  muted: boolean;
}
