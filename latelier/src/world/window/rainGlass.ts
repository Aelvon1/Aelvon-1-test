/**
 * Vitre de la fenêtre : pluie sur le verre et vue extérieure, entièrement en TSL.
 *
 * Vue extérieure (aucune géométrie, aucune texture) : le rayon de vue qui traverse la vitre est
 * prolongé vers l'ouest et intersecte des PLANS successifs (lointain → proche) portant des
 * silhouettes de conifères et de feuillus ; brume froide croissante avec la distance, bancs de
 * brouillard au pied des arbres, sol détrempé avec flaques, ciel couvert. La parallaxe entre les
 * plans est donc exacte quand on se déplace dans la pièce. Deux plans de pluie battante sont
 * ajoutés devant.
 *
 * Pluie sur la vitre (algorithme propre) :
 * - gouttes posées (deux tailles) : dômes répartis sur une grille aléatoire, qui s'évaporent et
 *   réapparaissent lentement ;
 * - gouttes qui ruissellent par à-coups (adhérence/glissement) le long d'une trajectoire sinueuse,
 *   laissant une traînée claire parsemée de gouttelettes ;
 * - chaque dôme agit comme une lentille : l'image extérieure y est vue INVERSÉE (décalage du
 *   rayon opposé au gradient du dôme), les bords sont assombris (réflexion interne) ;
 * - hors des gouttes et traînées, la vitre mouillée diffuse légèrement (flou angulaire plus fort).
 * La normale perturbée est transmise au modèle d'éclairage : les reflets de l'ampoule et du néon
 * glissent sur les gouttes.
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  cameraViewMatrix,
  clamp,
  exp,
  float,
  floor,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  normalize,
  positionWorld,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  transformNormalByViewMatrix,
  vec2,
  vec3,
} from 'three/tsl';
import type { WorldUniforms } from '../uniforms';
import {
  fbm2,
  hash12,
  hash32,
  valueNoise2,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
} from '../materials/tslNoise';

/** Altitude du terrain extérieur (légèrement en contrebas du sol de l'atelier). */
const GROUND_Y = -0.45;

const MIST = vec3(0.17, 0.215, 0.225);
const TREE_DARK = vec3(0.003, 0.01, 0.007);
const SKY_HORIZON = vec3(0.36, 0.41, 0.44);
const SKY_ZENITH = vec3(0.2, 0.25, 0.3);

interface TreeLayer {
  depth: number;
  spacing: number;
  minHeight: number;
  maxHeight: number;
  seed: number;
  /** Proportion de feuillus (couronne ronde). */
  broadleaf: number;
  /** Probabilité de présence d'un arbre par cellule. */
  presence: number;
}

const LAYERS: readonly TreeLayer[] = [
  { depth: 95, spacing: 5.5, minHeight: 20, maxHeight: 34, seed: 11, broadleaf: 0.15, presence: 0.95 },
  { depth: 42, spacing: 4.6, minHeight: 15, maxHeight: 27, seed: 23, broadleaf: 0.25, presence: 0.9 },
  { depth: 19, spacing: 5.2, minHeight: 11, maxHeight: 21, seed: 37, broadleaf: 0.3, presence: 0.8 },
  { depth: 8.5, spacing: 5.0, minHeight: 12, maxHeight: 18, seed: 53, broadleaf: 0.2, presence: 0.75 },
];

