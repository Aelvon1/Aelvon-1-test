import { describe, expect, it } from 'vitest';
import { activeSectionId } from './useActiveSection';

// Les mentions légales, sections empilées : hauteurs relevées sur la page (px).
const HEIGHTS = [
  ['editeur', 614],
  ['publication', 244],
  ['hebergement', 351],
  ['propriete', 486],
  ['donnees', 670],
];
const LANDING = 92;

/** Les sections telles que l'écran les voit quand `id` vient d'être rejointe par son ancre. */
function landedOn(id, offset = 0) {
  const index = HEIGHTS.findIndex(([name]) => name === id);
  let top = LANDING + offset - HEIGHTS.slice(0, index).reduce((sum, [, height]) => sum + height, 0);
  return HEIGHTS.map(([name, height]) => {
    const section = { id: name, top, height };
    top += height;
    return section;
  });
}

describe('section en cours de lecture', () => {
  it('retient la dernière section dont le haut a franchi la ligne de lecture', () => {
    const sections = [
      { id: 'a', top: -900, height: 1000 },
      { id: 'b', top: 100, height: 1000 },
      { id: 'c', top: 1100, height: 1000 },
    ];
    expect(activeSectionId(sections, { viewport: 900, line: 0.34 })).toBe('b');
    expect(activeSectionId(sections, { viewport: 900, line: 0.1 })).toBe('a');
  });

  it('garde la première section tant qu’aucune n’a atteint la ligne, et ne renvoie rien sans section', () => {
    expect(activeSectionId([{ id: 'a', top: 700, height: 500 }], { viewport: 900 })).toBe('a');
    expect(activeSectionId([], { viewport: 900 })).toBeNull();
  });

  it('marque la section rejointe par son ancre, même plus courte que la ligne de lecture', () => {
    // grand écran : la ligne (34 % de 1080 px = 367 px) passe sous le haut de la section suivante (92 + 244 = 336 px)
    for (const viewport of [800, 900, 1080, 1440, 2160]) {
      for (const [id] of HEIGHTS) {
        expect(activeSectionId(landedOn(id), { viewport, landing: LANDING }), `${id} à ${viewport} px`).toBe(id);
      }
    }
  });

  it('tolère une arrivée au pixel près', () => {
    expect(activeSectionId(landedOn('publication', 1), { viewport: 1440, landing: LANDING })).toBe('publication');
    expect(activeSectionId(landedOn('publication', -1), { viewport: 1440, landing: LANDING })).toBe('publication');
  });

  it('laisse la ligne de lecture à sa place quand les sections sont assez hautes', () => {
    const sections = [
      { id: 'a', top: -400, height: 700 },
      { id: 'b', top: 300, height: 700 },
    ];
    // 34 % de 900 px = 306 px : « b » a franchi la ligne, avec ou sans ancres
    expect(activeSectionId(sections, { viewport: 900 })).toBe('b');
    expect(activeSectionId(sections, { viewport: 900, landing: LANDING })).toBe('b');
  });

  it('sans ancres, suit la seule ligne de lecture', () => {
    expect(activeSectionId(landedOn('publication'), { viewport: 1080, line: 0.55 })).toBe('hebergement');
  });
});
