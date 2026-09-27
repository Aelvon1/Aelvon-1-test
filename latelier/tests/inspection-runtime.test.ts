/**
 * Tests d'intégration du runtime d'inspection sous Node, sur l'objet d'exemple :
 * construction (Assembly), composition des poses (éclatement, instances), séquenceur (pas à pas,
 * démontage libre, blocages, file de commandes, outil, sons, remontage exact), vue rangée
 * (cibles monde sans chevauchement, posées sur le plateau).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { AudioApi, LoopHandle, LoopId, SoundId } from '../src/audio/types';
import type { RemovedPlacementSetting } from '../src/core/settings';
import { Assembly } from '../src/inspection/Assembly';
import { DisassemblyGraph, type Blockage } from '../src/inspection/graph';
import { planKnolling, planParking } from '../src/inspection/knollingPlan';
import { finalOffset } from '../src/inspection/motions';
import { PoseComposer } from '../src/inspection/poses';
import { Sequencer } from '../src/inspection/Sequencer';
import type { ToolFrameState, ToolGesture, ToolPresenter } from '../src/inspection/tools/presenter';
import { listDevObjectDefs } from '../src/objects/registry';
import { BENCH, MAT } from '../src/world/layout';
import { createFakeServices } from './helpers/fakeServices';

const def = listDevObjectDefs().find((d) => d.id === 'exemple-boitier')!;

class FakeAudio implements AudioApi {
  readonly started = true;
  readonly played: SoundId[] = [];
  readonly loops: LoopId[] = [];
  async resume(): Promise<void> {}
  play(id: SoundId): void {
    this.played.push(id);
  }
  loop(id: LoopId): LoopHandle {
    this.loops.push(id);
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

class RecordingPresenter implements ToolPresenter {
  readonly calls: string[] = [];
  gestures: ToolGesture[] = [];
  lastState: ToolFrameState | null = null;
  begin(g: ToolGesture): void {
    this.calls.push(`begin:${g.partId}`);
    this.gestures.push(g);
  }
  update(s: ToolFrameState): void {
    if (this.calls.at(-1) !== 'update') this.calls.push('update');
    this.lastState = { ...s, anchor: s.anchor.clone() };
  }
  end(): void {
    this.calls.push('end');
  }
  dispose(): void {}
}

interface Rig {
  assembly: Assembly;
  graph: DisassemblyGraph;
  composer: PoseComposer;
  sequencer: Sequencer;
  audio: FakeAudio;
  presenter: RecordingPresenter;
  blocked: { partId: string; blockage: Blockage; reinsert: boolean }[];
  steps: string[];
  placement: { value: RemovedPlacementSetting };
}

async function createRig(params?: Record<string, boolean | string>): Promise<Rig> {
  const services = createFakeServices();
  const assembly = new Assembly(def, params, { ...services, matCenter: new THREE.Vector3(...MAT.center) });
  expect(await assembly.build()).toBe(true);
  const r = assembly.resolved;
  const graph = new DisassemblyGraph(r.parts, r.steps, new Set(r.allParts.map((p) => p.id)));
  const composer = new PoseComposer(assembly);
  const audio = new FakeAudio();
  const presenter = new RecordingPresenter();
  const blocked: Rig['blocked'] = [];
  const steps: string[] = [];
  const placement = { value: 'stay' as RemovedPlacementSetting };
  const sequencer = new Sequencer({
    assembly,
    composer,
    graph,
    audio,
    placementSetting: () => placement.value,
    autoFrame: () => false,
    listener: {
      onStateChange: () => undefined,
      onStepStarted: (i) => steps.push(`start:${i}`),
      onStepFinished: (i) => steps.push(`end:${i}`),
      onBlocked: (partId, blockage, reinsert) => blocked.push({ partId, blockage, reinsert }),
      onToolChange: () => undefined,
      onFrameRequest: () => undefined,
    },
  });
  sequencer.setToolPresenter(presenter);
  const parking = planParking(assembly, graph, assembly.objectBounds(new THREE.Box3()));
  for (const [id, m] of parking.targets) composer.get(id)!.parkTarget = m;
  for (const [id, list] of parking.instanceTargets) composer.get(id)!.parkInstanceTargets = list;
  composer.setExplodeRate(0);
  composer.apply(true);
  return { assembly, graph, composer, sequencer, audio, presenter, blocked, steps, placement };
}

/** Fait tourner le séquenceur jusqu'à la fin des animations (images de 1/60 s). */
function runUntilIdle(rig: Rig, maxSeconds = 60): number {
  let t = 0;
  const dt = 1 / 60;
  do {
    rig.sequencer.update(dt);
    rig.composer.apply();
    t += dt;
  } while ((rig.sequencer.busy || rig.sequencer.hasTweens) && t < maxSeconds);
  return t;
}

