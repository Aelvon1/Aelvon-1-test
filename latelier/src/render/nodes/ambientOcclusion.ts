/**
 * Occlusion ambiante GTAO (three r186, `GTAONode`) adaptée au pipeline de L'Atelier :
 *
 * 1. **Profondeur résolue** : la passe de scène peut être multi-échantillonnée (MSAA) ; or GTAO
 *    lit la profondeur avec `textureGather`, interdit sur une texture multi-échantillonnée en
 *    WGSL. Une passe minuscule recopie donc la profondeur (échantillon 0) dans une vraie
 *    `DepthTexture` flottante à la résolution de l'AO — plus petite, donc aussi plus rapide à lire.
 * 2. **Profondeur inversée** : `getViewPosition()` (three) suppose en WebGL un NDC z ∈ [-1, 1],
 *    alors qu'avec `reversedDepthBuffer` + `EXT_clip_control` la profondeur est dans [0, 1].
 *    On fournit à GTAO une caméra « miroir » dont l'inverse de projection intègre la correction
 *    z' ↦ (z' + 1) / 2 ; en WebGPU (NDC z ∈ [0, 1]) aucune correction n'est nécessaire.
 * 3. **Débruitage** : le motif de bruit 5 × 5 de GTAO est effacé par un flou séparable 5 + 5
 *    prises pondéré par la profondeur (pas de fuite d'occlusion d'un objet sur le fond).
 *
 * Les normales sont reconstruites depuis la profondeur (pas de MRT : aucun impact sur les
 * matériaux des autres modules).
 */
import * as THREE from 'three/webgpu';
import { Fn, abs, exp, float, max, perspectiveDepthToViewZ, reference, rtt, texture, uniform, uv, vec4 } from 'three/tsl';
import GTAONode from 'three/addons/tsl/display/GTAONode.js';

type FloatNode = THREE.Node<'float'>;

/**
 * Les déclarations de types de `GTAONode` exigent un nœud de normales ; three accepte `null`
 * (normales reconstruites depuis la profondeur). Conversion isolée ici.
 */
const RECONSTRUCTED_NORMALS = null as unknown as THREE.Node;

const _size = new THREE.Vector2();

/** Caméra miroir de la caméra de scène pour GTAO (matrices recopiées à chaque image). */
export class AoCameraMirror {
  readonly camera = new THREE.PerspectiveCamera();
  /** z' (NDC WebGL) ↦ (z' + 1) / 2 : profondeur inversée [0, 1] lue comme un NDC [-1, 1]. */
  private readonly ndcFix = new THREE.Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

  constructor(private readonly needsNdcFix: boolean) {
    this.camera.name = 'Caméra AO (miroir)';
  }

  sync(source: THREE.PerspectiveCamera): void {
    const cam = this.camera;
    cam.near = source.near;
    cam.far = source.far;
    cam.projectionMatrix.copy(source.projectionMatrix);
    cam.projectionMatrixInverse.copy(source.projectionMatrixInverse);
    if (this.needsNdcFix) cam.projectionMatrixInverse.multiply(this.ndcFix);
  }
}

/** Recopie de la profondeur de la passe de scène (MSAA ou non) dans une DepthTexture simple. */
class DepthResolvePass {
  readonly depthTexture = new THREE.DepthTexture(1, 1);
  readonly target: THREE.RenderTarget;
  private readonly material = new THREE.NodeMaterial();
  private readonly quad: THREE.QuadMesh;

  constructor(sourceDepth: THREE.Texture) {
    this.depthTexture.type = THREE.FloatType;
    this.depthTexture.name = 'PostFX.aoDepth';
    // Cible couleur minimale (R8) : seule la profondeur est utile.
    this.target = new THREE.RenderTarget(1, 1, {
      depthBuffer: true,
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
    });
    this.target.depthTexture = this.depthTexture;
    this.material.name = 'PostFX.depthResolve';
    this.material.fragmentNode = vec4(0);
    this.material.depthNode = texture(sourceDepth, uv()).r;
    this.material.depthTest = true;
    this.material.depthWrite = true;
    this.material.depthFunc = THREE.AlwaysDepth;
    this.quad = new THREE.QuadMesh(this.material);
    this.quad.name = 'PostFX [ Résolution de la profondeur AO ]';
  }

  render(renderer: THREE.Renderer, width: number, height: number): void {
    this.target.setSize(width, height);
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.target.dispose();
    this.depthTexture.dispose();
    this.material.dispose();
  }
}

/**
 * GTAO précédé de la recopie de profondeur. Garantit aussi l'ordre : la passe de scène de
 * l'image courante est rendue avant l'AO (sinon l'AO aurait une image de retard en mouvement).
 */
class ResolvedGTAONode extends GTAONode {
  private rendererState: THREE.RendererUtils.RendererState | null = null;

  constructor(
    private readonly resolve: DepthResolvePass,
    private readonly scenePass: THREE.PassNode,
    camera: THREE.Camera,
  ) {
    super(texture(resolve.depthTexture), RECONSTRUCTED_NORMALS, camera);
  }

