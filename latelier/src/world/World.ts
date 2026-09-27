/**
 * Décor de l'atelier.
 *
 * Version socle : volumes simples (sol, murs, plafond, établi, tapis) et éclairage de base,
 * conformes au plan `layout.ts`. Les phases suivantes remplacent ce contenu (décor complet,
 * matériaux, éclairage chaud/froid, atmosphère) derrière la même API.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../core/context';
import type { FrameInfo } from '../core/Engine';
import { BENCH, INSPECTION_VIEW, MAT, ROOM } from './layout';
import type { BenchInfo, Interactable } from './types';

export class World {
  readonly root = new THREE.Group();
  readonly interactables: Interactable[] = [];
  readonly bench: BenchInfo;
  private readonly disposers: (() => void)[] = [];

  constructor(protected readonly ctx: AppContext) {
    this.root.name = 'Atelier';
    const matCenter = new THREE.Vector3(...MAT.center);
    this.bench = {
      matCenter,
      matSize: new THREE.Vector2(MAT.size[0], MAT.size[1]),
      viewPosition: matCenter.clone().add(new THREE.Vector3(...INSPECTION_VIEW.offset)),
    };
  }

  async build(progress: (value: number, label: string) => void): Promise<void> {
    const { materials, physics } = this.ctx;
    progress(0.1, 'Construction de la salle…');
    const box = (
      w: number,
      h: number,
      d: number,
      mat: string,
      x: number,
      y: number,
      z: number,
      name: string,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials.get(mat));
      mesh.position.set(x, y, z);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    const t = ROOM.wallThickness;
    box(ROOM.width, t, ROOM.depth, 'concrete.floor', 0, -t / 2, 0, 'Sol');
    box(ROOM.width, t, ROOM.depth, 'paint.wall', 0, ROOM.height + t / 2, 0, 'Plafond');
    box(ROOM.width, ROOM.height, t, 'paint.wall', 0, ROOM.height / 2, ROOM.minZ - t / 2, 'Mur nord');
    box(ROOM.width, ROOM.height, t, 'paint.wall', 0, ROOM.height / 2, ROOM.maxZ + t / 2, 'Mur sud');
    box(t, ROOM.height, ROOM.depth, 'paint.wall', ROOM.minX - t / 2, ROOM.height / 2, 0, 'Mur ouest');
    box(t, ROOM.height, ROOM.depth, 'paint.wall', ROOM.maxX + t / 2, ROOM.height / 2, 0, 'Mur est');
    const bw = BENCH.x[1] - BENCH.x[0];
    const bd = BENCH.z[1] - BENCH.z[0];
    const bx = (BENCH.x[0] + BENCH.x[1]) / 2;
    const bz = (BENCH.z[0] + BENCH.z[1]) / 2;
    box(
      bw,
      BENCH.topThickness,
      bd,
      'wood.bench',
      bx,
      BENCH.topHeight - BENCH.topThickness / 2,
      bz,
      'Plateau de l’établi',
    );
    box(
      bw - 0.1,
      BENCH.topHeight - BENCH.topThickness,
      bd - 0.1,
      'wood.plywood',
      bx,
      (BENCH.topHeight - BENCH.topThickness) / 2,
      bz,
      'Caisson',
    );
    box(
      MAT.size[0],
      MAT.thickness,
      MAT.size[1],
      'rubber.mat.green',
      MAT.center[0],
      MAT.center[1] - MAT.thickness / 2,
      MAT.center[2],
      'Tapis antistatique',
    );

    // Colliders : murs + établi.
    this.disposers.push(
      physics.addStatic({ kind: 'box', center: [0, -0.1, 0], halfExtents: [3, 0.1, 3], name: 'sol' }),
      physics.addStatic({ kind: 'box', center: [0, 1.35, ROOM.minZ - 0.1], halfExtents: [3, 1.5, 0.1] }),
      physics.addStatic({ kind: 'box', center: [0, 1.35, ROOM.maxZ + 0.1], halfExtents: [3, 1.5, 0.1] }),
      physics.addStatic({ kind: 'box', center: [ROOM.minX - 0.1, 1.35, 0], halfExtents: [0.1, 1.5, 3] }),
      physics.addStatic({ kind: 'box', center: [ROOM.maxX + 0.1, 1.35, 0], halfExtents: [0.1, 1.5, 3] }),
      physics.addStatic({
        kind: 'box',
        center: [bx, BENCH.topHeight / 2, bz],
        halfExtents: [bw / 2, BENCH.topHeight / 2, bd / 2],
      }),
    );

    progress(0.6, 'Éclairage…');
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a2e22, 0.6);
    const bulb = new THREE.PointLight(0xffc98a, 6, 8, 2);
    bulb.position.set(0, 2.35, 0);
    bulb.castShadow = true;
    this.root.add(hemi, bulb);
    this.ctx.engine.scene.add(this.root);
    this.ctx.engine.scene.background = new THREE.Color(0x0d0f12);
    progress(1, 'Salle prête');
  }

  update(_frame: FrameInfo): void {}

  /** Caméra lente de l'écran d'accueil. */
  updateHomeCamera(camera: THREE.PerspectiveCamera, time: number): void {
    const a = time * 0.05;
    camera.position.set(1.4 + Math.sin(a) * 0.4, 1.75, 1.2 + Math.cos(a) * 0.3);
    camera.lookAt(-0.8, 1.0, -1.6);
  }

  /** Mode inspection : éclairage studio, assombrissement, fond neutre. */
  setInspectionMode(_state: { active: boolean; neutral: boolean }): void {}

  dispose(): void {
    for (const d of this.disposers) d();
    this.ctx.engine.scene.remove(this.root);
  }
}
