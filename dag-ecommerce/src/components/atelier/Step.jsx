import { cn } from '../ui';

/**
 * Étape numérotée du panneau de composition : numéro, titre, choix en cours, puis les options.
 * @param {{
 *   index: number, title: string, titleId: string, value?: import('react').ReactNode,
 *   id?: string, className?: string, children?: import('react').ReactNode
 * }} props
 *   titleId : id du titre, à passer aux groupes d'options (aria-labelledby) · value : rappel du choix, à droite
 */
export default function Step({ index, title, titleId, value, id, className, children }) {
  return (
    <section id={id} className={cn('border-t border-line py-7 @[34rem]:py-9', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={titleId} className="flex items-baseline gap-3.5 font-display text-[1.625rem] leading-none @[34rem]:text-[1.875rem]">
          <span className="font-sans text-[0.6875rem] font-semibold tabular-nums tracking-[0.2em] text-accent">
            {String(index).padStart(2, '0')}
          </span>
          {title}
        </h2>
        {value != null ? <p className="min-w-0 text-right text-[0.8125rem] leading-tight text-muted">{value}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
