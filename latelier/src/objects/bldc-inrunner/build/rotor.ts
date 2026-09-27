/**
 * Rotor : arbre en acier rectifié (méplat de vis sans tête, gorge de circlip, chanfreins),
 * culasse (acier doux, moyeu avant jusqu'au roulement), aimants NdFeB nickelés en segments
 * d'arc (instanciés, un par pôle), frette de maintien en fibre de verre tissée.
 */
import * as THREE from 'three/webgpu';
import type { PartBuild } from '../../types';
import { magnetSection } from '../sections';
import { own } from '../materials';
import { cachedGeometry, dims, geoKey, group, instanced, mesh, segs, type Ctx } from './common';
import { annulus, extrude, gridSurface, MeshBuilder, MM, revolve, roundedProfile, type V3 } from './geom';
import { SECTION_TO_MOTOR } from './can';

/** Arbre : surface paramétrique r(φ, x) (méplat, gorge, chanfreins), UV : u autour de l'arbre. */
export function buildShaft(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'shaft'), () => {
    const R = d.shaftR;
    const x0 = d.shaftX0;
    const x1 = d.shaftX1;
    const ch = 0.3;
    const f = d.flat;
    const runout = 1.6 * d.s;
    const gw = d.circlip.s + 0.06;
    const gr = d.circlip.d2 / 2;
    // Profondeur du méplat (sortie de fraise circulaire aux deux bouts).
    const flatDepth = (x: number) => {
      if (x < f.x0 - runout || x > f.x1 + runout) return 0;
      const edge = x < f.x0 ? f.x0 - x : x > f.x1 ? x - f.x1 : 0;
      return f.depth * Math.sqrt(Math.max(0, 1 - (edge / runout) ** 2));
    };
    const envelope = (x: number) => {
      let r = R;
      r = Math.min(r, R - ch + (x - x0), R - ch + (x1 - x));
      // Gorge de circlip (fond arrondi).
      const g = Math.abs(x - d.circlip.x);
      if (g < gw / 2 + 0.05) {
        const u = Math.min(1, Math.max(0, (g - gw / 2 + 0.05) / 0.1));
        r = Math.min(r, gr + (R - gr) * u * u * (3 - 2 * u));
      }
      return r;
    };
    const radiusAt = (phi: number, x: number) => {
      const env = envelope(x);
      const depth = flatDepth(x);
      if (depth <= 0) return env;
      const c = Math.cos(phi - f.angle);
      if (c <= 0) return env;
      return Math.min(env, (R - depth) / c);
    };
    // Abscisses : pas régulier + resserrement près des singularités.
    const xs = new Set<number>();
    const step = [1.2, 0.8, 0.5, 0.35][ctx.quality]!;
    for (let x = x0; x <= x1; x += step) xs.add(+x.toFixed(4));
    const dense = (c: number, w: number, n: number) => {
      for (let k = 0; k <= n; k++) xs.add(+(c - w + (2 * w * k) / n).toFixed(4));
    };
    dense(x0 + ch / 2, ch, 6);
    dense(x1 - ch / 2, ch, 6);
    dense(d.circlip.x, gw, 10);
    dense(f.x0 - runout / 2, runout, 10);
    dense(f.x1 + runout / 2, runout, 10);
    xs.add(x0);
    xs.add(x1);
    const xList = [...xs].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
    const nPhi = segs(ctx, 72);
    const mb = new MeshBuilder();
    gridSurface(
      mb,
      nPhi,
      xList.length - 1,
      (u, v): V3 => {
        // Abscisse interpolée (fonction continue de v : différences finies correctes).
        const fi = Math.min(xList.length - 1.000001, Math.max(0, v * (xList.length - 1)));
        const i0 = Math.floor(fi);
        const x = xList[i0]! + (xList[Math.min(xList.length - 1, i0 + 1)]! - xList[i0]!) * (fi - i0);
        const phi = u * Math.PI * 2;
        const r = radiusAt(phi, x);
        return [x, r * Math.cos(phi), r * Math.sin(phi)];
      },
      { wrapU: true, flip: (p, n) => n[1] * p[1] + n[2] * p[2] < 0 },
    );
    annulus(mb, x0, 0, R - ch, nPhi, -1);
    annulus(mb, x1, 0, R - ch, nPhi, 1);
    return mb;
  });
  const o = group('Arbre');
  o.add(mesh(geo, ctx.materials.get('steel.ground'), 'rotor.shaft'));
  return o;
}

