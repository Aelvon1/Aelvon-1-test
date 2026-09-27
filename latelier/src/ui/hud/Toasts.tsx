/**
 * Messages éphémères (store.toasts) : petites notes de papier, liseré coloré selon le type.
 * Compteur d'images/seconde (réglage « Afficher les images/seconde »).
 */
import { useAppState } from '../UiContext';
import { Icon, type IconName } from '../components/Icon';
import { formatDecimal } from '../logic/format';

const TOAST_ICONS: Record<'info' | 'warning' | 'error' | 'success', IconName> = {
  info: 'info',
  warning: 'warning',
  error: 'warning',
  success: 'check',
};

export function Toasts() {
  const toasts = useAppState((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast paper toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
          <Icon name={TOAST_ICONS[t.kind]} className="toast-icon" />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export function FpsCounter() {
  const show = useAppState((s) => s.settings.showFps);
  const fps = useAppState((s) => s.stats.fps);
  const ms = useAppState((s) => s.stats.frameMs);
  if (!show) return null;
  const level = fps >= 55 ? 'is-good' : fps >= 30 ? 'is-mid' : 'is-bad';
  return (
    <div className={`fps-counter mono ${level}`} aria-hidden="true">
      {Math.round(fps)} i/s <span className="fps-ms">{formatDecimal(ms, 1)} ms</span>
    </div>
  );
}
