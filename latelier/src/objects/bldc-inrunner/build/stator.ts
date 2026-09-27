/**
 * Stator : paquet de tôles individuelles (instanciées, quantité réelle, face grise et tranche
 * bleuie), isolants d'encoche (papier aramide), bobinage par phase (conducteurs multibrins
 * continus de la languette au point neutre), point neutre gainé, vernis d'imprégnation.
 *
 * Débobinage (`onRemovalProgress`, mouvement `unwind`) : le fil disparaît depuis le point neutre
 * (plage de dessin décroissante, segment par segment) et le brin libéré s'enroule en écheveau
 * lâche au-dessus du stator ; au remontage le film se déroule à l'envers.
 */
import * as THREE from 'three/webgpu';
import type { PartBuild, PartHooks } from '../../types';
import { motionTiming } from '../../../inspection/motions';
import { laminationInnerContour } from '../lamination';
import { linerSection } from '../sections';
import { circle } from '../profile2d';
import { own } from '../materials';
import type { PhaseWire, V3 } from '../windingLayout';
import { cachedGeometry, dims, geoKey, group, instanced, layout, mesh, segs, type Ctx } from './common';
import { extrude, MeshBuilder, MM, transportFrames, tube, gridSurface } from './geom';
import { SECTION_TO_MOTOR } from './can';

// --- Paquet de tôles ----------------------------------------------------------------------------

export function buildLaminations(ctx: Ctx): PartBuild {
  const d = dims(ctx);
  const st = d.stator;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'lamination'), () => {
    // Tôles nombreuses (quantité réelle) : budget de triangles fixe pour tout le paquet, réparti
    // sur le nombre de tôles ; le chanfrein de découpe n'est gardé que s'il reste assez de budget.
    const stackBudget = [90_000, 180_000, 300_000, 380_000][ctx.quality]!;
    const perSheet = stackBudget / st.lamCount;
    const chamfer = perSheet >= 5200;
    const maxPoints = perSheet / (chamfer ? 8 : 4);
    let inner = laminationInnerContour(st, 0.22, 3);
    for (const step of [0.22, 0.28, 0.36, 0.48, 0.65, 0.9, 1.3]) {
      inner = laminationInnerContour(st, step, step < 0.4 ? 3 : 2);
      if (inner.length + 96 <= maxPoints) break;
    }
    const outer = circle(0, 0, st.Ro, Math.max(48, Math.min(128, Math.round(maxPoints - inner.length))));
    // Épaisseur visible légèrement inférieure au pas (revêtement isolant, jeu d'empilage).
    const t = st.lamPitch * 0.97;
    // Arête de découpe adoucie (chanfrein) : visible en macro sur les tôles épaisses.
    const edge = chamfer ? t * 0.07 : 0;
    const local = new MeshBuilder();
    extrude(local, outer, [inner], -t / 2, t / 2, {
      round0: edge,
      round1: edge,
      segments: 1,
      capGroup: 0,
      sideGroup: 1,
    });
    const mb = new MeshBuilder();
    mb.append(local, SECTION_TO_MOTOR);
    return mb;
  });
  const matrices = Array.from({ length: st.lamCount }, (_, i) =>
    new THREE.Matrix4().makeTranslation((st.x0 + (i + 0.5) * st.lamPitch) * MM, 0, 0),
  );
  const inst = instanced(
    geo,
    [ctx.materials.get('steel.electrical'), ctx.materials.get(own('laminationEdge'))],
    matrices,
    'stator.core',
  );
  const o = group('Paquet de tôles');
  o.add(inst);
  return { object: o, instanced: inst, instanceLabel: (i) => `Tôle n° ${i + 1} / ${st.lamCount}` };
}

// --- Isolants d'encoche -----------------------------------------------------------------------------

export function buildInsulators(ctx: Ctx): PartBuild {
  const d = dims(ctx);
  const st = d.stator;
  const rMid = (st.Ri + st.Rsb) / 2;
  const overhang = 0.8 * d.s;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'liner'), () => {
    const sec = linerSection({ ...st, slot0: 0 }, st.liner, rMid, 0.12);
    const local = new MeshBuilder();
    extrude(local, sec, [], st.x0 - overhang, st.x1 + overhang, { round0: 0.05, round1: 0.05, segments: 1 });
    const mb = new MeshBuilder();
    mb.append(local, SECTION_TO_MOTOR);
    return mb;
  });
  const matrices = Array.from({ length: st.slots }, (_, k) => {
    const a = st.slot0 + (k * 2 * Math.PI) / st.slots;
    const m = new THREE.Matrix4().makeRotationX(a);
    m.setPosition(0, rMid * Math.cos(a) * MM, rMid * Math.sin(a) * MM);
    return m;
  });
  const inst = instanced(geo, ctx.materials.get('paper.insulation'), matrices, 'stator.insulators');
  const o = group('Isolants d’encoche');
  o.add(inst);
  return { object: o, instanced: inst, instanceLabel: (i) => `Isolant de l’encoche n° ${i + 1}` };
}

