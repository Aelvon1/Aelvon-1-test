/**
 * Platine capteurs : circuit imprimé FR4 (deux faces texturées : vernis épargne, cuivre,
 * pastilles dorées, sérigraphie), trois capteurs à effet Hall en boîtier SIP-3 (face marquée
 * lisible), connecteur 6 points au pas de 1,5 mm, vis de fixation, câble plat et sa fiche.
 *
 * Approximation : les capteurs sont debout dans des fenêtres de la flasque, face marquée tournée
 * vers l'axe, et lisent le champ de fuite du débord arrière des aimants (disposition courante,
 * simplifiée : pas de capot ni de composants passifs sur la platine).
 */
import * as THREE from 'three/webgpu';
import { float, mix, smoothstep, texture, uv, vec3 } from 'three/tsl';
import type { PartBuild, PartHooks } from '../../types';
import { annularSector } from '../sections';
import { circle, roundedRect, type P2 } from '../profile2d';
import { hallMarkTexture, pcbTexture } from '../markings';
import { cachedGeometry, dims, geoKey, group, instanced, mesh, type Ctx } from './common';
import { basis, extrude, MeshBuilder, MM, sphere, transportFrames, tube, type V3 } from './geom';
import { SECTION_TO_MOTOR } from './can';
import { panScrewGeometry, screwMatrix } from './fasteners';
import { meltable } from './leads';

const polarP = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];

/** Matériau de face de circuit : vernis brillant, pastilles métalliques, sérigraphie mate. */
function pcbMaterial(tex: THREE.Texture): THREE.Material {
  const m = new THREE.MeshPhysicalNodeMaterial({
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
  });
  m.name = 'Circuit capteurs';
  const c = texture(tex, uv());
  m.colorNode = c.rgb;
  // Pastilles dorées (rouge élevé, bleu faible en linéaire) ; sérigraphie : tous canaux élevés.
  const pad = smoothstep(float(0.4), float(0.6), c.r).mul(
    float(1).sub(smoothstep(float(0.3), float(0.6), c.b)),
  );
  const silk = smoothstep(float(0.6), float(0.8), c.b);
  m.metalnessNode = pad;
  m.roughnessNode = mix(mix(float(0.32), float(0.62), silk), float(0.22), pad);
  return m;
}

export function buildPcb(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const p = d.pcb;
  const outer = pcbTexture(ctx.textures, d, 'outer', ctx.quality);
  const inner = pcbTexture(ctx.textures, d, 'inner', ctx.quality);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'pcb'), () => {
    const outline = annularSector(p.rIn, p.rOut, p.a0, p.a1, 0.8 * d.s, 0.15);
    const holes = p.screwAngles.map((a) => circle(...polarP(p.screwR, a), 1.1, 20));
    const local = new MeshBuilder();
    const h = outer.half;
    extrude(local, outline, holes, p.xOut, p.xIn, {
      round0: 0.06,
      round1: 0.06,
      segments: 1,
      capGroup: 0,
      capGroup1: 1,
      sideGroup: 2,
      // Face extérieure vue de l'arrière (x canvas = z) ; intérieure vue de l'avant (x canvas = −z).
      capUV: (q, side) =>
        side === 0
          ? [(q[1] + h) / (2 * h), (-q[0] + h) / (2 * h)]
          : [(-q[1] + h) / (2 * h), (-q[0] + h) / (2 * h)],
    });
    const mb = new MeshBuilder();
    mb.append(local, SECTION_TO_MOTOR);
    return mb;
  });
  const o = group('Circuit imprimé');
  o.add(
    mesh(
      geo,
      [pcbMaterial(outer.texture), pcbMaterial(inner.texture), ctx.materials.get('fr4.core')],
      'sensors.pcb',
    ),
  );
  return o;
}

