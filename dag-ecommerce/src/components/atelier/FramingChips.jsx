import { useEffect, useRef } from 'react';
import { cn } from '../ui';

const VIEWS = [
  { id: 'full', label: 'Ensemble' },
  { id: 'boucle', label: 'Boucle' },
  { id: 'cuir', label: 'Cuir' },
  { id: 'couture', label: 'Couture' },
];
const MONOGRAM_VIEW = { id: 'monogramme', label: 'Monogramme' };

/**
 * Choix du cadrage de la scène. La pastille active suit aussi la caméra quand elle se déplace
 * d'elle-même vers le détail modifié. Sur un écran étroit la rangée défile, et garde la pastille
 * active visible.
 * @param {{ view: string, onChange: (view: string) => void, hasMonogram: boolean, className?: string }} props
 */
export default function FramingChips({ view, onChange, hasMonogram, className }) {
  const row = useRef(null);
  const views = hasMonogram ? [...VIEWS, MONOGRAM_VIEW] : VIEWS;

  useEffect(() => {
    const container = row.current;
    const active = container?.querySelector('input:checked')?.parentElement;
    if (!active) return;
    // défilement horizontal de la rangée seule (scrollIntoView pourrait déplacer la page)
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < container.scrollLeft) container.scrollLeft = left;
    else if (right > container.scrollLeft + container.clientWidth) container.scrollLeft = right - container.clientWidth;
  }, [view, hasMonogram]);

  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label="Cadrage"
      className={cn('relative flex max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      {views.map((entry) => {
        const checked = entry.id === view;
        return (
          <label
            key={entry.id}
            className={cn(
              // très petits écrans : cinq pastilles doivent tenir dans 360 px
              'flex min-h-11 shrink-0 cursor-pointer items-center px-2 text-[0.625rem] font-semibold uppercase tracking-[0.12em] transition-colors duration-500 ease-luxe',
              'min-[24rem]:px-2.5 min-[24rem]:tracking-[0.14em] sm:px-3.5 sm:tracking-[0.2em]',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent',
              checked ? 'bg-fg text-bg' : 'text-fg hover:text-accent',
            )}
          >
            <input
              type="radio"
              name="cadrage-atelier"
              value={entry.id}
              checked={checked}
              onChange={() => onChange(entry.id)}
              // un clic sur le cadrage où la caméra s'est rendue d'elle-même le fixe (aucun « change » n'est émis)
              onClick={() => onChange(entry.id)}
              className="sr-only"
            />
            {entry.label}
          </label>
        );
      })}
    </div>
  );
}
