/**
 * Boîte à arêtes arrondies adaptée aux masques d'usure par sommet (`applyEdgeWear`).
 *
 * Contrairement à `RoundedBoxGeometry` (addons), dont chaque face plane n'est qu'un grand quad
 * bordé par le congé, cette boîte garde des sommets À L'INTÉRIEUR des faces : l'attribut
 * `edgeWear` décroît donc du congé vers le centre au lieu de couvrir toute la face.
 * Les lignes de subdivision sont resserrées dans les congés (`bevelSegments`) et régulières sur
 * les faces (`faceSegments`). Normales analytiques (continues à travers les coutures).
 */
import * as THREE from 'three/webgpu';

export interface BevelledBoxOptions {
  /** Rayon du congé (m). */
  radius: number;
  /** Segments dans chaque congé (défaut 4). */
  bevelSegments?: number;
  /** Segments sur la partie plane de chaque face (défaut 6). */
  faceSegments?: number;
}

export function createBevelledBox(
  width: number,
  height: number,
  depth: number,
  options: BevelledBoxOptions,
): THREE.BufferGeometry {
  const radius = Math.max(0, Math.min(options.radius, width / 2, height / 2, depth / 2));
  const bevel = Math.max(1, Math.round(options.bevelSegments ?? 4));
  const flat = Math.max(1, Math.round(options.faceSegments ?? 6));
  const n = bevel * 2 + flat;
  const geometry = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const size = [width, height, depth] as const;
  const half = size.map((s) => s / 2 - radius);

  // Coordonnée de grille t ∈ [−½, ½] → position (m) : congés resserrés, face régulière.
  const remap = (t: number, axis: 0 | 1 | 2): number => {
    const i = Math.round((t + 0.5) * n);
    const s = size[axis]!;
    const h = half[axis]!;
    if (i <= bevel) return -s / 2 + (radius * i) / bevel;
    if (i >= n - bevel) return h + (radius * (i - (n - bevel))) / bevel;
    return -h + (2 * h * (i - bevel)) / flat;
  };

  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  const p = new THREE.Vector3();
  const inner = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.set(remap(pos.getX(i), 0), remap(pos.getY(i), 1), remap(pos.getZ(i), 2));
    inner.set(
      THREE.MathUtils.clamp(p.x, -half[0]!, half[0]!),
      THREE.MathUtils.clamp(p.y, -half[1]!, half[1]!),
      THREE.MathUtils.clamp(p.z, -half[2]!, half[2]!),
    );
    d.subVectors(p, inner);
    if (d.lengthSq() > 1e-18 && radius > 0) {
      d.normalize();
      p.copy(inner).addScaledVector(d, radius);
      nor.setXYZ(i, d.x, d.y, d.z);
    }
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  nor.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