/** Connecteur 6 points (embase à détrompeur) soudé sur la face extérieure. */
export function buildConnector(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const c = d.connector;
  const cy = -c.r;
  const x0 = d.pcb.xOut;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'connector'), () => {
    const mb = new MeshBuilder();
    const shell = new MeshBuilder();
    const out = roundedRect(cy, 0, c.depth, c.width, 0.25, 0.1);
    const cav = roundedRect(cy + 0.15, 0, c.depth - 1.0, c.width - 1.1, 0.15, 0.1);
    extrude(shell, out, [cav], x0 - c.height, x0, { round0: 0.12, round1: 0.05, segments: 2 });
    const floor = new MeshBuilder();
    extrude(floor, cav, [], x0 - 1.0, x0 - 0.2, { segments: 1 });
    mb.append(shell, SECTION_TO_MOTOR);
    mb.append(floor, SECTION_TO_MOTOR);
    return mb;
  });
  const pins = cachedGeometry(ctx, geoKey(ctx, 'connector-pins'), () => {
    const mb = new MeshBuilder();
    for (let j = 0; j < 6; j++) {
      const z = (j - 2.5) * c.pitch;
      const pin = new MeshBuilder();
      extrude(
        pin,
        roundedRect(cy + 0.15, z, 0.5, 0.5, 0.05, 0.05),
        [],
        x0 - c.height + 0.9,
        x0 + d.pcb.t + 0.6,
        {
          round0: 0.12,
          round1: 0.1,
          segments: 2,
        },
      );
      mb.append(pin, SECTION_TO_MOTOR);
    }
    return mb;
  });
  const o = group('Connecteur 6 points');
  o.add(mesh(geo, ctx.materials.get('plastic.nylon'), 'sensors.connector'));
  o.add(mesh(pins, ctx.materials.get('gold'), 'sensors.connector.pins'));
  return o;
}

/** Capteurs Hall SIP-3 : boîtier (face marquée vers l'axe), pattes, soudures (fondent au dessoudage). */
export function buildHallSensors(ctx: Ctx): PartBuild {
  const d = dims(ctx);
  const h = d.hall;
  const bodyH = 3;
  const bodyW = h.width;
  const bodyT = h.r1 - h.r0;
  const rMid = (h.r0 + h.r1) / 2;
  const xTop = h.x1;
  const xc = xTop - bodyH / 2;
  // Repère local d'instance : X axial, Y radial (vers l'extérieur), Z tangentiel ; origine au centre du boîtier.
  const body = cachedGeometry(ctx, geoKey(ctx, 'hall-body'), () => {
    const local = new MeshBuilder();
    // Section (tangentiel a, axial b), extrusion radiale z : face 0 = face marquée (vers l'axe).
    const sec = roundedRect(0, 0, bodyW, bodyH, 0.18, 0.05);
    extrude(local, sec, [], -bodyT / 2, bodyT / 2, {
      round0: 0.06,
      round1: 0.22,
      segments: 2,
      capGroup: 0,
      sideGroup: 1,
      capUV: (q, side) =>
        side === 0 ? [(-q[0] + bodyW / 2) / bodyW, (-q[1] + bodyH / 2) / bodyH] : [0.01, 0.01],
    });
    const mb = new MeshBuilder();
    mb.append(local, basis([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]));
    return mb;
  });
  const legs = cachedGeometry(ctx, geoKey(ctx, 'hall-legs'), () => {
    const mb = new MeshBuilder();
    const xEnd = d.pcb.xOut - 0.45;
    for (let j = -1; j <= 1; j++) {
      const leg = new MeshBuilder();
      extrude(leg, roundedRect(0, j * 1.27, 0.38, 0.43, 0.08, 0.05), [], xEnd - xc, -bodyH / 2 + 0.1, {
        round0: 0.1,
        round1: 0,
        segments: 2,
      });
      mb.append(leg, SECTION_TO_MOTOR);
    }
    return mb;
  });
  // Soudures (géométrie propre, déformée à la fusion).
  const jointBuilder = new MeshBuilder();
  const jointX = d.pcb.xOut - 0.12 - xc;
  for (let j = -1; j <= 1; j++) {
    const s = new MeshBuilder();
    sphere(s, 0.5, 14, 8, [0.55, 1, 1]);
    jointBuilder.append(s, new THREE.Matrix4().makeTranslation(jointX, 0, j * 1.27));
  }
  const joints = jointBuilder.build();
  const melt = meltable(joints, (_x, _y, z) => [jointX * MM, 0, Math.round(z / MM / 1.27) * 1.27 * MM]);
  const matrices = h.angles.map((a) => {
    const m = new THREE.Matrix4().makeRotationX(a);
    m.setPosition(xc * MM, rMid * Math.cos(a) * MM, rMid * Math.sin(a) * MM);
    return m;
  });
  const mark = hallMarkTexture(ctx.textures, ctx.quality);
  const face = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.55, metalness: 0, clearcoat: 0.15 });
  face.name = 'Boîtier Hall (marquage)';
  const ink = texture(mark, uv()).r;
  face.colorNode = mix(vec3(0.035, 0.035, 0.038), vec3(0.78, 0.78, 0.74), ink);
  face.roughnessNode = mix(float(0.5), float(0.75), ink);
  const bodyMesh = instanced(body, [face, ctx.materials.get('epoxy.black')], matrices, 'sensors.hall.body');
  const legMesh = instanced(legs, ctx.materials.get('tin'), matrices, 'sensors.hall.legs');
  const jointMesh = instanced(joints, ctx.materials.get('solder'), matrices, 'sensors.hall.joints');
  const o = group('Capteurs Hall');
  o.add(bodyMesh, legMesh, jointMesh);
  const hooks: PartHooks = { onRemovalProgress: (t) => melt(t) };
  return {
    object: o,
    instanced: [bodyMesh, legMesh, jointMesh],
    hooks,
    instanceLabel: (i) => `Capteur H${i + 1} (commutation phase ${'ABC'[i]})`,
  };
}

