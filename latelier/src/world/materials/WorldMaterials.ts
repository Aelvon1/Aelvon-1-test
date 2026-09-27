/**
 * Matériaux propres au décor (`world.*`).
 *
 * - Variantes « salies » des matériaux de base de la bibliothèque (`paint.wall`,
 *   `concrete.floor`, `wood.plywood`…) : la couleur et la rugosité d'origine (nœuds TSL ou
 *   couleur/texture simples) sont ENVELOPPÉES par une salissure calculée en espace monde (bas
 *   de mur plus sale, coins, coulures sous la fenêtre, suie au-dessus de l'ampoule, chemin
 *   d'usure du sol…). Le rendu suit donc automatiquement les améliorations de la bibliothèque.
 * - Peinture écaillée à la main sur bois (cadre de fenêtre, plinthes, chambranles) : couche de
 *   peinture, sous-couche, bois nu aux arêtes (attribut `edge` du lot statique).
 * - Émissifs pilotés par les uniformes du décor (filament, néon, anneau de la loupe, voyants).
 *
 * Les identifiants qui ne commencent pas par `world.` sont délégués à la bibliothèque partagée.
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  attribute,
  bumpMap,
  clamp,
  dot,
  float,
  length,
  materialColor,
  materialEmissive,
  materialRoughness,
  max,
  min,
  mix,
  normalView,
  positionViewDirection,
  positionWorld,
  pow,
  smoothstep,
  step,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { AppContext } from '../../core/context';
import { BENCH, DOOR, ROOM, SPOTS, WINDOW } from '../layout';
import type { WorldUniforms } from '../uniforms';
import { fbm2, valueNoise2, type FloatNode, type Vec2Node, type Vec3Node } from './tslNoise';

type StandardLike = THREE.MeshStandardNodeMaterial;

/** Distance d'un point 2D à un segment [a, b]. */
function distToSegment(p: Vec2Node, a: readonly [number, number], b: readonly [number, number]): FloatNode {
  const pa = p.sub(vec2(a[0], a[1]));
  const ba = vec2(b[0] - a[0], b[1] - a[1]);
  const h = clamp(dot(pa, ba).div(dot(ba, ba)), 0, 1);
  return length(pa.sub(ba.mul(h)));
}

/** Couleur de base d'un matériau (nœud existant ou couleur/texture du matériau). */
function baseColorOf(m: StandardLike): Vec3Node {
  const node = m.colorNode;
  // vec3(vec4) tronque, vec3(vec3) est l'identité : couvre les deux formes de nœud de couleur.
  return node ? vec3(node as Node<'vec4'>) : materialColor;
}

function baseRoughnessOf(m: StandardLike): FloatNode {
  return m.roughnessNode ? (m.roughnessNode as FloatNode) : materialRoughness;
}

/** Terme de Fresnel simple (bords lumineux de la mise en évidence). */
export function fresnelTerm(power = 2): FloatNode {
  return pow(float(1).sub(abs(dot(normalView, positionViewDirection))), power);
}

/**
 * Ajoute une mise en évidence au regard : émission chaude, surtout sur les bords (Fresnel),
 * pilotée par `amount` (0..1). Conserve l'émission d'origine du matériau.
 */
export function addHighlight(material: THREE.Material, amount: FloatNode): void {
  const m = material as StandardLike;
  const base = m.emissiveNode ? (m.emissiveNode as Vec3Node) : materialEmissive;
  const glow = vec3(1.0, 0.62, 0.25).mul(fresnelTerm(3).mul(0.3).add(0.022)).mul(amount);
  m.emissiveNode = base.add(glow);
  m.needsUpdate = true;
}

export class WorldMaterials {
  /** Textures de détail partagées (générées dans le worker). */
  readonly grunge: THREE.Texture;
  readonly paint: THREE.Texture;
  private readonly owned = new Map<string, THREE.Material>();
  private readonly factories = new Map<string, () => THREE.Material>();

