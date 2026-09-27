/** Menu pause (Échap en exploration). */
import { useUi } from '../UiContext';

export function PauseMenu() {
  const { bus, store } = useUi();
  return (
    <div className="screen pause-screen">
      <div className="menu-card">
        <h2>Pause</h2>
        <button className="btn btn-primary" autoFocus onClick={() => bus.emit('app:resume')}>
          Reprendre
        </button>
        <button className="btn" onClick={() => store.setState({ overlay: 'settings' })}>
          Réglages
        </button>
        <button className="btn" onClick={() => store.setState({ overlay: 'controls' })}>
          Commandes
        </button>
        <button className="btn" onClick={() => bus.emit('app:home')}>
          Accueil
        </button>
      </div>
    </div>
  );
}
