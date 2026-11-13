import { Link, MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistProvider } from '../../context/WishlistContext';
import Shop from '../../pages/Shop';

// La boutique et un lien de collection placé hors du catalogue, comme ceux du pied de page.
// jsdom ne fait pas de mise en page : la position de la barre d'onglets dans la fenêtre est donnée ici.

let toolbarTop;

function mount(url = '/shop') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <WishlistProvider>
        <Shop />
        <footer>
          <Link to="/shop?collection=matte">Matte (pied de page)</Link>
          <Link to="/shop?collection=inconnue">Inconnue (pied de page)</Link>
        </footer>
      </WishlistProvider>
    </MemoryRouter>,
  );
}

const title = () => document.getElementById('catalogue-titre');
const tab = (name) => within(screen.getByRole('navigation', { name: 'Collections' })).getByRole('link', { name });

beforeEach(() => {
  toolbarTop = 120;
  // défilement de la page (celui qu'on observe) et de la bande d'onglets (absent de jsdom)
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollTo = () => {};
  vi.stubGlobal('matchMedia', (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    top: toolbarTop,
    bottom: toolbarTop + 60,
    left: 0,
    right: 1024,
    width: 1024,
    height: 60,
    x: 0,
    y: toolbarTop,
  }));
});
afterEach(() => {
  delete Element.prototype.scrollTo;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Boutique — changement de collection', () => {
  it('ramène le catalogue à l’écran, focus sur son titre, quand le lien est suivi loin des onglets', () => {
    mount();
    toolbarTop = -1300; // page défilée jusqu'au pied de page
    const link = screen.getByRole('link', { name: 'Matte (pied de page)' });
    link.focus();
    fireEvent.click(link);
    expect(title()).toHaveTextContent('Collection Matte');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(title()).toHaveFocus();
  });

  it('fait de même pour une collection introuvable, et quand les onglets sont sous la fenêtre', () => {
    mount();
    toolbarTop = 900;
    fireEvent.click(screen.getByRole('link', { name: 'Inconnue (pied de page)' }));
    expect(title()).toHaveTextContent('Collection introuvable');
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(title()).toHaveFocus();
  });

  it('laisse le défilement et le focus en place quand un onglet visible est activé', () => {
    mount();
    const link = tab(/^Texture/);
    link.focus();
    fireEvent.click(link);
    expect(title()).toHaveTextContent('Collection Texture');
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(tab(/^Texture/)).toHaveFocus();
  });

  it('ne fait défiler ni à l’arrivée sur une collection, ni au changement de tri', () => {
    toolbarTop = -1300;
    mount('/shop?collection=essential');
    expect(title()).toHaveTextContent('Collection Essential');
    fireEvent.change(screen.getByLabelText('Trier'), { target: { value: 'prix-decroissant' } });
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(title()).not.toHaveFocus();
  });
});
