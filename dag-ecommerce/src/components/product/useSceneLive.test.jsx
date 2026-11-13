import { useRef, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSceneLive } from './useSceneLive';

/** Bloc qui monte sa scène sur demande, comme BeltViewer ; `state` tient lieu de BeltCanvas. */
function Block({ state }) {
  const ref = useRef(null);
  const live = useSceneLive(ref);
  const [mounted, setMounted] = useState(false);
  return (
    <div ref={ref}>
      <button type="button" onClick={() => setMounted(true)}>
        monter
      </button>
      {mounted ? <div data-belt-canvas={state} /> : null}
      <output>{live ? 'en direct' : 'image'}</output>
    </div>
  );
}

const status = () => screen.getByRole('status').textContent;

describe('useSceneLive', () => {
  it('reste faux tant que la scène n’a pas dessiné (WebGL absent : elle ne quitte jamais « poster »)', async () => {
    const { rerender } = render(<Block state="poster" />);
    expect(status()).toBe('image');
    act(() => screen.getByRole('button').click());
    rerender(<Block state="loading" />);
    await waitFor(() => expect(document.querySelector('[data-belt-canvas="loading"]')).not.toBeNull());
    await act(async () => {});
    expect(status()).toBe('image');
  });

  it('suit la scène : prête, perdue, puis revenue', async () => {
    const { rerender } = render(<Block state="loading" />);
    act(() => screen.getByRole('button').click());
    rerender(<Block state="ready" />);
    await waitFor(() => expect(status()).toBe('en direct'));
    rerender(<Block state="loading" />);
    await waitFor(() => expect(status()).toBe('image'));
    rerender(<Block state="ready" />);
    await waitFor(() => expect(status()).toBe('en direct'));
    rerender(<Block state="poster" />);
    await waitFor(() => expect(status()).toBe('image'));
  });
});
