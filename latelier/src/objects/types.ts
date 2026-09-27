/**
 * Contrat de données des objets démontables.
 *
 * Le moteur (dossier `inspection/`) ne contient AUCUNE donnée propre à un objet : tout ce qu'il
 * sait d'un objet vient d'un `ObjectDef` déclaré dans `objects/<id>/`. Ajouter un objet consiste
 * donc à créer un dossier contenant un `index.ts` qui exporte `default` un `ObjectDef`
 * (découverte automatique par `objects/registry.ts`).
 *
 * Conventions générales :
 * - Unités : mètres, radians, secondes. 1 unité three.js = 1 m.
 * - Repère de l'objet : Y vers le haut, l'objet repose sur le plan y = 0 (le tapis de l'établi).
 * - Les directions (`ExplodeSpec.direction`, `RemovalSpec.axis`) sont exprimées dans le repère
 *   du PARENT de la pièce. Il est recommandé de ne pas tourner les nœuds de sous-ensembles : le
 *   repère du parent est alors identique (à une translation près) à celui de l'objet.
 * - Le pivot d'une pièce est l'origine locale de l'`Object3D` retourné par `build` : la rotation
 *   d'un dévissage se fait autour de ce point. Placez donc l'origine d'une vis sur son axe.
 */
import type * as THREE from 'three/webgpu';
import type { TextureService } from '../textures/types';
import type { MaterialFactory, MaterialProvider } from '../materials/types';

/**
 * Fonction à paramètre bivariant : permet d'enregistrer un `ObjectDef<MesParams>` là où un
 * `ObjectDef<ObjectParams>` est attendu (registre hétérogène), sans conversion explicite.
 */
export type Fn<A, R> = { bivarianceHack(arg: A): R }['bivarianceHack'];

/** Vecteur 3D sérialisable (x, y, z). */
export type Vec3 = readonly [number, number, number];

/** Valeur de paramètre d'objet (sérialisable). */
export type ParamValue = number | string | boolean;

/** Jeu de paramètres d'un objet paramétrique. */
export type ObjectParams = Record<string, ParamValue>;

/** Description d'un paramètre, utilisée pour générer les contrôles de l'interface. */
export type ParamSchema =
  | {
      key: string;
      label: string;
      kind: 'number';
      min: number;
      max: number;
      step: number;
      unit?: string;
      help?: string;
    }
  | {
      key: string;
      label: string;
      kind: 'select';
      options: readonly { value: string; label: string }[];
      help?: string;
    }
  | { key: string; label: string; kind: 'boolean'; help?: string };

/** Préréglage nommé (ex. « 3650 »). */
export interface ObjectPreset<P extends ObjectParams = ObjectParams> {
  id: string;
  label: string;
  params: Partial<P>;
}

/** Fiche pédagogique d'une pièce (panneau droit). Rédaction en français, niveau technicien. */
export interface PartInfo {
  /** Rôle de la pièce dans l'ensemble. */
  role: string;
  /** Matière (texte libre, ex. « Acier C45 rectifié »). */
  material: string;
  /** Dimensions principales (ex. « Ø 3,175 × 62 mm »). Marquer « typique » en cas de doute. */
  dimensions: string;
  /** Référence type (ex. « 693ZZ », « NCP1117-5.0 »). */
  reference?: string;
  /** Rubrique « À savoir » : panne typique, anecdote technique. */
  tip?: string;
  /** Lignes supplémentaires (ex. { label: 'Spires', value: '5 par bobine' }). */
  extra?: readonly { label: string; value: string }[];
}

/**
 * Types de mouvement de retrait. Chacun est interprété par le moteur (`inspection/motions`) :
 * - `translate`    : translation simple le long de `axis` sur `distance`.
 * - `unscrew`      : rotation autour de `axis` (tours = `turns`) + translation au pas `pitch`,
 *                    en accéléré, puis sortie libre jusqu'à `distance`.
 * - `magneticPull` : résistance (quelques dixièmes de mm, tremblement) puis décrochage brusque.
 *                    Au remontage : aspiration puis claquement magnétique.
 * - `desolder`     : l'étain fond (hook `onRemovalProgress` pour déformer les ménisques), puis la
 *                    pièce se soulève le long de `axis`.
 * - `pressOut`     : montée en effort (quasi immobile) puis translation lente et régulière.
 * - `unwind`       : débobinage progressif (la déformation est confiée au hook de la pièce),
 *                    puis translation.
 * - `unclip`       : petit mouvement de levier + déclic, puis translation.
 * - `lift`         : extraction en basculant légèrement (ex. CI extrait de son support).
 * - `spread`       : écartement des instances (tôles, billes) selon `spread`, puis translation.
 * - `peel`         : décollement progressif (frette, ruban, vernis) avec légère rotation.
 * - `cut`          : opération destructive (décapsulation, découpe) : court tremblement puis retrait.
 */
