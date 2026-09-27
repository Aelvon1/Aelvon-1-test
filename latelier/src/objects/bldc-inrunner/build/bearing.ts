/**
 * Roulement rigide à billes blindé (ZZ) : bague extérieure et bague intérieure (chemins de
 * roulement toriques, rayon de gorge 0,52 × Ø bille), deux flasques de protection embouties
 * serties dans les chambrages de la bague extérieure, cage à ruban (deux demi-cages ondulées
 * rivetées) et billes (instanciées, nombre réel).
 * Repère local : axe X, centre du roulement à l'origine.
 */
import * as THREE from 'three/webgpu';
import { cachedGeometry, dims, geoKey, group, instanced, mesh, segs, type Ctx } from './common';
import {
  basis,
  MeshBuilder,
  MM,
  revolve,
  roundedProfile,
  sphere,
  tube,
  type RevPoint,
  type V3,
} from './geom';
import type { BldcDims } from '../params';

/** Cotes internes du roulement (mm). */
export function bearingGeometry(d: BldcDims) {
  const b = d.bearing;
  const Dw = b.ballD;
  const Rpw = b.pitchR;
  const rg = 0.52 * Dw;
  const Ro = b.D / 2;
  const Ri = b.d / 2;
  const outerLand = Rpw + 0.32 * Dw;
  const innerLand = Rpw - 0.32 * Dw;
  const recessR = Math.min(Ro - 0.35, Rpw + 0.62 * Dw);
  const recessDepth = Math.min(0.45, b.B * 0.11);
  return { b, Dw, Rpw, rg, Ro, Ri, outerLand, innerLand, recessR, recessDepth, half: b.B / 2 };
}

/** Arc de gorge (x de +xg à −xg), rayon de centre `c`, bombé vers +r (sign = 1) ou −r. */
function grooveArc(
  c: number,
  rg: number,
  xg: number,
  sign: 1 | -1,
  from: 1 | -1,
  n: number,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 1; k < n; k++) {
    const x = from * xg * (1 - (2 * k) / n);
    pts.push([x, c + sign * Math.sqrt(Math.max(0, rg * rg - x * x))]);
  }
  return pts;
}

export function buildOuterRing(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const g = bearingGeometry(d);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'bearing-outer'), () => {
    const c = g.Rpw + g.Dw / 2 + 0.004 - g.rg;
    const xg = Math.sqrt(Math.max(0, g.rg * g.rg - (g.outerLand - c) ** 2));
    const h = g.half;
    const dep = g.recessDepth;
    const nodes: [number, number, number?][] = [
      [0, g.Ro],
      [h, g.Ro, 0.12],
      [h, g.recessR, 0.05],
      [h - dep, g.recessR, 0.04],
      [h - dep, g.outerLand, 0.05],
      [xg, g.outerLand, 0.06],
      ...grooveArc(c, g.rg, xg, 1, 1, 14),
      [-xg, g.outerLand, 0.06],
      [-h + dep, g.outerLand, 0.05],
      [-h + dep, g.recessR, 0.04],
      [-h, g.recessR, 0.05],
      [-h, g.Ro, 0.12],
      [0, g.Ro],
    ];
    const mb = new MeshBuilder();
    revolve(mb, roundedProfile(nodes, 0.2, 3), { segments: segs(ctx, 64) });
    return mb;
  });
  const o = group('Bague extérieure');
  o.add(mesh(geo, ctx.materials.get('steel.ground'), 'bearing.outer'));
  return o;
}

