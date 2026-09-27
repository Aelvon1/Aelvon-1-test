/**
 * Montage de l'interface React dans `#ui-root`.
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UiContext, type UiServices } from './UiContext';
import { UiRoot } from './UiRoot';
import './styles.css';

export function mountUi(container: HTMLElement, services: UiServices): Root {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <UiContext.Provider value={services}>
        <UiRoot />
      </UiContext.Provider>
    </StrictMode>,
  );
  return root;
}
