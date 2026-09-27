/**
 * Coordonnées de surface et échantillonnage des textures de détail.
 *
 * - `world` : position/normale monde. Pour le décor FIXE (sol, murs, établi) : aucune couture
 *   entre objets voisins, aucun besoin d'UV.
 * - `local` : repère du maillage (après instanciation). Pour les pièces MOBILES (objets démontés) :
 *   la texture reste solidaire de la pièce quand elle se déplace.
 * - UV : pour les effets orientés (anisotropie, stries alignées sur la circonférence…), voir
 *   `SurfaceKit.sampleUV`.
 *
 * Le mappage triplanaire est écrit ici plutôt qu'avec `triplanarTexture` de three (r186) : ce
 * dernier impose position/normale LOCALES et un mélange linéaire des trois projections (flou
 * visible à 45°) ; on veut ici le choix du repère, une netteté de transition réglable et un
 * décalage par projection (évite les motifs en miroir).
 */
import type * as THREE from 'three/webgpu';
import {
  abs,
  modelWorldMatrixInverse,
  normalWorldGeometry,
  pow,
  positionLocal,
  positionWorld,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { TextureService } from '../../textures/types';
import { type LibTextureName, libTexture } from '../libTextures';
import type { Vec3Node, Vec4Node } from './types';

export type MappingSpace = 'world' | 'local';

/** Échelle physique de la texture `grunge` (répétitions par mètre). */
export const GRUNGE_REPEATS_PER_METER = 3;

/** Position et normale géométrique (non perturbée) dans le repère choisi. */
export interface SurfaceFrame {
  position: Vec3Node;
  normal: Vec3Node;
}

export function surfaceFrame(space: MappingSpace): SurfaceFrame {
  if (space === 'world') return { position: positionWorld, normal: normalWorldGeometry };
  // Normale ramenée dans le repère du maillage (valable pour une échelle uniforme).
  return { position: positionLocal, normal: modelWorldMatrixInverse.transformDirection(normalWorldGeometry) };
}

/**
 * Échantillonnage triplanaire d'une texture : trois projections (plans YZ, ZX, XY) pondérées par
 * |normale|^`sharpness`. `scale` = répétitions par mètre.
 */
export function triplanar(map: THREE.Texture, frame: SurfaceFrame, scale: number, sharpness = 4): Vec4Node {
  const p = frame.position.mul(scale);
  const w0 = pow(abs(frame.normal), vec3(sharpness));
  const w = w0.div(w0.x.add(w0.y).add(w0.z).add(1e-5));
  // Décalages arbitraires : les trois projections ne tombent pas sur le même motif.
  const sx = texture(map, p.zy.add(vec2(0.37, 0.11)));
  const sy = texture(map, p.xz.add(vec2(0.71, 0.53)));
  const sz = texture(map, p.xy);
  return sx.mul(w.x).add(sy.mul(w.y)).add(sz.mul(w.z));
}

/** Environnement fourni aux fabriques de matériaux. */
export interface MaterialEnv {
  textures: TextureService;
  /** 0 = Bas … 3 = Ultra. */
  quality: 0 | 1 | 2 | 3;
}

export interface MappingOptions {
  /** Repère du mappage (défaut `local`). */
  space?: MappingSpace;
  /** Répétitions par mètre des textures de détail (défaut 25 : une répétition = 4 cm). */
  scale?: number;
  /** Netteté des transitions triplanaires (défaut 4). */
  sharpness?: number;
}

/**
 * Boîte à outils d'un matériau : textures de la bibliothèque et échantillons mis en cache (une
 * même texture à la même échelle n'est échantillonnée qu'une fois dans le graphe).
 */
export class SurfaceKit {
  readonly frame: SurfaceFrame;
  readonly space: MappingSpace;
  readonly scale: number;
  private readonly sharpness: number;
  private readonly cache = new Map<string, Vec4Node>();

  constructor(
    readonly env: MaterialEnv,
    options: MappingOptions = {},
  ) {
    this.space = options.space ?? 'local';
    this.scale = options.scale ?? 25;
    this.sharpness = options.sharpness ?? 4;
    this.frame = surfaceFrame(this.space);
  }

  texture(name: LibTextureName): THREE.Texture {
    return libTexture(this.env.textures, this.env.quality, name);
  }

  /** Échantillon triplanaire (échelle = `scale` × `scaleMul`). */
  sample(name: LibTextureName, scaleMul = 1): Vec4Node {
    const key = `tri:${name}:${scaleMul}`;
    let node = this.cache.get(key);
    if (!node) {
      node = triplanar(this.texture(name), this.frame, this.scale * scaleMul, this.sharpness);
      this.cache.set(key, node);
    }
    return node;
  }

  /**
   * Échantillon triplanaire à une échelle ABSOLUE (répétitions par mètre), indépendante de
   * `scale` : pour les détails de taille physique fixe (empreintes de doigts ~1,5 cm, taches).
   */
  sampleAbs(name: LibTextureName, repeatsPerMeter: number): Vec4Node {
    return this.sample(name, repeatsPerMeter / this.scale);
  }

  /**
   * Salissures (`grunge`) à l'échelle physique : 3 répétitions par mètre (taches de quelques cm,
   * empreintes de ~1,5 cm), quelle que soit la taille de la pièce.
   */
  grunge(): Vec4Node {
    return this.sampleAbs('grunge', GRUNGE_REPEATS_PER_METER);
  }

  /** Échantillon en coordonnées UV (canal 0), répété `repeatU` × `repeatV` fois. */
  sampleUV(name: LibTextureName, repeatU = 1, repeatV = 1): Vec4Node {
    const key = `uv:${name}:${repeatU}:${repeatV}`;
    let node = this.cache.get(key);
    if (!node) {
      node = texture(this.texture(name), uv().mul(vec2(repeatU, repeatV)));
      this.cache.set(key, node);
    }
    return node;
  }
}
