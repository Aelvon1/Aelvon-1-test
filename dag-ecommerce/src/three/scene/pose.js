import { Quaternion, Matrix4, Vector3 } from 'three';
import { lerp, smoothstep } from './spec';

// ---------------------------------------------------------------------------
// Poses de la lanière.
// Une pose est décrite par des profils de courbure le long de la fibre neutre :
//   kappa(s) : flexion autour de l'axe de largeur B (signe + : fleur à l'extérieur du pli)
//   tau(s)   : torsion autour de la tangente T
//   yoff(s)  : léger déport vertical (la boucle, plus large, soulève le bout de la lanière)
// et par un repère d'ancrage. On intègre ensuite des repères (T, B, N) explicites, orthonormés,
// directs (T × B = N) : aucun retournement possible, et deux poses s'interpolent proprement.
// ---------------------------------------------------------------------------

export const STEP = 0.5; // pas d'intégration, mm

/** Sens d'enroulement : -1 → vue de face, la boucle est à droite de la lanière (B pointe vers le bas). */
const CHI = -1;

const COIL = { rIn: 19, pitchIn: 5.5, pitchOut: 7.4, straightFrom: 112, straightTo: 20, straightMin: 0.05 };
const FLOW = { amp: 1.02, period: 1.08, phase: 2.2, twist: 0.42, twistPeriod: 1.55, twistPhase: 0.4, rise: 0.0 };

export function createPose(spec) {
  const n = Math.round(spec.length / STEP) + 1;
  const mk = () => new Float32Array(n);
  const mk3 = () => new Float32Array(n * 3);
  const pose = {
    spec,
    n,
    anchorIndex: Math.round((spec.length * 0.45) / STEP),
    kappa: mk(),
    tau: mk(),
    yoff: mk(),
    pos: mk3(),
    T: mk3(),
    B: mk3(),
    N: mk3(),
    coil: { kappa: mk(), tau: mk(), yoff: mk(), anchor: null, radius: mk() },
    flow: { kappa: mk(), tau: mk(), yoff: mk(), anchor: null, kappaBase: mk(), tauBase: mk() },
    blend: 0,
  };
  buildCoilProfile(pose);
  buildFlowProfile(pose);
  return pose;
}

function buildCoilProfile(pose) {
  const { spec, n } = pose;
  const { kappa, yoff, radius } = pose.coil;
  const L = spec.length;
  // Développante : le rayon croît d'un pas par tour → spires parallèles, jamais sécantes.
  let r = COIL.rIn;
  for (let iu = 0; iu < n; iu++) {
    const u = iu * STEP; // distance à la pointe
    const i = n - 1 - iu;
    const s = L - u;
    radius[i] = r;
    const straight = lerp(COIL.straightMin, 1, smoothstep(COIL.straightTo, COIL.straightFrom, s));
    kappa[i] = straight / r;
    yoff[i] = spec.buckleLift * (1 - smoothstep(0, 210, s));
    const pitch = lerp(COIL.pitchIn, COIL.pitchOut, smoothstep(0.25 * L, L, u));
    r += (STEP * pitch) / (2 * Math.PI * r);
  }

  // Placement canonique : axe du rouleau sur Oy, posé sur y = 0, zone boucle/monogramme vers +Z.
  const a = pose.anchorIndex;
  const tmp = { pos: [0, 0, 0], T: [CHI, 0, 0], N: [0, 0, 1] };
  integrate(pose, pose.coil, tmp);
  const cx = pose.pos[a * 3] - pose.N[a * 3] * radius[a];
  const cz = pose.pos[a * 3 + 2] - pose.N[a * 3 + 2] * radius[a];
  const f = Math.round(70 / STEP);
  const yaw = Math.atan2(pose.N[f * 3], pose.N[f * 3 + 2]); // angle de N(70) autour de Y
  const c = Math.cos(-yaw);
  const sn = Math.sin(-yaw);
  const rot = (x, z) => [x * c + z * sn, -x * sn + z * c];
  const [px, pz] = rot(-cx, -cz);
  const [tx, tz] = rot(CHI, 0);
  const [nx, nz] = rot(0, 1);
  pose.coil.anchor = { pos: [px, spec.hw, pz], T: [tx, 0, tz], N: [nx, 0, nz] };
}

