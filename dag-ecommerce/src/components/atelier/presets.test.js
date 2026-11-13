import { describe, expect, it } from 'vitest';
import { BUCKLES, DEFAULT_BELT, LEATHERS, STITCHES, beltConfigKey } from '../../data/atelier';
import { cleanConfig, sameLook } from './atelier-state';
import { HARMONIES, PRESETS, applyLook, matchPreset, surpriseBelt } from './presets';
import { BLANK_POSTER, stagePoster } from './stage-poster';

/** Générateur déterministe (mulberry32). */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('PRESETS', () => {
  it('propose cinq ou six compositions, toutes valides et distinctes', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(PRESETS.length).toBeLessThanOrEqual(6);
    const keys = PRESETS.map((preset) => beltConfigKey(preset.config));
    expect(new Set(keys).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length);
    for (const preset of PRESETS) {
      // aucune valeur corrigée par la normalisation : tous les ids existent
      expect(cleanConfig(preset.config)).toMatchObject(preset.config);
      expect(preset.name).toBeTruthy();
    }
  });

  it('ne reprend pas la ceinture par défaut', () => {
    expect(matchPreset(DEFAULT_BELT)).toBeNull();
  });
});

describe('applyLook', () => {
  it('garde le monogramme saisi', () => {
    const current = { ...DEFAULT_BELT, monogram: 'DAG', monogramStyle: 'argent' };
    const next = applyLook(current, PRESETS[0].config);
    expect(next).toMatchObject({ ...PRESETS[0].config, monogram: 'DAG', monogramStyle: 'argent' });
    expect(matchPreset(next)).toBe(PRESETS[0]);
  });
});

describe('HARMONIES', () => {
  it('couvre chaque cuir avec des ids connus', () => {
    const buckles = BUCKLES.map((entry) => entry.id);
    const stitches = STITCHES.map((entry) => entry.id);
    for (const leather of LEATHERS) {
      const harmony = HARMONIES[leather.id];
      expect(harmony, leather.id).toBeDefined();
      expect(harmony.buckles.length).toBeGreaterThan(0);
      expect(harmony.stitches.length).toBeGreaterThan(0);
      for (const id of harmony.buckles) expect(buckles).toContain(id);
      for (const id of harmony.stitches) expect(stitches).toContain(id);
    }
  });
});

describe('surpriseBelt', () => {
  it('change toujours de composition et respecte les accords', () => {
    const random = seeded(2026);
    let current = cleanConfig({ ...DEFAULT_BELT, monogram: 'AB', monogramStyle: 'or' });
    for (let i = 0; i < 400; i += 1) {
      const next = surpriseBelt(current, random);
      expect(sameLook(next, current)).toBe(false);
      expect(next.leather).not.toBe(current.leather);
      expect(cleanConfig(next)).toEqual(next);
      const harmony = HARMONIES[next.leather];
      expect(harmony.buckles).toContain(next.buckle);
      if (next.stitch === 'or') expect(next.buckle).toBe('laiton');
      else expect(harmony.stitches).toContain(next.stitch);
      expect(next).toMatchObject({ monogram: 'AB', monogramStyle: 'or', lining: null });
      current = next;
    }
  });

  it('reste dans les bornes aux extrêmes du générateur', () => {
    expect(() => surpriseBelt(DEFAULT_BELT, () => 0)).not.toThrow();
    const top = surpriseBelt(DEFAULT_BELT, () => 0.999999);
    expect(cleanConfig(top)).toEqual(top);
    // un générateur fautif (1 inclus) ne sort pas des listes
    expect(cleanConfig(surpriseBelt(DEFAULT_BELT, () => 1)).leather).not.toBe(DEFAULT_BELT.leather);
  });

  it('explore plusieurs cuirs', () => {
    const random = seeded(7);
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(surpriseBelt(DEFAULT_BELT, random).leather);
    expect(seen.size).toBe(LEATHERS.length - 1);
  });
});

describe('stagePoster', () => {
  it('ne montre le rendu sombre que pour la ceinture par défaut', () => {
    expect(stagePoster(DEFAULT_BELT, 'noir')).toMatch(/renders\/poster-atelier\.webp$/);
    expect(stagePoster({ ...DEFAULT_BELT, leather: 'noir' }, 'noir')).toBeNull();
    expect(stagePoster({ ...DEFAULT_BELT, monogram: 'D' }, 'noir')).toBeNull();
  });

  it('reprend un visuel studio du catalogue sur ivoire quand la composition y figure', () => {
    expect(stagePoster(DEFAULT_BELT, 'ivoire')).toMatch(/renders\/essential-cognac-studio\.webp$/);
    expect(stagePoster({ ...DEFAULT_BELT, leather: 'noir' }, 'ivoire')).toMatch(/renders\/essential-noir-studio\.webp$/);
    expect(stagePoster({ ...DEFAULT_BELT, leather: 'foret', stitch: 'rouge' }, 'ivoire')).toBeNull();
    expect(stagePoster({ ...DEFAULT_BELT, monogram: 'D' }, 'ivoire')).toBeNull();
  });

  it('fournit une image d’attente transparente', () => {
    expect(BLANK_POSTER).toMatch(/^data:image\/gif;base64,/);
  });
});
