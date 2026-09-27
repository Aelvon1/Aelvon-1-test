/**
 * Tests propres à la carte « uno-board » : implantation (aucun chevauchement d'empreintes),
 * netlist, routage (toutes les liaisons, isolement entre réseaux), illustration, marquages,
 * conversions de repère et géométrie construite (ménisques orientés, queues sur y = 0).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import def from '../src/objects/uno-board';
import {
  BOARD_H,
  BOARD_W,
  L_TAIL_END,
  MM,
  OBJECT_ID,
  Y_CU_T,
  boardX,
  boardZ,
} from '../src/objects/uno-board/constants';
import { FOOTPRINTS } from '../src/objects/uno-board/footprints';
import {
  BOARD_OUTLINE,
  COMPONENTS,
  GND,
  HEADER_ORIGINS,
  MOUNTING_HOLES,
  NC,
  component,
} from '../src/objects/uno-board/layout';
import { MARKINGS, markingRequest } from '../src/objects/uno-board/markings';
import { artworkRequest, artworkSize } from '../src/objects/uno-board/pcb/artwork';
import { boardOutline, insetPolygon, signedArea } from '../src/objects/uno-board/pcb/outline';
import { allPads, convexOverlap, pointConvexDistance, rectCorners } from '../src/objects/uno-board/pcb/pads';
import {
  DRC,
  computeRouting,
  routeBoard,
  routingDataSource,
  toRoutingData,
} from '../src/objects/uno-board/pcb/routing';
import { ROUTING_DATA } from '../src/objects/uno-board/pcb/routing.data';
import { writeFileSync } from 'node:fs';
import { pointInPolygon, pointSegmentDistance } from '../src/objects/uno-board/pcb/router';
import { filletRing, thtFillet } from '../src/objects/uno-board/packages/solder';
import { loftRoundedRect, roundedBoxSections } from '../src/objects/uno-board/packages/geometry';
import {
  SimpleGeometryCache,
  createBuildContext,
  createPrepareContext,
  normalizeBuild,
  registerObjectMaterials,
} from '../src/objects/buildSupport';
import { resolveObject } from '../src/objects/resolve';
import { DisassemblyGraph } from '../src/inspection/graph';
import { createFakeServices } from './helpers/fakeServices';

/** Distance entre deux segments (0 s'ils se coupent). */
function segSeg(a: number[], b: number[]): number {
  const [ax, ay, bx, by] = a as [number, number, number, number];
  const [cx, cy, dx, dy] = b as [number, number, number, number];
  const cross = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = cross(ax, ay, bx, by, cx, cy);
  const d2 = cross(ax, ay, bx, by, dx, dy);
  const d3 = cross(cx, cy, dx, dy, ax, ay);
  const d4 = cross(cx, cy, dx, dy, bx, by);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(
    pointSegmentDistance(ax, ay, cx, cy, dx, dy),
    pointSegmentDistance(bx, by, cx, cy, dx, dy),
    pointSegmentDistance(cx, cy, ax, ay, bx, by),
    pointSegmentDistance(dx, dy, ax, ay, bx, by),
  );
}

