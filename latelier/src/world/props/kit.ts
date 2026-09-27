/**
 * Boîte à outils de construction des accessoires : repère courant (pile de matrices, pour bâtir
 * chaque objet dans son repère local puis le poser n'importe où), lots fusionnés par matériau
 * (opaque, décalques), formes biseautées usuelles, décalques de l'atlas, jeux d'instances.
 *
 * Tous les accessoires statiques finissent dans quelques maillages fusionnés : un appel de
 * dessin par matériau pour tout l'atelier.
 */
import * as THREE from 'three/webgpu';
import { PropBatch, rawTint, type PropPieceOptions, type Tint } from './batch';
import { atlasRect, atlasUV } from './atlas';
import { beveledPlate, lathe as latheGeometry, place, roundedBox, type Vec3Tuple } from '../geometry/shapes';

export type { Tint } from './batch';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

/** Jeu d'instances (géométrie + matériau partagés, matrices en repère monde). */
export class InstanceSet {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];

  constructor(
    readonly name: string,
    readonly geometry: THREE.BufferGeometry,
    readonly material: string,
    readonly options: { castShadow?: boolean; receiveShadow?: boolean } = {},
  ) {}

  get count(): number {
    return this.matrices.length;
  }
}

export class PropKit {
  /** Pièces opaques. */
  readonly main = new PropBatch(0);
  /** Décalques de l'atlas (sans ombre portée). */
  readonly decals = new PropBatch(100000);
  /** Instances (vis, crochets, composants…), par nom. */
  readonly instances = new Map<string, InstanceSet>();
  private readonly stack: THREE.Matrix4[] = [new THREE.Matrix4()];

  /** @param level niveau de qualité (0 = Bas … 3 = Ultra) : finesse des révolutions et des tubes. */
  constructor(readonly level: 0 | 1 | 2 | 3) {}

  /** Nombre de segments adapté à la qualité (≥ 4). */
  seg(n: number): number {
    const k = [0.55, 0.75, 1, 1.25][this.level]!;
    return Math.max(4, Math.round(n * k));
  }

  /** Repère courant (monde ← local). */
  get frame(): THREE.Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  /** Empile un repère (position, rotation Euler XYZ) relatif au repère courant. */
  push(position: Vec3Tuple, rotation: Vec3Tuple = [0, 0, 0], scale?: Vec3Tuple): void {
    this.stack.push(this.frame.clone().multiply(place(position, rotation, scale)));
  }

  pushMatrix(matrix: THREE.Matrix4): void {
    this.stack.push(this.frame.clone().multiply(matrix));
  }

