/**
 * Enroulement d'un condensateur électrolytique aluminium et son DÉROULEMENT animé.
 *
 * Modèle : spirale d'Archimède de pas `pitch` (épaisseur de l'empilement papier / anode /
 * papier / cathode), rayon de référence r(θ) = r0 + pitch·θ/2π, θ croissant du noyau vers
 * l'extérieur. Longueur d'arc depuis le noyau (approximation r ≫ pas, écart < 0,1 %) :
 * A(θ) = r0·θ + pitch·θ²/4π, inversible en θ(A).
 *
 * Déroulement « comme un tapis » (plan XZ du composant, Y vertical = largeur des feuilles) :
 * la bande déroulée reste posée, à plat, le long de la droite z = z_g (face extérieure de
 * l'empilement contre cette droite), de x = 0 (extrémité extérieure, immobile) à x = ℓ ; le
 * rouleau restant roule vers +X, centre en (ℓ, z_g + r(θ_d) + pitch), où θ_d est l'angle du point
 * de contact (A(Θ) − A(θ_d) = ℓ). Au repos (ℓ = 0) le centre est à l'origine.
 * - Point enroulé (θ ≤ θ_d) : angle polaire a = −π/2 + (θ_d − θ) (sens horaire vers l'extérieur),
 *   position C + (r(θ) + δ)(cos a, sin a), normale extérieure (cos a, sin a).
 * - Point posé (θ ≥ θ_d) : x = A(Θ) − A(θ), z = z_g + pitch − δ, normale extérieure (0, −1).
 * Les deux expressions coïncident au point de contact (continuité de la bande).
 *
 * Mise à jour SANS allocation : tampons de positions/normales préalloués, réécrits en place.
 * Approximation : toutes les couches partagent l'abscisse curviligne de la couche de référence
 * (dans la réalité les couches glissent légèrement les unes sur les autres).
 */
import * as THREE from 'three/webgpu';

export interface WindingLayer {
  name: string;
  /** Décalage radial depuis le rayon de référence (m). */
  offset: number;
  thickness: number;
  /** Bas et haut de la bande (m, repère du composant). */
  y0: number;
  y1: number;
}

export interface WindingSpec {
  /** Rayon du noyau (m). */
  r0: number;
  /** Pas radial = épaisseur de l'empilement (m). */
  pitch: number;
  /** Nombre de tours. */
  turns: number;
  layers: readonly WindingLayer[];
  /** Échantillons par tour (résolution angulaire). */
  samplesPerTurn: number;
}

/** Échantillon plan d'une couche : point médian (x, z) et normale extérieure (nx, nz). */
export interface PlanarSample {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

export class WindingMath {
  readonly thetaMax: number;
  readonly length: number;
  /** Droite d'appui de la bande déroulée (z). */
  readonly ground: number;
  constructor(readonly spec: WindingSpec) {
    this.thetaMax = spec.turns * 2 * Math.PI;
    this.length = this.arc(this.thetaMax);
    this.ground = -(this.radius(this.thetaMax) + spec.pitch);
  }

  radius(theta: number): number {
    return this.spec.r0 + (this.spec.pitch * theta) / (2 * Math.PI);
  }

  /** Longueur d'arc du noyau à θ. */
  arc(theta: number): number {
    return this.spec.r0 * theta + (this.spec.pitch * theta * theta) / (4 * Math.PI);
  }

  /** Inverse de `arc`. */
  thetaAt(arc: number): number {
    const a = this.spec.pitch / (4 * Math.PI);
    const b = this.spec.r0;
    if (arc <= 0) return 0;
    return (-b + Math.sqrt(b * b + 4 * a * arc)) / (2 * a);
  }

  /** Angle du point de contact pour une longueur déroulée ℓ. */
  contactTheta(unrolled: number): number {
    return this.thetaAt(Math.max(0, this.length - Math.min(this.length, unrolled)));
  }

