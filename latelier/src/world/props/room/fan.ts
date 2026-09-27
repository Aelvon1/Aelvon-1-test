/**
 * Ventilateur sur pied (INTERACTIF, touche E) : montée et descente en régime (`FanSpin`), boucle
 * `fan.motor` positionnée au moteur, déclic `fan.toggle`. Socle, fût télescopique réparé au ruban
 * jaune, moteur, grilles chromées (fixes), rotor à trois pales vrillées + disque de flou à haut
 * régime.
 *
 * Approximation : les pales ne projettent pas d'ombre (les cartes d'ombres statiques ne sont pas
 * recalculées à chaque image), la tête n'oscille pas.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../../../core/context';
import type { LoopHandle } from '../../../audio/types';
import type { Interactable } from '../../types';
import { PropKit } from '../kit';
import { FAN } from '../dims';
import { FanSpin } from '../live';
import type { PropUniforms } from '../materials';
import { TINTS } from '../parts';
import { tint } from '../batch';

/** Arrêt : durée du ralentissement de la boucle audio (s), calée sur `FanSpin.TAU_DOWN`. */
const SPIN_DOWN_SECONDS = 3.6;

export class Fan {
  readonly interactable: Interactable;
  readonly spin = new FanSpin();
  /** Groupe du rotor (position du moyeu, orientation du ventilateur) ; `spinner` tourne. */
  readonly rotor = new THREE.Group();
  private readonly spinner = new THREE.Group();
  readonly hub = new THREE.Vector3();
  private highlight = 0;
  private loop: LoopHandle | null = null;
  private readonly targets: THREE.Object3D[] = [];

  constructor(
    private readonly ctx: AppContext,
    private readonly u: PropUniforms,
  ) {
    this.rotor.name = 'Rotor du ventilateur';
    this.rotor.add(this.spinner);
    this.interactable = {
      id: 'props.fan',
      targets: this.targets,
      maxDistance: 2.0,
      prompt: () => (this.spin.on ? 'Éteindre le ventilateur' : 'Allumer le ventilateur'),
      use: () => this.toggle(),
      setHighlighted: (on) => {
        this.highlight = on ? 1 : 0;
      },
    };
  }

