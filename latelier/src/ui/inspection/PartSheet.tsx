/**
 * Fiche de la pièce sélectionnée (panneau droit) : nom, instance (« Tôle n° 37/142 »), rôle,
 * matière, dimensions, référence, « À savoir », lignes supplémentaires, outil, badge destructif,
 * état, bouton Retirer/Remonter (`inspection:toggleRemove`) et « Bloqué par : … » cliquable.
 */
import { useAppState, useUi, useUiSound } from '../UiContext';
import { Icon, SvgMarkup } from '../components/Icon';
import { Stamp } from '../components/Stamp';
import { Key } from '../components/Key';
import { usePointerFocusProps } from '../components/controls';
import { formatInstance, formatQuantity } from '../logic/format';
import { removalAvailability } from '../logic/blockers';

function BlockerChips({ ids, label }: { ids: readonly string[]; label: string }) {
  const { bus } = useUi();
  const names = useAppState((s) => s.inspection?.partStatic);
  const focusProps = usePointerFocusProps();
  return (
    <div className="blockers" role="group" aria-label={label}>
      <span className="blockers-label">
        <Icon name="lock" /> {label}&nbsp;:
      </span>
      <span className="blockers-list">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            className="blocker-chip"
            title="Sélectionner cette pièce"
            onClick={() => {
              bus.emit('inspection:select', { partId: id });
              bus.emit('inspection:frame', { partId: id });
            }}
            onMouseEnter={() => bus.emit('inspection:hover', { partId: id })}
            onMouseLeave={() => bus.emit('inspection:hover', { partId: null })}
            {...focusProps}
          >
            {names?.[id]?.name ?? id}
          </button>
        ))}
      </span>
    </div>
  );
}

