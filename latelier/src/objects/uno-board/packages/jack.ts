/**
 * Jack d'alimentation 2,1 mm traversant (X1) : corps en plastique noir 13,5 × 9,0 × 11,0 mm,
 * alésage Ø 6,3 mm avec broche centrale Ø 2,0 mm et lame de contact du fourreau, trois lames de
 * soudure. Repère : origine au centre de la face arrière, ouverture vers −X (déborde de 1,9 mm).
 */
import * as THREE from 'three/webgpu';
import { L_TAIL_END, L_THT_SEAT, MM } from '../constants';
import { lathe, loftRoundedRect, mat, roundedBox, roundedRectRing, type P2 } from './geometry';
import { pinPositions, thtJointMeshes } from './headers';
import type { ComponentModel } from './model';

const LEN = 13.5;
const W = 9.0;
const H = 11.0;
const Y0 = L_THT_SEAT / MM;
const BORE_Y = Y0 + 6.3;
const BORE_R = 3.15;

function rr(w: number, h: number, r: number, cy: number): THREE.Vector2[] {
  return roundedRectRing(w * MM, h * MM, r * MM, 4).map(([x, z]) => new THREE.Vector2(x, -z + cy * MM));
}

function circle(r: number, cy: number, n = 40): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (-k / n) * Math.PI * 2;
    out.push(new THREE.Vector2(Math.cos(a) * r * MM, cy * MM + Math.sin(a) * r * MM));
  }
  return out;
}

function extrudeX(
  outer: THREE.Vector2[],
  holes: THREE.Vector2[][],
  x0: number,
  depth: number,
  bevel: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape(outer);
  for (const h of holes) shape.holes.push(new THREE.Path(h));
  const b = bevel * MM;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth * MM - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, b + x0 * MM);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Corps : partie avant alésée + fond plein (deux extrusions fusionnées). */
function body(): THREE.BufferGeometry {
  const cy = Y0 + H / 2;
  const front = extrudeX(rr(W, H, 0.7, cy), [circle(BORE_R, BORE_Y)], 2.4, LEN - 2.4, 0.25);
  const rear = extrudeX(rr(W, H, 0.7, cy), [], 0, 2.5, 0.25);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g of [front, rear]) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/** Broche centrale Ø 2,0 mm (axe selon X), bout arrondi. */
function centerPin(): THREE.BufferGeometry {
  const r = 1.0;
  const profile: P2[] = [
    [0.001, 0],
    [r * 0.6, 0.05],
    [r * 0.92, 0.25],
    [r, 0.45],
    [r, 10.6],
  ].map(([a, b]) => [a! * MM, b! * MM] as P2);
  // Profil selon Y puis couché le long de −X, centré sur l'axe de l'alésage.
  // Rotation −π/2 autour de Z : l'axe Y du profil devient +X, pointe vers l'avant après translation.
  return lathe(profile, 28)
    .rotateZ(-Math.PI / 2)
    .translate(-(LEN - 0.8) * MM, BORE_Y * MM, 0);
}

/** Collerette avant autour de l'alésage. */
function frontRing(): THREE.BufferGeometry {
  const profile: P2[] = [
    [BORE_R + 0.02, 0],
    [BORE_R + 0.02, 0.25],
    [BORE_R + 0.25, 0.4],
    [BORE_R + 0.75, 0.4],
    [BORE_R + 0.95, 0.25],
    [BORE_R + 0.95, 0.0],
  ].map(([a, b]) => [a! * MM, b! * MM] as P2);
  return lathe(profile, 48)
    .rotateZ(Math.PI / 2)
    .translate(-LEN * MM, BORE_Y * MM, 0);
}

export function jackModel(): ComponentModel {
  const pins = pinPositions('JACK2.1');
  return {
    meshes: [
      {
        name: 'corps',
        key: 'jack.body',
        geometry: body,
        material: (ctx) => ctx.materials.get('plastic.black'),
      },
      {
        name: 'collerette',
        key: 'jack.ring',
        geometry: frontRing,
        material: (ctx) => ctx.materials.get('plastic.black'),
      },
      {
        name: 'broche centrale',
        key: 'jack.center',
        geometry: centerPin,
        material: (ctx) => ctx.materials.get('tin'),
      },
      {
        name: 'lame du fourreau',
        key: 'jack.sleeve',
        geometry: () =>
          roundedBox(8.0 * MM, 1.6 * MM, 0.15 * MM, {
            r: 0.1 * MM,
            rt: 0.05 * MM,
            y0: (BORE_Y - BORE_R + 0.05) * MM,
          }).translate(-(LEN - 6.0) * MM, 0, 0),
        material: (ctx) => ctx.materials.get('tin'),
      },
      {
        name: 'lames de soudure',
        key: 'jack.blade',
        geometry: () =>
          loftRoundedRect(
            [
              { y: L_TAIL_END, w: 0.8 * MM, d: 0.3 * MM, r: 0.05 * MM },
              { y: L_TAIL_END + 0.4 * MM, w: 1.3 * MM, d: 0.5 * MM, r: 0.05 * MM },
              { y: (Y0 + 1.2) * MM, w: 1.3 * MM, d: 0.5 * MM, r: 0.05 * MM },
            ],
            { cornerSegments: 1 },
          ),
        material: (ctx) => ctx.materials.get('tin'),
        locals: pins.map(([x, z]) => mat(x, 0, z)),
      },
      {
        name: 'pont de la lame latérale',
        key: 'jack.bridge',
        geometry: () =>
          roundedBox(1.3 * MM, 1.2 * MM, 0.3 * MM, { r: 0.05 * MM, rt: 0.05 * MM, y0: (Y0 + 0.9) * MM }),
        material: (ctx) => ctx.materials.get('tin'),
        locals: [mat(pins[2]![0], 0, pins[2]![1] - 0.45 * MM)],
      },
      ...thtJointMeshes('jack', pins, 1.5, 0.72, { bottomH: 1.0, top: 0.35 }),
    ],
  };
}
