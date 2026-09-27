/**
 * Contours de sélection multi-couleurs (survol / sélection / bloqué) en un seul jeu de passes.
 *
 * Pourquoi pas trois `OutlineNode` de three ? Chacun redessine TOUTE la scène (profondeur des
 * objets non sélectionnés) à chaque image où sa liste est non vide : trois listes actives
 * tripleraient les appels de dessin. Ici :
 * 1. **masque** : seuls les maillages listés sont dessinés (matériau de substitution par type,
 *    canaux R/V/B = survol/sélection/bloqué). La visibilité (A) est déterminée en comparant la
 *    profondeur du fragment à celle de la passe de scène déjà rendue — aucune passe en plus ;
 * 2. **halo** : flou gaussien séparable à demi-résolution ;
 * 3. **calque** : trait net (dilatation 8 directions) + halo + léger voile intérieur, en couleur
 *    prémultipliée, composé en espace d'affichage par le pipeline.
 *
 * Coût nul quand les trois listes sont vides (aucune passe ; le calque est effacé une fois).
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraFar,
  cameraNear,
  clamp,
  float,
  max,
  mix,
  perspectiveDepthToViewZ,
  positionView,
  screenUV,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { OUTLINE_KINDS, resolveOutlineKinds, type OutlineKind } from '../postLogic';

type RenderObjectFn = NonNullable<Parameters<THREE.Renderer['setRenderObjectFunction']>[0]>;

/** Couleurs d'affichage (sRGB) : blanc chaud, orange « ruban adhésif », rouge. */
export const OUTLINE_COLORS: Readonly<Record<OutlineKind, readonly [number, number, number]>> = {
  hover: [1.0, 0.93, 0.8],
  selected: [1.0, 0.56, 0.1],
  blocked: [1.0, 0.14, 0.1],
};

const KIND_CHANNEL: Readonly<Record<OutlineKind, readonly [number, number, number]>> = {
  hover: [1, 0, 0],
  selected: [0, 1, 0],
  blocked: [0, 0, 1],
};

const _size = new THREE.Vector2();

export class SelectionOutlineNode extends THREE.TempNode<'vec4'> {
  static get type(): string {
    return 'SelectionOutlineNode';
  }

  /** Intensité du contour « bloqué » (pulsation pilotée par PostFX). */
  readonly pulse = uniform(1);
  /** Décalage du trait net : épaisseur (px) / taille du masque (résolution pleine). */
  private readonly edgeStep = uniform(new THREE.Vector2(1, 1));
  /** Pas du flou (texels de la cible demi-résolution) dans la direction courante. */
  private readonly blurStep = uniform(new THREE.Vector2(1, 0));

  private readonly lists: Record<OutlineKind, THREE.Object3D[]> = { hover: [], selected: [], blocked: [] };
  private readonly meshKinds = new Map<THREE.Object3D, OutlineKind>();
  private dirty = false;
  /** Le calque contient un contour (à effacer quand les listes se vident). */
  private overlayDirty = false;
  /** Premier passage : toutes les passes sont exécutées pour compiler les shaders. */
  private warm = true;

  private readonly maskTarget = new THREE.RenderTarget(1, 1, { depthBuffer: true });
  private readonly softTargetA = new THREE.RenderTarget(1, 1, { depthBuffer: false });
  private readonly softTargetB = new THREE.RenderTarget(1, 1, { depthBuffer: false });
  private readonly overlayTarget = new THREE.RenderTarget(1, 1, { depthBuffer: false });

  private readonly kindMaterials: Record<OutlineKind, THREE.NodeMaterial>;
  private readonly blurMaterial = new THREE.NodeMaterial();
  private readonly overlayMaterial = new THREE.NodeMaterial();
  private readonly blurSource = texture(this.maskTarget.texture);
  private readonly quad = new THREE.QuadMesh(this.blurMaterial);
  private readonly overlayNode: THREE.TextureNode;
  private readonly warmScene = new THREE.Scene();
  private readonly warmMesh: THREE.Mesh;

