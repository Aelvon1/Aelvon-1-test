/**
 * Contrat du service de textures procédurales.
 *
 * Toutes les textures sont générées dans un Web Worker (OffscreenCanvas) pour ne jamais figer
 * l'affichage. `get()` retourne IMMÉDIATEMENT une `THREE.Texture` (1×1 neutre), dont l'image est
 * remplacée lorsque le worker a terminé (`needsUpdate = true`). Les données sont transférées en
 * RGBA brut non prémultiplié (les canaux peuvent donc porter des données indépendantes).
 */
import type * as THREE from 'three/webgpu';

/** Opérations de dessin sérialisables, rastérisées dans le worker. */
export type DrawOp =
  | { op: 'fill'; color: string }
  | { op: 'clear' }
  | {
      op: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
      radius?: number;
    }
  | {
      op: 'circle';
      x: number;
      y: number;
      r: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      /** Chemin au format SVG (attribut `d`). */
      op: 'path';
      d: string;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
      lineCap?: 'butt' | 'round' | 'square';
      lineJoin?: 'miter' | 'round' | 'bevel';
      fillRule?: 'nonzero' | 'evenodd';
    }
  | {
      /** Suite de points [x0, y0, x1, y1, …]. */
      op: 'polyline';
      points: readonly number[];
      stroke?: string;
      fill?: string;
      lineWidth?: number;
      closed?: boolean;
      lineCap?: 'butt' | 'round' | 'square';
      lineJoin?: 'miter' | 'round' | 'bevel';
    }
  | {
      op: 'text';
      text: string;
      x: number;
      y: number;
      /** Police CSS, ex. "bold 1.2px 'DejaVu Sans Mono', monospace" (taille en unités du viewBox). */
      font: string;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
      align?: 'left' | 'center' | 'right';
      baseline?: 'top' | 'middle' | 'alphabetic' | 'bottom';
      /** Rotation (rad) autour de (x, y). */
      rotate?: number;
      /** Espacement des lettres (unités du viewBox). */
      letterSpacing?: number;
    }
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'transform'; a: number; b: number; c: number; d: number; e: number; f: number }
  | { op: 'alpha'; value: number }
  | { op: 'composite'; mode: string }
  /** Flou gaussien appliqué à tout le calque courant (rayon en pixels). */
  | { op: 'blur'; radius: number }
  /** Bruit (grain) ajouté au calque courant. */
  | { op: 'noise'; amount: number; seed?: number; scale?: number; mono?: boolean };

/** Paramètres du générateur `drawlist` : un calque RGBA dessiné par des `DrawOp`. */
export interface DrawListParams {
  /** Zone dessinée [x, y, largeur, hauteur] en unités libres (ex. mm) ; défaut : pixels. */
  viewBox?: readonly [number, number, number, number];
  /** Couleur de fond (défaut transparent). */
  background?: string;
  ops: readonly DrawOp[];
}

/**
 * Source d'un canal pour le générateur `channels` : liste d'opérations dessinées en niveaux de
 * gris (blanc = 1), OU dérivée d'un autre canal (copie floutée), OU constante.
 */
export type ChannelSource =
  | { ops: readonly DrawOp[]; background?: string }
  | { from: 'r' | 'g' | 'b' | 'a'; blur?: number; invert?: boolean }
  | { constant: number };

/**
 * Paramètres du générateur `channels` : chaque canal R, G, B, A porte une donnée indépendante
 * (ex. circuit imprimé : R = cuivre, G = cuivre flouté pour le relief, B = sérigraphie,
 * A = ouvertures du vernis).
 */
export interface ChannelsParams {
  viewBox?: readonly [number, number, number, number];
  r?: ChannelSource;
  g?: ChannelSource;
  b?: ChannelSource;
  a?: ChannelSource;
}

/** Paramètres du générateur `normalFromHeight` : carte de normales à partir d'une hauteur dessinée. */
export interface NormalFromHeightParams {
  viewBox?: readonly [number, number, number, number];
  height: ChannelSource;
  /** Intensité du relief. */
  strength: number;
}

/**
 * Générateurs procéduraux intégrés (paramètres libres documentés dans `textures/generators`).
 * Les objets peuvent enregistrer leurs propres générateurs dans `objects/<id>/textures.worker.ts`
 * (chargés automatiquement dans le worker via `import.meta.glob`).
 */
export type BuiltinGenerator =
  | 'drawlist'
  | 'channels'
  | 'normalFromHeight'
  | 'noise' // bruit fractal (valeur/perlin) en niveaux de gris
  | 'grunge' // taches, salissures, traces de doigts
  | 'scratches' // rayures fines
  | 'brushed' // métal brossé (stries dans une direction)
  | 'wood' // veinage de bois
  | 'concrete' // béton + taches d'huile
  | 'rust' // rouille
  | 'weave' // tissage (fibre, tissu), paramètres : fils, sergé/toile
  | 'paint' // grain « peint à la main »
  | 'cardboard'
  | 'forest' // silhouettes d'arbres dans la brume (fenêtre)
  | 'raindrops' // gouttes sur vitre (hauteur + masque)
  | 'label'; // étiquette/affiche (texte, bordures, tampon) — marques inventées uniquement

/** Requête de texture. `key` identifie la texture dans le cache (même clé → même texture). */
export interface TextureRequest {
  key: string;
  generator: BuiltinGenerator | (string & {});
  width: number;
  height: number;
  /** Paramètres JSON du générateur. */
  params?: unknown;
  /** Espace colorimétrique : `srgb` pour les couleurs, `linear` pour les données (défaut srgb). */
  colorSpace?: 'srgb' | 'linear';
  /** Répétition (défaut `repeat`). */
  wrap?: 'repeat' | 'clamp' | 'mirror';
  /** Mipmaps + filtrage trilinéaire (défaut true). */
  mipmaps?: boolean;
  /** Filtrage anisotrope maximal (défaut true). */
  anisotropy?: boolean;
  /** Graine pour les générateurs aléatoires. */
  seed?: number;
}

export interface TextureService {
  /** Retourne immédiatement la texture (remplie de façon asynchrone). */
  get(request: TextureRequest): THREE.Texture;
  /** Promesse résolue quand la texture `key` est remplie. */
  ready(key: string): Promise<THREE.Texture>;
  /** Promesse résolue quand toutes les requêtes en cours sont terminées. */
  whenIdle(): Promise<void>;
  /** Nombre de requêtes en attente (écran de chargement, debug). */
  pending(): number;
  /** Libère (GPU) les textures dont la clé commence par `prefix`. */
  disposeScope(prefix: string): void;
  /** Anisotropie maximale du GPU. */
  readonly maxAnisotropy: number;
}
