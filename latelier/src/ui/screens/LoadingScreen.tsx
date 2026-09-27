/**
 * Écran de chargement : fiche cartonnée punaisée, progression sur un réglet gradué recouvert
 * de ruban jaune, libellé de l'étape en cours et astuces tournantes.
 */
import { useEffect, useState } from 'react';
import { useAppState } from '../UiContext';
import { formatPercent } from '../logic/format';
import { tipAt } from '../logic/tips';
import { Stamp } from '../components/Stamp';

/** Durée d'affichage d'une astuce (ms). */
const TIP_INTERVAL_MS = 5200;

export function useRotatingTip(): string {
  // Départ pseudo-aléatoire fixé au montage (une autre astuce à chaque chargement).
  const [index, setIndex] = useState(() => Math.floor(Math.random() * 1000));
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => i + 1), TIP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  return tipAt(index);
}

export function ProgressRule({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className="progress-rule"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={formatPercent(value)}
    >
      <div className="progress-rule-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LoadingScreen() {
  const loading = useAppState((s) => s.loading);
  const tip = useRotatingTip();
  return (
    <div className="screen loading-screen">
      <div className="loading-card paper">
        <span
          className="pin"
          style={{ left: '50%', top: '0.7rem', marginLeft: '-0.47rem' }}
          aria-hidden="true"
        />
        <p className="loading-kicker dymo is-black">Atelier de démontage</p>
        <h1 className="brand-title display">L’Atelier</h1>
        {loading.error ? (
          <div className="loading-error" role="alert">
            <Stamp className="loading-error-stamp">Échec</Stamp>
            <p>{loading.error}</p>
            <p className="loading-error-help">
              Essayez un navigateur récent (Chrome, Edge ou Firefox à jour) avec l’accélération matérielle
              activée.
            </p>
          </div>
        ) : (
          <>
            <ProgressRule value={loading.progress} label="Chargement de l’atelier" />
            <div className="loading-status">
              <span className="loading-label type" aria-live="polite">
                {loading.label}
              </span>
              <span className="loading-percent mono">{formatPercent(loading.progress)}</span>
            </div>
            <p className="loading-tip">
              <span className="loading-tip-title">Astuce</span> {tip}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
