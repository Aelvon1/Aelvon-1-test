/**
 * Lampe loupe articulée sur l'établi : socle lesté, fût, deux bras à tiges parallèles et
 * ressorts, rotules en bakélite, tête annulaire (boîtier orange brûlé, tube circulaire émissif,
 * lentille biconvexe à transmission, poignée) et SpotLight orienté par la tête.
 *
 * Deux poses : « repos » (tête relevée, éclaire le bord du tapis) et « inspection » (tête
 * au-dessus du tapis, orientée vers son centre). Le bras est résolu par cinématique inverse à
 * deux segments ; la transition est animée sans allocation par image.
 */
import * as THREE from 'three/webgpu';
import { easeInOutCubic } from '../../core/cameraTween';
import { MAT, SPOTS } from '../layout';
import { StaticBatch } from '../geometry/StaticBatch';
import { cylinderBetween, HelixCurve, lathe, place, roundedBox, tubeAlong } from '../geometry/shapes';
import { ELECTRIC } from './dims';
import { solveTwoLink } from './lampIK';
import type { DecorBuild } from './types';

export type LampPose = 'idle' | 'inspect';

const L1 = 0.44;
const L2 = 0.42;
const SHOULDER_HEIGHT = 0.16;
/** Point d'attache du bras sur la tête (repère de la tête, +Z = axe optique). */
const HEAD_ATTACH = new THREE.Vector3(0, 0.118, -0.008);

const POSES: Record<LampPose, { wrist: THREE.Vector3; look: THREE.Vector3 }> = {
  idle: {
    wrist: new THREE.Vector3(-1.25, 1.44, -1.78),
    look: new THREE.Vector3(-1.02, MAT.center[1], -1.6),
  },
  inspect: {
    wrist: new THREE.Vector3(MAT.center[0] - 0.19, MAT.center[1] + 0.47, MAT.center[2] - 0.2),
    look: new THREE.Vector3(MAT.center[0], MAT.center[1], MAT.center[2]),
  },
};

export class MagnifierLamp {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  readonly light: THREE.SpotLight;
  /** Maillages visés par l'invite « Allumer/Éteindre la lampe ». */
  readonly targets: THREE.Mesh[] = [];
  /** Puissance lumineuse effective 0..1 (rampe douce). */
  power = 1;
  private on = true;
  private pose: LampPose = 'idle';
  private readonly yawGroup = new THREE.Group();
  private readonly shoulder = new THREE.Group();
  private readonly elbow = new THREE.Group();
  private readonly shoulderWorld: THREE.Vector3;
  private readonly wrist = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fromWrist = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private readonly anchor = new THREE.Object3D();
  private readonly aim = new THREE.Object3D();
  private animT = 1;
  private animDuration = 1.2;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(private readonly b: DecorBuild) {
    const [bx, by, bz] = SPOTS.magnifierLampBase;
    this.root.name = 'Lampe loupe';
    this.root.position.set(bx, by, bz);
    this.shoulderWorld = new THREE.Vector3(bx, by + SHOULDER_HEIGHT, bz);
    this.buildBase();
    this.buildArms();
    this.light = this.buildHead();
    this.buildCord();
    b.group.add(this.root);
    this.wrist.copy(POSES.idle.wrist);
    this.look.copy(POSES.idle.look);
    this.applyPose();
  }

  get isOn(): boolean {
    return this.on;
  }

  get currentPose(): LampPose {
    return this.pose;
  }

  get moving(): boolean {
    return this.animT < 1;
  }

  setOn(on: boolean): void {
    this.on = on;
  }

  /** Change de pose (animée sauf `immediate`). */
  setPose(pose: LampPose, immediate = false): void {
    if (pose === this.pose && this.animT >= 1) return;
    this.pose = pose;
    if (immediate) {
      this.wrist.copy(POSES[pose].wrist);
      this.look.copy(POSES[pose].look);
      this.animT = 1;
      this.applyPose();
      return;
    }
    this.fromWrist.copy(this.wrist);
    this.fromLook.copy(this.look);
    this.animT = 0;
    this.animDuration = 1.25;
  }

  /** Met à jour la rampe d'allumage et l'animation du bras ; retourne vrai si le bras a bougé. */
  update(dt: number): boolean {
    const target = this.on ? 1 : 0;
    const rate = this.on ? 7 : 12;
    this.power += (target - this.power) * Math.min(1, dt * rate);
    if (Math.abs(this.power - target) < 1e-3) this.power = target;
    if (this.animT >= 1) return false;
    this.animT = Math.min(1, this.animT + dt / this.animDuration);
    const k = easeInOutCubic(this.animT);
    const goal = POSES[this.pose];
    this.wrist.lerpVectors(this.fromWrist, goal.wrist, k);
    // Légère remontée à mi-course (le bras « enjambe » le tapis).
    this.wrist.y += Math.sin(Math.PI * k) * 0.05;
    this.look.lerpVectors(this.fromLook, goal.look, k);
    this.applyPose();
    return true;
  }

