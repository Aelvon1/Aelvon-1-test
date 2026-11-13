import { cn } from '../ui';

const two = (n) => String(n).padStart(2, '0');

/**
 * Sommaire d'une page longue : liste numérotée de liens d'ancre, la section en cours est marquée.
 * Les ancres sont prises en charge par la coque (défilement adouci, focus sur la cible).
 * @param {{
 *   items: Array<{ id: string, label: string, index?: number, count?: number, disabled?: boolean }>,
 *   active?: string|null, label: string, title?: string, className?: string
 * }} props
 *   label : nom accessible de la navigation · title : sur-titre visible
 *   index : numéro affiché (défaut : rang dans la liste) · count : nombre discret à droite
 *   disabled : entrée sans lien (rubrique vide pendant une recherche)
 */
export default function SectionNav({ items, active, label, title, className }) {
  return (
    <nav aria-label={label} className={className}>
      {title ? <p className="eyebrow mb-4 text-muted">{title}</p> : null}
      <ol className="border-t border-line">
        {items.map((item, position) => {
          const current = item.id === active && !item.disabled;
          const content = (
            <>
              <span className={cn('eyebrow w-9 shrink-0 tabular-nums', item.disabled ? 'text-muted' : 'text-accent')}>
                {two(item.index ?? position + 1)}
              </span>
              <span
                aria-hidden="true"
                className={cn('h-px shrink-0 bg-current transition-[width,margin] duration-700 ease-luxe', current ? 'mr-3 w-6' : 'mr-0 w-0')}
              />
              <span className={cn('min-w-0 flex-1', !item.disabled && 'link-underline')}>{item.label}</span>
              {item.count != null ? <span className="shrink-0 pl-3 text-xs tabular-nums text-muted">{item.count}</span> : null}
            </>
          );
          return (
            <li key={item.id} className="border-b border-line">
              {item.disabled ? (
                <span className="flex min-h-12 items-center text-[0.9375rem] text-muted opacity-60">{content}</span>
              ) : (
                <a
                  href={`#${item.id}`}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    'group/link flex min-h-12 items-center text-[0.9375rem] transition-colors duration-500 ease-luxe',
                    current ? 'text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
