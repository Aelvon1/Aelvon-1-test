/**
 * Banc d'essai isolé du post-traitement (développement uniquement) : petite scène, pipeline réel
 * (`PostPipeline`), paramètres par l'URL :
 *   ?view=none|ao|aoraw|aodepth|depth|focus  &quality=low|medium|high|ultra  &backend=webgl
 *   &dof=1 (profondeur de champ)  &dim=0.5  &outline=hover|selected|blocked  &grain=0.03
 */
import * as THREE from 'three/webgpu';
import { installWebGPUCompat } from '../../core/webgpuCompat';
import { QUALITY_PROFILES } from '../../core/quality';
import { PostPipeline, createPostUniforms } from '../PostPipeline';
import {
  bokehPixels,
  computeFocusParams,
  resolveBuildConfig,
  type OutlineKind,
  type PostDebugView,
} from '../postLogic';

installWebGPUCompat();
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({
  canvas,
  antialias: false,
  reversedDepthBuffer: params.get('reversed') !== '0',
  forceWebGL: params.get('backend') === 'webgl',
});
await renderer.init();
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.toneMapping = THREE.AgXToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202830);
const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.05, 60);
camera.position.set(0.55, 0.45, 0.75);
camera.lookAt(0, 0.08, 0);
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x303848, 1.2));
const dir = new THREE.DirectionalLight(0xffffff, 2.5);
dir.position.set(2, 4, 1);
scene.add(dir);
const mat = new THREE.MeshStandardNodeMaterial({ color: 0xc8c0b0, roughness: 0.8 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), mat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
// Objet « inspecté » (au centre) + décor (plus loin).
const object = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.05, 0.1),
  new THREE.MeshStandardNodeMaterial({ color: 0x2f6f8f, roughness: 0.4, metalness: 0.3 }),
);
body.position.y = 0.025;
const cap = new THREE.Mesh(
  new THREE.CylinderGeometry(0.02, 0.02, 0.04, 24),
  new THREE.MeshStandardNodeMaterial({ color: 0xd08030, roughness: 0.5 }),
);
cap.position.set(0.04, 0.07, 0);
const led = new THREE.Mesh(
  new THREE.SphereGeometry(0.006, 12, 8),
  new THREE.MeshStandardNodeMaterial({ color: 0x000000, emissive: 0xff3010, emissiveIntensity: 6 }),
);
led.position.set(-0.05, 0.055, 0.03);
object.add(body, cap, led);
scene.add(object);
for (let i = 0; i < 5; i++) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4 + i * 0.2, 0.4), mat);
  box.position.set(-1 + i * 0.5, (0.4 + i * 0.2) / 2, -1.2 + (i % 2) * 0.4);
  scene.add(box);
}
const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.1), mat);
wall.position.set(0, 1, -2);
scene.add(wall);
const lamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 16, 12),
  new THREE.MeshStandardNodeMaterial({ color: 0x000000, emissive: 0xffd090, emissiveIntensity: 8 }),
);
lamp.position.set(0.8, 1.2, -1.6);
scene.add(lamp);

const quality = (params.get('quality') ?? 'high') as keyof typeof QUALITY_PROFILES;
const config = resolveBuildConfig(
  QUALITY_PROFILES[quality],
  params.get('backend') === 'webgl' ? 'webgl2' : 'webgpu',
);
const uniforms = createPostUniforms();
const engine = { renderer, scene, camera, reversedDepth: renderer.reversedDepthBuffer === true };
const pipeline = new PostPipeline(engine, config, uniforms, (params.get('view') ?? 'none') as PostDebugView);
const focusDistance = camera.position.distanceTo(new THREE.Vector3(0, 0.03, 0));
const focus = computeFocusParams({ distance: focusDistance, radius: 0.1 });
const dimAmount = Number(params.get('dim') ?? '0');
uniforms.dimAmount.value = dimAmount;
uniforms.dimStart.value = focus.dimStart;
uniforms.dimEnd.value = focus.dimEnd;
uniforms.grain.value = Number(params.get('grain') ?? '0.02');
uniforms.vignette.value = 0.3;
const useDof = params.get('dof') === '1' && pipeline.dof !== null;
if (pipeline.dof) {
  pipeline.dof.enabled = useDof;
  uniforms.dofOn.value = useDof ? 1 : 0;
  pipeline.dof.focusDistance.value = focus.distance;
  pipeline.dof.band.value = focus.band;
  pipeline.dof.ramp.value = focus.ramp;
  pipeline.dof.bokehScale.value = bokehPixels(renderer.domElement.height, 1);
}
const outlineKind = params.get('outline') as OutlineKind | null;
if (outlineKind) {
  pipeline.outline.setObjects(outlineKind, [cap]);
  if (params.get('hover2') === '1') pipeline.outline.setObjects('hover', [body]);
}
let frames = 0;
renderer.setAnimationLoop(() => {
  pipeline.ao?.update(camera, 0.05, renderer.domElement.width, renderer.domElement.height);
  uniforms.aspect.value = renderer.domElement.width / renderer.domElement.height;
  uniforms.outlineOn.value = pipeline.outline.active ? 1 : 0;
  pipeline.render();
  frames++;
  (window as unknown as { __frames: number }).__frames = frames;
});
(window as unknown as { __info: unknown }).__info = {
  reversed: renderer.reversedDepthBuffer,
  backend: (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend
    ? 'webgpu'
    : 'webgl2',
  config,
  focus,
};
