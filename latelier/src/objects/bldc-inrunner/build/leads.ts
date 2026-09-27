/**
 * Sorties de phase : soudures des languettes (ménisques d'étain qui fondent au dessoudage),
 * variante « fils » : fils silicone multibrins, connecteurs bullet mâles 4 mm en laiton et gaines
 * thermorétractables de couleur (repère de phase A jaune, B rouge, C bleu).
 */
import * as THREE from 'three/webgpu';
import type { PartBuild, PartHooks } from '../../types';
import { meltProgress } from '../../../inspection/motions';
import { cachedGeometry, dims, geoKey, group, instanced, mesh, segs, type Ctx } from './common';
import { frameAlong, MeshBuilder, MM, revolve, roundedProfile, sphere, tube, type V3 } from './geom';

/**
 * Rend une géométrie « fusible » : chaque sommet se rétracte vers le centre de sa goutte
 * (`centerOf`) quand l'étain fond. Retourne la fonction de mise à jour (progression de retrait).
 */
export function meltable(
  geometry: THREE.BufferGeometry,
  centerOf: (x: number, y: number, z: number) => V3,
): (t: number) => void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const rest = new Float32Array(pos.array as Float32Array);
  const centers = new Float32Array(rest.length);
  for (let i = 0; i < pos.count; i++)
    centers.set(centerOf(rest[i * 3]!, rest[i * 3 + 1]!, rest[i * 3 + 2]!), i * 3);
  let last = -1;
  return (t: number) => {
    const m = meltProgress(t);
    if (Math.abs(m - last) < 1e-4) return;
    last = m;
    // Affaissement (l'étain s'étale puis est aspiré) : rétraction non uniforme, un peu plus
    // rapide verticalement.
    const k = 1 - m;
    const ky = 1 - Math.min(1, m * 1.25);
    for (let i = 0; i < pos.count; i++) {
      const cx = centers[i * 3]!;
      const cy = centers[i * 3 + 1]!;
      const cz = centers[i * 3 + 2]!;
      pos.setXYZ(
        i,
        cx + (rest[i * 3]! - cx) * k,
        cy + (rest[i * 3 + 1]! - cy) * ky,
        cz + (rest[i * 3 + 2]! - cz) * k,
      );
    }
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
  };
}

/** Soudures des trois languettes (instanciées). */
export function buildJoints(ctx: Ctx): PartBuild {
  const d = dims(ctx);
  const t = d.tabs;
  const mb = new MeshBuilder();
  sphere(mb, 1, segs(ctx, 22), segs(ctx, 14), [1.35 * d.s, 0.95 * d.s, 1.15 * d.s]);
  // Géométrie propre (déformée par la fusion) : non partagée.
  const geo = mb.build();
  const melt = meltable(geo, () => [0, 0, 0]);
  const matrices = t.z.map((z) => new THREE.Matrix4().makeTranslation(t.eyeletX * MM, t.y * MM, z * MM));
  const inst = instanced(geo, ctx.materials.get('solder'), matrices, 'leads.joints');
  const o = group('Soudures des sorties', 0, d.axisY, 0);
  o.add(inst);
  const hooks: PartHooks = { onRemovalProgress: (p) => melt(p) };
  return { object: o, instanced: inst, hooks, instanceLabel: (i) => `Soudure de la phase ${'ABC'[i]}` };
}

/** Section et couleurs des fils de phase selon le format. */
function wireSpec(ctx: Ctx) {
  const d = dims(ctx);
  const small = d.params.format === '2848';
  return { r: small ? 1.2 : 1.45, core: small ? 0.65 : 0.82, awg: small ? 16 : 14 };
}

const COLORS = ['yellow', 'red', 'blue'] as const;

/** Chemin du fil de phase k (mm, repère moteur) : sous la languette, puis vers le tapis. */
export function wirePath(ctx: Ctx, k: number): { pts: number[]; end: V3; dir: V3 } {
  const d = dims(ctx);
  const t = d.tabs;
  const w = wireSpec(ctx);
  const z = t.z[k]!;
  const y = t.y - t.t / 2 - w.core - 0.05;
  const yMat = -d.axisY + w.r;
  const x0 = t.x1 - 0.6;
  const ctrl: V3[] = [
    [x0, y, z],
    [x0 - 5, y - 0.2, z * 1.05],
    [x0 - 11, y - 5, z * 1.2 + 4],
    [x0 - 16, yMat + 4, z * 1.4 + 10],
    [x0 - 22, yMat, z * 1.5 + 14],
    [x0 - 45, yMat, z * 1.6 + 16 + k * 2],
    [x0 - 62, yMat, z * 1.7 + 15 + k * 3],
  ];
  const pts: number[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]!;
    const p1 = ctrl[i]!;
    const p2 = ctrl[i + 1]!;
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]!;
    const n = 12;
    for (let s = i === 0 ? 0 : 1; s <= n; s++) {
      const u = s / n;
      for (let a = 0; a < 3; a++)
        pts.push(
          0.5 *
            (2 * p1[a]! +
              (-p0[a]! + p2[a]!) * u +
              (2 * p0[a]! - 5 * p1[a]! + 4 * p2[a]! - p3[a]!) * u * u +
              (-p0[a]! + 3 * p1[a]! - 3 * p2[a]! + p3[a]!) * u * u * u),
        );
    }
  }
  const n = pts.length / 3;
  const end: V3 = [pts[(n - 1) * 3]!, pts[(n - 1) * 3 + 1]!, pts[(n - 1) * 3 + 2]!];
  const prev: V3 = [pts[(n - 2) * 3]!, pts[(n - 2) * 3 + 1]!, pts[(n - 2) * 3 + 2]!];
  const l = Math.hypot(end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]) || 1;
  return { pts, end, dir: [(end[0] - prev[0]) / l, (end[1] - prev[1]) / l, (end[2] - prev[2]) / l] };
}