export function PartSheet() {
  const { bus } = useUi();
  const { play } = useUiSound();
  const focusProps = usePointerFocusProps();
  const selected = useAppState((s) => s.inspection?.selected ?? null);
  const info = useAppState((s) => (selected ? (s.inspection?.partStatic[selected.partId] ?? null) : null));
  const dyn = useAppState((s) => (selected ? (s.inspection?.parts[selected.partId] ?? null) : null));
  const partStatic = useAppState((s) => s.inspection?.partStatic);
  const parts = useAppState((s) => s.inspection?.parts);
  const dependencies = useAppState((s) => s.inspection?.dependencies);
  const mode = useAppState((s) => s.inspection?.mode ?? 'step');
  const isolatedId = useAppState((s) => s.inspection?.isolatedId ?? null);
  const steps = useAppState((s) => s.inspection?.steps);
  const lastBlocked = useAppState((s) => s.inspection?.blocked ?? null);

  if (!selected || !info || !partStatic || !parts) {
    return (
      <div className="sheet sheet-empty paper">
        <span className="tape top-center" aria-hidden="true" />
        <Icon name="target" className="sheet-empty-icon" />
        <p className="display sheet-empty-title">Aucune pièce sélectionnée</p>
        <p>Cliquez sur une pièce dans la vue ou dans l’arborescence pour afficher sa fiche.</p>
        <p className="sheet-empty-hint">
          Double-clic&nbsp;: cadrer la pièce · <Key char="F" /> cadrer · <Key char="I" /> isoler
        </p>
      </div>
    );
  }

  const availability = removalAvailability(selected.partId, partStatic, parts, dependencies);
  const removed = dyn?.removed ?? false;
  const hidden = dyn?.hidden ?? false;
  const animating = dyn?.animating ?? false;
  const stepIndex = steps?.findIndex((st) => st.partIds.includes(selected.partId)) ?? -1;
  const step = stepIndex >= 0 ? steps![stepIndex]! : null;
  // Dernier blocage signalé par le moteur pour cette pièce (repli si les dépendances manquent).
  const engineBlockers = lastBlocked?.partId === selected.partId ? lastBlocked.blockers : null;
  const instanceText =
    selected.instance !== null && selected.instanceLabel
      ? formatInstance(selected.instanceLabel, selected.instance, info.quantity)
      : null;

  const toggleRemove = () => {
    play('ui.click');
    if (mode === 'step') bus.emit('inspection:mode', { mode: 'free' });
    bus.emit('inspection:toggleRemove', { partId: selected.partId });
  };

  const isBase = availability.kind === 'base';
  const action = isBase ? null : availability.action;
  const blockedNow = availability.kind === 'blocked';

  return (
    <article className="sheet paper" aria-labelledby="sheet-title">
      <span className="tape top-left" aria-hidden="true" />
      <header className="sheet-header">
        <p className="sheet-kicker">
          <span className="dymo is-black">{info.kind === 'assembly' ? 'Sous-ensemble' : 'Pièce'}</span>
          {info.quantity > 1 && <span className="sheet-qty mono">{formatQuantity(info.quantity)}</span>}
        </p>
        <h3 id="sheet-title" className="sheet-title display">
          {info.name}
        </h3>
        {instanceText && <p className="sheet-instance type">{instanceText}</p>}
        <div className="sheet-stamps">
          {removed ? (
            <Stamp tone="olive">Retirée</Stamp>
          ) : (
            <Stamp tone="blue" className="is-faint">
              En place
            </Stamp>
          )}
          {info.destructive && (
            <Stamp title="Le retrait abîme la pièce ou son logement : on ne le fait qu’une fois en vrai.">
              Destructif
            </Stamp>
          )}
          {animating && <span className="sheet-moving type">en mouvement…</span>}
        </div>
      </header>

      {!isBase && (
        <section className="sheet-removal" aria-label="Démontage">
          {step && (
            <p className="sheet-step">
              <span className="sheet-step-num mono">Étape {step.index + 1}</span> {step.title}
            </p>
          )}
          {(step?.toolName || info.toolId) && (
            <p className="sheet-tool">
              {step?.toolIcon ? <SvgMarkup markup={step.toolIcon} className="tool-icon" /> : <Icon name="wrench" />}
              <span>
                Outil&nbsp;: <b>{step?.toolName ?? info.toolId}</b>
              </span>
            </p>
          )}
          {availability.kind === 'blocked' && (
            <BlockerChips
              ids={availability.blockers}
              label={availability.reinsertFirst ? 'Remonter d’abord' : 'Bloqué par'}
            />
          )}
          {availability.kind === 'unknown' && engineBlockers && engineBlockers.length > 0 && (
            <BlockerChips ids={engineBlockers} label="Bloqué par" />
          )}
          <button
            type="button"
            className={`btn btn-block ${blockedNow ? 'btn-ghost is-blocked' : removed ? 'btn-petrol' : 'btn-primary'}`}
            onClick={toggleRemove}
            aria-describedby={blockedNow ? 'sheet-blocked-note' : undefined}
            {...focusProps}
          >
            <Icon name={blockedNow ? 'lock' : removed ? 'reset' : 'cut'} />
            {action === 'reinsert' ? 'Remonter' : 'Retirer'}
            {mode === 'step' && <span className="btn-note">(démontage libre)</span>}
          </button>
          {blockedNow && (
            <p id="sheet-blocked-note" className="sheet-note">
              {availability.reinsertFirst
                ? 'Des pièces montées après elle doivent être remontées avant.'
                : 'Retirez d’abord les pièces indiquées.'}
            </p>
          )}
        </section>
      )}
      <dl className="sheet-facts">
        <div>
          <dt>Rôle</dt>
          <dd>{info.info.role}</dd>
        </div>
        <div>
          <dt>Matière</dt>
          <dd>{info.info.material}</dd>
        </div>
        <div>
          <dt>Dimensions</dt>
          <dd className="type">{info.info.dimensions}</dd>
        </div>
        {info.info.reference && (
          <div>
            <dt>Référence</dt>
            <dd className="mono sheet-ref">{info.info.reference}</dd>
          </div>
        )}
        {info.info.extra?.map((line) => (
          <div key={line.label}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>

      {info.info.tip && (
        <aside className="sheet-tip" aria-label="À savoir">
          <span className="tape top-center is-yellow" aria-hidden="true" />
          <p className="sheet-tip-title display">À savoir</p>
          <p>{info.info.tip}</p>
        </aside>
      )}

      {isBase && <p className="sheet-note">Pièce de base de l’objet&nbsp;: elle ne se retire pas.</p>}

      <footer className="sheet-actions">
        <button
          type="button"
          className="btn btn-ink btn-sm"
          onClick={() => bus.emit('inspection:frame', { partId: selected.partId })}
          {...focusProps}
        >
          <Icon name="frame" /> Cadrer <Key char="F" />
        </button>
        <button
          type="button"
          className={`btn btn-ink btn-sm${isolatedId === selected.partId ? ' is-on' : ''}`}
          aria-pressed={isolatedId === selected.partId}
          onClick={() =>
            bus.emit('inspection:isolate', { partId: isolatedId === selected.partId ? null : selected.partId })
          }
          {...focusProps}
        >
          <Icon name="isolate" /> Isoler <Key char="I" />
        </button>
        <button
          type="button"
          className="btn btn-ink btn-sm"
          aria-pressed={hidden}
          onClick={() => bus.emit('inspection:setHidden', { partId: selected.partId, hidden: !hidden })}
          {...focusProps}
        >
          <Icon name={hidden ? 'eye' : 'eyeOff'} /> {hidden ? 'Afficher' : 'Masquer'} <Key char="H" />
        </button>
      </footer>
    </article>
  );
}