  /**
   * Point médian et normale extérieure de la couche décalée de `offset` (milieu d'épaisseur
   * inclus par l'appelant) à l'angle θ, pour une longueur déroulée ℓ. Écrit dans `out`.
   */
  sample(theta: number, offset: number, unrolled: number, out: PlanarSample): PlanarSample {
    const thetaD = this.contactTheta(unrolled);
    const p = this.spec.pitch;
    if (theta >= thetaD && unrolled > 0) {
      out.x = this.length - this.arc(theta);
      out.z = this.ground + p - offset;
      out.nx = 0;
      out.nz = -1;
      return out;
    }
    const cx = Math.min(unrolled, this.length);
    const cz = this.ground + this.radius(thetaD) + p;
    const a = -Math.PI / 2 + (thetaD - theta);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r = this.radius(theta) + offset;
    out.x = cx + r * c;
    out.z = cz + r * s;
    out.nx = c;
    out.nz = s;
    return out;
  }
}

/** Nombre de sommets par échantillon (4 faces × 2 arêtes) et par extrémité. */
const PER_SAMPLE = 8;
const PER_CAP = 4;

/** Géométries déformables des couches (une par couche), réécrites en place. */
export class WindingGeometry {
  readonly math: WindingMath;
  readonly geometries: THREE.BufferGeometry[];
  private readonly thetas: Float64Array;
  private readonly tmp: PlanarSample = { x: 0, z: 0, nx: 0, nz: 0 };
  private unrolled = -1;

  constructor(spec: WindingSpec) {
    this.math = new WindingMath(spec);
    const n = Math.max(2, Math.ceil(spec.turns * spec.samplesPerTurn) + 1);
    this.thetas = new Float64Array(n);
    for (let i = 0; i < n; i++) this.thetas[i] = (this.math.thetaMax * i) / (n - 1);
    this.geometries = spec.layers.map(() => this.allocate(n));
    this.update(0);
    for (const g of this.geometries) this.orient(g);
  }

  /** Longueur déroulée courante (m). */
  get current(): number {
    return this.unrolled;
  }

  private allocate(n: number): THREE.BufferGeometry {
    const count = n * PER_SAMPLE + 2 * PER_CAP;
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    const nor = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    nor.setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      for (let k = 0; k < PER_SAMPLE; k++) {
        uv[(i * PER_SAMPLE + k) * 2] = u;
        uv[(i * PER_SAMPLE + k) * 2 + 1] = k % 2;
      }
    }
    g.setAttribute('position', pos);
    g.setAttribute('normal', nor);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    // Faces : sommets de l'échantillon i = [ext. bas, ext. haut, int. bas, int. haut,
    // dessus ext., dessus int., dessous ext., dessous int.].
    const index: number[] = [];
    const quad = (a: number, b: number, c: number, d: number) => index.push(a, b, c, a, c, d);
    for (let i = 0; i + 1 < n; i++) {
      const s = i * PER_SAMPLE;
      const t = (i + 1) * PER_SAMPLE;
      quad(s + 0, t + 0, t + 1, s + 1); // extérieur
      quad(s + 2, s + 3, t + 3, t + 2); // intérieur
      quad(s + 4, t + 4, t + 5, s + 5); // dessus
      quad(s + 6, s + 7, t + 7, t + 6); // dessous
    }
    const c0 = n * PER_SAMPLE;
    quad(c0, c0 + 1, c0 + 3, c0 + 2);
    quad(c0 + 4, c0 + 6, c0 + 7, c0 + 5);
    g.setIndex(index);
    return g;
  }

