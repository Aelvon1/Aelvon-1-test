/**
 * Préparation / construction de l'objet (`inspection.buildProgress`), affichée pendant la
 * transition vers l'établi comme pendant une reconstruction (changement de paramètres).
 */
import { useAppState } from '../UiContext';
import { formatPercent } from '../logic/format';
import { ProgressRule, useRotatingTip } from '../screens/LoadingScreen';

export function BuildProgress() {
  const progress = useAppState((s) => s.inspection?.buildProgress ?? null);
  const name = useAppState((s) => s.inspection?.objectName ?? '');
  if (progress === null) return null;
  return <BuildCard progress={progress} name={name} />;
}

function BuildCard({ progress, name }: { progress: number; name: string }) {
  const tip = useRotatingTip();
  return (
    <div className="build-progress paper" role="status">
      <span className="tape top-center is-yellow" aria-hidden="true" />
      <p className="build-kicker dymo is-black">Sur l’établi</p>
      <p className="build-title display">{name || 'Préparation de l’objet'}</p>
      <ProgressRule value={progress} label={`Préparation de ${name}`} />
      <p className="build-status">
        <span className="type">{progress < 0.999 ? 'Préparation des pièces…' : 'Mise en place…'}</span>
        <span className="mono">{formatPercent(progress)}</span>
      </p>
      <p className="build-tip">
        <span className="loading-tip-title">Astuce</span> {tip}
      </p>
    </div>
  );
}
