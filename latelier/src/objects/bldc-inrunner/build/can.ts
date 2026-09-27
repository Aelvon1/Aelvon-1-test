/**
 * Carter : tube d'aluminium anodisé satiné à ailettes longitudinales, secteur lisse gravé au
 * laser (marque, modèle, KV réels), trous taraudés M2,5 (ou M2) aux deux extrémités pour les
 * vis des flasques. Le filetage intérieur des trous est une géométrie fine (détail).
 */
import * as THREE from 'three/webgpu';
import { float, texture, uv, vec3 } from 'three/tsl';
import type { PartBuild } from '../../types';
import { canContour } from '../sections';
import { circle, type P2 } from '../profile2d';
import { canLabelSize, canLabelTexture } from '../markings';
import { anodized, cachedGeometry, dims, geoKey, group, instanced, mesh, segs, type Ctx } from './common';
import { basis, extrude, frameAlong, gridSurface, MeshBuilder, MM, threadSurface, type V3 } from './geom';

/** Repère « section → moteur » : (a, b, z) → (x = z, y = a, z = b). */
export const SECTION_TO_MOTOR = basis([0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]);

export function buildCan(ctx: Ctx): PartBuild {
  const d = dims(ctx);
  const s = d.s;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'can'), () => {
    const local = new MeshBuilder();
    const outer = canContour(
      d.bodyR,
      d.canR,
      d.fins.angles,
      d.fins.width,
      [0.5, 0.35, 0.22, 0.15][ctx.quality]!,
    );
    const bore = circle(0, 0, d.boreR, segs(ctx, 120));
    const blind = ([0, 1] as const).flatMap((side) =>
      d.screw.angles.map((a) => ({
        c: [d.screw.pcdR * Math.cos(a), d.screw.pcdR * Math.sin(a)] as P2,
        r: d.screw.d / 2,
        depth: d.screw.holeDepth,
        side,
        chamfer: 0.22 * s,
        segments: segs(ctx, 24),
      })),
    );
    extrude(local, outer, [bore], -d.tubeHalf, d.tubeHalf, {
      round0: 0.45 * s,
      round1: 0.45 * s,
      segments: 3,
      blindHoles: blind,
    });
    const mb = new MeshBuilder();
    mb.append(local, SECTION_TO_MOTOR);
    return mb;
  });
  const root = group('Carter', 0, d.axisY, 0);
  root.add(mesh(geo, anodized(ctx), 'can.body'));
  root.add(buildLabel(ctx));
  return { object: root, anchor: [0, d.canR * MM, 0] };
}

/** Décalque de gravure laser posé sur le secteur lisse (10 µm au-dessus de la surface). */
function buildLabel(ctx: Ctx): THREE.Mesh {
  const d = dims(ctx);
  const { length, halfAngle, x0 } = canLabelSize(d);
  const r = d.bodyR + 0.012;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'can-label'), () => {
    const mb = new MeshBuilder();
    gridSurface(
      mb,
      8,
      segs(ctx, 36),
      (u, v): V3 => {
        const th = d.label.center - halfAngle + 2 * halfAngle * v;
        return [x0 + length * u, r * Math.cos(th), r * Math.sin(th)];
      },
      { flip: (p, n) => n[1] * p[1] + n[2] * p[2] < 0 },
    );
    return mb;
  });
  const tex = canLabelTexture(ctx.textures, d, ctx.quality);
  // Gravure laser : sur une anodisation colorée, le colorant est détruit (marque blanc-gris) ;
  // sur l'argent, le laser noircit la couche (marque gris foncé).
  const silver = ctx.params.anodize === 'silver';
  const m = new THREE.MeshPhysicalNodeMaterial({
    metalness: silver ? 0.4 : 0.25,
    roughness: 0.62,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  m.name = 'Gravure laser';
  m.colorNode = silver ? vec3(0.16, 0.17, 0.18) : vec3(0.86, 0.88, 0.9);
  m.opacityNode = texture(tex, uv()).a.mul(float(0.94));
  const label = mesh(geo, m, 'can.label');
  label.renderOrder = 2;
  return label;
}

/** Détail : filetages intérieurs réels des 6 trous taraudés (aux deux extrémités). */
export function buildCanDetail(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const sc = d.screw;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'can-thread'), () => {
    const local = new MeshBuilder();
    threadSurface(local, {
      majorR: sc.d / 2 - 0.004,
      pitch: sc.pitch,
      z0: 0.22 * d.s + 0.05,
      z1: sc.holeDepth - 0.15,
      internal: true,
      segmentsPerTurn: segs(ctx, 28),
      profileSamples: 12,
    });
    const mb = new MeshBuilder();
    mb.append(local, basis([0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]));
    return mb;
  });
  const matrices: THREE.Matrix4[] = [];
  for (const side of [-1, 1] as const) {
    for (const a of sc.angles) {
      const origin: V3 = [side * d.tubeHalf * MM, sc.pcdR * Math.cos(a) * MM, sc.pcdR * Math.sin(a) * MM];
      matrices.push(frameAlong(origin, [-side, 0, 0]));
    }
  }
  const threads = instanced(geo, anodized(ctx), matrices, 'can.threads');
  const g = new THREE.Group();
  g.name = 'Filetages M' + sc.d;
  g.add(threads);
  return g;
}