  // --- Pose -------------------------------------------------------------------------------

  private applyPose(): void {
    const s = this.shoulderWorld;
    const dx = this.wrist.x - s.x;
    const dz = this.wrist.z - s.z;
    const r = Math.hypot(dx, dz);
    const h = this.wrist.y - s.y;
    const yaw = Math.atan2(dx, dz);
    const solution = solveTwoLink(r, h, L1, L2);
    this.yawGroup.rotation.y = yaw;
    this.shoulder.rotation.x = solution.a1;
    this.elbow.rotation.x = solution.a2 - solution.a1;
    // Tête : axe optique vers la cible, point d'attache au poignet (repère du socle).
    this.head.position.copy(this.wrist).sub(this.root.position);
    this.tmp.copy(this.look);
    this.head.lookAt(this.tmp);
    this.tmp.copy(HEAD_ATTACH).applyQuaternion(this.tmpQ.copy(this.head.quaternion));
    this.head.position.sub(this.tmp);
    this.root.updateMatrixWorld(true);
    this.syncLight();
  }

  /** Recopie la pose de la tête sur la SpotLight (repère monde). */
  private syncLight(): void {
    const light = this.light as THREE.SpotLight | undefined;
    if (!light) return;
    this.anchor.getWorldPosition(light.position);
    this.aim.getWorldPosition(light.target.position);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
  }

  // --- Construction ---------------------------------------------------------------------------

  private mesh(
    material: string,
    geometry: THREE.BufferGeometry,
    name: string,
    castShadow = true,
  ): THREE.Mesh {
    const batch = new StaticBatch();
    batch.add(material, geometry, null, { edge: material.startsWith('world.lamp.housing') ? 'box' : 'none' });
    const mesh = batch.build((id) => this.b.materials.get(id), name)[0]!;
    mesh.name = name;
    mesh.matrixAutoUpdate = true;
    mesh.castShadow = castShadow;
    return mesh;
  }

  private buildBase(): void {
    const base = lathe(
      [
        [0.0, 0.0],
        [0.072, 0.0],
        [0.076, 0.004],
        [0.076, 0.012],
        [0.07, 0.02],
        [0.05, 0.026],
        [0.02, 0.029],
        [0.0, 0.029],
      ],
      36,
    );
    const baseMesh = this.mesh('world.lamp.housing', base, 'Socle de la lampe');
    this.root.add(baseMesh);
    this.targets.push(baseMesh);
    const post = cylinderBetween(
      new THREE.Vector3(0, 0.025, 0),
      new THREE.Vector3(0, SHOULDER_HEIGHT - 0.012, 0),
      0.011,
      16,
    );
    post.geometry.applyMatrix4(post.matrix);
    this.root.add(this.mesh('steel.chrome', post.geometry, 'Fût'));
    this.yawGroup.position.set(0, SHOULDER_HEIGHT, 0);
    this.root.add(this.yawGroup);
    // Rotule d'épaule (axe X du plan du bras) + molette de serrage.
    const knuckle = new THREE.CylinderGeometry(0.017, 0.017, 0.036, 20);
    knuckle.rotateZ(Math.PI / 2);
    this.yawGroup.add(this.mesh('world.bakelite', knuckle, 'Rotule d’épaule'));
    const knob = new THREE.CylinderGeometry(0.015, 0.015, 0.012, 20);
    knob.rotateZ(Math.PI / 2);
    knob.translate(0.026, 0, 0);
    this.yawGroup.add(this.mesh('world.bakelite', knob, 'Molette'));
  }

