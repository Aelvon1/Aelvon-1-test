import { useId } from 'react';
import { cn } from './cn';

/**
 * Groupe de choix exclusif en grille d'options rectangulaires (tailles, largeurs, finitions).
 * Navigation clavier native des boutons radio (flèches).
 * @param {{
 *   options: Array<{ value: string|number, label: import('react').ReactNode, hint?: import('react').ReactNode, disabled?: boolean }>,
 *   value?: string|number|null, onChange?: (value: string|number) => void,
 *   label?: string, labelledBy?: string, name?: string,
 *   columns?: number|'auto', minWidth?: string, className?: string
 * }} props
 *   label : nom accessible du groupe (ou labelledBy : id d'un titre visible)
 *   columns : nombre de colonnes, ou « auto » (remplissage, largeur mini `minWidth`, défaut « 4.25rem »)
 */
export default function OptionGrid({
  options = [],
  value,
  onChange,
  label,
  labelledBy,
  name,
  columns = 'auto',
  minWidth = '4.25rem',
  className,
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  const template =
    typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${minWidth}, 1fr))`;

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn('grid gap-2', className)}
      style={{ gridTemplateColumns: template }}
    >
      {options.map((option) => {
        const checked = value != null && String(option.value) === String(value);
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex min-h-12 flex-col items-center justify-center gap-0.5 border px-2.5 py-2 text-center transition-colors duration-300',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent',
              checked ? 'border-fg bg-fg text-bg' : 'border-fg/25 text-fg',
              option.disabled ? 'cursor-not-allowed text-muted' : 'cursor-pointer',
              !checked && !option.disabled && 'hover:border-fg/70',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={groupName}
              value={option.value}
              checked={checked}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
            />
            <span className={cn('text-sm font-medium leading-tight tabular-nums', option.disabled && 'opacity-55')}>
              {option.label}
            </span>
            {option.hint ? (
              <span className={cn('text-[0.6875rem] leading-tight', checked ? 'opacity-70' : 'text-muted', option.disabled && 'opacity-55')}>
                {option.hint}
              </span>
            ) : null}
            {option.disabled ? (
              <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-fg/25" preserveAspectRatio="none" viewBox="0 0 100 100">
                <line x1="0" y1="100" x2="100" y2="0" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </svg>
            ) : null}
          </label>
        );
      })}
    </div>
  );
}
