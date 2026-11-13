import { useId } from 'react';
import { cn } from '../ui';

/**
 * Groupe d'un formulaire en deux colonnes éditoriales : intitulé (et note) à gauche, contenu à droite.
 * Empilé sur téléphone. Le groupe est nommé par son intitulé (role="group").
 * @param {{ title: import('react').ReactNode, note?: import('react').ReactNode, action?: import('react').ReactNode,
 *   className?: string, contentClassName?: string, children?: import('react').ReactNode }} props
 *   action : contenu aligné à droite de l'intitulé (lien « Modifier »)
 */
export default function FormGroup({ title, note, action, className, contentClassName, children }) {
  const titleId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className={cn('grid gap-x-10 gap-y-5 border-t border-line pt-8 md:grid-cols-[10.5rem_minmax(0,1fr)] md:pt-10', className)}
    >
      <div className="flex items-start justify-between gap-4 md:block">
        <h3 id={titleId} className="eyebrow flex min-h-6 items-center text-fg">
          {title}
        </h3>
        {note ? <p className="mt-3 hidden max-w-[22ch] text-[0.8125rem] leading-snug text-muted md:block">{note}</p> : null}
        {action ? <div className="-my-2.5 md:hidden">{action}</div> : null}
      </div>
      <div className={cn('min-w-0', contentClassName)}>{children}</div>
    </div>
  );
}
