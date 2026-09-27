/**
 * Montage de l'interface React dans `#ui-root`.
 *
 * Le garde clavier (`keyboard.ts`) est installé ICI, de façon synchrone, avant que le moteur ne
 * crée ses écouteurs clavier : il passe donc en premier et peut réserver une touche à l'interface.
 */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UiContext, type UiServices } from './UiContext';
import { UiRoot } from './UiRoot';
import { installKeyboardGuard } from './keyboard';
import './styles.css';
import './styles/screens.css';
import './styles/hud.css';
import './styles/inventory.css';
import './styles/inspection.css';

export function mountUi(container: HTMLElement, services: UiServices): Root {
  const removeGuard = installKeyboardGuard(container, services.store);
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <UiContext.Provider value={services}>
        <UiRoot />
      </UiContext.Provider>
    </StrictMode>,
  );
  // Démontage complet : le garde clavier suit la racine React.
  const unmount = root.unmount.bind(root);
  root.unmount = () => {
    removeGuard();
    unmount();
  };
  return root;
}
