/**
 * Brume de l'atelier (nœud `scene.fogNode`, TSL) avec diffusion volumétrique ANALYTIQUE.
 *
 * Appliquée à chaque fragment opaque ou transparent (matériaux `fog = true`) : on connaît le
 * segment caméra → surface, on y intègre la lumière diffusée par les sources :
 * - légère brume homogène (transmittance exponentielle, teinte ambiante chaude/froide) ;
 * - halo de l'ampoule : intégrale exacte de 1/r² le long du segment (formule en arc tangente) ;
 * - tube néon : même intégrale pour trois points répartis sur le tube ;
 * - cône de la lampe loupe : intégrale ponctuelle pondérée par le cône au point le plus proche ;
 * - FAISCEAUX de la fenêtre : intersection exacte du segment avec le prisme lumineux (espace du
 *   faisceau, méthode des dalles), puis marche de 8 pas à l'intérieur seulement, avec l'ombre
 *   des petits bois, une densité bruitée qui dérive lentement et une fonction de phase
 *   anisotrope (Henyey-Greenstein) : les rais sont plus visibles à contre-jour.
 *
 * Approximation : les obstacles (établi, objets) n'ombrent pas la brume de l'ampoule et du néon ;
 * le faisceau de la fenêtre, lui, est limité par la surface visée (le sol, un mur…).
 */
