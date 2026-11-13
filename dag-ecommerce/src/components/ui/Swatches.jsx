import { useId } from 'react';
import { cn } from './cn';

const SIZES = {
  sm: { cell: 'h-11 w-8', dot: 'size-[1.125rem]' },
  md: { cell: 'size-11', dot: 'size-[1.625rem]' },
  lg: { cell: 'size-13', dot: 'size-9' },
};

// marge gardée entre l'infobulle et le bord qui la rognerait
const TIP_MARGIN = 8;

/** Bornes horizontales visibles : la fenêtre, réduite par les ancêtres qui rognent (tiroir, zone défilante). */
function visibleBounds(element) {
  let left = 0;
  let right = document.documentElement.clientWidth;
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).overflowX === 'visible') continue;
    const rect = node.getBoundingClientRect();
    left = Math.max(left, rect.left);
    right = Math.min(right, rect.right);
  }
  return { left: left + TIP_MARGIN, right: right - TIP_MARGIN };
}

/**
 * Garde l'infobulle d'une pastille dans la zone visible : centrée sur la pastille tant qu'elle
 * tient, décalée du strict nécessaire près d'un bord (première pastille d'une tuile sur mobile).
 */
function keepTipInView(label) {
  const tip = label.querySelector('[data-swatch-tip]');
  if (!tip) return;
  tip.style.setProperty('--tip-shift', '0px');
  const rect = tip.getBoundingClientRect();
  const bounds = visibleBounds(tip);
  let shift = 0;
  if (rect.right > bounds.right) shift = bounds.right - rect.right;
  // le bord gauche a le dernier mot : un nom plus large que la place disponible se lit depuis son début
  if (rect.left + shift < bounds.left) shift = bounds.left - rect.left;
  tip.style.setProperty('--tip-shift', `${Math.round(shift)}px`);
}

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
          <label
            key={optionValue}
            className={cn('group/swatch relative grid cursor-pointer place-items-center', dims.cell)}
            onPointerEnter={(event) => keepTipInView(event.currentTarget)}
            onFocus={(event) => keepTipInView(event.currentTarget)}
          >
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
                // liseré dans la couleur du texte : clair sur noir, sombre sur ivoire — il détache
                // une pastille noire d'un fond noir comme une pastille claire d'un fond ivoire
                'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--fg)_50%,transparent)]',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-accent',
                checked ? 'outline-1 outline-fg' : 'outline-1 outline-transparent group-hover/swatch:outline-fg/40',
                dims.dot,
              )}
              style={{ background }}
            />
            <span className="sr-only">{option.name}</span>
            <span
              aria-hidden="true"
              data-swatch-tip
              className={cn(
                'pointer-events-none absolute bottom-full left-[calc(50%+var(--tip-shift,0px))] z-10 -translate-x-1/2 translate-y-1 bg-fg px-2 py-1.5 text-[0.625rem] font-semibold uppercase leading-none tracking-[0.16em] whitespace-nowrap text-bg opacity-0',
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
