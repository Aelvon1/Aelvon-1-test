import { Matrix4, Quaternion, Vector3 } from 'three';
import { sampleFrame, STEP } from './pose';
import { beltSpec, lerp, REFERENCE_WIDTH, smoothstep } from './spec';
import { makeSample, surfaceAt } from './strap';

// ---------------------------------------------------------------------------
// Cadrages. Chaque vue est définie par une direction de prise de vue, une focale et un
// ensemble de points à garder dans le cadre ; la position de caméra en découle exactement
// (ajustement serré et centré, en perspective), quel que soit le format du conteneur.
// ---------------------------------------------------------------------------

export const VIEWS = ['hero', 'full', 'cuir', 'couture', 'boucle', 'monogramme'];

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
const REF = beltSpec(REFERENCE_WIDTH);

const dirFromAngles = (az, el, out = new Vector3()) =>
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

/** Direction caméra relative à une face : lacet autour de la verticale depuis la normale, puis élévation. */
function dirFromSurface(N, T, yaw, el) {
  const nh = new Vector3(N[0], 0, N[2]);
  if (nh.lengthSq() < 0.04) nh.set(0, 0, 1);
  nh.normalize();
  const th = new Vector3(T[0], 0, T[2]);
  th.addScaledVector(nh, -th.dot(nh));
  if (th.lengthSq() < 1e-4) th.crossVectors(UP, nh);
  th.normalize();
  const h = nh.multiplyScalar(Math.cos(yaw)).addScaledVector(th, Math.sin(yaw));
  return h.multiplyScalar(Math.cos(el)).addScaledVector(UP, Math.sin(el)).normalize();
}

const _f = makeSample();

/** Points englobants de la ceinture, hauteurs prises sur la largeur de référence (cadrage commun). */
function beltPoints(ctx) {
  const { pose, isCoil } = ctx;
  const pts = [];
  const stride = Math.round(10 / STEP);
  const hwRef = REF.hw;
  for (let i = 0; i < pose.n; i += stride) {
    const s = i * STEP;
    sampleFrame(pose, s, _f);
    const lift = isCoil ? (REF.buckleLift - ctx.spec.buckleLift) * (1 - smoothstep(0, 210, s)) : 0;
    const cy = _f.pos[1] + (isCoil ? hwRef - ctx.spec.hw + lift : 0);
    for (const sg of [-1, 1]) {
      pts.push(new Vector3(_f.pos[0] + _f.B[0] * hwRef * sg, cy + _f.B[1] * hwRef * sg, _f.pos[2] + _f.B[2] * hwRef * sg));
    }
  }
  // Boucle (cotes de référence)
  sampleFrame(pose, 0, _f);
  const lift = isCoil ? REF.buckleLift - ctx.spec.buckleLift + REF.hw - ctx.spec.hw : 0;
  for (const x of [0, REF.frameLength + REF.sectionW / 2]) {
    for (const y of [-REF.frameOuterHalf, REF.frameOuterHalf]) {
      for (const z of [-3, 5]) {
        pts.push(
          new Vector3(
            _f.pos[0] - _f.T[0] * x + _f.B[0] * y + _f.N[0] * (z - ctx.spec.foldRadius),
            _f.pos[1] + lift - _f.T[1] * x + _f.B[1] * y + _f.N[1] * (z - ctx.spec.foldRadius),
            _f.pos[2] - _f.T[2] * x + _f.B[2] * y + _f.N[2] * (z - ctx.spec.foldRadius),
          ),
        );
      }
    }
  }
  return pts;
}

/** Recopie les points pour toutes les rotations permises autour de l'axe vertical passant par `pivot`. */
function revolve(points, pivot, range) {
  if (!range) return points;
  const out = [];
  const full = range >= Math.PI;
  const steps = full ? 16 : 4;
  for (let i = 0; i <= steps; i++) {
    if (full && i === steps) break;
    const a = full ? (i / steps) * Math.PI * 2 : -range + (2 * range * i) / steps;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const p of points) {
      const x = p.x - pivot.x;
      const z = p.z - pivot.z;
      out.push(new Vector3(pivot.x + x * c + z * s, p.y, pivot.z - x * s + z * c));
    }
  }
  return out;
}

function disc(center, dir, radius) {
  const x = new Vector3().crossVectors(UP, dir).normalize();
  const y = new Vector3().crossVectors(dir, x).normalize();
  return [
    center.clone(),
    center.clone().addScaledVector(x, radius),
    center.clone().addScaledVector(x, -radius),
    center.clone().addScaledVector(y, radius),
    center.clone().addScaledVector(y, -radius),
  ];
}

/**
 * Décrit une vue : { dir, fov, points, margins:[gauche, droite, haut, bas], pivot, range }.
 * ctx : { pose, strap, spec, isCoil, aspect, rotate } — rotate = débattement de rotation à prévoir (rad)
 */
