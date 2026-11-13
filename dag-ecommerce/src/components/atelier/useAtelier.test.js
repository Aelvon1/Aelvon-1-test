import { createElement } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BELT } from '../../data/atelier';
import { DRAFT_KEY } from './atelier-state';
import { useAtelier } from './useAtelier';

// Reproduit la coque du site : les pages reçoivent une « location » passée à <Routes location>,
// ce qui masque le type de navigation réel (toujours « POP » vu de la page).
function Shell({ children }) {
  const location = useLocation();
  return createElement(Routes, { location }, createElement(Route, { path: '/atelier', element: children }));
}

const wrapperAt = (entry) =>
  function Wrapper({ children }) {
    return createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Shell, null, children));
  };

const useProbe = () => ({ atelier: useAtelier(), location: useLocation(), navigate: useNavigate() });
const mount = (entry = '/atelier') => renderHook(useProbe, { wrapper: wrapperAt(entry) }).result;
const wait = (ms) => act(() => vi.advanceTimersByTime(ms));
const draft = () => JSON.parse(window.localStorage.getItem(DRAFT_KEY));

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAtelier', () => {
  it('ouvre la ceinture décrite par l’URL sans rien écrire', () => {
    const result = mount('/atelier?cuir=bordeaux');
    wait(1000);
    expect(result.current.atelier.config).toEqual({ ...DEFAULT_BELT, leather: 'bordeaux' });
    expect(result.current.location.search).toBe('?cuir=bordeaux');
    expect(draft()).toBeNull();
  });

  it('reprend le brouillon quand l’URL ne dit rien', () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ config: { leather: 'navy', width: 30 }, size: '100', surface: 'ivoire' }));
    const { atelier } = mount().current;
    expect(atelier.config).toMatchObject({ leather: 'navy', width: 30 });
    expect(atelier.size).toBe('100');
    expect(atelier.surface).toBe('ivoire');
  });

  it('écrit l’URL (une fois, en remplacement) et le brouillon après une modification', () => {
    const result = mount('/atelier?utm_source=lettre');
    act(() => result.current.atelier.edit({ leather: 'tan' }));
    act(() => result.current.atelier.edit({ width: 38 }));
    act(() => result.current.atelier.chooseSize(95));
    expect(result.current.location.search).toBe('?utm_source=lettre');
    wait(300);
    expect(result.current.location.search).toBe('?utm_source=lettre&cuir=tan&finition=lisse&boucle=brosse&couture=ton&largeur=38');
    expect(draft()).toMatchObject({ config: { leather: 'tan', width: 38 }, size: '95' });
    // remplacement : un retour arrière ne revient pas sur une étape de la composition
    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toContain('cuir=tan');
  });

  it('ne défait jamais un choix plus récent quand sa propre écriture d’URL arrive en retard', () => {
    const result = mount();
    act(() => result.current.atelier.edit({ leather: 'bordeaux' }));
    wait(300);
    act(() => result.current.atelier.edit({ buckle: 'laiton' }));
    act(() => result.current.atelier.edit({ stitch: 'or' }));
    // une écriture propre plus ancienne se présente après coup
    act(() => result.current.navigate('?cuir=bordeaux&boucle=brosse&couture=ton', { replace: true, state: { atelierWrite: true } }));
    expect(result.current.atelier.config).toMatchObject({ leather: 'bordeaux', buckle: 'laiton', stitch: 'or' });
    wait(300);
    expect(result.current.location.search).toBe('?cuir=bordeaux&finition=lisse&boucle=laiton&couture=or&largeur=35');
    expect(result.current.atelier.config).toMatchObject({ leather: 'bordeaux', buckle: 'laiton', stitch: 'or' });
  });

  it('applique un lien vers une autre composition suivi sans quitter la page', () => {
    const result = mount('/atelier?cuir=noir');
    act(() => result.current.atelier.edit({ buckle: 'poli' }));
    wait(300);
    act(() => result.current.navigate('/atelier?cuir=foret&largeur=30&taille=105'));
    expect(result.current.atelier.config).toMatchObject({ leather: 'foret', width: 30, buckle: 'brosse' });
    expect(result.current.atelier.size).toBe('105');
    // un lien nu vers l'Atelier ne change rien
    act(() => result.current.navigate('/atelier'));
    expect(result.current.atelier.config.leather).toBe('foret');
  });

  it('applique l’entrée rejointe par un retour arrière, même écrite par l’Atelier', () => {
    const result = mount('/atelier?cuir=noir');
    act(() => result.current.atelier.edit({ leather: 'tan' }));
    wait(300);
    const ownKey = result.current.location.key;
    expect(result.current.location.state).toEqual({ atelierWrite: true });
    act(() => result.current.navigate('/atelier?cuir=navy'));
    expect(result.current.atelier.config.leather).toBe('navy');
    // retour arrière du navigateur : l'entrée rejointe porte la clé de notre écriture
    window.history.replaceState({ key: ownKey }, '');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toContain('cuir=tan');
    expect(result.current.atelier.config.leather).toBe('tan');
  });

  it('mémorise la surface de la scène sans toucher à la composition enregistrée', () => {
    const result = mount();
    act(() => result.current.atelier.chooseSurface('ivoire'));
    expect(result.current.atelier.surface).toBe('ivoire');
    expect(draft()).toMatchObject({ surface: 'ivoire', config: null });
  });
});
