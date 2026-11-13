import Icon from './Icon';
import { MAX_QUANTITY } from '../../lib/pricing';
import { cn } from './cn';

/**
 * Sélecteur de quantité (− valeur +).
 * @param {{
 *   value: number, onChange: (next: number) => void, min?: number, max?: number,
 *   label?: string, disabled?: boolean, className?: string
 * }} props
 *   min : défaut 1 · max : défaut MAX_QUANTITY (10) · label : nom accessible (défaut « Quantité »)
 */
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = MAX_QUANTITY,
  label = 'Quantité',
  disabled = false,
  className,
}) {
  const button =
    'grid size-11 place-items-center text-fg transition-colors duration-300 hover:bg-fg/10 disabled:cursor-not-allowed disabled:text-fg/30 disabled:hover:bg-transparent';
  return (
    <div role="group" aria-label={label} className={cn('inline-flex w-fit items-stretch border border-fg/25', className)}>
      <button
        type="button"
        className={button}
        aria-label="Diminuer la quantité"
        disabled={disabled || value <= min}
        onClick={() => onChange?.(Math.max(min, value - 1))}
      >
        <Icon name="minus" size={14} />
      </button>
      <output aria-live="polite" aria-atomic="true" className="grid min-w-9 place-items-center px-1 text-sm font-medium tabular-nums">
        {value}
      </output>
      <button
        type="button"
        className={button}
        aria-label="Augmenter la quantité"
        disabled={disabled || value >= max}
        onClick={() => onChange?.(Math.min(max, value + 1))}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
