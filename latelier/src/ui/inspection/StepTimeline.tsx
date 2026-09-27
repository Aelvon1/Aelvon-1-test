/**
 * Frise des étapes (bas de l'écran) : étiquettes numérotées suspendues à un ruban, statut
 * (à faire / commencée / terminée), curseur (prochaine étape), étape en cours d'animation, icône
 * d'outil et mention destructive. Clic = « aller à » ; ← → / Espace = précédente / suivante.
 * Au-dessus : fiche de l'étape (geste + outil requis) et bascule Pas à pas / Libre.
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import type { StepSummary } from '../../core/store';
import { useAppState, useUi, useUiSound } from '../UiContext';
import { Icon, SvgMarkup } from '../components/Icon';
import { Key } from '../components/Key';
import { Segmented, usePointerFocusProps } from '../components/controls';
import { Stamp } from '../components/Stamp';
import { stepProgress, stepStatusLabel } from '../logic/steps';
import { EMPTY, useInspection } from './hooks';

const StepTicket = memo(function StepTicket({
  step,
  isCursor,
  isPlaying,
  onGoto,
  focusProps,
}: {
  step: StepSummary;
  isCursor: boolean;
  isPlaying: boolean;
  onGoto: (index: number) => void;
  focusProps: ReturnType<typeof usePointerFocusProps>;
}) {
  const classes = ['ticket', `is-${step.status}`];
  if (isCursor) classes.push('is-cursor');
  if (isPlaying) classes.push('is-playing');
  if (step.destructive) classes.push('is-destructive');
  const status = stepStatusLabel(step, isCursor ? step.index : -1, isPlaying ? step.index : null);
  return (
    <li className="ticket-cell">
      <button
        type="button"
        className={classes.join(' ')}
        data-step={step.index}
        aria-current={isCursor ? 'step' : undefined}
        aria-label={`Étape ${step.index + 1} : ${step.title} (${status}${step.destructive ? ', destructive' : ''})`}
        title={`${step.index + 1}. ${step.title}${step.toolName ? ` — ${step.toolName}` : ''}`}
        onClick={() => onGoto(step.index)}
        {...focusProps}
      >
        <span className="ticket-hole" aria-hidden="true" />
        <span className="ticket-num mono" aria-hidden="true">
          {step.index + 1}
        </span>
        <span className="ticket-tool" aria-hidden="true">
          {step.toolIcon ? <SvgMarkup markup={step.toolIcon} /> : <Icon name="hand" />}
        </span>
        {step.status === 'done' && <Icon name="check" className="ticket-check" />}
      </button>
    </li>
  );
});

export function StepTimeline() {
  const { bus } = useUi();
  const { play } = useUiSound();
  const focusProps = usePointerFocusProps();
  const steps = useInspection((s) => s.steps, EMPTY.array as readonly StepSummary[]);
  const cursor = useInspection((s) => s.stepCursor, 0);
  const playing = useInspection((s) => s.playingStep, null);
  const mode = useInspection((s) => s.mode, 'step' as const);
  const busy = useInspection((s) => s.busy, false);
  const activeToolId = useInspection((s) => s.activeToolId, null);
  const labels = useAppState((s) => s.keyLabels);
  const listRef = useRef<HTMLOListElement>(null);

  const progress = stepProgress(steps);
  const shownIndex = playing ?? cursor;
  const current = steps[shownIndex] ?? null;
  const finished = steps.length > 0 && cursor >= steps.length && playing === null;

  // La frise suit le curseur (et l'étape en cours) : défilement horizontal doux.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-step="${Math.min(shownIndex, steps.length - 1)}"]`);
    if (!list || !el) return;
    const target = el.offsetLeft - list.clientWidth / 2 + el.offsetWidth / 2;
    list.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [shownIndex, steps.length]);

  const onGoto = useCallback(
    (index: number) => {
      play('ui.click');
      // Cliquer l'étape courante la joue ; une autre : y aller (curseur placé AVANT elle, les étapes
      // précédentes démontées, les suivantes remontées).
      if (index === cursor) bus.emit('inspection:step', { kind: 'next' });
      else bus.emit('inspection:step', { kind: 'goto', index });
    },
    [bus, play, cursor],
  );
  const step = (kind: 'next' | 'prev') => {
    play('ui.click');
    bus.emit('inspection:step', { kind });
  };

  return (
    <div className="timeline" data-region aria-label="Étapes du démontage" role="region">
      <div className="step-card paper" aria-live="polite">
        {mode === 'free' ? (
          <div className="step-card-body">
            <p className="step-card-kicker dymo is-olive">Démontage libre</p>
            <p className="step-card-title display">Retirez les pièces dans l’ordre de votre choix</p>
            <p className="step-card-text">
              Sélectionnez une pièce puis «&nbsp;Retirer&nbsp;» dans sa fiche. Si elle est bloquée, la fiche
              indique quoi retirer avant.
            </p>
          </div>
        ) : finished ? (
          <div className="step-card-body">
            <p className="step-card-kicker dymo is-olive">Terminé</p>
            <p className="step-card-title display">Démontage complet&nbsp;!</p>
            <p className="step-card-text">
              Toutes les pièces sont sur l’établi. <Key char="K" /> range tout à plat,{' '}
              <Key code="ArrowLeft" /> remonte étape par étape.
            </p>
          </div>
        ) : current ? (
          <div className="step-card-body">
            <p className="step-card-kicker">
              <span className="dymo">
                Étape {current.index + 1}/{steps.length}
              </span>
              {playing !== null && <span className="step-card-live type">en cours…</span>}
              {current.destructive && <Stamp className="step-card-stamp">Destructif</Stamp>}
            </p>
            <p className="step-card-title display">{current.title}</p>
            <p className="step-card-text">{current.description}</p>
            {current.toolName && (
              <p
                className={`step-card-tool${activeToolId && activeToolId === current.toolId ? ' is-active' : ''}`}
              >
                {current.toolIcon ? (
                  <SvgMarkup markup={current.toolIcon} className="tool-icon" />
                ) : (
                  <Icon name="wrench" />
                )}
                <span>
                  Outil requis&nbsp;: <b>{current.toolName}</b>
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="step-card-body">
            <p className="step-card-title display">Préparation des étapes…</p>
          </div>
        )}
      </div>

      <div className="timeline-bar metal-dark">
        <Segmented
          label="Mode de démontage"
          className="timeline-mode"
          value={mode}
          options={[
            { value: 'step', label: 'Pas à pas', title: 'Démontage guidé, étape par étape' },
            { value: 'free', label: 'Libre', title: 'Retirer les pièces dans l’ordre de son choix' },
          ]}
          onChange={(m) => {
            play('ui.click');
            bus.emit('inspection:mode', { mode: m });
          }}
        />
        <button
          type="button"
          className="btn btn-sm timeline-nav"
          onClick={() => step('prev')}
          disabled={progress.done + progress.partial === 0 && playing === null}
          title={`Étape précédente (${labels.ArrowLeft ?? '←'})`}
          {...focusProps}
        >
          <Icon name="prev" />
          <span className="sr-only">Étape précédente</span>
          <Key code="ArrowLeft" />
        </button>
        <ol ref={listRef} className="tickets scroll" aria-label="Frise des étapes">
          {steps.map((s) => (
            <StepTicket
              key={s.id}
              step={s}
              isCursor={s.index === cursor}
              isPlaying={s.index === playing}
              onGoto={onGoto}
              focusProps={focusProps}
            />
          ))}
        </ol>
        <button
          type="button"
          className="btn btn-primary btn-sm timeline-nav"
          onClick={() => step('next')}
          disabled={finished}
          title="Étape suivante (Espace ou →)"
          {...focusProps}
        >
          <Key code="Space" />
          <span>{busy ? 'Suivante…' : 'Suivante'}</span>
          <Icon name="next" />
        </button>
        <div className="timeline-progress" title={`${progress.done} étapes terminées sur ${progress.total}`}>
          <span className="mono">
            {progress.done}/{progress.total}
          </span>
          <span className="timeline-progress-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
          </span>
        </div>
      </div>
    </div>
  );
}
