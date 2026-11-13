// ---------------------------------------------------------------------------
// Cotes de la ceinture DAG, en millimètres. Tout le modèle procédural en découle.
// ---------------------------------------------------------------------------

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Largeur de référence : sert au cadrage, identique pour toutes les variantes. */
export const REFERENCE_WIDTH = 38;

/**
 * Cotes dérivées de la largeur de lanière.
 * `s` désigne l'abscisse le long de la lanière, 0 à la barrette de boucle, `length` à la pointe.
 * `sigma` est l'abscisse du balayage complet (retour de boucle compris) : sigma = sigma0 + s.
 */
export function beltSpec(widthMm = 35) {
  const W = widthMm;
  const hw = W / 2;
  const length = 1085; // barrette → pointe (taille 95)
  const tipLength = Math.round(W * 0.92);
  const tipRadius = (tipLength * tipLength + hw * hw) / (2 * hw); // arcs de la pointe anglaise

  const barRadius = 1.7;
  const htMain = 1.9; // demi-épaisseur courante (3,8 mm)
  const htFold = 1.4; // retour parfilé (2,8 mm)
  const foldRadius = barRadius + htFold + 0.15; // rayon de la fibre neutre autour de la barrette
  const tailLength = 52;
  const foldLength = Math.PI * foldRadius;
  const sigma0 = tailLength + foldLength;

  // Boucle
  const sectionW = 4.4;
  const sectionT = 3.8;
  const clear = 1.2; // jeu latéral lanière / cadre
  const frameHalf = hw + clear + sectionW / 2; // demi-largeur à l'axe du cadre
  const frameLength = Math.round((0.6 * W + 9.5) * 10) / 10; // axe barrette → axe traverse avant
  const frameOuterHalf = frameHalf + sectionW / 2;

  // Passant
  const keeperAt = 27;
  const keeperWidth = 9;
  const keeperThickness = 1.5;

  // Monogramme
  const monoHeight = W * 0.5;
  const monoLength = monoHeight * 2.5;
  const monoAt = 90;

  return {
    W,
    hw,
    length,
    tipLength,
    tipRadius,
    tipRound: 2.4,
    htMain,
    htFold,
    edge: 1.15, // rayon horizontal de la tranche arrondie
    dome: 0.42, // bombé de la fleur entre les coutures
    stitchInset: 3.0,
    grooveHalf: 0.55,
    grooveDepth: 0.2,
    stitchPitch: 3.3,
    stitchLength: 2.65,
    barRadius,
    foldRadius,
    foldLength,
    tailLength,
    sigma0,
    sigmaEnd: sigma0 + length,
    holes: [80, 105, 130, 155, 180].map((d) => length - d),
    holeRadius: 2.15,
    slotHalf: 2.45,
    sectionW,
    sectionT,
    frameHalf,
    frameLength,
    frameOuterHalf,
    buckleLift: frameOuterHalf - hw + 0.25,
    keeperAt,
    keeperWidth,
    keeperThickness,
    crossRows: [15.5, 40.5],
    monoHeight,
    monoLength,
    monoAt,
  };
}

/** Demi-largeur de la lanière à l'abscisse s (pointe anglaise arrondie). */
export function halfWidthAt(spec, s) {
  const x = spec.length - s; // distance à l'extrémité
  if (x >= spec.tipLength) return spec.hw;
  if (x <= 0) return 0.05;
  const r = spec.tipRound;
  // Arrondi du sommet : x' ~ sqrt(2 r x) près de la pointe, x' ~ x plus loin.
  const xe = clamp(Math.sqrt(x * (x + 2 * r)) - r * smoothstep(0, 4 * r, x), 0, spec.tipLength);
  const R = spec.tipRadius;
  const d = spec.tipLength - xe;
  return Math.max(0.05, spec.hw - R + Math.sqrt(Math.max(0, R * R - d * d)));
}

/** Décalage latéral de la ligne de couture à l'abscisse s (parallèle au bord, y compris en pointe). */
export function stitchOffsetAt(spec, s) {
  const x = spec.length - s;
  if (x >= spec.tipLength) return spec.hw - spec.stitchInset;
  const R = spec.tipRadius - spec.stitchInset;
  const d = spec.tipLength - x;
  const q = R * R - d * d;
  if (q <= 0) return 0;
  return Math.max(0, spec.hw - spec.tipRadius + Math.sqrt(q));
}

/** Abscisse où les deux lignes de couture se rejoignent sur l'axe, près de la pointe. */
export function stitchApexS(spec) {
  const R = spec.tipRadius - spec.stitchInset;
  const k = spec.tipRadius - spec.hw;
  const d = Math.sqrt(Math.max(0, R * R - k * k));
  return spec.length - spec.tipLength + d;
}

/** Demi-épaisseur de la lanière à l'abscisse s ≥ 0. */
export function halfThicknessAt(spec, s) {
  return lerp(spec.htFold, spec.htMain, smoothstep(4, 30, s));
}