  constructor(
    private readonly ctx: AppContext,
    private readonly u: WorldUniforms,
  ) {
    const size = Math.min(1024, ctx.engine.quality.textureSize);
    this.grunge = ctx.textures.get({
      key: 'world/grunge',
      generator: 'grunge',
      width: size,
      height: size,
      colorSpace: 'linear',
      params: { scale: 4, fingerprints: 14, speckles: 0.5 },
    });
    this.paint = ctx.textures.get({
      key: 'world/paint',
      generator: 'paint',
      width: size,
      height: size,
      colorSpace: 'linear',
      params: { strokes: 420, bristles: 0.7 },
    });
    this.registerFactories();
  }

  /** Matériau par identifiant (`world.*` : propre au décor ; sinon bibliothèque partagée). */
  get(id: string): THREE.Material {
    if (!id.startsWith('world.')) return this.ctx.materials.get(id);
    const cached = this.owned.get(id);
    if (cached) return cached;
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Matériau du décor inconnu : « ${id} ».`);
    const material = factory();
    material.name = id;
    this.owned.set(id, material);
    return material;
  }

  /** Enregistre un matériau construit ailleurs (vitre, poussière…) pour qu'il soit libéré avec le décor. */
  adopt(id: string, material: THREE.Material): THREE.Material {
    material.name = id;
    this.owned.set(id, material);
    return material;
  }

  /** Copie non partagée d'un matériau (mise en évidence propre à un élément interactif). */
  unique(id: string, suffix: string): THREE.Material {
    const clone = this.get(id).clone();
    return this.adopt(`${id}#${suffix}`, clone);
  }

  dispose(): void {
    for (const material of this.owned.values()) material.dispose();
    this.owned.clear();
  }

  // --- Fabriques ----------------------------------------------------------------------

  private variant(baseId: string, name: string): StandardLike {
    return this.ctx.materials.variant(baseId, { name }) as StandardLike;
  }

