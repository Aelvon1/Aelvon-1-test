/**
 * Luminaires et appareillage fixes : ampoule tungstène suspendue (rosace, cordon tressé,
 * douille en bakélite, verre ambré, filament « cage d'écureuil » émissif), réglette néon
 * (boîtier émaillé, tube T8, culots, starter, chaînettes INSTANCIÉES, cordon), interrupteur à
 * bascule en saillie (levier animé, voyant de repérage).
 */
import * as THREE from 'three/webgpu';
import { ROOM, SPOTS } from '../layout';
import { StaticBatch } from '../geometry/StaticBatch';
import {
  addBox,
  cylinderBetween,
  lathe,
  place,
  roundedBox,
  roundedPolyline,
  tubeAlong,
} from '../geometry/shapes';
import type { DecorBuild } from './types';

/** Géométrie + matériau → maillage indépendant (normalisé comme le lot statique). */
function singleMesh(
  b: DecorBuild,
  material: string,
  geometry: THREE.BufferGeometry,
  name: string,
): THREE.Mesh {
  const batch = new StaticBatch();
  batch.add(material, geometry, null);
  const mesh = batch.build((id) => b.materials.get(id), name)[0]!;
  mesh.name = name;
  mesh.matrixAutoUpdate = true;
  return mesh;
}

export interface BulbParts {
  /** Position du filament (source de la lumière ponctuelle). */
  lightPosition: THREE.Vector3;
}

/** Ampoule suspendue au centre de la pièce. Aucune pièce n'ombre la source sauf la douille. */
export function buildPendantBulb(b: DecorBuild): BulbParts {
  const [bx, by, bz] = SPOTS.pendantBulb;
  const ceilingY = 2.7;
  const socketTop = by + 0.12;
  const noShadow = { castShadow: false, edge: 'none' as const };
  // Rosace de plafond.
  const rose = lathe(
    [
      [0, -0.03],
      [0.012, -0.03],
      [0.014, -0.026],
      [0.036, -0.018],
      [0.046, -0.006],
      [0.048, 0],
    ],
    28,
  );
  b.batch.add('world.bakelite', rose, place([bx, ceilingY, bz]), { edge: 'none' });
  // Cordon tressé (légère torsion : deux brins enroulés).
  const cordTop = ceilingY - 0.028;
  const helixA: THREE.Vector3[] = [];
  const helixB: THREE.Vector3[] = [];
  const turns = 22;
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    const a = t * turns * Math.PI * 2;
    const y = cordTop + (socketTop - cordTop) * t;
    helixA.push(new THREE.Vector3(bx + Math.cos(a) * 0.0017, y, bz + Math.sin(a) * 0.0017));
    helixB.push(new THREE.Vector3(bx - Math.cos(a) * 0.0017, y, bz - Math.sin(a) * 0.0017));
  }
  b.batch.add('fabric.cloth', tubeAlong(new THREE.CatmullRomCurve3(helixA), 0.0022, 6, 300), null, {
    edge: 'none',
  });
  b.batch.add('fabric.cloth', tubeAlong(new THREE.CatmullRomCurve3(helixB), 0.0022, 6, 300), null, {
    edge: 'none',
  });
  // Douille bakélite + bague filetée.
  // Profils de révolution parcourus du bas vers le haut : normales sortantes.
  const socket = lathe(
    [
      [0.016, -0.066],
      [0.0205, -0.066],
      [0.0235, -0.062],
      [0.0235, -0.052],
      [0.021, -0.05],
      [0.02, -0.006],
      [0.017, 0.0],
      [0.004, 0.0],
    ],
    28,
  );
  b.batch.add('world.bakelite', socket, place([bx, socketTop, bz]), { edge: 'none' });
  // Culot laiton E27 (filetage suggéré par des anneaux).
  const baseTop = socketTop - 0.062;
  const threads: [number, number][] = [];
  for (let i = 8; i >= 0; i--) threads.push([i % 2 === 0 ? 0.0132 : 0.0142, -i * 0.0025]);
  b.batch.add('brass', lathe(threads, 24), place([bx, baseTop, bz]), noShadow);
  // Verre « ST64 » (profil de poire allongée).
  const glassTop = baseTop - 0.02;
  const profile: [number, number][] = [
    [0.0, -0.116],
    [0.006, -0.115],
    [0.017, -0.109],
    [0.026, -0.097],
    [0.031, -0.08],
    [0.032, -0.062],
    [0.029, -0.045],
    [0.022, -0.028],
    [0.015, -0.01],
    [0.0135, 0.0],
  ];
  const glass = lathe(profile, 32);
  const glassMesh = singleMesh(b, 'world.bulb.glass', glass, 'Verre de l’ampoule');
  glassMesh.position.set(bx, glassTop, bz);
  glassMesh.castShadow = false;
  glassMesh.receiveShadow = false;
  glassMesh.renderOrder = 2;
  b.group.add(glassMesh);
  // Filament en cage d'écureuil + tige support en verre.
  const center = new THREE.Vector3(bx, glassTop - 0.062, bz);
  const cage: THREE.Vector3[] = [];
  const strands = 10;
  for (let k = 0; k <= strands; k++) {
    const a = (k / strands) * Math.PI * 2;
    const y = center.y + (k % 2 === 0 ? 0.018 : -0.018);
    cage.push(new THREE.Vector3(bx + Math.cos(a) * 0.011, y, bz + Math.sin(a) * 0.011));
  }
  b.batch.add('world.bulb.filament', tubeAlong(roundedPolyline(cage, 0.002), 0.0007, 4, 600), null, noShadow);
  const stem = cylinderBetween(
    new THREE.Vector3(bx, glassTop, bz),
    new THREE.Vector3(bx, center.y + 0.012, bz),
    0.0022,
    8,
  );
  b.batch.add('world.bulb.glass', stem.geometry, stem.matrix, noShadow);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    const wire = cylinderBetween(
      new THREE.Vector3(bx, center.y + 0.012, bz),
      new THREE.Vector3(
        bx + Math.cos(a) * 0.011,
        center.y + (k % 2 === 0 ? 0.018 : -0.018),
        bz + Math.sin(a) * 0.011,
      ),
      0.0004,
      4,
    );
    b.batch.add('steel.stainless', wire.geometry, wire.matrix, noShadow);
  }
  return { lightPosition: center };
}

