/**
 * Contrôles de formulaire de l'atelier : interrupteur, curseur, sélecteur segmenté, liste.
 *
 * Politique de focus « à la souris » (`PointerFocusContext`) : dans l'inspection, un clic ne doit
 * pas laisser le focus sur un contrôle (sinon Espace ou les flèches, raccourcis du démontage,
 * agiraient sur ce contrôle). Les boutons ne prennent donc pas le focus au clic, les curseurs et
 * listes le rendent après usage. Au clavier (F6, Tab), le focus fonctionne normalement.
 */
import {
  createContext,
  useContext,
  useId,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useKeyScope } from '../UiContext';

export const PointerFocusContext = createContext<'keep' | 'release'>('keep');

/** Props à étaler sur un bouton pour qu'il ne garde pas le focus après un clic (selon la politique). */
export function usePointerFocusProps(): { onMouseDown?: (e: MouseEvent) => void } {
  const policy = useContext(PointerFocusContext);
  return policy === 'release' ? { onMouseDown: preventFocus } : {};
}

function preventFocus(e: MouseEvent): void {
  if (e.button === 0) e.preventDefault();
}

/** Touches gardées par un curseur (le moteur ne les reçoit pas pendant que le curseur a le focus). */
const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function Toggle({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** Libellé accessible si aucun <label> n'est associé. */
  label?: string;
  id?: string;
  disabled?: boolean;
}) {
  const focusProps = usePointerFocusProps();
  return (
    <button
      type="button"
      role="switch"
      id={id}
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...focusProps}
    />
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  label,
  valueText,
  id,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Fin d'un réglage (relâchement de la souris, touche). */
  onCommit?: (value: number) => void;
  label?: string;
  /** Valeur lisible pour les lecteurs d'écran (« 45 % »). */
  valueText?: string;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const policy = useContext(PointerFocusContext);
  useKeyScope(ref, (e) => SLIDER_KEYS.has(e.key));
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const style = { '--fill': `${fill}%` } as CSSProperties;
  return (
    <input
      ref={ref}
      type="range"
      id={id}
      className={className ? `slider ${className}` : 'slider'}
      min={min}
      max={max}
      step={step}
      value={value}
      style={style}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
      onPointerUp={(e) => {
        onCommit?.(Number(e.currentTarget.value));
        if (policy === 'release') e.currentTarget.blur();
      }}
      onKeyUp={(e) => {
        if (SLIDER_KEYS.has(e.key)) onCommit?.(Number(e.currentTarget.value));
      }}
    />
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Libellé accessible si `label` n'est pas du texte. */
  ariaLabel?: string;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  const name = useId();
  const ref = useRef<HTMLDivElement>(null);
  const policy = useContext(PointerFocusContext);
  // Les flèches déplacent le choix (comportement natif des boutons radio).
  useKeyScope(ref, (e) => SLIDER_KEYS.has(e.key));
  return (
    <div
      ref={ref}
      className={className ? `segmented ${className}` : 'segmented'}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o) => (
        <label key={o.value} className={o.value === value ? 'is-checked' : undefined} title={o.title}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            aria-label={o.ariaLabel}
            onChange={() => onChange(o.value)}
            onMouseDown={policy === 'release' ? preventFocus : undefined}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function SelectField({
  value,
  options,
  onChange,
  id,
  label,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  id?: string;
  label?: string;
}) {
  const policy = useContext(PointerFocusContext);
  return (
    <select
      id={id}
      className="select"
      value={value}
      aria-label={label}
      onChange={(e) => {
        onChange(e.target.value);
        if (policy === 'release') e.currentTarget.blur();
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
