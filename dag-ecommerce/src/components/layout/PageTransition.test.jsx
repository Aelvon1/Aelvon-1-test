import { useEffect, useRef, useState } from 'react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PageTransition from './PageTransition';

// La coque sous MemoryRouter (mode « memory » du site embarqué) : défilement, retour arrière,
// focus et ancres ne s'appuient que sur l'état du routeur, jamais sur l'URL réelle.

function Nav() {
  const navigate = useNavigate();
  return (
    <nav>
      <button type="button" onClick={() => navigate('/b')}>vers B</button>
      <button type="button" onClick={() => navigate('/a?tri=prix')}>paramètres</button>
      <button type="button" onClick={() => navigate('/focus')}>vers focus</button>
      <button type="button" onClick={() => navigate('/tard#cible')}>vers ancre</button>
      <button type="button" onClick={() => navigate(-1)}>retour</button>
    </nav>
  );
}

/** Page qui place elle-même le focus, comme la confirmation de commande. */
function FocusPage() {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1}>
      Page focus
    </h1>
  );
}

/** Page dont la cible de l'ancre n'apparaît qu'après le montage. */
function LatePage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(timer);
  }, []);
  return (
    <>
      <h1>Page tardive</h1>
      {ready ? <section id="cible">Cible</section> : null}
    </>
  );
}

function App({ initialEntries = ['/a'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Nav />
      <main id="contenu" tabIndex={-1}>
        <PageTransition>
          {(location) => (
            <Routes location={location}>
              <Route path="/a" element={<h1>Page A</h1>} />
              <Route path="/b" element={<h1>Page B</h1>} />
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/tard" element={<LatePage />} />
            </Routes>
          )}
        </PageTransition>
      </main>
    </MemoryRouter>
  );
}

const go = (name) => fireEvent.click(screen.getByRole('button', { name }));
const main = () => document.getElementById('contenu');

describe('PageTransition sous MemoryRouter', () => {
  beforeEach(() => {
    // « moins d'animations » : la page sortante s'efface sans délai, les défilements sont immédiats
    vi.stubGlobal('matchMedia', (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }));
    window.scrollY = 0;
    window.scrollTo = vi.fn(({ top }) => {
      window.scrollY = top;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ne défile pas et ne déplace pas le focus au premier affichage', () => {
    render(<App />);
    expect(screen.getByText('Page A')).toBeInTheDocument();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('revient en haut et donne le focus à <main> après un changement de page', async () => {
    render(<App />);
    window.scrollY = 640;
    screen.getByRole('button', { name: 'vers B' }).focus();
    go('vers B');
    await screen.findByText('Page B');
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    await waitFor(() => expect(document.activeElement).toBe(main()));
  });

  it('restaure la position de la page précédente au retour arrière', async () => {
    render(<App />);
    window.scrollY = 640;
    go('vers B');
    await screen.findByText('Page B');
    expect(window.scrollY).toBe(0);
    go('retour');
    await screen.findByText('Page A');
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: 'instant' });
  });

  it('laisse le défilement et le focus en place quand seuls les paramètres changent', async () => {
    render(<App />);
    window.scrollY = 320;
    const button = screen.getByRole('button', { name: 'paramètres' });
    button.focus();
    go('paramètres');
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it('laisse le focus là où la nouvelle page l’a placé', async () => {
    render(<App />);
    go('vers focus');
    const title = await screen.findByText('Page focus');
    await waitFor(() => expect(document.activeElement).toBe(title));
    // rien ne le reprend ensuite
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(document.activeElement).toBe(title);
  });

  it('rejoint une ancre dont la cible se monte après la page, et lui donne le focus', async () => {
    render(<App />);
    window.scrollY = 640;
    go('vers ancre');
    await screen.findByText('Page tardive');
    // en attendant la cible : haut de page, focus sur <main>
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'instant' });
    const target = await screen.findByText('Cible');
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(window.scrollTo.mock.calls.length).toBeGreaterThan(1);
  });

  it('rejoint l’ancre au premier affichage sans déplacer le focus', async () => {
    render(<App initialEntries={['/tard#cible']} />);
    expect(window.scrollTo).not.toHaveBeenCalled();
    await screen.findByText('Cible');
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalled());
    expect(document.activeElement).toBe(document.body);
  });

  it('cesse de chercher l’ancre quand le visiteur a défilé', async () => {
    render(<App initialEntries={['/tard#cible']} />);
    window.scrollY = 200; // le visiteur a repris la main avant que la cible existe
    await screen.findByText('Cible');
    await act(() => new Promise((resolve) => setTimeout(resolve, 80)));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