// --- Bobinage ------------------------------------------------------------------------------------

/** Tubes de brins entrelacés par segment : une plage de dessin coupe tous les brins au même endroit. */
function strandTubes(
  mb: MeshBuilder,
  wire: PhaseWire,
  strands: number,
  radius: number,
  radial: number,
): { indicesPerSegment: number } {
  const n = wire.count;
  const frames = transportFrames(wire.centers, n);
  const base = mb.vertexCount;
  const ring = radial + 1;
  for (let k = 0; k < strands; k++) {
    for (let i = 0; i < n; i++) {
      const o = (i * strands + k) * 3;
      const px = wire.centers[i * 3]! + wire.strandOffsets[o]!;
      const py = wire.centers[i * 3 + 1]! + wire.strandOffsets[o + 1]!;
      const pz = wire.centers[i * 3 + 2]! + wire.strandOffsets[o + 2]!;
      const N = frames.N[i]!;
      const B = frames.B[i]!;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const nx = c * N[0] + s * B[0];
        const ny = c * N[1] + s * B[1];
        const nz = c * N[2] + s * B[2];
        mb.vertex(px + radius * nx, py + radius * ny, pz + radius * nz, nx, ny, nz, j / radial, wire.arc[i]!);
      }
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < strands; k++) {
      const s0 = base + (k * n + i) * ring;
      for (let j = 0; j < radial; j++) {
        const a = s0 + j;
        const b = a + ring;
        mb.quad(a, a + 1, b + 1, b);
      }
    }
  }
  return { indicesPerSegment: strands * radial * 6 };
}

/**
 * Repères de transport parallèle d'une polyligne (n × 3), écrits dans `N` et `B` (sans allocation).
 */
function transportFramesInto(p: Float32Array, count: number, N: Float32Array, B: Float32Array): void {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < count; i++) {
    const a = Math.max(0, i - 1) * 3;
    const b = Math.min(count - 1, i + 1) * 3;
    let tx = p[b]! - p[a]!;
    let ty = p[b + 1]! - p[a + 1]!;
    let tz = p[b + 2]! - p[a + 2]!;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    if (i === 0) {
      // Normale initiale : T × (X ou Y), la plus stable.
      if (Math.abs(tx) < 0.9) {
        nx = 0;
        ny = tz;
        nz = -ty;
      } else {
        nx = -tz;
        ny = 0;
        nz = tx;
      }
    } else {
      // Projection de la normale précédente sur le plan normal courant.
      const d = nx * tx + ny * ty + nz * tz;
      nx -= d * tx;
      ny -= d * ty;
      nz -= d * tz;
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const o = i * 3;
    N[o] = nx;
    N[o + 1] = ny;
    N[o + 2] = nz;
    // B = T × N (unitaire : T et N orthonormés).
    B[o] = ty * nz - tz * ny;
    B[o + 1] = tz * nx - tx * nz;
    B[o + 2] = tx * ny - ty * nx;
  }
}

/**
 * Écheveau du brin libéré : pont depuis le point de coupe puis spirale lâche qui s'allonge.
 * Tampons préalloués : la mise à jour (à chaque image du débobinage) n'alloue rien.
 */
class FreeStrand {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly rings: number;
  private readonly radial = 6;
  private readonly radius: number;
  private readonly pile: { center: V3; r: number; pitch: number };
  /** Ligne moyenne (mm) et repères de transport parallèle (N, B), `rings` échantillons. */
  private readonly pts: Float32Array;
  private readonly frameN: Float32Array;
  private readonly frameB: Float32Array;
  /** Cosinus/sinus des génératrices de la section. */
  private readonly cosJ: Float32Array;
  private readonly sinJ: Float32Array;