export function buildInnerRing(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const g = bearingGeometry(d);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'bearing-inner'), () => {
    const c = g.Rpw - g.Dw / 2 - 0.004 + g.rg;
    const xg = Math.sqrt(Math.max(0, g.rg * g.rg - (c - g.innerLand) ** 2));
    const h = g.half;
    const nodes: [number, number, number?][] = [
      [0, g.Ri],
      [-h, g.Ri, 0.1],
      [-h, g.innerLand, 0.08],
      [-xg, g.innerLand, 0.06],
      ...grooveArc(c, g.rg, xg, -1, -1, 14),
      [xg, g.innerLand, 0.06],
      [h, g.innerLand, 0.08],
      [h, g.Ri, 0.1],
      [0, g.Ri],
    ];
    const mb = new MeshBuilder();
    revolve(mb, roundedProfile(nodes, 0.2, 3), { segments: segs(ctx, 56) });
    return mb;
  });
  const o = group('Bague intérieure');
  o.add(mesh(geo, ctx.materials.get('steel.ground'), 'bearing.inner'));
  return o;
}

/** Flasque de protection emboutie (côté +X si `side` = 1). */
export function buildShield(ctx: Ctx, side: 1 | -1): THREE.Object3D {
  const d = dims(ctx);
  const g = bearingGeometry(d);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'bearing-shield'), () => {
    const t = 0.18;
    const xs = g.half - g.recessDepth + t / 2 + 0.02;
    const xo = xs + t / 2;
    const xi = xs - t / 2;
    const rIn = g.innerLand + 0.07;
    const rOut = g.recessR - 0.01;
    const rStep = g.Rpw + 0.05;
    const dish = -0.12;
    const nodes: RevPoint[] = roundedProfile(
      [
        [xo, rOut - 0.05],
        [xo, rStep + 0.3, 0.12],
        [xo + dish, rStep, 0.12],
        [xo + dish, rIn, 0.05],
        [xi + dish, rIn, 0.05],
        [xi + dish, rStep, 0.12],
        [xi, rStep + 0.3, 0.12],
        [xi, rOut, 0.04],
        [xo, rOut, 0.04],
        [xo, rOut - 0.05],
      ],
      0.15,
      3,
    );
    const mb = new MeshBuilder();
    revolve(mb, nodes, { segments: segs(ctx, 64) });
    return mb;
  });
  const o = group(
    side > 0 ? 'Flasque de protection (côté extérieur)' : 'Flasque de protection (côté intérieur)',
  );
  const m = mesh(geo, ctx.materials.get('steel.zinc'), 'bearing.shield');
  if (side < 0) m.rotation.z = Math.PI;
  o.add(m);
  return o;
}

