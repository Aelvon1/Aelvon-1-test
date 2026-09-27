/**
 * Spécifications des collisions des accessoires (Rapier), sous forme de données PURES : elles
 * sont enregistrées par `buildProps` (`physics.addStatic`) et vérifiées par les tests (carte
 * d'occupation 2D, largeur des passages) sans charger Rapier.
 *
 * Tout ce qui est posé au sol ou dépasse d'un meuble a un volume simplifié (boîte ou cylindre).
 * Les objets posés SUR l'établi, le bureau ou la table restent dans l'emprise de leur support.
 */
import type { StaticColliderSpec } from '../../core/Physics';
import { BENCH, ROOM } from '../layout';
import { BENCH_ITEMS, BENCH_TOP, CART, DESK, EXTINGUISHER, FAN, RC, SHELF_UNIT, STOOL, TRASH } from './dims';

/** Boîte définie par ses bornes (repère monde). */
function boxSpec(
  name: string,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): StaticColliderSpec {
  return {
    kind: 'box',
    name,
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
    halfExtents: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
  };
}

function cylinderSpec(name: string, x: number, z: number, radius: number, height: number, y0 = 0) {
  return {
    kind: 'cylinder',
    name,
    center: [x, y0 + height / 2, z],
    radius,
    halfHeight: height / 2,
  } as const satisfies StaticColliderSpec;
}

/** Collisions des accessoires (hors coque et établi, fournis par la salle). */
export function propColliderSpecs(): StaticColliderSpec[] {
  const vise = BENCH_ITEMS.vise;
  const viseFront = vise.center[1] + vise.size[2] / 2;
  return [
    boxSpec(
      'étagères',
      [SHELF_UNIT.x[0], 0, SHELF_UNIT.z[0]],
      [SHELF_UNIT.x[1], SHELF_UNIT.height, SHELF_UNIT.z[1]],
    ),
    boxSpec(
      'servante',
      [CART.x[0], 0, CART.z[0]],
      [CART.x[1] + CART.handleOut, CART.height + 0.04, CART.z[1]],
    ),
    // Bureau et table : volume limité au plateau. La radio posée en retrait reste visable (le
    // test d'occultation du réticule lance ses rayons contre ces volumes).
    boxSpec('bureau électronique', [DESK.x[0], 0, DESK.z[0]], [DESK.x[1], DESK.height + 0.01, DESK.z[1]]),
    boxSpec('table RC', [RC.x[0], 0, RC.z[0]], [RC.x[1], RC.height + 0.01, RC.z[1]]),
    // Étau : mors en saillie du chant avant de l'établi.
    boxSpec(
      'étau',
      [vise.center[0] - vise.size[0] / 2, BENCH_TOP, BENCH.z[1] - 0.02],
      [vise.center[0] + vise.size[0] / 2, BENCH_TOP + vise.size[1], Math.max(viseFront, BENCH.z[1] + 0.01)],
    ),
    cylinderSpec('tabouret', STOOL.base[0], STOOL.base[2], STOOL.starRadius, STOOL.seatHeight + 0.03),
    cylinderSpec('ventilateur', FAN.base[0], FAN.base[2], FAN.colliderRadius, FAN.colliderHeight),
    cylinderSpec('poubelle', TRASH.base[0], TRASH.base[2], TRASH.radius + 0.01, TRASH.height + 0.02),
    boxSpec(
      'extincteur',
      [
        EXTINGUISHER.x - EXTINGUISHER.radius - 0.01,
        EXTINGUISHER.bottom - 0.05,
        EXTINGUISHER.z - EXTINGUISHER.radius,
      ],
      [
        EXTINGUISHER.x + EXTINGUISHER.radius + 0.01,
        EXTINGUISHER.bottom + EXTINGUISHER.height + 0.1,
        ROOM.maxZ,
      ],
    ),
  ];
}