  constructor(
    material: THREE.Material,
    radius: number,
    pile: { center: V3; r: number; pitch: number },
    rings: number,
  ) {
    this.rings = rings;
    this.radius = radius;
    this.pile = pile;
    this.pts = new Float32Array(rings * 3);
    this.frameN = new Float32Array(rings * 3);
    this.frameB = new Float32Array(rings * 3);
    this.cosJ = new Float32Array(this.radial + 1);
    this.sinJ = new Float32Array(this.radial + 1);
    for (let j = 0; j <= this.radial; j++) {
      this.cosJ[j] = Math.cos((j / this.radial) * Math.PI * 2);
      this.sinJ[j] = Math.sin((j / this.radial) * Math.PI * 2);
    }
    const ring = this.radial + 1;
    const pos = new Float32Array(rings * ring * 3);
    const nor = new Float32Array(rings * ring * 3);
    const idx: number[] = [];
    for (let i = 0; i < rings - 1; i++)
      for (let j = 0; j < this.radial; j++) {
        const a = i * ring + j;
        const b = a + ring;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
      }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(idx);
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = 'Brin libéré';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Met à jour le brin libre : point de coupe (fx, fy, fz) en mm et longueur déroulée (mm). */
  update(fx: number, fy: number, fz: number, length: number): void {
    if (length < 0.5) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const { center, r, pitch } = this.pile;
    const pts = this.pts;
    // Point d'entrée de l'écheveau et pont (courbe de Bézier quadratique) depuis le point de coupe.
    const ex = center[0];
    const ey = center[1] - r * 0.2;
    const ez = center[2] + r;
    const cx = fx;
    const cy = Math.max(fy, ey) + 6;
    const cz = (fz + ez) / 2;
    const bridgeLen = Math.hypot(ex - fx, ey - fy, ez - fz) * 1.2;
    const helixLen = Math.max(0, length - bridgeLen);
    const bridgeRings = Math.max(2, Math.min(24, Math.ceil(Math.min(length, bridgeLen) / 1.2)));
    const bridgeFrac = Math.min(1, length / bridgeLen);
    for (let i = 0; i < bridgeRings; i++) {
      const t = (i / (bridgeRings - 1)) * bridgeFrac;
      const u = 1 - t;
      pts[i * 3] = u * u * fx + 2 * u * t * cx + t * t * ex;
      pts[i * 3 + 1] = u * u * fy + 2 * u * t * cy + t * t * ey;
      pts[i * 3 + 2] = u * u * fz + 2 * u * t * cz + t * t * ez;
    }
    // Spirale lâche d'axe X (écheveau posé à côté du stator), qui s'allonge avec le fil libéré.
    const turnLen = 2 * Math.PI * r;
    const helixRings = Math.min(this.rings - bridgeRings, Math.ceil(helixLen / 1.1));
    for (let i = 1; i <= helixRings; i++) {
      const sLen = (i / helixRings) * helixLen;
      const a = (sLen / turnLen) * Math.PI * 2 + Math.PI / 2;
      const rr = r + 0.12 * r * Math.sin(a * 2.3);
      const o = (bridgeRings + i - 1) * 3;
      pts[o] = center[0] + (sLen / turnLen) * pitch;
      pts[o + 1] = center[1] + rr * Math.cos(a) - r * 0.2;
      pts[o + 2] = center[2] + rr * Math.sin(a);
    }
    const count = bridgeRings + helixRings;
    transportFramesInto(pts, count, this.frameN, this.frameB);
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const nor = this.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const N = this.frameN;
    const B = this.frameB;
    const ring = this.radial + 1;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      for (let j = 0; j <= this.radial; j++) {
        const c = this.cosJ[j]!;
        const sn = this.sinJ[j]!;
        const nx = c * N[i3]! + sn * B[i3]!;
        const ny = c * N[i3 + 1]! + sn * B[i3 + 1]!;
        const nz = c * N[i3 + 2]! + sn * B[i3 + 2]!;
        const v = i * ring + j;
        pos.setXYZ(
          v,
          (pts[i3]! + this.radius * nx) * MM,
          (pts[i3 + 1]! + this.radius * ny) * MM,
          (pts[i3 + 2]! + this.radius * nz) * MM,
        );
        nor.setXYZ(v, nx, ny, nz);
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, count - 1) * this.radial * 6);
    this.geometry.computeBoundingBox();
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** État partagé d'une phase : maillages à tronquer (base, détail) et brin libre. */
interface PhaseState {
  wire: PhaseWire;
  visible: number;
  base: { mesh: THREE.Mesh; perSegment: number } | null;
  detail: { mesh: THREE.Mesh; perSegment: number } | null;
  sleeve: { mesh: THREE.Mesh; perSegment: number; start: number; segments: number } | null;
  free: FreeStrand | null;
}

const phaseKey = (phase: number) => `bldcPhaseState${phase}`;
const ENAMEL = ['enamelA', 'enamelB', 'enamelC'] as const;
const SLEEVE = ['sleeveA', 'sleeveB', 'sleeveC'] as const;

/** Applique le nombre de segments visibles aux maillages de la phase. */
function applyVisible(state: PhaseState): void {
  const segsVisible = Math.max(0, state.visible - 1);
  if (state.base) state.base.mesh.geometry.setDrawRange(0, segsVisible * state.base.perSegment);
  if (state.detail) state.detail.mesh.geometry.setDrawRange(0, segsVisible * state.detail.perSegment);
  if (state.sleeve) {
    const s = Math.min(state.sleeve.segments, Math.max(0, segsVisible - state.sleeve.start));
    state.sleeve.mesh.geometry.setDrawRange(0, s * state.sleeve.perSegment);
  }
}

export function buildPhase(ctx: Ctx, phase: 0 | 1 | 2): PartBuild {
  const d = dims(ctx);
  const L = layout(ctx);
  const wire = L.phases[phase]!;
  const radial = [5, 6, 8, 10][ctx.quality]!;
  const baseGeo = new MeshBuilder();
  const { indicesPerSegment } = tube(baseGeo, wire.centers, wire.count, {
    radialSegments: radial,
    radii: wire.radius,
    vScale: 1,
  });
  const geo = baseGeo.build(MM);
  const enamel = ctx.materials.get(own(ENAMEL[phase]));
  const o = group(`Phase ${'ABC'[phase]}`);
  const base = mesh(geo, enamel, 'conductors');
  o.add(base);
  // Gaine tressée de la sortie (repère couleur de la phase) : du bornier au sommet des têtes de
  // bobines ; le bout dénudé qui traverse l'œillet de la languette reste nu.
  let sleeveStart = 0;
  while (sleeveStart < wire.sleeveEnd - 2 && wire.centers[sleeveStart * 3]! < -d.half - 1.2 * d.s)
    sleeveStart++;
  const sleeveSegments = Math.max(1, wire.sleeveEnd - sleeveStart);
  const sleeveGeoB = new MeshBuilder();
  const sleeveCount = sleeveSegments + 1;
  const sleeveRadii = new Float32Array(sleeveCount).fill(L.bundleRadius + 0.22 * d.s);
  const sleeveInfo = tube(sleeveGeoB, wire.centers.subarray(sleeveStart * 3), sleeveCount, {
    radialSegments: radial + 2,
    radii: sleeveRadii,
    vScale: 1,
  });
  const sleeveMesh = mesh(sleeveGeoB.build(MM), ctx.materials.get(own(SLEEVE[phase])), 'sleeve');
  o.add(sleeveMesh);
  // Écheveau : à côté du stator, du côté du point neutre.
  const side = wire.neutralSide;
  const free = new FreeStrand(
    enamel,
    L.bundleRadius,
    {
      center: [side * (d.stator.stackLength / 2 + 14 * d.s + phase * 5 * d.s), d.stator.Ro + 10 * d.s, 0],
      r: 7 * d.s,
      pitch: 0.9,
    },
    420,
  );
  o.add(free.mesh);
  const state: PhaseState = {
    wire,
    visible: wire.count,
    base: { mesh: base, perSegment: indicesPerSegment },
    detail: null,
    sleeve: {
      mesh: sleeveMesh,
      perSegment: sleeveInfo.indicesPerSegment,
      start: sleeveStart,
      segments: sleeveSegments,
    },
    free,
  };
  ctx.shared[phaseKey(phase)] = state;
  const { a } = motionTiming({ motion: 'unwind', distance: 0.05 }, 1);
  const hooks: PartHooks = {
    onRemovalProgress(t) {
      // Le débobinage occupe la première phase du mouvement ; la translation suit.
      const u = Math.min(1, Math.max(0, t / a));
      const eased = u * u * (3 - 2 * u);
      state.visible = Math.max(0, Math.round((1 - eased) * (wire.count - 1)) + 1);
      applyVisible(state);
      const k = Math.min(wire.count - 1, Math.max(0, state.visible - 1));
      const unwound = wire.arc[wire.count - 1]! - wire.arc[k]!;
      free.update(
        wire.centers[k * 3]!,
        wire.centers[k * 3 + 1]!,
        wire.centers[k * 3 + 2]!,
        u >= 1 ? wire.arc[wire.count - 1]! : unwound,
      );
    },
    dispose() {
      free.dispose();
    },
  };
  return { object: o, hooks };
}

/** Détail d'une phase : chaque brin émaillé modélisé (remplace les conducteurs simplifiés). */
export function buildPhaseDetail(ctx: Ctx, phase: 0 | 1 | 2): THREE.Object3D {
  const L = layout(ctx);
  const wire = L.phases[phase]!;
  const mb = new MeshBuilder();
  const radial = [5, 7, 8, 10][ctx.quality]!;
  const { indicesPerSegment } = strandTubes(mb, wire, L.strands, L.strandRadius * 0.96, radial);
  const m = mesh(mb.build(MM), ctx.materials.get(own(ENAMEL[phase])), 'strands');
  const state = ctx.shared[phaseKey(phase)] as PhaseState | undefined;
  if (state) {
    state.detail = { mesh: m, perSegment: indicesPerSegment };
    applyVisible(state);
  }
  const g = new THREE.Group();
  g.name = `Brins phase ${'ABC'[phase]}`;
  g.add(m);
  return g;
}

// --- Point neutre -----------------------------------------------------------------------------

export function buildNeutral(ctx: Ctx): THREE.Object3D {
  const L = layout(ctx);
  const n = L.neutral;
  const geo = cachedGeometry(ctx, geoKey(ctx, 'neutral'), () => {
    const mb = new MeshBuilder();
    const count = 12;
    const pts = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1) - 0.5;
      pts[i * 3] = n.base[0] + n.dir[0] * t * n.length;
      pts[i * 3 + 1] = n.base[1] + n.dir[1] * t * n.length;
      pts[i * 3 + 2] = n.base[2] + n.dir[2] * t * n.length;
      // Gaine rétreinte : bouts légèrement resserrés sur les fils.
      const e = Math.abs(t) * 2;
      radii[i] = n.radius * (1 - 0.25 * Math.pow(e, 6));
    }
    tube(mb, pts, count, { radialSegments: 14, radii, capStart: true, capEnd: true });
    return mb;
  });
  const o = group('Point neutre');
  o.add(mesh(geo, ctx.materials.get(own('sleeveNeutral')), 'neutral.sleeve'));
  return o;
}

