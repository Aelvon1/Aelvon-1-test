/**
 * Matériaux propres aux accessoires (TSL sur NodeMaterial, aucun GLSL), enregistrés dans le
 * cache du décor (`world.materials.adopt`, identifiants `world.props.*`) : ils sont libérés avec
 * le décor.
 *
 * - `world.props.paint` : tôle peinte « à la main » TEINTÉE PAR SOMMET (attribut `tint` : rgb =
 *   couleur, a = usure 0..1) — arêtes éclaircies puis écaillées (apprêt, métal nu), rayures,
 *   rouille dans les recoins, crasse, poussière, traces de doigts. Toutes les tôles peintes des
 *   accessoires (servante, étagères, boîtiers d'appareils, extincteur…) : UN appel de dessin.
 * - `world.props.plastic` : plastique moulé teinté (a = rugosité) — arêtes blanchies, rayures,
 *   poussière, traces de doigts.
 * - `world.props.slotted` : cornière perforée (peinture teintée + trous oblongs masqués en TSL).
 * - `world.props.decal` : atlas des sérigraphies/affiches/étiquettes (découpe alpha) ; les
 *   silhouettes peintes du panneau perforé laissent voir ses trous.
 * - Émissifs animés : écran d'oscilloscope (trace qui défile, rémanence du phosphore vert),
 *   afficheurs 7 segments à LED, cristaux liquides du multimètre, voyants, cadran de la radio.
 * - Tiroirs transparents (transmission ; simple transparence en qualité Basse).
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  cos,
  dFdx,
  dFdy,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  mod,
  positionWorld,
  pow,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { AppContext } from '../../core/context';
import {
  bumpNormal,
  cavityMask,
  dirtMask,
  dustMask,
  edgeMask,
  fingerprintMask,
  PALETTE,
  rgb,
  rustColor,
  rustMask,
  smudgeRoughness,
  SurfaceKit,
  wearMask,
  type MaterialEnv,
} from '../../materials';
import { PEGBOARD } from '../layout';
import { addHighlight } from '../materials/WorldMaterials';
import { hash12 } from '../materials/tslNoise';
import type { World } from '../World';

type FloatNode = Node<'float'>;
type Vec2Node = Node<'vec2'>;
type Vec3Node = Node<'vec3'>;
type Vec4Node = Node<'vec4'>;

/** Nombre d'afficheurs 7 segments à LED gérés par le matériau commun. */
export const LED_DISPLAYS = 4;

/** Canaux des voyants (composante `a` de la teinte des voyants). */
export const LED_CHANNEL = {
  on: 0,
  heater: 1,
  radio: 2,
  charger: 3,
  boardA: 4,
  boardB: 5,
  hotAir: 6,
  /** Canal jamais allumé (voyant éteint). */
  off: 7,
} as const;

/** Uniformes pilotés par la logique des accessoires (écrits sans allocation). */
export function createPropUniforms() {
  return {
    /** Codes 7 segments (4 chiffres) de chaque afficheur à LED. */
    segCodes: [
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
      uniform(new THREE.Vector4()),
    ] as const,
    /** Indice du chiffre portant le point décimal, par afficheur (−1 : aucun). */
    segDp: uniform(new THREE.Vector4(-1, -1, -1, -1)),
    /** Multimètre (cristaux liquides). */
    lcdCodes: uniform(new THREE.Vector4()),
    lcdDp: uniform(-1),
    /** États des voyants (canaux 1..4, puis 5..8). */
    ledA: uniform(new THREE.Vector4()),
    ledB: uniform(new THREE.Vector4()),
    /** Radio allumée (0..1, rampe). */
    radioOn: uniform(0),
    /** Opacité du disque de flou des pales. */
    fanBlur: uniform(0),
    /** Mises en évidence au regard. */
    radioHighlight: uniform(0),
    fanHighlight: uniform(0),
  };
}

export type PropUniforms = ReturnType<typeof createPropUniforms>;