const instanceWorld = (rig: Rig, id: string, i: number) =>
  new THREE.Vector3().setFromMatrixPosition(rig.assembly.instanceWorldMatrix(id, i, new THREE.Matrix4()));

describe('runtime — construction', () => {
  it("construit l'objet d'exemple : nœuds, identifiants de pièce, instances", async () => {
    const { assembly } = await createRig();
    expect(assembly.order.map((p) => p.id)).toContain('board.led');
    for (const part of assembly.order) {
      expect(part.node.userData.partId).toBe(part.id);
      for (const mesh of part.ownMeshes) expect(mesh.userData.partId).toBe(part.id);
    }
    const screws = assembly.parts.get('screws')!;
    expect(screws.instanced?.count).toBe(4);
    expect(screws.instanced?.meshes).toHaveLength(2);
    // Sélection d'une instance : remontée jusqu'au nœud de pièce, index conservé.
    expect(assembly.pick(screws.instanced!.meshes[1]!, 2)).toEqual({ partId: 'screws', instance: 2 });
    const led = assembly.parts.get('board.led')!;
    expect(assembly.pick(led.ownMeshes[0]!, null)).toEqual({ partId: 'board.led', instance: null });
    // L'objet repose sur le tapis (y = 0 de l'objet = surface du tapis).
    const bounds = assembly.objectBounds();
    expect(bounds.min.y).toBeCloseTo(MAT.center[1], 3);
  });

  it('libère ses ressources', async () => {
    const { assembly } = await createRig();
    assembly.dispose();
    expect(assembly.isDisposed).toBe(true);
    expect(assembly.parts.size).toBe(0);
  });
});

describe('runtime — éclatement', () => {
  it('compose les décalages par étages et hiérarchiquement', async () => {
    const { assembly, composer } = await createRig();
    const lid = assembly.parts.get('lid')!;
    const gasket = assembly.parts.get('lid.gasket')!;
    const rest = new THREE.Vector3().setFromMatrixPosition(gasket.node.matrixWorld);
    composer.setExplodeRate(0.5);
    composer.apply();
    // Étage 0 (couvercle) terminé à mi-course (2 étages), étage 1 (joint) pas encore parti.
    expect(lid.node.position.y - lid.restPosition.y).toBeCloseTo(lid.def.explode.distance, 9);
    expect(gasket.node.position.y).toBeCloseTo(gasket.restPosition.y, 9);
    composer.setExplodeRate(1);
    composer.apply();
    const world = new THREE.Vector3().setFromMatrixPosition(gasket.node.matrixWorld);
    expect(world.y - rest.y).toBeCloseTo(lid.def.explode.distance - gasket.def.explode.distance, 6);
    // Écartement des instances (conducteurs) à l'éclatement.
    const w0 = instanceWorld({ assembly } as Rig, 'wires', 0);
    const w1 = instanceWorld({ assembly } as Rig, 'wires', 1);
    expect(w1.distanceTo(w0)).toBeGreaterThan(0.0075 + 0.005);
  });
});