function buildFlowProfile(pose) {
  const { spec, n } = pose;
  const { kappaBase, tauBase } = pose.flow;
  const L = spec.length;
  for (let i = 0; i < n; i++) {
    const s = i * STEP;
    const x = s / L;
    // Cap en S : psi(s) = amp·sin(…) → kappa = dpsi/ds. Bouts presque droits.
    const w = (2 * Math.PI) / (FLOW.period * L);
    const env = smoothstep(0, 0.1, x) * (1 - 0.55 * smoothstep(0.82, 1, x));
    kappaBase[i] = CHI * FLOW.amp * w * Math.cos(w * s + FLOW.phase) * env;
    const wt = (2 * Math.PI) / (FLOW.twistPeriod * L);
    tauBase[i] = -FLOW.twist * wt * Math.cos(wt * s + FLOW.twistPhase) * smoothstep(0.03, 0.2, x);
  }
  setFlowTime(pose, 0);

  // Placement canonique : boîte englobante centrée, corde boucle → pointe le long de -X
  // (boucle à droite : c'est la fleur, et non la doublure, qui regarde l'objectif).
  const a = pose.anchorIndex;
  const tmp = { pos: [0, 0, 0], T: [CHI, 0, 0], N: [0, 0, 1] };
  integrate(pose, pose.flow, tmp);
  const e = (n - 1) * 3;
  const yaw = Math.atan2(-(pose.pos[e + 2] - pose.pos[2]), pose.pos[e] - pose.pos[0]);
  const c = -Math.cos(-yaw);
  const sn = -Math.sin(-yaw);
  const rot = (x, z) => [x * c + z * sn, -x * sn + z * c];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  for (let i = 0; i < n; i++) {
    const [x, z] = rot(pose.pos[i * 3], pose.pos[i * 3 + 2]);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    minY = Math.min(minY, pose.pos[i * 3 + 1] - spec.hw * Math.abs(pose.B[i * 3 + 1]));
  }
  const [ax, az] = rot(pose.pos[a * 3], pose.pos[a * 3 + 2]);
  const [tx, tz] = rot(pose.T[a * 3], pose.T[a * 3 + 2]);
  const [nx, nz] = rot(pose.N[a * 3], pose.N[a * 3 + 2]);
  pose.flow.anchor = {
    pos: [ax - (minX + maxX) / 2, pose.pos[a * 3 + 1] - minY, az - (minZ + maxZ) / 2],
    T: [tx, pose.T[a * 3 + 1], tz],
    N: [nx, pose.N[a * 3 + 1], nz],
  };
}

/** Respiration lente de la pose déroulée. */
export function setFlowTime(pose, t) {
  const { kappa, tau, kappaBase, tauBase } = pose.flow;
  const { n, spec } = pose;
  const L = spec.length;
  const k1 = 1 + 0.07 * Math.sin(t * 0.42);
  const k2 = 1 + 0.16 * Math.sin(t * 0.31 + 1.3);
  const w = (2 * Math.PI) / (0.8 * L);
  const ph = t * 0.27;
  for (let i = 0; i < n; i++) {
    const s = i * STEP;
    kappa[i] = kappaBase[i] * k1 + 0.00042 * Math.sin(w * s - ph) * Math.sin((Math.PI * s) / L);
    tau[i] = tauBase[i] * k2;
  }
}

const _q0 = new Quaternion();
const _q1 = new Quaternion();
const _m = new Matrix4();
const _vt = new Vector3();
const _vb = new Vector3();
const _vn = new Vector3();

function anchorQuat(anchor, q) {
  _vt.fromArray(anchor.T).normalize();
  _vn.fromArray(anchor.N);
  _vn.addScaledVector(_vt, -_vn.dot(_vt)).normalize();
  _vb.crossVectors(_vn, _vt);
  _m.makeBasis(_vt, _vb, _vn);
  return q.setFromRotationMatrix(_m);
}

/**
 * Calcule les repères de la pose courante. blend = 0 → rouleau, 1 → déroulée ; entre les deux,
 * les profils de courbure et le repère d'ancrage sont interpolés (la ceinture se déroule).
 */
export function solvePose(pose, blend) {
  pose.blend = blend;
  if (blend <= 0) return integrate(pose, pose.coil, pose.coil.anchor);
  if (blend >= 1) return integrate(pose, pose.flow, pose.flow.anchor);
  const { n, kappa, tau, yoff, coil, flow } = pose;
  // La courbure se relâche d'abord depuis la boucle : l'extrémité se déroule avant le cœur.
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const local = smoothstep(0, 1, blend * 1.7 - x * 0.7);
    kappa[i] = lerp(coil.kappa[i], flow.kappa[i], local);
    tau[i] = lerp(coil.tau[i], flow.tau[i], local);
    yoff[i] = lerp(coil.yoff[i], flow.yoff[i], blend);
  }
  const e = smoothstep(0, 1, blend);
  anchorQuat(coil.anchor, _q0);
  anchorQuat(flow.anchor, _q1);
  _q0.slerp(_q1, e);
  _m.makeRotationFromQuaternion(_q0);
  const el = _m.elements;
  const anchor = {
    pos: [0, 1, 2].map((k) => lerp(coil.anchor.pos[k], flow.anchor.pos[k], e)),
    T: [el[0], el[1], el[2]],
    N: [el[8], el[9], el[10]],
  };
  return integrate(pose, { kappa, tau, yoff }, anchor);
}