export type MotionKind =
  | 'translate'
  | 'unscrew'
  | 'magneticPull'
  | 'desolder'
  | 'pressOut'
  | 'unwind'
  | 'unclip'
  | 'lift'
  | 'spread'
  | 'peel'
  | 'cut';

/**
 * Écartement des instances d'une pièce instanciée (tôles, billes, broches…).
 * - `linear` : l'instance i est décalée de `step * i * amount` (repère de la pièce).
 * - `radial` : chaque instance s'éloigne de l'axe `axis` (passant par l'origine de la pièce)
 *              de `distance * amount`.
 */
export type InstanceSpread =
  { mode: 'linear'; step: Vec3 } | { mode: 'radial'; axis: Vec3; distance: number };

/** Paramètres de vue éclatée d'une pièce ou d'un sous-ensemble. */
export interface ExplodeSpec {
  /**
   * Direction d'écartement dans le repère du parent, ou `'radial'` : direction perpendiculaire à
   * `radialAxis` passant par l'origine du parent, orientée vers le centre de la pièce.
   */
  direction: Vec3 | 'radial';
  /** Distance d'écartement à 100 % (m). 0 = la pièce reste avec son parent. */
  distance: number;
  /**
   * Étage d'éclatement (0 = premier à bouger). Par défaut : profondeur hiérarchique de la pièce
   * (les sous-ensembles s'écartent d'abord, puis leurs pièces).
   */
  stage?: number;
  /** Axe utilisé par `direction: 'radial'` (défaut [0, 0, 1]). */
  radialAxis?: Vec3;
  /** Écartement des instances pour les pièces instanciées. */
  spread?: InstanceSpread;
}

/** Placement d'une pièce une fois retirée. */
export type RemovedPlacement = 'stay' | 'park' | 'hide';

/** Paramètres de retrait (démontage) d'une pièce. Absent = pièce de base, jamais retirée. */
export interface RemovalSpec {
  /**
   * Pièces à retirer AVANT celle-ci. Identifiants de pièces ou de sous-ensembles, ou `#tag` pour
   * désigner toutes les pièces portant ce tag. Les références à des pièces désactivées par les
   * paramètres (`PartDef.enabled`) sont ignorées.
   */
  requires?: readonly string[];
  /** Identifiant d'outil (catalogue `inspection/tools` ou `ObjectDef.tools`). */
  tool?: string;
  motion: MotionKind;
  /** Direction de sortie, repère du parent (normalisée par le moteur). */
  axis: Vec3;
  /** Course totale (m). */
  distance: number;
  /** `unscrew` : nombre de tours avant que le filet soit libre. */
  turns?: number;
  /** `unscrew` : pas du filetage (m/tour), ex. 0.0005 pour M3. */
  pitch?: number;
  /** Durée de l'animation (s). Défaut selon le type de mouvement. */
  duration?: number;
  /** Étape destructive (collage, emmanchement, décapsulation…). */
  destructive?: boolean;
  /**
   * Par défaut, une pièce appartenant à un sous-ensemble lui-même retirable ne peut être retirée
   * qu'une fois ce sous-ensemble retiré. `inPlace: true` lève cette contrainte (ex. vis sans tête
   * du pignon, retirée alors que le moteur est assemblé).
   */
  inPlace?: boolean;
  /** Explication courte du geste (FR). Sert de texte d'étape auto-générée. */
  gesture?: string;
  /** Écartement des instances pendant le retrait (`motion: 'spread'`). */
  spread?: InstanceSpread;
  /** Pièces instanciées : décalage temporel entre instances, fraction de la durée (0..1). */
  stagger?: number;
  /** Placement après retrait (défaut : `ObjectDef.removedPlacement`, puis réglage utilisateur). */
  after?: RemovedPlacement;
}

/** Options de la vue rangée (knolling) pour une pièce. */
export interface KnollingSpec {
  /** Groupe d'alignement (défaut : sous-ensemble de premier niveau). */
  group?: string;
  /** Pièces instanciées : pile (tôles) ou rangée (billes, vis). Défaut : `row`. */
  layout?: 'stack' | 'row';
  /** Rotation (Euler XYZ, rad) imposée pour la poser à plat ; sinon calculée automatiquement. */
  rotation?: Vec3;
  /** Exclure de la vue rangée (ex. vernis, pièce virtuelle). */
  exclude?: boolean;
}