export interface NeonParts {
  start: THREE.Vector3;
  end: THREE.Vector3;
  chains: THREE.InstancedMesh;
}

/** Réglette néon au-dessus de l'établi, suspendue par deux chaînettes. */
export function buildNeonFixture(b: DecorBuild): NeonParts {
  const [cx, cy, cz] = SPOTS.neonTube;
  const halfLen = 0.6;
  const tubeR = 0.013;
  const x0 = cx - halfLen - 0.02;
  const x1 = cx + halfLen + 0.02;
  const housingY0 = cy + 0.025;
  const housingY1 = cy + 0.07;
  // Boîtier en tôle émaillée crème.
  addBox(
    b.batch,
    'world.paint.creamMetal',
    [x0, housingY0, cz - 0.045],
    [x1, housingY1, cz + 0.045],
    0.012,
    {},
    2,
  );
  // Douilles de tube (« pierres tombales ») aux deux extrémités.
  for (const x of [x0 + 0.012, x1 - 0.012]) {
    addBox(
      b.batch,
      'plastic.white',
      [x - 0.011, cy - 0.022, cz - 0.02],
      [x + 0.011, housingY0 + 0.002, cz + 0.02],
      0.006,
      {},
      2,
    );
  }
  // Tube T8 (phosphore) + culots aluminium.
  const start = new THREE.Vector3(cx - halfLen, cy, cz);
  const end = new THREE.Vector3(cx + halfLen, cy, cz);
  const tube = cylinderBetween(
    start.clone().setX(start.x + 0.02),
    end.clone().setX(end.x - 0.02),
    tubeR,
    20,
    true,
  );
  b.batch.add('world.neon.tube', tube.geometry, tube.matrix, { castShadow: false, edge: 'none' });
  for (const [a, c] of [
    [start.x, start.x + 0.022],
    [end.x - 0.022, end.x],
  ] as const) {
    const cap = cylinderBetween(
      new THREE.Vector3(a, cy, cz),
      new THREE.Vector3(c, cy, cz),
      tubeR + 0.0006,
      20,
    );
    b.batch.add('alu.machined', cap.geometry, cap.matrix, { castShadow: false, edge: 'none' });
  }
  // Starter (cartouche) sur le flanc du boîtier.
  const starter = cylinderBetween(
    new THREE.Vector3(cx - 0.35, housingY0 + 0.02, cz + 0.045),
    new THREE.Vector3(cx - 0.35, housingY0 + 0.02, cz + 0.078),
    0.0105,
    16,
  );
  b.batch.add('silicone.blue', starter.geometry, starter.matrix);
  // Chaînettes instanciées (maillons alternés à 90°) + pitons.
  const ceilingY = 2.7;
  const linkLen = 0.021;
  const chainXs = [cx - 0.4, cx + 0.4];
  const links: THREE.Matrix4[] = [];
  for (const x of chainXs) {
    const n = Math.floor((ceilingY - 0.012 - housingY1) / linkLen);
    for (let i = 0; i < n; i++) {
      const y = ceilingY - 0.014 - (i + 0.5) * linkLen;
      links.push(place([x, y, cz], [0, i % 2 === 0 ? 0 : Math.PI / 2, 0]));
    }
    const eye = new THREE.TorusGeometry(0.007, 0.0016, 6, 14);
    b.batch.add('metal.galvanized', eye, place([x, ceilingY - 0.009, cz], [0, Math.PI / 4, 0]), {
      edge: 'none',
    });
    addBox(
      b.batch,
      'metal.galvanized',
      [x - 0.008, housingY1 - 0.002, cz - 0.008],
      [x + 0.008, housingY1 + 0.006, cz + 0.008],
      0.003,
    );
  }
  const linkGeometry = new THREE.TorusGeometry(0.0065, 0.0014, 5, 12);
  linkGeometry.scale(0.75, 1.3, 1);
  const chains = new THREE.InstancedMesh(linkGeometry, b.materials.get('metal.galvanized'), links.length);
  links.forEach((m, i) => chains.setMatrixAt(i, m));
  chains.instanceMatrix.needsUpdate = true;
  chains.name = 'Chaînettes du néon';
  chains.castShadow = true;
  chains.receiveShadow = true;
  chains.computeBoundingSphere();
  b.group.add(chains);
  // Cordon d'alimentation : du boîtier vers la boîte de dérivation du plafond.
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x1 - 0.01, housingY1 - 0.01, cz + 0.02),
    new THREE.Vector3(x1 + 0.05, housingY1 + 0.02, cz + 0.06),
    new THREE.Vector3(x1 + 0.03, housingY1 + 0.09, cz + 0.13),
    new THREE.Vector3(-0.5, 2.6, -1.37),
    new THREE.Vector3(-0.575, 2.63, -1.35),
  ]);
  b.batch.add('rubber.black', tubeAlong(cord, 0.0032, 6, 60), null, { edge: 'none' });
  return { start, end, chains };
}

