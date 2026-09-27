/**
 * Tests des réglages : bornes, valeurs corrompues, persistance.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from '../src/core/settings';
import { canTransition } from '../src/core/phases';

describe('réglages', () => {
  it('borne les valeurs et remplace les données invalides', () => {
    const s = sanitizeSettings({
      fov: 150,
      mouseSensitivity: -2,
      quality: 'extrême',
      invertY: 'oui',
      textScale: 1.2,
    });
    expect(s.fov).toBe(100);
    expect(s.mouseSensitivity).toBe(0.1);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.invertY).toBe(false);
    expect(s.textScale).toBe(1.2);
  });

  it('sauvegarde puis relit les réglages', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
    };
    saveSettings({ ...DEFAULT_SETTINGS, fov: 90, headBob: false }, storage);
    expect(loadSettings(storage)).toMatchObject({ fov: 90, headBob: false });
    expect(loadSettings({ getItem: () => '{corrompu' })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('machine à états', () => {
  it('autorise les transitions prévues et refuse les autres', () => {
    expect(canTransition('home', 'exploration')).toBe(true);
    expect(canTransition('exploration', 'inventory')).toBe(true);
    expect(canTransition('inventory', 'transition')).toBe(true);
    expect(canTransition('transition', 'inspection')).toBe(true);
    expect(canTransition('inspection', 'transition')).toBe(true);
    expect(canTransition('loading', 'inventory')).toBe(false);
    expect(canTransition('paused', 'inspection')).toBe(false);
  });
});