// --- Vernis d'imprégnation ---------------------------------------------------------------------------
// Approximation : le vernis est une coque continue et translucide épousant l'enveloppe des têtes de
// bobines ; en réalité il imprègne le bobinage et soude les fils entre eux.

export function buildVarnish(ctx: Ctx): THREE.Object3D {
  const d = dims(ctx);
  const L = layout(ctx);
  const geo = cachedGeometry(ctx, geoKey(ctx, 'varnish'), () => {
    const mb = new MeshBuilder();
    const env = L.envelope;
    const rIn = Math.max(d.stator.Ri + 0.05, env.rMin - 0.15);
    const rOut = Math.min(d.stator.Ro - 0.05, env.rMax + 0.15);
    const half = d.stator.stackLength / 2;
    for (const side of [1, -1] as const) {
      const raw = side > 0 ? env.front : env.rear;
      // Lissage circulaire et hauteur minimale.
      const bins = env.bins;
      const smooth = new Float32Array(bins);
      for (let i = 0; i < bins; i++) {
        let acc = 0;
        for (let k = -3; k <= 3; k++) acc += Math.max(raw[(i + k + bins) % bins]!, L.maxHeight * 0.55);
        smooth[i] = acc / 7 + 0.2;
      }
      const heightAt = (u: number) => {
        const f = u * bins;
        const i0 = Math.floor(f) % bins;
        const i1 = (i0 + 1) % bins;
        return smooth[i0]! + (smooth[i1]! - smooth[i0]!) * (f - Math.floor(f));
      };
      gridSurface(
        mb,
        segs(ctx, 96),
        14,
        (u, v): V3 => {
          const th = u * Math.PI * 2;
          const h = heightAt(u);
          const r = (rIn + rOut) / 2 - ((rOut - rIn) / 2) * Math.cos(Math.PI * v);
          const x = side * (half + h * Math.pow(Math.max(0, Math.sin(Math.PI * v)), 0.45));
          return [x, r * Math.cos(th), r * Math.sin(th)];
        },
        { wrapU: true, flip: (p, nn) => nn[0] * p[0] < 0 },
      );
    }
    return mb;
  });
  const o = group('Vernis d’imprégnation');
  const m = mesh(geo, ctx.materials.get(own('varnishShell')), 'varnish');
  m.renderOrder = 3;
  o.add(m);
  return o;
}