  private registerFactories(): void {
    const f = this.factories;
    f.set('world.wall', () => this.wall());
    f.set('world.floor', () => this.floor());
    f.set('world.ceiling', () => this.ceiling());
    f.set('world.joist', () => {
      const m = this.variant('wood.bench', 'world.joist');
      const g = texture(this.grunge, uv().mul(0.6));
      m.colorNode = baseColorOf(m)
        .mul(vec3(0.62, 0.55, 0.5))
        .mul(float(1).sub(g.r.mul(0.25)));
      m.roughnessNode = clamp(baseRoughnessOf(m).add(0.15), 0, 1);
      return m;
    });
    f.set('world.bench.frame', () => {
      const m = this.variant('wood.bench', 'world.bench.frame');
      const g = texture(this.grunge, uv().mul(0.9).add(0.3));
      // Piètement plus sombre (bois huilé, crasse des mains et des chaussures en bas).
      const low = smoothstep(0.35, 0.0, positionWorld.y);
      m.colorNode = baseColorOf(m)
        .mul(vec3(0.78, 0.7, 0.62))
        .mul(float(1).sub(g.r.mul(0.2)).sub(low.mul(0.25)));
      return m;
    });
    f.set('world.bench.top', () => this.benchTop());
    f.set('world.pegboard', () => this.pegboard());
    f.set('world.mat', () => {
      const m = this.variant('rubber.mat.green', 'world.mat');
      addHighlight(m, this.u.highlightBench);
      return m;
    });
    f.set('world.switch.box', () => {
      const m = this.paintedMetal({ paint: 0xd9cfae, primer: 0x6b6358, chip: -0.08, roughness: 0.4 });
      addHighlight(m, this.u.highlightSwitch);
      return m;
    });
    f.set('world.switch.lever', () => {
      const m = new THREE.MeshStandardNodeMaterial({ color: 0x1a1512, roughness: 0.3, metalness: 0 });
      m.colorNode = vec3(0.03, 0.022, 0.018);
      addHighlight(m, this.u.highlightSwitch);
      return m;
    });
    f.set('world.lamp.housing', () => {
      const m = this.paintedMetal({ paint: 0xb4541e, primer: 0x3a3a38, chip: -0.03, roughness: 0.4 });
      addHighlight(m, this.u.highlightLamp);
      return m;
    });
    f.set('world.paint.olive', () =>
      this.paintedWood({ paint: 0x4f5a36, primer: 0xc9c2a6, wood: 0x7a5a3a, chip: 0.05, roughness: 0.62 }),
    );
    f.set('world.paint.cream', () =>
      this.paintedWood({ paint: 0xcfc4a0, primer: 0xe8e2cf, wood: 0x80603f, chip: 0.0, roughness: 0.66 }),
    );
    f.set('world.paint.brown', () =>
      this.paintedWood({ paint: 0x3b2c22, primer: 0x8e7a62, wood: 0x6f5134, chip: 0.02, roughness: 0.55 }),
    );
    f.set('world.paint.teal', () =>
      this.paintedMetal({ paint: 0x3f7d8c, primer: 0x8a6a5a, chip: 0.02, roughness: 0.42 }),
    );
    f.set('world.paint.orange', () =>
      this.paintedMetal({ paint: 0xb4541e, primer: 0x3a3a38, chip: -0.04, roughness: 0.42 }),
    );
    f.set('world.paint.creamMetal', () =>
      this.paintedMetal({ paint: 0xd6cba8, primer: 0x6b6358, chip: -0.02, roughness: 0.48 }),
    );
    f.set('world.bakelite', () => {
      const m = new THREE.MeshStandardNodeMaterial({ color: 0x1a1512, roughness: 0.32, metalness: 0 });
      const g = texture(this.grunge, uv().mul(3.0));
      m.colorNode = vec3(0.028, 0.02, 0.016).mul(float(1).add(g.g.mul(0.6)));
      m.roughnessNode = float(0.3).add(g.b.mul(0.25));
      return m;
    });
    f.set('world.oil', () => this.oilDecal());
    f.set('world.bulb.filament', () => {
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = mix(vec3(0.03, 0.025, 0.02), vec3(1.0, 0.5, 0.16).mul(60), this.u.bulb);
      m.fog = false;
      return m;
    });
    f.set('world.bulb.glass', () => {
      const m = new THREE.MeshStandardNodeMaterial({
        color: 0xf2dcb8,
        roughness: 0.06,
        metalness: 0,
        transparent: true,
        depthWrite: false,
      });
      // Verre ambré légèrement dépoli par la chaleur : lueur interne proportionnelle à la puissance.
      m.opacityNode = float(0.22).add(this.u.bulb.mul(0.3));
      m.emissiveNode = vec3(1.0, 0.62, 0.3).mul(this.u.bulb.mul(2.2)).mul(fresnelTerm(1.2).mul(0.6).add(0.4));
      return m;
    });
    f.set('world.neon.tube', () => {
      const m = new THREE.MeshStandardNodeMaterial({ color: 0xdfe6dc, roughness: 0.35, metalness: 0 });
      // Phosphore légèrement verdâtre ; extrémités noircies par l'usure (à 4 cm des culots).
      const along = abs(positionWorld.x.sub(SPOTS.neonTube[0]));
      const ends = smoothstep(0.52, 0.58, along);
      m.colorNode = mix(vec3(0.86, 0.9, 0.85), vec3(0.25, 0.24, 0.2), ends);
      m.emissiveNode = vec3(0.78, 1.0, 0.84)
        .mul(this.u.neon.mul(7))
        .mul(float(1).sub(ends.mul(0.85)));
      return m;
    });
    f.set('world.lamp.ring', () => {
      const m = new THREE.MeshStandardNodeMaterial({ color: 0xf0f2ee, roughness: 0.4, metalness: 0 });
      m.emissiveNode = vec3(0.92, 0.97, 1.0).mul(this.u.lamp.mul(9));
      return m;
    });
    f.set('world.lamp.lens', () => {
      const m = new THREE.MeshPhysicalNodeMaterial({
        color: 0xffffff,
        roughness: 0.03,
        metalness: 0,
        transmission: 1,
        thickness: 0.012,
        ior: 1.52,
        specularIntensity: 1,
      });
      return m;
    });
    f.set('world.pilot.orange', () => {
      const m = new THREE.MeshStandardNodeMaterial({ color: 0x5a2a10, roughness: 0.25 });
      // Voyant de repérage : allumé quand l'éclairage est coupé (retrouver l'interrupteur dans le noir).
      m.emissiveNode = vec3(1.0, 0.3, 0.04).mul(float(1).sub(this.u.bulb).mul(1.3).add(0.12));
      return m;
    });
    f.set('world.pilot.red', () => {
      const m = new THREE.MeshStandardNodeMaterial({ color: 0x4a0d0a, roughness: 0.25 });
      m.emissiveNode = vec3(1.0, 0.12, 0.06).mul(2.2);
      return m;
    });
    f.set('world.door.leak', () => {
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = vec3(0.55, 0.68, 0.85).mul(this.u.daylight.mul(1.6));
      return m;
    });
    f.set('world.door.leakFloor', () => {
      const m = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      // Flaque de lumière froide devant le bas de porte : décroissance depuis le seuil.
      const d = float(DOOR.z).sub(positionWorld.z);
      const across = smoothstep(0.0, 0.12, positionWorld.x.sub(DOOR.x[0])).mul(
        smoothstep(0.0, 0.12, float(DOOR.x[1]).sub(positionWorld.x)),
      );
      const fall = smoothstep(0.22, 0.0, d).mul(across);
      m.colorNode = vec3(0.35, 0.45, 0.6).mul(fall.mul(fall)).mul(this.u.daylight.mul(0.35));
      m.fog = false;
      return m;
    });
  }

