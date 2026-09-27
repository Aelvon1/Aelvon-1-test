/**
 * Éléments interactifs du décor (touche E) : interrupteur mural, lampe loupe, établi.
 * La mise en évidence au regard passe par un uniforme de surbrillance (émission chaude en
 * Fresnel sur des matériaux propres à chaque élément), lissé par `World.update`.
 */
import type * as THREE from 'three/webgpu';
import type { Interactable } from '../types';

export interface HighlightTarget {
  /** Valeur visée (0 ou 1) ; la valeur affichée la suit en douceur. */
  target: number;
}

export interface SwitchInteractableOptions {
  targets: THREE.Object3D[];
  isOn: () => boolean;
  toggle: () => void;
  highlight: HighlightTarget;
}

export function createSwitchInteractable(o: SwitchInteractableOptions): Interactable {
  return {
    id: 'world.lightSwitch',
    targets: o.targets,
    maxDistance: 1.8,
    prompt: () => (o.isOn() ? 'Éteindre la lumière' : 'Allumer la lumière'),
    use: () => o.toggle(),
    setHighlighted: (on) => {
      o.highlight.target = on ? 1 : 0;
    },
  };
}

export interface LampInteractableOptions {
  targets: THREE.Object3D[];
  isOn: () => boolean;
  toggle: () => void;
  highlight: HighlightTarget;
}

export function createLampInteractable(o: LampInteractableOptions): Interactable {
  return {
    id: 'world.magnifierLamp',
    targets: o.targets,
    maxDistance: 1.9,
    prompt: () => (o.isOn() ? 'Éteindre la lampe loupe' : 'Allumer la lampe loupe'),
    use: () => o.toggle(),
    setHighlighted: (on) => {
      o.highlight.target = on ? 1 : 0;
    },
  };
}

export interface BenchInteractableOptions {
  targets: THREE.Object3D[];
  open: () => void;
  highlight: HighlightTarget;
}

export function createBenchInteractable(o: BenchInteractableOptions): Interactable {
  return {
    id: 'world.bench',
    targets: o.targets,
    maxDistance: 2.0,
    prompt: () => 'Ouvrir l’inventaire',
    use: () => o.open(),
    setHighlighted: (on) => {
      o.highlight.target = on ? 1 : 0;
    },
  };
}
