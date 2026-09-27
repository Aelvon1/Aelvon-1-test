/**
 * Coque de l'atelier : sol en dalles de béton (joints de sciage biseautés), murs enduits, plafond
 * en panneaux sur solives apparentes, plinthes, fenêtre à petits carreaux (dormant, meneaux,
 * appui, chambranle), porte métallique (vantail à panneaux emboutis, poignée, paumelles, joint,
 * seuil, filet de lumière), réseau électrique apparent, taches d'huile.
 */
import * as THREE from 'three/webgpu';
import { DOOR, ROOM, WINDOW } from '../layout';
import { addBox, beveledPlate, cylinderBetween, place, roundedPolyline, tubeAlong } from '../geometry/shapes';
import { DOOR_DETAIL, ELECTRIC, SHELL, WINDOW_DETAIL } from './dims';
import type { DecorBuild } from './types';

/** Rectangle vitré (plan x = glassX) exposé au module de la fenêtre. */
export interface GlassRect {
  x: number;
  z: readonly [number, number];
  y: readonly [number, number];
}

export function buildShell(b: DecorBuild): GlassRect {
  buildFloor(b);
  buildWalls(b);
  buildCeiling(b);
  buildBaseboards(b);
  const glass = buildWindowFrame(b);
  buildDoor(b);
  buildElectrical(b);
  buildOilStains(b);
  return glass;
}

function buildFloor(b: DecorBuild): void {
  const g = SHELL.slabGap / 2;
  const xs: [number, number][] = [
    [ROOM.minX - 0.25, SHELL.slabJointX - g],
    [SHELL.slabJointX + g, ROOM.maxX + 0.25],
  ];
  const zs: [number, number][] = [
    [ROOM.minZ - 0.25, SHELL.slabJointZ - g],
    [SHELL.slabJointZ + g, ROOM.maxZ + 0.25],
  ];
  for (const [x0, x1] of xs) {
    for (const [z0, z1] of zs) {
      addBox(b.batch, 'world.floor', [x0, -0.12, z0], [x1, 0, z1], 0.004, { castShadow: false });
    }
  }
  // Fond des joints (mastic sombre) visible entre les arêtes arrondies des dalles.
  addBox(
    b.batch,
    'rubber.black',
    [SHELL.slabJointX - 0.004, -0.04, ROOM.minZ - 0.25],
    [SHELL.slabJointX + 0.004, -0.0035, ROOM.maxZ + 0.25],
    0,
    { castShadow: false },
  );
  addBox(
    b.batch,
    'rubber.black',
    [ROOM.minX - 0.25, -0.04, SHELL.slabJointZ - 0.004],
    [ROOM.maxX + 0.25, -0.0035, SHELL.slabJointZ + 0.004],
    0,
    { castShadow: false },
  );
  b.colliders.push({ kind: 'box', center: [0, -0.1, 0], halfExtents: [3, 0.1, 3], name: 'sol' });
}

