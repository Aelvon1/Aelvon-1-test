/** HUD d'exploration : réticule, invite d'interaction, messages. */
import { Key } from '../components/Key';
import { useAppState, useUi } from '../UiContext';

export function Hud() {
  const hud = useAppState((s) => s.hud);
  const { bus } = useUi();
  return (
    <div className="hud">
      <div className={`crosshair${hud.targetActive ? ' active' : ''}`} />
      {hud.prompt && (
        <div className="prompt">
          <Key code="KeyE" /> {hud.prompt}
        </div>
      )}
      {hud.clickToResume && (
        <button className="click-to-resume" onClick={() => bus.emit('app:resume')}>
          Cliquer pour reprendre
        </button>
      )}
    </div>
  );
}

export function Toasts() {
  const toasts = useAppState((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
