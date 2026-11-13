import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';
import { STEP } from './pose';
import { clamp, halfThicknessAt, halfWidthAt, lerp, smoothstep, stitchApexS, stitchOffsetAt } from './spec';

// ---------------------------------------------------------------------------
// Lanière : section « rectangle arrondi » (fleur bombée, filets de couture, tranches rondes)
// balayée le long de la fibre neutre. La topologie est fixe pour une largeur donnée ;
// changer de pose ne fait que réécrire positions, normales et occlusion.
//
// Ordre du balayage (sigma croissant) : retour sous la lanière → pli autour de la barrette
// → lanière → pointe.
// ---------------------------------------------------------------------------

// Sommets de la section, dans l'ordre : fleur (21), tranche + (7), doublure (9), tranche − (7).
const OUTER_N = 21;
const EDGE_N = 7;
const INNER_N = 9;
export const PROFILE_N = OUTER_N + EDGE_N + INNER_N + EDGE_N; // 44
const IDX_EDGE_A = OUTER_N; // 21
const IDX_INNER = IDX_EDGE_A + EDGE_N; // 28
const IDX_EDGE_B = IDX_INNER + INNER_N; // 37
const IDX_GROOVE_NEG = 3;
const IDX_GROOVE_POS = 17;

const REGION_TAIL = 0;
const REGION_FOLD = 1;
const REGION_MAIN = 2;

function tailOffset(spec, sp) {
  const flat = halfThicknessAt(spec, sp) + spec.htFold + 0.12;
  return lerp(2 * spec.foldRadius, flat, smoothstep(0, 11, sp));
}

/** Remplit la section (v le long de B, h le long de N) d'un anneau. */
function fillProfile(L, k) {
  const o = k * PROFILE_N;
  const { lv, lh } = L;
  const hw = L.rHw[k];
  const ht = L.rHt[k];
  const e = Math.min(L.spec.edge, hw * 0.6);
  const a = hw - e;
  const gRaw = L.rG[k];
  const q = smoothstep(0.5, 1.6, gRaw) * smoothstep(0.2, 1.2, a - gRaw - L.spec.grooveHalf);
  const gw = L.spec.grooveHalf;
  const g = clamp(gRaw, gw + 0.05, Math.max(gw + 0.05, a - gw - 0.05));
  const gd = L.rGd[k] * q;
  const dome = L.rDome[k] * q * smoothstep(1, 8, g - gw);
  const inner = g - gw;

  // Fleur : bord, filet, bombé, filet, bord.
  const sv = [-a, -(g + gw), -(g + gw / 2), -g, -(g - gw / 2), -inner];
  const sh = [0, 0, -0.8 * gd, -gd, -0.8 * gd, 0];
  for (let i = 1; i <= 9; i++) {
    const x = -1 + i / 5;
    sv.push(x * inner);
    sh.push(dome * (1 - x * x));
  }
  sv.push(inner, g - gw / 2, g, g + gw / 2, g + gw, a);
  sh.push(0, -0.8 * gd, -gd, -0.8 * gd, 0, 0);
  for (let j = 0; j < OUTER_N; j++) {
    const u = -a + (2 * a * j) / (OUTER_N - 1); // répartition uniforme quand la pointe se referme
    lv[o + j] = lerp(u, sv[j], q);
    lh[o + j] = ht + sh[j];
  }
  // Tranche + : demi-ellipse.
  for (let i = 1; i <= EDGE_N; i++) {
    const ang = Math.PI / 2 - (i * Math.PI) / (EDGE_N + 1);
    lv[o + IDX_EDGE_A + i - 1] = a + e * Math.cos(ang);
    lh[o + IDX_EDGE_A + i - 1] = ht * Math.sin(ang);
  }
  // Doublure, de +a à −a.
  for (let i = 0; i < INNER_N; i++) {
    lv[o + IDX_INNER + i] = a - (2 * a * i) / (INNER_N - 1);
    lh[o + IDX_INNER + i] = -ht;
  }
  // Tranche −.
  for (let i = 1; i <= EDGE_N; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / (EDGE_N + 1);
    lv[o + IDX_EDGE_B + i - 1] = -a - e * Math.cos(ang);
    lh[o + IDX_EDGE_B + i - 1] = ht * Math.sin(ang);
  }
  L.rA[k] = a;
  L.rGe[k] = g;
  L.rGde[k] = gd;
  L.rDe[k] = dome;
}