  pop(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  /** Exécute `fn` dans un repère local. */
  at(position: Vec3Tuple, rotation: Vec3Tuple, fn: () => void): void {
    this.push(position, rotation);
    try {
      fn();
    } finally {
      this.pop();
    }
  }

  /** Point local → monde. */
  toWorld(p: Vec3Tuple, target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(p[0], p[1], p[2]).applyMatrix4(this.frame);
  }

  /** Ajoute une géométrie (consommée) placée par `local` dans le repère courant. */
  add(material: string, geometry: THREE.BufferGeometry, local: THREE.Matrix4 | null = null, o: PropPieceOptions = {}): void {
    const matrix = local ? this.frame.clone().multiply(local) : this.frame.clone();
    this.main.add(material, geometry, matrix, o);
  }

  /** Boîte arrondie centrée. */
  box(
    material: string,
    center: Vec3Tuple,
    size: Vec3Tuple,
    radius = 0.004,
    o: PropPieceOptions = {},
    rotation: Vec3Tuple = [0, 0, 0],
    segments = 1,
  ): void {
    this.add(material, roundedBox(size[0], size[1], size[2], radius, segments), place(center, rotation), o);
  }

  /** Boîte arrondie par bornes (repère local). */
  boxMinMax(material: string, min: Vec3Tuple, max: Vec3Tuple, radius = 0.004, o: PropPieceOptions = {}, segments = 1): void {
    this.box(
      material,
      [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      radius,
      o,
      [0, 0, 0],
      segments,
    );
  }

  /** Cylindre (ou tronc de cône) entre deux points locaux. */
  cylinder(
    material: string,
    a: Vec3Tuple,
    b: Vec3Tuple,
    radius: number,
    segments = 12,
    o: PropPieceOptions & { radiusB?: number; open?: boolean } = {},
  ): void {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = _v.subVectors(vb, va);
    const length = dir.length();
    if (length < 1e-6) return;
    const g = new THREE.CylinderGeometry(o.radiusB ?? radius, radius, length, this.seg(segments), 1, o.open ?? false);
    _q.setFromUnitVectors(_up, dir.normalize());
    const m = new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
    this.add(material, g, m, { edge: 'none', ...o });
  }

  /** Révolution d'un profil [rayon, hauteur] autour de l'axe Y local, posée en `position`. */
  lathe(
    material: string,
    profile: readonly (readonly [number, number])[],
    position: Vec3Tuple,
    rotation: Vec3Tuple = [0, 0, 0],
    segments = 24,
    o: PropPieceOptions = {},
  ): void {
    this.add(material, latheGeometry(profile, this.seg(segments)), place(position, rotation), { edge: 'none', ...o });
  }

  /** Tube lisse passant par des points locaux (câbles, cordons, fils). */
  tube(
    material: string,
    points: readonly Vec3Tuple[],
    radius: number,
    radialSegments = 6,
    o: PropPieceOptions & { perMeter?: number; closed?: boolean } = {},
  ): void {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
      o.closed ?? false,
      'catmullrom',
      0.5,
    );
    const len = curve.getLength();
    const segs = Math.max(4, Math.ceil(len * (o.perMeter ?? 60) * [0.5, 0.75, 1, 1][this.level]!));
    const g = new THREE.TubeGeometry(curve, segs, radius, Math.max(3, radialSegments), o.closed ?? false);
    this.add(material, g, null, { edge: 'none', castShadow: false, ...o });
  }

  /** Plaque extrudée biseautée (face selon +Z local). */
  plate(
    material: string,
    center: Vec3Tuple,
    size: readonly [number, number, number],
    corner: number,
    bevel: number,
    rotation: Vec3Tuple = [0, 0, 0],
    o: PropPieceOptions = {},
  ): void {
    this.add(material, beveledPlate(size[0], size[1], size[2], corner, bevel), place(center, rotation), o);
  }

  /** Extrusion d'un contour 2D (plan XY local, épaisseur selon +Z centrée). */
  extrude(
    material: string,
    shape: THREE.Shape,
    depth: number,
    bevel: number,
    local: THREE.Matrix4 | null,
    o: PropPieceOptions = {},
    curveSegments = 6,
  ): void {
    const b = Math.min(bevel, depth / 2 - 1e-4);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(1e-4, depth - 2 * b),
      bevelEnabled: b > 1e-5,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: this.level >= 2 ? 2 : 1,
      curveSegments,
    });
    g.translate(0, 0, -(depth - 2 * b) / 2);
    this.add(material, g, local, o);
  }

  /**
   * Quadrilatère texturé par une région de l'atlas (décalque) : `size` = [largeur, hauteur] (m),
   * face selon +Z local après `rotation`. `sub` : sous-rectangle [s0, t0, s1, t1] de la région.
   */
  decal(
    region: string,
    center: Vec3Tuple,
    size: readonly [number, number],
    rotation: Vec3Tuple = [0, 0, 0],
    sub: readonly [number, number, number, number] = [0, 0, 1, 1],
  ): void {
    const r = atlasRect(region);
    const g = new THREE.PlaneGeometry(size[0], size[1]);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const s = sub[0] + uv.getX(i) * (sub[2] - sub[0]);
      const t = sub[1] + uv.getY(i) * (sub[3] - sub[1]);
      const [u, v] = atlasUV(r, s, t);
      uv.setXY(i, u, v);
    }
    const m = this.frame.clone().multiply(place(center, rotation));
    this.decals.add('world.props.decal', g, m, { uv: 'keep', edge: 'none', castShadow: false });
  }

  /** Décalque enroulé sur un cylindre d'axe Y local (étiquettes de bidons, bombes, extincteur). */
  wrapDecal(
    region: string,
    center: Vec3Tuple,
    radius: number,
    height: number,
    arc: number,
    facing = 0,
    material = 'world.props.decal',
  ): void {
    const r = atlasRect(region);
    const g = new THREE.CylinderGeometry(radius, radius, height, this.seg(16), 1, true, facing - arc / 2, arc);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const [u, v] = atlasUV(r, uv.getX(i), uv.getY(i));
      uv.setXY(i, u, v);
    }
    const m = this.frame.clone().multiply(place(center));
    this.decals.add(material, g, m, { uv: 'keep', edge: 'none', castShadow: false });
  }

  /** Quadrilatère aux UV 0..1 (écrans, afficheurs) dans le lot principal. */
  quad(material: string, center: Vec3Tuple, size: readonly [number, number], rotation: Vec3Tuple, tint?: Tint): void {
    const g = new THREE.PlaneGeometry(size[0], size[1]);
    this.add(material, g, place(center, rotation), { uv: 'keep', edge: 'none', castShadow: false, tint });
  }

  /** Voyant (demi-sphère émissive) : `color` hexadécimal, `channel` voir `LED_CHANNEL`. */
  led(center: Vec3Tuple, radius: number, color: number, channel: number, rotation: Vec3Tuple = [0, 0, 0]): void {
    const c = new THREE.Color(color);
    const g = new THREE.SphereGeometry(radius, this.seg(10), this.seg(6), 0, Math.PI * 2, 0, Math.PI / 2);
    g.rotateX(Math.PI / 2);
    this.add('world.props.led', g, place(center, rotation), {
      edge: 'none',
      castShadow: false,
      tint: rawTint(c.r, c.g, c.b, channel),
    });
  }

  /** Ajoute une instance (repère courant × `local`). */
  instance(set: InstanceSet, local: THREE.Matrix4 | null, color?: THREE.Color): void {
    if (!this.instances.has(set.name)) this.instances.set(set.name, set);
    set.matrices.push(local ? this.frame.clone().multiply(local) : this.frame.clone());
    if (color) set.colors.push(color);
  }

  /** Matrice de placement locale (raccourci). */
  static place(position: Vec3Tuple, rotation: Vec3Tuple = [0, 0, 0], scale?: Vec3Tuple): THREE.Matrix4 {
    return place(position, rotation, scale);
  }

  /** Matrice orientant l'axe Y local selon `dir` en `position`. */
  static alongY(position: Vec3Tuple, dir: Vec3Tuple): THREE.Matrix4 {
    _v.set(dir[0], dir[1], dir[2]).normalize();
    _q.setFromUnitVectors(_up, _v);
    return _m.clone().compose(new THREE.Vector3(...position), _q, new THREE.Vector3(1, 1, 1));
  }
}
