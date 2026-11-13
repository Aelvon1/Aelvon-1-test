import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Lightbox from './Lightbox';

const SHOTS = [
  { id: 'studio', label: 'Vue studio', src: '/renders/a.webp', alt: 'Vue studio' },
  { id: 'boucle', label: 'La boucle', src: '/renders/b.webp', alt: 'La boucle' },
  { id: 'detail', label: 'Le cuir et la couture', src: '/renders/c.webp', alt: 'Le cuir et la couture' },
];
const WIDTH = 1000;

// jsdom ne fait ni mise en page ni défilement : la bande a une largeur fixe, et scrollTo ne fait que
// noter la position demandée — comme un défilement adouci qui vient de partir, `current` n'a pas bougé.
let scrollTo;
beforeEach(() => {
  scrollTo = vi.fn();
  Element.prototype.scrollTo = scrollTo;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH);
});
afterEach(() => {
  delete Element.prototype.scrollTo;
  vi.restoreAllMocks();
});

function mount() {
  render(<Lightbox open onClose={vi.fn()} shots={SHOTS} title="Visuels agrandis" />);
  const dialog = screen.getByRole('dialog', { name: 'Visuels agrandis' });
  return { dialog, track: dialog.querySelector('ul') };
}

/** Le défilement arrive sur le visuel `index` : la bande le signale, le compteur suit. */
function arriveAt(track, index) {
  track.scrollLeft = index * WIDTH;
  fireEvent.scroll(track);
}

const requested = () => scrollTo.mock.calls.map(([options]) => options.left / WIDTH);
const previous = () => screen.getByRole('button', { name: 'Visuel précédent' });
const next = () => screen.getByRole('button', { name: 'Visuel suivant' });

describe('Lightbox — commandes rapprochées', () => {
  it('deux flèches droites coup sur coup mènent au troisième visuel', () => {
    const { dialog } = mount();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(requested()).toEqual([1, 2]);
  });

  it('deux clics rapprochés sur « Visuel suivant » aussi, puis deux sur « Visuel précédent »', () => {
    mount();
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(previous());
    fireEvent.click(previous());
    expect(requested()).toEqual([1, 2, 1, 0]);
  });

  it('ne dépasse pas le dernier visuel', () => {
    const { dialog } = mount();
    for (let press = 0; press < 5; press += 1) fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(requested()).toEqual([1, 2, 2, 2, 2, 1]);
  });

  it('repart de l’endroit où le visiteur a lui-même amené la bande', () => {
    const { dialog, track } = mount();
    fireEvent.keyDown(dialog, { key: 'End' });
    arriveAt(track, 2);
    // retour au deuxième visuel à la molette (ou au doigt) : aucune commande ne l'a demandé
    fireEvent.wheel(track);
    arriveAt(track, 1);
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(requested()).toEqual([2, 0]);
  });
});

describe('Lightbox — commandes aux bornes', () => {
  it('« Visuel précédent » est indisponible sur le premier visuel, sans être désactivé', () => {
    mount();
    expect(previous()).toHaveAttribute('aria-disabled', 'true');
    expect(previous()).toBeEnabled();
    expect(next()).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(previous());
    expect(requested()).toEqual([0]);
  });

  it('« Visuel suivant » garde le focus en devenant indisponible, et les flèches répondent encore', () => {
    const { track } = mount();
    next().focus();
    fireEvent.click(next());
    fireEvent.click(next());
    arriveAt(track, 2);
    expect(screen.getByText('03')).toBeInTheDocument();
    expect(next()).toHaveAttribute('aria-disabled', 'true');
    expect(next()).toBeEnabled();
    expect(next()).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
    expect(requested()).toEqual([1, 2, 1]);
  });
});