/** Construit la topologie de la lanière pour une largeur donnée. */
export function createStrap(spec) {
  // --- Anneaux -------------------------------------------------------------
  const rings = [];
  const tailSig = [0, 0.1, 0.3, 0.65, 1.2, 2.2, 3.6, 5.5, 8];
  for (let s = 11; s < spec.tailLength - 11.5; s += 3) tailSig.push(s);
  for (let s = spec.tailLength - 11; s < spec.tailLength - 0.2; s += 1.4) tailSig.push(s);
  for (const sg of tailSig) rings.push({ region: REGION_TAIL, sigma: sg, p: spec.tailLength - sg });
  const FOLD_SEG = 16;
  for (let i = 0; i < FOLD_SEG; i++) {
    const t = i / FOLD_SEG;
    rings.push({ region: REGION_FOLD, sigma: spec.tailLength + t * spec.foldLength, p: Math.PI * (1 - t) });
  }
  const tipStart = spec.length - spec.tipLength;
  let s = 0;
  while (s < tipStart - 0.01) {
    rings.push({ region: REGION_MAIN, sigma: spec.sigma0 + s, p: s });
    s += s < 12 ? 1 : 2;
  }
  const TIP_SEG = 34;
  for (let i = 0; i <= TIP_SEG; i++) {
    const x = spec.tipLength * Math.pow(1 - i / TIP_SEG, 1.8);
    rings.push({ region: REGION_MAIN, sigma: spec.sigmaEnd - x, p: spec.length - x });
  }

  const K = rings.length;
  const M = PROFILE_N;
  const V = K * M + 2; // + 2 centres de bouchons
  const f32 = (n) => new Float32Array(n);
  const L = {
    spec,
    K,
    M,
    V,
    region: new Uint8Array(K),
    param: f32(K),
    sigma: f32(K),
    rHw: f32(K),
    rHt: f32(K),
    rG: f32(K),
    rGd: f32(K),
    rDome: f32(K),
    rA: f32(K),
    rGe: f32(K),
    rGde: f32(K),
    rDe: f32(K),
    lv: f32(K * M),
    lh: f32(K * M),
    ln: f32(K * M * 3), // normale locale (T, B, N)
    // repères des anneaux pour la pose courante
    rc: f32(K * 3),
    rt: f32(K * 3),
    rb: f32(K * 3),
    rn: f32(K * 3),
    aoCoil: f32(V).fill(1), // plateau sombre
    aoCoilLight: f32(V).fill(1), // plateau clair (le sol renvoie de la lumière)
    aoFlow: f32(V).fill(1),
  };

  for (let k = 0; k < K; k++) {
    const r = rings[k];
    L.region[k] = r.region;
    L.param[k] = r.p;
    L.sigma[k] = r.sigma;
    if (r.region === REGION_MAIN) {
      const sm = r.p;
      L.rHw[k] = halfWidthAt(spec, sm);
      L.rHt[k] = halfThicknessAt(spec, sm);
      L.rG[k] = stitchOffsetAt(spec, sm);
      L.rGd[k] = spec.grooveDepth * smoothstep(2.5, 8, sm);
      L.rDome[k] = spec.dome * smoothstep(10, 46, sm);
    } else {
      L.rHw[k] = spec.hw;
      let ht = spec.htFold;
      if (r.region === REGION_TAIL) {
        ht *= lerp(0.62, 1, smoothstep(0, 9, r.sigma));
        const x = clamp(r.sigma / 1.2, 0, 1);
        ht *= Math.max(0.1, Math.sqrt(1 - (1 - x) * (1 - x))); // bout arrondi
      }
      L.rHt[k] = ht;
      L.rG[k] = spec.hw - spec.stitchInset;
      L.rGd[k] = 0;
      L.rDome[k] = 0;
    }
    fillProfile(L, k);
  }

  // --- Normales locales (configuration droite) ------------------------------
  const P = (k, j, out) => {
    const o = k * M + j;
    out[0] = L.sigma[k];
    out[1] = L.lv[o];
    out[2] = L.lh[o];
  };
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const c = [0, 0, 0];
  const d = [0, 0, 0];
  for (let k = 0; k < K; k++) {
    const k0 = Math.max(0, k - 1);
    const k1 = Math.min(K - 1, k + 1);
    for (let j = 0; j < M; j++) {
      P(k0, j, a);
      P(k1, j, b);
      P(k, (j + M - 1) % M, c);
      P(k, (j + 1) % M, d);
      const sx = b[0] - a[0];
      const sy = b[1] - a[1];
      const sz = b[2] - a[2];
      const px = d[0] - c[0];
      const py = d[1] - c[1];
      const pz = d[2] - c[2];
      // n = dP/dj × dP/dk, orientée vers l'extérieur
      let nx = py * sz - pz * sy;
      let ny = pz * sx - px * sz;
      let nz = px * sy - py * sx;
      const o = k * M + j;
      if (ny * L.lv[o] + nz * L.lh[o] < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      L.ln[o * 3] = nx / l;
      L.ln[o * 3 + 1] = ny / l;
      L.ln[o * 3 + 2] = nz / l;
    }
  }

  // --- Géométrie -----------------------------------------------------------
  const position = f32(V * 3);
  const normal = f32(V * 3);
  const uv = f32(V * 2);
  const occ = f32(V).fill(1);
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < M; j++) {
      const o = k * M + j;
      uv[o * 2] = L.sigma[k];
      uv[o * 2 + 1] = L.lv[o];
    }
  }
  uv[K * M * 2] = 0;
  uv[(K * M + 1) * 2] = L.sigma[K - 1];

  const quads = (K - 1) * M;
  const index = new Uint32Array(quads * 6 + 2 * M * 3);
  let w = 0;
  const groups = [];
  const emit = (jFrom, jTo) => {
    for (let k = 0; k < K - 1; k++) {
      for (let j = jFrom; j < jTo; j++) {
        const j1 = (j + 1) % M;
        const p00 = k * M + j;
        const p01 = k * M + j1;
        const p10 = (k + 1) * M + j;
        const p11 = (k + 1) * M + j1;
        index[w++] = p00;
        index[w++] = p11;
        index[w++] = p01;
        index[w++] = p00;
        index[w++] = p10;
        index[w++] = p11;
      }
    }
  };
  let start = 0;
  emit(0, OUTER_N - 1); // fleur
  groups.push({ start, count: w - start, materialIndex: 0 });
  start = w;
  emit(IDX_INNER, IDX_INNER + INNER_N - 1); // doublure
  groups.push({ start, count: w - start, materialIndex: 1 });
  start = w;
  emit(OUTER_N - 1, IDX_INNER); // tranche +
  emit(IDX_INNER + INNER_N - 1, M); // tranche −
  const c0 = K * M;
  const c1 = K * M + 1;
  for (let j = 0; j < M; j++) {
    const j1 = (j + 1) % M;
    index[w++] = c0;
    index[w++] = j;
    index[w++] = j1;
    index[w++] = c1;
    index[w++] = (K - 1) * M + j1;
    index[w++] = (K - 1) * M + j;
  }
  groups.push({ start, count: w - start, materialIndex: 2 });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('aOcc', new BufferAttribute(occ, 1).setUsage(DynamicDrawUsage));
  geometry.setIndex(new BufferAttribute(index, 1));
  for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex);

  L.geometry = geometry;
  L.stitches = layoutStitches(L);
  buildFlowOcclusion(L);
  return L;
}

