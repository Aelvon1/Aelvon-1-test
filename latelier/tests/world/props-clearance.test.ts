/**
 * Passages libres : carte d'occupation 2D des volumes de collision (accessoires + établi + murs)
 * et largeur du passage le plus large entre le point d'apparition et chaque zone d'usage
 * (établi, étagères, fenêtre, porte). Exigence : ≥ 90 cm partout où l'on circule.
 *
 * Les colliders des accessoires sont ceux réellement enregistrés dans Rapier
 * (`propColliderSpecs()`), sans charger Rapier ; ceux de la salle sont reconstruits depuis le plan.
 */
import { describe, expect, it } from 'vitest';
import { propColliderSpecs } from '../../src/world/props/colliders';
import {
  contains,
  footprintOf,
  OccupancyGrid,
  roomFootprints,
  type Footprint,
} from '../../src/world/props/clearance';
import { BENCH, DOOR, PLAYER, ROOM, SHELVES, SPAWN, WINDOW } from '../../src/world/layout';

const MIN = PLAYER.minClearance;

function buildGrid(): { grid: OccupancyGrid; footprints: Footprint[] } {
  const footprints = [
    ...roomFootprints(),
    ...propColliderSpecs()
      .map((s) => footprintOf(s))
      .filter((f): f is Footprint => f !== null),
  ];
  const grid = new OccupancyGrid();
  grid.rasterize(footprints);
  return { grid, footprints };
}

const spawn = { x: SPAWN.position[0], z: SPAWN.position[2] };

/** Zones d'usage : bande où se tient le joueur devant chaque élément. */
const ZONES = {
  établi: { x: [BENCH.x[0] + 0.1, BENCH.x[1]] as const, z: [BENCH.z[1] + 0.35, BENCH.z[1] + 0.75] as const },
  étagères: { x: [SHELVES.x[0] - 0.75, SHELVES.x[0] - 0.35] as const, z: SHELVES.z },
  fenêtre: { x: [ROOM.minX + 0.35, ROOM.minX + 0.75] as const, z: WINDOW.z },
  porte: { x: DOOR.x, z: [DOOR.z - 0.75, DOOR.z - 0.35] as const },
};

describe('carte d’occupation', () => {
  it('rastérise boîtes (orientées) et cylindres', () => {
    const box: Footprint = { kind: 'box', name: 'b', cx: 0, cz: 0, hx: 0.5, hz: 0.1, rotationY: Math.PI / 2 };
    expect(contains(box, 0, 0.4)).toBe(true);
    expect(contains(box, 0.4, 0)).toBe(false);
    const circle: Footprint = { kind: 'circle', name: 'c', cx: 1, cz: 1, radius: 0.2 };
    expect(contains(circle, 1.1, 1.1)).toBe(true);
    expect(contains(circle, 1.2, 1.2)).toBe(false);
    const grid = new OccupancyGrid({ x: [0, 2], z: [0, 1] }, 0.01);
    grid.rasterize([{ kind: 'box', name: 'mur', cx: 1, cz: 0.5, hx: 0.05, hz: 0.3, rotationY: 0 }]);
    // Couloir de 1 m entre deux murs : 1 m de passage au centre, bloqué par le poteau à 0,5 m.
    expect(grid.clearanceAt({ x: 0.5, z: 0.5 })).toBeCloseTo(0.45, 1);
    expect(grid.passageWidth({ x: 0.2, z: 0.5 }, { x: [1.7, 1.8], z: [0.4, 0.6] })).toBeGreaterThan(0.18);
    expect(grid.passageWidth({ x: 0.2, z: 0.5 }, { x: [1.7, 1.8], z: [0.4, 0.6] })).toBeLessThan(0.22);
  });

  it('ignore les volumes hors de la tranche du corps du joueur', () => {
    expect(
      footprintOf({ kind: 'box', center: [0, 2.8, 0], halfExtents: [3, 0.1, 3], name: 'plafond' }),
    ).toBeNull();
    expect(
      footprintOf({ kind: 'cylinder', center: [0, 0.3, 0], radius: 0.2, halfHeight: 0.3 }),
    ).not.toBeNull();
  });
});

describe('passages libres de l’atelier (≥ 90 cm)', () => {
  const { grid, footprints } = buildGrid();

  it('garde tous les volumes des accessoires dans la pièce, loin du point d’apparition', () => {
    for (const spec of propColliderSpecs()) {
      const [x, , z] = spec.center;
      expect(x, spec.name).toBeGreaterThan(ROOM.minX - 0.01);
      expect(x, spec.name).toBeLessThan(ROOM.maxX + 0.01);
      expect(z, spec.name).toBeGreaterThan(ROOM.minZ - 0.01);
      expect(z, spec.name).toBeLessThan(ROOM.maxZ + 0.01);
    }
    for (const f of footprints) expect(contains(f, spawn.x, spawn.z), f.name).toBe(false);
    expect(grid.clearanceAt(spawn)).toBeGreaterThanOrEqual(MIN / 2);
  });

  for (const [name, zone] of Object.entries(ZONES)) {
    it(`relie le point d’apparition à la zone « ${name} » par un passage ≥ 90 cm`, () => {
      const width = grid.passageWidth(spawn, zone);
      expect(width, `${name} : ${width.toFixed(3)} m`).toBeGreaterThanOrEqual(MIN);
    });
  }

  it('relie les zones entre elles (circulation établi ↔ étagères ↔ fenêtre ↔ porte)', () => {
    const reach = grid.reachable(spawn, MIN / 2);
    for (const [name, zone] of Object.entries(ZONES)) expect(grid.anyIn(reach, zone), name).toBe(true);
  });
});
