/**
 * Point d'entrée : démarre l'application dans le canvas `#scene` et l'interface dans `#ui-root`.
 */
import { App } from './core/App';

const canvas = document.getElementById('scene');
const uiRoot = document.getElementById('ui-root');
if (!(canvas instanceof HTMLCanvasElement) || !uiRoot) {
  throw new Error('Structure HTML inattendue : #scene (canvas) et #ui-root sont requis.');
}
canvas.tabIndex = 0;
void App.boot(canvas, uiRoot);