// ---------------------------------------------------------------------------
// Mise en pose
// ---------------------------------------------------------------------------

/** Recalcule les repères d'anneaux puis positions et normales pour la pose courante. */
export function poseStrap(L, pose) {
  const { K, M, spec, rc, rt, rb, rn } = L;
  const { pos, T, B, N, kappa } = pose;
  const Rc = spec.foldRadius;

  for (let k = 0; k < K; k++) {
    const o = k * 3;
    const region = L.region[k];
    if (region === REGION_MAIN) {
      const f = Math.min(L.param[k] / STEP, pose.n - 1.0001);
      const i = Math.floor(f);
      const t = f - i;
      const i0 = i * 3;
      const i1 = i0 + 3;
      for (let q = 0; q < 3; q++) {
        rc[o + q] = pos[i0 + q] + (pos[i1 + q] - pos[i0 + q]) * t;
        rt[o + q] = T[i0 + q] + (T[i1 + q] - T[i0 + q]) * t;
        rb[o + q] = B[i0 + q] + (B[i1 + q] - B[i0 + q]) * t;
        rn[o + q] = N[i0 + q] + (N[i1 + q] - N[i0 + q]) * t;
      }
    } else if (region === REGION_FOLD) {
      const al = L.param[k];
      const ca = Math.cos(al);
      const sa = Math.sin(al);
      for (let q = 0; q < 3; q++) {
        const axis = pos[q] - N[q] * Rc;
        rn[o + q] = ca * N[q] - sa * T[q];
        rt[o + q] = sa * N[q] + ca * T[q];
        rb[o + q] = B[q];
        rc[o + q] = axis + Rc * rn[o + q];
      }
    } else {
      // Retour : courbe parallèle à la lanière, côté doublure.
      const sp = L.param[k];
      const f = Math.min(sp / STEP, pose.n - 1.0001);
      const i = Math.floor(f);
      const t = f - i;
      const i0 = i * 3;
      const i1 = i0 + 3;
      const dOff = tailOffset(spec, sp);
      const dd = (tailOffset(spec, sp + 0.05) - tailOffset(spec, Math.max(0, sp - 0.05))) / (sp < 0.05 ? 0.05 + sp : 0.1);
      const ka = kappa[i] + (kappa[i + 1] - kappa[i]) * t;
      let tx = 0;
      let ty = 0;
      let tz = 0;
      const tv = [0, 0, 0];
      for (let q = 0; q < 3; q++) {
        const Tq = T[i0 + q] + (T[i1 + q] - T[i0 + q]) * t;
        const Nq = N[i0 + q] + (N[i1 + q] - N[i0 + q]) * t;
        const Cq = pos[i0 + q] + (pos[i1 + q] - pos[i0 + q]) * t;
        rb[o + q] = B[i0 + q] + (B[i1 + q] - B[i0 + q]) * t;
        rc[o + q] = Cq - Nq * dOff;
        tv[q] = -(Tq * (1 - ka * dOff) - Nq * dd);
      }
      const l = Math.hypot(tv[0], tv[1], tv[2]) || 1;
      tx = tv[0] / l;
      ty = tv[1] / l;
      tz = tv[2] / l;
      rt[o] = tx;
      rt[o + 1] = ty;
      rt[o + 2] = tz;
      // N' = T' × B
      rn[o] = ty * rb[o + 2] - tz * rb[o + 1];
      rn[o + 1] = tz * rb[o] - tx * rb[o + 2];
      rn[o + 2] = tx * rb[o + 1] - ty * rb[o];
    }
  }

  const position = L.geometry.attributes.position.array;
  const normal = L.geometry.attributes.normal.array;
  const { lv, lh, ln } = L;
  for (let k = 0; k < K; k++) {
    const o = k * 3;
    const cx = rc[o];
    const cy = rc[o + 1];
    const cz = rc[o + 2];
    const tx = rt[o];
    const ty = rt[o + 1];
    const tz = rt[o + 2];
    const bx = rb[o];
    const by = rb[o + 1];
    const bz = rb[o + 2];
    const nx = rn[o];
    const ny = rn[o + 1];
    const nz = rn[o + 2];
    let p = k * M * 3;
    let q = k * M;
    for (let j = 0; j < M; j++, p += 3, q++) {
      const v = lv[q];
      const h = lh[q];
      position[p] = cx + bx * v + nx * h;
      position[p + 1] = cy + by * v + ny * h;
      position[p + 2] = cz + bz * v + nz * h;
      const a = ln[p];
      const b = ln[p + 1];
      const c = ln[p + 2];
      normal[p] = tx * a + bx * b + nx * c;
      normal[p + 1] = ty * a + by * b + ny * c;
      normal[p + 2] = tz * a + bz * b + nz * c;
    }
  }
  // Centres des bouchons d'extrémité.
  const e0 = K * M * 3;
  const last = (K - 1) * 3;
  for (let q = 0; q < 3; q++) {
    position[e0 + q] = rc[q];
    normal[e0 + q] = -rt[q];
    position[e0 + 3 + q] = rc[last + q];
    normal[e0 + 3 + q] = rt[last + q];
  }
  L.geometry.attributes.position.needsUpdate = true;
  L.geometry.attributes.normal.needsUpdate = true;
  L.geometry.boundingSphere = null;
  L.geometry.boundingBox = null;
}

