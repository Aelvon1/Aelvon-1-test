/**
 * Contrats de la caméra d'inspection : interface attendue par l'orchestrateur (`Inspection`) et
 * requêtes géométriques dont la caméra a besoin (fournies par le module de sélection, BVH).
 */
import type * as THREE from 'three/webgpu';

/** Contrat d'une caméra d'inspection, piloté par `Inspection`. */
export interface InspectionCameraController {
  readonly active: boolean;
  /** Prend le contrôle de la caméra et se place sur la vue initiale (transition douce). */
  activate(view: InspectionViewPose): void;
  /** Rend le contrôle (transitions d'entrée/sortie). */
  deactivate(): void;
  update(dt: number): void;
  /** Cadre une boîte monde (transition douce). */
  frameBox(box: THREE.Box3): void;
  /** Retour à la vue initiale. */
  resetView(): void;
  dispose(): void;
}

export interface InspectionViewPose {
  target: THREE.Vector3;
  /** Direction de la cible vers la caméra (monde, normalisée). */
  direction: THREE.Vector3;
  distance: number;
  /** Distance minimale caméra → surface (m) : `presentation.minSurfaceDistance`. */
  minDistance: number;
  /**
   * Rayon de la sphère cadrée par `distance` (m). Fourni, il permet à la caméra de recadrer la
   * vue initiale dans la zone libre de l'écran (hors panneaux de l'interface) quand celle-ci
   * change, en conservant la marge implicite de `distance`.
   */
  radius?: number;
  /**
   * Points monde englobant l'objet (coins de sa boîte, repère de l'objet). Fournis, la vue
   * initiale est un cadrage SERRÉ de leur projection dans la zone libre (prioritaire sur
   * `radius`, dont la sphère laisse beaucoup de vide autour d'un objet allongé).
   */
  hull?: readonly THREE.Vector3[];
  /** Placement immédiat, sans transition (captures reproductibles). */
  instant?: boolean;
}

/** Requêtes géométriques sur l'objet inspecté (coupe et visibilité prises en compte). */
export interface CameraSceneQuery {
  /**
   * Distance du premier obstacle le long d'un rayon (faces avant ET arrière), ou Infinity
   * au-delà de `far`. `direction` est unitaire.
   */
  obstacleDistance(origin: THREE.Vector3, direction: THREE.Vector3, far: number): number;
  /** Distance du point à la surface la plus proche (Infinity si > `maxDistance`). */
  clearance(point: THREE.Vector3, maxDistance: number): number;
  /**
   * Point de surface visible sous un rayon (premier impact tel que rendu), écrit dans `out`.
   * Retourne la distance, ou Infinity si le rayon ne touche rien.
   */
  surfacePoint(ray: THREE.Ray, out: THREE.Vector3): number;
  /**
   * Premier impact (deux faces) le long d'un rayon : `backFace` vrai si la surface est vue de
   * dos, c'est-à-dire si l'origine du rayon est à l'intérieur d'un volume. Faux si aucun impact.
   */
  probe(origin: THREE.Vector3, direction: THREE.Vector3, far: number, out: ProbeHit): boolean;
}

/** Encarts de l'écran recouverts par l'interface (px CSS, bords du canvas). */
export interface ScreenInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ProbeHit {
  distance: number;
  backFace: boolean;
}

/** Événements de pointeur « sans glisser » relayés à la sélection. */
export interface CameraPointerListener {
  /** Déplacement du pointeur au-dessus du canvas (coordonnées client) ; null = sortie. */
  onPointerMove(clientX: number, clientY: number): void;
  onPointerLeave(): void;
  /** Clic simple (< 4 px, < 300 ms). */
  onClick(clientX: number, clientY: number, event: PointerEvent): void;
  onDoubleClick(clientX: number, clientY: number): void;
}
