import { useId } from 'react';
import { cn } from './cn';

const SIZES = {
  sm: { cell: 'h-11 w-8', dot: 'size-[1.125rem]' },
  md: { cell: 'size-11', dot: 'size-[1.625rem]' },
  lg: { cell: 'size-13', dot: 'size-9' },
};

/**
 * Nuancier : groupe de choix exclusif de coloris. Le nom de chaque teinte est lu par
 * les lecteurs d'écran et affiché en infobulle au survol et au focus.
 * @param {{
 *   options: Array<{ value?: string, id?: string, name: string, hex: string, hex2?: string }>,
 *   value?: string|null, onChange?: (value: string) => void,
 *   label?: string, labelledBy?: string, name?: string, size?: 'sm'|'md'|'lg', className?: string
 * }} props
 *   options : `value` (ou `id`, comme dans le nuancier de l'Atelier) · hex2 : pastille bicolore (réversible)
 *   label : nom accessible du groupe (défaut « Coloris »)
 */
export default function Swatches({
  options = [],
  value,
  onChange,
  label = 'Coloris',
  labelledBy,
  name,
  size = 'md',
  className,
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  const dims = SIZES[size] ?? SIZES.md;

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      className={cn('-mx-2 flex flex-wrap', size === 'sm' && '-mx-1.5', className)}
    >
      {options.map((option) => {
        const optionValue = option.value ?? option.id;
        const checked = value != null && String(optionValue) === String(value);
        const background = option.hex2
          ? `linear-gradient(135deg, ${option.hex} 0 50%, ${option.hex2} 50% 100%)`
          : option.hex;
        return (
          <label key={optionValue} className={cn('group/swatch relative grid cursor-pointer place-items-center', dims.cell)}>
            <input
              type="radio"
              className="peer sr-only"
              name={groupName}
              value={optionValue}
              checked={checked}
              onChange={() => onChange?.(optionValue)}
            />
            <span
              aria-hidden="true"
              className={cn(
                'block rounded-full outline-offset-[3px] transition-[outline-color,transform] duration-500 ease-luxe',
                'shadow-[inset_0_0_0_1px_var(--line)]',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-accent',
                checked ? 'outline-1 outline-fg' : 'outline-1 outline-transparent group-hover/swatch:outline-fg/40',
                dims.dot,
              )}
              style={{ background }}
            />
            <span className="sr-only">{option.name}</span>
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2 translate-y-1 bg-fg px-2 py-1.5 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.16em] whitespace-nowrap text-bg opacity-0',
                'transition-[opacity,translate] duration-300 ease-luxe',
                'group-hover/swatch:translate-y-0 group-hover/swatch:opacity-100 peer-focus-visible:translate-y-0 peer-focus-visible:opacity-100',
              )}
            >
              {option.name}
            </span>
          </label>
        );
      })}
    </div>
  );
}