  /** Parties fixes dans le lot principal ; rotor dans `rotorKit` (repère du moyeu, axe +Z). */
  build(kit: PropKit, rotorKit: PropKit): void {
    const [fx, , fz] = FAN.base;
    const body = { tint: TINTS.olive };
    kit.at([fx, 0, fz], [0, FAN.yaw, 0], () => {
      // Socle lesté et touches de vitesse.
      kit.lathe(
        'world.props.fanBody',
        [
          [0, 0.01],
          [FAN.baseRadius, 0.01],
          [FAN.baseRadius + 0.004, 0.018],
          [FAN.baseRadius - 0.012, 0.038],
          [0.1, 0.052],
          [0.03, 0.058],
          [0, 0.058],
        ],
        [0, 0, 0],
        [0, 0, 0],
        32,
        body,
      );
      kit.lathe(
        'rubber.black',
        [
          [0, 0],
          [FAN.baseRadius - 0.01, 0],
          [FAN.baseRadius - 0.012, 0.011],
          [0, 0.011],
        ],
        [0, 0, 0],
        [0, 0, 0],
        24,
        { castShadow: false },
      );
      for (let k = 0; k < 4; k++) {
        const pressed = k === 2;
        kit.box(
          'world.props.plastic',
          [-0.03 + k * 0.02, 0.05 + (pressed ? -0.003 : 0), 0.12],
          [0.016, 0.012, 0.022],
          0.003,
          {
            tint: k === 0 ? TINTS.plasticRed : TINTS.plasticCream,
          },
          [0.25, 0, 0],
        );
      }
      // Fût télescopique : tube peint, bague de serrage, tube chromé ; réparation au ruban jaune.
      kit.cylinder('world.props.fanBody', [0, 0.055, 0], [0, 0.73, 0], 0.017, 16, body);
      kit.cylinder('tape.yellow', [0, 0.39, 0], [0, 0.425, 0], 0.0185, 16, { castShadow: false });
      kit.cylinder('world.props.plastic', [0, 0.72, 0], [0, 0.75, 0], 0.024, 16, {
        tint: TINTS.plasticBlack,
      });
      kit.cylinder('steel.chrome', [0, 0.75, 0], [0, FAN.hubHeight - 0.1, 0], 0.012, 12);
      // Chape et bouton d'inclinaison.
      const hy = FAN.hubHeight;
      kit.box('world.props.fanBody', [0, hy - 0.09, -0.08], [0.03, 0.03, 0.03], 0.006, body);
      kit.box('world.props.fanBody', [0, hy - 0.06, -0.08], [0.02, 0.05, 0.02], 0.005, body, [0.3, 0, 0]);
      kit.cylinder('world.props.plastic', [0.012, hy - 0.05, -0.08], [0.03, hy - 0.05, -0.08], 0.011, 12, {
        tint: TINTS.plasticBlack,
      });
      // Carter moteur (révolution selon Z local) et plaque de marque.
      kit.lathe(
        'world.props.fanBody',
        [
          [0, -0.19],
          [0.03, -0.192],
          [0.062, -0.182],
          [0.076, -0.15],
          [0.078, -0.09],
          [0.066, -0.045],
          [0.035, -0.028],
          [0.012, -0.024],
          [0, -0.024],
        ]
          .map(([r, z]) => [r, -z] as const)
          .reverse(),
        [0, hy, 0],
        [-Math.PI / 2, 0, 0],
        28,
        body,
      );
      kit.decal('fanBadge', [0, hy, -0.1935], [0.056, 0.021], [0, Math.PI, 0]);
      // Grilles chromées : jonc, cercles, rayons (arrière plat, avant bombé), macaron central.
      const R = FAN.guardRadius;
      const wire = 0.0012;
      kit.add(
        'steel.chrome',
        new THREE.TorusGeometry(R, 0.003, 6, kit.seg(64)),
        PropKit.place([0, hy, 0.0]),
        { edge: 'none', castShadow: false },
      );
      const ring = (r: number, z: number) =>
        kit.add('steel.chrome', new THREE.TorusGeometry(r, wire, 4, kit.seg(48)), PropKit.place([0, hy, z]), {
          edge: 'none',
          castShadow: false,
        });
      const frontZ = (r: number) => 0.062 * (1 - (r / R) ** 2) + 0.004;
      const backZ = (r: number) => -0.036 * (1 - (r / R) ** 2) - 0.004;
      for (const r of [0.07, 0.12, 0.17]) ring(r, frontZ(r));
      for (const r of [0.09, 0.16]) ring(r, backZ(r));
      const spokes = (count: number, rIn: number, zAt: (r: number) => number) => {
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2;
          const pts: [number, number, number][] = [];
          for (const t of [0, 0.5, 1]) {
            const r = rIn + (R - rIn) * t;
            pts.push([Math.cos(a) * r, hy + Math.sin(a) * r, zAt(r)]);
          }
          kit.tube('steel.chrome', pts, wire, 4, { perMeter: 30, castShadow: false });
        }
      };
      spokes(kit.level >= 2 ? 36 : 24, 0.04, frontZ);
      spokes(kit.level >= 2 ? 24 : 16, 0.06, backZ);
      kit.cylinder('world.props.plastic', [0, hy, frontZ(0.0)], [0, hy, frontZ(0) + 0.006], 0.036, 24, {
        tint: TINTS.plasticCream,
        castShadow: false,
      });
      kit.toWorld([0, hy, 0], this.hub);
    });
    // Rotor (repère du moyeu) : cône de moyeu, trois pales vrillées, disque de flou.
    rotorKit.lathe(
      'world.props.plastic',
      [
        [0.046, -0.02],
        [0.046, 0.012],
        [0.035, 0.03],
        [0.015, 0.038],
        [0, 0.04],
      ].map(([r, z]) => [r, z] as const),
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
      24,
      { tint: TINTS.plasticCream },
    );
    for (let k = 0; k < 3; k++)
      rotorKit.add(
        'world.props.plastic',
        bladeGeometry(),
        PropKit.place([0, 0, 0], [0, 0, (k * Math.PI * 2) / 3]),
        {
          tint: tint(0x5f8a95, 0.3),
          edge: 'none',
        },
      );
    const disc = new THREE.CircleGeometry(0.2, rotorKit.seg(48));
    rotorKit.add('world.props.fanBlur', disc, PropKit.place([0, 0, 0.002]), {
      uv: 'keep',
      edge: 'none',
      castShadow: false,
    });
  }

  /** Associe les maillages : cibles du réticule, rotor placé au moyeu. */
  bind(mainMeshes: readonly THREE.Mesh[], rotorMeshes: readonly THREE.Mesh[]): void {
    for (const m of mainMeshes)
      if ((m.material as THREE.Material).name === 'world.props.fanBody') this.targets.push(m);
    for (const m of rotorMeshes) {
      m.castShadow = false;
      this.spinner.add(m);
      this.targets.push(m);
    }
    this.rotor.position.copy(this.hub);
    this.rotor.rotation.set(0, FAN.yaw, 0);
  }

  toggle(): void {
    this.spin.on = !this.spin.on;
    const audio = this.ctx.audio;
    audio.play('fan.toggle', { position: this.hub });
    if (this.spin.on) {
      this.loop?.stop(0.05);
      this.loop = audio.loop('fan.motor', { position: this.hub, volume: 0.7 });
    } else {
      this.loop?.stop(SPIN_DOWN_SECONDS);
      this.loop = null;
    }
  }

  update(dt: number): void {
    this.spin.update(dt);
    this.spinner.rotation.z = -this.spin.angle;
    this.u.fanBlur.value = this.spin.blur;
    const h = this.u.fanHighlight;
    h.value += (this.highlight - h.value) * Math.min(1, dt * 10);
  }

  dispose(): void {
    this.loop?.stop(0.2);
    this.loop = null;
  }
}

