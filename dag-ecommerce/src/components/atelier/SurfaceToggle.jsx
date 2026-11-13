import { cn } from '../ui';

const OPTIONS = [
  { value: 'noir', label: 'Fond noir', color: '#0b0a09' },
  { value: 'ivoire', label: 'Fond ivoire', color: '#f1ebe1' },
];

/**
 * Fond de la scène : noir ou ivoire. L'éclairage de la ceinture suit la surface choisie.
 * @param {{ value: 'noir'|'ivoire', onChange: (value: 'noir'|'ivoire') => void }} props
 */
export default function SurfaceToggle({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Fond de la scène" className="flex">
      {OPTIONS.map((option) => {
        const checked = option.value === value;
        return (
          <label key={option.value} className="group/fond relative grid size-11 cursor-pointer place-items-center">
            <input
              type="radio"
              name="fond-atelier"
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cn(
                'block size-[1.125rem] rounded-full shadow-[inset_0_0_0_1px_var(--line)] outline-offset-[3px] transition-[outline-color] duration-500 ease-luxe',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-accent',
                checked ? 'outline-1 outline-fg' : 'outline-1 outline-transparent group-hover/fond:outline-fg/40',
              )}
              style={{ backgroundColor: option.color }}
            />
            <span className="sr-only">{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
