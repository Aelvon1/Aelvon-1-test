import { Link } from 'react-router-dom';
import { cn } from '../ui';

/**
 * Fil d'Ariane discret.
 * @param {{ items: Array<{ label: string, to?: string }>, className?: string }} props
 *   items : du plus général au plus précis ; le dernier, sans `to`, est la page courante
 */
export default function Breadcrumb({ items, className }) {
  return (
    <nav aria-label="Fil d’Ariane" className={className}>
      <ol className="flex flex-wrap items-center text-[0.75rem] tracking-[0.02em] text-muted">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center">
            {index > 0 ? (
              <span aria-hidden="true" className="mx-2.5 text-fg/30">
                /
              </span>
            ) : null}
            {item.to ? (
              <Link
                to={item.to}
                className={cn('group/link inline-flex min-h-11 items-center transition-colors duration-500 ease-luxe hover:text-fg')}
              >
                <span className="link-underline">{item.label}</span>
              </Link>
            ) : (
              <span aria-current="page" className="inline-flex min-h-11 items-center text-fg">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
