/**
 * Réglages : TOUS les champs de `Settings`, appliqués en direct via `settings:update`
 * (le moteur valide, applique et sauvegarde). « Réinitialiser » émet `settings:reset`.
 */
import { useId, useState, type ReactNode } from 'react';
import { useAppState, useUi, useUiSound } from '../UiContext';
import { Modal } from '../components/Modal';
import { Segmented, SelectField, Slider, Toggle } from '../components/controls';
import { formatDecimal, formatPercent, NARROW_NBSP } from '../logic/format';
import { QUALITY_LABELS, type QualityPreset, type RemovedPlacementSetting, type Settings } from '../../core/settings';

const QUALITY_OPTIONS = (Object.keys(QUALITY_LABELS) as QualityPreset[]).map((value) => ({
  value,
  label: QUALITY_LABELS[value],
}));

const PLACEMENT_OPTIONS: { value: RemovedPlacementSetting; label: string }[] = [
  { value: 'auto', label: 'Selon l’objet' },
  { value: 'stay', label: 'Laisser en fin de course' },
  { value: 'park', label: 'Ranger à côté' },
  { value: 'hide', label: 'Faire disparaître' },
];

function Row({
  label,
  help,
  children,
  htmlFor,
}: {
  label: string;
  help?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
        {help && <span className="field-help">{help}</span>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  help,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <Row label={label} help={help} htmlFor={id}>
      <Slider id={id} value={value} min={min} max={max} step={step} valueText={format(value)} onChange={onChange} />
      <output className="field-value" htmlFor={id}>
        {format(value)}
      </output>
    </Row>
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <Row label={label} help={help} htmlFor={id}>
      <Toggle id={id} checked={value} onChange={onChange} />
    </Row>
  );
}

export function SettingsPanel() {
  const { bus, store } = useUi();
  const { play } = useUiSound();
  const s = useAppState((state) => state.settings);
  const [confirmReset, setConfirmReset] = useState(false);
  const qualityId = useId();
  const placementId = useId();

  const update = (patch: Partial<Settings>) => bus.emit('settings:update', patch);
  const toggle = (patch: Partial<Settings>) => {
    play('ui.click');
    update(patch);
  };
  const close = () => store.setState({ overlay: 'none' });

  const footer = (
    <>
      {confirmReset ? (
        <div className="settings-confirm" role="group" aria-label="Confirmer la réinitialisation">
          <span>Revenir aux réglages d’origine&nbsp;?</span>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              play('ui.stamp');
              bus.emit('settings:reset');
              setConfirmReset(false);
            }}
          >
            Oui, réinitialiser
          </button>
          <button type="button" className="btn btn-ink btn-sm" onClick={() => setConfirmReset(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ink" onClick={() => setConfirmReset(true)}>
          Réinitialiser
        </button>
      )}
      <span className="settings-saved type">Enregistré automatiquement</span>
      <button type="button" className="btn btn-primary" onClick={close}>
        Terminé
      </button>
    </>
  );

  return (
    <Modal title="Réglages" onClose={close} className="settings-modal" footer={footer}>
      <div className="settings-grid">
        <section className="settings-section" aria-labelledby={`${qualityId}-gfx`}>
          <h3 id={`${qualityId}-gfx`} className="dymo">
            Graphismes
          </h3>
          <Row label="Qualité" help="Ombres, reflets, post-traitement et définition des textures.">
            <Segmented
              label="Qualité graphique"
              value={s.quality}
              options={QUALITY_OPTIONS}
              onChange={(quality) => toggle({ quality })}
            />
          </Row>
          <ToggleRow
            label="Résolution dynamique"
            help="Baisse la définition si l’image ralentit, pour tenir 60 images/s."
            value={s.dynamicResolution}
            onChange={(dynamicResolution) => toggle({ dynamicResolution })}
          />
          <ToggleRow
            label="Profondeur de champ"
            help="Flou d’arrière-plan pendant l’inspection."
            value={s.depthOfField}
            onChange={(depthOfField) => toggle({ depthOfField })}
          />
          <SliderRow
            label="Champ de vision"
            value={s.fov}
            min={70}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(fov) => update({ fov })}
          />
          <ToggleRow
            label="Afficher les images/seconde"
            value={s.showFps}
            onChange={(showFps) => toggle({ showFps })}
          />
        </section>

        <section className="settings-section" aria-labelledby={`${qualityId}-ctl`}>
          <h3 id={`${qualityId}-ctl`} className="dymo">
            Contrôles
          </h3>
          <SliderRow
            label="Sensibilité de la souris"
            value={s.mouseSensitivity}
            min={0.1}
            max={3}
            step={0.05}
            format={(v) => `×${formatDecimal(v, 2)}`}
            onChange={(mouseSensitivity) => update({ mouseSensitivity })}
          />
          <ToggleRow
            label="Inverser l’axe vertical"
            value={s.invertY}
            onChange={(invertY) => toggle({ invertY })}
          />
          <ToggleRow
            label="Balancement de la marche"
            help="Léger mouvement de tête en marchant."
            value={s.headBob}
            onChange={(headBob) => toggle({ headBob })}
          />
        </section>

        <section className="settings-section" aria-labelledby={`${qualityId}-snd`}>
          <h3 id={`${qualityId}-snd`} className="dymo">
            Son
          </h3>
          <SliderRow
            label="Ambiance"
            help="Pluie, néon, radio, ventilateur."
            value={s.volumeAmbience}
            min={0}
            max={1}
            step={0.01}
            format={formatPercent}
            onChange={(volumeAmbience) => update({ volumeAmbience })}
          />
          <SliderRow
            label="Effets"
            help="Outils, pièces, pas."
            value={s.volumeSfx}
            min={0}
            max={1}
            step={0.01}
            format={formatPercent}
            onChange={(volumeSfx) => update({ volumeSfx })}
          />
          <SliderRow
            label="Interface"
            value={s.volumeUi}
            min={0}
            max={1}
            step={0.01}
            format={formatPercent}
            onChange={(volumeUi) => update({ volumeUi })}
          />
        </section>

        <section className="settings-section" aria-labelledby={`${qualityId}-ins`}>
          <h3 id={`${qualityId}-ins`} className="dymo">
            Démontage et interface
          </h3>
          <Row
            label="Pièces retirées"
            help="Où vont les pièces une fois démontées."
            htmlFor={placementId}
          >
            <SelectField
              id={placementId}
              value={s.removedPlacement}
              options={PLACEMENT_OPTIONS}
              onChange={(v) => toggle({ removedPlacement: v as RemovedPlacementSetting })}
            />
          </Row>
          <ToggleRow
            label="Cadrage automatique des étapes"
            help="La caméra suit les pièces de chaque étape du pas à pas."
            value={s.autoFrameSteps}
            onChange={(autoFrameSteps) => toggle({ autoFrameSteps })}
          />
          <SliderRow
            label="Taille des textes"
            value={s.textScale}
            min={0.8}
            max={1.6}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}${NARROW_NBSP}%`}
            onChange={(textScale) => update({ textScale })}
          />
        </section>
      </div>
    </Modal>
  );
}
