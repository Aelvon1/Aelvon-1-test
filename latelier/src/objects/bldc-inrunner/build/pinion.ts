/**
 * Pignon moteur : denture droite en développante de cercle (20°), chanfreins de tête, moyeu
 * percé et taraudé M3 radialement pour la vis sans tête qui serre sur le méplat de l'arbre.
 *
 * Le trou radial est modélisé exactement : la surface du moyeu autour du trou est un « patch »
 * polaire posé sur le cylindre (anneaux interpolés entre le bord du trou — intersection de deux
 * cylindres — et un carré raccordé aux bandes de révolution voisines), puis la paroi du trou
 * relie le moyeu à l'alésage. Le filetage intérieur réel est en géométrie fine.
 *
 * Approximation : la surface de l'alésage n'est pas percée à l'endroit du trou (elle est cachée par
 * l'arbre ; pignon seul, le trou paraît borgne).
 */
import * as THREE from 'three/webgpu';
import { gearContour } from '../sections';
import { circle } from '../profile2d';
import { cachedGeometry, dims, geoKey, group, mesh, segs, type Ctx } from './common';
import {
  basis,
  extrude,
  MeshBuilder,
  MM,
  revolve,
  revolveInner,
  roundedProfile,
  threadSurface,
} from './geom';
import { SECTION_TO_MOTOR } from './can';
import { setScrewGeometry } from './fasteners';

/** Rayon du trou taraudé (grand diamètre M3) et rayon d'alésage. */
const HOLE_R = 1.5;

export function buildPinion(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const p = d.pinion;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'pinion'), () => {
    const mb = new MeshBuilder();
    const boreR = d.shaftR + 0.01;
    // Denture.
    const gear = new MeshBuilder();
    const contour = gearContour(p.teeth, p.module, [6, 8, 12, 16][ctx.quality]!, 0.06 * p.module * 4);
    extrude(gear, contour, [circle(0, 0, boreR, segs(ctx, 48))], p.gearX0, p.gearX1, {
      round0: 0.12 * p.module,
      round1: 0.16 * p.module,
      segments: 2,
    });
    mb.append(gear, SECTION_TO_MOTOR);
    hubWithHole(mb, ctx);
    // Alésage du moyeu (normales vers l'axe).
    const bore = new MeshBuilder();
    revolveInner(
      bore,
      [
        [0, boreR + 0.15],
        [0.15, boreR],
        [p.gearX0 - p.x0 + 0.02, boreR],
      ],
      segs(ctx, 48),
    );
    mb.append(bore, basis([p.x0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]));
    return mb;
  });
  const o = group('Pignon', 0, d.axisY, 0);
  o.add(mesh(geo, ctx.materials.get('steel.ground'), 'pinion.body'));
  return o;
}

