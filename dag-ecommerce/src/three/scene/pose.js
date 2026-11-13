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

// Rouleau : spirale serrée au cœur (les deux premières spires se touchent), puis plus lâche, au pas
// irrégulier, et déportée d'un côté — une ceinture roulée à la main n'est jamais une spirale parfaite.
const COIL = {
  rIn: 19, // rayon de la première spire (fibre neutre)
  tightTurns: 1.15, // spires jointives au cœur
  pitch: 6.1, // pas moyen des spires extérieures
  wobble: 0.7, // variation du pas (± mm)
  drift: 0.75, // excentrement gagné à chaque tour (mm) : les spires se resserrent d'un côté
  tightAt: 0.72, // direction du côté resserré, dans le plan du sol (rad depuis +X vers +Z : vers la boucle)
  straightFrom: 112,
  straightTo: 20,
  straightMin: 0.05,
  // Ceinture réversible : les derniers centimètres, côté pointe, montent en hélice hors du rouleau.
  revealFrom: 185,
  revealFull: 115,
  revealAngle: 0.19, // rad (≈ 11°) : la pointe dépasse d'environ 25 mm
};
const FLOW = { amp: 1.02, period: 1.08, phase: 2.2, twist: 0.42, twistPeriod: 1.55, twistPhase: 0.4, rise: 0.0 };

/**
 * @param spec
 * @param {{ reveal?: boolean }} [options]  reveal : le cœur du rouleau remonte en hélice (ceinture
 *        réversible : la doublure, d'une autre teinte, se découvre au-dessus des spires)
 */
export function createPose(spec, { reveal = false } = {}) {
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
    coil: { kappa: mk(), tau: mk(), yoff: mk(), anchor: null },
    flow: { kappa: mk(), tau: mk(), yoff: mk(), anchor: null, kappaBase: mk(), tauBase: mk() },
    blend: 0,
    reveal,
  };
  buildCoilProfile(pose);
  buildFlowProfile(pose);
  return pose;
}