/** Cage à ruban : deux demi-cages ondulées (poches sphériques) réunies par des rivets. */
export function buildCage(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const g = bearingGeometry(d);
  const Z = d.bearing.ballCount;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'bearing-cage'), () => {
    const mb = new MeshBuilder();
    const rp = g.Dw / 2 + 0.06;
    const e = 0.09;
    const t = 0.13;
    const W = 0.55 * g.Dw;
    const n = Z * segs(ctx, 28);
    const circ = 2 * Math.PI * g.Rpw;
    const pitch = circ / Z;
    // Profil de section (rectangle arrondi W × t) dans le repère (radial, normale).
    const prof: [number, number][] = [];
    const cr = t / 2;
    const corner = (cx: number, cy: number, a0: number) => {
      for (let k = 0; k <= 3; k++) {
        const a = a0 + (k / 3) * (Math.PI / 2);
        prof.push([cx + cr * Math.cos(a), cy + cr * Math.sin(a)]);
      }
    };
    corner(W / 2 - cr, 0, -Math.PI / 2);
    corner(W / 2 - cr, 0, 0);
    corner(-W / 2 + cr, 0, Math.PI / 2);
    corner(-W / 2 + cr, 0, Math.PI);
    for (const sgn of [1, -1] as const) {
      const pts = new Float32Array((n + 1) * 3);
      const N: V3[] = [];
      const B: V3[] = [];
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * circ;
        const k = Math.round(s / pitch);
        const ds = s - k * pitch;
        const c = Math.sqrt(Math.max(0, rp * rp - ds * ds));
        const k2 = 0.1;
        const x = sgn * (e + c + Math.sqrt((c - e) ** 2 + k2 * k2)) * 0.5;
        const a = s / g.Rpw;
        pts[i * 3] = x;
        pts[i * 3 + 1] = g.Rpw * Math.cos(a);
        pts[i * 3 + 2] = g.Rpw * Math.sin(a);
      }
      for (let i = 0; i <= n; i++) {
        const a = ((i / n) * circ) / g.Rpw;
        const radial: V3 = [0, Math.cos(a), Math.sin(a)];
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(n, i + 1);
        let tx = pts[i1 * 3]! - pts[i0 * 3]!;
        let ty = pts[i1 * 3 + 1]! - pts[i0 * 3 + 1]!;
        let tz = pts[i1 * 3 + 2]! - pts[i0 * 3 + 2]!;
        const l = Math.hypot(tx, ty, tz) || 1;
        tx /= l;
        ty /= l;
        tz /= l;
        // B = T × N (normale au ruban dans la surface du cylindre primitif).
        const bx = ty * radial[2] - tz * radial[1];
        const by = tz * radial[0] - tx * radial[2];
        const bz = tx * radial[1] - ty * radial[0];
        const bl = Math.hypot(bx, by, bz) || 1;
        N.push(radial);
        B.push([bx / bl, by / bl, bz / bl]);
      }
      tube(mb, pts, n + 1, { radialSegments: prof.length, profile: prof, radius: 1, frames: { N, B } });
    }
    // Rivets entre les poches.
    for (let k = 0; k < Z; k++) {
      const a = ((k + 0.5) * 2 * Math.PI) / Z;
      const head = e + t + 0.05;
      const r = new MeshBuilder();
      revolve(
        r,
        roundedProfile(
          [
            [-head - 0.06, 0],
            [-head - 0.06, 0.22, 0.08],
            [-head + 0.03, 0.26, 0.04],
            [-head + 0.03, 0.14],
            [head - 0.03, 0.14],
            [head - 0.03, 0.26, 0.04],
            [head + 0.06, 0.22, 0.08],
            [head + 0.06, 0],
          ],
          0.1,
          2,
        ),
        { segments: 10 },
      );
      mb.append(r, basis([0, g.Rpw * Math.cos(a), g.Rpw * Math.sin(a)], [1, 0, 0], [0, 1, 0], [0, 0, 1]));
    }
    return mb;
  });
  const o = group('Cage');
  o.add(mesh(geo, ctx.materials.get('steel.zinc'), 'bearing.cage'));
  return o;
}

/** Billes (acier 100Cr6 poli), instanciées ; pivot de chaque instance = centre de la bille. */
export function buildBalls(ctx: Ctx): {
  object: THREE.Object3D;
  instanced: THREE.InstancedMesh;
  instanceLabel: (i: number) => string;
} {
  const d = dims(ctx);
  const g = bearingGeometry(d);
  const Z = d.bearing.ballCount;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'ball'), () => {
    const mb = new MeshBuilder();
    sphere(mb, g.Dw / 2, segs(ctx, 28), segs(ctx, 18));
    return mb;
  });
  const matrices = Array.from({ length: Z }, (_, k) => {
    const a = (k * 2 * Math.PI) / Z;
    return new THREE.Matrix4().makeTranslation(0, g.Rpw * Math.cos(a) * MM, g.Rpw * Math.sin(a) * MM);
  });
  const inst = instanced(geo, ctx.materials.get('steel.chrome'), matrices, 'bearing.balls');
  const o = group('Billes');
  o.add(inst);
  return { object: o, instanced: inst, instanceLabel: (i) => `Bille n° ${i + 1} / ${Z}` };
}

/** Nœud du sous-ensemble roulement (centré sur la portée). */
export function buildBearingNode(ctx: Ctx, which: 'front' | 'rear'): THREE.Object3D {
  const d = dims(ctx);
  return group(
    which === 'front' ? 'Roulement avant' : 'Roulement arrière',
    which === 'front' ? d.bearing.frontX : d.bearing.rearX,
  );
}
