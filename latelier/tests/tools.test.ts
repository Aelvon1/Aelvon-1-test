/**
 * Tests du catalogue d'outils 3D (sous Node) : enregistrement (noms, icônes), construction de
 * chaque modèle à l'échelle réelle (pointe à l'origine, matériaux propres, géométries saines),
 * géométries procédurales (normales extérieures, sens des triangles), sonde de pièce, et
 * présentateur branché sur le séquenceur de l'objet d'exemple (approche, fondu, suivi, sons).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { AudioApi, LoopHandle, SoundId } from '../src/audio/types';
import type { ToolAnimState } from '../src/objects/types';
import { Assembly } from '../src/inspection/Assembly';
import { DisassemblyGraph } from '../src/inspection/graph';
import { PoseComposer } from '../src/inspection/poses';
import { Sequencer } from '../src/inspection/Sequencer';
import { TOOL_IDS } from '../src/inspection/tools/ids';
import {
  FALLBACK_TOOL_ICON,
  TOOL_NAMES,
  getTool,
  listTools,
  toolDisplay,
} from '../src/inspection/tools/registry';
import { toolBehavior } from '../src/inspection/tools/catalog';
import { rigContext } from '../src/inspection/tools/catalog/rig';
import {
  extrudeOutline,
  hexagon,
  loftRings,
  mirrorX,
  revolve,
  sweepPolygon,
  tubeAlong,
} from '../src/inspection/tools/catalog/geometry';
import { hexKeyGeometry } from '../src/inspection/tools/catalog/drivers';
import { AssemblyProbe, createPartShape, describeOrientedBox } from '../src/inspection/tools/partProbe';
import { ToolPresenterImpl, approachDistance, toolPresence } from '../src/inspection/tools/ToolPresenterImpl';
import { listDevObjectDefs } from '../src/objects/registry';
import { MAT } from '../src/world/layout';
import { createFakeServices } from './helpers/fakeServices';

class FakeAudio implements AudioApi {
  readonly started = true;
  readonly played: SoundId[] = [];
  async resume(): Promise<void> {}
  play(id: SoundId): void {
    this.played.push(id);
  }
  loop(): LoopHandle {
    return {
      playing: true,
      setVolume: () => undefined,
      setIntensity: () => undefined,
      setPosition: () => undefined,
      stop: () => undefined,
    };
  }
  setBusVolume(): void {}
  updateListener(): void {}
  setMuted(): void {}
}

const restState = (direction: 1 | -1 = 1): ToolAnimState => ({
  t: 0.5,
  motionT: 0,
  motion: 'translate',
  direction,
  axis: new THREE.Vector3(0, 1, 0),
  anchor: new THREE.Vector3(),
  size: 0.005,
  spin: 0,
});

/** Proportion de triangles dont la normale géométrique suit les normales de sommets. */
function windingAgreement(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const index = g.getIndex();
  const count = index ? index.count : pos.count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let ok = 0;
  let total = 0;
  for (let t = 0; t < count; t += 3) {
    const i0 = at(t);
    const i1 = at(t + 1);
    const i2 = at(t + 2);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1).sub(a);
    c.fromBufferAttribute(pos, i2).sub(a);
    b.cross(c);
    if (b.lengthSq() < 1e-24) continue;
    n.set(0, 0, 0);
    for (const i of [i0, i1, i2]) n.x += nor.getX(i);
    for (const i of [i0, i1, i2]) n.y += nor.getY(i);
    for (const i of [i0, i1, i2]) n.z += nor.getZ(i);
    total++;
    if (b.dot(n) > 0) ok++;
  }
  return total ? ok / total : 1;
}

/** Proportion de normales orientées vers l'extérieur (loin de l'axe Y) sur une révolution. */
function outwardRatio(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  let ok = 0;
  let total = 0;
  for (let i = 0; i < pos.count; i++) {
    const rx = pos.getX(i);
    const rz = pos.getZ(i);
    if (Math.hypot(rx, rz) < 1e-6) continue;
    total++;
    if (rx * nor.getX(i) + rz * nor.getZ(i) >= -1e-9) ok++;
  }
  return ok / total;
}