/** Vis de platine M2 × 3 (tête cylindrique cruciforme), instanciées. */
export function buildPcbScrews(ctx: Ctx): PartBuild {
  const d = dims(ctx);
  const geo = panScrewGeometry(ctx, 3);
  const matrices = d.pcb.screwAngles.map((a, i) => {
    const [y, z] = polarP(d.pcb.screwR, a);
    return screwMatrix(d.pcb.xOut, y, z, -1, i * 0.7);
  });
  const inst = instanced(geo, ctx.materials.get('steel.zinc'), matrices, 'sensors.screws');
  const o = group('Vis de platine');
  o.add(inst);
  return { object: o, instanced: inst, instanceLabel: (i) => `Vis de platine n° ${i + 1}` };
}

/** Câble capteurs : fiche 6 points (verrou) et nappe de 6 conducteurs posée sur le tapis. */
export function buildSensorCable(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const c = d.connector;
  const cy = -c.r + 0.15;
  const x0 = d.pcb.xOut - 1.0;
  const plugLen = 6.5;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'sensor-plug'), () => {
    const mb = new MeshBuilder();
    const body = new MeshBuilder();
    extrude(body, roundedRect(cy, 0, c.depth - 1.1, c.width - 1.2, 0.18, 0.1), [], x0 - plugLen, x0, {
      round0: 0.25,
      round1: 0.1,
      segments: 2,
    });
    mb.append(body, SECTION_TO_MOTOR);
    // Verrou (rampe) sur le dessus.
    const latch = new MeshBuilder();
    extrude(
      latch,
      roundedRect(cy - (c.depth - 1.1) / 2 - 0.25, 0, 0.5, 2.2, 0.15, 0.1),
      [],
      x0 - 4.2,
      x0 - 2.8,
      {
        round0: 0.12,
        round1: 0.12,
        segments: 2,
      },
    );
    mb.append(latch, SECTION_TO_MOTOR);
    return mb;
  });
  const o = group('Câble capteurs', 0, d.axisY, 0);
  o.add(mesh(geo, ctx.materials.get('plastic.nylon'), 'sensorCable.plug'));
  // Nappe : sortie de fiche vers −X, descente jusqu'au tapis, puis à plat.
  const ribbon = cachedGeometry(ctx, geoKey(ctx, 'sensor-ribbon'), () => {
    const yMat = -d.axisY + 0.55;
    const xs = x0 - plugLen;
    const ctrl: V3[] = [
      [xs + 0.5, cy, 0],
      [xs - 4, cy - 0.3, 0],
      [xs - 9, cy - 2.5, 0],
      [xs - 12, yMat + 3, 0],
      [xs - 16, yMat, -1],
      [xs - 40, yMat, -4],
      [xs - 75, yMat, -2],
    ];
    const pts: number[] = [];
    // Catmull-Rom uniforme.
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)]!;
      const p1 = ctrl[i]!;
      const p2 = ctrl[i + 1]!;
      const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]!;
      const n = 10;
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        const t = k / n;
        for (let a = 0; a < 3; a++) {
          const v =
            0.5 *
            (2 * p1[a]! +
              (-p0[a]! + p2[a]!) * t +
              (2 * p0[a]! - 5 * p1[a]! + 4 * p2[a]! - p3[a]!) * t * t +
              (-p0[a]! + 3 * p1[a]! - 3 * p2[a]! + p3[a]!) * t * t * t);
          pts.push(v);
        }
      }
    }
    const count = pts.length / 3;
    const T = transportFrames(pts, count).T;
    // Repère : N = largeur de nappe (≈ Z), B = T × N (épaisseur).
    const N: V3[] = [];
    const B: V3[] = [];
    for (const t of T) {
      const w: V3 = [0, 0, 1];
      const d0 = w[0] * t[0] + w[1] * t[1] + w[2] * t[2];
      let nx = w[0] - d0 * t[0];
      let ny = w[1] - d0 * t[1];
      let nz = w[2] - d0 * t[2];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      N.push([nx, ny, nz]);
      B.push([t[1] * nz - t[2] * ny, t[2] * nx - t[0] * nz, t[0] * ny - t[1] * nx]);
    }
    // Section de nappe : 6 conducteurs au pas de 1,27 mm (bosses sur les deux faces).
    const prof: P2[] = [];
    const W = 6 * 1.27;
    const hAt = (a: number) =>
      0.34 + 0.1 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (a + W / 2 - 0.635)) / 1.27));
    const edge = 0.44;
    for (let k = 0; k <= 36; k++) {
      const a = W / 2 - edge - ((W - 2 * edge) * k) / 36;
      prof.push([a, hAt(a)]);
    }
    for (let k = 1; k < 8; k++) {
      const t = Math.PI / 2 + (k / 8) * Math.PI;
      prof.push([-W / 2 + edge + edge * Math.cos(t), edge * Math.sin(t)]);
    }
    for (let k = 0; k <= 36; k++) {
      const a = -W / 2 + edge + ((W - 2 * edge) * k) / 36;
      prof.push([a, -hAt(a)]);
    }
    for (let k = 1; k < 8; k++) {
      const t = -Math.PI / 2 + (k / 8) * Math.PI;
      prof.push([W / 2 - edge + edge * Math.cos(t), edge * Math.sin(t)]);
    }
    const mb = new MeshBuilder();
    tube(mb, pts, count, {
      radialSegments: prof.length,
      profile: prof.reverse(),
      radius: 1,
      frames: { N, B },
      capEnd: true,
    });
    return mb;
  });
  o.add(mesh(ribbon, ctx.materials.get('silicone.black'), 'sensorCable.ribbon'));
  return o;
}
