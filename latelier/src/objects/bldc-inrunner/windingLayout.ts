/**
 * Tracé PUR (sans three.js) du bobinage : chemin continu du fil de chaque phase, depuis la
 * languette de sortie jusqu'au point neutre, spire par spire, avec la position de chaque brin.
 *
 * - Dans l'encoche, les brins sont rangés individuellement (empilement hexagonal) et groupés en
 *   conducteurs (une spire = un passage d'encoche) : c'est l'aspect réel d'une encoche pleine.
 * - Dans les têtes de bobines, chaque conducteur redevient un faisceau rond ; les faisceaux d'une
 *   bobine forment une nappe (colonnes radiales × couches axiales) qui suit une spirale radiale
 *   (bobinage réparti : de l'alésage vers l'extérieur, comme un panier) ou reste au rayon de
 *   l'encoche (bobinage concentré autour d'une dent).
 * - Le fil est continu : les changements de rangée d'une spire à la suivante se font dans les
 *   têtes de bobines ; les bobines d'une phase sont reliées en série par des liaisons passant
 *   au sommet des têtes de bobines.
 *
 * Unités : mm, repère du moteur (x axial, y = r cos θ, z = r sin θ).
 */
import { slotAngle, type BldcDims, type CoilDef } from './params';
import { packSlot, type ConductorCluster } from './lamination';
import type { P2 } from './profile2d';

export type V3 = [number, number, number];

/** Fil d'une phase. */
export interface PhaseWire {
  phase: 0 | 1 | 2;
  /** Centres du conducteur (mm), n × 3. */
  centers: Float32Array;
  /** Rayon du conducteur (maillage simplifié) par échantillon. */
  radius: Float32Array;
  /** Décalage de chaque brin par échantillon : n × brins × 3. */
  strandOffsets: Float32Array;
  /** Abscisse curviligne cumulée (mm). */
  arc: Float32Array;
  count: number;
  /** Dernier échantillon de la queue de sortie (languette → entrée de la 1re encoche). */
  tailEnd: number;
  /** Dernier échantillon couvert par la gaine de la queue. */
  sleeveEnd: number;
  /** Premier échantillon de la liaison vers le point neutre. */
  neutralStart: number;
  /** Côté du point neutre (+1 avant, −1 arrière). */
  neutralSide: 1 | -1;
}

export interface WindingLayout {
  phases: PhaseWire[];
  strands: number;
  /** Rayon d'un brin (émail compris), éventuellement réduit par le tassement. */
  strandRadius: number;
  /** Tassement appliqué dans l'encoche (1 = aucun). */
  packScale: number;
  /** Rayon d'un conducteur rond (têtes de bobines). */
  bundleRadius: number;
  /** Point neutre : base, direction (axiale sortante), longueur de gaine. */
  neutral: { base: V3; dir: V3; length: number; radius: number; side: 1 | -1 };
  /** Œillets des languettes (départ de chaque phase). */
  eyelets: V3[];
  /** Enveloppe des têtes de bobines par côté : hauteur axiale max (au-delà de la face du paquet) par secteur. */
  envelope: { front: Float32Array; rear: Float32Array; bins: number; rMin: number; rMax: number };
  /** Hauteur max des têtes de bobines (liaisons comprises) au-delà du paquet. */
  maxHeight: number;
}

// --- Outils ------------------------------------------------------------------------------------

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smoothstep = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
const smootherstep = (t: number) => {
  const u = clamp01(t);
  return u * u * u * (u * (u * 6 - 15) + 10);
};

/** Échantillon en construction. */
interface Sample {
  p: V3;
  /** Angle (rad) du repère cylindrique local. */
  theta: number;
  /** 0 = brins rangés comme dans l'encoche, 1 = faisceau rond. */
  w: number;
  /** Décalages des brins « forme encoche » (repère cylindrique : radial, latéral). */
  slot: P2[] | null;
}

/** Côté d'encoche occupé par une bobine : angle, grappes (repère local), miroir. */
interface SlotSide {
  angle: number;
  clusters: ConductorCluster[];
  mirrored: boolean;
}

/** Conducteur k d'un côté d'encoche : barycentre (rayon, latéral) et décalages des brins (identité conservée). */
interface ConductorAt {
  angle: number;
  R: number;
  lat: number;
  offsets: P2[];
}