function buildWalls(b: DecorBuild): void {
  const t = ROOM.wallThickness;
  const top = ROOM.height + 0.05;
  const bottom = -0.01;
  const wall = (min: [number, number, number], max: [number, number, number]) =>
    addBox(b.batch, 'world.wall', min, max, 0);
  // Ouest (percé de la fenêtre).
  const wx0 = ROOM.minX - t;
  const wx1 = ROOM.minX;
  wall([wx0, bottom, ROOM.minZ - t], [wx1, top, WINDOW.z[0]]);
  wall([wx0, bottom, WINDOW.z[1]], [wx1, top, ROOM.maxZ + t]);
  wall([wx0, bottom, WINDOW.z[0]], [wx1, WINDOW.y[0], WINDOW.z[1]]);
  wall([wx0, WINDOW.y[1], WINDOW.z[0]], [wx1, top, WINDOW.z[1]]);
  // Est.
  wall([ROOM.maxX, bottom, ROOM.minZ - t], [ROOM.maxX + t, top, ROOM.maxZ + t]);
  // Nord.
  wall([ROOM.minX - t, bottom, ROOM.minZ - t], [ROOM.maxX + t, top, ROOM.minZ]);
  // Sud (percé de la porte).
  const sz0 = ROOM.maxZ;
  const sz1 = ROOM.maxZ + t;
  wall([ROOM.minX - t, bottom, sz0], [DOOR.x[0], top, sz1]);
  wall([DOOR.x[1], bottom, sz0], [ROOM.maxX + t, top, sz1]);
  wall([DOOR.x[0], DOOR.height, sz0], [DOOR.x[1], top, sz1]);

  const hy = ROOM.height / 2 + 0.3;
  b.colliders.push(
    { kind: 'box', center: [0, hy, ROOM.minZ - 0.1], halfExtents: [3, hy, 0.1], name: 'mur nord' },
    { kind: 'box', center: [0, hy, ROOM.maxZ + 0.1], halfExtents: [3, hy, 0.1], name: 'mur sud' },
    { kind: 'box', center: [ROOM.minX - 0.1, hy, 0], halfExtents: [0.1, hy, 3], name: 'mur ouest' },
    { kind: 'box', center: [ROOM.maxX + 0.1, hy, 0], halfExtents: [0.1, hy, 3], name: 'mur est' },
    { kind: 'box', center: [0, ROOM.height + 0.1, 0], halfExtents: [3, 0.1, 3], name: 'plafond' },
  );
}

function buildCeiling(b: DecorBuild): void {
  addBox(
    b.batch,
    'world.ceiling',
    [ROOM.minX - 0.2, ROOM.height, ROOM.minZ - 0.2],
    [ROOM.maxX + 0.2, ROOM.height + 0.05, ROOM.maxZ + 0.2],
    0,
  );
  const hw = SHELL.joistWidth / 2;
  for (const x of SHELL.joistXs) {
    addBox(
      b.batch,
      'world.joist',
      [x - hw, SHELL.joistBottom, ROOM.minZ + SHELL.ledgerThickness],
      [x + hw, ROOM.height, ROOM.maxZ - SHELL.ledgerThickness],
      0.008,
      {},
      2,
    );
  }
  // Lisses d'appui (nord et sud).
  addBox(
    b.batch,
    'world.joist',
    [ROOM.minX, SHELL.ledgerBottom, ROOM.minZ],
    [ROOM.maxX, ROOM.height, ROOM.minZ + SHELL.ledgerThickness],
    0.008,
  );
  addBox(
    b.batch,
    'world.joist',
    [ROOM.minX, SHELL.ledgerBottom, ROOM.maxZ - SHELL.ledgerThickness],
    [ROOM.maxX, ROOM.height, ROOM.maxZ],
    0.008,
  );
  // Couvre-joints des panneaux.
  for (const z of SHELL.battenZs) {
    addBox(
      b.batch,
      'world.joist',
      [ROOM.minX, ROOM.height - 0.012, z - 0.022],
      [ROOM.maxX, ROOM.height, z + 0.022],
      0.004,
    );
  }
}

function buildBaseboards(b: DecorBuild): void {
  const h = SHELL.baseboardHeight;
  const t = SHELL.baseboardThickness;
  const r = 0.005;
  const mat = 'world.paint.brown';
  const cw = DOOR_DETAIL.casingWidth;
  addBox(b.batch, mat, [ROOM.minX, 0, ROOM.minZ], [ROOM.maxX, h, ROOM.minZ + t], r);
  addBox(b.batch, mat, [ROOM.minX, 0, ROOM.maxZ - t], [DOOR.x[0] - cw, h, ROOM.maxZ], r);
  addBox(b.batch, mat, [DOOR.x[1] + cw, 0, ROOM.maxZ - t], [ROOM.maxX, h, ROOM.maxZ], r);
  addBox(b.batch, mat, [ROOM.minX, 0, ROOM.minZ], [ROOM.minX + t, h, ROOM.maxZ], r);
  addBox(b.batch, mat, [ROOM.maxX - t, 0, ROOM.minZ], [ROOM.maxX, h, ROOM.maxZ], r);
}