  /** Mur enduit/peint : bas de mur plus sale, coins, coulures sous la fenêtre, traces de mains. */
  private wall(): StandardLike {
    const m = this.variant('paint.wall', 'world.wall');
    const p = positionWorld;
    const g = texture(this.grunge, uv().mul(0.45));
    const g2 = texture(this.grunge, uv().mul(1.35).add(0.37));
    // Bas de mur : limite irrégulière, éclaboussures au ras du sol.
    const low = smoothstep(0.6, 0.0, p.y.add(g.r.sub(0.5).mul(0.35)));
    const splash = smoothstep(0.16, 0.0, p.y).mul(g2.g.mul(0.6).add(0.4));
    // Coins verticaux (distance à l'angle le long du mur) et raccord du plafond.
    const dx = min(p.x.sub(ROOM.minX), float(ROOM.maxX).sub(p.x));
    const dz = min(p.z.sub(ROOM.minZ), float(ROOM.maxZ).sub(p.z));
    const corner = smoothstep(0.45, 0.0, max(dx, dz));
    const top = smoothstep(0.35, 0.0, float(ROOM.height).sub(p.y));
    // Coulures d'humidité sous l'appui de fenêtre (mur ouest).
    const onWest = step(p.x, ROOM.minX + 0.03);
    const underWindow = onWest
      .mul(smoothstep(WINDOW.z[0] - 0.12, WINDOW.z[0] + 0.05, p.z))
      .mul(smoothstep(WINDOW.z[1] + 0.12, WINDOW.z[1] - 0.05, p.z))
      .mul(smoothstep(WINDOW.y[0] + 0.02, WINDOW.y[0] - 0.08, p.y))
      .mul(smoothstep(0.05, 0.55, p.y));
    const streaks = smoothstep(0.45, 0.85, valueNoise2(vec2(p.z.mul(42), p.y.mul(1.4))));
    const water = underWindow.mul(streaks.mul(0.8).add(0.2));
    // Traces de mains derrière l'établi (mur nord).
    const onNorth = step(p.z, ROOM.minZ + 0.03);
    const behindBench = onNorth
      .mul(smoothstep(BENCH.x[0], BENCH.x[0] + 0.15, p.x))
      .mul(smoothstep(BENCH.x[1], BENCH.x[1] - 0.15, p.x))
      .mul(smoothstep(BENCH.topHeight, BENCH.topHeight + 0.06, p.y))
      .mul(smoothstep(1.75, 1.2, p.y));
    const prints = behindBench.mul(g2.b);

    const dirt = clamp(
      low
        .mul(0.42)
        .add(splash.mul(0.3))
        .add(corner.mul(0.22))
        .add(top.mul(0.18))
        .add(prints.mul(0.3))
        .add(g.r.mul(0.1)),
      0,
      1,
    );
    const brown = vec3(0.6, 0.52, 0.42);
    const stainTint = vec3(0.78, 0.66, 0.46);
    const tint = mix(vec3(1, 1, 1), brown, dirt).mul(mix(vec3(1, 1, 1), stainTint, water.mul(0.8)));
    m.colorNode = baseColorOf(m).mul(tint);
    m.roughnessNode = clamp(baseRoughnessOf(m).add(dirt.mul(0.08)).sub(water.mul(0.1)), 0.05, 1);
    return m;
  }