  override updateBefore(frame: THREE.NodeFrame): boolean | undefined {
    const renderer = frame.renderer;
    if (!renderer) return undefined;
    frame.updateBeforeNode(this.scenePass);
    renderer.getDrawingBufferSize(_size);
    const width = Math.max(1, Math.round(_size.width * this.resolutionScale));
    const height = Math.max(1, Math.round(_size.height * this.resolutionScale));
    this.rendererState = THREE.RendererUtils.resetRendererState(
      renderer,
      this.rendererState ?? THREE.RendererUtils.saveRendererState(renderer),
    );
    this.resolve.render(renderer, width, height);
    THREE.RendererUtils.restoreRendererState(renderer, this.rendererState);
    return super.updateBefore(frame);
  }
}

export interface AmbientOcclusionOptions {
  scenePass: THREE.PassNode;
  camera: THREE.PerspectiveCamera;
  /** Résolution relative (0.25..1). */
  resolution: number;
  /** Échantillons GTAO (constante de compilation). */
  samples: number;
  /** Correction NDC (WebGL + profondeur inversée). */
  ndcFix: boolean;
}

/** Chaîne AO complète : GTAO + flou bilatéral séparable. `factor` : 1 = pas d'occlusion. */
export class AmbientOcclusion {
  readonly gtao: ResolvedGTAONode;
  /** Facteur d'occlusion filtré (flottant 0..1) à la résolution de l'AO, rééchantillonné bilinéairement. */
  readonly factor: FloatNode;
  private readonly mirror: AoCameraMirror;
  private readonly resolve: DepthResolvePass;
  private readonly blurH: THREE.RTTNode;
  private readonly blurV: THREE.RTTNode;
  /** Pas d'un texel d'AO, horizontal puis vertical (mis à jour avec la taille de l'image). */
  private readonly stepH = uniform(new THREE.Vector2(1, 0));
  private readonly stepV = uniform(new THREE.Vector2(0, 1));
  private readonly resolution: number;

  constructor(options: AmbientOcclusionOptions) {
    const { scenePass, resolution } = options;
    this.resolution = resolution;
    this.mirror = new AoCameraMirror(options.ndcFix);
    this.mirror.sync(options.camera);
    this.resolve = new DepthResolvePass(scenePass.getTexture('depth'));
    this.gtao = new ResolvedGTAONode(this.resolve, scenePass, this.mirror.camera);
    this.gtao.resolutionScale = resolution;
    this.gtao.samples.value = options.samples;
    this.gtao.distanceExponent.value = 1.4;
    this.gtao.distanceFallOff.value = 1;
    this.gtao.scale.value = 1.1;

    const aoTexture = this.gtao.getTextureNode();
    const depth = texture(this.resolve.depthTexture);
    const rttOptions = {
      resolutionScale: resolution,
      type: THREE.HalfFloatType,
      format: THREE.RedFormat,
      depthBuffer: false,
    } as const;
    this.blurH = rtt(bilateralBlur(aoTexture, depth, options.camera, this.stepH), null, null, rttOptions);
    this.blurV = rtt(bilateralBlur(this.blurH, depth, options.camera, this.stepV), null, null, rttOptions);
    this.factor = this.blurV.r;
  }

  /**
   * Met à jour la caméra miroir, le rayon d'échantillonnage (m, espace vue) et le pas du flou
   * (`width` × `height` : taille du tampon de dessin).
   */
  update(camera: THREE.PerspectiveCamera, radius: number, width: number, height: number): void {
    this.mirror.sync(camera);
    this.stepH.value.set(1 / Math.max(1, Math.round(width * this.resolution)), 0);
    this.stepV.value.set(0, 1 / Math.max(1, Math.round(height * this.resolution)));
    this.gtao.radius.value = radius;
    // Épaisseur : au-delà, un occulteur est considéré comme « fin » (pas d'occlusion derrière).
    this.gtao.thickness.value = Math.max(0.05, radius * 2.5);
  }

  dispose(): void {
    this.gtao.dispose();
    this.blurH.dispose();
    this.blurV.dispose();
    this.resolve.dispose();
  }
}

/**
 * Flou bilatéral 5 prises dans une direction (texels de la texture d'AO), pondéré par l'écart de
 * profondeur relatif : les bords des objets restent nets.
 */
function bilateralBlur(
  source: THREE.TextureNode,
  depth: THREE.TextureNode,
  camera: THREE.PerspectiveCamera,
  step: THREE.Node<'vec2'>,
): THREE.Node<'vec4'> {
  const near = reference('near', 'float', camera);
  const far = reference('far', 'float', camera);
  return Fn(() => {
    const coord = uv();
    const viewZ = (at: THREE.Node<'vec2'>): FloatNode => perspectiveDepthToViewZ(depth.sample(at).r, near, far);
    const centerZ = viewZ(coord).toVar();
    // Tolérance relative : 2 % de la distance (+ 5 mm) — suffisant pour une surface inclinée.
    const invTolerance = float(1).div(centerZ.abs().mul(0.02).add(0.005)).toVar();
    const sum = float(0).toVar();
    const weights = float(0).toVar();
    const spatial = [0.7, 1, 1, 1, 0.7];
    for (let i = -2; i <= 2; i++) {
      const at = coord.add(step.mul(i));
      const w = exp(abs(viewZ(at).sub(centerZ)).mul(invTolerance).negate()).mul(spatial[i + 2] ?? 1);
      sum.addAssign(source.sample(at).r.mul(w));
      weights.addAssign(w);
    }
    const value = sum.div(max(weights, 1e-4));
    return vec4(value, value, value, 1);
  })();
}