function buildWindowFrame(b: DecorBuild): GlassRect {
  const W = WINDOW_DETAIL;
  const [z0, z1] = WINDOW.z;
  const [y0, y1] = WINDOW.y;
  const [fx0, fx1] = W.frameX;
  const fw = W.frameWidth;
  const olive = 'world.paint.olive';
  const r = 0.006;
  // Dormant.
  addBox(b.batch, olive, [fx0, y1 - fw, z0], [fx1, y1, z1], r);
  addBox(b.batch, olive, [fx0, y0, z0], [fx1, y0 + W.bottomRail, z1], r);
  addBox(b.batch, olive, [fx0, y0, z0], [fx1, y1, z0 + fw], r);
  addBox(b.batch, olive, [fx0, y0, z1 - fw], [fx1, y1, z1], r);
  // Petits bois (3 × 2 carreaux).
  const gz0 = z0 + fw;
  const gz1 = z1 - fw;
  const gy0 = y0 + W.bottomRail;
  const gy1 = y1 - fw;
  const mw = W.muntinWidth / 2;
  const [mx0, mx1] = W.muntinX;
  for (let k = 1; k < W.cols; k++) {
    const z = gz0 + ((gz1 - gz0) * k) / W.cols;
    addBox(b.batch, olive, [mx0, gy0, z - mw], [mx1, gy1, z + mw], 0.004);
  }
  for (let k = 1; k < W.rows; k++) {
    const y = gy0 + ((gy1 - gy0) * k) / W.rows;
    addBox(b.batch, olive, [mx0, y - mw, gz0], [mx1, y + mw, gz1], 0.004);
  }
  // Mastic des carreaux (côté intérieur, filets beiges le long des bois).
  const putty = 'world.paint.cream';
  const px = mx1 + 0.004;
  addBox(b.batch, putty, [mx1 - 0.002, gy0, gz0], [px, gy0 + 0.008, gz1], 0.002, { castShadow: false });
  addBox(b.batch, putty, [mx1 - 0.002, gy1 - 0.008, gz0], [px, gy1, gz1], 0.002, { castShadow: false });
  // Appui intérieur et tablette.
  const [sx0, sx1] = W.sill.x;
  const [sy0, sy1] = W.sill.y;
  const cream = 'world.paint.cream';
  addBox(b.batch, cream, [sx0, sy0, z0 - 0.08], [sx1, sy1, z1 + 0.08], 0.008, {}, 2);
  addBox(b.batch, cream, [ROOM.minX, sy0 - 0.07, z0 - 0.04], [ROOM.minX + 0.018, sy0, z1 + 0.04], 0.005);
  // Chambranle (ébrasement habillé côté pièce).
  const cw = W.casingWidth;
  const cd = W.casingDepth;
  addBox(b.batch, cream, [ROOM.minX, y0, z0 - cw], [ROOM.minX + cd, y1 + cw, z0], 0.005);
  addBox(b.batch, cream, [ROOM.minX, y0, z1], [ROOM.minX + cd, y1 + cw, z1 + cw], 0.005);
  addBox(b.batch, cream, [ROOM.minX, y1, z0 - cw], [ROOM.minX + cd, y1 + cw, z1 + cw], 0.005);
  addBox(
    b.batch,
    cream,
    [ROOM.minX, y1 + cw, z0 - cw - 0.015],
    [ROOM.minX + cd + 0.01, y1 + cw + 0.02, z1 + cw + 0.015],
    0.006,
  );
  // Tableaux (ébrasement) en bois peint entre le dormant et le chambranle.
  addBox(b.batch, cream, [fx1, y0 + 0.0, z0 - 0.012], [ROOM.minX, y1, z0], 0.002);
  addBox(b.batch, cream, [fx1, y0 + 0.0, z1], [ROOM.minX, y1, z1 + 0.012], 0.002);
  addBox(b.batch, cream, [fx1, y1, z0 - 0.012], [ROOM.minX, y1 + 0.012, z1 + 0.012], 0.002);
  // Crémone en laiton sur la traverse basse.
  const zc = (z0 + z1) / 2;
  addBox(b.batch, 'brass', [fx1 - 0.002, y0 + 0.03, zc - 0.03], [fx1 + 0.012, y0 + 0.055, zc + 0.03], 0.004);
  addBox(b.batch, 'brass', [fx1 + 0.008, y0 + 0.036, zc - 0.005], [fx1 + 0.03, y0 + 0.05, zc + 0.05], 0.004);
  return { x: W.glassX, z: [gz0, gz1], y: [gy0, gy1] };
}