  /** Sol béton : bords encrassés, chemin d'usure lustré porte → établi, dessous d'établi sombre. */
  private floor(): StandardLike {
    const m = this.variant('concrete.floor', 'world.floor');
    const p = positionWorld;
    const g = texture(this.grunge, uv().mul(0.33));
    const dx = min(p.x.sub(ROOM.minX), float(ROOM.maxX).sub(p.x));
    const dz = min(p.z.sub(ROOM.minZ), float(ROOM.maxZ).sub(p.z));
    const edge = smoothstep(0.4, 0.0, min(dx, dz).add(g.r.sub(0.5).mul(0.25)));
    const doorX = (DOOR.x[0] + DOOR.x[1]) / 2;
    const path = smoothstep(
      0.6,
      0.1,
      distToSegment(p.xz, [doorX, DOOR.z - 0.3], [-0.6, -0.95]).add(g.g.mul(0.2)),
    );
    const underBench = step(p.z, BENCH.z[1] - 0.02)
      .mul(smoothstep(BENCH.x[0] - 0.1, BENCH.x[0] + 0.1, p.x))
      .mul(smoothstep(BENCH.x[1] + 0.1, BENCH.x[1] - 0.1, p.x));
    const dirt = clamp(edge.mul(0.45).add(underBench.mul(0.25)).add(g.r.mul(0.08)), 0, 1);
    const tint = mix(vec3(1, 1, 1), vec3(0.55, 0.5, 0.44), dirt).mul(float(1).add(path.mul(0.06)));
    m.colorNode = baseColorOf(m).mul(tint);
    m.roughnessNode = clamp(baseRoughnessOf(m).add(edge.mul(0.06)).sub(path.mul(0.2)), 0.05, 1);
    return m;
  }

