/**
 * Formes de base du décor, toutes biseautées/adoucies (direction artistique : volumes
 * légèrement épaissis, arêtes arrondies qui accrochent la lumière).
 */
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { BatchPieceOptions, StaticBatch } from './StaticBatch';

export type Vec3Tuple = readonly [number, number, number];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Boîte aux arêtes arrondies (rayon borné par la plus petite demi-dimension). */
export function roundedBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  segments = 1,
): THREE.BufferGeometry {
  const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  if (r <= 1e-4) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, segments, r);
}

/** Matrice de placement (position, rotation Euler XYZ en radians, échelle). */
export function place(
  position: Vec3Tuple,
  rotation: Vec3Tuple = [0, 0, 0],
  scale?: Vec3Tuple,
): THREE.Matrix4 {
  _p.set(position[0], position[1], position[2]);
  _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2]));
  if (scale) _s.set(scale[0], scale[1], scale[2]);
  else _s.set(1, 1, 1);
  return _m.clone().compose(_p, _q, _s);
}

/**
 * Ajoute une boîte biseautée définie par ses bornes min/max (repère monde, axes alignés).
 * Pratique pour transcrire le plan (`layout.ts`) sans erreur de centre.
 */
export function addBox(
  batch: StaticBatch,
  material: string,
  min: Vec3Tuple,
  max: Vec3Tuple,
  radius = 0.006,
  options: BatchPieceOptions = {},
  segments = 1,
): void {
  const w = max[0] - min[0];
  const h = max[1] - min[1];
  const d = max[2] - min[2];
  const geometry = roundedBox(w, h, d, radius, segments);
  batch.add(
    material,
    geometry,
    place([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]),
    options,
  );
}

/** Cylindre entre deux points (rayon constant), axe quelconque. */
export function cylinderBetween(
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  radialSegments = 12,
  openEnded = false,
): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 } {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, openEnded);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
  return { geometry, matrix };
}

/**
 * Chemin polyligne aux angles arrondis (conduits électriques, câbles tendus) : segments droits
 * reliés par des quarts de courbe de Bézier quadratique de rayon `cornerRadius`.
 */
export function roundedPolyline(
  points: readonly THREE.Vector3[],
  cornerRadius: number,
): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  if (points.length < 2) return path;
  let cursor = points[0]!.clone();
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const corner = points[i]!;
    const next = points[i + 1]!;
    const inDir = new THREE.Vector3().subVectors(corner, prev);
    const outDir = new THREE.Vector3().subVectors(next, corner);
    const r = Math.min(cornerRadius, inDir.length() / 2, outDir.length() / 2);
    inDir.normalize();
    outDir.normalize();
    const start = corner.clone().addScaledVector(inDir, -r);
    const end = corner.clone().addScaledVector(outDir, r);
    if (cursor.distanceTo(start) > 1e-5) path.add(new THREE.LineCurve3(cursor, start));
    path.add(new THREE.QuadraticBezierCurve3(start, corner.clone(), end));
    cursor = end;
  }
  path.add(new THREE.LineCurve3(cursor, points[points.length - 1]!.clone()));
  return path;
}

/** Tube le long d'une courbe (nombre de segments proportionnel à la longueur). */
export function tubeAlong(
  curve: THREE.Curve<THREE.Vector3>,
  radius: number,
  radialSegments = 8,
  segmentsPerMeter = 40,
): THREE.BufferGeometry {
  const length = curve.getLength();
  const segments = Math.max(4, Math.ceil(length * segmentsPerMeter));
  return new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
}

/** Révolution d'un profil [rayon, hauteur] autour de Y. */
export function lathe(profile: readonly (readonly [number, number])[], segments = 24): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    segments,
  );
}

/** Rectangle aux coins arrondis (forme 2D) centré sur l'origine. */
export function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + rr, y);
  shape.lineTo(x + w - rr, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + rr);
  shape.lineTo(x + w, y + h - rr);
  shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  shape.lineTo(x + rr, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - rr);
  shape.lineTo(x, y + rr);
  shape.quadraticCurveTo(x, y, x + rr, y);
  return shape;
}

/**
 * Plaque extrudée biseautée (coins arrondis) : épaisseur selon +Z, centrée. Utilisée pour le
 * tapis, les plaques d'interrupteur, les panneaux.
 */
export function beveledPlate(
  w: number,
  h: number,
  depth: number,
  cornerRadius: number,
  bevel: number,
): THREE.BufferGeometry {
  const b = Math.min(bevel, depth / 2 - 1e-4, w / 4, h / 4);
  const shape = roundedRectShape(w - 2 * b, h - 2 * b, Math.max(0, cornerRadius - b));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * b),
    bevelEnabled: b > 1e-5,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -(depth - 2 * b) / 2);
  return geometry;
}

/** Hélice le long d'un axe Y (ressorts, cordon spiralé). */
export class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius: number,
    private readonly height: number,
    private readonly turns: number,
  ) {
    super();
    this.arcLengthDivisions = Math.max(200, Math.ceil(turns * 12));
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, t * this.height, Math.sin(a) * this.radius);
  }
}

/**
 * Cordon spiralé suivant une courbe porteuse : la spirale tourne autour de la courbe
 * (repère de Frenet approché par un vecteur de référence stable).
 */
export class CoiledCurve extends THREE.Curve<THREE.Vector3> {
  private readonly ref = new THREE.Vector3(0, 1, 0);
  private readonly tangent = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(
    private readonly carrier: THREE.Curve<THREE.Vector3>,
    private readonly coilRadius: number,
    private readonly turns: number,
  ) {
    super();
    // Table d'abscisses curvilignes assez fine pour suivre chaque spire.
    this.arcLengthDivisions = Math.max(200, Math.ceil(turns * 12));
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    this.carrier.getPoint(t, target);
    this.carrier.getTangent(t, this.tangent);
    this.side.crossVectors(this.tangent, this.ref);
    if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up.crossVectors(this.side, this.tangent).normalize();
    const a = t * this.turns * Math.PI * 2;
    return target
      .addScaledVector(this.side, Math.cos(a) * this.coilRadius)
      .addScaledVector(this.up, Math.sin(a) * this.coilRadius);
  }
}