export interface SwitchParts {
  lever: THREE.Group;
  targets: THREE.Mesh[];
  position: THREE.Vector3;
}

/** Interrupteur à bascule en saillie près de la porte. */
export function buildLightSwitch(b: DecorBuild): SwitchParts {
  const [sx, sy] = SPOTS.lightSwitch;
  // Boîtier plaqué contre le mur sud (face intérieure z = ROOM.maxZ).
  const back = ROOM.maxZ;
  const front = back - 0.042;
  const box = singleMesh(
    b,
    'world.switch.box',
    roundedBox(0.078, 0.118, back - front, 0.012, 2),
    'Interrupteur',
  );
  box.position.set(sx, sy, (front + back) / 2);
  b.group.add(box);
  // Levier : pivote autour de X au ras de la plaque (bascule haut = allumé).
  const lever = new THREE.Group();
  lever.position.set(sx, sy - 0.004, front);
  const leverGeometry = roundedBox(0.012, 0.012, 0.03, 0.005, 2);
  leverGeometry.translate(0, 0, -0.015);
  const leverMesh = singleMesh(b, 'world.switch.lever', leverGeometry, 'Levier de l’interrupteur');
  lever.add(leverMesh);
  const boss = singleMesh(
    b,
    'world.bakelite',
    new THREE.CylinderGeometry(0.013, 0.015, 0.006, 20),
    'Embase du levier',
  );
  boss.rotation.x = Math.PI / 2;
  boss.position.set(sx, sy - 0.004, front - 0.002);
  b.group.add(lever, boss);
  // Voyant orange (s'allume quand l'éclairage est coupé).
  const pilot = singleMesh(
    b,
    'world.pilot.orange',
    new THREE.SphereGeometry(0.0055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    'Voyant',
  );
  pilot.rotation.x = -Math.PI / 2;
  pilot.position.set(sx, sy + 0.038, front);
  pilot.castShadow = false;
  b.group.add(pilot);
  return { lever, targets: [box, leverMesh], position: new THREE.Vector3(sx, sy, front) };
}
