import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToday } from './useToday';

const ymd = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];
const FRIDAY_EVENING = new Date(2026, 10, 13, 22, 0);
const MONDAY_MORNING = new Date(2026, 10, 16, 9, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FRIDAY_EVENING);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useToday', () => {
  it('donne la date du jour', () => {
    const { result } = renderHook(() => useToday());
    expect(ymd(result.current)).toEqual([2026, 11, 13]);
  });

  it('suit le changement de jour d’un onglet resté ouvert', () => {
    const { result } = renderHook(() => useToday());
    vi.setSystemTime(MONDAY_MORNING);
    expect(ymd(result.current)).toEqual([2026, 11, 13]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(ymd(result.current)).toEqual([2026, 11, 16]);
  });

  it('passe minuit', () => {
    const { result } = renderHook(() => useToday());
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000);
    });
    expect(ymd(result.current)).toEqual([2026, 11, 14]);
  });

  it.each([
    ['visibilitychange', () => document],
    ['focus', () => window],
    ['pageshow', () => window],
  ])('se met à jour dès le retour sur l’onglet (%s)', (type, target) => {
    const { result } = renderHook(() => useToday());
    vi.setSystemTime(MONDAY_MORNING);
    act(() => {
      target().dispatchEvent(new Event(type));
    });
    expect(ymd(result.current)).toEqual([2026, 11, 16]);
  });

  it('garde la même valeur tant que le jour ne change pas : aucun rendu inutile', () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useToday();
    });
    const first = result.current;
    const before = renders;
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe(first);
    expect(renders).toBe(before);
  });

  it('cesse toute surveillance au démontage', () => {
    const { result, unmount } = renderHook(() => useToday());
    unmount();
    vi.setSystemTime(MONDAY_MORNING);
    act(() => {
      vi.advanceTimersByTime(5000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(ymd(result.current)).toEqual([2026, 11, 13]);
  });
});