describe('outils — catalogue et registre', () => {
  it('enregistre un modèle, un nom et une icône propre pour chaque identifiant', () => {
    for (const id of TOOL_IDS) {
      const def = getTool(id);
      expect(def, id).toBeDefined();
      expect(def!.name).toBe(TOOL_NAMES[id]);
      expect(def!.animate, id).toBeTypeOf('function');
      const display = toolDisplay(id)!;
      expect(display.icon).not.toBe(FALLBACK_TOOL_ICON);
      expect(display.icon).toMatch(/^<svg [^>]*viewBox="0 0 24 24"[^>]*stroke="currentColor"/);
      expect(display.icon.endsWith('</svg>')).toBe(true);
    }
    expect(listTools().length).toBeGreaterThanOrEqual(TOOL_IDS.length);
    // Icônes distinctes (hors clés six pans, dessinées à l'identique à l'épaisseur près).
    const icons = new Set(TOOL_IDS.map((id) => toolDisplay(id)!.icon));
    expect(icons.size).toBe(TOOL_IDS.length);
  });

  it('construit chaque outil à l’échelle réelle, pointe à l’origine, matériaux propres', () => {
    const services = createFakeServices();
    for (const id of TOOL_IDS) {
      const def = getTool(id)!;
      const model = def.build({ materials: services.materials, textures: services.textures });
      // La presse est retournée au démontage (poussoir sur la face arrière) : repos = remontage.
      def.animate!(model, restState(id === 'arbor-press' ? -1 : 1));
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z);
      expect(extent, id).toBeGreaterThan(0.02);
      expect(extent, id).toBeLessThan(0.5);
      // L'outil travaille vers −Y : presque rien sous la pointe (la pièce fait ~4 mm au repos).
      expect(box.min.y, id).toBeGreaterThan(-0.016);
      let meshes = 0;
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        meshes++;
        expect(mesh.castShadow, `${id}/${mesh.name}`).toBe(true);
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) expect(m.userData.shared, `${id}/${m.name}`).not.toBe(true);
        const pos = mesh.geometry.getAttribute('position');
        const nor = mesh.geometry.getAttribute('normal');
        expect(nor, `${id}/${mesh.name}`).toBeDefined();
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), `${id}/${mesh.name}`).toBe(true);
          const l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
          if (Math.abs(l - 1) > 1e-3) throw new Error(`${id}/${mesh.name} : normale non unitaire (${l})`);
        }
      });
      expect(meshes, id).toBeGreaterThan(0);
    }
  });

  it('associe un comportement de présentation adapté à chaque geste', () => {
    expect(toolBehavior('tweezers').follow).toBe('rigid');
    expect(toolBehavior('ic-extractor').roll).toBe('partLong');
    expect(toolBehavior('hex-key-2').follow).toBe('position');
    expect(toolBehavior('outil-inconnu').follow).toBe('position');
    const cues = toolBehavior('desolder-pump').cues!('desolder', 1);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.at).toBeGreaterThan(0.3);
    expect(cues[0]!.at).toBeLessThan(0.62);
  });
});

describe('outils — géométries procédurales', () => {
  it('révolution : normales extérieures et triangles orientés', () => {
    const g = revolve(
      [
        [0, 0],
        [0.002, 0],
        [0.002, 0],
        [0.002, 0.01],
        [0.001, 0.012],
      ],
      24,
      { lobes: 6, lobeDepth: 0.1 },
    );
    expect(outwardRatio(g)).toBeGreaterThan(0.99);
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
  });

  it('clé six pans : section hexagonale au bon surplat, longueurs ISO', () => {
    const s = 0.002;
    const g = hexKeyGeometry(s, 0.052, 0.018);
    expect(windingAgreement(g)).toBeGreaterThan(0.99);
    g.computeBoundingBox();
    const box = g.boundingBox!;
    expect(box.max.y + s / 2).toBeCloseTo(0.052 + s / 2, 3);
    expect(box.max.x + s / 2).toBeCloseTo(0.018, 3);
    // Surplat : demi-largeur selon X au bas du grand bras (après le chanfrein) = s / 2.
    const pos = g.getAttribute('position');
    let maxX = 0;
    for (let i = 0; i < pos.count; i++)
      if (Math.abs(pos.getY(i) - 0.12 * s) < 1e-7) maxX = Math.max(maxX, pos.getX(i));
    expect(maxX).toBeCloseTo(s / 2, 6);
    expect(hexagon(s)).toHaveLength(6);
  });

  it('balayage, tube, loft, extrusion, symétrie : triangles dans le sens des normales', () => {
    const t = new THREE.Vector3(0, 1, 0);
    const sweep = sweepPolygon(hexagon(0.003), [
      {
        origin: new THREE.Vector3(),
        tangent: t,
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, 0, 1),
      },
      {
        origin: new THREE.Vector3(0, 0.01, 0),
        tangent: t,
        u: new THREE.Vector3(1, 0, 0),
        v: new THREE.Vector3(0, 0, 1),
      },
    ]);
    const tube = tubeAlong(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(),
        new THREE.Vector3(0.01, 0.02, 0),
        new THREE.Vector3(0.03, 0.03, 0.01),
      ]),
      { radius: (u) => 0.003 * Math.sin(Math.PI * u) + 1e-4, tubularSegments: 20, radialSegments: 12 },
    );
    const rings = [0, 0.005, 0.01].map((y) =>
      Array.from({ length: 16 }, (_, j) => {
        const a = (j / 16) * Math.PI * 2;
        return new THREE.Vector3(0.003 * Math.cos(a), y, 0.002 * Math.sin(a));
      }),
    );
    const loft = loftRings(rings, true);
    const extr = extrudeOutline(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.01, 0),
        new THREE.Vector2(0.008, 0.02),
        new THREE.Vector2(0, 0.02),
      ],
      { depth: 0.003, bevel: 0.0003 },
    );
    for (const g of [sweep, tube, loft, extr, mirrorX(extr), mirrorX(tube)])
      expect(windingAgreement(g)).toBeGreaterThan(0.97);
  });
});