/** Écrit l'occlusion par sommet : mélange rouleau ↔ déroulée. */
export function writeOcclusion(L, blend, floor = 0) {
  const out = L.geometry.attributes.aOcc.array;
  const { aoFlow, V } = L;
  const aoCoil = floor > 0.5 ? L.aoCoilLight : L.aoCoil;
  if (blend <= 0) out.set(aoCoil);
  else if (blend >= 1) out.set(aoFlow);
  else for (let i = 0; i < V; i++) out[i] = aoCoil[i] + (aoFlow[i] - aoCoil[i]) * blend;
  L.geometry.attributes.aOcc.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Échantillonnage de la surface (coutures, monogramme, perçages, cadrages)
// ---------------------------------------------------------------------------

function ringAt(L, sigma) {
  const sg = L.sigma;
  let lo = 0;
  let hi = L.K - 1;
  if (sigma <= sg[0]) return [0, 0];
  if (sigma >= sg[hi]) return [hi - 1, 1];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sg[mid] <= sigma) lo = mid;
    else hi = mid;
  }
  return [lo, (sigma - sg[lo]) / (sg[hi] - sg[lo])];
}

/** Hauteur de la fleur au-dessus de la fibre neutre, à l'anneau k et à l'écart latéral v. */
function outerHeight(L, k, v) {
  const av = Math.abs(v);
  const g = L.rGe[k];
  const gw = L.spec.grooveHalf;
  const inner = g - gw;
  const ht = L.rHt[k];
  if (av <= inner) {
    const x = av / Math.max(inner, 1e-3);
    return ht + L.rDe[k] * (1 - x * x);
  }
  if (av <= g + gw) {
    const x = Math.abs(av - g) / gw;
    const depth = x < 0.5 ? lerp(1, 0.8, x / 0.5) : lerp(0.8, 0, (x - 0.5) / 0.5);
    return ht - L.rGde[k] * depth;
  }
  return ht;
}

