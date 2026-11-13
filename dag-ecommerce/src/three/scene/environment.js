import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { softboxCanvas } from './textures';

// ---------------------------------------------------------------------------
// Studio photo : boîtes à lumière émissives rendues dans une carte d'environnement
// préfiltrée (PMREM). Rien n'est téléchargé ; tout l'éclairage de la scène vient d'ici.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

// az : azimut depuis +Z vers +X ; el : élévation ; w/h : taille à 10 unités ; i : intensité
const PANELS = [
  // Lumière principale : grande boîte chaude, haut gauche, côté caméra
  { az: -58, el: 46, w: 13, h: 9, color: '#fff1dc', i: 6.4 },
  // Bandeau zénithal : fait briller les tranches
  { az: 25, el: 80, w: 15, h: 3.6, color: '#fff6ea', i: 2.6, roll: 20 },
  // Contre-jour droit : liseré sur les arêtes, lit le noir sur fond noir
  { az: 128, el: 16, w: 2.4, h: 15, color: '#fff8f0', i: 10 },
  // Contre-jour gauche, ambré
  { az: -150, el: 26, w: 3.2, h: 9, color: '#ffc98a', i: 4.2 },
  // Bande verticale avant gauche : reflet le long des faces du rouleau
  { az: -20, el: -4, w: 3.0, h: 17, color: '#fff3e2', i: 4.4 },
  // Réflecteur bas, face caméra : débouche les faces verticales
  { az: 34, el: -26, w: 15, h: 5, color: '#ffe3c2', i: 0.3 },
  // Remplissage doux, droite
  { az: 62, el: 30, w: 9, h: 9, color: '#ffe9d2', i: 0.25 },
];

/**
 * @param renderer
 * @param {number} floor  0 = plateau noir (ambiance sombre), 1 = papier clair : le sol renvoie alors
 *                        de la lumière sur les faces verticales, comme sur un vrai fond de studio.
 */
export function createStudioEnvironment(renderer, floor = 0) {
  const scene = new Scene();
  const disposables = [];
  const mix = (a, b) => a + (b - a) * floor;

  // Fond : dégradé sombre et chaud (plus clair vers l'horizon et le sol).
  const dome = new Mesh(
    new SphereGeometry(40, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new Color(mix(0.012, 0.03), mix(0.01, 0.027), mix(0.009, 0.023)) },
        horizon: { value: new Color(mix(0.055, 0.1), mix(0.042, 0.088), mix(0.033, 0.074)) },
        bottom: { value: new Color(mix(0.03, 0.52), mix(0.023, 0.47), mix(0.018, 0.395)) },
        ramp: { value: mix(0.6, 1.15) },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform float ramp; varying vec3 vDir; void main() { float y = normalize( vDir ).y; vec3 c = y > 0.0 ? mix( horizon, top, pow( y, 0.55 ) ) : mix( horizon, bottom, pow( - y, ramp ) ); gl_FragColor = vec4( c, 1.0 ); }',
    }),
  );
  scene.add(dome);
  disposables.push(dome.geometry, dome.material);

  const map = new CanvasTexture(softboxCanvas());
  map.colorSpace = SRGBColorSpace;
  disposables.push(map);
  const plane = new PlaneGeometry(1, 1);
  disposables.push(plane);
  for (const p of PANELS) {
    const material = new MeshBasicMaterial({
      map,
      color: new Color(p.color).multiplyScalar(p.i),
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      toneMapped: false,
    });
    disposables.push(material);
    const mesh = new Mesh(plane, material);
    const az = p.az * DEG;
    const el = p.el * DEG;
    mesh.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(10);
    mesh.lookAt(0, 0, 0);
    if (p.roll) mesh.rotateZ(p.roll * DEG);
    mesh.scale.set(p.w, p.h, 1);
    scene.add(mesh);
  }

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0, 0.1, 100, { size: 256 });
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return target;
}