  /** Plafond (panneaux) : suie au-dessus de l'ampoule, auréoles d'infiltration, coins sombres. */
  private ceiling(): StandardLike {
    const m = this.variant('wood.plywood', 'world.ceiling');
    const p = positionWorld;
    const g = texture(this.grunge, uv().mul(0.5).add(0.11));
    const soot = smoothstep(0.7, 0.0, length(p.xz.sub(vec2(SPOTS.pendantBulb[0], SPOTS.pendantBulb[2])))).mul(
      g.r.mul(0.4).add(0.6),
    );
    const ring = (cx: number, cz: number, r: number): FloatNode => {
      const d = length(p.xz.sub(vec2(cx, cz))).add(
        fbm2(p.xz.mul(5), 3)
          .sub(0.5)
          .mul(r * 0.6),
      );
      const edgeRing = smoothstep(0.035, 0.0, abs(d.sub(r)));
      const inside = smoothstep(r, r * 0.6, d).mul(0.35);
      return edgeRing.add(inside);
    };
    const water = clamp(
      ring(1.3, 0.9, 0.34)
        .add(ring(-1.7, 1.25, 0.22))
        .add(ring(0.6, -1.5, 0.18)),
      0,
      1,
    );
    const dx = min(p.x.sub(ROOM.minX), float(ROOM.maxX).sub(p.x));
    const dz = min(p.z.sub(ROOM.minZ), float(ROOM.maxZ).sub(p.z));
    const corner = smoothstep(0.35, 0.0, min(dx, dz));
    const tint = vec3(0.8, 0.74, 0.64)
      .mul(mix(vec3(1, 1, 1), vec3(0.35, 0.3, 0.26), soot.mul(0.55).add(corner.mul(0.3))))
      .mul(mix(vec3(1, 1, 1), vec3(0.72, 0.58, 0.38), water.mul(0.7)));
    m.colorNode = baseColorOf(m).mul(tint);
    m.roughnessNode = clamp(baseRoughnessOf(m).add(0.1), 0, 1);
    return m;
  }

  /** Plateau de l'établi : bois massif usé, auréoles, mise en évidence (invite d'inventaire). */
  private benchTop(): StandardLike {
    const m = this.variant('wood.bench', 'world.bench.top');
    const p = positionWorld;
    const g = texture(this.grunge, uv().mul(0.8).add(0.53));
    // Bord avant lustré et plus clair (avant-bras), crasse vers le mur.
    const front = smoothstep(BENCH.z[1] - 0.08, BENCH.z[1], p.z);
    const back = smoothstep(BENCH.z[0] + 0.2, BENCH.z[0], p.z);
    const tint = mix(vec3(1, 1, 1), vec3(0.7, 0.62, 0.52), back.mul(0.5).add(g.r.mul(0.2))).mul(
      float(1).add(front.mul(0.08)),
    );
    m.colorNode = baseColorOf(m).mul(tint);
    m.roughnessNode = clamp(baseRoughnessOf(m).sub(front.mul(0.15)).add(g.g.mul(0.08)), 0.05, 1);
    addHighlight(m, this.u.highlightBench);
    return m;
  }

  /** Panneau perforé : trous réels (masque TSL, aussi dans les ombres), cernes sales autour. */
  private pegboard(): StandardLike {
    const m = this.variant('wood.pegboard', 'world.pegboard');
    const spacing = 0.0254;
    const radius = 0.0033;
    const q = positionWorld.xy.sub(vec2(-1.8 + spacing / 2, 1.08 + spacing / 2)).div(spacing);
    const cell = q.sub(q.floor()).sub(0.5);
    const d = length(cell).mul(spacing);
    // Empreinte d'un pixel (m) : au-delà d'un quart de pas, les trous deviennent sous-pixel →
    // on n'élimine plus les fragments (moiré) et l'on assombrit la teinte moyenne à la place.
    const footprint = abs(q.x.dFdx()).add(abs(q.x.dFdy())).mul(spacing);
    const far = smoothstep(spacing * 0.18, spacing * 0.3, footprint);
    m.maskNode = d.greaterThan(radius).or(far.greaterThan(0.5));
    const ring = smoothstep(radius * 2.4, radius, d).mul(0.3);
    const g = texture(this.grunge, uv().mul(0.9));
    const tint = float(1)
      .sub(ring.mul(float(1).sub(far)))
      .sub(far.mul(0.12))
      .sub(g.r.mul(0.15));
    m.colorNode = baseColorOf(m).mul(tint);
    return m;
  }