function buildCoilProfile(pose) {
  const { spec, n } = pose;
  const { kappa, tau, yoff } = pose.coil;
  const L = spec.length;
  const touch = 2 * spec.htMain + 0.15; // pas de deux spires qui se touchent
  const pitchAt = (turn) =>
    lerp(touch, COIL.pitch, smoothstep(COIL.tightTurns, COIL.tightTurns + 1.2, turn)) +
    COIL.wobble * Math.sin(1.9 * turn + 0.8) * smoothstep(COIL.tightTurns + 0.2, COIL.tightTurns + 1.3, turn);
  const driftAt = (turn) => {
    const x = turn - COIL.tightTurns;
    return x > 0 ? (COIL.drift * x * x) / (x + 0.6) : 0;
  };

  // Spirale en coordonnées polaires r(θ), θ = 0 à la pointe ; on en tire la courbure le long de l'abscisse.
  const H = 0.004;
  const M = Math.ceil((16 * Math.PI) / H);
  const r = new Float64Array(M);
  const arc = new Float64Array(M);
  const curv = new Float64Array(M);
  let anchor = null;
  const build = (theta0) => {
    let acc = 0;
    for (let j = 0; j < M; j++) {
      const th = j * H;
      if (j > 0) acc += (0.5 * (pitchAt((th - H) / (2 * Math.PI)) + pitchAt(th / (2 * Math.PI))) * H) / (2 * Math.PI);
      r[j] = COIL.rIn + acc + driftAt(th / (2 * Math.PI)) * Math.cos(th - theta0);
    }
    const d1 = (j) => (r[Math.min(M - 1, j + 1)] - r[Math.max(0, j - 1)]) / ((Math.min(M - 1, j + 1) - Math.max(0, j - 1)) * H);
    let last = 0;
    for (let j = 0; j < M; j++) {
      const r1 = d1(j);
      const r2 = j > 0 && j < M - 1 ? (r[j + 1] - 2 * r[j] + r[j - 1]) / (H * H) : 0;
      const q = r[j] * r[j] + r1 * r1;
      curv[j] = (q + r1 * r1 - r[j] * r2) / Math.pow(q, 1.5);
      const speed = Math.sqrt(q);
      arc[j] = j > 0 ? arc[j - 1] + 0.5 * (last + speed) * H : 0;
      last = speed;
    }
    let j = 0;
    for (let iu = 0; iu < n; iu++) {
      const u = iu * STEP; // distance à la pointe
      while (j < M - 2 && arc[j + 1] < u) j++;
      const t = (u - arc[j]) / (arc[j + 1] - arc[j]);
      const i = n - 1 - iu;
      const s = L - u;
      const straight = lerp(COIL.straightMin, 1, smoothstep(COIL.straightTo, COIL.straightFrom, s));
      const bend = straight * lerp(curv[j], curv[j + 1], t);
      // Ruban enroulé en hélice sur un cylindre : flexion cos²α / r, torsion sin α · cos α / r.
      const alpha = pose.reveal ? COIL.revealAngle * smoothstep(COIL.revealFrom, COIL.revealFull, u) : 0;
      kappa[i] = bend * Math.cos(alpha) * Math.cos(alpha);
      tau[i] = bend * Math.sin(alpha) * Math.cos(alpha);
      yoff[i] = spec.buckleLift * (1 - smoothstep(0, 210, s));
      if (i === pose.anchorIndex) {
        // Repère d'ancrage exact : x = r·cos θ, z = −r·sin θ ; la lanière va vers la pointe (θ décroissant).
        const th = (j + t) * H;
        const rr = lerp(r[j], r[j + 1], t);
        const r1 = lerp(d1(j), d1(j + 1), t);
        const c = Math.cos(th);
        const sn = Math.sin(th);
        let tx = -(r1 * c - rr * sn);
        let tz = r1 * sn + rr * c;
        const l = Math.hypot(tx, tz);
        tx /= l;
        tz /= l;
        // N : normale sortante (fleur vers l'extérieur du rouleau)
        let nx = -tz;
        let nz = tx;
        if (nx * c - nz * sn < 0) {
          nx = -nx;
          nz = -nz;
        }
        anchor = { pos: [rr * c, spec.hw, -rr * sn], T: [tx, 0, tz], N: [nx, 0, nz] };
      }
    }
  };

  // Placement canonique : rouleau posé sur y = 0, zone boucle/monogramme vers +Z, côté resserré vers COIL.tightAt.
  const f = Math.round(70 / STEP);
  let theta0 = 0;
  let yaw = 0;
  for (let pass = 0; pass < 3; pass++) {
    build(theta0);
    integrate(pose, pose.coil, anchor);
    yaw = Math.atan2(pose.N[f * 3], pose.N[f * 3 + 2]); // angle de N(70) autour de Y
    // direction monde voulue → direction dans le repère de la spirale (rotation inverse), puis θ du côté resserré
    const wx = Math.cos(COIL.tightAt);
    const wz = Math.sin(COIL.tightAt);
    const dx = wx * Math.cos(yaw) + wz * Math.sin(yaw);
    const dz = -wx * Math.sin(yaw) + wz * Math.cos(yaw);
    theta0 = Math.atan2(-dz, dx) - Math.PI;
  }
  build(theta0);
  integrate(pose, pose.coil, anchor);
  yaw = Math.atan2(pose.N[f * 3], pose.N[f * 3 + 2]);
  const c = Math.cos(-yaw);
  const sn = Math.sin(-yaw);
  const rot = (x, z) => [x * c + z * sn, -x * sn + z * c];
  const [px, pz] = rot(anchor.pos[0], anchor.pos[2]);
  const [tx, tz] = rot(anchor.T[0], anchor.T[2]);
  const [nx, nz] = rot(anchor.N[0], anchor.N[2]);
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

// Respiration de la pose déroulée : amplitude de la flexion (k1), de la torsion (k2) et onde lente.
export const FLOW_BREATH = { bend: 0.04, twist: 0.1, wave: 0.0003 };

/** Pose déroulée pour des paramètres de respiration donnés : k1 flexion, k2 torsion, ph phase de l'onde. */
export function setFlowParams(pose, k1, k2, ph) {
  const { kappa, tau, kappaBase, tauBase } = pose.flow;
  const { n, spec } = pose;
  const L = spec.length;
  const w = (2 * Math.PI) / (0.8 * L);
  for (let i = 0; i < n; i++) {
    const s = i * STEP;
    kappa[i] = kappaBase[i] * k1 + FLOW_BREATH.wave * Math.sin(w * s - ph) * Math.sin((Math.PI * s) / L);
    tau[i] = tauBase[i] * k2;
  }
}

/** Respiration lente de la pose déroulée. */
export function setFlowTime(pose, t) {
  setFlowParams(pose, 1 + FLOW_BREATH.bend * Math.sin(t * 0.42), 1 + FLOW_BREATH.twist * Math.sin(t * 0.31 + 1.3), t * 0.27);
}

/** Jeux de paramètres extrêmes de la respiration : leur réunion borne tout le mouvement (cadrage). */
export function flowExtremes() {
  const out = [];
  for (const k1 of [1 - FLOW_BREATH.bend, 1 + FLOW_BREATH.bend]) {
    for (const k2 of [1 - FLOW_BREATH.twist, 1 + FLOW_BREATH.twist]) {
      for (let q = 0; q < 4; q++) out.push([k1, k2, (q * Math.PI) / 2]);
    }
  }
  return out;
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
