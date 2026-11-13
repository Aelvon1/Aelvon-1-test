import { useId } from 'react';
import { cn } from '../ui';

const LAYOUTS = {
  // visuel au-dessus du libellé : boucles, coutures
  tile: 'flex-col items-center gap-2.5 px-1.5 pb-3 pt-4 text-center',
  // visuel à gauche tant que la place manque, au-dessus ensuite : finitions et leurs descriptions
  adaptive:
    'items-center gap-4 p-3 pr-4 text-left @[34rem]:flex-col @[34rem]:items-stretch @[34rem]:gap-3.5 @[34rem]:p-3 @[34rem]:pb-4',
};

/**
 * Groupe de choix exclusif en cartes illustrées (vrais boutons radio : flèches au clavier).
 * @param {{
 *   options: Array<{ value: string|number, label: string, visual: import('react').ReactNode,
 *     description?: string, meta?: import('react').ReactNode }>,
 *   value: string|number, onChange: (value: string|number) => void, labelledBy: string,
 *   layout?: 'tile'|'adaptive', className?: string
 * }} props
 *   visual : échantillon dessiné · meta : précision sous le libellé (supplément de prix)
 *   className : colonnes de la grille
 */
export default function ChoiceCards({ options, value, onChange, labelledBy, layout = 'tile', className }) {
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={cn('grid gap-2', className)}>
      {options.map((option) => {
        const checked = String(option.value) === String(value);
        // sur le fond teinté de la carte choisie, le gris « muted » passerait sous le contraste AA
        const detail = checked ? 'text-fg/75' : 'text-muted';
        return (
          <label
            key={option.value}
            className={cn(
              'relative flex cursor-pointer border transition-colors duration-300',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent',
              checked ? 'border-fg bg-fg/[0.045]' : 'border-fg/20 hover:border-fg/55',
              LAYOUTS[layout] ?? LAYOUTS.tile,
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
            />
            {option.visual}
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-medium leading-tight">{option.label}</span>
              {option.description ? <span className={cn('mt-1 block text-[0.75rem] leading-snug', detail)}>{option.description}</span> : null}
              {option.meta ? <span className={cn('mt-1 block text-[0.75rem] leading-tight tabular-nums', detail)}>{option.meta}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
