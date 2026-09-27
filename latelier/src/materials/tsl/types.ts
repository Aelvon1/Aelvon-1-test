/**
 * Alias de types des nœuds TSL utilisés par les aides de matériaux.
 */
import type * as THREE from 'three/webgpu';

export type FloatNode = THREE.Node<'float'>;
export type Vec2Node = THREE.Node<'vec2'>;
export type Vec3Node = THREE.Node<'vec3'>;
export type Vec4Node = THREE.Node<'vec4'>;
export type ColorNode = THREE.Node<'color'>;

/** Scalaire : nœud ou constante. */
export type FloatInput = FloatNode | number;

/** Couleur : nœud vec3 ou valeur three.js (hex, chaîne CSS, `Color`). */
export type ColorInput = Vec3Node | THREE.ColorRepresentation;
