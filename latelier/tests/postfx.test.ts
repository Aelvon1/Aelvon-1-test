/**
 * Tests de la logique pure du post-traitement : configuration par profil, amortissements
 * indépendants de la cadence, paramètres de mise au point, priorités des contours, grain.
 */
import { describe, expect, it } from 'vitest';
import { QUALITY_PROFILES } from '../src/core/quality';
import {
  MODE_LOOKS,
  aoRadiusFor,
  blockedPulse,
  bokehPixels,
  buildConfigKey,
  computeFocusParams,
  damp,
  grainSeed,
  resolveBuildConfig,
  resolveOutlineKinds,
  type OutlineKind,
} from '../src/render/postLogic';

describe('configuration du graphe par profil', () => {
  it('suit les profils de qualité (MSAA, AO, bloom, DOF, AA, grain)', () => {
    const low = resolveBuildConfig(QUALITY_PROFILES.low);
    expect(low).toMatchObject({
      msaaSamples: 0,
      ao: false,
      bloom: false,
      dof: false,
      antialias: 'fxaa',
      grain: false,
    });
    const high = resolveBuildConfig(QUALITY_PROFILES.high);
    expect(high).toMatchObject({
      msaaSamples: 4,
      ao: true,
      bloom: true,
      dof: true,
      antialias: 'smaa',
      grain: true,
    });
    expect(high.aoResolution).toBeCloseTo(0.75);
    expect(resolveBuildConfig(QUALITY_PROFILES.medium).aoSamples).toBeLessThan(high.aoSamples);
  });

  it('distingue chaque profil par sa clé (reconstruction seulement si nécessaire)', () => {
    const keys = (['low', 'medium', 'high', 'ultra'] as const).map((p) =>
      buildConfigKey(resolveBuildConfig(QUALITY_PROFILES[p])),
    );
    expect(new Set(keys).size).toBe(4);
    expect(buildConfigKey(resolveBuildConfig(QUALITY_PROFILES.high))).toBe(keys[2]);
  });

  it('désactive le MSAA sur le repli WebGL2 (résolution de profondeur défaillante en r186)', () => {
    expect(resolveBuildConfig(QUALITY_PROFILES.ultra, 'webgl2').msaaSamples).toBe(0);
    expect(resolveBuildConfig(QUALITY_PROFILES.ultra, 'webgl2').antialias).toBe('smaa');
    expect(resolveBuildConfig(QUALITY_PROFILES.ultra, 'webgpu').msaaSamples).toBe(4);
  });

  it('borne la résolution de l’AO', () => {
    const config = resolveBuildConfig({ ...QUALITY_PROFILES.high, aoResolution: 3 });
    expect(config.aoResolution).toBe(1);
  });
});

describe('amortissement', () => {
  it('est indépendant de la cadence', () => {
    let at30 = 0;
    let at144 = 0;
    for (let i = 0; i < 30; i++) at30 = damp(at30, 1, 4, 1 / 30);
    for (let i = 0; i < 144; i++) at144 = damp(at144, 1, 4, 1 / 144);
    expect(at30).toBeCloseTo(at144, 6);
    expect(at30).toBeCloseTo(1 - Math.exp(-4), 6);
  });

  it('atteint exactement la cible et ignore un pas nul', () => {
    let v = 0.3;
    for (let i = 0; i < 200; i++) v = damp(v, 0, 5, 0.05);
    expect(v).toBe(0);
    expect(damp(0.5, 1, 5, 0)).toBe(0.5);
  });
});