/**
 * Pale : contour en palette (pied étroit, bout arrondi) extrudé sur 2,5 mm puis vrillé autour de
 * son axe radial (pas plus fort au pied qu'en bout, comme une vraie hélice).
 */
function bladeGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r0 = 0.04;
  const r1 = 0.2;
  shape.moveTo(r0, -0.016);
  shape.bezierCurveTo(0.09, -0.03, 0.15, -0.052, 0.18, -0.05);
  shape.bezierCurveTo(0.2, -0.048, r1 + 0.004, -0.02, r1, 0.005);
  shape.bezierCurveTo(0.196, 0.04, 0.17, 0.058, 0.14, 0.052);
  shape.bezierCurveTo(0.1, 0.045, 0.06, 0.03, r0, 0.016);
  shape.lineTo(r0, -0.016);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0025,
    bevelEnabled: true,
    bevelThickness: 0.0006,
    bevelSize: 0.0008,
    bevelSegments: 1,
    curveSegments: 8,
    steps: 1,
  });
  g.translate(0, 0, -0.00125);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const r = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.min(1, Math.max(0, (r - r0) / (r1 - r0)));
    const twist = 0.62 - 0.3 * t;
    // Légère cambrure : le bord d'attaque avance.
    const camber = 0.004 * (1 - (y / 0.05) ** 2);
    pos.setXYZ(
      i,
      r,
      y * Math.cos(twist) - z * Math.sin(twist),
      y * Math.sin(twist) + z * Math.cos(twist) + camber,
    );
  }
  g.computeVertexNormals();
  return g;
}
