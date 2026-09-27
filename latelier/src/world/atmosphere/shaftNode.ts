/**
 * Masque TSL du faisceau de la fenêtre (1 = éclairé à travers un carreau, 0 = ombre du mur ou
 * d'un petit bois), avec une pénombre qui s'élargit avec la distance à la vitre (ciel étendu).
 * Partagé par la brume volumétrique, la poussière et le projecteur de lumière du jour.
 */
import { abs, float, smoothstep } from 'three/tsl';
import type { WindowShaft } from './shaft';
import type { FloatNode, Vec3Node } from '../materials/tslNoise';

export interface ShaftSample {
  /** Distance parcourue depuis le plan de la fenêtre le long de la lumière (m). */
  s: FloatNode;
  mask: FloatNode;
}

/**
 * Évalue le masque au point `p` (monde). `softBase`/`softSlope` : largeur de pénombre à la vitre
 * et croissance par mètre.
 */
export function shaftMaskAt(
  p: Vec3Node,
  shaft: WindowShaft,
  softBase = 0.006,
  softSlope = 0.03,
): ShaftSample {
  const [ldx, ldy, ldz] = shaft.dir;
  const s = p.x.sub(shaft.planeX).div(ldx);
  const qy = p.y.sub(s.mul(ldy));
  const qz = p.z.sub(s.mul(ldz));
  const soft = s.mul(softSlope).add(softBase);
  const hw = shaft.barWidth / 2;
  let mask: FloatNode = smoothstep(float(shaft.z[0]), soft.add(shaft.z[0]), qz)
    .mul(smoothstep(float(shaft.z[1]), float(shaft.z[1]).sub(soft), qz))
    .mul(smoothstep(float(shaft.y[0]), soft.add(shaft.y[0]), qy))
    .mul(smoothstep(float(shaft.y[1]), float(shaft.y[1]).sub(soft), qy))
    .mul(smoothstep(-0.01, 0.01, s));
  for (const bz of shaft.barsZ) {
    mask = mask.mul(smoothstep(soft.mul(-0.5).add(hw), soft.mul(0.5).add(hw), abs(qz.sub(bz))));
  }
  for (const by of shaft.barsY) {
    mask = mask.mul(smoothstep(soft.mul(-0.5).add(hw), soft.mul(0.5).add(hw), abs(qy.sub(by))));
  }
  return { s, mask };
}