/** Couverture (0..1) d'une rangée d'arbres au point (h, y) du plan, bords adoucis de `soft` (m). */
function treeCoverage(
  h: FloatNode,
  y: FloatNode,
  layer: TreeLayer,
  soft: FloatNode,
  time: FloatNode,
): FloatNode {
  const cell = floor(h.div(layer.spacing));
  let coverage: FloatNode = float(0);
  for (let k = -1; k <= 1; k++) {
    const c = cell.add(k);
    const r = hash32(vec2(c, layer.seed));
    const r2 = hash32(vec2(c.add(71.3), layer.seed + 5));
    const cx = c.add(0.2).add(r.x.mul(0.6)).mul(layer.spacing);
    const height = mix(float(layer.minHeight), float(layer.maxHeight), r.y);
    const rel = y.sub(GROUND_Y).div(height);
    const sway = sin(time.mul(0.55).add(r.z.mul(6.28)))
      .mul(height.mul(0.01))
      .mul(rel.mul(rel));
    const dx = abs(h.sub(cx).sub(sway));
    // Conifère : cône à étages (branches plus larges au bas de chaque étage).
    const tier = fract(rel.mul(float(6).add(r2.x.mul(3))));
    const coneWidth = height.mul(0.2).mul(float(1).sub(rel)).mul(tier.oneMinus().mul(0.3).add(0.7));
    const conifer = smoothstep(soft, soft.negate(), dx.sub(coneWidth)).mul(step(0.07, rel)).mul(step(rel, 1));
    // Feuillu : couronne ronde bosselée.
    const crownY = rel.sub(0.62).div(0.38);
    const bumps = valueNoise2(vec2(h.mul(0.9), y.mul(0.9)).add(r2.yz.mul(50)))
      .mul(0.25)
      .add(0.85);
    const crownWidth = height
      .mul(0.3)
      .mul(sqrt(max(float(1).sub(crownY.mul(crownY)), 0)))
      .mul(bumps);
    const broad = smoothstep(soft, soft.negate(), dx.sub(crownWidth)).mul(step(0.2, rel));
    const isBroad = step(1 - layer.broadleaf, r2.z);
    const crown = mix(conifer, broad, isBroad);
    const trunk = smoothstep(soft, soft.negate(), dx.sub(height.mul(0.012))).mul(step(rel, 0.45));
    const present = step(1 - layer.presence, r.z);
    coverage = max(coverage, max(crown, trunk).mul(present));
  }
  return coverage;
}

/** Couleur de la vue extérieure (linéaire, HDR) pour un rayon partant de `origin` vers `dir`. */
export function exteriorColor(
  origin: Vec3Node,
  dir: Vec3Node,
  blur: FloatNode,
  time: FloatNode,
  full: boolean,
): Vec3Node {
  const outward = max(dir.x.negate(), 0.05);
  const elevation = dir.y.div(length(dir.xz));
  // Ciel couvert : dégradé + nuages lents.
  const skyUV = vec2(dir.z.div(outward), dir.y.div(outward))
    .mul(0.6)
    .add(vec2(time.mul(0.004), 0));
  const clouds = fbm2(skyUV.mul(vec2(1.2, 2.6)), full ? 4 : 2);
  let color: Vec3Node = mix(SKY_HORIZON, SKY_ZENITH, smoothstep(-0.02, 0.6, elevation)).mul(
    clouds.mul(0.22).add(0.88),
  );
  // Colline lointaine noyée dans la brume.
  const ridgeT = float(260).div(outward);
  const ridgeH = origin.z.add(dir.z.mul(ridgeT));
  const ridgeTop = fbm2(vec2(ridgeH.mul(0.008), 3.1), 3)
    .mul(45)
    .add(GROUND_Y + 22);
  const ridgeY = origin.y.add(dir.y.mul(ridgeT));
  const ridge = smoothstep(ridgeTop.add(1.5), ridgeTop.sub(1.5), ridgeY);
  color = mix(color, mix(TREE_DARK, MIST, 0.86), ridge);
  // Sol détrempé (flaques qui reflètent le ciel).
  const groundT = select(
    dir.y.lessThan(-0.001),
    origin.y.sub(GROUND_Y).div(max(dir.y.negate(), 1e-4)),
    float(1e5),
  );
  const gp = origin.add(dir.mul(min(groundT, 1e4)));
  const puddles = smoothstep(0.58, 0.64, fbm2(gp.xz.mul(0.35), 3)).mul(0.6);
  const grass = mix(vec3(0.012, 0.022, 0.014), vec3(0.03, 0.028, 0.022), valueNoise2(gp.xz.mul(1.7)));
  const groundBase = mix(grass, SKY_HORIZON.mul(0.4), puddles);
  const groundFog = float(1).sub(exp(groundT.mul(-0.03)));
  const ground = mix(groundBase, MIST, groundFog);
  color = select(groundT.lessThan(1e4), ground, color);
  // Rangées d'arbres, du fond vers l'avant.
  const layers = full ? LAYERS : [LAYERS[0]!, LAYERS[2]!];
  for (const layer of layers) {
    const t = float(layer.depth).div(outward);
    const q = origin.add(dir.mul(t));
    const soft = blur.mul(t).add(t.mul(0.0015)).add(0.01);
    const coverage = treeCoverage(q.z, q.y, layer, soft, time).mul(step(t, groundT));
    const fog = float(1).sub(exp(t.mul(-0.0065)));
    const lowMist = smoothstep(5, 0, q.y.sub(GROUND_Y))
      .mul(0.4)
      .mul(float(1).sub(exp(t.mul(-0.06))));
    const layerColor = mix(TREE_DARK, MIST, clamp(fog.add(lowMist), 0, 1));
    color = mix(color, layerColor, coverage);
  }
  // Pluie battante : deux plans de stries obliques qui tombent.
  const rainPlanes = full ? [1.6, 3.8] : [2.4];
  for (const depth of rainPlanes) {
    const t = float(depth).div(outward);
    const q = origin.add(dir.mul(t));
    const sx = q.z.add(q.y.mul(0.14));
    const colW = 0.014 * (depth / 1.6);
    const col = floor(sx.div(colW));
    const cu = fract(sx.div(colW)).sub(0.5);
    const hr = hash12(vec2(col, depth * 13));
    const seg = fract(
      q.y
        .add(time.mul(hr.mul(3).add(7)))
        .div(0.8)
        .add(hr.mul(17)),
    );
    const streak = smoothstep(0.16, 0.0, abs(cu))
      .mul(smoothstep(0.0, 0.04, seg))
      .mul(smoothstep(0.3, 0.12, seg))
      .mul(step(0.5, hr));
    color = color.add(vec3(0.5, 0.55, 0.58).mul(streak.mul(0.18)));
  }
  return color;
}