/**
 * Point de la surface : face = +1 (fleur) ou −1 (doublure), `lift` = décollement le long de la normale.
 * Écrit out.pos, out.T, out.B, out.N (N = normale sortante de la face demandée).
 */
export function surfaceAt(L, sigma, v, face, lift, out) {
  const [k, t] = ringAt(L, sigma);
  const o0 = k * 3;
  const o1 = o0 + 3;
  const { rc, rt, rb, rn } = L;
  const h =
    face > 0
      ? lerp(outerHeight(L, k, v), outerHeight(L, k + 1, v), t) + lift
      : -lerp(L.rHt[k], L.rHt[k + 1], t) - lift;
  for (let q = 0; q < 3; q++) {
    const T = rt[o0 + q] + (rt[o1 + q] - rt[o0 + q]) * t;
    const B = rb[o0 + q] + (rb[o1 + q] - rb[o0 + q]) * t;
    const N = rn[o0 + q] + (rn[o1 + q] - rn[o0 + q]) * t;
    const C = rc[o0 + q] + (rc[o1 + q] - rc[o0 + q]) * t;
    out.T[q] = T;
    out.B[q] = B;
    out.N[q] = face > 0 ? N : -N;
    out.pos[q] = C + B * v + N * h;
  }
  return out;
}

export const makeSample = () => ({ pos: [0, 0, 0], T: [0, 0, 0], B: [0, 0, 0], N: [0, 0, 0] });

// ---------------------------------------------------------------------------
// Coutures : point sellier, un brin par instance
// ---------------------------------------------------------------------------

