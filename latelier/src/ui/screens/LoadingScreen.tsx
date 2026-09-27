/** Écran de chargement avec barre de progression. */
import { useAppState } from '../UiContext';

export function LoadingScreen() {
  const loading = useAppState((s) => s.loading);
  return (
    <div className="screen loading-screen" role="status" aria-live="polite">
      <div className="loading-card">
        <h1 className="title">L’Atelier</h1>
        {loading.error ? (
          <p className="error">{loading.error}</p>
        ) : (
          <>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${Math.round(loading.progress * 100)}%` }} />
            </div>
            <p className="loading-label">{loading.label}</p>
          </>
        )}
      </div>
    </div>
  );
}