import {
  Fn,
  If,
  Loop,
  abs,
  atan,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  fract,
  length,
  max,
  min,
  mix,
  normalize,
  output,
  positionWorld,
  pow,
  screenCoordinate,
  select,
  smoothstep,
  sqrt,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import type { WorldUniforms } from '../uniforms';
import type { WindowShaft } from './shaft';
import { valueNoise3, type FloatNode, type Vec3Node } from '../materials/tslNoise';

/** Réglages artistiques de la brume (uniformes modifiables en direct). */
export function createFogSettings() {
  return {
    /** Coefficient d'extinction (1/m). */
    density: uniform(0.028),
    /** Teinte ambiante de la brume (éclairée par la pièce). */
    ambient: uniform(new THREE.Color(0.05, 0.043, 0.035)),
    /** Diffusion par l'ampoule, le néon, la lampe, la fenêtre. */
    bulbScatter: uniform(0.0035),
    neonScatter: uniform(0.0016),
    lampScatter: uniform(0.0022),
    windowScatter: uniform(0.17),
    bulbColor: uniform(new THREE.Color(1.0, 0.6, 0.3)),
    neonColor: uniform(new THREE.Color(0.75, 1.0, 0.82)),
    lampColor: uniform(new THREE.Color(0.9, 0.95, 1.0)),
    windowColor: uniform(new THREE.Color(0.55, 0.68, 0.85)),
  };
}

export type FogSettings = ReturnType<typeof createFogSettings>;

/** ∫₀^len dt / (h² + (t − t0)²) : lumière diffusée par une source ponctuelle le long d'un segment. */
function pointInscatter(origin: Vec3Node, dir: Vec3Node, len: FloatNode, light: Vec3Node): FloatNode {
  const toLight = light.sub(origin);
  const t0 = dot(toLight, dir);
  const h = sqrt(max(dot(toLight, toLight).sub(t0.mul(t0)), 0.0004));
  return atan(len.sub(t0).div(h))
    .sub(atan(t0.negate().div(h)))
    .div(h);
}

/** Intervalle [t1, t2] où a + t·b ∈ [lo, hi] (b non nul). */
function slab(a: FloatNode, b: FloatNode, lo: number, hi: number): [FloatNode, FloatNode] {
  const safeB = select(abs(b).lessThan(1e-5), float(1e-5), b);
  const t1 = float(lo).sub(a).div(safeB);
  const t2 = float(hi).sub(a).div(safeB);
  return [min(t1, t2), max(t1, t2)];
}

export function createFogNode(u: WorldUniforms, settings: FogSettings, shaft: WindowShaft): Node<'vec4'> {
  const [ldx, ldy, ldz] = shaft.dir;
  const ld = vec3(ldx, ldy, ldz);
  const steps = 8;

  return Fn(() => {
    const p = positionWorld;
    const c = cameraPosition;
    const ray = p.sub(c);
    const dist = length(ray).toVar();
    const d = ray.div(max(dist, 1e-4)).toVar();
    const haze = u.haze;

    // Brume homogène.
    const transmittance = exp(settings.density.mul(dist).mul(haze).negate());
    const lightsAmbient = u.bulb.mul(0.8).add(u.neon.mul(0.35)).add(0.25);
    let color: Vec3Node = output.rgb
      .mul(transmittance)
      .add(settings.ambient.mul(lightsAmbient).mul(float(1).sub(transmittance)));

    // Halo de l'ampoule et du néon.
    const bulb = pointInscatter(c, d, dist, u.bulbPosition).mul(settings.bulbScatter).mul(u.bulb);
    const neonMid = u.neonStart.add(u.neonEnd).mul(0.5);
    const neonA = mix(u.neonStart, u.neonEnd, 0.12);
    const neonB = mix(u.neonStart, u.neonEnd, 0.88);
    const neon = pointInscatter(c, d, dist, neonA)
      .add(pointInscatter(c, d, dist, neonMid))
      .add(pointInscatter(c, d, dist, neonB))
      .mul(settings.neonScatter.div(3))
      .mul(u.neon);
    // Cône de la lampe loupe : pondéré au point du segment le plus proche de la source.
    const tClosest = clamp(dot(u.lampPosition.sub(c), d), 0, dist);
    const closest = c.add(d.mul(tClosest));
    const inCone = smoothstep(
      u.lampCosAngle,
      u.lampCosAngle.add(0.08),
      dot(normalize(closest.sub(u.lampPosition)), u.lampDirection),
    );
    const lamp = pointInscatter(c, d, dist, u.lampPosition).mul(inCone).mul(settings.lampScatter).mul(u.lamp);
    color = color
      .add(settings.bulbColor.mul(bulb.mul(haze)))
      .add(settings.neonColor.mul(neon.mul(haze)))
      .add(settings.lampColor.mul(lamp.mul(haze)));

    // Faisceaux de la fenêtre (marche limitée au prisme lumineux).
    const shaftLight = float(0).toVar();
    const s0 = c.x.sub(shaft.planeX).div(ldx);
    const ds = d.x.div(ldx);
    const [sa, sb] = slab(s0, ds, 0, 50);
    const [ya, yb] = slab(c.y.sub(s0.mul(ldy)), d.y.sub(ds.mul(ldy)), shaft.y[0], shaft.y[1]);
    const [za, zb] = slab(c.z.sub(s0.mul(ldz)), d.z.sub(ds.mul(ldz)), shaft.z[0], shaft.z[1]);
    const tEnter = max(max(sa, ya), max(za, float(0))).toVar();
    const tExit = min(min(sb, yb), min(zb, dist)).toVar();
    const active = u.volumetrics.mul(haze).mul(u.daylight);
    If(tExit.greaterThan(tEnter).and(active.greaterThan(0.001)), () => {
      const stepLen = tExit.sub(tEnter).div(steps);
      // Bruit de gradient entrelacé (décale les pas d'un pixel à l'autre : pas de bandes).
      const ign = fract(
        float(52.9829189).mul(fract(dot(screenCoordinate, vec3(0.06711056, 0.00583715, 0).xy))),
      );
      Loop(steps, ({ i }) => {
        const t = tEnter.add(float(i).add(ign).mul(stepLen));
        const q = c.add(d.mul(t));
        const s = q.x.sub(shaft.planeX).div(ldx);
        const qy = q.y.sub(s.mul(ldy));
        const qz = q.z.sub(s.mul(ldz));
        // Pénombre croissante avec la distance à la vitre (ciel étendu, pas un soleil ponctuel).
        const soft = s.mul(0.03).add(0.006);
        const hw = shaft.barWidth / 2;
        let mask: FloatNode = smoothstep(float(shaft.z[0]), soft.add(shaft.z[0]), qz)
          .mul(smoothstep(float(shaft.z[1]), float(shaft.z[1]).sub(soft), qz))
          .mul(smoothstep(float(shaft.y[0]), soft.add(shaft.y[0]), qy))
          .mul(smoothstep(float(shaft.y[1]), float(shaft.y[1]).sub(soft), qy));
        for (const bz of shaft.barsZ)
          mask = mask.mul(
            smoothstep(soft.mul(0.5).add(hw), soft.negate().add(hw).max(0), abs(qz.sub(bz))).oneMinus(),
          );
        for (const by of shaft.barsY)
          mask = mask.mul(
            smoothstep(soft.mul(0.5).add(hw), soft.negate().add(hw).max(0), abs(qy.sub(by))).oneMinus(),
          );
        const drift = vec3(u.time.mul(0.045), u.time.mul(-0.012), u.time.mul(0.03));
        const density = valueNoise3(q.mul(2.3).add(drift))
          .mul(0.65)
          .add(valueNoise3(q.mul(6.1).sub(drift)).mul(0.35));
        // Le faisceau « naît » sur les 60 premiers cm (air plus pur contre la vitre froide) :
        // évite un voile uniforme sur la vue extérieure quand on regarde la fenêtre.
        const fade = exp(s.mul(-0.32)).mul(smoothstep(0.05, 0.65, s));
        shaftLight.addAssign(mask.mul(density.mul(0.8).add(0.35)).mul(fade));
      });
      shaftLight.mulAssign(stepLen);
    });
    // Phase de Henyey-Greenstein (g = 0,35) : ≈ 0,4 de profil, ≈ 1,6 à contre-jour.
    const g = 0.35;
    const cosTheta = dot(ld, d.negate());
    const phase = float((1 - g * g) / 0.25)
      .div(pow(float(1 + g * g).sub(cosTheta.mul(2 * g)), 1.5))
      .mul(0.13);
    color = color.add(
      settings.windowColor.mul(shaftLight.mul(phase).mul(settings.windowScatter).mul(active)),
    );
    return vec4(color, output.a);
  })();
}