function layoutStitches(L) {
  const { spec } = L;
  const list = []; // [sigma, v, dSigma, dV, face, ringIndex, ringT, profileIndex]
  const pitch = spec.stitchPitch;
  const apex = stitchApexS(spec);

  const pushRow = (sFrom, face, side, slant) => {
    // Chemin (s, v = ±g(s)) paramétré par sa longueur d'arc.
    const pts = [];
    const stepS = 0.25;
    let len = 0;
    let prev = null;
    for (let s = sFrom; s <= apex + 1e-6; s += stepS) {
      const v = stitchOffsetAt(spec, Math.min(s, apex));
      if (prev) len += Math.hypot(s - prev[0], v - prev[1]);
      prev = [s, v, len];
      pts.push(prev);
    }
    const count = Math.floor((len - pitch * 0.5) / pitch);
    const first = len - pitch * 0.5 - (count - 1) * pitch; // dernier point à un demi-pas du sommet
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      const target = first + i * pitch;
      while (cursor < pts.length - 2 && pts[cursor + 1][2] < target) cursor++;
      const p0 = pts[cursor];
      const p1 = pts[cursor + 1];
      const t = (target - p0[2]) / Math.max(1e-6, p1[2] - p0[2]);
      const s = lerp(p0[0], p1[0], t);
      const v = lerp(p0[1], p1[1], t);
      let ds = p1[0] - p0[0];
      let dv = p1[1] - p0[1];
      const l = Math.hypot(ds, dv) || 1;
      ds /= l;
      dv /= l;
      // Inclinaison du point sellier.
      const ca = Math.cos(slant * side);
      const sa = Math.sin(slant * side);
      const rs = ds * ca - dv * sa;
      const rv = ds * sa + dv * ca;
      add(s, v * side, rs, rv * side, face);
    }
  };

  const add = (s, v, ds, dv, face) => {
    const sigma = spec.sigma0 + s;
    const [k, t] = ringAt(L, sigma);
    // Sommet de section le plus proche, pour hériter de son occlusion.
    let j = face > 0 ? (v < 0 ? IDX_GROOVE_NEG : IDX_GROOVE_POS) : IDX_INNER;
    if (face < 0) {
      let best = Infinity;
      for (let q = IDX_INNER; q < IDX_INNER + INNER_N; q++) {
        const dist = Math.abs(L.lv[k * L.M + q] - v);
        if (dist < best) {
          best = dist;
          j = q;
        }
      }
    } else if (Math.abs(v) < 4) {
      j = 10;
    }
    list.push(sigma, v, ds, dv, face, k, t, j);
  };

  const slant = 0.2;
  pushRow(5.5, 1, 1, slant);
  pushRow(5.5, 1, -1, slant);
  pushRow(spec.tailLength + 3, -1, 1, 0.05);
  pushRow(spec.tailLength + 3, -1, -1, 0.05);
  // Piqûres transversales de part et d'autre du passant.
  for (const s of spec.crossRows) {
    const half = spec.hw - spec.stitchInset - 2.2;
    const n = Math.floor((2 * half) / pitch);
    const v0 = -((n - 1) * pitch) / 2;
    for (let i = 0; i < n; i++) add(s + 0.25 * Math.sin(i * 1.7), v0 + i * pitch, Math.sin(slant), Math.cos(slant), 1);
  }

  const STRIDE = 8;
  return { data: new Float32Array(list), count: list.length / STRIDE, STRIDE };
}

const _smp = makeSample();

/** Écrit les matrices d'instance (Float32Array 16·n) et l'occlusion des brins. */
export function poseStitches(L, matrices, occ) {
  const { data, count, STRIDE } = L.stitches;
  const ao = L.geometry.attributes.aOcc.array;
  const len = L.spec.stitchLength;
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    const sigma = data[o];
    const v = data[o + 1];
    const ds = data[o + 2];
    const dv = data[o + 3];
    const face = data[o + 4];
    const lift = face > 0 ? 0.02 : -0.06;
    surfaceAt(L, sigma, v, face, lift, _smp);
    const { T, B, N, pos } = _smp;
    // X = direction du brin, Z = normale de la face, Y = Z × X
    let xx = T[0] * ds + B[0] * dv;
    let xy = T[1] * ds + B[1] * dv;
    let xz = T[2] * ds + B[2] * dv;
    const l = Math.hypot(xx, xy, xz) || 1;
    xx /= l;
    xy /= l;
    xz /= l;
    const zx = N[0];
    const zy = N[1];
    const zz = N[2];
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const m = i * 16;
    matrices[m] = xx * len;
    matrices[m + 1] = xy * len;
    matrices[m + 2] = xz * len;
    matrices[m + 3] = 0;
    matrices[m + 4] = yx;
    matrices[m + 5] = yy;
    matrices[m + 6] = yz;
    matrices[m + 7] = 0;
    matrices[m + 8] = zx;
    matrices[m + 9] = zy;
    matrices[m + 10] = zz;
    matrices[m + 11] = 0;
    matrices[m + 12] = pos[0];
    matrices[m + 13] = pos[1];
    matrices[m + 14] = pos[2];
    matrices[m + 15] = 1;
    const k = data[o + 5];
    const t = data[o + 6];
    const j = data[o + 7];
    const a0 = ao[k * L.M + j];
    const a1 = ao[(k + 1) * L.M + j];
    occ[i] = a0 + (a1 - a0) * t;
  }
}

