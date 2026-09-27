/**
 * Caméra d'inspection (logique pure) : paramétrage orbital, zoom vers le point visé (le point
 * reste fixe à l'écran, la cible glisse vers lui), bornes du zoom, plans near/far continus,
 * garde-fous (tapis, murs), molette et clic.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  MAX_DEPTH_RATIO_STANDARD,
  NEAR_MIN_REVERSED,
  computeClipRange,
  distanceInsideBox,
  effectiveMinSurfaceDistance,
  fitDistance,
  isClick,
  lerpLog,
  minElevationAboveFloor,
  orbitAngles,
  orbitOffset,
  shortestAngle,
  wheelZoomFactor,
  worldPerPixel,
  wrapAngle,
  zoomTowardPoint,
} from '../src/inspection/camera/orbitMath';

/** Coordonnées écran (NDC) de `point` vu par une caméra en orbite autour de `target`. */
function screenOf(
  target: THREE.Vector3,
  azimuth: number,
  elevation: number,
  distance: number,
  point: THREE.Vector3,
): THREE.Vector2 {
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 1e-5, 20);
  camera.position.copy(target).add(orbitOffset(azimuth, elevation, distance, new THREE.Vector3()));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const p = point.clone().project(camera);
  return new THREE.Vector2(p.x, p.y);
}

describe('caméra — paramétrage orbital', () => {
  it('offset et angles sont réciproques', () => {
    const out = { azimuth: 0, elevation: 0 };
    for (const [a, e] of [
      [0.3, 0.4],
      [-2.5, 1.2],
      [3.0, -0.5],
    ] as const) {
      const v = orbitOffset(a, e, 0.37, new THREE.Vector3());
      expect(v.length()).toBeCloseTo(0.37, 10);
      orbitAngles(v, out);
      expect(out.azimuth).toBeCloseTo(a, 10);
      expect(out.elevation).toBeCloseTo(e, 10);
    }
  });

  it('angles : repli dans ]−π, π] et chemin le plus court', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(shortestAngle(3, -3)).toBeCloseTo(2 * Math.PI - 6, 10);
    expect(Math.abs(shortestAngle(-3.1, 3.1))).toBeLessThan(0.1);
  });

  it('distance de cadrage : la sphère tient dans le champ le plus étroit', () => {
    const r = 0.05;
    const d = fitDistance(r, 35, 16 / 9, 1);
    expect(r / d).toBeCloseTo(Math.sin(THREE.MathUtils.degToRad(17.5)), 6);
    // Écran étroit (portrait) : c'est le champ horizontal qui limite.
    expect(fitDistance(r, 35, 0.5, 1)).toBeGreaterThan(d);
  });

  it('interpolation logarithmique des distances', () => {
    expect(lerpLog(1, 0.001, 0.5)).toBeCloseTo(Math.sqrt(0.001), 10);
    expect(lerpLog(0.3, 0.3, 0.7)).toBeCloseTo(0.3, 12);
  });
});

