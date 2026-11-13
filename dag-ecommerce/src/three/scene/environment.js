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

// az : azimut depuis +Z vers +X ; el : élévation ; w/h : taille à 10 unités ; i : intensité.
// color : [ambiance chaude, ambiance neutre]. Les cuirs neutres ou froids (noir, bleu nuit, charbon…)
// sont éclairés en lumière neutre, avec un liseré froid : sous la lumière chaude, le noir vire au brun.
const PANELS = [
  // Lumière principale : grande boîte, haut gauche, côté caméra
  { az: -58, el: 46, w: 13, h: 9, color: ['#fff1dc', '#fbf7f2'], i: [6.4, 6.0] },
  // Bandeau zénithal : fait briller les arêtes des tranches
  { az: 25, el: 80, w: 15, h: 3.6, color: ['#fff6ea', '#f8f8f8'], i: [2.4, 2.4], roll: 20 },
  // Contre-jour droit : liseré sur les arêtes, lit le noir sur fond noir
  { az: 128, el: 16, w: 2.4, h: 15, color: ['#fff8f0', '#f1f5ff'], i: [9, 10] },
  // Contre-jour gauche, rasant : ambré, ou froid (≈ 6500 K) pour détacher les cuirs sombres du fond
  { az: -150, el: [22, 15], w: 3.2, h: [10, 8.5], color: ['#ffc98a', '#e2ebff'], i: [4.2, 6.5] },
  // Bande verticale avant gauche : long dégradé le long de la face du rouleau
  { az: -20, el: -2, w: [3.0, 4.6], h: 17, color: ['#fff3e2', '#f6f6f4'], i: [4.4, 4.2] },
  // Réflecteur bas, face caméra : débouche les faces verticales
  { az: 34, el: -26, w: 15, h: 5, color: ['#ffe3c2', '#eeeef2'], i: [0.3, 0.55] },
  // Remplissage doux, droite
  { az: 62, el: 30, w: 9, h: 9, color: ['#ffe9d2', '#eef0f4'], i: [0.25, 0.45] },
];

// Fond papier : deux drapeaux noirs, de part et d'autre, pour que le métal poli garde des arêtes sombres.
const FLAGS = [
  { az: 96, el: 4, w: 4.2, h: 12 },
  { az: -112, el: 2, w: 3.4, h: 11 },
];

const pick = (v, mood) => (Array.isArray(v) ? v[mood] : v);

/**
 * @param renderer
 * @param {number} floor  0 = plateau noir (ambiance sombre), 1 = papier clair : le sol renvoie alors
 *                        de la lumière sur les faces verticales, comme sur un vrai fond de studio.
 * @param {number} mood   0 = lumière chaude, 1 = lumière neutre à liseré froid (cuirs noirs et froids).
 */
export function createStudioEnvironment(renderer, floor = 0, mood = 0) {
  const scene = new Scene();
  const disposables = [];
  const mix = (a, b) => a + (b - a) * floor;
  const tone = (r, g, b) => {
    if (!mood) return new Color(r, g, b);
    const m = (r + g + b) / 3; // ambiance neutre : le fond perd l'essentiel de sa dominante chaude
    return new Color(m + (r - m) * 0.3, m + (g - m) * 0.3, m + (b - m) * 0.3);
  };

  // Fond : dégradé sombre (plus clair vers l'horizon et le sol), chaud ou presque neutre.
  const dome = new Mesh(
    new SphereGeometry(40, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: tone(mix(0.012, 0.03), mix(0.01, 0.027), mix(0.009, 0.023)) },
        horizon: { value: tone(mix(0.055, 0.1), mix(0.042, 0.088), mix(0.033, 0.074)) },
        bottom: { value: tone(mix(0.03, 0.52), mix(0.023, 0.47), mix(0.018, 0.395)) },
        ramp: { value: mix(0.6, 1.15) },
      },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform float ramp; varying vec3 vDir; void main() { float y = normalize( vDir ).y; vec3 c = y > 0.0 ? mix( horizon, top, pow( y, 0.55 ) ) : mix( horizon, bottom, pow( - y, ramp ) ); gl_FragColor = vec4( c, 1.0 ); }',
    }),
  );
  dome.renderOrder = -2;
  scene.add(dome);
  disposables.push(dome.geometry, dome.material);

  const place = (mesh, p, w) => {
    const az = p.az * DEG;
    const el = pick(p.el, mood) * DEG;
    mesh.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(10);
    mesh.lookAt(0, 0, 0);
    if (p.roll) mesh.rotateZ(p.roll * DEG);
    mesh.scale.set(w, pick(p.h, mood), 1);
    scene.add(mesh);
  };

  const map = new CanvasTexture(softboxCanvas());
  map.colorSpace = SRGBColorSpace;
  disposables.push(map);
  const plane = new PlaneGeometry(1, 1);
  disposables.push(plane);

  if (floor > 0.5) {
    const flag = new MeshBasicMaterial({ color: 0x030303, alphaMap: map, transparent: true, side: DoubleSide, depthWrite: false, depthTest: false, toneMapped: false });
    disposables.push(flag);
    for (const p of FLAGS) {
      const mesh = new Mesh(plane, flag);
      mesh.renderOrder = -1;
      place(mesh, p, p.w);
    }
  }

  for (const p of PANELS) {
    const material = new MeshBasicMaterial({
      map,
      color: new Color(pick(p.color, mood)).multiplyScalar(pick(p.i, mood)),
      side: DoubleSide,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
      toneMapped: false,
    });
    disposables.push(material);
    place(new Mesh(plane, material), p, pick(p.w, mood));
  }

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0, 0.1, 100, { size: 256 });
  pmrem.dispose();
  for (const d of disposables) d.dispose();
  return target;
}