// ---------------------------------------------------------------------------
// Occlusion ambiante
// ---------------------------------------------------------------------------

function contactFactor(L, k) {
  // Ombre de contact sous le passant.
  if (L.region[k] !== REGION_MAIN) return 1;
  const { spec } = L;
  const d = Math.abs(L.param[k] - spec.keeperAt) - spec.keeperWidth / 2;
  return lerp(0.3, 1, smoothstep(-1, 4.5, d));
}

function buildFlowOcclusion(L) {
  const { K, M, spec, aoFlow } = L;
  for (let k = 0; k < K; k++) {
    const region = L.region[k];
    const cf = contactFactor(L, k);
    for (let j = 0; j < M; j++) {
      let ao = 1;
      const inner = j >= IDX_INNER && j < IDX_INNER + INNER_N;
      if (region === REGION_TAIL) {
        if (inner) ao = 0.12;
        else if (j >= OUTER_N) ao = 0.6;
      } else if (region === REGION_FOLD) {
        if (inner) ao = 0.15;
      } else if (inner) {
        ao = lerp(0.12, 1, smoothstep(spec.tailLength - 2, spec.tailLength + 9, L.param[k]));
      } else if (j >= OUTER_N) {
        ao = lerp(0.6, 1, smoothstep(spec.tailLength - 2, spec.tailLength + 6, L.param[k]));
      }
      aoFlow[k * M + j] = ao * cf;
    }
  }
  aoFlow[K * M] = aoFlow[0];
  aoFlow[K * M + 1] = aoFlow[(K - 1) * M];
}

const F_SKY = (al) => 1 - (2 * al + Math.sin(2 * al)) / Math.PI; // part de ciel au-dessus de l'angle al

/**
 * Occlusion du rouleau. Le rouleau est une extrusion verticale : on lance, en vue de dessus,
 * quelques rayons par anneau et par face contre la polyligne de la lanière, puis on intègre
 * analytiquement en élévation. Appelée une fois par largeur (pose rouleau au repos).
 */
