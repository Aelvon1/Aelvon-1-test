/**
 * Radio-cassette du coin électronique (INTERACTIVE, touche E) : allume/éteint la boucle
 * `radio.music` (poste AM synthétisé), déclic `radio.toggle`, cadran rétroéclairé, voyant, état
 * `store.radio` (station inventée). Boîtier argenté, enceintes à grilles concentriques, cassette
 * visible derrière la fenêtre, touches piano, poignée et antenne télescopique réparée au ruban.
 */
import * as THREE from 'three/webgpu';
import type { AppContext } from '../../../core/context';
import type { LoopHandle } from '../../../audio/types';
import type { Interactable } from '../../types';
import { PropKit } from '../kit';
import { RADIO } from '../dims';
import { panelPoint, panelRadius, panelRect, RADIO_PANEL } from '../atlas/panels';
import { dialPositionPO, RADIO_STATION } from '../atlas/regions';
import { LED_CHANNEL, type PropUniforms } from '../materials';
import { knob, TINTS } from '../parts';
import { tint } from '../batch';

/** Qualité de réception (0..1) : poste AM au fond d'une vallée boisée, légèrement brouillé. */
const RECEPTION = 0.82;

export class Radio {
  readonly interactable: Interactable;
  /** Centre acoustique (monde). */
  readonly position = new THREE.Vector3();
  private on = false;
  private power = 0;
  private highlight = 0;
  private loop: LoopHandle | null = null;
  private readonly targets: THREE.Object3D[] = [];

  constructor(
    private readonly ctx: AppContext,
    private readonly u: PropUniforms,
  ) {
    this.interactable = {
      id: 'props.radio',
      targets: this.targets,
      maxDistance: 1.9,
      prompt: () => (this.on ? 'Éteindre la radio' : 'Allumer la radio'),
      use: () => this.toggle(),
      setHighlighted: (on) => {
        this.highlight = on ? 1 : 0;
      },
    };
    ctx.store.setState({ radio: { on: false, stationLabel: RADIO_STATION.label } });
  }

  get isOn(): boolean {
    return this.on;
  }