export function describeView(view, ctx) {
  const { pose, strap, spec, isCoil, aspect } = ctx;
  const handed = pose.B[1] < 0 ? -1 : 1; // sens de B au niveau de la boucle
  const surf = (s, v) => surfaceAt(strap, spec.sigma0 + s, v, 1, 0, makeSample());
  const portrait = smoothstep(1.25, 0.72, aspect);

  if (view === 'boucle') {
    sampleFrame(pose, 0, _f);
    const mid = (spec.frameLength * 0.42) / 1;
    const c = new Vector3(
      _f.pos[0] - _f.T[0] * mid - _f.N[0] * spec.foldRadius,
      _f.pos[1] - _f.T[1] * mid - _f.N[1] * spec.foldRadius,
      _f.pos[2] - _f.T[2] * mid - _f.N[2] * spec.foldRadius,
    );
    const dir = dirFromSurface(_f.N, _f.T, -26 * DEG, 27 * DEG);
    const r = REF.frameOuterHalf * 1.06;
    return { dir, fov: 24, points: disc(c, dir, r), margins: [0.07, 0.07, 0.07, 0.07], pivot: c, range: 0.5 };
  }
  if (view === 'monogramme') {
    const p = surf(spec.monoAt, 0);
    const c = new Vector3().fromArray(p.pos);
    const dir = dirFromSurface(p.N, p.T, 13 * DEG * handed, 11 * DEG);
    return { dir, fov: 24, points: disc(c, dir, REF.monoLength * 0.62), margins: [0.06, 0.06, 0.06, 0.06], pivot: c, range: 0.45 };
  }
  if (view === 'cuir') {
    const p = surf(isCoil ? 226 : 420, 0);
    const c = new Vector3().fromArray(p.pos);
    const dir = dirFromSurface(p.N, p.T, -24 * DEG, 13 * DEG);
    return { dir, fov: 22, points: disc(c, dir, REF.hw * 0.86), margins: [0.03, 0.03, 0.03, 0.03], pivot: c, range: 0.45 };
  }
  if (view === 'couture') {
    const s = isCoil ? 172 : 380;
    const g = (spec.hw - spec.stitchInset) * handed; // ligne de couture du haut
    const p = surf(s, g);
    const c = new Vector3().fromArray(p.pos);
    const dir = dirFromSurface(p.N, p.T, 32 * DEG, 28 * DEG);
    return { dir, fov: 22, points: disc(c, dir, 8.5), margins: [0.03, 0.03, 0.03, 0.03], pivot: c, range: 0.4 };
  }

  // Vues d'ensemble : la ceinture tourne autour du centre de son emprise au sol
  const pts = beltPoints(ctx);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const pivot = new Vector3((minX + maxX) / 2, REF.hw, (minZ + maxZ) / 2);
  if (isCoil) {
    const range = ctx.rotate;
    if (view === 'full') {
      // packshot : boucle au premier plan, spirale bien lisible
      const dir = dirFromAngles(38 * DEG, 46 * DEG);
      return { dir, fov: 22, points: revolve(pts, pivot, range), margins: [0.09, 0.09, 0.09, 0.1], pivot, range };
    }
    const dir = dirFromAngles(-34 * DEG, 23 * DEG);
    const m = lerp(0.07, 0.09, portrait);
    return { dir, fov: 30, points: revolve(pts, pivot, range), margins: [m, m, m, m + 0.02], pivot, range };
  }
  const range = Math.min(ctx.rotate, 0.38);
  if (view === 'full') {
    const dir = dirFromAngles(lerp(14, 76, portrait) * DEG, lerp(31, 36, portrait) * DEG);
    return { dir, fov: 26, points: revolve(pts, pivot, range), margins: [0.08, 0.08, 0.08, 0.08], pivot, range };
  }
  const dir = dirFromAngles(lerp(60, 80, portrait) * DEG, lerp(21, 24, portrait) * DEG);
  return { dir, fov: 38, points: revolve(pts, pivot, range), margins: [0.05, 0.05, 0.06, 0.06], pivot, range };
}

const _x = new Vector3();
const _y = new Vector3();
const _m = new Matrix4();

/**
 * Place la caméra : ajustement exact des points dans le cadre (marges comprises).
 * Renvoie { position, quaternion, fov, distance } ; `distance` = recul le long de l'axe optique
 * jusqu'au barycentre des points (sert à l'interpolation entre vues).
 */
export function solveCamera(def, aspect) {
  const z = def.dir;
  _x.crossVectors(UP, z).normalize();
  _y.crossVectors(z, _x).normalize();
  const ty = Math.tan((def.fov * DEG) / 2);
  const tx = ty * aspect;
  const [ml, mr, mt, mb] = def.margins;
  const txR = tx * (1 - 2 * mr);
  const txL = tx * (1 - 2 * ml);
  const tyT = ty * (1 - 2 * mt);
  const tyB = ty * (1 - 2 * mb);
  let ax = -Infinity;
  let bx = -Infinity;
  let ay = -Infinity;
  let by = -Infinity;
  let zc = 0;
  for (const p of def.points) {
    const px = p.dot(_x);
    const py = p.dot(_y);
    const pz = p.dot(z);
    zc += pz;
    ax = Math.max(ax, px + pz * txR);
    bx = Math.max(bx, -px + pz * txL);
    ay = Math.max(ay, py + pz * tyT);
    by = Math.max(by, -py + pz * tyB);
  }
  zc /= def.points.length;
  const ezX = (ax + bx) / (txR + txL);
  const ezY = (ay + by) / (tyT + tyB);
  const ez = Math.max(ezX, ezY);
  const ex = (ax - ez * txR + (ez * txL - bx)) / 2;
  const ey = (ay - ez * tyT + (ez * tyB - by)) / 2;
  const position = new Vector3().addScaledVector(_x, ex).addScaledVector(_y, ey).addScaledVector(z, ez);
  _m.makeBasis(_x, _y, z);
  const quaternion = new Quaternion().setFromRotationMatrix(_m);
  return { position, quaternion, fov: def.fov, distance: ez - zc };
}
