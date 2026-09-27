/**
 * Flasques (paliers) avant et arrière : aluminium anodisé, collerette extérieure, collerette de
 * centrage dans l'alésage du carter, voile, bossage de roulement (portée + épaulement).
 * - Avant : bossage de centrage (pilote), 2 trous de fixation taraudés M3 (filets en détail),
 *   3 trous de passage des vis de flasque.
 * - Arrière : passages des trois sorties de phase, logement de la platine capteurs (fenêtres des
 *   capteurs Hall, taraudages M2 des vis de platine), légende gravée, bornier.
 *
 * Construction : profils de révolution (arêtes arrondies) + faces planes percées + parois de
 * trous, raccordés sur des cercles échantillonnés à l'identique (surface étanche).
 */
import * as THREE from 'three/webgpu';
import { float, texture, uv, vec3 } from 'three/tsl';
import { circle, roundedRect, rotate, type P2 } from '../profile2d';
import { annularSector } from '../sections';
import { rearLegendTexture } from '../markings';
import type { BldcDims } from '../params';
import { anodized, cachedGeometry, dims, geoKey, group, instanced, mesh, segs, type Ctx } from './common';
import {
  basis,
  extrude,
  frameAlong,
  MeshBuilder,
  MM,
  planarFace,
  planeX,
  revolve,
  revolveInner,
  roundedProfile,
  threadSurface,
  type RevPoint,
  type V3,
} from './geom';

/** Paroi d'un trou d'axe `axis` (vers la matière) débouchant sur une face plane x = cte. */
function holeWall(
  mb: MeshBuilder,
  center: V3,
  axis: 1 | -1,
  r: number,
  depth: number,
  chamfer: number,
  segments: number,
  blind: boolean,
): void {
  const prof: RevPoint[] = [[0, r + chamfer]];
  if (chamfer > 0) prof.push([chamfer, r]);
  prof.push([depth, r]);
  if (blind) prof.push([depth + r / Math.tan((59 * Math.PI) / 180), 0]);
  const local = new MeshBuilder();
  revolveInner(local, prof, segments);
  mb.append(local, basis(center, [axis, 0, 0], [0, 1, 0], [0, 0, 1]));
}

/** Paroi verticale le long d'un contour (logement, fenêtre), normales vers le vide. */
function contourWall(mb: MeshBuilder, pts: readonly P2[], x0: number, x1: number, voidInside: boolean): void {
  const n = pts.length;
  // Aire signée : normale sortante du vide = vers l'intérieur du contour si le vide est dedans.
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i]![0] * pts[(i + 1) % n]![1] - pts[(i + 1) % n]![0] * pts[i]![1];
  const ccw = area > 0;
  const base = mb.vertexCount;
  for (let i = 0; i <= n; i++) {
    const a = pts[(i - 1 + n) % n]!;
    const p = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    // Normale extérieure du contour (trigonométrique : (dy, −dx)).
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    if (!ccw) {
      nx = -nx;
      ny = -ny;
    }
    if (voidInside) {
      nx = -nx;
      ny = -ny;
    }
    mb.vertex(x0, p[0], p[1], 0, nx, ny, i / n, 0);
    mb.vertex(x1, p[0], p[1], 0, nx, ny, i / n, 1);
  }
  for (let i = 0; i < n; i++) mb.quad(base + i * 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2);
}

const polarP = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];

/** Rayons et cotes communs aux deux flasques (repère « avant » : x > 0). */
function bellFrame(d: BldcDims) {
  const s = d.s;
  const rho = 0.55 * s;
  return {
    s,
    rho,
    xb: d.half - d.flangeT,
    xs: d.half - d.flangeT - d.spigotDepth,
    R: d.flangeR,
    faceOuter: d.flangeR - 1.2 * rho,
    f: 0.22 * s,
    r2: 0.3 * s,
    clear: d.screw.d / 2 + 0.2,
  };
}

