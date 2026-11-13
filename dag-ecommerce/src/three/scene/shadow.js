import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LinearFilter,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from 'three';

// ---------------------------------------------------------------------------
// Ombre de contact : la ceinture est rendue vue de dessous (hauteur → opacité), floutée en
// deux largeurs, puis posée au sol comme simple alpha noir. Fonctionne donc sur canvas
// transparent. Recalculée seulement quand la géométrie change.
// ---------------------------------------------------------------------------

const SIZE = 512;
export const SHADOW_LAYER = 1;

export function createContactShadow() {
  const mkTarget = () => {
    const t = new WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
    t.texture.minFilter = LinearFilter;
    t.texture.magFilter = LinearFilter;
    t.texture.generateMipmaps = false;
    return t;
  };
  const rtHeight = mkTarget();
  const rtTight = mkTarget();
  const rtWide = mkTarget();
  const rtTmp = mkTarget();

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 100);
  camera.layers.set(SHADOW_LAYER);
  const shadowMatrix = new Matrix4();

  // Hauteur au-dessus du sol → densité d'ombre.
  const heightMaterial = new ShaderMaterial({
    uniforms: { uReach: { value: 46 } },
    vertexShader: `
      varying float vH;
      void main() {
        vec4 wp = modelMatrix * vec4( position, 1.0 );
        vH = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uReach;
      varying float vH;
      void main() {
        float d = 1.0 - clamp( vH / uReach, 0.0, 1.0 );
        gl_FragColor = vec4( 0.0, 0.0, 0.0, d * d );
      }`,
  });

  const blurMaterial = new ShaderMaterial({
    uniforms: { tMap: { value: null }, uDir: { value: new Vector2() } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `
      uniform sampler2D tMap;
      uniform vec2 uDir;
      varying vec2 vUv;
      void main() {
        float a = 0.0;
        float w = 0.0;
        for ( int i = -8; i <= 8; i ++ ) {
          float x = float( i ) / 8.0;
          float g = exp( - x * x * 3.2 );
          a += texture2D( tMap, vUv + uDir * x ).a * g;
          w += g;
        }
        gl_FragColor = vec4( 0.0, 0.0, 0.0, a / w );
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const quadGeometry = new BufferGeometry();
  quadGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  quadGeometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new Mesh(quadGeometry, blurMaterial);
  quad.frustumCulled = false;
  const quadScene = new Scene();
  quadScene.add(quad);

  const planeMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      tTight: { value: rtTight.texture },
      tWide: { value: rtWide.texture },
      uMatrix: { value: shadowMatrix },
      uColor: { value: new Color('#090604') },
      uOpacity: { value: 1 },
    },
    vertexShader: `
      uniform mat4 uMatrix;
      varying vec2 vUv;
      void main() {
        vec4 p = uMatrix * vec4( position, 1.0 );
        vUv = p.xy * 0.5 + 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform sampler2D tTight;
      uniform sampler2D tWide;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float a = texture2D( tTight, vUv ).a;
        float b = texture2D( tWide, vUv ).a;
        vec2 e = min( vUv, 1.0 - vUv );
        float fade = smoothstep( 0.0, 0.06, min( e.x, e.y ) );
        float s = clamp( a * 0.62 + b * 0.5, 0.0, 0.86 ) * fade * uOpacity;
        gl_FragColor = vec4( uColor, s );
      }`,
  });
  const plane = new Mesh(new PlaneGeometry(1, 1), planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.renderOrder = -1;
  plane.frustumCulled = false;

  const blur = (renderer, from, to, radiusPx) => {
    blurMaterial.uniforms.tMap.value = from.texture;
    blurMaterial.uniforms.uDir.value.set(radiusPx / SIZE, 0);
    renderer.setRenderTarget(rtTmp);
    renderer.render(quadScene, camera);
    blurMaterial.uniforms.tMap.value = rtTmp.texture;
    blurMaterial.uniforms.uDir.value.set(0, radiusPx / SIZE);
    renderer.setRenderTarget(to);
    renderer.render(quadScene, camera);
  };

  return {
    plane,
    set opacity(v) {
      planeMaterial.uniforms.uOpacity.value = v;
      plane.visible = v > 0.003;
    },
    /**
     * @param renderer
     * @param scene   scène principale (les objets porteurs d'ombre sont sur SHADOW_LAYER)
     * @param bounds  { cx, cz, half } emprise au sol, dans le repère local de la ceinture
     */
    update(renderer, scene, bounds) {
      const { cx, cz, half } = bounds;
      camera.left = -half;
      camera.right = half;
      camera.top = half;
      camera.bottom = -half;
      camera.near = 0;
      camera.far = 120;
      camera.position.set(cx, -0.5, cz);
      camera.up.set(0, 0, 1);
      camera.lookAt(cx, 1, cz);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      shadowMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      plane.position.set(cx, 0.02, cz);
      plane.scale.set(half * 2, half * 2, 1);
      // Le plan est dans le repère local : sa matrice de modèle s'applique avant uMatrix.
      plane.updateMatrix();
      planeMaterial.uniforms.uMatrix.value.copy(shadowMatrix).multiply(plane.matrix);

      const prevTarget = renderer.getRenderTarget();
      const prevOverride = scene.overrideMaterial;
      const prevBackground = scene.background;
      const prevClear = renderer.getClearAlpha();
      const prevVisible = plane.visible;
      plane.visible = false;
      scene.overrideMaterial = heightMaterial;
      scene.background = null;
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(rtHeight);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = prevOverride;
      scene.background = prevBackground;

      const pxPerMm = SIZE / (half * 2);
      camera.layers.enableAll();
      blur(renderer, rtHeight, rtTight, 5.5 * pxPerMm);
      blur(renderer, rtHeight, rtWide, 13 * pxPerMm);
      blur(renderer, rtWide, rtWide, 13 * pxPerMm);
      camera.layers.set(SHADOW_LAYER);

      renderer.setRenderTarget(prevTarget);
      renderer.setClearAlpha(prevClear);
      plane.visible = prevVisible;
    },
    dispose() {
      for (const t of [rtHeight, rtTight, rtWide, rtTmp]) t.dispose();
      heightMaterial.dispose();
      blurMaterial.dispose();
      planeMaterial.dispose();
      quadGeometry.dispose();
      plane.geometry.dispose();
    },
  };
}