describe('outils — sonde de pièce', () => {
  it('mesure profondeur, largeurs et directions d’une boîte orientée', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(-0.01, -0.002, -0.004),
      new THREE.Vector3(0.01, 0.002, 0.004),
    );
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(0.1, 0.2, 0.3),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
      new THREE.Vector3(1, 1, 1),
    );
    const axis = new THREE.Vector3(0, 1, 0);
    const anchor = new THREE.Vector3(0.1, 0.202, 0.3);
    const shape = describeOrientedBox(box, m, axis, anchor, createPartShape());
    expect(shape.depth).toBeCloseTo(0.004, 6);
    expect(shape.longHalf).toBeCloseTo(0.01, 6);
    expect(shape.shortHalf).toBeCloseTo(0.004, 6);
    // Le grand côté (X local) est tourné sur Z monde.
    expect(Math.abs(shape.longDir.z)).toBeCloseTo(1, 6);
    expect(Math.abs(shape.shortDir.x)).toBeCloseTo(1, 6);
  });

  it('présence et course d’approche', () => {
    expect(toolPresence(0, 0)).toBe(0);
    expect(toolPresence(1, 0)).toBe(1);
    expect(toolPresence(1, 1)).toBe(0);
    expect(approachDistance(0)).toBeCloseTo(0.015, 6);
    expect(approachDistance(1)).toBe(0.05);
  });
});

describe('outils — présentateur branché sur le séquenceur', () => {
  it('pose, anime, fond et retire l’outil de chaque étape de l’objet d’exemple', async () => {
    const def = listDevObjectDefs().find((d) => d.id === 'exemple-boitier')!;
    const services = createFakeServices();
    const assembly = new Assembly(def, undefined, {
      ...services,
      matCenter: new THREE.Vector3(...MAT.center),
    });
    expect(await assembly.build()).toBe(true);
    const r = assembly.resolved;
    const graph = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
    const composer = new PoseComposer(assembly);
    const audio = new FakeAudio();
    const scene = new THREE.Scene();
    scene.add(assembly.root);
    const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.001, 10);
    camera.position.copy(assembly.root.position).add(new THREE.Vector3(0, 0.3, 0.4));
    camera.lookAt(assembly.root.position);
    camera.updateMatrixWorld();
    const presenter = new ToolPresenterImpl({
      parent: scene,
      camera,
      build: { materials: services.materials, textures: services.textures },
      audio,
      probe: new AssemblyProbe(() => assembly),
    });
    const sequencer = new Sequencer({
      assembly,
      composer,
      graph,
      audio,
      placementSetting: () => 'stay',
      autoFrame: () => false,
      listener: {
        onStateChange: () => undefined,
        onStepStarted: () => undefined,
        onStepFinished: () => undefined,
        onBlocked: () => undefined,
        onToolChange: () => undefined,
        onFrameRequest: () => undefined,
      },
    });
    sequencer.setToolPresenter(presenter);
    composer.apply(true);

    const seen = new Set<string>();
    let maxOpacity = 0;
    let maxDistance = 0;
    for (let step = 0; step < graph.steps.length; step++) {
      sequencer.command({ kind: 'next' });
      let t = 0;
      while (sequencer.busy && t < 60) {
        sequencer.update(1 / 60);
        composer.apply();
        t += 1 / 60;
        const id = presenter.activeToolId;
        if (!id) continue;
        seen.add(id);
        const model = presenter.modelOf(id)!;
        const mount = model.parent!;
        if (!mount.visible) continue;
        const mesh = model.getObjectByProperty('isMesh', true) as THREE.Mesh;
        const material = mesh.material as THREE.Material;
        expect(material.alphaHash).toBe(true);
        maxOpacity = Math.max(maxOpacity, material.opacity);
        // Décalage de l'outil dans son montage (posé sur le point de travail) : quelques cm.
        maxDistance = Math.max(maxDistance, model.position.length());
      }
      expect(presenter.activeToolId).toBeNull();
    }
    expect(seen.has('screwdriver-phillips')).toBe(true);
    expect(seen.has('soldering-iron')).toBe(true);
    expect(maxOpacity).toBeCloseTo(1, 3);
    // L'outil n'est jamais à plus de quelques centimètres de son point de travail.
    expect(maxDistance).toBeLessThan(0.12);
    expect(audio.played).toContain('tool.pickup');
    // Contexte d'animation renseigné par le présentateur (vis du couvercle : profondeur réelle).
    const driver = presenter.modelOf('screwdriver-phillips')!;
    expect(rigContext(driver).depth).toBeGreaterThan(0.001);
    expect(rigContext(driver).depth).toBeLessThan(0.03);
    presenter.dispose();
    expect(presenter.root.parent).toBeNull();
  });
});