/** Profil extérieur (collerette) en repère « avant ». */
function rimProfile(d: BldcDims): RevPoint[] {
  const b = bellFrame(d);
  return roundedProfile(
    [
      [b.xb, b.faceOuter],
      [b.xb, b.R, b.rho],
      [d.half, b.R, b.rho],
      [d.half, b.faceOuter],
    ],
    0.25,
  );
}

/** Collerette de centrage + face arrière de collerette (repère « avant »), de `from` au bord de face. */
function spigotProfile(d: BldcDims, fromWeb: boolean): RevPoint[] {
  const b = bellFrame(d);
  const nodes: [number, number, number?][] = [];
  if (fromWeb) {
    nodes.push(
      [d.webX, d.spigotInnerR - b.f],
      [d.webX, d.spigotInnerR, b.f],
      [b.xs, d.spigotInnerR, b.r2],
      [b.xs, d.spigotInnerR + b.r2],
    );
    return roundedProfile(nodes, 0.25);
  }
  nodes.push(
    [b.xs, d.spigotR - b.r2],
    [b.xs, d.spigotR, b.r2],
    [b.xb, d.spigotR, b.f],
    [b.xb, d.spigotR + b.f],
  );
  return roundedProfile(nodes, 0.25);
}

/** Bossage de roulement, épaulement et alésage d'arbre (repère « avant »). */
function hubProfile(d: BldcDims, front: boolean): [number, number, number?][] {
  const b = bellFrame(d);
  const seat = d.bearing.D / 2;
  const nodes: [number, number, number?][] = [];
  if (front) {
    const pilotX = d.half + d.pilotH;
    nodes.push(
      [d.half, d.pilotR + b.f],
      [d.half, d.pilotR, b.f],
      [pilotX, d.pilotR, 0.35 * b.s],
      [pilotX, d.shaftHoleR, 0.2],
    );
  } else {
    nodes.push([d.half, d.shaftHoleR + 0.25], [d.half, d.shaftHoleR, 0.2]);
  }
  nodes.push(
    [d.shoulderX, d.shaftHoleR, 0.12],
    [d.shoulderX, seat, 0.08],
    [d.bossEndX, seat, 0.2],
    [d.bossEndX, d.bossR, 0.3 * b.s],
    [d.webX, d.bossR, b.f],
    [d.webX, d.bossR + b.f],
  );
  return nodes;
}

/** Flasque avant (géométrie propre du sous-ensemble). */
export function buildFrontBell(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const N = segs(ctx, 120);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'front-bell'), () => {
    const b = bellFrame(d);
    const mb = new MeshBuilder();
    revolve(mb, rimProfile(d), { segments: N });
    // Bossage, voile et collerette : un seul profil (aucun perçage sur ces faces).
    const hub = hubProfile(d, true);
    hub.pop();
    const chain = roundedProfile(
      [
        ...hub,
        [d.webX, d.spigotInnerR, b.f],
        [b.xs, d.spigotInnerR, b.r2],
        [b.xs, d.spigotR, b.r2],
        [b.xb, d.spigotR, b.f],
        [b.xb, d.spigotR + b.f],
      ],
      0.25,
    );
    revolve(mb, chain, { segments: N });
    // Face avant : vis de flasque (passage) et trous de fixation M3 (taraudés, borgnes).
    const hs = segs(ctx, 24);
    const screwHoles = d.screw.angles.map((a) => circle(...polarP(d.screw.pcdR, a), b.clear + 0.15, hs));
    const mountHoles = d.mount.angles.map((a) => circle(...polarP(d.mount.r, a), d.mount.d / 2 + 0.3, hs));
    planarFace(
      mb,
      circle(0, 0, b.faceOuter, N),
      [circle(0, 0, d.pilotR + b.f, N), ...screwHoles, ...mountHoles],
      planeX(d.half, 1),
    );
    // Face d'appui (contre le carter).
    planarFace(
      mb,
      circle(0, 0, b.faceOuter, N),
      [
        circle(0, 0, d.spigotR + b.f, N),
        ...d.screw.angles.map((a) => circle(...polarP(d.screw.pcdR, a), b.clear, hs)),
      ],
      planeX(b.xb, -1),
    );
    for (const a of d.screw.angles) {
      const [y, z] = polarP(d.screw.pcdR, a);
      holeWall(mb, [d.half, y, z], -1, b.clear, d.flangeT, 0.15, hs, false);
    }
    for (const a of d.mount.angles) {
      const [y, z] = polarP(d.mount.r, a);
      holeWall(mb, [d.half, y, z], -1, d.mount.d / 2, d.flangeT - 0.2, 0.3, hs, true);
    }
    return mb;
  });
  const g = group('Flasque avant', 0, d.axisY, 0);
  g.add(mesh(geo, anodized(ctx), 'frontBell.body'));
  return g;
}

