/**
 * Établi (2 m, bois massif usé) : plateau en quatre lames, piètement à six pieds, ceintures,
 * traverses basses et étagère ; tapis antistatique avec pression de mise à la terre et cordon
 * spiralé jusqu'à la prise ; structure du panneau perforé (panneau troué, tasseaux, cadre).
 *
 * Le plateau et le tapis forment un groupe à part (`top`) : il reste visible en fond studio
 * neutre et porte la mise en évidence de l'invite « Ouvrir l'inventaire ».
 */
import * as THREE from 'three/webgpu';
import { BENCH, MAT, PEGBOARD } from '../layout';
import { StaticBatch } from '../geometry/StaticBatch';
import { addBox, beveledPlate, CoiledCurve, lathe, place, tubeAlong } from '../geometry/shapes';
import { ELECTRIC } from './dims';
import type { DecorBuild } from './types';

export interface BenchParts {
  /** Plateau + tapis (+ pression de masse). */
  top: THREE.Group;
  /** Maillages visés par l'invite de l'établi. */
  targets: THREE.Mesh[];
}

export function buildBench(b: DecorBuild): BenchParts {
  const [x0, x1] = BENCH.x;
  const [z0, z1] = BENCH.z;
  const topY = BENCH.topHeight;
  const underTop = topY - BENCH.topThickness;
  const frame = 'world.bench.frame';

  // --- Piètement (fusionné avec le décor statique) -------------------------------------
  const legW = 0.07;
  const legXs = [x0 + 0.06, (x0 + x1) / 2, x1 - 0.06];
  const legZs = [z0 + 0.06, z1 - 0.06];
  for (const lx of legXs) {
    for (const lz of legZs) {
      addBox(
        b.batch,
        frame,
        [lx - legW / 2, 0, lz - legW / 2],
        [lx + legW / 2, underTop, lz + legW / 2],
        0.008,
        { uvRotate: true },
        2,
      );
    }
  }
  const apronT = 0.024;
  const frontZ = legZs[1]! + legW / 2;
  const backZ = legZs[0]! - legW / 2;
  // Ceintures sous plateau.
  addBox(
    b.batch,
    frame,
    [x0 + 0.04, underTop - 0.12, frontZ - apronT],
    [x1 - 0.04, underTop, frontZ],
    0.006,
    {},
    2,
  );
  addBox(b.batch, frame, [x0 + 0.04, underTop - 0.12, backZ], [x1 - 0.04, underTop, backZ + apronT], 0.006);
  for (const lx of legXs) {
    addBox(
      b.batch,
      frame,
      [lx - apronT / 2, underTop - 0.12, backZ + apronT],
      [lx + apronT / 2, underTop, frontZ - apronT],
      0.005,
    );
  }
  // Traverses basses + étagère en contreplaqué.
  const railY0 = 0.12;
  const railY1 = 0.18;
  addBox(b.batch, frame, [x0 + 0.04, railY0, frontZ - apronT], [x1 - 0.04, railY1, frontZ], 0.006);
  addBox(b.batch, frame, [x0 + 0.04, railY0, backZ], [x1 - 0.04, railY1, backZ + apronT], 0.006);
  for (const lx of legXs) {
    addBox(
      b.batch,
      frame,
      [lx - apronT / 2, railY0, backZ + apronT],
      [lx + apronT / 2, railY1, frontZ - apronT],
      0.005,
    );
  }
  addBox(
    b.batch,
    'wood.plywood',
    [x0 + 0.03, railY1, backZ + 0.005],
    [x1 - 0.03, railY1 + 0.018, frontZ - 0.005],
    0.004,
  );
  b.colliders.push({
    kind: 'box',
    center: [(x0 + x1) / 2, topY / 2, (z0 + z1) / 2],
    halfExtents: [(x1 - x0) / 2, topY / 2, (z1 - z0) / 2],
    name: 'établi',
  });

  // --- Plateau et tapis (groupe séparé) -----------------------------------------------
  const topBatch = new StaticBatch();
  const planks = 4;
  const pd = (z1 - z0) / planks;
  for (let i = 0; i < planks; i++) {
    const pz0 = z0 + i * pd + 0.0012;
    const pz1 = z0 + (i + 1) * pd - 0.0012;
    // Lame avant plus arrondie (usure des avant-bras).
    const radius = i === planks - 1 ? 0.012 : 0.006;
    addBox(topBatch, 'world.bench.top', [x0, underTop, pz0], [x1, topY, pz1], radius, {}, 2);
  }
  // Tapis antistatique : plaque biseautée à coins arrondis, dessus = MAT.center.y.
  const [mw, md] = MAT.size;
  const mat = beveledPlate(mw, md, MAT.thickness, 0.014, 0.0009);
  topBatch.add(
    'world.mat',
    mat,
    place([MAT.center[0], MAT.center[1] - MAT.thickness / 2, MAT.center[2]], [-Math.PI / 2, 0, 0]),
    {
      edge: 'none',
    },
  );
  // Pression de mise à la terre (coin arrière droit du tapis).
  const studX = MAT.center[0] + mw / 2 - 0.035;
  const studZ = MAT.center[2] - md / 2 + 0.035;
  const stud = lathe(
    [
      [0.0065, 0],
      [0.0065, 0.0012],
      [0.0055, 0.003],
      [0.004, 0.0042],
      [0, 0.0045],
    ],
    20,
  );
  topBatch.add('steel.chrome', stud, place([studX, MAT.center[1], studZ]), { edge: 'none' });

  const top = new THREE.Group();
  top.name = 'Plateau de l’établi';
  const topMeshes = topBatch.build((id) => b.materials.get(id), 'Plateau');
  for (const mesh of topMeshes) top.add(mesh);
  b.group.add(top);

  // Cordon spiralé de mise à la terre : du tapis à la prise murale (fiche de terre).
  const [ox, oy, oz] = ELECTRIC.outlet;
  const carrier = new THREE.CatmullRomCurve3([
    new THREE.Vector3(studX, MAT.center[1] + 0.005, studZ),
    new THREE.Vector3(studX + 0.06, topY + 0.008, studZ - 0.08),
    new THREE.Vector3(studX + 0.3, topY + 0.01, z0 + 0.06),
    new THREE.Vector3(x1 - 0.12, topY + 0.012, z0 + 0.05),
    new THREE.Vector3(x1 + 0.02, topY + 0.03, z0 + 0.06),
    new THREE.Vector3(ox - 0.01, oy - 0.03, oz + 0.07),
    new THREE.Vector3(ox, oy - 0.035, oz + 0.062),
  ]);
  const coil = new CoiledCurve(carrier, 0.0042, Math.round(carrier.getLength() / 0.0065));
  b.batch.add('rubber.black', tubeAlong(coil, 0.0013, 5, 1600), null, { edge: 'none', castShadow: false });
  addBox(
    b.batch,
    'plastic.black',
    [ox - 0.018, oy - 0.055, oz + 0.05],
    [ox + 0.018, oy - 0.015, oz + 0.085],
    0.006,
    { castShadow: false },
    2,
  );

  // --- Panneau perforé ----------------------------------------------------------------
  const [px0, px1] = PEGBOARD.x;
  const [py0, py1] = PEGBOARD.y;
  const pz = PEGBOARD.z;
  addBox(b.batch, 'world.pegboard', [px0, py0, pz - 0.006], [px1, py1, pz], 0);
  for (const y of [py0 + 0.03, (py0 + py1) / 2, py1 - 0.03]) {
    addBox(
      b.batch,
      'world.joist',
      [px0 + 0.01, y - 0.02, pz - 0.015],
      [px1 - 0.01, y + 0.02, pz - 0.006],
      0.003,
    );
  }
  const fw = 0.025;
  const fz0 = pz - 0.006;
  const fz1 = pz + 0.016;
  addBox(b.batch, frame, [px0 - fw, py1, fz0], [px1 + fw, py1 + fw, fz1], 0.005);
  addBox(b.batch, frame, [px0 - fw, py0 - fw, fz0], [px1 + fw, py0, fz1], 0.005);
  addBox(b.batch, frame, [px0 - fw, py0, fz0], [px0, py1, fz1], 0.005, { uvRotate: true });
  addBox(b.batch, frame, [px1, py0, fz0], [px1 + fw, py1, fz1], 0.005, { uvRotate: true });

  const targets = topMeshes.filter((m) => m.material !== b.materials.get('steel.chrome'));
  return { top, targets };
}