interface DropField {
  /** Décalage de réfraction (unités du dôme : 1 = bord de la goutte). */
  offset: Vec2Node;
  /** Présence d'une goutte (0..1). */
  mask: FloatNode;
  /** Traînée essuyée (verre clair). */
  trail: FloatNode;
}

/** Gouttes posées sur une grille aléatoire, qui s'évaporent et reviennent. */
function staticDrops(uv: Vec2Node, cell: number, density: number, time: FloatNode, seed: number): DropField {
  const q = uv.div(cell);
  const id = floor(q);
  const f = fract(q).sub(0.5);
  const h = hash32(id.add(seed));
  const center = h.xy.sub(0.5).mul(0.55);
  const life = fract(time.mul(0.025).add(h.x.mul(7.3)));
  const alive = step(1 - density, fract(h.z.mul(13.7)))
    .mul(smoothstep(0.0, 0.06, life))
    .mul(smoothstep(1.0, 0.75, life));
  const radius = h.z.mul(0.2).add(0.14).mul(alive);
  const d = f.sub(center);
  const dist = length(d);
  const mask = smoothstep(radius, radius.mul(0.7), dist);
  const offset = d.div(max(radius, 1e-3)).mul(mask);
  return { offset, mask, trail: float(0) };
}

/** Gouttes qui ruissellent par à-coups en colonnes, avec traînée et gouttelettes. */
function runningDrops(
  uv: Vec2Node,
  time: FloatNode,
  colWidth: number,
  tileHeight: number,
  seed: number,
): DropField {
  const colId = floor(uv.x.div(colWidth));
  const colU = fract(uv.x.div(colWidth)).sub(0.5);
  const hc = hash32(vec2(colId, seed));
  const vOff = uv.y.div(tileHeight).add(hc.x);
  const tileId = floor(vOff);
  const tv = fract(vOff);
  const ht = hash32(vec2(colId.add(seed * 3.1), tileId));
  // Progression par à-coups : 4 glissements par traversée de tuile.
  const speed = ht.x.mul(0.08).add(0.05);
  const steps = time.mul(speed).add(ht.y.mul(10)).mul(4);
  const progress = fract(
    floor(steps)
      .add(smoothstep(0.0, 0.35, fract(steps)))
      .div(4),
  );
  const dropV = float(0.95).sub(progress.mul(0.9));
  const path = (v: FloatNode): FloatNode =>
    sin(v.mul(23).add(ht.z.mul(6.28)))
      .mul(0.16)
      .add(sin(v.mul(57).add(ht.x.mul(3))).mul(0.05));
  const aspect = tileHeight / colWidth;
  const dx = colU.sub(path(tv));
  const dy = tv.sub(dropV).mul(aspect);
  const active = step(0.3, ht.z);
  const radius = ht.y.mul(0.08).add(0.15);
  // Goutte légèrement étirée vers le bas (poids).
  const dyShaped = dy.mul(select(dy.lessThan(0), float(0.78), float(1.12)));
  const dist = length(vec2(dx, dyShaped));
  const dropMask = smoothstep(radius, radius.mul(0.72), dist).mul(active);
  // Traînée au-dessus de la goutte.
  const above = tv.sub(dropV);
  const trailLen = ht.x.mul(0.3).add(0.22);
  const trailFade = smoothstep(trailLen, 0.0, above).mul(step(0.0, above)).mul(active);
  const trailWidth = trailFade.mul(0.06).add(0.005);
  const trail = smoothstep(trailWidth, trailWidth.mul(0.4), abs(dx)).mul(trailFade);
  // Gouttelettes abandonnées le long de la traînée.
  const beadPitch = 0.008 / tileHeight;
  const beadCell = floor(tv.div(beadPitch));
  const beadV = fract(tv.div(beadPitch))
    .sub(0.5)
    .mul(beadPitch * aspect);
  const beadOn = step(0.55, hash12(vec2(beadCell, colId.add(seed))));
  const beadR = trailFade.mul(0.07);
  const beadD = length(vec2(dx, beadV));
  const bead = smoothstep(beadR, beadR.mul(0.5), beadD).mul(beadOn).mul(trailFade);
  const offset = vec2(dx, dyShaped)
    .div(radius)
    .mul(dropMask)
    .add(vec2(dx, beadV).div(max(beadR, 1e-3)).mul(bead).mul(0.5));
  return { offset, mask: clamp(dropMask.add(bead), 0, 1), trail };
}