describe('runtime — séquenceur', () => {
  let rig: Rig;
  beforeEach(async () => {
    rig = await createRig();
  });

  it('étape 1 : dévissage des 4 vis avec outil, sons au quart de tour, fin de course exacte', () => {
    const before = instanceWorld(rig, 'screws', 3);
    rig.sequencer.command({ kind: 'next' });
    expect(rig.sequencer.busy).toBe(true);
    runUntilIdle(rig);
    expect([...rig.sequencer.removed]).toEqual(['screws']);
    expect(rig.steps).toEqual(['start:0', 'end:0']);
    expect(rig.presenter.calls).toEqual(['begin:screws', 'update', 'end']);
    expect(rig.presenter.gestures[0]!.toolId).toBe('screwdriver-phillips');
    expect(rig.presenter.gestures[0]!.axis.y).toBeCloseTo(1, 6);
    // 10 tours × 4 quarts × 4 vis.
    expect(rig.audio.played.filter((s) => s === 'screw.unscrew').length).toBe(160);
    const spec = rig.assembly.parts.get('screws')!.def.removal!;
    const after = instanceWorld(rig, 'screws', 3);
    expect(after.y - before.y).toBeCloseTo(finalOffset(spec), 6);
    expect(after.x).toBeCloseTo(before.x, 6);
  });

  it('blocage en démontage libre, puis retrait autorisé', () => {
    rig.sequencer.command({ kind: 'toggle', partId: 'lid' });
    expect(rig.sequencer.busy).toBe(false);
    expect(rig.blocked[0]).toMatchObject({ partId: 'lid', reinsert: false });
    expect(rig.blocked[0]!.blockage.blockers).toEqual(['screws']);
    rig.sequencer.command({ kind: 'toggle', partId: 'screws' });
    runUntilIdle(rig);
    rig.sequencer.command({ kind: 'toggle', partId: 'lid' });
    runUntilIdle(rig);
    expect(rig.sequencer.removed.has('lid')).toBe(true);
    // Remonter les vis alors que le couvercle est retiré : refusé.
    rig.sequencer.command({ kind: 'toggle', partId: 'screws' });
    expect(rig.blocked.at(-1)).toMatchObject({ partId: 'screws', reinsert: true });
  });

  it('file de commandes : une commande reçue pendant une animation est exécutée ensuite', () => {
    rig.sequencer.command({ kind: 'next' });
    rig.sequencer.update(0.1);
    rig.sequencer.command({ kind: 'next' });
    runUntilIdle(rig);
    expect([...rig.sequencer.removed].sort()).toEqual(['lid', 'screws']);
  });

  it('dessoudage : fusion via le hook puis retrait, boucle de chauffe', () => {
    rig.sequencer.applyStepsInstant(4);
    const led = rig.assembly.parts.get('board.led')!;
    const joints = led.node.children.filter((c) => c.name === 'Soudure');
    expect(joints.every((j) => j.visible)).toBe(true);
    rig.sequencer.command({ kind: 'goto', index: 6 });
    runUntilIdle(rig);
    expect(rig.sequencer.removed.has('board.led')).toBe(true);
    expect(joints.every((j) => !j.visible)).toBe(true);
    expect(rig.audio.loops).toContain('iron.sizzle');
  });

  it('remontage complet : retour exact à la pose de repos (nœuds et instances)', () => {
    const rest = rig.assembly.order.map((p) => p.node.matrixWorld.clone());
    const restInstances = rig.assembly.order.map(
      (p) => p.instanced?.meshes.map((m) => new Float32Array(m.instanceMatrix.array)) ?? [],
    );
    rig.placement.value = 'park';
    rig.sequencer.command({ kind: 'goto', index: rig.graph.steps.length });
    runUntilIdle(rig, 400);
    expect(rig.sequencer.removed.size).toBe(rig.graph.steps.flatMap((s) => s.parts).length);
    rig.sequencer.command({ kind: 'goto', index: 0 });
    runUntilIdle(rig, 400);
    expect(rig.sequencer.removed.size).toBe(0);
    rig.assembly.order.forEach((p, k) => {
      const a = p.node.matrixWorld.elements;
      const b = rest[k]!.elements;
      for (let i = 0; i < 16; i++) expect(a[i]!, `${p.id}[${i}]`).toBeCloseTo(b[i]!, 6);
      p.instanced?.meshes.forEach((m, mi) => {
        const arr = m.instanceMatrix.array;
        const ref = restInstances[k]![mi]!;
        for (let i = 0; i < arr.length; i++) expect(arr[i]!, `${p.id} instance`).toBeCloseTo(ref[i]!, 6);
      });
    });
    // Sons de dépose au rangement.
    expect(rig.audio.played.some((s) => s.startsWith('part.drop.'))).toBe(true);
    expect(rig.audio.played).toContain('screw.tighten');
  });

  it('réinitialisation instantanée', () => {
    rig.sequencer.applyStepsInstant(3);
    expect(rig.sequencer.removed.size).toBe(3);
    rig.sequencer.reset();
    rig.composer.apply(true);
    expect(rig.sequencer.removed.size).toBe(0);
    const lid = rig.assembly.parts.get('lid')!;
    expect(lid.node.position.distanceTo(lid.restPosition)).toBeLessThan(1e-9);
  });
});