/** Détail de la flasque avant : filetage M3 réel des deux trous de fixation. */
export function buildFrontBellDetail(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'mount-thread'), () => {
    const local = new MeshBuilder();
    threadSurface(local, {
      majorR: d.mount.d / 2 - 0.004,
      pitch: d.mount.pitch,
      z0: 0.35,
      z1: d.flangeT - 0.25,
      internal: true,
      segmentsPerTurn: segs(ctx, 28),
      profileSamples: 12,
    });
    const mb = new MeshBuilder();
    mb.append(local, basis([0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]));
    return mb;
  });
  const matrices = d.mount.angles.map((a) => {
    const [y, z] = polarP(d.mount.r, a);
    return frameAlong([d.half * MM, y * MM, z * MM], [-1, 0, 0]);
  });
  const g = new THREE.Group();
  g.name = 'Filetages M3';
  g.add(instanced(geo, anodized(ctx), matrices, 'frontBell.threads'));
  return g;
}

/** Contour du logement de platine (platine + jeu de 0,25 mm). */
export function recessOutline(d: BldcDims, maxStep: number): P2[] {
  const j = 0.25;
  const rMid = (d.pcb.rIn + d.pcb.rOut) / 2;
  return annularSector(
    d.pcb.rIn - j,
    d.pcb.rOut + j,
    d.pcb.a0 - j / rMid,
    d.pcb.a1 + j / rMid,
    0.9 * d.s,
    maxStep,
  );
}

/** Fenêtre de passage d'un capteur Hall (rectangle arrondi orienté). */
export function hallWindow(d: BldcDims, angle: number, clearance: number): P2[] {
  const rMid = (d.hall.r0 + d.hall.r1) / 2;
  const rect = roundedRect(
    0,
    0,
    d.hall.r1 - d.hall.r0 + 2 * clearance,
    d.hall.width + 2 * clearance,
    0.3,
    0.1,
    3,
  );
  return rect.map((p) => rotate([p[0] + rMid, p[1]], angle));
}