/** Hooks optionnels qu'une pièce peut fournir pour des déformations spécifiques. */
export interface PartHooks {
  /** Progression du retrait (0 = en place, 1 = retirée). `direction` = +1 démontage, -1 remontage. */
  onRemovalProgress?(t: number, info: { motion: MotionKind; direction: 1 | -1 }): void;
  /** Taux d'éclatement courant (0..1) du parent direct. */
  onExplode?(amount: number): void;
  /** Mise à jour à chaque image tant que l'objet est affiché. */
  onFrame?(dt: number, time: number): void;
  /** Libération de ressources propres (le moteur libère déjà géométries/matériaux/textures). */
  dispose?(): void;
}

/** Résultat d'une construction de pièce. */
export interface PartBuild {
  /** Objet 3D de la pièce, positionné dans le repère du parent ; son origine est le pivot. */
  object: THREE.Object3D;
  /**
   * Maillage(s) instancié(s) de la pièce : le moteur lit leurs matrices au repos à la
   * construction et les anime par instance (écartement, pile de knolling, sélection individuelle).
   */
  instanced?: THREE.InstancedMesh | readonly THREE.InstancedMesh[];
  hooks?: PartHooks;
  /** Point d'ancrage (repère local) des étiquettes et de l'outil. Défaut : centre de la boîte. */
  anchor?: Vec3;
  /** Libellé par instance (ex. i => `Tôle n° ${i + 1}`). */
  instanceLabel?: (index: number) => string;
}

/** Construction de géométrie fine chargée à l'approche (niveau de détail adaptatif). */
export interface DetailSpec<P extends ObjectParams = ObjectParams> {
  /** Distance caméra → pièce (m) sous laquelle le détail est construit et affiché. */
  distance: number;
  /** Retourne un objet ajouté comme enfant de l'objet de la pièce. */
  build: Fn<BuildContext<P>, THREE.Object3D>;
  /** Masquer ces enfants (par nom) quand le détail est affiché (ex. version simplifiée). */
  replaces?: readonly string[];
}

/** Contexte de construction fourni aux fonctions `build` / `detail.build`. */
export interface BuildContext<P extends ObjectParams = ObjectParams> {
  params: P;
  /** Définition de la pièce en cours de construction. */
  def: PartDef<P>;
  materials: MaterialProvider;
  textures: TextureService;
  /** Cache de géométries partagées pour cet objet (instanciation automatique facilitée). */
  geometry: GeometryCache;
  /** Données partagées calculées par `ObjectDef.prepare` (dimensions, textures de circuit…). */
  shared: Record<string, unknown>;
  /** Niveau de qualité courant : 0 = Bas, 1 = Moyen, 2 = Élevé, 3 = Ultra. */
  quality: 0 | 1 | 2 | 3;
  /** Anisotropie maximale supportée par le GPU (pour les textures de marquage). */
  maxAnisotropy: number;
}

/** Cache de géométries : même clé → même instance partagée. */
export interface GeometryCache {
  get<G extends THREE.BufferGeometry>(key: string, factory: () => G): G;
}

/** Définition d'une pièce (ou d'un sous-ensemble). */
export interface PartDef<P extends ObjectParams = ObjectParams> {
  /** Identifiant unique dans l'objet, ex. "rotor.shaft". */
  id: string;
  /** Nom affiché (FR). */
  name: string;
  /** Sous-ensemble parent (identifiant d'une `PartDef` de `kind: 'assembly'`). */
  parent?: string;
  /** `assembly` = nœud de regroupement (peut avoir sa propre géométrie, ou aucune). */
  kind?: 'part' | 'assembly';
  /** Tags libres, utilisables dans `requires` via `#tag`. */
  tags?: readonly string[];
  /** Identifiant de matériau principal (informatif ; la construction choisit ses matériaux). */
  material?: string;
  /** Construit l'objet 3D. Absent pour un sous-ensemble sans géométrie propre. */
  build?: Fn<BuildContext<P>, THREE.Object3D | PartBuild>;
  /** Géométrie fine chargée à l'approche. */
  detail?: DetailSpec<P>;
  info: PartInfo;
  explode: ExplodeSpec;
  removal?: RemovalSpec;
  /** Nombre de pièces physiques représentées (pièce instanciée). Défaut 1. */
  quantity?: number | Fn<P, number>;
  /** Étiquette à trait de rappel. `false` = jamais d'étiquette. Priorité plus haute = affichée d'abord. */
  label?: false | { priority?: number; text?: string };
  knolling?: KnollingSpec;
  /** Pièce présente selon les paramètres (variantes). Défaut : toujours. */
  enabled?: Fn<P, boolean>;
}

/**
 * Étape du démontage pas à pas. L'ordre A → Z est un tri topologique des étapes (déduit des
 * `requires` de leurs pièces), départagé par `priority` (plus petit = plus tôt).
 * Les pièces retirables non couvertes par une étape reçoivent une étape générée automatiquement.
 */
