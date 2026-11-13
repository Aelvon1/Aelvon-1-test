import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BeltViewer from './BeltViewer';

// Navigateur sans WebGL : BeltCanvas reste sur son image d'attente (data-belt-canvas="poster").
// L'état « prête » est simulé en changeant l'attribut qu'il publie.

const BELT = { leather: 'noir', finish: 'lisse', buckle: 'brosse', stitch: 'ton', width: 35 };

const mount = () => render(<BeltViewer belt={BELT} poster="/renders/essential-noir-studio.webp" alt="DAG Essential, Noir" requested />);
const scene = () => document.querySelector('[data-belt-canvas]');
const hint = () => screen.queryByText('Glissez pour faire tourner');
const framing = () => screen.queryByRole('radiogroup', { name: 'Cadrage' });
const spin = () => screen.queryByRole('button', { name: 'Rotation automatique' });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('matchMedia', (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BeltViewer', () => {
  it('sans scène, n’est qu’une image : ni consigne, ni rotation automatique, ni cadrages', () => {
    mount();
    expect(scene()).toHaveAttribute('data-belt-canvas', 'poster');
    expect(hint()).toBeNull();
    expect(spin()).toBeNull();
    expect(framing()).toBeNull();
    expect(scene().className).not.toMatch(/cursor-grab/);
  });

  it('montre ses commandes quand la scène dessine, et les retire si elle tombe', async () => {
    mount();
    scene().setAttribute('data-belt-canvas', 'loading');
    await waitFor(() => expect(scene()).toHaveAttribute('data-belt-canvas', 'loading'));
    expect(framing()).toBeNull();

    scene().setAttribute('data-belt-canvas', 'ready');
    await waitFor(() => expect(framing()).not.toBeNull());
    expect(hint()).not.toBeNull();
    expect(spin()).not.toBeNull();
    expect(screen.getAllByRole('radio').map((radio) => radio.value)).toEqual(['full', 'boucle', 'cuir', 'couture']);

    // contexte perdu, puis scène démontée
    scene().setAttribute('data-belt-canvas', 'poster');
    await waitFor(() => expect(framing()).toBeNull());
    expect(hint()).toBeNull();
    expect(spin()).toBeNull();
  });
});