/** Flasque arrière (géométrie propre du sous-ensemble). */
export function buildRearBell(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const sensors = ctx.params.sensors;
  const N = segs(ctx, 120);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'rear-bell'), () => {
    const b = bellFrame(d);
    const front = new MeshBuilder();
    revolve(front, rimProfile(d), { segments: N });
    revolve(front, roundedProfile(hubProfile(d, false), 0.25), { segments: N });
    revolve(front, spigotProfile(d, true), { segments: N });
    revolve(front, spigotProfile(d, false), { segments: N });
    const mb = new MeshBuilder();
    // Profils décrits côté avant puis symétrisés (normales conservées, orientation recalculée).
    mb.append(front, new THREE.Matrix4().makeScale(-1, 1, 1));
    const hs = segs(ctx, 24);
    const ms = [0.4, 0.3, 0.2, 0.15][ctx.quality]!;
    const leadHoles = d.leadHoles.map((h) => circle(h.y, h.z, h.r, hs));
    const screwFace = d.screw.angles.map((a) => circle(...polarP(d.screw.pcdR, a), b.clear + 0.15, hs));
    const recess = sensors ? recessOutline(d, ms) : null;
    // Face arrière.
    planarFace(
      mb,
      circle(0, 0, b.faceOuter, N),
      [circle(0, 0, d.shaftHoleR + 0.25, N), ...screwFace, ...leadHoles, ...(recess ? [recess] : [])],
      planeX(-d.half, -1),
    );
    // Face d'appui contre le carter.
    planarFace(
      mb,
      circle(0, 0, b.faceOuter, N),
      [
        circle(0, 0, d.spigotR + b.f, N),
        ...d.screw.angles.map((a) => circle(...polarP(d.screw.pcdR, a), b.clear, hs)),
      ],
      planeX(-b.xb, 1),
    );
    // Face frontale de la collerette de centrage (sorties de phase).
    planarFace(
      mb,
      circle(0, 0, d.spigotR - b.r2, N),
      [circle(0, 0, d.spigotInnerR + b.r2, N), ...leadHoles],
      planeX(-b.xs, 1),
    );
    // Voile intérieur (fenêtres des capteurs).
    const windows = sensors ? d.hall.angles.map((a) => hallWindow(d, a, 0.1)) : [];
    planarFace(
      mb,
      circle(0, 0, d.spigotInnerR - b.f, N),
      [circle(0, 0, d.bossR + b.f, N), ...windows],
      planeX(-d.webX, 1),
    );
    for (const a of d.screw.angles) {
      const [y, z] = polarP(d.screw.pcdR, a);
      holeWall(mb, [-d.half, y, z], 1, b.clear, d.flangeT, 0.15, hs, false);
    }
    for (const h of d.leadHoles)
      holeWall(mb, [-d.half, h.y, h.z], 1, h.r, d.flangeT + d.spigotDepth, 0.12, hs, false);
    if (recess) {
      const floorX = -d.half + d.pcb.recessDepth;
      const pcbScrews = d.pcb.screwAngles.map((a) => circle(...polarP(d.pcb.screwR, a), 1.0 + 0.15, hs));
      planarFace(mb, recess, [...windows, ...pcbScrews], planeX(floorX, -1));
      contourWall(mb, recess, -d.half, floorX, true);
      for (const w of windows) contourWall(mb, w, floorX, -d.webX, true);
      for (const a of d.pcb.screwAngles) {
        const [y, z] = polarP(d.pcb.screwR, a);
        holeWall(mb, [floorX, y, z], 1, 1.0, 2.4, 0.15, hs, true);
      }
    }
    return mb;
  });
  const g = group('Flasque arrière', 0, d.axisY, 0);
  g.add(mesh(geo, anodized(ctx), 'rearBell.body'));
  g.add(buildRearLegend(ctx));
  return g;
}

/** Légende gravée sur la face arrière (disque décalque, 10 µm au-dessus de la face). */
function buildRearLegend(ctx: Ctx): THREE.Mesh {
  const d = dims(ctx);
  const { texture: tex, half } = rearLegendTexture(ctx.textures, d, ctx.quality);
  const b = bellFrame(d);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'rear-legend'), () => {
    const mb = new MeshBuilder();
    const N = segs(ctx, 96);
    const recess = ctx.params.sensors ? [recessOutline(d, 0.3)] : [];
    const holes = [
      circle(0, 0, d.shaftHoleR + 0.4, N),
      ...d.screw.angles.map((a) => circle(...polarP(d.screw.pcdR, a), b.clear + 0.3, 20)),
      ...d.leadHoles.map((h) => circle(h.y, h.z, h.r + 0.2, 20)),
      ...recess,
      // Bornier : zone non gravée sous le bloc.
      roundedRect(
        (d.block.y0 + d.block.y1) / 2,
        0,
        d.block.y1 - d.block.y0 + 0.4,
        2 * d.block.z + 0.4,
        0.5,
        0.3,
      ),
    ];
    // Canvas vu de l'arrière : x = z + half, y = −y + half.
    planarFace(mb, circle(0, 0, b.faceOuter - 0.1, N), holes, planeX(-d.half - 0.015, -1), (p) => [
      (p[1] + half) / (2 * half),
      (-p[0] + half) / (2 * half),
    ]);
    return mb;
  });
  const silver = ctx.params.anodize === 'silver';
  const m = new THREE.MeshPhysicalNodeMaterial({
    metalness: 0.25,
    roughness: 0.62,
    transparent: true,
    depthWrite: false,
  });
  m.name = 'Gravure laser (flasque)';
  m.colorNode = silver ? vec3(0.16, 0.17, 0.18) : vec3(0.86, 0.88, 0.9);
  m.opacityNode = texture(tex, uv()).a.mul(float(0.92));
  const legend = mesh(geo, m, 'rearBell.legend');
  legend.renderOrder = 2;
  return legend;
}