describe('runtime — vue rangée', () => {
  it('toutes les pièces posées à plat, sans chevauchement, sur le plateau', async () => {
    const rig = await createRig();
    const plan = planKnolling(rig.assembly, rig.graph);
    expect(plan.fits).toBe(true);
    for (const [id, m] of plan.targets) rig.composer.get(id)!.knollTarget = m;
    for (const [id, list] of plan.instanceTargets) rig.composer.get(id)!.knollInstanceTargets = list;
    for (const id of plan.order) rig.composer.get(id)!.knollWeight = 1;
    rig.composer.markDirty();
    rig.composer.apply();
    const rects: { id: string; box: THREE.Box3 }[] = [];
    for (const id of plan.order) {
      const box = rig.assembly.worldBounds(id, new THREE.Box3(), false);
      rects.push({ id, box });
      // Posée : le bas de la boîte sur la surface (tapis ou plateau).
      expect(box.min.y, id).toBeGreaterThan(BENCH.topHeight - 1e-4);
      expect(box.min.y, id).toBeLessThan(MAT.center[1] + 1e-4);
      expect(box.min.x).toBeGreaterThanOrEqual(BENCH.x[0]);
      expect(box.max.x).toBeLessThanOrEqual(BENCH.x[1]);
      expect(box.min.z).toBeGreaterThanOrEqual(BENCH.z[0]);
      expect(box.max.z).toBeLessThanOrEqual(BENCH.z[1]);
    }
    const eps = 1e-5;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!.box;
        const b = rects[j]!.box;
        const overlap =
          a.min.x < b.max.x - eps &&
          a.max.x > b.min.x + eps &&
          a.min.z < b.max.z - eps &&
          a.max.z > b.min.z + eps;
        expect(overlap, `${rects[i]!.id} × ${rects[j]!.id}`).toBe(false);
      }
    expect(plan.labels.length).toBeGreaterThan(5);
  });
});

describe('runtime — cadrage des étapes', () => {
  it('le séquenceur signale le sens (retrait / remontage) de chaque demande de cadrage', async () => {
    const rig = await createRig();
    const frames: { ids: string[]; reinsert: boolean }[] = [];
    const sequencer = new Sequencer({
      assembly: rig.assembly,
      composer: rig.composer,
      graph: rig.graph,
      audio: rig.audio,
      placementSetting: () => 'stay',
      autoFrame: () => true,
      listener: {
        onStateChange: () => undefined,
        onStepStarted: () => undefined,
        onStepFinished: () => undefined,
        onBlocked: () => undefined,
        onToolChange: () => undefined,
        onFrameRequest: (ids, reinsert) => frames.push({ ids, reinsert }),
      },
    });
    const run = () => {
      let t = 0;
      do {
        sequencer.update(1 / 60);
        rig.composer.apply();
        t += 1 / 60;
      } while ((sequencer.busy || sequencer.hasTweens) && t < 60);
    };
    sequencer.command({ kind: 'next' });
    run();
    sequencer.command({ kind: 'prev' });
    run();
    expect(frames).toHaveLength(2);
    expect(frames[0]!.reinsert).toBe(false);
    expect(frames[1]!.reinsert).toBe(true);
    expect(frames[1]!.ids).toEqual(frames[0]!.ids);
    sequencer.dispose();
  });
});