  private armSegment(parent: THREE.Group, length: number, springFrom: number, springTo: number): void {
    const rods = new StaticBatch();
    for (const x of [-0.012, 0.012]) {
      const rod = cylinderBetween(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, length, 0), 0.0042, 10);
      rods.add('steel.chrome', rod.geometry, rod.matrix, { edge: 'none' });
    }
    // Ressort d'équilibrage entre les tiges, décalé vers l'arrière.
    const spring = tubeAlong(new HelixCurve(0.0055, springTo - springFrom, 20), 0.0011, 5, 900);
    rods.add('steel.spring', spring, place([0, springFrom, -0.012]), { edge: 'none' });
    const hook = cylinderBetween(
      new THREE.Vector3(0, springTo, -0.012),
      new THREE.Vector3(0, length - 0.03, -0.004),
      0.0012,
      5,
    );
    rods.add('steel.spring', hook.geometry, hook.matrix, { edge: 'none' });
    for (const mesh of rods.build((id) => this.b.materials.get(id), 'Bras')) {
      mesh.matrixAutoUpdate = true;
      parent.add(mesh);
      this.targets.push(mesh);
    }
  }

  private buildArms(): void {
    this.yawGroup.add(this.shoulder);
    this.armSegment(this.shoulder, L1, 0.05, 0.2);
    this.elbow.position.set(0, L1, 0);
    this.shoulder.add(this.elbow);
    const knuckle = new THREE.CylinderGeometry(0.015, 0.015, 0.034, 20);
    knuckle.rotateZ(Math.PI / 2);
    this.elbow.add(this.mesh('world.bakelite', knuckle, 'Rotule de coude'));
    this.armSegment(this.elbow, L2, 0.04, 0.17);
    const wrist = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16);
    wrist.rotateZ(Math.PI / 2);
    wrist.translate(0, L2, 0);
    this.elbow.add(this.mesh('world.bakelite', wrist, 'Rotule de poignet'));
    // Ruban adhésif jaune : réparation d'une tige fendue (touche vive).
    const tape = new THREE.CylinderGeometry(0.02, 0.02, 0.028, 18, 1, true);
    tape.scale(1, 1, 0.45);
    tape.translate(0, L1 * 0.55, 0);
    this.shoulder.add(this.mesh('tape.yellow', tape, 'Ruban adhésif'));
  }

  private buildHead(): THREE.SpotLight {
    // Boîtier annulaire (profil fermé parcouru dans le sens trigonométrique : normales sortantes).
    const housing = lathe(
      [
        [0.1, -0.022],
        [0.107, -0.015],
        [0.109, 0.012],
        [0.101, 0.021],
        [0.082, 0.022],
        [0.07, 0.017],
        [0.068, 0.011],
        [0.068, -0.01],
        [0.071, -0.019],
        [0.085, -0.024],
        [0.1, -0.022],
      ],
      48,
    );
    housing.rotateX(Math.PI / 2);
    const housingMesh = this.mesh('world.lamp.housing', housing, 'Tête de la loupe');
    this.head.add(housingMesh);
    this.targets.push(housingMesh);
    // Tube circulaire (émissif) sous la lèvre avant.
    const ring = new THREE.TorusGeometry(0.086, 0.0068, 10, 64);
    ring.translate(0, 0, 0.024);
    this.head.add(this.mesh('world.lamp.ring', ring, 'Tube circulaire', false));
    // Lentille biconvexe (verre à transmission).
    const lens = lathe(
      [
        [0.0, -0.0065],
        [0.03, -0.0056],
        [0.05, -0.0037],
        [0.066, -0.0009],
        [0.066, 0.0009],
        [0.05, 0.0037],
        [0.03, 0.0056],
        [0.0, 0.0065],
      ],
      48,
    );
    lens.rotateX(Math.PI / 2);
    const lensMesh = this.mesh('world.lamp.lens', lens, 'Lentille', false);
    this.head.add(lensMesh);
    // Poignée latérale et chape d'attache.
    const grip = roundedBox(0.05, 0.022, 0.02, 0.009, 2);
    grip.translate(0.13, 0, -0.004);
    this.head.add(this.mesh('world.bakelite', grip, 'Poignée'));
    const yoke = new THREE.CylinderGeometry(0.011, 0.011, 0.034, 16);
    yoke.rotateZ(Math.PI / 2);
    yoke.translate(HEAD_ATTACH.x, HEAD_ATTACH.y, HEAD_ATTACH.z);
    this.head.add(this.mesh('world.bakelite', yoke, 'Chape'));
    const neck = roundedBox(0.016, 0.02, 0.012, 0.004, 1);
    neck.translate(0, 0.104, -0.008);
    this.head.add(this.mesh('world.lamp.housing', neck, 'Col'));
    this.root.add(this.head);

    // La SpotLight n'est PAS enfant de la tête : elle doit rester visible quand la salle est
    // masquée (fond studio), sinon l'ensemble des lumières change et tous les shaders sont
    // recompilés. Sa pose est recopiée depuis deux repères de la tête (`syncLight`).
    this.anchor.position.set(0, 0, 0.03);
    this.aim.position.set(0, 0, 1);
    this.head.add(this.anchor, this.aim);
    const light = new THREE.SpotLight(0xf1f5ff, 0, 3, 0.62, 0.7, 2);
    light.name = 'Lampe loupe';
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = 3;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.01;
    light.shadow.radius = 3;
    return light;
  }

  private buildCord(): void {
    const [ox, oy, oz] = ELECTRIC.outlet;
    const [bx, by, bz] = SPOTS.magnifierLampBase;
    const cord = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx - 0.02, by + 0.012, bz - 0.07),
      new THREE.Vector3(bx + 0.05, by + 0.006, bz - 0.085),
      new THREE.Vector3(bx + 0.8, by + 0.005, bz - 0.08),
      new THREE.Vector3(ox - 0.25, by + 0.005, bz - 0.075),
      new THREE.Vector3(ox - 0.08, by + 0.03, oz + 0.07),
      new THREE.Vector3(ox, oy + 0.03, oz + 0.07),
    ]);
    this.b.batch.add('rubber.black', tubeAlong(cord, 0.0032, 6, 50), null, {
      edge: 'none',
      castShadow: false,
    });
    const plug = roundedBox(0.034, 0.04, 0.032, 0.006, 2);
    this.b.batch.add('plastic.black', plug, place([ox, oy + 0.03, oz + 0.066]), { castShadow: false });
  }
}