describe('mise au point de l’inspection', () => {
  it('garde l’objet entier net et floute ce qui est derrière', () => {
    const p = computeFocusParams({ distance: 0.6, radius: 0.12 });
    expect(p.band).toBeGreaterThanOrEqual(0.12);
    // L'assombrissement commence après la zone nette.
    expect(p.dimStart).toBeGreaterThan(p.distance + p.band);
    expect(p.dimEnd).toBeGreaterThan(p.dimStart);
  });

  it('resserre la transition en macro', () => {
    const macro = computeFocusParams({ distance: 0.08, radius: 0.02 });
    const far = computeFocusParams({ distance: 1.2, radius: 0.2 });
    expect(macro.ramp).toBeLessThan(far.ramp);
    expect(macro.ramp).toBeGreaterThanOrEqual(0.06);
  });

  it('réutilise l’objet de sortie (aucune allocation par image)', () => {
    const out = computeFocusParams({ distance: 1, radius: 0.1 });
    const again = computeFocusParams({ distance: 0.5, radius: 0.05 }, out);
    expect(again).toBe(out);
    expect(out.distance).toBe(0.5);
  });

  it('borne les valeurs dégénérées', () => {
    const p = computeFocusParams({ distance: 0, radius: 0 });
    expect(p.distance).toBeGreaterThan(0);
    expect(p.band).toBeGreaterThan(0);
  });

  it('adapte le flou à la résolution et au fondu', () => {
    expect(bokehPixels(1080, 1)).toBeCloseTo(8);
    expect(bokehPixels(2160, 1)).toBeCloseTo(16);
    expect(bokehPixels(1080, 0)).toBe(0);
    expect(bokehPixels(1080, 2)).toBeCloseTo(8);
  });

  it('réduit le rayon d’AO à l’échelle de l’objet en inspection', () => {
    expect(aoRadiusFor('exploration', null)).toBeGreaterThan(0.2);
    expect(aoRadiusFor('inspection', { distance: 0.3, radius: 0.05 })).toBeLessThan(0.05);
    expect(aoRadiusFor('inspection', null)).toBe(aoRadiusFor('home', null));
  });
});

describe('contours', () => {
  const tree: Record<string, string[]> = { group: ['a', 'b'], a: [], b: [], c: [] };
  const expand = (item: string, visit: (leaf: string) => void): void => {
    const children = tree[item] ?? [];
    if (children.length === 0) visit(item);
    for (const child of children) expand(child, visit);
  };

  it('attribue le type le plus prioritaire (bloqué > sélection > survol)', () => {
    const lists: Record<OutlineKind, string[]> = { hover: ['group', 'c'], selected: ['a'], blocked: ['c'] };
    const kinds = resolveOutlineKinds(lists, expand);
    expect(kinds.get('a')).toBe('selected');
    expect(kinds.get('b')).toBe('hover');
    expect(kinds.get('c')).toBe('blocked');
    expect(kinds.has('group')).toBe(false);
  });

  it('vide la carte quand les listes sont vides', () => {
    const out = new Map<string, OutlineKind>([['x', 'hover']]);
    resolveOutlineKinds({ hover: [], selected: [], blocked: [] }, expand, out);
    expect(out.size).toBe(0);
  });

  it('fait pulser le contour bloqué entre 0,45 et 1', () => {
    const samples = Array.from({ length: 200 }, (_, i) => blockedPulse(i / 100));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.45 - 1e-9);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.4);
  });
});

describe('looks et grain', () => {
  it('marque davantage le vignettage à l’accueil', () => {
    expect(MODE_LOOKS.home.vignette).toBeGreaterThan(MODE_LOOKS.exploration.vignette);
    expect(MODE_LOOKS.inspection.grain).toBeLessThan(MODE_LOOKS.exploration.grain);
  });

  it('anime la graine du grain à 24 i/s en restant exacte en flottant 32 bits', () => {
    expect(grainSeed(0)).toBe(grainSeed(1 / 48));
    expect(grainSeed(0)).not.toBe(grainSeed(1 / 24 + 1e-6));
    let max = 0;
    for (let t = 0; t < 20; t += 0.01) max = Math.max(max, grainSeed(t));
    // Graine + coordonnées pixel (≤ 4096 × 4096) < 2^24.
    expect(max + 4096 * 2160 + 4096).toBeLessThan(2 ** 24);
  });
});
