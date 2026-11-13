import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WishlistProvider, useWishlist } from '../../context/WishlistContext';
import Wishlist from '../../pages/Wishlist';
import { ToastProvider } from '../ui';

// La page des favoris dans sa coque minimale : favoris, notifications, <main> que le focus rejoint.

const KEY = 'dag-wishlist-v1';
const stored = () => JSON.parse(localStorage.getItem(KEY));

/** Compteur tel que l'en-tête le lit. */
function HeaderCount() {
  const { count } = useWishlist();
  return <span data-testid="compteur-en-tete">{count}</span>;
}

function mount(ids) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  return render(
    <MemoryRouter>
      <WishlistProvider>
        <ToastProvider>
          <HeaderCount />
          <main id="contenu" tabIndex={-1}>
            <Wishlist />
          </main>
        </ToastProvider>
      </WishlistProvider>
    </MemoryRouter>,
  );
}

/** Active une commande comme au clavier : elle porte le focus au moment où elle agit. */
function press(element) {
  element.focus();
  fireEvent.click(element);
}

const heart = (name) => screen.getByRole('button', { name: `Ajouter ${name} aux favoris` });
const toastUndo = () => within(screen.getByRole('region', { name: 'Notifications' })).getByRole('button', { name: 'Annuler' });
const removeAll = () => press(screen.getByRole('button', { name: 'Tout retirer' }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Favoris — annuler « Tout retirer »', () => {
  it('rétablit les favoris retirés, dans leur ordre', async () => {
    mount([3, 1]);
    removeAll();
    await waitFor(() => expect(stored()).toEqual([]));
    press(toastUndo());
    await waitFor(() => expect(stored()).toEqual([3, 1]));
  });

  it('ne retire pas un favori remis entre-temps', async () => {
    mount([3, 1]);
    removeAll();
    await waitFor(() => expect(stored()).toEqual([]));
    press(heart('DAG Essential'));
    await waitFor(() => expect(stored()).toEqual([1]));
    press(toastUndo());
    await waitFor(() => expect([...stored()].sort()).toEqual([1, 3]));
  });

  it('ne vide pas la liste quand tout a déjà été remis', async () => {
    mount([1]);
    removeAll();
    await waitFor(() => expect(stored()).toEqual([]));
    press(heart('DAG Essential'));
    await waitFor(() => expect(stored()).toEqual([1]));
    press(toastUndo());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull());
    expect(stored()).toEqual([1]);
  });

  it('propose de rétablir les favoris dans la page vide, à portée de clavier', async () => {
    mount([3, 1]);
    removeAll();
    const restore = await screen.findByRole('button', { name: 'Rétablir vos favoris' });
    press(restore);
    await waitFor(() => expect(stored()).toEqual([3, 1]));
    expect(screen.queryByRole('button', { name: 'Rétablir vos favoris' })).toBeNull();
  });

  it('ne propose plus de rétablir les anciens favoris après un nouvel ajout', async () => {
    mount([3, 1]);
    removeAll();
    await screen.findByRole('button', { name: 'Rétablir vos favoris' });
    press(heart('DAG Essential'));
    await waitFor(() => expect(stored()).toEqual([1]));
    press(heart('DAG Essential'));
    await waitFor(() => expect(stored()).toEqual([]));
    expect(screen.queryByRole('button', { name: 'Rétablir vos favoris' })).toBeNull();
  });
});

describe('Favoris — liste enregistrée abîmée', () => {
  it('n’affiche chaque ceinture qu’une fois et nettoie la liste enregistrée', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    mount([3, 1, 99, 1]);
    await waitFor(() => expect(stored()).toEqual([3, 1]));
    expect(screen.getAllByRole('heading', { level: 2 }).slice(0, 2).map((heading) => heading.textContent)).toEqual(['DAG Texture', 'DAG Essential']);
    expect(screen.getByRole('status').textContent).toBe('2\xa0ceintures');
    expect(screen.getByTestId('compteur-en-tete').textContent).toBe('2');
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    errors.mockRestore();
  });

  it('oublie un modèle sorti du catalogue : page vide, compteur à zéro', async () => {
    mount([99]);
    await waitFor(() => expect(stored()).toEqual([]));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Rien encore.');
    expect(screen.getByTestId('compteur-en-tete').textContent).toBe('0');
  });
});

describe('Favoris — focus quand la vue change', () => {
  const main = () => document.getElementById('contenu');

  it('rejoint le contenu après « Tout retirer », puis après « Rétablir »', async () => {
    mount([3, 1]);
    removeAll();
    await waitFor(() => expect(main()).toHaveFocus());
    press(await screen.findByRole('button', { name: 'Rétablir vos favoris' }));
    await waitFor(() => expect(stored()).toEqual([3, 1]));
    expect(main()).toHaveFocus();
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('rejoint le contenu quand un cœur fait passer de la page vide à la liste, et retour', async () => {
    mount([]);
    press(heart('DAG Essential'));
    await waitFor(() => expect(stored()).toEqual([1]));
    expect(main()).toHaveFocus();
    press(heart('DAG Essential'));
    await waitFor(() => expect(stored()).toEqual([]));
    expect(main()).toHaveFocus();
  });

  it('reste où il est quand il est tenu hors de la page', async () => {
    mount([3, 1]);
    const outside = document.createElement('button');
    document.body.append(outside);
    fireEvent.click(screen.getByRole('button', { name: 'Tout retirer' }));
    outside.focus();
    await waitFor(() => expect(stored()).toEqual([]));
    expect(outside).toHaveFocus();
    outside.remove();
  });
});
