/**
 * Visserie et arrêts : vis CHC (BTR, ISO 4762) à tête moletée et six pans creux, vis sans tête
 * à bout cuvette (ISO 4029), vis cylindriques cruciformes de platine, circlip DIN 471, cales de
 * réglage, rondelle ondulée de précharge.
 *
 * Toutes les vis portent un filetage hélicoïdal RÉEL (profil ISO 60° balayé le long de l'hélice,
 * sortie de filet et chanfrein d'entrée) : quelques milliers de triangles par vis, instanciées.
 * Repère local d'une vis : axe +X, dessous de tête (ou face supérieure d'une vis sans tête) en
 * x = 0, pointe vers −X. Le pivot de dévissage est donc sur l'axe.
 */
import * as THREE from 'three/webgpu';
import { circle, roundedPath, type P2 } from '../profile2d';
import { circlipSection } from '../sections';
import { cachedGeometry, dims, geoKey, segs, type Ctx } from './common';
import {
  annulus,
  basis,
  extrude,
  gridSurface,
  MeshBuilder,
  planarFace,
  planeX,
  revolve,
  roundedProfile,
  threadSurface,
  type V3,
} from './geom';
import { SECTION_TO_MOTOR } from './can';

const Z_TO_X = basis([0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]);

/** Hexagone (six pans creux) d'ouverture `s` sur plats, coins légèrement arrondis. */
function hexagon(s: number, angle = 0): P2[] {
  const R = s / Math.sqrt(3);
  return roundedPath(
    Array.from({ length: 6 }, (_, k) => {
      const a = angle + (k * Math.PI) / 3;
      return { p: [R * Math.cos(a), R * Math.sin(a)] as P2, round: R * 0.08 };
    }),
    true,
    1,
    2,
  );
}

/** Empreinte cruciforme simplifiée (deux fentes croisées à fond plat). */
function cross(len: number, w: number): P2[] {
  const a = len / 2;
  const b = w / 2;
  return roundedPath(
    [
      { p: [a, -b], round: 0.05 },
      { p: [a, b], round: 0.05 },
      { p: [b, b], round: 0.04 },
      { p: [b, a], round: 0.05 },
      { p: [-b, a], round: 0.05 },
      { p: [-b, b], round: 0.04 },
      { p: [-a, b], round: 0.05 },
      { p: [-a, -b], round: 0.05 },
      { p: [-b, -b], round: 0.04 },
      { p: [-b, -a], round: 0.05 },
      { p: [b, -a], round: 0.05 },
      { p: [b, -b], round: 0.04 },
    ],
    true,
    1,
    2,
  );
}

/** Empreinte (six pans ou croix) : parois et fond plat, ouverte sur la face x = x0 vers −X. */
function recess(mb: MeshBuilder, shape: P2[], x0: number, depth: number): void {
  const n = shape.length;
  const base = mb.vertexCount;
  let area = 0;
  for (let i = 0; i < n; i++)
    area += shape[i]![0] * shape[(i + 1) % n]![1] - shape[(i + 1) % n]![0] * shape[i]![1];
  const sgn = area > 0 ? -1 : 1; // normales vers l'intérieur de l'empreinte (le vide)
  for (let i = 0; i <= n; i++) {
    const a = shape[(i - 1 + n) % n]!;
    const b = shape[(i + 1) % n]!;
    const p = shape[i % n]!;
    const nx = (b[1] - a[1]) * sgn;
    const ny = -(b[0] - a[0]) * sgn;
    mb.vertex(x0, p[0], p[1], 0, nx, ny, i / n, 0);
    mb.vertex(x0 - depth, p[0], p[1], 0, nx, ny, i / n, 1);
  }
  for (let i = 0; i < n; i++) mb.quad(base + i * 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2);
  planarFace(mb, shape, [], planeX(x0 - depth, 1));
}

/** Tige filetée : filet réel, sortie de filet sous tête, chanfrein et face de pointe. */
function threadedShank(
  mb: MeshBuilder,
  d: number,
  pitch: number,
  length: number,
  top: number,
  q: number,
  runout = true,
): void {
  const h = 0.6134 * pitch;
  const majorR = d / 2 - 0.01;
  const minorR = majorR - h;
  const tipR = minorR - 0.06;
  const zTip = -length;
  const local = new MeshBuilder();
  threadSurface(local, {
    majorR,
    pitch,
    z0: zTip,
    z1: top,
    segmentsPerTurn: q,
    profileSamples: 12,
    envelope: (z) => {
      let r = tipR + (z - zTip); // chanfrein 45° d'entrée
      if (runout) {
        const u = Math.min(1, Math.max(0, (top - z) / (2 * pitch)));
        r = Math.min(r, minorR + (majorR - minorR) * u * u * (3 - 2 * u));
      } else {
        r = Math.min(r, tipR + (top - z));
      }
      return r;
    },
  });
  mb.append(local, Z_TO_X);
  annulus(mb, zTip, 0, tipR, q, -1);
}