  private rendererState: THREE.RendererUtils.RendererState | null = null;
  private sceneState: THREE.RendererUtils.SceneState | null = null;
  private currentRenderer: THREE.Renderer | null = null;
  private warmKind: OutlineKind | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly scenePass: THREE.PassNode,
  ) {
    super('vec4');
    this.updateBeforeType = THREE.NodeUpdateType.FRAME;
    this.maskTarget.texture.name = 'PostFX.outlineMask';
    this.softTargetA.texture.name = 'PostFX.outlineSoftA';
    this.softTargetB.texture.name = 'PostFX.outlineSoftB';
    this.overlayTarget.texture.name = 'PostFX.outlineOverlay';
    this.overlayNode = texture(this.overlayTarget.texture);

    const sceneDepth = texture(scenePass.getTexture('depth'));
    const makeMaskMaterial = (kind: OutlineKind): THREE.NodeMaterial => {
      const material = new THREE.NodeMaterial();
      material.name = `PostFX.outlineMask.${kind}`;
      material.side = THREE.DoubleSide;
      material.blending = THREE.NoBlending;
      // Visible si le fragment n'est pas derrière la surface de la passe de scène (tolérance
      // relative : 1 % de la distance, 2 mm minimum).
      const sceneZ = perspectiveDepthToViewZ(sceneDepth.sample(screenUV).r, cameraNear, cameraFar);
      const tolerance = max(sceneZ.negate().mul(0.01), 0.002);
      const visible = step(sceneZ.sub(tolerance), positionView.z);
      material.fragmentNode = vec4(vec3(...KIND_CHANNEL[kind]), visible);
      return material;
    };
    this.kindMaterials = {
      hover: makeMaskMaterial('hover'),
      selected: makeMaskMaterial('selected'),
      blocked: makeMaskMaterial('blocked'),
    };
    this.quad.name = 'PostFX [ Contours ]';
    this.warmMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.001, 0.001));
    this.warmMesh.frustumCulled = false;
    this.warmScene.add(this.warmMesh);
  }

  /** Remplace la liste d'un type de contour. */
  setObjects(kind: OutlineKind, objects: readonly THREE.Object3D[]): void {
    const list = this.lists[kind];
    list.length = 0;
    for (const object of objects) list.push(object);
    this.dirty = true;
  }

  /** Nombre de maillages entourés (toutes listes). */
  get meshCount(): number {
    this.refresh();
    return this.meshKinds.size;
  }

  /** Vrai si le calque doit être composé cette image. */
  get active(): boolean {
    return this.meshCount > 0;
  }

  private refresh(): void {
    if (!this.dirty) return;
    this.dirty = false;
    resolveOutlineKinds(this.lists, expandMeshes, this.meshKinds);
  }

  private readonly renderMaskObject: RenderObjectFn = (
    object,
    scene,
    camera,
    geometry,
    _material,
    group,
    lightsNode,
    clippingContext,
  ) => {
    const kind = this.warmKind ?? this.meshKinds.get(object);
    const renderer = this.currentRenderer;
    if (kind === undefined || !renderer) return;
    renderer.renderObject(
      object,
      scene,
      camera,
      geometry,
      this.kindMaterials[kind],
      group,
      lightsNode,
      clippingContext,
    );
  };

  override updateBefore(frame: THREE.NodeFrame): boolean | undefined {
    const renderer = frame.renderer;
    if (!renderer) return undefined;
    this.refresh();
    const hasContent = this.meshKinds.size > 0;
    if (!hasContent && !this.warm) {
      if (this.overlayDirty) {
        this.rendererState = THREE.RendererUtils.resetRendererState(renderer, this.ensureRendererState(renderer));
        renderer.setRenderTarget(this.overlayTarget);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        THREE.RendererUtils.restoreRendererState(renderer, this.rendererState);
        this.overlayDirty = false;
      }
      return undefined;
    }
    // La visibilité se lit dans la profondeur de la passe de scène de CETTE image.
    frame.updateBeforeNode(this.scenePass);

    renderer.getDrawingBufferSize(_size);
    const width = Math.max(1, _size.width);
    const height = Math.max(1, _size.height);
    this.maskTarget.setSize(width, height);
    this.overlayTarget.setSize(width, height);
    const halfW = Math.max(1, Math.round(width / 2));
    const halfH = Math.max(1, Math.round(height / 2));
    this.softTargetA.setSize(halfW, halfH);
    this.softTargetB.setSize(halfW, halfH);
    const thickness = Math.max(1, height / 800);
    this.edgeStep.value.set(thickness / width, thickness / height);

    const state = THREE.RendererUtils.resetRendererState(renderer, this.ensureRendererState(renderer));
    this.rendererState = state;
    this.sceneState = THREE.RendererUtils.resetSceneState(
      this.scene,
      this.sceneState ?? THREE.RendererUtils.saveSceneState(this.scene),
    );
    renderer.setClearColor(0x000000, 0);

    // 1. Masque des maillages listés (les autres objets sont ignorés : aucun appel de dessin).
    this.currentRenderer = renderer;
    renderer.setRenderTarget(this.maskTarget);
    renderer.setRenderObjectFunction(this.renderMaskObject);
    if (this.warm) {
      // Préchauffage : compile les trois matériaux de masque sur un maillage minuscule.
      for (const kind of OUTLINE_KINDS) {
        this.warmKind = kind;
        renderer.render(this.warmScene, this.camera);
      }
      this.warmKind = null;
      renderer.clear();
    }
    if (hasContent) renderer.render(this.scene, this.camera);
    renderer.setRenderObjectFunction(null);
    this.currentRenderer = null;

    // 2. Halo : flou séparable à demi-résolution.
    this.quad.material = this.blurMaterial;
    this.blurSource.value = this.maskTarget.texture;
    this.blurStep.value.set(1 / halfW, 0);
    renderer.setRenderTarget(this.softTargetA);
    this.quad.render(renderer);
    this.blurSource.value = this.softTargetA.texture;
    this.blurStep.value.set(0, 1 / halfH);
    renderer.setRenderTarget(this.softTargetB);
    this.quad.render(renderer);

    // 3. Calque final (trait + halo), couleur prémultipliée.
    this.quad.material = this.overlayMaterial;
    renderer.setRenderTarget(this.overlayTarget);
    this.quad.render(renderer);

    THREE.RendererUtils.restoreSceneState(this.scene, this.sceneState);
    THREE.RendererUtils.restoreRendererState(renderer, state);
    this.overlayDirty = true;
    this.warm = false;
    return undefined;
  }

  private ensureRendererState(renderer: THREE.Renderer): THREE.RendererUtils.RendererState {
    return this.rendererState ?? THREE.RendererUtils.saveRendererState(renderer);
  }

  override setup(): THREE.Node {
    // Flou gaussien 9 prises (σ ≈ 2,5 texels demi-résolution) dans la direction courante.
    const blur = Fn(() => {
      const coord = uv();
      const offset = this.blurStep;
      const weights = [0.2, 0.18, 0.12, 0.07, 0.03];
      const sum = this.blurSource.sample(coord).mul(weights[0] ?? 0).toVar();
      for (let i = 1; i < weights.length; i++) {
        const w = weights[i] ?? 0;
        const d = offset.mul(i * 1.25);
        sum.addAssign(this.blurSource.sample(coord.add(d)).mul(w));
        sum.addAssign(this.blurSource.sample(coord.sub(d)).mul(w));
      }
      // Somme des poids = 0,2 + 2 × 0,4 = 1 : pas de normalisation.
      return sum;
    });
    this.blurMaterial.name = 'PostFX.outlineBlur';
    this.blurMaterial.fragmentNode = blur();
    this.blurMaterial.needsUpdate = true;

    const mask = texture(this.maskTarget.texture);
    const soft = texture(this.softTargetB.texture);
    const overlay = Fn(() => {
      const coord = uv();
      const texel = this.edgeStep;
      const center = mask.sample(coord);
      // Dilatation 8 directions : maximum du masque autour du pixel.
      const dirs: [number, number][] = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [0.7071, 0.7071],
        [-0.7071, 0.7071],
        [0.7071, -0.7071],
        [-0.7071, -0.7071],
      ];
      const around = vec4(0).toVar();
      for (const [dx, dy] of dirs) around.assign(max(around, mask.sample(coord.add(texel.mul(vec2(dx, dy))))));
      const halo = soft.sample(coord);
      // Parties cachées derrière un autre objet : même couleur, plus discrètes.
      const edgeVisibility = mix(float(0.4), float(1), around.a);
      const haloVisibility = mix(float(0.4), float(1), clamp(halo.a.mul(2.5), 0, 1));
      const edge = clamp(around.rgb.sub(center.rgb), 0, 1).mul(edgeVisibility);
      const glow = clamp(halo.rgb.mul(1.8).sub(center.rgb), 0, 1).mul(0.5).mul(haloVisibility);
      // Voile intérieur : rien au survol, léger pour la sélection, plus marqué si bloqué.
      const fill = center.rgb.mul(vec3(0, 0.07, 0.14)).mul(center.a.mul(0.6).add(0.4));
      const k = edge.add(glow).add(fill).mul(vec3(1, 1, this.pulse)).toVar();
      const color = vec3(...OUTLINE_COLORS.hover)
        .mul(k.r)
        .add(vec3(...OUTLINE_COLORS.selected).mul(k.g))
        .add(vec3(...OUTLINE_COLORS.blocked).mul(k.b));
      const alpha = clamp(max(max(k.r, k.g), k.b), 0, 1);
      return vec4(clamp(color, 0, 1), alpha);
    });
    this.overlayMaterial.name = 'PostFX.outlineOverlay';
    this.overlayMaterial.fragmentNode = overlay();
    this.overlayMaterial.needsUpdate = true;
    return this.overlayNode;
  }

  override dispose(): void {
    super.dispose();
    this.maskTarget.dispose();
    this.softTargetA.dispose();
    this.softTargetB.dispose();
    this.overlayTarget.dispose();
    for (const kind of OUTLINE_KINDS) this.kindMaterials[kind].dispose();
    this.blurMaterial.dispose();
    this.overlayMaterial.dispose();
    this.warmMesh.geometry.dispose();
  }
}

/** Parcourt les descendants et ne retient que les maillages (instanciés compris). */
function expandMeshes(object: THREE.Object3D, visit: (leaf: THREE.Object3D) => void): void {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) visit(child);
  });
}
