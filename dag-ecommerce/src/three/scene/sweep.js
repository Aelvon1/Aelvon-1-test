import { BufferAttribute, BufferGeometry } from 'three';

// ---------------------------------------------------------------------------
// Balayage générique d'une section fermée le long d'un chemin (pièces rigides :
// cadre de boucle, ardillon, passant). Les normales sont calculées sur la grille,
// donc lisses, y compris quand la section évolue le long du chemin.
// ---------------------------------------------------------------------------

/**
 * @param {Object} o
 * @param {Array<{c:number[], b:number[], n:number[], pts:number[], u:number}>} o.rings
 *        c = centre, b/n = axes de la section, pts = [a0, h0, a1, h1, …], u = abscisse (mm)
 * @param {boolean} [o.closed]        chemin fermé
 * @param {(j:number)=>number} [o.materialOf]  groupe du segment de section j → j+1
 * @param {boolean} [o.capStart] [o.capEnd]
 */
export function sweepGeometry({ rings, closed = false, closedLength = 0, materialOf = () => 0, capStart = false, capEnd = false }) {
  const K = rings.length;
  const rows = closed ? K + 1 : K; // chemin fermé : le premier anneau est répété (UV continues)
  const M = rings[0].pts.length / 2;
  const cols = M + 1; // couture d'UV : le premier sommet de section est dupliqué
  const caps = (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const V = rows * cols + caps;
  const position = new Float32Array(V * 3);
  const normal = new Float32Array(V * 3);
  const uv = new Float32Array(V * 2);
  const occ = new Float32Array(V).fill(1);

  const P = (k, j, out) => {
    const r = rings[k % K];
    const a = r.pts[(j % M) * 2];
    const h = r.pts[(j % M) * 2 + 1];
    out[0] = r.c[0] + r.b[0] * a + r.n[0] * h;
    out[1] = r.c[1] + r.b[1] * a + r.n[1] * h;
    out[2] = r.c[2] + r.b[2] * a + r.n[2] * h;
    return out;
  };

  const p = [0, 0, 0];
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const c = [0, 0, 0];
  const d = [0, 0, 0];
  for (let k = 0; k < rows; k++) {
    const kp = closed ? (k + K - 1) % K : Math.max(0, k - 1);
    const kn = closed ? (k + 1) % K : Math.min(K - 1, k + 1);
    let per = 0;
    for (let j = 0; j <= M; j++) {
      const o = k * cols + j;
      P(k, j, p);
      position.set(p, o * 3);
      P(kp, j, a);
      P(kn, j, b);
      P(k, j + M - 1, c);
      P(k, j + 1, d);
      const sx = b[0] - a[0];
      const sy = b[1] - a[1];
      const sz = b[2] - a[2];
      const qx = d[0] - c[0];
      const qy = d[1] - c[1];
      const qz = d[2] - c[2];
      let nx = qy * sz - qz * sy;
      let ny = qz * sx - qx * sz;
      let nz = qx * sy - qy * sx;
      const rc = rings[k % K].c;
      if (nx * (p[0] - rc[0]) + ny * (p[1] - rc[1]) + nz * (p[2] - rc[2]) < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      normal[o * 3] = nx / l;
      normal[o * 3 + 1] = ny / l;
      normal[o * 3 + 2] = nz / l;
      if (j > 0) {
        P(k, j - 1, a);
        per += Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
      }
      uv[o * 2] = k === K ? closedLength : rings[k].u;
      uv[o * 2 + 1] = per;
    }
  }

  // Indices, regroupés par matériau.
  const buckets = new Map();
  const push = (m, i0, i1, i2) => {
    if (!buckets.has(m)) buckets.set(m, []);
    buckets.get(m).push(i0, i1, i2);
  };
  // Sens des triangles : déduit d'un quad témoin.
  const kEnd = rows - 1;
  let flip = false;
  {
    const i00 = 0;
    const i01 = 1;
    const i11 = cols + 1;
    const e1 = [0, 1, 2].map((q) => position[i01 * 3 + q] - position[i00 * 3 + q]);
    const e2 = [0, 1, 2].map((q) => position[i11 * 3 + q] - position[i00 * 3 + q]);
    const tx = e1[1] * e2[2] - e1[2] * e2[1];
    const ty = e1[2] * e2[0] - e1[0] * e2[2];
    const tz = e1[0] * e2[1] - e1[1] * e2[0];
    flip = tx * normal[0] + ty * normal[1] + tz * normal[2] < 0;
  }
  for (let k = 0; k < kEnd; k++) {
    const k1 = k + 1;
    for (let j = 0; j < M; j++) {
      const p00 = k * cols + j;
      const p01 = k * cols + j + 1;
      const p10 = k1 * cols + j;
      const p11 = k1 * cols + j + 1;
      const m = materialOf(j);
      if (flip) {
        push(m, p00, p11, p01);
        push(m, p00, p10, p11);
      } else {
        push(m, p00, p01, p11);
        push(m, p00, p11, p10);
      }
    }
  }
  let extra = rows * cols;
  const cap = (k, sign) => {
    const r = rings[k];
    const kk = Math.min(K - 1, Math.max(0, k + (sign > 0 ? -1 : 1)));
    const t = [0, 1, 2].map((q) => (r.c[q] - rings[kk].c[q]) * 1);
    const l = Math.hypot(t[0], t[1], t[2]) || 1;
    position.set(r.c, extra * 3);
    normal.set(
      t.map((x) => x / l),
      extra * 3,
    );
    uv[extra * 2] = r.u;
    const m = materialOf(0);
    for (let j = 0; j < M; j++) {
      const i0 = k * cols + j;
      const i1 = k * cols + j + 1;
      if ((sign > 0) !== flip) push(m, extra, i0, i1);
      else push(m, extra, i1, i0);
    }
    extra++;
  };
  if (capStart) cap(0, -1);
  if (capEnd) cap(K - 1, 1);

  const geometry = new BufferGeometry();
  const all = [];
  for (const m of [...buckets.keys()].sort((x, y) => x - y)) {
    const list = buckets.get(m);
    geometry.addGroup(all.length, list.length, m);
    for (const i of list) all.push(i);
  }
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('normal', new BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setAttribute('aOcc', new BufferAttribute(occ, 1));
  geometry.setIndex(all);
  return geometry;
}

/** Section super-elliptique (rectangle très arrondi) : [a0, h0, …] sur M sommets. */
export function superellipse(M, halfA, halfH, power) {
  const pts = new Array(M * 2);
  for (let j = 0; j < M; j++) {
    const th = (j / M) * Math.PI * 2;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const r = Math.pow(Math.pow(Math.abs(ct / halfA), power) + Math.pow(Math.abs(st / halfH), power), -1 / power);
    pts[j * 2] = r * ct;
    pts[j * 2 + 1] = r * st;
  }
  return pts;
}

/**
 * Chemin fermé « rectangle arrondi » dans un plan : renvoie des points { x, y, tx, ty, len, corner }
 * (corner = indice du coin en cours, -1 sur les côtés droits). Parcours horaire depuis le milieu du côté x = x0.
 */
export function roundedRectPath({ x0, x1, y0, y1, radii, cornerSeg = 10, sideStep = 4 }) {
  // radii : [coin (x0,y1), coin (x1,y1), coin (x1,y0), coin (x0,y0)]
  const pts = [];
  let len = 0;
  const add = (x, y, tx, ty, corner) => {
    if (pts.length) {
      const q = pts[pts.length - 1];
      len += Math.hypot(x - q.x, y - q.y);
    }
    pts.push({ x, y, tx, ty, len, corner });
  };
  const line = (ax, ay, bx, by, skipFirst) => {
    const l = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(l / sideStep));
    for (let i = skipFirst ? 1 : 0; i < n; i++) {
      const t = i / n;
      add(ax + (bx - ax) * t, ay + (by - ay) * t, (bx - ax) / l, (by - ay) / l, -1);
    }
  };
  const arc = (cx, cy, r, a0, corner) => {
    // quart de tour horaire à partir de l'angle a0
    for (let i = 0; i <= cornerSeg; i++) {
      const a = a0 - (i / cornerSeg) * (Math.PI / 2);
      add(cx + r * Math.cos(a), cy + r * Math.sin(a), Math.sin(a), -Math.cos(a), corner + i / cornerSeg);
    }
  };
  const [r0, r1, r2, r3] = radii;
  const ym = (y0 + y1) / 2;
  line(x0, ym, x0, y1 - r0, false);
  arc(x0 + r0, y1 - r0, r0, Math.PI, 0);
  line(x0 + r0, y1, x1 - r1, y1, true);
  arc(x1 - r1, y1 - r1, r1, Math.PI / 2, 1);
  line(x1, y1 - r1, x1, y0 + r2, true);
  arc(x1 - r2, y0 + r2, r2, 0, 2);
  line(x1 - r2, y0, x0 + r3, y0, true);
  arc(x0 + r3, y0 + r3, r3, -Math.PI / 2, 3);
  line(x0, y0 + r3, x0, ym, true);
  const total = len + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return { pts, total };
}