export interface StepDef {
  id: string;
  /** Titre court (FR), ex. « Desserrer la vis sans tête ». */
  title: string;
  /** Explication courte du geste (FR). */
  description: string;
  /** Pièces retirées pendant l'étape (ids ou `#tag`), animées par couches topologiques. */
  parts: readonly string[];
  /** Outil affiché (défaut : outil de la première pièce). */
  tool?: string;
  priority?: number;
  /** Étape destructive (défaut : vrai si une des pièces l'est). */
  destructive?: boolean;
  /** Pièces à cadrer (défaut : `parts`). */
  focus?: readonly string[];
  /** Animer toutes les pièces simultanément au lieu de couches successives. */
  parallel?: boolean;
  /** Étape présente selon les paramètres. */
  enabled?: Fn<ObjectParams, boolean>;
}

/** Contexte de préparation asynchrone (avant construction). */
export interface PrepareContext<P extends ObjectParams = ObjectParams> {
  params: P;
  textures: TextureService;
  materials: MaterialProvider;
  shared: Record<string, unknown>;
  quality: 0 | 1 | 2 | 3;
  maxAnisotropy: number;
  /** Signale une progression (0..1) pendant la préparation. */
  progress: (value: number, label?: string) => void;
}

/** Contexte de construction d'un outil. */
export interface ToolBuildContext {
  materials: MaterialProvider;
  textures: TextureService;
}

/** État d'animation transmis à un outil pendant un geste. */
export interface ToolAnimState {
  /** Progression globale du geste (0..1), approche et retrait compris. */
  t: number;
  /** Progression du mouvement de la pièce (0..1). */
  motionT: number;
  motion: MotionKind;
  /** +1 démontage, -1 remontage. */
  direction: 1 | -1;
  /** Axe de travail (repère monde, normalisé). */
  axis: THREE.Vector3;
  /** Point de travail (repère monde) : ancrage de la pièce. */
  anchor: THREE.Vector3;
  /** Taille caractéristique de la pièce (rayon de la sphère englobante, m). */
  size: number;
  /** Rotation courante de la pièce autour de `axis` (rad), utile pour les clés. */
  spin: number;
}

/** Outil 3D animé montré pendant une étape. */
export interface ToolDef {
  id: string;
  /** Nom affiché, ex. « Clé Allen 1,5 mm ». */
  name: string;
  /** Icône SVG (balisage inline, viewBox 0 0 24 24, `currentColor`). */
  icon: string;
  /**
   * Construit le modèle. Convention : la pointe active de l'outil est à l'origine et l'outil
   * travaille le long de son axe local −Y (il « descend » vers la pièce).
   */
  build: (ctx: ToolBuildContext) => THREE.Object3D;
  /** Anime l'outil (déjà placé par le moteur sur `anchor`, aligné sur `axis`). */
  animate?: (tool: THREE.Object3D, state: ToolAnimState) => void;
}

/** Définition complète d'un objet de l'inventaire. */
export interface ObjectDef<P extends ObjectParams = ObjectParams> {
  /** Identifiant unique (nom du dossier recommandé), ex. "bldc-inrunner". */
  id: string;
  name: string;
  /** Catégorie affichée et filtrable, ex. « Moteurs », « Électronique ». */
  category: string;
  /** Difficulté 1 (facile) à 5 (expert). */
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Durée estimée du démontage complet (minutes réelles). */
  estimatedMinutes: number;
  /** Courte description (fiche d'inventaire). */
  description: string;
  /** Mots-clés de recherche supplémentaires. */
  keywords?: readonly string[];
  paramSchema: readonly ParamSchema[];
  presets?: readonly ObjectPreset<P>[];
  defaultParams: P;
  /** Pièces (liste statique ou dépendant des paramètres). */
  parts: readonly PartDef<P>[] | Fn<P, readonly PartDef<P>[]>;
  /** Étapes du démontage A → Z. */
  steps: readonly StepDef[] | Fn<P, readonly StepDef[]>;
  /** Préparation asynchrone (textures de circuit, calculs lourds) avant `build`. */
  prepare?: Fn<PrepareContext<P>, Promise<void>>;
  /** Matériaux propres à l'objet, enregistrés sous `<id objet>/<clé>` et aussi sous `<clé>`. */
  materials?: Record<string, MaterialFactory>;
  /** Outils propres à l'objet (s'ajoutent au catalogue). */
  tools?: readonly ToolDef[];
  /** Placement par défaut des pièces retirées. */
  removedPlacement?: RemovedPlacement;
  /** Présentation sur le tapis : rotation autour de Y (rad) et vue initiale. */
  presentation?: {
    rotationY?: number;
    /** Direction de vue initiale (de la cible vers la caméra), repère de l'objet. */
    viewDirection?: Vec3;
    /** Distance minimale de la caméra à la surface (m). Défaut 0.002. */
    minSurfaceDistance?: number;
  };
}