describe('caméra — zoom vers le point sous le curseur', () => {
  it('le point visé garde sa position à l’écran, la cible glisse vers lui', () => {
    const target = new THREE.Vector3(-0.75, 0.95, -1.56);
    const az = 0.4;
    const el = 0.6;
    let distance = 0.45;
    const point = new THREE.Vector3(-0.73, 0.962, -1.55);
    const before = screenOf(target, az, el, distance, point);
    const camera = target.clone().add(orbitOffset(az, el, distance, new THREE.Vector3()));
    const t0 = target.distanceTo(point);
    const result = zoomTowardPoint(target, camera, distance, point, 0.5, {
      minDistanceToPoint: 0.002,
      minDistance: 0.002,
      maxDistance: 2,
    });
    distance = result.distance;
    expect(result.scale).toBeCloseTo(0.5, 12);
    expect(target.distanceTo(point)).toBeCloseTo(t0 * 0.5, 12);
    const after = screenOf(target, az, el, distance, point);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('zoom continu jusqu’au macro : borné à la distance minimale du point', () => {
    const target = new THREE.Vector3(0, 1, 0);
    let distance = 0.5;
    const point = new THREE.Vector3(0.01, 1.005, 0.02);
    const az = -0.3;
    const el = 0.9;
    const start = screenOf(target, az, el, distance, point);
    for (let i = 0; i < 80; i++) {
      const camera = target.clone().add(orbitOffset(az, el, distance, new THREE.Vector3()));
      distance = zoomTowardPoint(target, camera, distance, point, wheelZoomFactor(-100, 0), {
        minDistanceToPoint: 0.002,
        minDistance: 0.002,
        maxDistance: 2,
      }).distance;
    }
    const camera = target.clone().add(orbitOffset(az, el, distance, new THREE.Vector3()));
    expect(camera.distanceTo(point)).toBeGreaterThanOrEqual(0.002 - 1e-12);
    expect(camera.distanceTo(point)).toBeLessThan(0.0025);
    const end = screenOf(target, az, el, distance, point);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.y).toBeCloseTo(start.y, 6);
  });

  it('zoom arrière borné par la distance maximale', () => {
    const target = new THREE.Vector3();
    const camera = new THREE.Vector3(0, 0, 1.8);
    const r = zoomTowardPoint(target, camera, 1.8, new THREE.Vector3(0.1, 0, 0), 1.5, {
      minDistanceToPoint: 0.002,
      minDistance: 0.002,
      maxDistance: 2,
    });
    expect(r.distance).toBeCloseTo(2, 12);
  });

  it('molette : exponentielle, symétrique, modes ligne et page', () => {
    expect(wheelZoomFactor(100, 0) * wheelZoomFactor(-100, 0)).toBeCloseTo(1, 12);
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48, 0), 12);
    expect(wheelZoomFactor(-100, 0)).toBeLessThan(1);
    expect(wheelZoomFactor(0, 0)).toBe(1);
  });

  it('panoramique proportionnel à la distance', () => {
    expect(worldPerPixel(0.2, 35, 720)).toBeCloseTo(2 * worldPerPixel(0.1, 35, 720), 12);
  });

  it('clic : moins de 4 px et 300 ms', () => {
    expect(isClick(2, 2, 120)).toBe(true);
    expect(isClick(4, 0, 120)).toBe(false);
    expect(isClick(1, 1, 320)).toBe(false);
  });
});

describe('caméra — plans near/far continus', () => {
  it('profondeur inversée : near suit la distance libre jusqu’à 1e-5 m, far de plusieurs mètres', () => {
    let previous = Infinity;
    for (const clearance of [1, 0.2, 0.05, 0.01, 0.002, 1e-4, 1e-6]) {
      const { near, far } = computeClipRange({ clearance, farDistance: 6, reversedDepth: true });
      expect(near).toBeLessThanOrEqual(previous);
      expect(near).toBeLessThanOrEqual(Math.max(NEAR_MIN_REVERSED, clearance));
      expect(near).toBeGreaterThanOrEqual(NEAR_MIN_REVERSED);
      expect(far).toBeGreaterThanOrEqual(6);
      previous = near;
    }
    expect(computeClipRange({ clearance: 0.002, farDistance: 6, reversedDepth: true }).near).toBeCloseTo(
      0.0015,
      9,
    );
    expect(computeClipRange({ clearance: 1e-6, farDistance: 6, reversedDepth: true }).near).toBe(
      NEAR_MIN_REVERSED,
    );
  });

  it('profondeur standard : far/near ≤ 1e4 à toute distance libre', () => {
    for (const clearance of [1, 0.05, 0.002, 1e-5]) {
      const { near, far } = computeClipRange({ clearance, farDistance: 7, reversedDepth: false });
      expect(far / near).toBeLessThanOrEqual(MAX_DEPTH_RATIO_STANDARD * (1 + 1e-9));
    }
  });

  it('profondeur standard : distance minimale relevée pour que near ne rogne pas la surface', () => {
    const min = effectiveMinSurfaceDistance(0.0002, 7, false);
    const { near } = computeClipRange({ clearance: min, farDistance: 7, reversedDepth: false });
    expect(near).toBeLessThanOrEqual(min);
    expect(effectiveMinSurfaceDistance(0.002, 7, true)).toBe(0.002);
  });

  it('jamais sous le tapis : élévation minimale', () => {
    const el = minElevationAboveFloor(0.92, 0.1, 0.93, 0.003);
    const y = 0.92 + 0.1 * Math.sin(el);
    expect(y).toBeGreaterThanOrEqual(0.933 - 1e-12);
    expect(minElevationAboveFloor(1.2, 0.1, 0.93, 0.003)).toBeLessThan(0);
  });

  it('murs : distance jusqu’à la sortie de la pièce', () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
    const d = distanceInsideBox(new THREE.Vector3(0, 1, 0.5), new THREE.Vector3(0, 0, 1), box);
    expect(d).toBeCloseTo(0.5, 12);
    expect(distanceInsideBox(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 1, 0), box)).toBe(Infinity);
  });
});