  /**
   * Oriente chaque type de face d'après sa normale déclarée (contrôle fait une fois, au repos) :
   * retourne les triangles dont la normale géométrique s'oppose à la normale des sommets.
   */
  private orient(g: THREE.BufferGeometry): void {
    const idx = g.getIndex()!;
    const pos = g.getAttribute('position');
    const nor = g.getAttribute('normal');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    // 6 quads « types » : les 4 premiers (faces du premier segment) et les 2 extrémités.
    const faces = idx.count / 6;
    const segs = faces - 2;
    const check = (quadIndex: number, apply: (q: number) => void, others: number[]) => {
      const i0 = idx.getX(quadIndex * 6);
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, idx.getX(quadIndex * 6 + 1));
      c.fromBufferAttribute(pos, idx.getX(quadIndex * 6 + 2));
      n.fromBufferAttribute(nor, i0);
      const geo = b.sub(a).cross(c.sub(a));
      if (geo.dot(n) < 0) for (const q of others) apply(q);
    };
    const flip = (q: number) => {
      for (let t = 0; t < 2; t++) {
        const k = q * 6 + t * 3;
        const tmp = idx.getX(k + 1);
        idx.setX(k + 1, idx.getX(k + 2));
        idx.setX(k + 2, tmp);
      }
    };
    for (let face = 0; face < 4; face++) {
      const list: number[] = [];
      for (let s = 0; s < segs / 4; s++) list.push(s * 4 + face);
      check(face, flip, list);
    }
    check(segs, flip, [segs]);
    check(segs + 1, flip, [segs + 1]);
    idx.needsUpdate = true;
  }

  /** Déroule sur la longueur `unrolled` (m) ; ne fait rien si elle n'a pas changé. */
  update(unrolled: number): void {
    const l = Math.max(0, Math.min(this.math.length, unrolled));
    if (Math.abs(l - this.unrolled) < 1e-9) return;
    this.unrolled = l;
    const n = this.thetas.length;
    const out = this.tmp;
    this.math.spec.layers.forEach((layer, k) => {
      const g = this.geometries[k]!;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const nor = g.getAttribute('normal') as THREE.BufferAttribute;
      const P = pos.array as Float32Array;
      const N = nor.array as Float32Array;
      const h = layer.thickness / 2;
      const mid = layer.offset + h;
      const { y0, y1 } = layer;
      const write = (v: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
        P[v * 3] = x;
        P[v * 3 + 1] = y;
        P[v * 3 + 2] = z;
        N[v * 3] = nx;
        N[v * 3 + 1] = ny;
        N[v * 3 + 2] = nz;
      };
      for (let i = 0; i < n; i++) {
        this.math.sample(this.thetas[i]!, mid, l, out);
        const ox = out.x + out.nx * h;
        const oz = out.z + out.nz * h;
        const ix = out.x - out.nx * h;
        const iz = out.z - out.nz * h;
        const v = i * PER_SAMPLE;
        write(v, ox, y0, oz, out.nx, 0, out.nz);
        write(v + 1, ox, y1, oz, out.nx, 0, out.nz);
        write(v + 2, ix, y0, iz, -out.nx, 0, -out.nz);
        write(v + 3, ix, y1, iz, -out.nx, 0, -out.nz);
        write(v + 4, ox, y1, oz, 0, 1, 0);
        write(v + 5, ix, y1, iz, 0, 1, 0);
        write(v + 6, ox, y0, oz, 0, -1, 0);
        write(v + 7, ix, y0, iz, 0, -1, 0);
        // Extrémités : noyau (i = 0) et bout extérieur (i = n − 1), normale tangente.
        if (i === 0 || i === n - 1) {
          const c = n * PER_SAMPLE + (i === 0 ? 0 : PER_CAP);
          // Tangente dans le sens des θ croissants : (nz, −nx) ; vers l'extérieur de la bande.
          const s = i === 0 ? -1 : 1;
          const tx = out.nz * s;
          const tz = -out.nx * s;
          write(c, ox, y0, oz, tx, 0, tz);
          write(c + 1, ox, y1, oz, tx, 0, tz);
          write(c + 2, ix, y0, iz, tx, 0, tz);
          write(c + 3, ix, y1, iz, tx, 0, tz);
        }
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
    });
  }

  /**
   * Position (x, z) et orientation d'un point d'attache d'une couche (languette) à l'angle θ,
   * décalé de `extra` vers l'extérieur de la couche. Écrit dans `out` (nx, nz = normale).
   */
  attachment(layerIndex: number, theta: number, extra: number, out: PlanarSample): PlanarSample {
    const layer = this.math.spec.layers[layerIndex]!;
    this.math.sample(theta, layer.offset + layer.thickness + extra, Math.max(0, this.unrolled), out);
    return out;
  }
}
