import { cn } from '../ui';
import { CHAPTERS, chapterFacts } from './anatomie-content';
import { deuxChiffres } from './texte';

// Dans la scène épinglée, chaque bloc entre en léger décalé quand son chapitre devient actif
// (ancêtre `group/panel` porteur de data-active). Hors de la scène, ces classes sont sans effet.
const ENTER =
  'transition-[opacity,translate] duration-700 ease-luxe group-data-[active=false]/panel:translate-y-3 group-data-[active=false]/panel:opacity-0 group-data-[active=false]/panel:duration-300';

/**
 * Texte d'un chapitre de l'anatomie : numéro, titre, paragraphe et ligne de données.
 * @param {{
 *   chapter: object, index: number, belt: object, facts?: boolean, compact?: boolean,
 *   className?: string, children?: import('react').ReactNode
 * }} props
 *   chapter : entrée de CHAPTERS · index : rang (0 → « 01 ») · belt : ceinture montrée à côté du texte
 *   facts : affiche la ligne de données (défaut true) · compact : sur petit écran, le numéro n'est
 *   plus affiché (un rail le porte déjà) mais reste lu · children : contenu libre sous le texte
 */
export default function AnatomieChapitre({ chapter, index, belt, facts = true, compact = false, className, children }) {
  const rows = facts ? chapterFacts(chapter.id, belt) : [];
  return (
    <div className={className}>
      <p className={cn('eyebrow flex items-center gap-4 text-muted', compact && 'max-lg:sr-only', ENTER)}>
        <span className="tabular-nums text-accent">{deuxChiffres(index + 1)}</span>
        <span aria-hidden="true" className="h-px w-10 bg-current opacity-40" />
        <span aria-hidden="true" className="tabular-nums">
          {deuxChiffres(CHAPTERS.length)}
        </span>
      </p>
      <h3
        className={cn(
          'font-display text-[clamp(2.5rem,4.6vw,5rem)] leading-[1] tracking-[-0.02em] lg:mt-6',
          !compact && 'mt-4',
          ENTER,
          'group-data-[active=true]/panel:delay-100',
        )}
      >
        {chapter.title}
      </h3>
      <p
        className={cn(
          'mt-4 max-w-[38ch] text-[0.9375rem] leading-relaxed text-muted lg:mt-6 lg:text-base',
          ENTER,
          'group-data-[active=true]/panel:delay-200',
        )}
      >
        {chapter.text}
      </p>
      {rows.length > 0 ? (
        <dl
          className={cn(
            'mt-5 max-w-[26rem] border-t border-line lg:mt-8',
            ENTER,
            'group-data-[active=true]/panel:delay-300',
          )}
        >
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline gap-5 border-b border-line py-2.5 lg:py-3">
              <dt className="eyebrow w-[5.5rem] shrink-0 text-[0.625rem] text-muted">{row.label}</dt>
              <dd className="text-[0.875rem] leading-snug lining-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className={cn(ENTER, 'group-data-[active=true]/panel:delay-300')}>{children}</div> : null}
    </div>
  );
}