describe('uno-board : implantation', () => {
  it('aucun chevauchement d’encombrement entre composants', () => {
    const polys = COMPONENTS.map((c) => ({
      ref: c.ref,
      poly: rectCorners(c, FOOTPRINTS[c.footprint].courtyard),
    }));
    const overlaps: string[] = [];
    for (let i = 0; i < polys.length; i++)
      for (let j = i + 1; j < polys.length; j++)
        if (convexOverlap(polys[i]!.poly, polys[j]!.poly)) overlaps.push(`${polys[i]!.ref}/${polys[j]!.ref}`);
    expect(overlaps).toEqual([]);
  });

  it('encombrements hors des trous de fixation', () => {
    for (const c of COMPONENTS) {
      const poly = rectCorners(c, FOOTPRINTS[c.footprint].courtyard);
      for (const h of MOUNTING_HOLES)
        expect(pointConvexDistance(h.x, h.y, poly), c.ref).toBeGreaterThan(h.d / 2);
    }
  });

  it('pastilles sur la carte et à distance des trous de fixation', () => {
    for (const p of allPads()) {
      expect(pointInPolygon(p.x, p.y, BOARD_OUTLINE), `${p.ref}.${p.num}`).toBe(true);
      for (const h of MOUNTING_HOLES)
        expect(
          Math.hypot(p.x - h.x, p.y - h.y) - Math.max(p.w, p.h) / Math.SQRT2,
          `${p.ref}.${p.num}`,
        ).toBeGreaterThan(h.d / 2 + 0.3);
    }
  });

  it('seuls l’USB-B et le jack débordent du contour', () => {
    for (const c of COMPONENTS) {
      if (c.ref === 'X1' || c.ref === 'X2') continue;
      for (const v of rectCorners(c, FOOTPRINTS[c.footprint].courtyard)) {
        expect(v.x, c.ref).toBeGreaterThanOrEqual(0);
        expect(v.x, c.ref).toBeLessThanOrEqual(BOARD_W);
        expect(v.y, c.ref).toBeGreaterThanOrEqual(0);
        expect(v.y, c.ref).toBeLessThanOrEqual(BOARD_H);
      }
    }
    // Débordements caractéristiques : USB ≈ 6 mm, jack ≈ 2 mm.
    const usbMin = Math.min(...rectCorners(component('X2'), [-16.3, -6, 0, 6]).map((v) => v.x));
    const jackMin = Math.min(...rectCorners(component('X1'), [-13.5, -4.5, 0, 4.5]).map((v) => v.x));
    expect(usbMin).toBeCloseTo(-6.2, 1);
    expect(jackMin).toBeCloseTo(-1.9, 1);
  });

  it('écart non standard de 0,16 po entre D7 et D8, D0 aligné sur A5', () => {
    const d8 = HEADER_ORIGINS.IOH_X0 + 9 * 2.54;
    expect(HEADER_ORIGINS.IOL_X0 - d8).toBeCloseTo(4.064, 6);
    expect(HEADER_ORIGINS.IOL_X0 + 7 * 2.54).toBeCloseTo(HEADER_ORIGINS.AD_X0 + 5 * 2.54, 6);
  });

  it('désignations uniques et empreintes cohérentes avec les réseaux', () => {
    const refs = new Set<string>();
    for (const c of COMPONENTS) {
      expect(refs.has(c.ref), c.ref).toBe(false);
      refs.add(c.ref);
      const nums = new Set(FOOTPRINTS[c.footprint].pads.map((p) => p.num));
      for (const n of Object.keys(c.nets)) expect(nums.has(n), `${c.ref}.${n}`).toBe(true);
    }
  });

  it('chaque réseau relie au moins deux broches', () => {
    const count = new Map<string, number>();
    for (const p of allPads()) if (p.net !== NC) count.set(p.net, (count.get(p.net) ?? 0) + 1);
    for (const [net, n] of count) expect(n, net).toBeGreaterThanOrEqual(2);
  });
});