  /** Peinture sur bois, appliquée à la main, écaillée aux arêtes (sous-couche puis bois nu). */
  private paintedWood(o: {
    paint: number;
    primer: number;
    wood: number;
    chip: number;
    roughness: number;
  }): StandardLike {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: o.roughness, metalness: 0 });
    const t = texture(this.paint, uv().mul(1.6));
    const g = texture(this.grunge, uv().mul(0.8).add(0.21));
    const edge = attribute<'float'>('edge', 'float');
    const wear = edge.mul(0.6).add(g.a.mul(0.25)).add(o.chip);
    const score = t.a.mul(0.55).add(wear.mul(0.6));
    const primerMask = smoothstep(0.6, 0.63, score);
    const woodMask = smoothstep(0.68, 0.71, score);
    const paint = rgb(o.paint).mul(t.g.mul(0.22).add(0.89)).mul(t.b.mul(0.12).add(0.94)).add(edge.mul(0.035));
    const wood = rgb(o.wood).mul(g.g.mul(0.4).add(0.8));
    const color = mix(mix(paint, rgb(o.primer), primerMask), wood, woodMask);
    m.colorNode = color.mul(float(1).sub(g.r.mul(0.22)));
    m.roughnessNode = mix(mix(float(o.roughness), float(0.72), primerMask), float(0.82), woodMask).add(
      g.g.mul(0.06),
    );
    m.normalNode = bumpMap(texture(this.paint, uv().mul(1.6)), float(0.35).mul(float(1).sub(woodMask)));
    return m;
  }

  /** Peinture sur tôle : arêtes éclaircies, éclats laissant voir l'apprêt puis le métal nu/rouillé. */
  private paintedMetal(o: { paint: number; primer: number; chip: number; roughness: number }): StandardLike {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: o.roughness, metalness: 0 });
    const t = texture(this.paint, uv().mul(2.2).add(0.4));
    const g = texture(this.grunge, uv().mul(1.1).add(0.63));
    const edge = attribute<'float'>('edge', 'float');
    const score = t.a.mul(0.5).add(edge.mul(0.62)).add(g.a.mul(0.22)).add(o.chip);
    const primerMask = smoothstep(0.62, 0.65, score);
    const metalMask = smoothstep(0.7, 0.73, score);
    const paint = rgb(o.paint).mul(t.g.mul(0.2).add(0.9)).add(edge.mul(0.05));
    const bare = mix(vec3(0.55, 0.55, 0.53), vec3(0.36, 0.2, 0.1), g.r.mul(0.7));
    const color = mix(mix(paint, rgb(o.primer), primerMask), bare, metalMask);
    m.colorNode = color.mul(float(1).sub(g.r.mul(0.18)));
    m.metalnessNode = metalMask.mul(0.85);
    m.roughnessNode = mix(float(o.roughness).add(g.g.mul(0.1)), float(0.45), metalMask);
    m.normalNode = bumpMap(texture(this.paint, uv().mul(2.2).add(0.4)), float(0.25));
    return m;
  }

  /** Taches d'huile au sol : décalques transparents, cœur sombre et brillant, auréole diffuse. */
  private oilDecal(): StandardLike {
    const m = new THREE.MeshStandardNodeMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 0.2,
      metalness: 0,
    });
    const local = uv().sub(0.5).mul(2);
    const n = fbm2(positionWorld.xz.mul(7), 4);
    const d = length(local).add(n.sub(0.5).mul(0.7));
    const core = smoothstep(0.55, 0.2, d);
    const halo = smoothstep(0.95, 0.45, d).mul(0.35);
    const alpha = clamp(core.mul(0.7).add(halo), 0, 0.85);
    m.colorNode = mix(vec3(0.09, 0.075, 0.06), vec3(0.02, 0.018, 0.015), core);
    m.opacityNode = alpha;
    m.roughnessNode = mix(float(0.55), float(0.12), core);
    return m;
  }
}

/** Nœud de couleur constante (hexadécimal sRGB → composantes linéaires). */
export function rgb(hex: number): Vec3Node {
  const c = new THREE.Color(hex);
  return vec3(c.r, c.g, c.b);
}