export interface RainGlassOptions {
  /** Qualité complète (gouttes qui ruissellent, 4 plans d'arbres) ou simplifiée. */
  full: boolean;
}

/** Matériau de la vitre (opaque : la vue extérieure est calculée dans le shader). */
export function createRainGlassMaterial(
  u: WorldUniforms,
  options: RainGlassOptions,
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0 });
  const time = u.time;
  const p = positionWorld;
  const dir = normalize(p.sub(cameraPosition));
  // Coordonnées de la vitre (m) : horizontale = z, verticale = y.
  const uv = vec2(p.z, p.y);
  // Niveau de détail : taille d'un pixel sur la vitre (m). Les gouttes plus petites que
  // quelques pixels s'effacent au profit d'un flou moyen (sinon : bruit et scintillement).
  const pixel = max(fwidth(uv.x), fwidth(uv.y));
  const lodLarge = smoothstep(4.0, 9.0, float(0.0058).div(pixel));
  const lodSmall = smoothstep(4.0, 9.0, float(0.0024).div(pixel));
  const lodRunning = smoothstep(2.0, 5.0, float(0.009).div(pixel));
  const a = staticDrops(uv, 0.0058, 0.36, time, 0);
  const b = staticDrops(uv.add(vec2(0.37, 0.11)), 0.0024, 0.32, time.add(13), 7);
  let offset: Vec2Node = a.offset.mul(lodLarge.mul(0.7)).add(b.offset.mul(lodSmall.mul(0.35)));
  let mask: FloatNode = clamp(a.mask.mul(lodLarge).add(b.mask.mul(lodSmall.mul(0.7))), 0, 1);
  let trail: FloatNode = float(0);
  if (options.full) {
    const r1 = runningDrops(uv, time, 0.03, 0.32, 1);
    const r2 = runningDrops(uv.add(vec2(0.013, 0.07)), time.mul(1.13), 0.043, 0.37, 4);
    offset = offset.add(r1.offset.add(r2.offset).mul(lodRunning));
    mask = clamp(mask.add(r1.mask.add(r2.mask).mul(lodRunning)), 0, 1);
    trail = clamp(r1.trail.add(r2.trail), 0, 1).mul(lodRunning.mul(0.7).add(0.3));
  }
  const clear = clamp(trail.add(mask), 0, 1);
  // Réfraction : image inversée dans les dômes (décalage opposé au gradient).
  const kappa = 0.08;
  const refracted = normalize(dir.sub(vec3(0, offset.y.mul(kappa), offset.x.mul(kappa))));
  const blur = mix(float(0.011), float(0.0022), clear);
  const outside = exteriorColor(p, refracted, blur, time, options.full);
  const rim = smoothstep(0.55, 1.0, length(offset)).mul(mask);
  // Voile de la vitre mouillée (diffusion) hors des traînées.
  const veil = float(1).sub(clear).mul(0.06);
  // Les gouttes renvoient une partie de la lumière (image plus sombre), bords assombris.
  const dropShade = float(1).sub(rim.mul(0.6)).sub(mask.mul(0.12));
  const transmitted = mix(outside.mul(dropShade), MIST, veil);
  m.colorNode = vec3(0.004, 0.005, 0.005);
  m.emissiveNode = transmitted.mul(u.daylight.mul(1.75));
  m.roughnessNode = mix(float(0.16), float(0.03), clear);
  // Normale : dômes des gouttes (normale de la vitre = +X).
  const bend = mask.mul(0.8);
  const nWorld = normalize(vec3(1, offset.y.mul(bend), offset.x.mul(bend)));
  m.normalNode = transformNormalByViewMatrix(nWorld, cameraViewMatrix);
  return m;
}
