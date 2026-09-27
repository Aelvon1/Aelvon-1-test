/**
 * Onglet « Objet » du panneau droit : fiche de l'objet, préréglages et paramètres générés depuis
 * `paramSchema`. Un préréglage s'applique aussitôt ; les réglages manuels sont préparés puis
 * appliqués (`inspection:params` : l'objet est reconstruit, le démontage repart de zéro).
 */
import { useId, useState } from 'react';
import type { ObjectParams, ParamSchema, ParamValue } from '../../objects/types';
import { useAppState, useUi, useUiSound } from '../UiContext';
import { Icon } from '../components/Icon';
import { DifficultyStamp } from '../components/Stamp';
import { SelectField, Slider, Toggle, usePointerFocusProps } from '../components/controls';
import { formatMinutes, formatParamValue, plural } from '../logic/format';
import { changedParams, matchingPreset, snapParam } from '../logic/steps';

function ParamControl({
  schema,
  value,
  onChange,
}: {
  schema: ParamSchema;
  value: ParamValue | undefined;
  onChange: (value: ParamValue) => void;
}) {
  const id = useId();
  let control;
  switch (schema.kind) {
    case 'boolean':
      control = <Toggle id={id} checked={value === true} onChange={onChange} />;
      break;
    case 'select':
      control = (
        <SelectField id={id} value={String(value ?? '')} options={schema.options} onChange={onChange} />
      );
      break;
    case 'number': {
      const n = typeof value === 'number' ? value : schema.min;
      control = (
        <div className="param-number">
          <Slider
            id={id}
            value={n}
            min={schema.min}
            max={schema.max}
            step={schema.step}
            valueText={formatParamValue(schema, n)}
            onChange={(v) => onChange(snapParam(schema, v))}
          />
          <output className="field-value" htmlFor={id}>
            {formatParamValue(schema, n)}
          </output>
        </div>
      );
      break;
    }
  }
  return (
    <div className={`param-row is-${schema.kind}`}>
      <label className="field-label" htmlFor={id}>
        {schema.label}
      </label>
      {control}
      {schema.help && <p className="field-help">{schema.help}</p>}
    </div>
  );
}

/** Contenu de l'onglet (monté avec une clé dépendant des paramètres courants : brouillon réinitialisé). */
export function ObjectPanel() {
  const { bus } = useUi();
  const { play } = useUiSound();
  const focusProps = usePointerFocusProps();
  const objectId = useAppState((s) => s.inspection?.objectId ?? '');
  const objectName = useAppState((s) => s.inspection?.objectName ?? '');
  const params = useAppState((s) => s.inspection?.params);
  const schema = useAppState((s) => s.inspection?.paramSchema);
  const presets = useAppState((s) => s.inspection?.presets);
  const building = useAppState((s) => s.inspection?.buildProgress !== null);
  const entry = useAppState((s) => s.catalog.find((e) => e.id === objectId) ?? null);
  const [draft, setDraft] = useState<ObjectParams>(() => ({ ...(params ?? {}) }));
  const [confirmReset, setConfirmReset] = useState(false);

  if (!params || !schema || !presets) return null;
  const changed = changedParams(schema, draft, params);
  const active = matchingPreset(presets, params);

  const apply = (next: ObjectParams) => {
    play('ui.stamp');
    bus.emit('inspection:params', { params: next });
  };

  return (
    <div className="object-panel">
      <section className="object-card paper">
        <span className="tape top-center" aria-hidden="true" />
        <h3 className="display object-name">{objectName}</h3>
        {entry && (
          <>
            <p className="object-meta">
              <span className="dymo is-black">{entry.category}</span>
              <span className="type">
                {plural(entry.partCount, 'pièce')} · {plural(entry.stepCount, 'étape')} · ≈&nbsp;
                {formatMinutes(entry.estimatedMinutes)}
              </span>
            </p>
            <p className="object-desc">{entry.description}</p>
            <div className="object-stamp">
              <DifficultyStamp level={entry.difficulty} />
            </div>
          </>
        )}
      </section>

      {presets.length > 0 && (
        <section className="object-section" aria-labelledby="presets-title">
          <h3 id="presets-title" className="panel-heading">
            Préréglages
          </h3>
          <ul className="preset-list">
            {presets.map((p) => {
              const isActive = active?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`preset${isActive ? ' is-active' : ''}`}
                    aria-pressed={isActive}
                    disabled={building}
                    onClick={() => apply({ ...params, ...(p.params as ObjectParams) })}
                    {...focusProps}
                  >
                    <span className="preset-check" aria-hidden="true">
                      {isActive && <Icon name="check" />}
                    </span>
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {schema.length > 0 && (
        <section className="object-section" aria-labelledby="params-title">
          <h3 id="params-title" className="panel-heading">
            Paramètres
          </h3>
          <div className="param-list">
            {schema.map((s) => (
              <ParamControl
                key={s.key}
                schema={s}
                value={draft[s.key]}
                onChange={(v) => setDraft((d) => ({ ...d, [s.key]: v }))}
              />
            ))}
          </div>
          <div className="param-apply">
            <button
              type="button"
              className="btn btn-primary"
              disabled={changed.length === 0 || building}
              onClick={() => apply(draft)}
              {...focusProps}
            >
              <Icon name="reset" /> Reconstruire l’objet
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={changed.length === 0}
              onClick={() => setDraft({ ...params })}
              {...focusProps}
            >
              Annuler
            </button>
          </div>
          <p className="field-help">
            {changed.length
              ? `${plural(changed.length, 'paramètre modifié', 'paramètres modifiés')} : la reconstruction remet le démontage à zéro.`
              : 'Modifiez un paramètre puis reconstruisez l’objet.'}
          </p>
        </section>
      )}

      <section className="object-section">
        <h3 className="panel-heading">Remise en état</h3>
        {confirmReset ? (
          <div className="param-apply" role="group" aria-label="Confirmer le remontage complet">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                play('ui.click');
                bus.emit('inspection:resetObject');
                setConfirmReset(false);
              }}
              {...focusProps}
            >
              Oui, tout remonter
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setConfirmReset(false)}
              {...focusProps}
            >
              Annuler
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfirmReset(true)}
            {...focusProps}
          >
            <Icon name="reset" /> Réinitialiser l’objet (tout remonter)
          </button>
        )}
      </section>
    </div>
  );
}
