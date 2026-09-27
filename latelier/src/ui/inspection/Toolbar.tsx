/**
 * Barre d'outils de l'inspection (râtelier en tôle peinte) : éclatement 0–100 % + X,
 * étiquettes L, vue rangée K, rayons X, coupe C (axe, position, inversion), fond neutre,
 * cadrer F, recentrer R, tout afficher, réinitialiser l'objet.
 */
import { useState, type ReactNode } from 'react';
import { useUi, useUiSound } from '../UiContext';
import { Icon, type IconName } from '../components/Icon';
import { Key } from '../components/Key';
import { Segmented, Slider, usePointerFocusProps } from '../components/controls';
import { formatPercent } from '../logic/format';
import type { SectionAxis } from '../../core/store';
import { useInspection } from './hooks';

export function ToolButton({
  icon,
  label,
  shortcut,
  pressed,
  onClick,
  disabled,
  tone,
}: {
  icon: IconName;
  label: string;
  /** Raccourci : caractère (lettre) ou élément déjà formé. */
  shortcut?: string | ReactNode;
  pressed?: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  const focusProps = usePointerFocusProps();
  const { play } = useUiSound();
  const title = typeof shortcut === 'string' ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      className={`tool-btn${pressed ? ' is-on' : ''}${tone === 'danger' ? ' is-danger' : ''}`}
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      onClick={() => {
        play('ui.click');
        onClick();
      }}
      {...focusProps}
    >
      <span className="tool-led" aria-hidden="true" />
      <Icon name={icon} />
      <span className="tool-caption">
        <span className="tool-label">{label}</span>
        {shortcut !== undefined && (
          <span className="tool-key" aria-hidden="true">
            {typeof shortcut === 'string' ? <Key char={shortcut} /> : shortcut}
          </span>
        )}
      </span>
    </button>
  );
}

function SectionBar() {
  const { bus } = useUi();
  const section = useInspection((s) => s.section, null);
  const focusProps = usePointerFocusProps();
  if (!section || !section.enabled) return null;
  return (
    <div className="section-bar metal-dark" role="group" aria-label="Réglages de la coupe">
      <span className="section-bar-title dymo is-orange">Coupe</span>
      <Segmented<SectionAxis>
        label="Axe de coupe"
        value={section.axis}
        options={[
          { value: 'x', label: 'X', ariaLabel: 'Axe X (gauche-droite)' },
          { value: 'y', label: 'Y', ariaLabel: 'Axe Y (haut-bas)' },
          { value: 'z', label: 'Z', ariaLabel: 'Axe Z (avant-arrière)' },
        ]}
        onChange={(axis) => bus.emit('inspection:section', { axis })}
      />
      <label className="section-bar-slider">
        <span className="sr-only">Position du plan de coupe</span>
        <Slider
          value={section.position}
          min={0}
          max={1}
          step={0.005}
          valueText={formatPercent(section.position)}
          onChange={(position) => bus.emit('inspection:section', { position })}
        />
        <output className="field-value">{formatPercent(section.position)}</output>
      </label>
      <button
        type="button"
        className={`btn btn-sm${section.flip ? ' btn-petrol' : ''}`}
        aria-pressed={section.flip}
        onClick={() => bus.emit('inspection:section', { flip: !section.flip })}
        {...focusProps}
      >
        <Icon name="flip" /> Inverser
      </button>
    </div>
  );
}

export function Toolbar() {
  const { bus } = useUi();
  const explode = useInspection((s) => s.explode, 0);
  const labels = useInspection((s) => s.labels, false);
  const knolling = useInspection((s) => s.knolling, false);
  const xray = useInspection((s) => s.xray, false);
  const sectionOn = useInspection((s) => s.section.enabled, false);
  const neutral = useInspection((s) => s.neutralBackground, false);
  const selectedId = useInspection((s) => s.selected?.partId ?? null, null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="toolbar-wrap">
      <div className="toolbar metal rivets" role="toolbar" aria-label="Outils de vue" data-region>
        <div className="tool-group explode-group">
          <ToolButton
            icon="explode"
            label="Éclater"
            shortcut="X"
            pressed={explode > 0.5}
            onClick={() => bus.emit('inspection:toggleExplode')}
          />
          <label className="explode-slider">
            <span className="explode-caption">Éclatement</span>
            <Slider
              value={explode}
              min={0}
              max={1}
              step={0.01}
              label="Taux d’éclatement"
              valueText={formatPercent(explode)}
              onChange={(value) => bus.emit('inspection:explode', { value, animate: false })}
            />
            <output className="field-value">{formatPercent(explode)}</output>
          </label>
        </div>
        <span className="tool-sep" aria-hidden="true" />
        <div className="tool-group">
          <ToolButton
            icon="labels"
            label="Étiquettes"
            shortcut="L"
            pressed={labels}
            onClick={() => bus.emit('inspection:labels', { enabled: !labels })}
          />
          <ToolButton
            icon="knolling"
            label="Rangé"
            shortcut="K"
            pressed={knolling}
            onClick={() => bus.emit('inspection:knolling', { enabled: !knolling })}
          />
          <ToolButton
            icon="xray"
            label="Rayons X"
            pressed={xray}
            onClick={() => bus.emit('inspection:xray', { enabled: !xray })}
          />
          <ToolButton
            icon="section"
            label="Coupe"
            shortcut="C"
            pressed={sectionOn}
            onClick={() => bus.emit('inspection:section', { enabled: !sectionOn })}
          />
          <ToolButton
            icon="neutral"
            label="Fond neutre"
            pressed={neutral}
            onClick={() => bus.emit('inspection:neutralBackground', { enabled: !neutral })}
          />
        </div>
        <span className="tool-sep" aria-hidden="true" />
        <div className="tool-group">
          <ToolButton
            icon="frame"
            label="Cadrer"
            shortcut="F"
            onClick={() => bus.emit('inspection:frame', selectedId ? { partId: selectedId } : {})}
          />
          <ToolButton icon="recenter" label="Recentrer" shortcut="R" onClick={() => bus.emit('inspection:resetView')} />
          <ToolButton
            icon="showAll"
            label="Tout afficher"
            shortcut={
              <>
                <Key code="ShiftLeft" />
                <Key char="H" />
              </>
            }
            onClick={() => bus.emit('inspection:showAll')}
          />
          <ToolButton
            icon="reset"
            label={confirmReset ? 'Confirmer ?' : 'Tout remonter'}
            tone={confirmReset ? 'danger' : undefined}
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                window.setTimeout(() => setConfirmReset(false), 3000);
                return;
              }
              setConfirmReset(false);
              bus.emit('inspection:resetObject');
            }}
          />
        </div>
      </div>
      <SectionBar />
    </div>
  );
}