/** Masques d'un chiffre 7 segments (`p` : coordonnées de la cellule, 0..1, y vers le haut). */
function sevenSegment(p: Vec2Node, code: FloatNode, dpOn: FloatNode): { lit: FloatNode; all: FloatNode } {
  // Chiffres légèrement penchés (afficheurs de l'époque).
  const q = vec2(p.x.sub(p.y.sub(0.5).mul(0.12)), p.y);
  const segment = (cx: number, cy: number, hx: number, hy: number): FloatNode => {
    const r = 0.035;
    const d = abs(q.sub(vec2(cx, cy))).sub(vec2(hx - r, hy - r));
    const dist = length(max(d, vec2(0, 0)))
      .add(min(max(d.x, d.y), 0))
      .sub(r);
    return smoothstep(0.018, -0.018, dist);
  };
  // Bits : a = 1, b = 2, c = 4, d = 8, e = 16, f = 32, g = 64 (voir `sevenSeg.ts`).
  const segs: [FloatNode, number][] = [
    [segment(0.5, 0.86, 0.22, 0.045), 1],
    [segment(0.765, 0.68, 0.045, 0.16), 2],
    [segment(0.765, 0.32, 0.045, 0.16), 4],
    [segment(0.5, 0.14, 0.22, 0.045), 8],
    [segment(0.235, 0.32, 0.045, 0.16), 16],
    [segment(0.235, 0.68, 0.045, 0.16), 32],
    [segment(0.5, 0.5, 0.22, 0.045), 64],
  ];
  let lit: FloatNode = float(0);
  let all: FloatNode = float(0);
  for (const [mask, bit] of segs) {
    const on = mod(floor(code.div(bit)), 2);
    lit = lit.add(mask.mul(on));
    all = all.add(mask);
  }
  const dot = smoothstep(0.06, 0.035, length(p.sub(vec2(0.93, 0.12))));
  return { lit: min(lit.add(dot.mul(dpOn)), 1), all: min(all.add(dot), 1) };
}

/** Sélection de la composante `i` (0..3) d'un vec4. */
function pick4(v: Vec4Node, i: FloatNode): FloatNode {
  return select(i.lessThan(0.5), v.x, select(i.lessThan(1.5), v.y, select(i.lessThan(2.5), v.z, v.w)));
}

export class PropMaterials {
  readonly u: PropUniforms = createPropUniforms();
  readonly atlas: THREE.Texture;
  private readonly env: MaterialEnv;
  private readonly world: World;
  private drawerFull: THREE.Material | null = null;
  private drawerSimple: THREE.Material | null = null;

  constructor(ctx: AppContext, world: World, atlas: THREE.Texture) {
    this.world = world;
    this.atlas = atlas;
    this.env = { textures: ctx.textures, quality: ctx.engine.quality.level };
    const adopt = (id: string, m: THREE.Material) => world.materials.adopt(id, m);
    adopt('world.props.paint', this.paint(false));
    adopt('world.props.slotted', this.paint(true));
    adopt('world.props.plastic', this.plastic());
    adopt('world.props.decal', this.decal());
    adopt('world.props.dial', this.dial());
    adopt('world.props.scope', this.scopeScreen());
    adopt('world.props.seg', this.ledDisplay());
    adopt('world.props.lcd', this.lcd());
    adopt('world.props.led', this.led());
    adopt('world.props.fanBlur', this.fanBlur());
    const radioBody = this.plastic();
    addHighlight(radioBody, this.u.radioHighlight);
    adopt('world.props.radioBody', radioBody);
    const fanBody = this.paint(false);
    addHighlight(fanBody, this.u.fanHighlight);
    adopt('world.props.fanBody', fanBody);
    this.setDrawerQuality(ctx.engine.quality.level);
  }

  /** Matériau par identifiant (accessoires, décor ou bibliothèque). */
  get(id: string): THREE.Material {
    if (id === 'world.props.drawer') return this.drawerMaterial();
    return this.world.materials.get(id);
  }

  /** Tiroirs : transmission (Moyen et plus) ou simple transparence (Bas). */
  setDrawerQuality(level: number): void {
    this.drawerLevel = level;
  }

  private drawerLevel = 2;

  drawerMaterial(): THREE.Material {
    if (this.drawerLevel >= 1) {
      this.drawerFull ??= this.world.materials.adopt('world.props.drawer.full', this.drawer(true));
      return this.drawerFull;
    }
    this.drawerSimple ??= this.world.materials.adopt('world.props.drawer.simple', this.drawer(false));
    return this.drawerSimple;
  }

  // --- Surfaces peintes et plastiques ------------------------------------------------------

