/**
 * HUD d'exploration : réticule discret (s'éclaire sur une cible interactive), invite « [E] … »,
 * « Cliquer pour reprendre » quand la souris a été libérée hors pause, radio allumée.
 */
import { useAppState, useUi } from '../UiContext';
import { Key } from '../components/Key';
import { Icon } from '../components/Icon';

export function Hud() {
  const prompt = useAppState((s) => s.hud.prompt);
  const targetActive = useAppState((s) => s.hud.targetActive);
  const clickToResume = useAppState((s) => s.hud.clickToResume);
  const pointerLocked = useAppState((s) => s.hud.pointerLocked);
  const radioOn = useAppState((s) => s.radio.on);
  const station = useAppState((s) => s.radio.stationLabel);
  const { bus } = useUi();
  const showResume = clickToResume && !pointerLocked;
  return (
    <div className="hud">
      <div className={`crosshair${targetActive ? ' is-active' : ''}`} aria-hidden="true">
        <i className="crosshair-dot" />
        <i className="crosshair-ring" />
      </div>
      <div className="prompt-slot" aria-live="polite">
        {prompt && (
          <div className="prompt" key={prompt}>
            <Key code="KeyE" />
            <span>{prompt}</span>
          </div>
        )}
      </div>
      {showResume && (
        <button type="button" className="click-to-resume paper" onClick={() => bus.emit('app:resume')}>
          <span className="tape top-center" aria-hidden="true" />
          <Icon name="target" /> Cliquer pour reprendre
        </button>
      )}
      {radioOn && station && (
        <div className="radio-tag dymo is-black" aria-live="polite">
          <Icon name="radio" /> {station}
        </div>
      )}
    </div>
  );
}
