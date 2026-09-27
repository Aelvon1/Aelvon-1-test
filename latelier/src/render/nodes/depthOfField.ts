/**
 * Profondeur de champ de l'inspection (`DepthOfFieldNode` de three r186) :
 *
 * - **zone nette épaisse** : le nœud de three ne connaît qu'un plan de netteté ; on lui fournit
 *   une profondeur « repliée » où tout ce qui est à ± `band` de la distance de mise au point est
 *   ramené sur ce plan (cercle de confusion nul) → l'objet entier reste net, la pièce se floute ;
 * - **activable sans recompilation** : quand elle est coupée, ses 8 passes ne sont plus exécutées
 *   (coût nul) et le composite lit directement l'image nette. Les shaders sont compilés une fois
 *   au préchauffage.
 */
import type * as THREE from 'three/webgpu';
import { abs, convertToTexture, float, max, sign, uniform } from 'three/tsl';
import DepthOfFieldNode from 'three/addons/tsl/display/DepthOfFieldNode.js';

type FloatNode = THREE.Node<'float'>;

/** `DepthOfFieldNode` dont les passes peuvent être suspendues. */
class GatedDepthOfFieldNode extends DepthOfFieldNode {
  /** Faux : aucune passe exécutée (le composite ne lit alors pas la sortie). */
  enabled = false;

  override updateBefore(frame: THREE.NodeFrame): boolean | undefined {
    if (!this.enabled) return undefined;
    return super.updateBefore(frame);
  }
}

export class InspectionDepthOfField {
  /** Distance de mise au point (m). */
  readonly focusDistance = uniform(1);
  /** Demi-épaisseur de la zone nette (m). */
  readonly band = uniform(0.2);
  /** Distance pour atteindre le flou maximal au-delà de la zone nette (m). */
  readonly ramp = uniform(0.4);
  /** Rayon du flou (px, résolution pleine). 0 = image nette. */
  readonly bokehScale = uniform(0);
  readonly node: GatedDepthOfFieldNode;

  /**
   * @param color image nette (HDR linéaire) à flouter.
   * @param viewZ profondeur de vue (négative) de la passe de scène.
   */
  constructor(color: THREE.Node, viewZ: FloatNode) {
    // Profondeur repliée : distance d → d' = f + signe(d − f) · max(|d − f| − bande, 0).
    const distance = viewZ.negate();
    const delta = distance.sub(this.focusDistance);
    const folded = sign(delta).mul(max(abs(delta).sub(this.band), float(0)));
    const foldedViewZ = this.focusDistance.add(folded).negate();
    this.node = new GatedDepthOfFieldNode(
      convertToTexture(color),
      foldedViewZ,
      this.focusDistance,
      this.ramp,
      this.bokehScale,
    );
  }

  get enabled(): boolean {
    return this.node.enabled;
  }

  set enabled(value: boolean) {
    this.node.enabled = value;
  }

  dispose(): void {
    this.node.textureNode.dispose();
    this.node.dispose();
  }
}
