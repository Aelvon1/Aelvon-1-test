/**
 * Fonctions TSL de hachage et de bruit, écrites en expressions pures (utilisables hors `Fn`,
 * donc partageables entre matériaux, brume et poussière).
 *
 * Hachage « sans sinus » (méthode de D. Hoskins, licence MIT) : stable en virgule flottante sur
 * WebGPU comme sur WebGL 2, contrairement à `fract(sin(x) * 43758)`.
 */
import { dot, float, floor, fract, mix, vec2, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';

export type FloatNode = Node<'float'>;
export type Vec2Node = Node<'vec2'>;
export type Vec3Node = Node<'vec3'>;

/** vec2 → float 0..1. */
export function hash12(p: Vec2Node): FloatNode {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031));
  const q = p3.add(dot(p3, p3.yzx.add(33.33)));
  return fract(q.x.add(q.y).mul(q.z));
}

/** vec2 → vec2 0..1. */
export function hash22(p: Vec2Node): Vec2Node {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973)));
  const q = p3.add(dot(p3, p3.yzx.add(33.33)));
  return fract(vec2(q.x.add(q.y).mul(q.z), q.x.add(q.z).mul(q.y)));
}

/** vec2 → vec3 0..1. */
export function hash32(p: Vec2Node): Vec3Node {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973)));
  const q = p3.add(dot(p3, p3.yxz.add(33.33)));
  return fract(vec3(q.x.add(q.y).mul(q.z), q.x.add(q.z).mul(q.y), q.y.add(q.z).mul(q.x)));
}

/** vec3 → float 0..1. */
export function hash13(p: Vec3Node): FloatNode {
  const p3 = fract(p.mul(0.1031));
  const q = p3.add(dot(p3, p3.zyx.add(31.32)));
  return fract(q.x.add(q.y).mul(q.z));
}

/** float → float 0..1. */
export function hash11(n: FloatNode): FloatNode {
  return hash12(vec2(n, n.mul(1.618).add(7.13)));
}

/** Bruit de valeur 2D lissé (0..1). */
export function valueNoise2(p: Vec2Node): FloatNode {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const a = hash12(i);
  const b = hash12(i.add(vec2(1, 0)));
  const c = hash12(i.add(vec2(0, 1)));
  const d = hash12(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Bruit de valeur 3D lissé (0..1). */
export function valueNoise3(p: Vec3Node): FloatNode {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const n000 = hash13(i);
  const n100 = hash13(i.add(vec3(1, 0, 0)));
  const n010 = hash13(i.add(vec3(0, 1, 0)));
  const n110 = hash13(i.add(vec3(1, 1, 0)));
  const n001 = hash13(i.add(vec3(0, 0, 1)));
  const n101 = hash13(i.add(vec3(1, 0, 1)));
  const n011 = hash13(i.add(vec3(0, 1, 1)));
  const n111 = hash13(i.add(vec3(1, 1, 1)));
  const x00 = mix(n000, n100, u.x);
  const x10 = mix(n010, n110, u.x);
  const x01 = mix(n001, n101, u.x);
  const x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}

/** Somme fractale 2D (octaves déroulées, amplitude normalisée 0..1). */
export function fbm2(p: Vec2Node, octaves = 4): FloatNode {
  let sum: FloatNode = float(0);
  let amplitude = 0.5;
  let norm = 0;
  let q: Vec2Node = p;
  for (let o = 0; o < octaves; o++) {
    sum = sum.add(valueNoise2(q).mul(amplitude));
    norm += amplitude;
    amplitude *= 0.5;
    // Rotation + décalage entre octaves : casse l'alignement sur la grille.
    q = vec2(q.x.mul(1.6).sub(q.y.mul(1.2)), q.x.mul(1.2).add(q.y.mul(1.6))).add(vec2(5.2, 1.3));
  }
  return sum.div(norm);
}
