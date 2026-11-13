import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { halfThicknessAt, lerp, smoothstep } from './spec';
import { roundedRectPath, superellipse, sweepGeometry } from './sweep';

// ---------------------------------------------------------------------------
// Boucle à ardillon et passant. Géométries rigides, construites une fois par largeur.
//
// Repère local de la boucle : origine au centre de la barrette, X vers la traverse avant
// (à l'opposé de la lanière), Y le long de la barrette, Z vers l'extérieur (côté fleur).
// ---------------------------------------------------------------------------

const SECTION_M = 40;

const NOTCH_HALF = 2.5; // demi-largeur du repos d'ardillon sur la traverse avant
const NOTCH_DEPTH = 0.42;

/**
 * Cadre : rectangle aux coins arrondis, section légèrement bombée ; le côté talon est la barrette
 * ronde. La traverse avant porte un repos creusé où vient se poser la pointe de l'ardillon.
 */
function buildFrame(spec) {
  const hy = spec.frameHalf;
  const Lf = spec.frameLength;
  const { pts, total } = roundedRectPath({
    x0: 0,
    x1: Lf,
    y0: -hy,
    y1: hy,
    radii: [3.6, 5.6, 5.6, 3.6],
    cornerSeg: 24,
    sideStep: 1.6,
  });
  // section : flancs presque droits, dessus et dessous bombés (les reflets roulent au lieu de plaquer)
  const rect = superellipse(SECTION_M, spec.sectionW / 2, spec.sectionT / 2, 3.4);
  const round = superellipse(SECTION_M, spec.barRadius, spec.barRadius, 2);
  const rings = pts.map((p) => {
    let m = 0;
    if (p.corner < 0) m = p.x < 0.01 ? 1 : 0;
    else if (p.corner <= 1) m = 1 - smoothstep(0.1, 0.9, p.corner);
    else if (p.corner >= 3) m = smoothstep(0.1, 0.9, p.corner - 3);
    const section = rect.map((v, i) => lerp(v, round[i], m));
    if (p.corner < 0 && p.x > Lf - 0.01 && Math.abs(p.y) < NOTCH_HALF) {
      // repos de l'ardillon : le dessus de la traverse se creuse en douceur
      const dip = NOTCH_DEPTH * (0.5 + 0.5 * Math.cos((Math.PI * p.y) / NOTCH_HALF));
      for (let i = 1; i < section.length; i += 2) {
        const h = section[i] / (spec.sectionT / 2);
        if (h > 0) section[i] -= dip * h * h;
      }
    }
    // axe « largeur » de la section = normale sortante du contour, dans le plan du cadre
    return { c: [p.x, p.y, 0], b: [-p.ty, p.tx, 0], n: [0, 0, 1], pts: section, u: p.len };
  });
  const geometry = sweepGeometry({ rings, closed: true, closedLength: total });
  geometry.userData.pathLength = total;
  return geometry;
}