/** Rayon et angle de sortie d'un point (y, z). */
const cyl = (p: V3) => ({ r: Math.hypot(p[1], p[2]), theta: Math.atan2(p[2], p[1]) });

const point = (x: number, r: number, theta: number, lat = 0): V3 => [
  x,
  r * Math.cos(theta) - lat * Math.sin(theta),
  r * Math.sin(theta) + lat * Math.cos(theta),
];

/** Écart angulaire signé le plus court de a vers b. */
const shortest = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Catmull-Rom centripète échantillonnée (pas ≈ `step`), extrémités incluses. */
function catmullRom(points: readonly V3[], step: number): V3[] {
  const out: V3[] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(n - 1, i + 2)]!;
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const m = Math.max(2, Math.ceil(seg / step));
    for (let k = i === 0 ? 0 : 1; k <= m; k++) {
      const t = k / m;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  return out;
}

// --- Construction ------------------------------------------------------------------------------

export interface LayoutQuality {
  /** Échantillons par tête de bobine. */
  endTurn: number;
  /** Échantillons intérieurs par passage d'encoche. */
  slot: number;
  /** Pas des parties libres (mm). */
  step: number;
}

export const LAYOUT_QUALITY: readonly LayoutQuality[] = [
  { endTurn: 10, slot: 2, step: 1.2 },
  { endTurn: 14, slot: 3, step: 0.9 },
  { endTurn: 20, slot: 4, step: 0.6 },
  { endTurn: 26, slot: 6, step: 0.45 },
];