describe('uno-board : routage', () => {
  const routing = computeRouting();

  it(
    'données de routage enregistrées à jour (UNO_ROUTING_UPDATE=1 pour régénérer)',
    { timeout: 180_000 },
    () => {
      const fresh = routeBoard();
      expect(fresh.failures).toEqual([]);
      if (process.env.UNO_ROUTING_UPDATE === '1')
        writeFileSync(
          new URL('../src/objects/uno-board/pcb/routing.data.ts', import.meta.url),
          routingDataSource(fresh),
        );
      else expect(toRoutingData(fresh)).toEqual(ROUTING_DATA);
    },
  );

  it('toutes les liaisons sont routées', () => {
    expect(routing.failures).toEqual([]);
    expect(routing.traces.length).toBeGreaterThan(150);
    expect(routing.vias.length).toBeGreaterThan(40);
  });

  it('isolement entre pistes de réseaux différents (même couche)', () => {
    const segs = routing.traces.flatMap((t) => {
      const out: { net: string; layer: number; w: number; s: number[] }[] = [];
      for (let k = 0; k + 3 < t.points.length; k += 2)
        out.push({ net: t.net, layer: t.layer, w: t.width, s: t.points.slice(k, k + 4) });
      return out;
    });
    let worst = Infinity;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i]!;
        const b = segs[j]!;
        if (a.layer !== b.layer || a.net === b.net) continue;
        worst = Math.min(worst, segSeg(a.s, b.s) - (a.w + b.w) / 2);
      }
    }
    // Isolement nominal 0,15 mm ; tolérance de la grille et des zones de dégagement fin.
    expect(worst).toBeGreaterThan(0.04);
  });

  it('isolement entre pistes et pastilles d’autres réseaux', () => {
    let worst = Infinity;
    for (const t of routing.traces) {
      for (const p of routing.pads) {
        if (p.net === t.net) continue;
        if (t.layer === 1 && p.drill === undefined) continue;
        const r = p.shape === 'round' ? p.w / 2 : Math.min(p.w, p.h) / 2;
        for (let k = 0; k + 3 < t.points.length; k += 2) {
          const d = pointSegmentDistance(
            p.x,
            p.y,
            t.points[k]!,
            t.points[k + 1]!,
            t.points[k + 2]!,
            t.points[k + 3]!,
          );
          worst = Math.min(worst, d - r - t.width / 2);
        }
      }
    }
    expect(worst).toBeGreaterThan(0.0);
  });

  it('vias à distance des trous de fixation et dans la carte', () => {
    for (const v of routing.vias) {
      expect(pointInPolygon(v.x, v.y, BOARD_OUTLINE)).toBe(true);
      for (const h of MOUNTING_HOLES)
        expect(Math.hypot(v.x - h.x, v.y - h.y)).toBeGreaterThan(h.d / 2 + DRC.viaDiameter / 2);
    }
  });

  it('la masse n’est pas routée en pistes (plans de masse), sauf amorces de couture', () => {
    const gnd = routing.traces.filter((t) => t.net === GND);
    for (const t of gnd) expect(t.points.length).toBe(4);
  });
});

describe('uno-board : illustration et marquages', () => {
  const routing = computeRouting();

  it('tailles de texture selon la qualité (4096 px en Élevé/Ultra, 2048 en Bas)', () => {
    expect(artworkSize(3, 'top').width).toBe(4096);
    expect(artworkSize(2, 'top').width).toBe(4096);
    expect(artworkSize(0, 'top').width).toBe(2048);
    expect(artworkSize(2, 'top').height).toBe(Math.round((4096 * BOARD_H) / BOARD_W));
  });

  it('requêtes préfixées, données linéaires, anisotropie et mipmaps', () => {
    for (const face of ['top', 'bottom'] as const) {
      const req = artworkRequest(routing, face, 2);
      expect(req.key.startsWith(`${OBJECT_ID}/`)).toBe(true);
      expect(req.generator).toBe('channels');
      expect(req.colorSpace).toBe('linear');
      expect(req.mipmaps).toBe(true);
      expect(req.anisotropy).toBe(true);
    }
    for (const id of Object.keys(MARKINGS)) {
      const req = markingRequest(id, 3);
      expect(req.key.startsWith(`${OBJECT_ID}/`)).toBe(true);
      expect(req.width).toBeLessThanOrEqual(4096);
      // Densité suffisante pour lire le marquage au zoom macro.
      expect(req.width / MARKINGS[id]!.size[0]).toBeGreaterThanOrEqual(55);
    }
  });

  it('contour arrondi en sens trigonométrique, retrait du plan de masse', () => {
    const outline = boardOutline();
    expect(signedArea(outline)).toBeGreaterThan(0);
    const inset = insetPolygon(outline, 0.5);
    expect(Math.abs(signedArea(inset))).toBeLessThan(signedArea(outline));
  });
});