/** Vis CHC ISO 4762 (tête moletée, six pans creux). */
export function screwGeometry(
  ctx: Ctx,
  key: string,
  spec: { d: number; pitch: number; headD: number; headH: number; length: number; keyS: number },
): THREE.BufferGeometry {
  return cachedGeometry(ctx, geoKey(ctx, 'screw', key), () => {
    const mb = new MeshBuilder();
    const N = segs(ctx, 40);
    const R = spec.headD / 2;
    const top = spec.headH;
    const minorR = spec.d / 2 - 0.6134 * spec.pitch;
    const neckR = minorR + 0.02;
    // Dessous de tête et arête basse.
    revolve(
      mb,
      roundedProfile(
        [
          [-0.3, neckR],
          [0, neckR, 0.08],
          [0, R, 0.15],
          [0.35, R],
        ],
        0.1,
      ),
      { segments: N },
    );
    // Flanc moleté (stries droites qui s'estompent aux arêtes).
    const knurl = Math.round((Math.PI * spec.headD) / 0.28);
    gridSurface(
      mb,
      N * 4,
      6,
      (u, v): V3 => {
        const x = 0.35 + (top - 0.35 - 0.3) * v;
        const fade = Math.sin(Math.PI * v);
        const r = R - 0.035 * fade * (0.5 + 0.5 * Math.cos(knurl * u * Math.PI * 2));
        const a = u * Math.PI * 2;
        return [x, r * Math.cos(a), r * Math.sin(a)];
      },
      { wrapU: true, flip: (p, n) => n[1] * p[1] + n[2] * p[2] < 0 },
    );
    // Arête haute chanfreinée, face supérieure et empreinte six pans.
    const faceR = R - 0.28;
    revolve(
      mb,
      roundedProfile(
        [
          [top - 0.3, R],
          [top, R, 0.22],
          [top, faceR],
        ],
        0.1,
      ),
      { segments: N },
    );
    const hex = hexagon(spec.keyS, Math.PI / 6);
    planarFace(mb, circle(0, 0, faceR, N), [hex], planeX(top, 1));
    recess(mb, hex, top, spec.headH * 0.5);
    threadedShank(mb, spec.d, spec.pitch, spec.length, -0.3, segs(ctx, 30));
    return mb;
  });
}

/** Vis sans tête à bout cuvette (ISO 4029), face supérieure en x = 0. */
export function setScrewGeometry(ctx: Ctx, length: number): THREE.BufferGeometry {
  return cachedGeometry(ctx, geoKey(ctx, 'setscrew', length), () => {
    const mb = new MeshBuilder();
    const d = 3;
    const pitch = 0.5;
    const q = segs(ctx, 30);
    const majorR = d / 2 - 0.01;
    const minorR = majorR - 0.6134 * pitch;
    const topR = minorR - 0.1;
    // Filet sur toute la longueur, chanfrein aux deux bouts.
    const local = new MeshBuilder();
    threadSurface(local, {
      majorR,
      pitch,
      z0: -length,
      z1: 0,
      segmentsPerTurn: q,
      profileSamples: 12,
      envelope: (z) => Math.min(topR + (z + length), topR - z),
    });
    mb.append(local, Z_TO_X);
    const hex = hexagon(1.5, 0);
    planarFace(mb, circle(0, 0, topR, q), [hex], planeX(0, 1));
    recess(mb, hex, 0, Math.min(1.3, length * 0.55));
    // Bout cuvette : couronne plane et creux conique.
    const cupR = 0.62;
    planarFace(mb, circle(0, 0, topR, q), [circle(0, 0, cupR, q)], planeX(-length, -1));
    // Parcours de l'axe vers le bord : normales tournées vers le creux (vers −X).
    revolve(
      mb,
      roundedProfile(
        [
          [-length + 0.35, 0],
          [-length, cupR],
        ],
        0.05,
      ),
      { segments: q },
    );
    return mb;
  });
}