export function buildWindingLayout(d: BldcDims, quality: 0 | 1 | 2 | 3 = 2): WindingLayout {
  const q = LAYOUT_QUALITY[quality]!;
  const st = d.stator;
  const w = d.winding;
  const sp = w.spec;
  const half = st.stackLength / 2;
  const nS = w.strands;
  const conductors = Math.ceil(w.turns);
  const side = sp.layers === 1 ? 'full' : 'right';
  const pack = packSlot({ ...st, slot0: 0 }, st.liner, conductors, nS, w.strandOuterD / 2, side);
  const rs = pack.radius;
  // Faisceau rond d'un conducteur dans les têtes de bobines (brins jointifs).
  const round: P2[] = w.strandOffsets.map(([a, b]) => [
    (a * rs) / (w.strandOuterD / 2),
    (b * rs) / (w.strandOuterD / 2),
  ]);
  const rb = round.reduce((m, p) => Math.max(m, Math.hypot(p[0], p[1])), 0) + rs;
  const req = rs * Math.sqrt(nS) * 1.05;

  // Identité des brins : le brin k occupe, dans chaque grappe, la position de même rang angulaire.
  const roundOrder = round.map((p, k) => ({ k, a: Math.atan2(p[1], p[0]) })).sort((a, b) => a.a - b.a);
  const clusterOffsets = pack.clusters.map((c) => {
    const rel = c.strands.map((s) => [s.x - c.x, s.y - c.y] as P2);
    const order = rel.map((p, i) => ({ i, a: Math.atan2(p[1], p[0]) })).sort((a, b) => a.a - b.a);
    const byStrand: P2[] = new Array<P2>(nS);
    roundOrder.forEach((ro, rank) => {
      byStrand[ro.k] = rel[order[rank]!.i]!;
    });
    return byStrand;
  });

  const conductorAt = (s: SlotSide, k: number): ConductorAt => {
    const c = s.clusters[k]!;
    const m = s.mirrored ? -1 : 1;
    return {
      angle: s.angle,
      R: c.x,
      lat: c.y * m,
      offsets: clusterOffsets[k]!.map(([a, b]) => [a, b * m] as P2),
    };
  };

  // Nappe des têtes de bobines : colonnes radiales × couches axiales, dans le volume disponible
  // entre la face du paquet et le voile de la flasque (liaisons comprises, au sommet).
  const spanSlots = sp.pitch;
  const budget = d.webX - half - 0.3;
  const runBase = 0.3 * d.s + rb;
  const rowsMax = Math.max(1, Math.floor((budget - 0.4 * d.s - 4.3 * rb) / (2.04 * rb)) + 1);
  const radialRoom =
    sp.kind === 'concentrated' ? st.Rsb - st.Ri - st.tipHeight - st.wedgeHeight : 0.5 * (st.Ro - st.Ri);
  const colsMax = Math.max(1, Math.floor(radialRoom / (2 * rb)));
  const cols = Math.min(colsMax, Math.max(1, Math.ceil(conductors / rowsMax)));
  const cell = (k: number) => {
    const col = k % cols;
    const row = Math.floor(k / cols);
    return { rho: (col - (cols - 1) / 2) * 2 * rb * 1.02, h: row * 2 * rb * 1.02 };
  };
  const tRun = cols * 2 * rb;
  // Bord intérieur des nappes : au-dessus de l'alésage, et au-delà des capteurs Hall s'il y en a.
  const rIn = Math.max(st.Ri + 0.25, d.params.sensors ? d.hall.r1 + 0.3 : 0) + tRun / 2;
  const rOut = st.Ro - 0.35 - tRun / 2;
  const rows = Math.ceil(conductors / cols);
  const runTop = runBase + (rows - 1) * 2 * rb * 1.02 + rb;
  // Liaisons (entre bobines, sorties, point neutre) : au sommet des têtes de bobines, en périphérie.
  const linkH = runTop + rb * 1.15 + 0.05;
  const linkR = st.Ro - 0.4 - rb;

  // Plan des phases : ordre des bobines (la première est la plus proche de la languette) et
  // angle de sortie (dernier passage) pour placer le point neutre au plus près des trois fins.
  const passes = Math.round(w.turns * 2);
  const goAngle = (c: CoilDef) => slotAngle(d, c.go);
  const plans = ([0, 1, 2] as const).map((phase) => {
    const coils = sp.coils.filter((c) => c.phase === phase);
    const tabTheta = Math.atan2(d.tabs.z[phase]!, d.leadHoles[phase]!.y);
    const first = coils.reduce((best, c) =>
      Math.abs(shortest(tabTheta, goAngle(c))) < Math.abs(shortest(tabTheta, goAngle(best))) ? c : best,
    );
    const ordered = [...coils].sort((a, b) => {
      const da = (((goAngle(a) - goAngle(first)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const db = (((goAngle(b) - goAngle(first)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return da - db;
    });
    const lastCoil = ordered[ordered.length - 1]!;
    const exitAngle = slotAngle(d, passes % 2 === 1 ? lastCoil.go : lastCoil.ret);
    return { ordered, exitAngle };
  });
  // Point neutre : moyenne circulaire des sorties, épissure tangentielle au sommet des têtes.
  const thetaN = Math.atan2(
    plans.reduce((a, p) => a + Math.sin(p.exitAngle), 0),
    plans.reduce((a, p) => a + Math.cos(p.exitAngle), 0),
  );
  const sleeveLen = 3.6 * d.s;

  const samples: Sample[] = [];
  const phases: PhaseWire[] = [];

  /** Passage rectiligne dans l'encoche (points intérieurs seulement). */
  const slotPass = (c: ConductorAt, from: 1 | -1) => {
    for (let k = 1; k <= q.slot; k++) {
      const t = k / (q.slot + 1);
      const x = from * half * (1 - 2 * t);
      samples.push({ p: point(x, c.R, c.angle, c.lat), theta: c.angle, w: 0, slot: c.offsets });
    }
  };

  /**
   * Tête de bobine de A vers B (côté χ), s ∈ [s0, s1]. `rRunA/B` : rayons de nappe aux deux
   * bouts, `cellK` : case de la nappe, `height` : base axiale de la nappe.
   */
  const endTurn = (
    A: ConductorAt,
    B: ConductorAt,
    dTheta: number,
    chi: 1 | -1,
    rRunA: number,
    rRunB: number,
    height: number,
    cellK: { rho: number; h: number },
    s0 = 0,
    s1 = 1,
    n = q.endTurn,
  ) => {
    for (let k = 0; k <= n; k++) {
      const s = s0 + ((s1 - s0) * k) / n;
      const e = smootherstep((s - 0.12) / 0.76);
      const ww = smoothstep(s / 0.28) * smoothstep((1 - s) / 0.28);
      const lift = Math.pow(Math.sin(Math.PI * s), 0.4);
      const theta = A.angle + dTheta * e;
      const Rslot = A.R * (1 - e) + B.R * e;
      const rRun = rRunA * (1 - e) + rRunB * e;
      const r = Rslot * (1 - ww) + (rRun + cellK.rho) * ww;
      const lat = (A.lat * (1 - e) + B.lat * e) * (1 - ww);
      const ax = lift * (height + ww * cellK.h);
      const slot = A.offsets.map((o, i) => {
        const b = B.offsets[i]!;
        return [o[0] * (1 - e) + b[0] * e, o[1] * (1 - e) + b[1] * e] as P2;
      });
      samples.push({ p: point(chi * (half + ax), r, theta, lat), theta, w: ww, slot });
    }
  };

  /** Arc de liaison au rayon `r`, hauteur `h`, de θa à θa + dθ (points intérieurs). */
  const linkArc = (chi: 1 | -1, r: number, h: number, thetaA: number, dTheta: number) => {
    const n = Math.max(1, Math.ceil((Math.abs(dTheta) * r) / q.step));
    for (let k = 1; k < n; k++) {
      const theta = thetaA + (dTheta * k) / n;
      samples.push({ p: point(chi * (half + h), r, theta), theta, w: 1, slot: null });
    }
  };

  /** Montée d'une sortie d'encoche jusqu'à la hauteur de liaison. */
  const ascend = (A: ConductorAt, chi: 1 | -1) =>
    endTurn(A, A, 0, chi, linkR, linkR, linkH, { rho: 0, h: 0 }, 0, 0.5, Math.ceil(q.endTurn / 2));
  /** Descente depuis la hauteur de liaison dans une encoche (premier point = sommet, exclu). */
  const descend = (B: ConductorAt, chi: 1 | -1) => {
    const start = samples.length;
    endTurn(B, B, 0, chi, linkR, linkR, linkH, { rho: 0, h: 0 }, 0.5, 1, Math.ceil(q.endTurn / 2));
    samples.splice(start, 1);
  };

  for (const phase of [0, 1, 2] as const) {
    samples.length = 0;
    const tabZ = d.tabs.z[phase]!;
    const holeY = d.leadHoles[phase]!.y;
    const { ordered } = plans[phase]!;
    const first = ordered[0]!;
    const sideOf = (c: CoilDef, which: 'go' | 'ret'): SlotSide => ({
      angle: slotAngle(d, which === 'go' ? c.go : c.ret),
      clusters: pack.clusters,
      mirrored: which === 'ret',
    });

    // --- Queue : œillet de la languette → trou de la flasque → sommet des têtes arrière -------
    const xe = d.tabs.eyeletX;
    const yTab = d.tabs.y;
    const leadY = holeY;
    const tailPts: V3[] = [
      [xe - 0.3, yTab - 1.1, tabZ],
      [xe, yTab - 0.2, tabZ],
      [xe + 0.9, leadY - 0.05, tabZ],
      [d.tabs.x0 + 0.2, leadY, tabZ],
      [-d.half + 0.5, leadY, tabZ],
      [-d.webX + 0.4, leadY, tabZ],
    ];
    const firstGo = conductorAt(sideOf(first, 'go'), 0);
    const hole = cyl([0, leadY, tabZ]);
    const topX = -(half + linkH);
    tailPts.push(point(topX - 0.6, (hole.r + linkR) / 2, hole.theta));
    tailPts.push(point(topX, linkR, hole.theta + Math.sign(shortest(hole.theta, firstGo.angle) || 1) * 0.05));
    for (const p of catmullRom(tailPts, q.step)) samples.push({ p, theta: cyl(p).theta, w: 1, slot: null });
    const sleeveEnd = samples.length - 1;
    const startTheta = cyl(samples[samples.length - 1]!.p).theta;
    linkArc(-1, linkR, linkH, startTheta, shortest(startTheta, firstGo.angle));
    samples.push({ p: point(topX, linkR, firstGo.angle), theta: firstGo.angle, w: 1, slot: null });
    descend(firstGo, -1);
    const tailEnd = samples.length - 1;

    // --- Bobines en série ------------------------------------------------------------------
    let current: 1 | -1 = -1; // côté où se trouve le fil (entrée de la bobine)
    let last: ConductorAt = firstGo;
    ordered.forEach((coil, ci) => {
      const go = sideOf(coil, 'go');
      const ret = sideOf(coil, 'ret');
      const dTheta =
        sp.kind === 'concentrated' ? (2 * Math.PI) / sp.slots : (spanSlots * 2 * Math.PI) / sp.slots;
      if (ci > 0) {
        // Liaison depuis la sortie de la bobine précédente.
        const target = conductorAt(go, 0);
        ascend(last, current);
        linkArc(current, linkR, linkH, last.angle, shortest(last.angle, target.angle));
        samples.push({
          p: point(current * (half + linkH), linkR, target.angle),
          theta: target.angle,
          w: 1,
          slot: null,
        });
        descend(target, current);
      }
      for (let m = 0; m < passes; m++) {
        const isGo = m % 2 === 0;
        const k = Math.floor(m / 2);
        const c = conductorAt(isGo ? go : ret, k);
        const from: 1 | -1 = m % 2 === 0 ? current : (-current as 1 | -1);
        slotPass(c, from);
        last = c;
        if (m === passes - 1) break;
        // Tête de bobine au bout du passage.
        const chi = -from as 1 | -1;
        const next = isGo ? conductorAt(ret, k) : conductorAt(go, k + 1);
        const cellK = cell(k);
        if (sp.kind === 'concentrated') {
          const rr = (c.R + next.R) / 2;
          endTurn(c, next, isGo ? dTheta : -dTheta, chi, rr, rr, runBase, cellK);
        } else if (isGo) endTurn(c, next, dTheta, chi, rIn, rOut, runBase, cellK);
        else endTurn(c, next, -dTheta, chi, rOut, rIn, runBase, cellK);
      }
      // Côté de sortie de la bobine.
      current = passes % 2 === 1 ? (-current as 1 | -1) : current;
      // Point de sortie (face du paquet) : fin du dernier passage.
      samples.push({
        p: point(current * half, last.R, last.angle, last.lat),
        theta: last.angle,
        w: 0,
        slot: last.offsets,
      });
    });

    // --- Liaison au point neutre : épissure dans une gaine, fils entrant par ses deux bouts ------
    const neutralSide = current;
    const neutralStart = samples.length;
    ascend(last, current);
    const dir = Math.sign(shortest(last.angle, thetaN)) || 1;
    const endTheta = thetaN - dir * (sleeveLen / 2 / linkR);
    linkArc(current, linkR, linkH, last.angle, shortest(last.angle, endTheta));
    const lane: [number, number] = [
      [0, 0],
      [0.55, 0.45],
      [-0.55, 0.45],
    ][phase]! as [number, number];
    const inside: V3[] = [
      point(current * (half + linkH), linkR, endTheta),
      point(
        current * (half + linkH + lane[1] * rb),
        linkR + lane[0] * rb,
        endTheta + (dir * (sleeveLen * 0.3)) / linkR,
      ),
      point(current * (half + linkH + lane[1] * rb), linkR + lane[0] * rb, thetaN - (dir * 0.15) / linkR),
    ];
    for (const p of catmullRom(inside, q.step)) samples.push({ p, theta: cyl(p).theta, w: 1, slot: null });

    phases.push(
      finalizePhase(phase, samples, nS, round, rs, rb, req, tailEnd, sleeveEnd, neutralStart, neutralSide),
    );
  }

  // Point neutre : gaine tangentielle posée au sommet des têtes de bobines.
  const nSide = phases[0]!.neutralSide;
  const neutral = {
    base: point(nSide * (half + linkH + 0.25 * rb), linkR, thetaN),
    dir: [0, -Math.sin(thetaN), Math.cos(thetaN)] as V3,
    length: sleeveLen,
    radius: rb * 2.3,
    side: nSide,
  };

  // Enveloppe des têtes de bobines (vernis) : hauteur max par secteur, par côté.
  const bins = 96;
  const front = new Float32Array(bins);
  const rear = new Float32Array(bins);
  let rMin = Infinity;
  let rMax = 0;
  let maxHeight = 0;
  for (const ph of phases) {
    for (let i = 0; i < ph.count; i++) {
      const x = ph.centers[i * 3]!;
      const y = ph.centers[i * 3 + 1]!;
      const z = ph.centers[i * 3 + 2]!;
      const out = Math.abs(x) - half;
      if (out <= 0 || Math.abs(x) > d.webX - 0.2 || i <= ph.sleeveEnd) continue;
      if (i >= ph.neutralStart) continue;
      const r = Math.hypot(y, z);
      const theta = Math.atan2(z, y);
      const bin = Math.floor(((((theta / (2 * Math.PI)) % 1) + 1) % 1) * bins) % bins;
      const h = out + ph.radius[i]!;
      const target = x > 0 ? front : rear;
      target[bin] = Math.max(target[bin]!, h);
      rMin = Math.min(rMin, r - ph.radius[i]!);
      rMax = Math.max(rMax, r + ph.radius[i]!);
      maxHeight = Math.max(maxHeight, h);
    }
  }
  return {
    phases,
    strands: nS,
    strandRadius: rs,
    packScale: pack.scale,
    bundleRadius: rb,
    neutral,
    eyelets: d.tabs.z.map((z) => [d.tabs.eyeletX, d.tabs.y, z] as V3),
    envelope: { front, rear, bins, rMin, rMax },
    maxHeight,
  };
}

/** Convertit les échantillons en tableaux : directions, repères des brins, rayons. */
function finalizePhase(
  phase: 0 | 1 | 2,
  samples: readonly Sample[],
  nS: number,
  round: readonly P2[],
  rs: number,
  rb: number,
  req: number,
  tailEnd: number,
  sleeveEnd: number,
  neutralStart: number,
  neutralSide: 1 | -1,
): PhaseWire {
  // Élimine les points confondus consécutifs (jonctions de tronçons).
  const list: Sample[] = [];
  const remap: number[] = [];
  for (const s of samples) {
    const prev = list[list.length - 1];
    if (prev && Math.hypot(prev.p[0] - s.p[0], prev.p[1] - s.p[1], prev.p[2] - s.p[2]) < 1e-4) {
      remap.push(list.length - 1);
      continue;
    }
    remap.push(list.length);
    list.push(s);
  }
  const n = list.length;
  const centers = new Float32Array(n * 3);
  const radius = new Float32Array(n);
  const strandOffsets = new Float32Array(n * nS * 3);
  const arc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = list[i]!;
    centers.set(s.p, i * 3);
    if (i > 0) {
      const p = list[i - 1]!.p;
      arc[i] = arc[i - 1]! + Math.hypot(s.p[0] - p[0], s.p[1] - p[1], s.p[2] - p[2]);
    }
    radius[i] = req * (1 - s.w) + rb * s.w;
    // Direction locale et repère du faisceau rond : e2 = r̂ × d, e1 = d × e2.
    const a = list[Math.max(0, i - 1)]!.p;
    const b = list[Math.min(n - 1, i + 1)]!.p;
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    let dz = b[2] - a[2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const cr = Math.hypot(s.p[1], s.p[2]) || 1;
    const ry = s.p[1] / cr;
    const rz = s.p[2] / cr;
    // r̂ = (0, ry, rz)
    let e2x = ry * dz - rz * dy;
    let e2y = rz * dx;
    let e2z = -ry * dx;
    let l2 = Math.hypot(e2x, e2y, e2z);
    if (l2 < 1e-6) {
      e2x = 1;
      e2y = 0;
      e2z = 0;
      l2 = 1;
    }
    e2x /= l2;
    e2y /= l2;
    e2z /= l2;
    const e1x = dy * e2z - dz * e2y;
    const e1y = dz * e2x - dx * e2z;
    const e1z = dx * e2y - dy * e2x;
    // Repère cylindrique de l'échantillon (forme « encoche »).
    const ct = Math.cos(s.theta);
    const stt = Math.sin(s.theta);
    for (let k = 0; k < nS; k++) {
      const [ra, rbb] = round[k]!;
      let ox = ra * e1x + rbb * e2x;
      let oy = ra * e1y + rbb * e2y;
      let oz = ra * e1z + rbb * e2z;
      if (s.slot && s.w < 1) {
        const [du, dlat] = s.slot[k]!;
        const sx = 0;
        const sy = du * ct - dlat * stt;
        const sz = du * stt + dlat * ct;
        ox = sx * (1 - s.w) + ox * s.w;
        oy = sy * (1 - s.w) + oy * s.w;
        oz = sz * (1 - s.w) + oz * s.w;
      }
      const o = (i * nS + k) * 3;
      strandOffsets[o] = ox;
      strandOffsets[o + 1] = oy;
      strandOffsets[o + 2] = oz;
    }
  }
  void rs;
  return {
    phase,
    centers,
    radius,
    strandOffsets,
    arc,
    count: n,
    tailEnd: remap[tailEnd] ?? tailEnd,
    sleeveEnd: remap[sleeveEnd] ?? sleeveEnd,
    neutralStart: remap[neutralStart] ?? neutralStart,
    neutralSide,
  };
}