/** Moyeu cylindrique percé radialement (trou en θ = 0, vers +Y). */
function hubWithHole(mb: MeshBuilder, ctx: Ctx): void {
  const d = dims(ctx);
  const p = d.pinion;
  const R = p.hubR;
  const boreR = d.shaftR + 0.01;
  const N = Math.max(24, Math.round(segs(ctx, 64) / 4) * 4);
  const dPhi = (2 * Math.PI) / N;
  // Demi-largeur angulaire du patch (multiple du pas) : au moins le trou + 40 %.
  const m = Math.max(2, Math.ceil(Math.asin(Math.min(0.95, (HOLE_R * 1.45) / R)) / dPhi));
  const beta = m * dPhi;
  const sx = p.setScrewX;
  const a = Math.max(HOLE_R * 1.45, R * Math.sin(beta));
  const K = 2 * m; // points par côté axial du patch
  // Bande arrière (face d'extrémité arrondie) et bande avant (jusqu'à la face de la denture).
  revolve(
    mb,
    roundedProfile(
      [
        [p.x0, boreR + 0.15],
        [p.x0, R, 0.3],
        [sx - a, R],
      ],
      0.3,
    ),
    { segments: N },
  );
  revolve(
    mb,
    roundedProfile(
      [
        [sx + a, R],
        [p.gearX0 + 0.02, R],
      ],
      0.3,
    ),
    { segments: N },
  );
  // Bande médiane hors patch.
  const mid: [number, number][] = [];
  for (let k = 0; k <= K; k++) mid.push([sx - a + (2 * a * k) / K, R]);
  revolve(mb, mid, { segments: N - 2 * m, phi0: beta, sweep: 2 * Math.PI - 2 * beta });
  // Patch polaire : contour carré (angles de la grille, abscisses de la bande médiane).
  type PP = { phi: number; x: number };
  const square: PP[] = [];
  for (let k = 0; k < 2 * m; k++) square.push({ phi: beta, x: sx - a + (2 * a * k) / K }); // bord droit (φ = β), x croissant
  for (let k = 0; k < 2 * m; k++) square.push({ phi: beta - k * dPhi, x: sx + a }); // bord avant, φ décroissant
  for (let k = 0; k < 2 * m; k++) square.push({ phi: -beta, x: sx + a - (2 * a * k) / K }); // bord gauche
  for (let k = 0; k < 2 * m; k++) square.push({ phi: -beta + k * dPhi, x: sx - a }); // bord arrière
  const M = square.length;
  // Angle polaire de chaque point du carré dans le plan déroulé (s = Rφ, x), départ à φ = β, x = sx − a.
  const polar = square.map((q) => Math.atan2(q.x - sx, R * q.phi));
  const hole = polar.map((al) => {
    const l = HOLE_R * Math.cos(al);
    return { phi: Math.asin(l / R), x: sx + HOLE_R * Math.sin(al), l, t: HOLE_R * Math.sin(al), al };
  });
  const rings = 5;
  const base = mb.vertexCount;
  for (let r = 0; r <= rings; r++) {
    const f = r / rings;
    // Répartition resserrée près du trou (arête du perçage).
    const g = f * f * 0.6 + f * 0.4;
    for (let j = 0; j < M; j++) {
      const phi = hole[j]!.phi + (square[j]!.phi - hole[j]!.phi) * g;
      const x = hole[j]!.x + (square[j]!.x - hole[j]!.x) * g;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      mb.vertex(x, R * c, R * s, 0, c, s, phi / (2 * Math.PI), x);
    }
  }
  for (let r = 0; r < rings; r++)
    for (let j = 0; j < M; j++) {
      const a0 = base + r * M + j;
      const a1 = base + r * M + ((j + 1) % M);
      mb.quad(a0, a1, a1 + M, a0 + M);
    }
  // Paroi du trou : du moyeu à l'alésage, normales vers l'axe du trou.
  const wall = base + (rings + 1) * M;
  const rowsW = 4;
  for (let r = 0; r <= rowsW; r++) {
    for (let j = 0; j < M; j++) {
      const h = hole[j]!;
      const hOut = Math.sqrt(R * R - h.l * h.l);
      const hIn = Math.sqrt(Math.max(0, boreR * boreR - h.l * h.l));
      const y = hOut + (hIn - hOut) * (r / rowsW);
      mb.vertex(h.x, y, h.l, -Math.sin(h.al), 0, -Math.cos(h.al), j / M, r / rowsW);
    }
  }
  for (let r = 0; r < rowsW; r++)
    for (let j = 0; j < M; j++) {
      const a0 = wall + r * M + j;
      const a1 = wall + r * M + ((j + 1) % M);
      mb.quad(a0, a1, a1 + M, a0 + M);
    }
}

/** Détail du pignon : filetage M3 réel du trou de vis sans tête. */
export function buildPinionDetail(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const p = d.pinion;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'pinion-thread'), () => {
    const local = new MeshBuilder();
    const boreR = d.shaftR + 0.01;
    threadSurface(local, {
      majorR: HOLE_R - 0.004,
      pitch: 0.5,
      z0: Math.sqrt(boreR * boreR) + 0.05,
      z1: Math.sqrt(p.hubR * p.hubR - HOLE_R * HOLE_R) - 0.05,
      internal: true,
      segmentsPerTurn: segs(ctx, 28),
      profileSamples: 12,
    });
    const mb = new MeshBuilder();
    // Axe du filet (Z local) → +Y ; X local → Z ; Y local → X.
    mb.append(local, basis([p.setScrewX, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]));
    return mb;
  });
  const g = new THREE.Group();
  g.name = 'Filetage M3 du moyeu';
  g.add(mesh(geo, ctx.materials.get('steel.ground'), 'pinion.thread'));
  return g;
}

/** Vis sans tête M3 à bout cuvette (acier bruni), axe radial +Y ; pivot sur l'axe de la vis. */
export function buildSetScrew(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const p = d.pinion;
  const geo = setScrewGeometry(ctx, p.setScrewL);
  // Bout cuvette en appui sur le méplat de l'arbre (cote dérivée, voir `params.ts`).
  const top = p.setScrewTop;
  const o = new THREE.Group();
  o.name = 'Vis sans tête M3';
  const m = mesh(geo, ctx.materials.get('steel.blackoxide'), 'pinion.setscrew');
  // Axe local +X → +Y (sortie radiale).
  m.rotation.z = Math.PI / 2;
  o.add(m);
  o.position.set(p.setScrewX * MM, top * MM, 0);
  return o;
}