/** Ardillon : œillet autour de la barrette + tige légèrement cintrée posée sur la traverse avant. */
function buildProng(spec) {
  const Lf = spec.frameLength;
  const M = 24;
  // Œillet
  const eye = [];
  const eyeR = spec.barRadius + 0.12 + 0.72;
  const SEG = 28;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    eye.push({
      c: [eyeR * ca, 0, eyeR * sa],
      b: [0, 1, 0],
      n: [ca, 0, sa],
      pts: superellipse(M, 1.7, 0.72, 3),
      u: a * eyeR,
    });
  }
  const eyeGeo = sweepGeometry({ rings: eye, closed: true, closedLength: Math.PI * 2 * eyeR });

  // Tige
  const shank = [];
  const xEnd = Lf + 1.5;
  // la pointe repose dans le creux de la traverse, à 0,2 mm du métal
  const tipHalf = 1.05 * 0.72;
  const zRest = spec.sectionT / 2 - NOTCH_DEPTH + 0.2 + tipHalf;
  const N = 34;
  const z = (x) => {
    const t = x / Lf;
    let v = lerp(2.0, zRest, smoothstep(0, 1, t)) + 0.75 * Math.sin(Math.PI * Math.min(1, t)) ** 1.2;
    if (x > Lf) v -= 0.3 * ((x - Lf) / 1.5) ** 2;
    return v;
  };
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = 0.4 + (xEnd - 0.4) * (1 - Math.pow(1 - t, 1.6)); // resserre les anneaux vers la pointe
    const dz = (z(x + 0.05) - z(x - 0.05)) / 0.1;
    const l = Math.hypot(1, dz);
    const taper = lerp(1, 0.72, smoothstep(0.35, 1, x / xEnd));
    const endX = (xEnd - x) / 1.4;
    const round = endX < 1 ? Math.max(0.06, Math.sqrt(1 - (1 - endX) * (1 - endX))) : 1; // bout arrondi
    shank.push({
      c: [x, 0, z(x)],
      b: [0, 1, 0],
      n: [-dz / l, 0, 1 / l],
      pts: superellipse(M, 1.65 * taper * round, 1.05 * taper * round, 2.8),
      u: x,
    });
  }
  const shankGeo = sweepGeometry({ rings: shank, capStart: true, capEnd: true });
  for (const g of [eyeGeo, shankGeo]) g.clearGroups();
  const merged = mergeGeometries([eyeGeo, shankGeo]);
  eyeGeo.dispose();
  shankGeo.dispose();
  return merged;
}

export function buildBuckle(spec) {
  return { frame: buildFrame(spec), prong: buildProng(spec) };
}

/**
 * Passant : bande de cuir en boucle autour de la lanière et de son retour.
 * Repère local : X = tangente de la lanière, Y = largeur, Z = normale côté fleur.
 * Groupes : 0 fleur (extérieur), 1 doublure (intérieur), 2 tranches.
 */
export function buildKeeper(spec) {
  const kt = spec.keeperThickness;
  const kw = spec.keeperWidth;
  const ht = halfThicknessAt(spec, spec.keeperAt);
  const zTop = ht + spec.dome * 0.5 + 1.5 + kt / 2;
  const zBot = -(ht + 2 * spec.htFold + 0.3) - kt / 2;
  const yh = spec.hw + 0.45 + kt / 2;
  const { pts, total } = roundedRectPath({ x0: -yh, x1: yh, y0: zBot, y1: zTop, radii: [2.1, 2.1, 2.1, 2.1], cornerSeg: 8, sideStep: 2.5 });

  // Section de la bande : fleur bombée, tranches à chant plat et arêtes adoucies (comme la lanière).
  const half = kw / 2;
  const e = 0.34;
  const a = half - e;
  const hh = kt / 2;
  const section = [];
  const OUT = 9;
  for (let i = 0; i < OUT; i++) {
    const x = -1 + (2 * i) / (OUT - 1);
    section.push(x * a, hh + 0.22 * (1 - x * x));
  }
  const EDGE = 5;
  const C = Math.SQRT1_2;
  const edge = [
    [e * C, hh - e + e * C],
    [e, hh - e],
    [e, 0],
    [e, -hh + e],
    [e * C, -hh + e - e * C],
  ];
  for (const [dv, h] of edge) section.push(a + dv, h);
  const IN = 5;
  for (let i = 0; i < IN; i++) section.push(a - (2 * a * i) / (IN - 1), -hh);
  for (let i = EDGE - 1; i >= 0; i--) section.push(-a - edge[i][0], edge[i][1]);
  const materialOf = (j) => (j < OUT - 1 ? 0 : j < OUT - 1 + EDGE + 1 ? 2 : j < OUT - 1 + EDGE + 1 + IN - 1 ? 1 : 2);

  const rings = pts.map((p) => ({
    // chemin dans le plan (Y, Z) ; largeur de bande le long de X ; normale sortante (-ty, tx)
    c: [0, p.x, p.y],
    b: [1, 0, 0],
    n: [0, -p.ty, p.tx],
    pts: section,
    u: p.len,
  }));
  return sweepGeometry({ rings, closed: true, closedLength: total, materialOf });
}
