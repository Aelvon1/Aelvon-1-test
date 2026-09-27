/**
 * Poussière en suspension : sprites instanciés (un seul appel de dessin), position et éclairage
 * calculés sur GPU à partir de l'indice d'instance et du temps (aucune mise à jour CPU).
 *
 * - Répartition : ~45 % dans le faisceau de la fenêtre, ~25 % au-dessus de l'établi, ~15 %
 *   autour de l'ampoule (courant ascendant), le reste dans toute la pièce ;
 * - dérive lente (orbites incommensurables + convection) repliée dans la zone d'origine, avec
 *   fondu aux bords pour masquer le repli ;
 * - éclat : faisceau de la fenêtre (diffusion avant, plus brillant à contre-jour), ampoule,
 *   néon et cône de la lampe loupe ; presque invisible dans l'ombre ;
 * - taille physique 1,2–2,8 mm, bornée à ~1,5 px (l'intensité est réduite d'autant : pas de
 *   scintillement des grains lointains).
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  cos,
  dot,
  exp,
  float,
  fract,
  instanceIndex,
  length,
  max,
  min,
  mix,
  normalize,
  select,
  sin,
  smoothstep,
  uv,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import type { WorldUniforms } from '../uniforms';
import type { WindowShaft } from './shaft';
import { hash11, type FloatNode, type Vec3Node } from '../materials/tslNoise';
import { BENCH, ROOM, SPOTS } from '../layout';

interface Region {
  min: [number, number, number];
  max: [number, number, number];
}

export class Dust {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteNodeMaterial;

  constructor(u: WorldUniforms, shaft: WindowShaft) {
    const material = new THREE.SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    material.fog = false;
    const id = float(instanceIndex);
    const h1 = hash11(id.mul(1.37).add(0.5));
    const h2 = hash11(id.mul(2.71).add(3.1));
    const h3 = hash11(id.mul(0.93).add(7.7));
    const h4 = hash11(id.mul(4.13).add(1.9));
    const h5 = hash11(id.mul(3.37).add(5.3));

    // Zones de répartition.
    const shaftRegion: Region = {
      min: [ROOM.minX + 0.05, 0.15, shaft.z[0] - 0.05],
      max: [0.6, shaft.y[1], shaft.z[1] + 0.75],
    };
    const benchRegion: Region = {
      min: [BENCH.x[0] + 0.05, BENCH.topHeight + 0.05, BENCH.z[0] + 0.08],
      max: [BENCH.x[1] - 0.05, 1.9, BENCH.z[1] + 0.25],
    };
    const [bx, by, bz] = SPOTS.pendantBulb;
    const bulbRegion: Region = {
      min: [bx - 0.7, by - 0.9, bz - 0.7],
      max: [bx + 0.7, ROOM.height - 0.05, bz + 0.7],
    };
    const roomRegion: Region = {
      min: [ROOM.minX + 0.1, 0.1, ROOM.minZ + 0.1],
      max: [ROOM.maxX - 0.1, ROOM.height - 0.1, ROOM.maxZ - 0.1],
    };
    const pick = (f: (r: Region) => [number, number, number]): Vec3Node =>
      select(
        h1.lessThan(0.45),
        vec3(...f(shaftRegion)),
        select(
          h1.lessThan(0.7),
          vec3(...f(benchRegion)),
          select(h1.lessThan(0.85), vec3(...f(bulbRegion)), vec3(...f(roomRegion))),
        ),
      );
    const regionMin = pick((r) => r.min);
    const regionSize = pick((r) => [r.max[0] - r.min[0], r.max[1] - r.min[1], r.max[2] - r.min[2]]);
    const rise = select(h1.lessThan(0.85).and(h1.greaterThanEqual(0.7)), float(0.012), float(-0.0015));

    // Dérive lente : orbites + convection, repliée dans la zone.
    const t = u.time;
    const base = vec3(h2, h3, h4).mul(regionSize);
    const orbit = vec3(
      sin(t.mul(h3.mul(0.23).add(0.07)).add(h4.mul(6.28)))
        .mul(0.06)
        .add(t.mul(0.004)),
      sin(t.mul(h4.mul(0.19).add(0.05)).add(h2.mul(6.28)))
        .mul(0.035)
        .add(t.mul(rise)),
      cos(t.mul(h2.mul(0.21).add(0.06)).add(h3.mul(6.28))).mul(0.06),
    );
    const rel = fract(base.add(orbit).div(regionSize));
    const position = regionMin.add(rel.mul(regionSize));
    const edge = smoothstep(0.0, 0.08, min(min(rel.x, rel.y), rel.z)).mul(
      smoothstep(1.0, 0.92, max(max(rel.x, rel.y), rel.z)),
    );

    // Éclairage de chaque grain (étage des sommets → varying).
    const [ldx, ldy, ldz] = shaft.dir;
    const s = position.x.sub(shaft.planeX).div(ldx);
    const qy = position.y.sub(s.mul(ldy));
    const qz = position.z.sub(s.mul(ldz));
    const soft = s.mul(0.03).add(0.01);
    let inShaft: FloatNode = smoothstep(float(shaft.z[0]), soft.add(shaft.z[0]), qz)
      .mul(smoothstep(float(shaft.z[1]), float(shaft.z[1]).sub(soft), qz))
      .mul(smoothstep(float(shaft.y[0]), soft.add(shaft.y[0]), qy))
      .mul(smoothstep(float(shaft.y[1]), float(shaft.y[1]).sub(soft), qy))
      .mul(smoothstep(-0.01, 0.05, s));
    for (const bz2 of shaft.barsZ)
      inShaft = inShaft.mul(smoothstep(shaft.barWidth * 0.3, shaft.barWidth * 0.7, abs(qz.sub(bz2))));
    for (const by2 of shaft.barsY)
      inShaft = inShaft.mul(smoothstep(shaft.barWidth * 0.3, shaft.barWidth * 0.7, abs(qy.sub(by2))));
    const toCam = normalize(cameraPosition.sub(position));
    const forward = max(dot(toCam, vec3(ldx, ldy, ldz)), 0);
    const phase = forward.mul(forward).mul(forward).mul(3.5).add(0.35);
    const windowLight = vec3(0.55, 0.68, 0.85).mul(
      inShaft
        .mul(exp(s.mul(-0.3)))
        .mul(phase)
        .mul(u.daylight)
        .mul(1.4),
    );
    const toBulb = u.bulbPosition.sub(position);
    const bulbLight = vec3(1.0, 0.62, 0.3).mul(u.bulb.mul(0.05).div(dot(toBulb, toBulb).add(0.04)));
    const toLamp = position.sub(u.lampPosition);
    const lampCone = smoothstep(
      u.lampCosAngle,
      u.lampCosAngle.add(0.1),
      dot(normalize(toLamp), u.lampDirection),
    );
    const lampLight = vec3(0.9, 0.95, 1.0).mul(
      u.lamp.mul(lampCone).mul(0.05).div(dot(toLamp, toLamp).add(0.01)),
    );
    const neonMid = u.neonStart.add(u.neonEnd).mul(0.5);
    const toNeon = neonMid.sub(position);
    const neonLight = vec3(0.75, 1.0, 0.82).mul(u.neon.mul(0.03).div(dot(toNeon, toNeon).add(0.05)));
    const sparkle = sin(t.mul(h5.mul(3).add(1)).add(h2.mul(40)))
      .mul(0.35)
      .add(0.75);

    // Taille : 1,2 à 2,8 mm, au moins ~1,5 px ; intensité compensée.
    const size = mix(float(0.0012), float(0.0028), h5);
    const dCam = length(position.sub(cameraPosition));
    const pixels = size.mul(u.pixelsPerMeter).div(max(dCam, 0.05));
    const minPixels = 1.5;
    const drawSize = size.mul(max(float(minPixels).div(max(pixels, 1e-3)), 1));
    const energy = clamp(pixels.div(minPixels), 0, 1);
    const light = windowLight.add(bulbLight).add(lampLight).add(neonLight);
    const color = varying(light.mul(sparkle).mul(edge).mul(energy.mul(energy)).mul(u.haze).mul(2.2));

    material.positionNode = position;
    material.scaleNode = vec2(drawSize, drawSize);
    const r = length(uv().sub(0.5)).mul(2);
    material.colorNode = color;
    material.opacityNode = smoothstep(1.0, 0.2, r);
    this.material = material;

    this.sprite = new THREE.Sprite(material);
    this.sprite.name = 'Poussière';
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 10;
    this.sprite.count = 1;
  }

  setCount(count: number): void {
    this.sprite.count = Math.max(1, Math.floor(count));
    this.sprite.visible = count > 0;
  }

  dispose(): void {
    // La géométrie des sprites est partagée par three.js : seul le matériau est libéré.
    this.material.dispose();
  }
}