export function buildCoilOcclusion(L) {
  const { K, M, rc, rn, rb } = L;
  const RAYS = 7;
  const SPREAD = (72 * Math.PI) / 180;
  const rayAng = [];
  const rayW = [];
  for (let r = 0; r < RAYS; r++) {
    const a = -SPREAD + (2 * SPREAD * r) / (RAYS - 1);
    rayAng.push(a);
    rayW.push(Math.cos(a));
  }
  const GROUNDS = [0.3, 0.95]; // luminosité relative de l'hémisphère bas : plateau sombre, plateau clair

  const px = new Float32Array(K);
  const pz = new Float32Array(K);
  const top = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    px[k] = rc[k * 3];
    pz[k] = rc[k * 3 + 2];
    top[k] = rc[k * 3 + 1] + L.rHw[k];
  }

  // dist[(k·2 + face)·RAYS + r], occTop idem ; -1 = rayon libre
  const dist = new Float32Array(K * 2 * RAYS).fill(-1);
  const occTop = new Float32Array(K * 2 * RAYS);
  const cast = (k, face) => {
    const o = k * 3;
    let nx = rn[o] * face;
    let nz = rn[o + 2] * face;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const off = L.rHt[k] + 0.03;
    const ox = px[k] + nx * off;
    const oz = pz[k] + nz * off;
    for (let r = 0; r < RAYS; r++) {
      const ca = Math.cos(rayAng[r]);
      const sa = Math.sin(rayAng[r]);
      const dx = nx * ca - nz * sa;
      const dz = nx * sa + nz * ca;
      let best = Infinity;
      let bestSeg = -1;
      for (let s = 0; s < K - 1; s++) {
        if (s === k || s === k - 1) continue;
        const ax = px[s] - ox;
        const az = pz[s] - oz;
        const ex = px[s + 1] - px[s];
        const ez = pz[s + 1] - pz[s];
        const den = dx * ez - dz * ex;
        if (den > -1e-9 && den < 1e-9) continue;
        const t = (ax * ez - az * ex) / den;
        if (t <= 0 || t >= best) continue;
        const u = (ax * dz - az * dx) / den;
        if (u < 0 || u > 1) continue;
        best = t;
        bestSeg = s;
      }
      const i = (k * 2 + (face > 0 ? 0 : 1)) * RAYS + r;
      if (bestSeg >= 0) {
        dist[i] = Math.max(0.25, best - L.rHt[bestSeg]);
        occTop[i] = Math.max(top[bestSeg], top[bestSeg + 1]);
      }
    }
  };

  // Un anneau sur deux dans la partie courante ; les autres sont recopiés.
  const done = new Uint8Array(K);
  for (let k = 0; k < K; k++) {
    if (L.region[k] === REGION_MAIN && k % 2 === 1 && k < K - 1) continue;
    cast(k, 1);
    cast(k, -1);
    done[k] = 1;
  }
  for (let k = 0; k < K; k++) {
    if (done[k]) continue;
    const src = k - 1;
    for (let f = 0; f < 2; f++) {
      for (let r = 0; r < RAYS; r++) {
        dist[(k * 2 + f) * RAYS + r] = dist[(src * 2 + f) * RAYS + r];
        occTop[(k * 2 + f) * RAYS + r] = occTop[(src * 2 + f) * RAYS + r];
      }
    }
  }

  const vis = [0, 0];
  const visibility = (k, f, y) => {
    let skySum = 0;
    let groundSum = 0;
    let wsum = 0;
    for (let r = 0; r < RAYS; r++) {
      const i = (k * 2 + f) * RAYS + r;
      const w = rayW[r];
      const g = dist[i];
      let sky = 1;
      let ground = 1 - 0.5 * Math.exp(-Math.max(0, y) / 9);
      if (g >= 0) {
        const al = Math.atan2(occTop[i] - y, g);
        sky = al > 0 ? F_SKY(al) : 1;
        ground = F_SKY(Math.atan2(Math.max(0, y), g)) * smoothstep(0, 30, g);
        sky += (1 - sky) * 0.22 * sky; // rebond sur la spire d'en face
      }
      skySum += w * sky;
      groundSum += w * ground;
      wsum += w;
    }
    for (let g = 0; g < 2; g++) vis[g] = (0.5 * skySum + 0.5 * GROUNDS[g] * groundSum) / (wsum * (0.5 + 0.5 * GROUNDS[g]));
    return vis;
  };

  const position = L.geometry.attributes.position.array;
  for (let k = 0; k < K; k++) {
    const by = rb[k * 3 + 1]; // ±1 dans le rouleau
    const cf = contactFactor(L, k);
    for (let j = 0; j < M; j++) {
      const o = k * M + j;
      const y = position[o * 3 + 1];
      const nB = L.ln[o * 3 + 1] * by; // composante verticale de la normale
      const f = L.ln[o * 3 + 2] >= 0 ? 0 : 1;
      visibility(k, f, y);
      const up = Math.abs(nB);
      // léger dégradé vers le sol : la ceinture « pèse » sur son support
      const weight = lerp(0.8, 1, smoothstep(0, 24, y));
      for (let g = 0; g < 2; g++) {
        let ao = vis[g];
        if (up > 0.05) ao = lerp(ao, nB > 0 ? 1 : 0.06, smoothstep(0.05, 0.95, up));
        (g ? L.aoCoilLight : L.aoCoil)[o] = lerp(0.05, 1, Math.pow(clamp(ao, 0, 1), 0.9)) * cf * weight;
      }
    }
  }
  for (const arr of [L.aoCoil, L.aoCoilLight]) {
    arr[K * M] = arr[0];
    arr[K * M + 1] = arr[(K - 1) * M];
  }
}

export { IDX_GROOVE_NEG, IDX_GROOVE_POS, OUTER_N };