/** Bornier isolant des languettes (PBT noir) sur la face arrière. */
export function buildTerminalBlock(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'terminal-block'), () => {
    const bl = d.block;
    const cy = (bl.y0 + bl.y1) / 2;
    const outline = roundedRect(cy, 0, bl.y1 - bl.y0, 2 * bl.z, 0.8 * d.s, 0.2);
    const holes = d.leadHoles.map((h) => circle(h.y, h.z, h.r, segs(ctx, 20)));
    const mb = new MeshBuilder();
    // Section (y, z), extrusion le long de x (de la face arrière vers l'extérieur).
    const local = new MeshBuilder();
    extrudeSection(local, outline, holes, bl.x1, bl.x0, 0.3 * d.s);
    mb.append(local);
    return mb;
  });
  const g = group('Bornier');
  g.add(mesh(geo, ctx.materials.get('plastic.pbt.black'), 'rearBell.block'));
  return g;
}

/** Extrusion d'une section (y, z) le long de x, arêtes arrondies (x0 < x1). */
function extrudeSection(
  mb: MeshBuilder,
  outline: P2[],
  holes: P2[][],
  x0: number,
  x1: number,
  round: number,
): void {
  const local = new MeshBuilder();
  extrudeLocal(local, outline, holes, x0, x1, round);
  mb.append(local, basis([0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]));
}

const extrudeLocal = (mb: MeshBuilder, o: P2[], h: P2[][], z0: number, z1: number, r: number) =>
  extrude(mb, o, h, z0, z1, { round0: r, round1: r * 0.3, segments: 3 });

/** Languettes à souder (cuivre étamé), instanciées ×3 : œillet à l'extrémité. */
export function buildTabs(ctx: Ctx): {
  object: THREE.Object3D;
  instanced: THREE.InstancedMesh;
  instanceLabel: (i: number) => string;
} {
  const d = dims(ctx);
  const t = d.tabs;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'tab'), () => {
    const w = t.width;
    // Contour dans le plan (x, z) : rectangle à bout arrondi, centré en x sur l'œillet.
    const x0 = t.x0 + 1.2 - t.eyeletX;
    const x1 = t.x1 - t.eyeletX;
    const pts: P2[] = [];
    const tip = w / 2;
    pts.push([x0, -w / 2], [x0, w / 2]);
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI / 2 + (k / 12) * Math.PI;
      pts.push([x1 + tip + tip * Math.cos(a), tip * Math.sin(a)]);
    }
    const hole = circle(0, 0, 0.7 * d.s, 20);
    const local = new MeshBuilder();
    extrude(local, pts.reverse(), [hole], -t.t / 2, t.t / 2, { round0: 0.08, round1: 0.08, segments: 2 });
    const mb = new MeshBuilder();
    // (x, z, épaisseur) → (x, z, y) : plan de la languette horizontal.
    mb.append(local, basis([0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]));
    return mb;
  });
  const matrices = t.z.map((z) => new THREE.Matrix4().makeTranslation(t.eyeletX * MM, t.y * MM, z * MM));
  const inst = instanced(geo, ctx.materials.get('tin'), matrices, 'rearBell.tabs');
  const g = group('Languettes');
  g.add(inst);
  return { object: g, instanced: inst, instanceLabel: (i) => `Languette de phase ${['A', 'B', 'C'][i]}` };
}