describe('uno-board : repères et géométrie', () => {
  it('conversion repère carte → objet', () => {
    expect(boardX(34.29)).toBeCloseTo(0, 9);
    expect(boardZ(26.67)).toBeCloseTo(0, 9);
    expect(boardX(0)).toBeCloseTo(-34.29 * MM, 9);
    // Y carte vers le haut → −Z objet.
    expect(boardZ(53.34)).toBeCloseTo(-26.67 * MM, 9);
  });

  it('ménisques concaves orientés vers le haut', () => {
    const g = filletRing(
      {
        foot: [-0.3e-3, -0.4e-3, 0, 0.4e-3],
        pad: [-0.45e-3, -0.5e-3, 0.45e-3, 0.5e-3],
        hToe: 0.3e-3,
        hHeel: 0.02e-3,
        hSide: 0.1e-3,
      },
      32,
      6,
    );
    const n = g.getAttribute('normal');
    let up = 0;
    for (let i = 0; i < n.count; i++) up += n.getY(i);
    expect(up / n.count).toBeGreaterThan(0.3);
    const p = g.getAttribute('position');
    let maxY = 0;
    let minY = Infinity;
    for (let i = 0; i < p.count; i++) {
      maxY = Math.max(maxY, p.getY(i));
      minY = Math.min(minY, p.getY(i));
    }
    expect(maxY).toBeCloseTo(0.3e-3, 5);
    expect(minY).toBeGreaterThanOrEqual(0);
    const t = thtFillet(0.85e-3, 0.42e-3, 0.9e-3, 24, 6);
    const tn = t.getAttribute('normal');
    let tup = 0;
    for (let i = 0; i < tn.count; i++) tup += tn.getY(i);
    expect(tup).toBeGreaterThan(0);
  });

  it('corps loftés : normales vers l’extérieur', () => {
    const g = loftRoundedRect(roundedBoxSections(2e-3, 1e-3, 0.5e-3, { r: 0.1e-3 }));
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    let outward = 0;
    for (let i = 0; i < p.count; i++)
      outward += p.getX(i) * n.getX(i) + (p.getY(i) - 0.25e-3) * n.getY(i) + p.getZ(i) * n.getZ(i);
    expect(outward).toBeGreaterThan(0);
  });

  it('pièces construites : queues sur y = 0, rien sous le tapis, carte à l’échelle', async () => {
    const services = createFakeServices();
    registerObjectMaterials(def, services.materials);
    const r = resolveObject(def, { fineDetail: true });
    const shared: Record<string, unknown> = {};
    await def.prepare?.(createPrepareContext(r.params, services, shared));
    const cache = new SimpleGeometryCache();
    const root = new THREE.Group();
    const nodes = new Map<string, THREE.Object3D>();
    for (const part of r.parts) {
      const node = part.build
        ? normalizeBuild(part.build(createBuildContext(part, r.params, services, cache, shared))).object
        : new THREE.Group();
      (part.parent ? nodes.get(part.parent)! : root).add(node);
      nodes.set(part.id, node);
    }
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    expect(box.min.y).toBeGreaterThan(-1e-6);
    expect(box.min.y).toBeLessThan(1e-4);
    // USB-B déborde de ≈ 6,2 mm à gauche du bord (−34,29 mm).
    expect(box.min.x).toBeCloseTo((-34.29 - 6.2) * MM, 3);
    expect(box.max.z - box.min.z).toBeGreaterThan(53e-3);
    // Queues des traversants : jusqu'au plan y = 0.
    expect(Y_CU_T + L_TAIL_END).toBeCloseTo(0, 9);
  });

  it('ordre A→Z : le 328P avant son support, tous les composants avant les couches', () => {
    const r = resolveObject(def);
    const g = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
    const order = g.simulateFullDisassembly();
    expect(order.indexOf('u4')).toBeLessThan(order.indexOf('u4.socket'));
    const firstLayer = Math.min(
      ...order.filter((id) => id.startsWith('pcb.')).map((id) => order.indexOf(id)),
    );
    for (const p of r.parts.filter((p) => p.tags?.includes('component')))
      expect(order.indexOf(p.id), p.id).toBeLessThan(firstLayer);
    expect(r.parts.find((p) => p.id === 'pcb.core')?.removal).toBeUndefined();
  });
});