  /** Tôle peinte teintée par sommet ; `slotted` : trous oblongs des cornières (masque). */
  private paint(slotted: boolean): THREE.MeshPhysicalNodeMaterial {
    const kit = new SurfaceKit(this.env, { space: 'world', scale: 3 });
    const m = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.55, metalness: 0 });
    const t = attribute<'vec4'>('tint', 'vec4');
    const wear = t.w;
    const paint = kit.sample('paint');
    const grunge = kit.grunge();
    const rust = kit.sample('rust', 0.8);
    const scratch = kit.sample('scratches', 3);
    const edges = max(edgeMask(0.006), attribute<'float'>('edge', 'float').mul(0.85));
    const cavity = cavityMask(0.006);
    const tone = paint.g.sub(0.5).mul(0.45);
    let color: Vec3Node = t.xyz.mul(vec3(tone.mul(1.1).add(1), tone.add(1), tone.mul(0.85).add(1)));
    // Arêtes éclaircies (lecture des volumes), d'autant plus que l'objet est usé.
    color = color.mul(edges.mul(wear.mul(0.3).add(0.12)).add(1)).add(edges.mul(0.012));
    let roughness: FloatNode = float(0.52).add(paint.b.sub(0.5).mul(0.12)).sub(edges.mul(0.1));
    const breakup = paint.a.mul(0.45).add(grunge.a.mul(0.55));
    const chip = wearMask(edges, wear, breakup);
    const bare = wearMask(edges, wear.mul(0.72), breakup, 0.04);
    const primer = rgb(PALETTE.primerGray);
    const metal = rgb(PALETTE.bareSteel);
    color = mix(color, primer.mul(paint.g.mul(0.2).add(0.9)), chip);
    color = mix(color, metal.mul(grunge.a.mul(0.25).add(0.8)), bare);
    roughness = mix(roughness, float(0.66), chip);
    roughness = mix(roughness, float(0.33), bare);
    const scratchLine = clamp(scratch.r.mul(wear.mul(0.8)).mul(grunge.a.mul(1.2).add(0.2)), 0, 1);
    color = mix(color, metal, scratchLine.mul(0.5));
    let metalness: FloatNode = max(bare, scratchLine.mul(0.8));
    roughness = mix(roughness, float(0.4), scratchLine);
    // Rouille : recoins, éclats, bas des meubles (humidité du sol).
    const low = smoothstep(0.25, 0.0, positionWorld.y);
    const rusty = rustMask({
      coverage: rust.r,
      cavity: max(cavity, bare.mul(0.8)),
      edges: chip,
      amount: wear.mul(0.45).add(low.mul(0.25)),
    });
    color = mix(color, rustColor(rust.b, rust.g), rusty);
    roughness = mix(roughness, float(0.9), rusty);
    metalness = metalness.mul(float(1).sub(rusty));
    const dirt = dirtMask(grunge, cavity, float(0.35).add(low.mul(0.4)));
    const dust = dustMask(grunge, 0.35);
    color = mix(color, rgb(PALETTE.dirt).mul(grunge.g.mul(0.4).add(0.8)), dirt.mul(0.7));
    color = mix(color, rgb(PALETTE.dust), dust.mul(0.5));
    roughness = mix(roughness, float(0.85), max(dirt, dust));
    const prints = fingerprintMask(grunge, 0.45);
    roughness = smudgeRoughness(roughness, prints);
    color = color.mul(float(1).sub(prints.mul(0.06)));
    const height = paint.r
      .mul(1.2e-4)
      .sub(chip.mul(4e-5))
      .sub(scratch.b.mul(wear.mul(3e-5)))
      .add(rust.a.mul(rusty).mul(1.5e-4));
    m.colorNode = color;
    m.roughnessNode = clamp(roughness, 0.05, 1);
    m.metalnessNode = metalness;
    m.normalNode = bumpNormal(height, 1);
    if (slotted) {
      // Trous oblongs des cornières : pas de 38 mm, 8 × 22 mm, deux files décalées. La coordonnée
      // horizontale de l'aile est portée par l'UV u (0..1 sur la largeur de l'aile), v = hauteur.
      const a = uv();
      const pitch = 0.038;
      const row = a.y.div(pitch);
      const odd = mod(floor(row), 2);
      const across = abs(a.x.sub(mix(float(0.33), float(0.67), odd)));
      const along = abs(fract(row).sub(0.5)).mul(pitch);
      const slot = length(vec2(max(along.sub(0.007), 0), across.mul(0.038)));
      m.maskNode = slot.greaterThan(0.004).or(a.x.lessThan(0.08)).or(a.x.greaterThan(0.92));
    }
    return m;
  }

  /** Plastique moulé teinté par sommet (a = rugosité). */
  private plastic(): THREE.MeshPhysicalNodeMaterial {
    const kit = new SurfaceKit(this.env, { space: 'world', scale: 25 });
    const m = new THREE.MeshPhysicalNodeMaterial({ roughness: 0.5, metalness: 0 });
    const t = attribute<'vec4'>('tint', 'vec4');
    const noise = kit.sample('noise');
    const grunge = kit.grunge();
    const scratch = kit.sample('scratches', 1.5);
    const edges = max(edgeMask(0.002), attribute<'float'>('edge', 'float').mul(0.6));
    const cavity = cavityMask(0.002);
    let color: Vec3Node = t.xyz.mul(noise.r.sub(0.5).mul(0.1).add(1));
    let roughness: FloatNode = t.w.add(noise.g.sub(0.5).mul(0.06)).add(noise.b.sub(0.5).mul(0.08));
    const worn = wearMask(edges, 0.25, grunge.a).mul(0.7);
    color = mix(color, color.mul(1.35).add(0.03), worn);
    roughness = mix(roughness, roughness.mul(0.75), worn);
    const scratches = clamp(scratch.r.mul(0.3).add(scratch.g.mul(0.25)), 0, 1);
    color = color.add(scratches.mul(0.02));
    roughness = roughness.add(scratches.mul(0.1));
    const dirt = dirtMask(grunge, cavity, 0.25);
    const dust = dustMask(grunge, 0.3);
    color = mix(color, rgb(PALETTE.dirt), dirt.mul(0.55));
    color = mix(color, rgb(PALETTE.dust), dust.mul(0.45));
    roughness = mix(roughness, float(0.85), max(dirt, dust));
    roughness = smudgeRoughness(roughness, fingerprintMask(grunge, 0.4));
    m.colorNode = color;
    m.roughnessNode = clamp(roughness, 0.05, 1);
    m.normalNode = bumpNormal(noise.b.mul(6e-6).sub(scratch.b.mul(2e-6)), 1);
    return m;
  }

  // --- Décalques -----------------------------------------------------------------------------

  private decal(): THREE.MeshStandardNodeMaterial {
    const kit = new SurfaceKit(this.env, { space: 'world', scale: 3 });
    const m = new THREE.MeshStandardNodeMaterial({
      roughness: 0.6,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const s = texture(this.atlas, uv());
    const g = kit.grunge();
    m.colorNode = s.rgb.mul(float(1).sub(g.r.mul(0.14)));
    m.roughnessNode = float(0.55).add(g.g.mul(0.18));
    // Silhouettes peintes sur le panneau perforé : la peinture ne bouche pas les trous (même
    // grille que le matériau du panneau, avec le même repli au loin contre le moiré).
    const spacing = PEGBOARD.holeSpacing;
    const onBoard = step(abs(positionWorld.z.sub(PEGBOARD.z)), 0.003)
      .mul(step(PEGBOARD.x[0], positionWorld.x))
      .mul(step(positionWorld.x, PEGBOARD.x[1]))
      .mul(step(PEGBOARD.y[0], positionWorld.y))
      .mul(step(positionWorld.y, PEGBOARD.y[1]));
    const q = positionWorld.xy.sub(vec2(PEGBOARD.x[0], PEGBOARD.y[0])).div(spacing);
    const d = length(fract(q).sub(0.5)).mul(spacing);
    const footprint = abs(dFdx(q.x))
      .add(abs(dFdy(q.x)))
      .mul(spacing);
    const far = smoothstep(spacing * 0.18, spacing * 0.3, footprint);
    const hole = d
      .lessThan(PEGBOARD.holeDiameter / 2)
      .and(onBoard.greaterThan(0.5))
      .and(far.lessThan(0.5));
    m.maskNode = s.a.greaterThan(0.5).and(hole.not());
    return m;
  }

  /** Cadran de la radio : imprimé sur verre dépoli, rétroéclairé en chaud quand le poste marche. */
  private dial(): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0 });
    const s = texture(this.atlas, uv());
    m.colorNode = s.rgb.mul(0.55);
    m.emissiveNode = s.rgb.mul(vec3(1.0, 0.66, 0.34)).mul(this.u.radioOn.mul(1.6));
    return m;
  }

  // --- Écrans et voyants ----------------------------------------------------------------------

  /**
   * Écran d'oscilloscope à phosphore vert : graticule 10 × 8, deux traces (sinusoïde modulée,
   * signal carré arrondi) qui DÉFILENT, balayage lent du spot avec rémanence, halo, vignettage
   * du tube. Temps = temps du décor (figé par `?time=`).
   */
  private scopeScreen(): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0 });
    const time = this.world.uniforms.time;
    const p = uv();
    const aspect = 1.26;
    const tau = Math.PI * 2;
    // Graticule gravé (faiblement éclairé par la tranche).
    const gx = abs(fract(p.x.mul(10)).sub(0.5));
    const gy = abs(fract(p.y.mul(8)).sub(0.5));
    const grid = max(smoothstep(0.465, 0.5, gx), smoothstep(0.46, 0.5, gy));
    const ticksX = smoothstep(0.012, 0.0, abs(p.y.sub(0.5))).mul(
      smoothstep(0.4, 0.5, abs(fract(p.x.mul(50)).sub(0.5))),
    );
    const ticksY = smoothstep(0.01, 0.0, abs(p.x.sub(0.5))).mul(
      smoothstep(0.4, 0.5, abs(fract(p.y.mul(40)).sub(0.5))),
    );
    const graticule = max(grid, max(ticksX, ticksY));
    // Trace 1 : sinusoïde + harmonique qui défilent.
    const ph1 = p.x.mul(3).sub(time.mul(0.23)).mul(tau);
    const ph2 = p.x.mul(11).sub(time.mul(0.9)).mul(tau);
    const f1 = sin(ph1).mul(0.15).add(sin(ph2).mul(0.03)).add(0.64);
    const s1 = cos(ph1)
      .mul(0.15 * 3 * tau)
      .add(cos(ph2).mul(0.03 * 11 * tau));
    const d1 = abs(p.y.sub(f1)).div(sqrt(s1.div(aspect).mul(s1.div(aspect)).add(1)));
    // Trace 2 : créneau arrondi (voie 2), transitions verticales atténuées (spot plus rapide).
    const ph3 = p.x.mul(2).sub(time.mul(0.23)).mul(tau);
    const sq = clamp(sin(ph3).mul(5), -1, 1);
    const f2 = sq.mul(0.075).add(0.27);
    const steep = step(abs(sin(ph3)), 0.2);
    const s2 = cos(ph3)
      .mul(0.075 * 5 * 2 * tau)
      .mul(steep);
    const d2 = abs(p.y.sub(f2)).div(sqrt(s2.div(aspect).mul(s2.div(aspect)).add(1)));
    const trace = (d: FloatNode): FloatNode => smoothstep(0.011, 0.002, d).add(exp(d.mul(-55)).mul(0.28));
    // Balayage : le spot parcourt l'écran en ~1,4 s, la trace s'estompe derrière lui.
    const beam = fract(time.mul(0.72));
    const age = fract(beam.sub(p.x));
    const persist = exp(age.mul(-1.8)).mul(0.7).add(0.3);
    const spot = exp(abs(p.x.sub(beam)).mul(-160)).mul(0.9);
    // Les fronts du créneau, balayés plus vite par le spot, sont plus pâles (comme sur un vrai tube).
    const brightness = trace(d1)
      .mul(persist.add(spot))
      .add(
        trace(d2)
          .mul(0.55)
          .mul(persist.add(spot.mul(0.5)))
          .mul(float(1).sub(steep.mul(0.5))),
      );
    // Vignettage (courbure du tube) et grain du phosphore.
    const c = p.sub(0.5).mul(vec2(1, 0.8));
    const vignette = smoothstep(0.56, 0.34, length(c));
    const grain = hash12(floor(p.mul(vec2(420, 330))).add(floor(time.mul(24))))
      .mul(0.06)
      .add(0.97);
    const phosphor = vec3(0.3, 1.0, 0.52);
    const glow = brightness.mul(2.6).add(graticule.mul(0.16)).add(0.018).mul(vignette).mul(grain);
    m.colorNode = vec3(0.012, 0.022, 0.018);
    m.emissiveNode = phosphor.mul(glow);
    return m;
  }

  /** Afficheurs 7 segments à LED rouges (teinte : x = afficheur, y = nombre de chiffres). */
  private ledDisplay(): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.18, metalness: 0 });
    const t = attribute<'vec4'>('tint', 'vec4');
    const id = t.x;
    const digits = t.y;
    const p = uv();
    const x = p.x.mul(digits);
    const idx = floor(x);
    const [c0, c1, c2, c3] = this.u.segCodes;
    const codes = select(
      id.lessThan(0.5),
      c0,
      select(id.lessThan(1.5), c1, select(id.lessThan(2.5), c2, c3)),
    );
    const code = pick4(codes, idx);
    const dpIndex = pick4(this.u.segDp, id);
    const dpOn = step(abs(idx.sub(dpIndex)), 0.5);
    const { lit, all } = sevenSegment(vec2(fract(x), p.y), code, dpOn);
    m.colorNode = vec3(0.03, 0.006, 0.005);
    m.emissiveNode = vec3(1.0, 0.09, 0.035).mul(lit.mul(5.5).add(all.mul(0.05)));
    return m;
  }

  /** Cristaux liquides du multimètre (non émissifs). */
  private lcd(): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0 });
    const t = attribute<'vec4'>('tint', 'vec4');
    const digits = t.y;
    const p = uv();
    const x = p.x.mul(digits);
    const idx = floor(x);
    const code = pick4(this.u.lcdCodes, idx);
    const dpOn = step(abs(idx.sub(this.u.lcdDp)), 0.5);
    const { lit, all } = sevenSegment(vec2(fract(x), p.y), code, dpOn);
    const background = vec3(0.3, 0.34, 0.26);
    m.colorNode = mix(background, vec3(0.025, 0.03, 0.028), lit.mul(0.95).add(all.mul(0.04)));
    return m;
  }

  /** Voyants (teinte : rgb = couleur, a = canal d'état, voir `LED_CHANNEL`). */
  private led(): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0 });
    const t = attribute<'vec4'>('tint', 'vec4');
    const ch = t.w;
    const { ledA, ledB } = this.u;
    const state = select(
      ch.lessThan(0.5),
      float(1),
      select(ch.lessThan(4.5), pick4(ledA, ch.sub(1)), pick4(ledB, ch.sub(5))),
    );
    m.colorNode = t.xyz.mul(0.25).add(0.02);
    m.emissiveNode = t.xyz.mul(state.mul(6).add(0.04));
    return m;
  }

  /** Disque de flou des pales en rotation rapide (transparent, suit le régime). */
  private fanBlur(): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({
      color: 0x8d969a,
      roughness: 0.45,
      metalness: 0.2,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const p = uv().sub(0.5).mul(2);
    const r = length(p);
    // Densité radiale : les pales sont plus larges vers l'extérieur ; moyeu masqué.
    const density = smoothstep(0.2, 0.3, r)
      .mul(smoothstep(1.0, 0.9, r))
      .mul(pow(r, 0.4));
    m.opacityNode = density.mul(this.u.fanBlur);
    return m;
  }

  /** Tiroirs en polystyrène cristal (légèrement bleutés, rayés, poussiéreux). */
  private drawer(transmission: boolean): THREE.Material {
    const kit = new SurfaceKit(this.env, { space: 'world', scale: 25 });
    const grunge = kit.grunge();
    const scratch = kit.sample('scratches', 1.5);
    const rough = float(0.06).add(scratch.r.mul(0.12)).add(grunge.g.mul(0.1));
    if (transmission) {
      const m = new THREE.MeshPhysicalNodeMaterial({
        color: 0xe9f1f4,
        roughness: 0.08,
        metalness: 0,
        transmission: 1,
        thickness: 0.0015,
        ior: 1.49,
        specularIntensity: 0.9,
      });
      m.roughnessNode = rough;
      return m;
    }
    const m = new THREE.MeshStandardNodeMaterial({
      color: 0xd5e2e8,
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    m.roughnessNode = rough;
    return m;
  }
}