function buildDoor(b: DecorBuild): void {
  const D = DOOR_DETAIL;
  const [x0, x1] = DOOR.x;
  const h = DOOR.height;
  const zWall0 = ROOM.maxZ;
  const zWall1 = ROOM.maxZ + ROOM.wallThickness;
  const frame = 'world.paint.creamMetal';
  // Huisserie métallique dans l'épaisseur du mur.
  addBox(b.batch, frame, [x0, 0, zWall0], [x0 + D.jamb, h, zWall1], 0.004);
  addBox(b.batch, frame, [x1 - D.jamb, 0, zWall0], [x1, h, zWall1], 0.004);
  addBox(b.batch, frame, [x0, h - D.jamb, zWall0], [x1, h, zWall1], 0.004);
  // Chambranle bois peint côté pièce.
  const cw = D.casingWidth;
  const cz0 = zWall0 - D.casingDepth;
  addBox(b.batch, 'world.paint.cream', [x0 - cw, 0, cz0], [x0, h + cw, zWall0], 0.005);
  addBox(b.batch, 'world.paint.cream', [x1, 0, cz0], [x1 + cw, h + cw, zWall0], 0.005);
  addBox(b.batch, 'world.paint.cream', [x0 - cw, h, cz0], [x1 + cw, h + cw, zWall0], 0.005);
  // Vantail et panneaux emboutis.
  const lx0 = x0 + D.jamb + 0.003;
  const lx1 = x1 - D.jamb - 0.003;
  const [lz0, lz1] = D.leafZ;
  const leafTop = h - D.jamb - 0.003;
  const teal = 'world.paint.teal';
  addBox(b.batch, teal, [lx0, D.leafBottom, lz0], [lx1, leafTop, lz1], 0.006, {}, 2);
  const cx = (lx0 + lx1) / 2;
  const pw = lx1 - lx0 - 0.16;
  b.batch.add(teal, beveledPlate(pw, 0.78, 0.014, 0.012, 0.006), place([cx, 1.43, lz0]));
  b.batch.add(teal, beveledPlate(pw, 0.66, 0.014, 0.012, 0.006), place([cx, 0.62, lz0]));
  // Tôle de protection (bas de porte) rayée par les chaussures.
  addBox(
    b.batch,
    'metal.galvanized',
    [lx0 + 0.03, 0.03, lz0 - 0.0025],
    [lx1 - 0.03, 0.24, lz0 + 0.001],
    0.0012,
  );
  // Joint caoutchouc (visible dans le jeu entre vantail et huisserie).
  const rubber = 'rubber.black';
  addBox(b.batch, rubber, [x0 + D.jamb, 0.01, lz0 + 0.005], [lx0, leafTop, lz1 - 0.005], 0, {
    castShadow: false,
  });
  addBox(b.batch, rubber, [lx1, 0.01, lz0 + 0.005], [x1 - D.jamb, leafTop, lz1 - 0.005], 0, {
    castShadow: false,
  });
  addBox(b.batch, rubber, [x0 + D.jamb, leafTop, lz0 + 0.005], [x1 - D.jamb, h - D.jamb, lz1 - 0.005], 0, {
    castShadow: false,
  });
  // Seuil.
  addBox(b.batch, 'metal.galvanized', [x0, 0, zWall0 - 0.03], [x1, D.thresholdTop, zWall1], 0.002, {
    castShadow: false,
  });
  // Poignée côté ouest : plaque, béquille, cylindre de serrure, verrou à bouton.
  const hx = D.handleX;
  const hy = D.handleY;
  const steel = 'steel.stainless';
  addBox(b.batch, steel, [hx - 0.026, hy - 0.13, lz0 - 0.008], [hx + 0.026, hy + 0.12, lz0], 0.006, {}, 2);
  {
    const rose = cylinderBetween(
      new THREE.Vector3(hx, hy + 0.04, lz0 - 0.008),
      new THREE.Vector3(hx, hy + 0.04, lz0 - 0.03),
      0.02,
      16,
    );
    b.batch.add(steel, rose.geometry, rose.matrix);
    addBox(
      b.batch,
      steel,
      [hx - 0.012, hy + 0.028, lz0 - 0.05],
      [hx + 0.125, hy + 0.05, lz0 - 0.028],
      0.009,
      {},
      2,
    );
    const cyl = cylinderBetween(
      new THREE.Vector3(hx, hy - 0.06, lz0 - 0.008),
      new THREE.Vector3(hx, hy - 0.06, lz0 - 0.016),
      0.014,
      16,
    );
    b.batch.add('brass', cyl.geometry, cyl.matrix);
    const turn = cylinderBetween(
      new THREE.Vector3(hx, hy + 0.2, lz0),
      new THREE.Vector3(hx, hy + 0.2, lz0 - 0.012),
      0.022,
      16,
    );
    b.batch.add(steel, turn.geometry, turn.matrix);
    addBox(b.batch, steel, [hx - 0.004, hy + 0.18, lz0 - 0.03], [hx + 0.004, hy + 0.22, lz0 - 0.012], 0.003);
  }
  // Paumelles (côté est).
  for (const y of [0.28, 1.02, 1.76]) {
    const hinge = cylinderBetween(
      new THREE.Vector3(lx1 + 0.002, y - 0.05, lz0 - 0.004),
      new THREE.Vector3(lx1 + 0.002, y + 0.05, lz0 - 0.004),
      0.009,
      12,
    );
    b.batch.add('steel.zinc', hinge.geometry, hinge.matrix);
  }
  // Filet de lumière froide sous le vantail (jeu de 8 mm) + halo au sol.
  addBox(b.batch, 'world.door.leak', [lx0, D.thresholdTop, lz0 + 0.012], [lx1, D.leafBottom, lz1 - 0.01], 0, {
    castShadow: false,
    receiveShadow: false,
  });
  const leakFloor = new THREE.PlaneGeometry(x1 - x0 + 0.1, 0.3);
  b.overlays.add(
    'world.door.leakFloor',
    leakFloor,
    place([(x0 + x1) / 2, 0.0025, ROOM.maxZ - 0.15], [-Math.PI / 2, 0, 0]),
    {
      uv: 'keep',
      castShadow: false,
      receiveShadow: false,
    },
  );
}

