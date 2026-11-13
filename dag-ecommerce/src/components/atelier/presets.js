// Inspirations de la maison et tirage « Surprenez-moi ». Logique pure, testée dans presets.test.js.
import { FINISHES, LEATHERS, WIDTHS } from '../../data/atelier';
import { cleanConfig, sameLook } from './atelier-state';

/** Compositions proposées par la maison : un nom et les cinq choix de fabrication. */
export const PRESETS = [
  { id: 'soir', name: 'Soir', config: { leather: 'noir', finish: 'lisse', buckle: 'poli', stitch: 'ton', width: 30 } },
  { id: 'marine', name: 'Marine', config: { leather: 'navy', finish: 'graine', buckle: 'brosse', stitch: 'ecru', width: 35 } },
  { id: 'dimanche', name: 'Dimanche', config: { leather: 'tan', finish: 'lisse', buckle: 'antique', stitch: 'ton', width: 38 } },
  { id: 'opera', name: 'Opéra', config: { leather: 'bordeaux', finish: 'lisse', buckle: 'laiton', stitch: 'or', width: 30 } },
  { id: 'sous-bois', name: 'Sous-bois', config: { leather: 'foret', finish: 'mat', buckle: 'noir', stitch: 'ton', width: 35 } },
  { id: 'ardoise', name: 'Ardoise', config: { leather: 'charbon', finish: 'graine', buckle: 'brosse', stitch: 'sans', width: 35 } },
];

/** Applique une composition en gardant le monogramme déjà saisi. */
export function applyLook(current, look) {
  const base = cleanConfig(current);
  return cleanConfig({ ...base, ...look, monogram: base.monogram, monogramStyle: base.monogramStyle });
}

/** L'inspiration qui correspond à la composition en cours, s'il y en a une. */
export const matchPreset = (config) => PRESETS.find((preset) => sameLook(preset.config, config)) ?? null;

// Accords retenus pour le tirage : pour chaque cuir, les boucles et les fils qui lui vont.
// Le fil or n'est proposé qu'avec la boucle en laiton (voir surpriseBelt).
export const HARMONIES = {
  noir: { buckles: ['brosse', 'poli', 'noir', 'laiton'], stitches: ['ton', 'ecru', 'rouge', 'sans'] },
  ebene: { buckles: ['brosse', 'antique', 'laiton'], stitches: ['ton', 'ecru', 'sans'] },
  marron: { buckles: ['brosse', 'antique', 'laiton'], stitches: ['ton', 'ecru', 'sans'] },
  cognac: { buckles: ['brosse', 'poli', 'antique', 'laiton'], stitches: ['ton', 'ecru', 'sans'] },
  tan: { buckles: ['brosse', 'antique', 'laiton'], stitches: ['ton', 'ecru', 'noir', 'sans'] },
  navy: { buckles: ['brosse', 'poli', 'laiton'], stitches: ['ton', 'ecru', 'rouge', 'sans'] },
  charbon: { buckles: ['brosse', 'poli', 'noir'], stitches: ['ton', 'noir', 'rouge', 'sans'] },
  bordeaux: { buckles: ['brosse', 'poli', 'laiton'], stitches: ['ton', 'noir', 'sans'] },
  foret: { buckles: ['brosse', 'antique', 'noir', 'laiton'], stitches: ['ton', 'ecru', 'sans'] },
};

const FALLBACK_HARMONY = { buckles: ['brosse'], stitches: ['ton'] };

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/**
 * Tire une composition harmonieuse, toujours différente de l'actuelle (le cuir change à chaque
 * tirage). Le monogramme saisi est conservé.
 * @param {object} current  configuration en cours
 * @param {() => number} [random]  générateur dans [0, 1[ — injectable pour les tests
 */
export function surpriseBelt(current, random = Math.random) {
  const base = cleanConfig(current);
  const leather = pick(
    LEATHERS.filter((entry) => entry.id !== base.leather),
    random,
  ).id;
  const harmony = HARMONIES[leather] ?? FALLBACK_HARMONY;
  const buckle = pick(harmony.buckles, random);
  const stitches = buckle === 'laiton' ? [...harmony.stitches, 'or'] : harmony.stitches;
  return applyLook(base, {
    leather,
    finish: pick(FINISHES, random).id,
    buckle,
    stitch: pick(stitches, random),
    width: pick(WIDTHS, random).id,
  });
}