/** Intègre les repères depuis l'ancrage, dans les deux sens. */
function integrate(pose, profile, anchor) {
  const { n, pos, T, B, N } = pose;
  const { kappa, tau, yoff } = profile;
  const a = pose.anchorIndex;

  let tx = anchor.T[0];
  let ty = anchor.T[1];
  let tz = anchor.T[2];
  let nx = anchor.N[0];
  let ny = anchor.N[1];
  let nz = anchor.N[2];
  let bx = ny * tz - nz * ty;
  let by = nz * tx - nx * tz;
  let bz = nx * ty - ny * tx;
  let px = anchor.pos[0];
  let py = anchor.pos[1];
  let pz = anchor.pos[2];

  const write = (i) => {
    const k = i * 3;
    pos[k] = px;
    pos[k + 1] = py;
    pos[k + 2] = pz;
    T[k] = tx;
    T[k + 1] = ty;
    T[k + 2] = tz;
    B[k] = bx;
    B[k + 1] = by;
    B[k + 2] = bz;
    N[k] = nx;
    N[k + 1] = ny;
    N[k + 2] = nz;
  };

  const step = (i, j, dir) => {
    // De l'échantillon i à l'échantillon j = i + dir.
    const ka = 0.5 * (kappa[i] + kappa[j]) * STEP * dir;
    const tw = 0.5 * (tau[i] + tau[j]) * STEP * dir;
    const ox = tx;
    const oy = ty;
    const oz = tz;
    // Flexion autour de B : dT/ds = -kappa N, dN/ds = kappa T.
    let c = Math.cos(ka);
    let s = Math.sin(ka);
    const t2x = tx * c - nx * s;
    const t2y = ty * c - ny * s;
    const t2z = tz * c - nz * s;
    let n2x = nx * c + tx * s;
    let n2y = ny * c + ty * s;
    let n2z = nz * c + tz * s;
    tx = t2x;
    ty = t2y;
    tz = t2z;
    // Torsion autour de T.
    if (tw !== 0) {
      c = Math.cos(tw);
      s = Math.sin(tw);
      const n3x = n2x * c + bx * s;
      const n3y = n2y * c + by * s;
      const n3z = n2z * c + bz * s;
      n2x = n3x;
      n2y = n3y;
      n2z = n3z;
    }
    // Ré-orthonormalisation (dérive numérique).
    let l = Math.hypot(tx, ty, tz);
    tx /= l;
    ty /= l;
    tz /= l;
    const d = n2x * tx + n2y * ty + n2z * tz;
    nx = n2x - d * tx;
    ny = n2y - d * ty;
    nz = n2z - d * tz;
    l = Math.hypot(nx, ny, nz);
    nx /= l;
    ny /= l;
    nz /= l;
    bx = ny * tz - nz * ty;
    by = nz * tx - nx * tz;
    bz = nx * ty - ny * tx;
    const h = 0.5 * STEP * dir;
    px += h * (ox + tx);
    py += h * (oy + ty);
    pz += h * (oz + tz);
  };

  write(a);
  for (let i = a; i < n - 1; i++) {
    step(i, i + 1, 1);
    write(i + 1);
  }
  tx = anchor.T[0];
  ty = anchor.T[1];
  tz = anchor.T[2];
  nx = anchor.N[0];
  ny = anchor.N[1];
  nz = anchor.N[2];
  bx = ny * tz - nz * ty;
  by = nz * tx - nx * tz;
  bz = nx * ty - ny * tx;
  px = anchor.pos[0];
  py = anchor.pos[1];
  pz = anchor.pos[2];
  for (let i = a; i > 0; i--) {
    step(i, i - 1, -1);
    write(i - 1);
  }
  if (yoff) for (let i = 0; i < n; i++) pos[i * 3 + 1] += yoff[i];
  return pose;
}

/** Repère interpolé à l'abscisse s (mm) ; écrit pos/T/B/N dans `out` (tableaux de 3). */
export function sampleFrame(pose, s, out) {
  const f = Math.min(Math.max(s / STEP, 0), pose.n - 1.0001);
  const i = Math.floor(f);
  const t = f - i;
  const a = i * 3;
  const b = a + 3;
  const { pos, T, B, N } = pose;
  for (let k = 0; k < 3; k++) {
    out.pos[k] = pos[a + k] + (pos[b + k] - pos[a + k]) * t;
    out.T[k] = T[a + k] + (T[b + k] - T[a + k]) * t;
    out.B[k] = B[a + k] + (B[b + k] - B[a + k]) * t;
    out.N[k] = N[a + k] + (N[b + k] - N[a + k]) * t;
  }
  return out;
}

export const poseHandedness = CHI;