  /** Géométrie (lot principal : le boîtier a son matériau propre, mis en évidence au regard). */
  build(kit: PropKit): void {
    const [bx, by, bz] = RADIO.base;
    const [W, H, D] = RADIO.size;
    const P = RADIO_PANEL;
    kit.at([bx, by, bz], [0, Math.PI / 2 - RADIO.yaw, 0], () => {
      const y0 = 0.008;
      for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) {
        for (const z of [-D / 2 + 0.02, D / 2 - 0.02])
          kit.cylinder('rubber.black', [x, 0, z], [x, y0, z], 0.008, 8, { castShadow: false });
      }
      kit.box(
        'world.props.radioBody',
        [0, y0 + H / 2, 0],
        [W, H, D],
        0.007,
        { tint: TINTS.plasticSilver },
        [0, 0, 0],
        2,
      );
      const faceZ = D / 2 + 0.0008;
      const cy = y0 + H / 2;
      kit.decal('radio', [0, cy, faceZ], [W, H]);
      // Enceintes : grilles à anneaux concentriques et enjoliveurs chromés.
      const gr = panelRadius(P, P.grilleRadius);
      for (const uv of P.grilles) {
        const [x, y] = panelPoint(P, uv);
        const profile: [number, number][] = [[gr, 0]];
        const rings = 9;
        for (let k = 1; k <= rings; k++) {
          const r = gr * (1 - k / (rings + 1));
          profile.push([r + gr * 0.03, 0.0035 + k * 0.0004], [r, 0.001 + k * 0.0004]);
        }
        profile.push([0, 0.006]);
        kit.lathe('steel.blackoxide', profile, [x, cy + y, faceZ], [Math.PI / 2, 0, 0], 28, {
          castShadow: false,
        });
        kit.add(
          'steel.chrome',
          new THREE.TorusGeometry(gr + 0.003, 0.0026, 6, kit.seg(40)),
          PropKit.place([x, cy + y, faceZ + 0.002]),
          {
            edge: 'none',
            castShadow: false,
          },
        );
      }
      // Cadran rétroéclairé et aiguille calée sur la station.
      const dial = panelRect(P, P.dial);
      const [dx, dy] = dial.center;
      kit.atlasQuad(
        'world.props.dial',
        'radioDial',
        [dx, cy + dy, faceZ + 0.0008],
        [dial.size[0] * 0.96, dial.size[1] * 0.9],
      );
      const needleX = dx - dial.size[0] * 0.48 + dialPositionPO(RADIO_STATION.khz) * dial.size[0] * 0.96;
      kit.box(
        'world.props.plastic',
        [needleX, cy + dy, faceZ + 0.002],
        [0.0012, dial.size[1] * 0.86, 0.0008],
        0,
        {
          tint: tint(0xd02a18, 0.4),
          castShadow: false,
          edge: 'none',
        },
      );
      kit.add(
        'world.props.drawer',
        new THREE.PlaneGeometry(dial.size[0], dial.size[1]),
        PropKit.place([dx, cy + dy, faceZ + 0.003]),
        {
          uv: 'keep',
          edge: 'none',
          castShadow: false,
        },
      );
      // Boutons d'accord et de volume.
      P.knobs.forEach((uv, k) => {
        const [x, y] = panelPoint(P, uv);
        knob(kit, [x, cy + y, faceZ], panelRadius(P, P.knobRadius), 0.016, k === 0 ? 0.7 : -0.4, {
          skirt: TINTS.plasticSilver,
          metalCap: true,
        });
      });
      const [lx, ly] = panelPoint(P, P.led);
      kit.led([lx, cy + ly, faceZ], 0.0022, 0xff6a1a, LED_CHANNEL.radio);
      // Logement de cassette : cadre, cassette et son étiquette, fenêtre transparente.
      const cas = panelRect(P, P.cassette);
      const [cx, cyy] = cas.center;
      const [cw, ch] = cas.size;
      const frame = { tint: TINTS.plasticDark, castShadow: false };
      kit.box(
        'world.props.plastic',
        [cx, cy + cyy + ch / 2, faceZ + 0.005],
        [cw + 0.008, 0.006, 0.01],
        0.002,
        frame,
      );
      kit.box(
        'world.props.plastic',
        [cx, cy + cyy - ch / 2, faceZ + 0.005],
        [cw + 0.008, 0.006, 0.01],
        0.002,
        frame,
      );
      kit.box('world.props.plastic', [cx - cw / 2, cy + cyy, faceZ + 0.005], [0.006, ch, 0.01], 0.002, frame);
      kit.box('world.props.plastic', [cx + cw / 2, cy + cyy, faceZ + 0.005], [0.006, ch, 0.01], 0.002, frame);
      kit.box('world.props.plastic', [cx, cy + cyy - 0.004, faceZ + 0.001], [0.1, 0.063, 0.004], 0.002, {
        tint: TINTS.plasticBlack,
        castShadow: false,
      });
      kit.decal('cassette', [cx, cy + cyy + 0.008, faceZ + 0.0032], [0.084, 0.023]);
      for (const sx of [-0.025, 0.025]) {
        kit.cylinder(
          'world.props.plastic',
          [cx + sx, cy + cyy - 0.012, faceZ + 0.003],
          [cx + sx, cy + cyy - 0.012, faceZ + 0.0036],
          0.008,
          12,
          {
            tint: TINTS.plasticCream,
            castShadow: false,
          },
        );
      }
      kit.add(
        'world.props.drawer',
        new THREE.PlaneGeometry(cw, ch),
        PropKit.place([cx, cy + cyy, faceZ + 0.0085]),
        {
          uv: 'keep',
          edge: 'none',
          castShadow: false,
        },
      );
      // Touches piano sur le dessus (lecture enfoncée).
      for (let k = 0; k < 6; k++) {
        const pressed = k === 1;
        kit.box(
          'world.props.plastic',
          [-0.07 + k * 0.028, y0 + H + (pressed ? 0.002 : 0.006), D / 2 - 0.022],
          [0.024, 0.012, 0.03],
          0.003,
          {
            tint: k === 5 ? TINTS.plasticRed : TINTS.plasticDark,
          },
        );
      }
      // Poignée chromée et antenne télescopique (ruban jaune sur une jointure).
      kit.tube(
        'steel.chrome',
        [
          [-0.16, y0 + H, -0.005],
          [-0.15, y0 + H + 0.05, -0.005],
          [0, y0 + H + 0.058, -0.005],
          [0.15, y0 + H + 0.05, -0.005],
          [0.16, y0 + H, -0.005],
        ],
        0.007,
        10,
        { perMeter: 50, castShadow: true },
      );
      const a0: [number, number, number] = [W / 2 - 0.03, y0 + H + 0.004, -D / 2 + 0.018];
      const dir = new THREE.Vector3(-0.45, 0.85, -0.25).normalize();
      const at = (d: number): [number, number, number] => [
        a0[0] + dir.x * d,
        a0[1] + dir.y * d,
        a0[2] + dir.z * d,
      ];
      kit.cylinder('steel.chrome', a0, at(0.012), 0.008, 10);
      kit.cylinder('steel.chrome', at(0.012), at(0.19), 0.0042, 8);
      kit.cylinder('steel.chrome', at(0.19), at(0.36), 0.0031, 8);
      kit.cylinder('steel.chrome', at(0.36), at(0.5), 0.0021, 6);
      kit.cylinder('tape.yellow', at(0.176), at(0.206), 0.0052, 10, { castShadow: false });
      // Cordon secteur qui plonge derrière le bureau.
      kit.tube(
        'rubber.black',
        [
          [-W / 2 + 0.04, y0 + 0.03, -D / 2],
          [-W / 2 + 0.03, y0 + 0.01, -D / 2 - 0.04],
          [-W / 2 + 0.02, -0.02, -D / 2 - 0.06],
          [-W / 2 + 0.02, -0.3, -D / 2 - 0.06],
        ],
        0.0028,
        6,
        { perMeter: 30 },
      );
      kit.toWorld([0, cy, faceZ], this.position);
    });
  }

  /** Associe les maillages construits (cibles du réticule). */
  bind(meshes: readonly THREE.Mesh[]): void {
    for (const m of meshes) {
      if ((m.material as THREE.Material).name === 'world.props.radioBody') this.targets.push(m);
    }
  }

  toggle(): void {
    this.on = !this.on;
    const audio = this.ctx.audio;
    audio.play('radio.toggle', { position: this.position });
    if (this.on) {
      this.loop = audio.loop('radio.music', { position: this.position, volume: 0.85 });
      this.loop.setIntensity(RECEPTION);
    } else {
      this.loop?.stop(0.25);
      this.loop = null;
    }
    this.ctx.store.setState({ radio: { on: this.on, stationLabel: RADIO_STATION.label } });
  }

  update(dt: number): void {
    const target = this.on ? 1 : 0;
    // Lampe de cadran : montée rapide (filament), extinction un peu plus lente.
    this.power += (target - this.power) * Math.min(1, dt * (this.on ? 9 : 5));
    this.u.radioOn.value = this.power;
    const h = this.u.radioHighlight;
    h.value += (this.highlight - h.value) * Math.min(1, dt * 10);
  }

  dispose(): void {
    this.loop?.stop(0.2);
    this.loop = null;
    this.ctx.store.setState({ radio: { on: false, stationLabel: RADIO_STATION.label } });
  }
}
