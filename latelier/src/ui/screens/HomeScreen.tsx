/** Écran d'accueil : la salle en fond, bouton « Entrer » (capture souris + audio). */
import { useAppState, useUi } from '../UiContext';

export function HomeScreen() {
  const { bus } = useUi();
  const backend = useAppState((s) => s.renderer.backend);
  return (
    <div className="screen home-screen">
      <div className="home-card">
        <h1 className="title">L’Atelier</h1>
        <p className="subtitle">Démonter, comprendre, remonter.</p>
        <button className="btn btn-primary" autoFocus onClick={() => bus.emit('app:enter')}>
          Entrer
        </button>
        <p className="hint">Rendu : {backend === 'webgpu' ? 'WebGPU' : 'WebGL 2 (repli)'}</p>
      </div>
    </div>
  );
}