/** Culasse rotorique : tube d'acier doux emmanché sur l'arbre, moyeu avant jusqu'au roulement. */
export function buildYoke(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'yoke'), () => {
    const hubEnd = d.bearing.frontX - d.bearing.B / 2 - 0.02;
    const r0 = d.shaftR + 0.002;
    const mb = new MeshBuilder();
    // Profil fermé (matière à droite) : alésage, face arrière, extérieur, moyeu avant.
    revolve(
      mb,
      roundedProfile(
        [
          [(d.yokeX0 + hubEnd) / 2, r0],
          [d.yokeX0, r0, 0.1],
          [d.yokeX0, d.magnetInnerR, 0.25],
          [d.yokeX1, d.magnetInnerR, 0.25],
          [d.yokeX1, d.yokeHubR, 0.15],
          [hubEnd, d.yokeHubR, 0.12],
          [hubEnd, r0, 0.1],
          [(d.yokeX0 + hubEnd) / 2, r0],
        ],
        4,
      ),
      { segments: segs(ctx, 64) },
    );
    return mb;
  });
  const o = group('Culasse');
  o.add(mesh(geo, ctx.materials.get('steel.stainless'), 'rotor.yoke'));
  return o;
}

/** Aimants en arc (NdFeB nickelé), instanciés ; pivot = centre de chaque segment. */
export function buildMagnets(ctx: Ctx): PartBuild {
  const d = dims(ctx);
  const poles = d.winding.spec.poles;
  const rMid = (d.magnetInnerR + d.magnetOuterR) / 2;
  const halfAngle = Math.PI / poles - d.magnetGapAngle / 2;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'magnet'), () => {
    const sec = magnetSection(d.magnetInnerR, d.magnetOuterR, halfAngle, 0.22 * d.s, 0.15).map(
      ([a, b]) => [a - rMid, b] as [number, number],
    );
    const local = new MeshBuilder();
    const len = d.magnetX1 - d.magnetX0;
    extrude(local, sec, [], -len / 2, len / 2, { round0: 0.18, round1: 0.18, segments: 3 });
    const mb = new MeshBuilder();
    mb.append(local, SECTION_TO_MOTOR);
    return mb;
  });
  const xc = (d.magnetX0 + d.magnetX1) / 2;
  const matrices = Array.from({ length: poles }, (_, k) => {
    const a = (k * 2 * Math.PI) / poles;
    const m = new THREE.Matrix4().makeRotationX(a);
    m.setPosition(xc * MM, rMid * Math.cos(a) * MM, rMid * Math.sin(a) * MM);
    return m;
  });
  const inst = instanced(geo, ctx.materials.get('nickel'), matrices, 'rotor.magnets');
  const o = group('Aimants');
  o.add(inst);
  return {
    object: o,
    instanced: inst,
    instanceLabel: (i) => `Aimant n° ${i + 1} (pôle ${i % 2 === 0 ? 'Nord' : 'Sud'} vers l’extérieur)`,
  };
}

/** Frette : manchon mince en fibre de verre tissée imprégnée ; UV en mm pour le tissage. */
export function buildSleeve(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'sleeve'), () => {
    const x0 = d.magnetX0 - 0.1;
    const x1 = d.magnetX1 + 0.1;
    const r0 = d.magnetOuterR + 0.005;
    const r1 = d.rotorR;
    const mb = new MeshBuilder();
    revolve(
      mb,
      roundedProfile(
        [
          [(x0 + x1) / 2, r1],
          [x1, r1, 0.08],
          [x1, r0, 0.05],
          [x0, r0, 0.05],
          [x0, r1, 0.08],
          [(x0 + x1) / 2, r1],
        ],
        4,
        3,
      ),
      { segments: segs(ctx, 96), uRepeat: 2 * Math.PI * r1, vLength: true },
    );
    return mb;
  });
  const o = group('Frette');
  o.add(mesh(geo, ctx.materials.get(own('sleeveWeave')), 'rotor.sleeve'));
  return o;
}