function buildElectrical(b: DecorBuild): void {
  const E = ELECTRIC;
  const r = E.conduitRadius;
  const galv = 'metal.galvanized';
  const conduit = (points: [number, number, number][]) => {
    const pts = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    b.batch.add(galv, tubeAlong(roundedPolyline(pts, 0.055), r, 8, 30), null, { castShadow: true });
    // Colliers de fixation tous les ~55 cm sur les parties droites.
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const c = pts[i + 1]!;
      const len = a.distanceTo(c);
      const n = Math.floor(len / 0.55);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const p = new THREE.Vector3().lerpVectors(a, c, t);
        const dir = new THREE.Vector3().subVectors(c, a).normalize();
        const clip = cylinderBetween(
          p.clone().addScaledVector(dir, -0.008),
          p.clone().addScaledVector(dir, 0.008),
          r + 0.0025,
          10,
        );
        b.batch.add(galv, clip.geometry, clip.matrix);
      }
    }
  };
  const box = (c: [number, number, number], s: [number, number, number]) =>
    addBox(
      b.batch,
      galv,
      [c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2],
      [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2],
      0.006,
    );
  const wz = ROOM.maxZ - 0.024;
  const nz = ROOM.minZ + 0.024;
  // Interrupteur → plafond → rosace de l'ampoule.
  conduit([
    [1.08, 1.31, wz],
    [1.08, E.wallRunY, wz],
    [0, E.wallRunY, wz],
    [0, E.wallRunY, ROOM.maxZ - 0.075],
    [0, E.ceilingRunY, ROOM.maxZ - 0.075],
    [0, E.ceilingRunY, 0.05],
  ]);
  box([1.08, E.wallRunY, wz + 0.002], [0.09, 0.09, 0.045]);
  // Rosace → boîte de dérivation du néon → prise murale (à droite de l'établi).
  conduit([
    [0, E.ceilingRunY, -0.05],
    [0, E.ceilingRunY, -1.35],
  ]);
  box([0, E.ceilingRunY - 0.01, -1.35], [0.1, 0.05, 0.1]);
  conduit([
    [-0.05, E.ceilingRunY, -1.35],
    [-0.55, E.ceilingRunY, -1.35],
  ]);
  conduit([
    [0, E.ceilingRunY, -1.4],
    [0, E.ceilingRunY, ROOM.minZ + 0.075],
    [0, E.wallRunY, ROOM.minZ + 0.075],
    [0, E.wallRunY, nz],
    [E.outlet[0], E.wallRunY, nz],
    [E.outlet[0], E.outlet[1] + 0.075, nz],
  ]);
  box([-0.58, E.ceilingRunY - 0.012, -1.35], [0.06, 0.05, 0.06]);
  // Prise double en saillie + voyant rouge.
  const [ox, oy] = E.outlet;
  const oz = ROOM.minZ;
  addBox(
    b.batch,
    'world.paint.creamMetal',
    [ox - 0.04, oy - 0.075, oz],
    [ox + 0.04, oy + 0.075, oz + 0.048],
    0.008,
    {},
    2,
  );
  for (const dy of [-0.035, 0.03]) {
    const socket = cylinderBetween(
      new THREE.Vector3(ox, oy + dy, oz + 0.045),
      new THREE.Vector3(ox, oy + dy, oz + 0.05),
      0.019,
      20,
    );
    b.batch.add('plastic.black', socket.geometry, socket.matrix);
  }
  const pilot = cylinderBetween(
    new THREE.Vector3(ox, oy + 0.064, oz + 0.046),
    new THREE.Vector3(ox, oy + 0.064, oz + 0.052),
    0.0045,
    12,
  );
  b.batch.add('world.pilot.red', pilot.geometry, pilot.matrix, { castShadow: false });
}

function buildOilStains(b: DecorBuild): void {
  // [x, z, rayon, rotation]
  const stains: [number, number, number, number][] = [
    [-1.15, -1.1, 0.34, 0.4],
    [-0.2, -1.05, 0.16, 1.9],
    [0.85, 0.85, 0.5, 0.2],
    [1.25, 0.35, 0.22, 2.6],
    [1.7, -0.55, 0.26, 1.1],
    [-1.95, 0.55, 0.2, 0.7],
    [0.2, 1.45, 0.14, 2.2],
  ];
  for (const [x, z, radius, rot] of stains) {
    const plane = new THREE.PlaneGeometry(radius * 2, radius * 2);
    b.overlays.add('world.oil', plane, place([x, 0.0015, z], [-Math.PI / 2, 0, rot]), {
      uv: 'keep',
      castShadow: false,
    });
  }
}
