/**
 * Vitrine des matériaux (développement) : `?materials=1`.
 *
 * Pose sur l'établi une grille d'échantillons (sphère + cube biseauté) de tous les
 * `BASE_MATERIAL_IDS`, chacun étiqueté, avec une caméra orbitale et un éclairage de studio
 * (lumières d'appoint + carte d'environnement pré-filtrée). Paramètres complémentaires :
 * - `filter=metal,steel` : ne montrer que les identifiants commençant par ces préfixes ;
 * - `cols=8`             : nombre de colonnes (défaut : grille la plus carrée possible) ;
 * - `focus=steel.ground` : cadrer un échantillon ;
 * - `view=dx,dy,dz,distance` : direction (depuis la cible) et distance de la caméra ;
 * - `target=x,y,z`       : cible de la caméra (repère monde) ;
 * - `env=world`          : garder l'environnement du décor (défaut : studio neutre) ;
 * - `glow=0..1|pulse`    : émission des LED et sources (défaut 1) ;
 * - `nobump=1`           : matériaux sans relief procédural (mise au point) ;
 * - `edges=0`            : cube sans attributs `edgeWear`/`cavity` (teste la variante dérivées) ;
 * - `probe=grunge.a`     : remplace les matériaux par l'affichage d'un canal d'une texture de la
 *                          bibliothèque (mappage triplanaire local), ou `probe=edge|cavity|curv`
 *                          pour les masques d'usure (mise au point).
 */
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { color, mix, normalize, positionLocal, smoothstep, vec3 } from 'three/tsl';
import type { AppContext } from '../core/context';
import type { World } from '../world/World';
import { BENCH, MAT } from '../world/layout';
import { BASE_MATERIAL_IDS } from '../materials/types';
import { applyEdgeWear } from '../materials/geometry/edgeWear';
import { setMaterialGlow } from '../materials/factories/optics';
import { LIB_TEXTURES, type LibTextureName } from '../materials/libTextures';
import { SurfaceKit } from '../materials/tsl/surface';
import { cavityMask, edgeMask, surfaceCurvature } from '../materials/tsl/wear';

export interface ShowcaseHandle {
  root: THREE.Group;
  controls: OrbitControls;
  samples: Map<string, THREE.Object3D>;
  dispose(): void;
}