/** Vis cylindrique cruciforme M2 de platine (tête Ø 3,5 × 1,3). */
export function panScrewGeometry(ctx: Ctx, length: number): THREE.BufferGeometry {
  return cachedGeometry(ctx, geoKey(ctx, 'pan-screw', length), () => {
    const mb = new MeshBuilder();
    const N = segs(ctx, 36);
    const R = 1.75;
    const H = 1.3;
    const neckR = 1 - 0.6134 * 0.4 + 0.02;
    const faceR = 1.05;
    revolve(
      mb,
      roundedProfile(
        [
          [-0.25, neckR],
          [0, neckR, 0.06],
          [0, R, 0.15],
          [H * 0.55, R, 0.45],
          [H, faceR + 0.2, 0.3],
          [H, faceR],
        ],
        0.08,
      ),
      { segments: N },
    );
    const x = cross(1.9, 0.45);
    planarFace(mb, circle(0, 0, faceR, N), [x], planeX(H, 1));
    recess(mb, x, H, 0.75);
    threadedShank(mb, 2, 0.4, length, -0.25, segs(ctx, 28));
    return mb;
  });
}

/** Circlip extérieur DIN 471 (acier à ressort bruni), épaisseur le long de X. */
export function circlipGeometry(ctx: Ctx): THREE.BufferGeometry {
  const d = dims(ctx);
  return cachedGeometry(ctx, geoKey(ctx, 'circlip'), () => {
    const c = d.circlip;
    const { outer, holes } = circlipSection(c.d2 / 2, c.outerR, 0.08);
    const local = new MeshBuilder();
    extrude(local, outer, holes, -c.s / 2, c.s / 2, { round0: 0.05, round1: 0.05, segments: 1 });
    const mb = new MeshBuilder();
    mb.append(local, SECTION_TO_MOTOR);
    return mb;
  });
}

/** Cale de réglage (rondelle mince rectifiée). */
export function shimGeometry(ctx: Ctx): THREE.BufferGeometry {
  const d = dims(ctx);
  return cachedGeometry(ctx, geoKey(ctx, 'shim'), () => {
    const sh = d.shims;
    const N = segs(ctx, 64);
    const local = new MeshBuilder();
    extrude(local, circle(0, 0, sh.outerR, N), [circle(0, 0, sh.innerR, N)], -sh.t / 2, sh.t / 2, {
      round0: 0.02,
      round1: 0.02,
      segments: 1,
    });
    const mb = new MeshBuilder();
    mb.append(local, SECTION_TO_MOTOR);
    return mb;
  });
}

/** Rondelle ondulée (3 ondes) : surface moyenne x = a·cos(3φ), épaisseur et chants modélisés. */
export function waveWasherGeometry(ctx: Ctx): THREE.BufferGeometry {
  const d = dims(ctx);
  return cachedGeometry(ctx, geoKey(ctx, 'wave'), () => {
    const w = d.wave;
    const mb = new MeshBuilder();
    const nu = segs(ctx, 96);
    const mid = (u: number) => w.amplitude * Math.cos(w.waves * u * Math.PI * 2);
    const point = (u: number, r: number, off: number): V3 => {
      const a = u * Math.PI * 2;
      return [mid(u) + off, r * Math.cos(a), r * Math.sin(a)];
    };
    for (const side of [-1, 1] as const) {
      gridSurface(mb, nu, 3, (u, v) => point(u, w.innerR + (w.outerR - w.innerR) * v, (side * w.t) / 2), {
        wrapU: true,
        flip: (_p, n) => n[0] * side < 0,
      });
    }
    // Chants intérieur et extérieur (demi-cylindres).
    for (const [r, sgn] of [
      [w.innerR, -1],
      [w.outerR, 1],
    ] as const) {
      gridSurface(
        mb,
        nu,
        4,
        (u, v) => {
          const t = (v - 0.5) * Math.PI;
          return point(u, r + sgn * (w.t / 2) * Math.cos(t) * 0.6, (w.t / 2) * Math.sin(t));
        },
        { wrapU: true, flip: (p, n) => (n[1] * p[1] + n[2] * p[2]) * sgn < 0 },
      );
    }
    return mb;
  });
}

/** Matrice d'instance d'une vis : position (mm), axe de sortie ±X, rotation propre (rad). */
export function screwMatrix(x: number, y: number, z: number, outward: 1 | -1, spin: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationX(spin);
  if (outward < 0) m.premultiply(new THREE.Matrix4().makeRotationZ(Math.PI));
  m.setPosition(x / 1000, y / 1000, z / 1000);
  return m;
}