/** Fil silicone d'une phase (sous-ensemble : la gaine et le bullet sont ses pièces). */
export function buildLeadWire(ctx: Ctx, k: number): THREE.Object3D {
  const d = dims(ctx);
  const w = wireSpec(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'lead-wire', k), () => {
    const { pts } = wirePath(ctx, k);
    const mb = new MeshBuilder();
    tube(mb, pts, pts.length / 3, {
      radialSegments: segs(ctx, 18),
      radius: w.r,
      capStart: true,
      capEnd: true,
    });
    return mb;
  });
  const core = cachedGeometry(ctx, geoKey(ctx, 'lead-core', k), () => {
    // Âme dénudée étamée sous la languette, prise dans la soudure.
    const t = d.tabs;
    const y = t.y - t.t / 2 - w.core - 0.05;
    const pts = [t.eyeletX + 1.2, y, t.z[k]!, t.x1 - 0.2, y, t.z[k]!];
    const mb = new MeshBuilder();
    tube(mb, pts, 2, { radialSegments: 12, radius: w.core, capStart: true });
    return mb;
  });
  const o = group(`Fil de phase ${'ABC'[k]}`, 0, d.axisY, 0);
  o.add(mesh(geo, ctx.materials.get(`silicone.${COLORS[k]}`), 'lead.wire'));
  o.add(mesh(core, ctx.materials.get('tin'), 'lead.core'));
  return o;
}

/** Connecteur bullet mâle 4 mm (laiton) au bout du fil ; repère : axe = direction du fil. */
export function buildBullet(ctx: Ctx, k: number): THREE.Object3D {
  const { end, dir } = wirePath(ctx, k);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'bullet'), () => {
    const mb = new MeshBuilder();
    // Fût à coupelle de soudure, collet, broche Ø 4 fendue (bague ressort simplifiée), bout arrondi.
    revolve(
      mb,
      roundedProfile(
        [
          [-0.5, 0],
          [-0.5, 2.45, 0.3],
          [5.2, 2.45, 0.2],
          [5.2, 2.0, 0.15],
          [6.2, 2.0, 0.1],
          [6.2, 2.15, 0.1],
          [7.4, 2.15, 0.1],
          [7.4, 2.0, 0.1],
          [13.6, 2.0, 0.9],
          [14.8, 0.9, 0.6],
          [14.9, 0],
        ],
        0.25,
      ),
      { segments: segs(ctx, 36) },
    );
    return mb;
  });
  const o = new THREE.Group();
  o.name = `Bullet ${'ABC'[k]}`;
  o.matrixAutoUpdate = true;
  const m = mesh(geo, ctx.materials.get('brass'), 'lead.bullet');
  const f = frameAlong([0, 0, 0], dir);
  m.applyMatrix4(f);
  o.add(m);
  o.position.set(end[0] * MM, end[1] * MM, end[2] * MM);
  return o;
}

/** Gaine thermorétractable sur la coupelle du bullet et l'extrémité du fil. */
export function buildShrink(ctx: Ctx, k: number): THREE.Object3D {
  const { end, dir } = wirePath(ctx, k);
  const w = wireSpec(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'shrink'), () => {
    const mb = new MeshBuilder();
    revolve(
      mb,
      roundedProfile(
        [
          [-9, w.r - 0.05],
          [-9, w.r + 0.25, 0.1],
          [-6, w.r + 0.28, 1.5],
          [-3, 2.75, 1],
          [5.4, 2.75, 0.3],
          [5.4, 2.1],
        ],
        0.3,
      ),
      { segments: segs(ctx, 36) },
    );
    return mb;
  });
  const o = new THREE.Group();
  o.name = `Gaine ${'ABC'[k]}`;
  const m = mesh(geo, ctx.materials.get(`heatshrink.${COLORS[k]}`), 'lead.shrink');
  m.applyMatrix4(frameAlong([0, 0, 0], dir));
  o.add(m);
  o.position.set(end[0] * MM, end[1] * MM, end[2] * MM);
  return o;
}