export async function startMaterialShowcase(ctx: AppContext, _world: World): Promise<ShowcaseHandle> {
  const q = ctx.dev.raw;
  const { engine, materials, textures } = ctx;
  const prefixes = q.get('filter')?.split(',').filter(Boolean) ?? [];
  const ids = BASE_MATERIAL_IDS.filter(
    (id) => prefixes.length === 0 || prefixes.some((p) => id.startsWith(p)),
  );
  if (ids.length === 0)
    throw new Error(`Vitrine des matériaux : aucun identifiant ne correspond à « ${prefixes.join(', ')} ».`);

  // Zone utile : le plateau de l'établi, marges comprises.
  const area = { x0: BENCH.x[0] + 0.08, x1: BENCH.x[1] - 0.08, z0: BENCH.z[0] + 0.08, z1: BENCH.z[1] - 0.04 };
  const width = area.x1 - area.x0;
  const depth = area.z1 - area.z0;
  const colsParam = Number(q.get('cols'));
  const cols =
    Number.isFinite(colsParam) && colsParam > 0
      ? Math.round(colsParam)
      : Math.max(1, Math.ceil(Math.sqrt((ids.length * width) / depth)));
  const rows = Math.ceil(ids.length / cols);
  const cell = Math.min(width / cols, depth / rows);
  const gridW = cell * cols;
  const gridD = cell * rows;
  const y0 = MAT.center[1] + 0.0005;
  const center = new THREE.Vector3((area.x0 + area.x1) / 2, y0, (area.z0 + area.z1) / 2);

  // Géométries partagées : sphère (UV u = circonférence, tangentes pour l'anisotropie) et cube
  // biseauté (arêtes d'usure calculées par angle dièdre).
  const r = cell * 0.2;
  const sphere = new THREE.SphereGeometry(r, 48, 32);
  sphere.computeTangents();
  const cube = new RoundedBoxGeometry(r * 1.6, r * 1.6, r * 1.6, 4, r * 0.18);
  if (q.get('edges') !== '0') applyEdgeWear(cube, { minAngle: 5, maxAngle: 30, spread: 1 });
  const labelGeo = new THREE.PlaneGeometry(cell * 0.86, cell * 0.2);
  const probe = createProbeMaterial(ctx, q.get('probe'));

  const root = new THREE.Group();
  root.name = 'Vitrine des matériaux';
  const samples = new Map<string, THREE.Object3D>();
  const labelMaterials: THREE.Material[] = [];
  ids.forEach((id, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const group = new THREE.Group();
    group.name = `Échantillon ${id}`;
    group.position.set(
      center.x - gridW / 2 + cell * (col + 0.5),
      y0,
      center.z - gridD / 2 + cell * (row + 0.5),
    );
    let material = probe ?? materials.get(id);
    if (!probe && q.get('nobump') === '1' && 'normalNode' in material) {
      // Mise au point : même matériau sans relief procédural.
      material = materials.variant(id, { name: `${id} (sans relief)` });
      (material as THREE.MeshStandardNodeMaterial).normalNode = null;
    }
    const s = new THREE.Mesh(sphere, material);
    s.position.set(-cell * 0.2, r, -cell * 0.08);
    const c = new THREE.Mesh(cube, material);
    c.position.set(cell * 0.22, r * 0.8, -cell * 0.08);
    c.rotation.y = 0.5;
    for (const mesh of [s, c]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    // Étiquette générée par le worker de textures (générateur `label`, style plaquette).
    const labelTexture = textures.get({
      key: `dev/showcase/${id}`,
      generator: 'label',
      width: 512,
      height: 112,
      params: {
        style: 'plate',
        title: id,
        subtitle: '',
        paper: '#e9e1c8',
        ink: '#1f1d1a',
        accent: '#b35a2a',
        aging: 0.1,
      },
      colorSpace: 'srgb',
      wrap: 'clamp',
    });
    const labelMat = new THREE.MeshBasicNodeMaterial({ map: labelTexture, transparent: true });
    labelMaterials.push(labelMat);
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2 + 0.35;
    label.position.set(0, cell * 0.035, cell * 0.33);
    group.add(s, c, label);
    root.add(group);
    samples.set(id, group);
  });
  engine.scene.add(root);

  // Éclairage de studio d'appoint.
  const key = new THREE.SpotLight(0xfff1dd, 18, 5, Math.PI / 4, 0.7, 1.5);
  key.position.copy(center).add(new THREE.Vector3(0.6, 1.1, 0.9));
  key.target.position.copy(center);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
  fill.position.copy(center).add(new THREE.Vector3(-1.2, 0.8, 1));
  fill.target.position.copy(center);
  const rim = new THREE.PointLight(0xffd2a0, 1.5, 3, 2);
  rim.position.copy(center).add(new THREE.Vector3(0, 0.5, -0.3));
  engine.scene.add(key, key.target, fill, fill.target, rim);

  // Environnement de studio pré-filtré (reflets des métaux, clearcoat, verre).
  let envTarget: THREE.RenderTarget | null = null;
  let envScene: THREE.Scene | null = null;
  const previousEnvironment = engine.scene.environment;
  if (q.get('env') !== 'world') {
    envScene = createStudioScene();
    const pmrem = new THREE.PMREMGenerator(engine.renderer);
    envTarget = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    engine.scene.environment = envTarget.texture;
  }

  // Émission (LED, sources) : réglage fixe ou pulsation.
  const glowParam = q.get('glow') ?? '1';
  const glowables = ids.map((id) => materials.get(id));
  const applyGlow = (v: number) => {
    for (const m of glowables) setMaterialGlow(m, v);
  };
  if (glowParam !== 'pulse') applyGlow(Number.isFinite(Number(glowParam)) ? Number(glowParam) : 1);

  // Caméra orbitale.
  const camera = engine.camera;
  const focusId = q.get('focus');
  const focus = focusId ? samples.get(focusId) : undefined;
  const targetParam = q.get('target')?.split(',').map(Number);
  const target =
    targetParam && targetParam.length === 3 && targetParam.every(Number.isFinite)
      ? new THREE.Vector3(targetParam[0], targetParam[1], targetParam[2])
      : focus
        ? focus.position.clone().add(new THREE.Vector3(0, r * 0.9, -cell * 0.08))
        : center.clone().add(new THREE.Vector3(0, r, 0));
  const view = ctx.dev.view;
  const dir =
    view && view.length >= 3
      ? new THREE.Vector3(view[0], view[1], view[2]).normalize()
      : new THREE.Vector3(0, 1, 0.9).normalize();
  const fov = 35;
  // Cadrage : largeur de la grille dans le champ horizontal, profondeur (vue en biais) dans le
  // champ vertical.
  const halfV = THREE.MathUtils.degToRad(fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  const fitDistance =
    Math.max(
      gridW / 2 / Math.tan(halfH),
      ((gridD / 2) * Math.max(0.4, Math.abs(dir.y))) / Math.tan(halfV) + gridD / 2,
    ) * 1.08;
  const distance = view && view.length >= 4 ? view[3]! : focus ? cell * 1.3 : fitDistance;
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.fov = fov;
  camera.near = Math.max(1e-4, distance * 0.02);
  camera.far = 30;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  const controls = new OrbitControls(camera, engine.canvas);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.zoomToCursor = true;
  controls.minDistance = 0.005;
  controls.update();
  const removeUpdate = engine.add({
    update: (frame) => {
      controls.update();
      const d = camera.position.distanceTo(controls.target);
      camera.near = Math.max(1e-5, d * 0.05);
      camera.far = Math.max(5, d * 400);
      camera.updateProjectionMatrix();
      if (glowParam === 'pulse') applyGlow(0.5 + 0.5 * Math.sin(frame.time * 2));
    },
  });

  console.info(
    `[vitrine] ${ids.length} matériaux (${cols} × ${rows}, cellule ${(cell * 100).toFixed(1)} cm), environnement ${envTarget ? 'studio' : 'décor'}.`,
  );
  const handle: ShowcaseHandle = {
    root,
    controls,
    samples,
    dispose: () => {
      removeUpdate();
      controls.dispose();
      engine.scene.remove(root, key, key.target, fill, fill.target, rim);
      sphere.dispose();
      cube.dispose();
      labelGeo.dispose();
      for (const m of labelMaterials) m.dispose();
      textures.disposeScope('dev/showcase/');
      if (envTarget) {
        engine.scene.environment = previousEnvironment;
        envTarget.dispose();
      }
      envScene?.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
    },
  };
  (window as unknown as { __showcase?: ShowcaseHandle }).__showcase = handle;
  return handle;
}

/** Matériau de mise au point : canal d'une texture de la bibliothèque ou masque d'usure. */
function createProbeMaterial(ctx: AppContext, spec: string | null): THREE.Material | null {
  if (!spec) return null;
  const m = new THREE.MeshBasicNodeMaterial();
  if (spec === 'edge' || spec === 'cavity' || spec === 'curv') {
    const v =
      spec === 'edge'
        ? edgeMask(0.004)
        : spec === 'cavity'
          ? cavityMask(0.004)
          : surfaceCurvature().mul(0.01).add(0.5);
    m.colorNode = vec3(v);
    return m;
  }
  const [name, channel = 'r'] =
    spec.split('.').length > 2
      ? [spec.slice(0, spec.lastIndexOf('.')), spec.slice(spec.lastIndexOf('.') + 1)]
      : spec.split('.');
  if (!name || !(name in LIB_TEXTURES)) return null;
  const kit = new SurfaceKit(
    { textures: ctx.textures, quality: ctx.engine.quality.level },
    { space: 'local', scale: 25 },
  );
  const sample = kit.sample(name as LibTextureName);
  m.colorNode =
    channel === 'rgb'
      ? sample.rgb
      : vec3(channel === 'g' ? sample.g : channel === 'b' ? sample.b : channel === 'a' ? sample.a : sample.r);
  return m;
}

/**
 * Studio neutre pour la carte d'environnement : dôme en dégradé (sol sombre chaud, ciel gris
 * froid) et trois boîtes à lumière (principale chaude au-dessus, bande froide latérale, contre-jour).
 */
function createStudioScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const dome = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const h = normalize(positionLocal).y;
  dome.colorNode = mix(color(0x1a1714), color(0x7d8791), smoothstep(-0.25, 0.7, h)).mul(0.22);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), dome));
  const panel = (w: number, hgt: number, c: number, intensity: number, pos: THREE.Vector3) => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.colorNode = color(c).mul(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), m);
    mesh.position.copy(pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(6, 4, 0xfff0dc, 1.6, new THREE.Vector3(1.5, 7, 3));
  panel(1.2, 7, 0xd8e6ff, 1.1, new THREE.Vector3(-8, 2, 1));
  panel(5, 1.2, 0xffe2c0, 0.8, new THREE.Vector3(0, 3, -8));
  return scene;
}
