import { cn } from '../ui';
import Macro from './Macro';
import { useActiveSection } from './useActiveSection';

const two = (n) => String(n).padStart(2, '0');

/**
 * Suite numérotée de gestes. Sur grand écran, un visuel reste en place à gauche et change avec
 * le geste en cours de lecture ; sur petit écran, chaque geste porte son propre visuel.
 * @param {{
 *   steps: Array<{
 *     id: string, title: string, text: string,
 *     visual: object|null, alt: string, position?: 'center'|'top'|'bottom'
 *   }>,
 *   className?: string
 * }} props
 *   visual : résultat de beltVisual() · alt : description du gros plan
 */
export default function GestureSequence({ steps, className }) {
  // une suite de lecture, sans liens d'ancre : seule compte la ligne, un peu sous le milieu de l'écran
  const active = useActiveSection(
    steps.map((step) => step.id),
    { line: 0.55, anchored: false },
  );
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === active),
  );
  const current = steps[activeIndex];

  return (
    <div className={cn('grid lg:grid-cols-12 lg:gap-x-6', className)}>
      {/* Visuel fixe (grand écran) : chaque rendu se pose sur le précédent. */}
      <figure className="sticky top-header hidden self-start lg:col-span-5 lg:block">
        <div className="relative">
          {steps.map((step, index) => (
            <div
              key={step.id}
              aria-hidden={index !== activeIndex}
              className={cn(
                'transition-opacity duration-[1100ms] ease-luxe',
                index === 0 ? 'relative' : 'absolute inset-0',
                index <= activeIndex ? 'opacity-100' : 'opacity-0',
              )}
            >
              <Macro visual={step.visual} alt={step.alt} position={step.position} />
            </div>
          ))}
        </div>
        <figcaption className="eyebrow mt-4 flex items-baseline justify-between gap-6 text-muted">
          <span>{current?.visual?.label}</span>
          <span className="tabular-nums" aria-hidden="true">
            <span className="text-accent">{two(activeIndex + 1)}</span> / {two(steps.length)}
          </span>
        </figcaption>
      </figure>

      <ol className="lg:col-span-6 lg:col-start-7">
        {steps.map((step, index) => {
          const reached = index <= activeIndex;
          return (
            <li key={step.id} id={step.id} className="relative border-t border-line py-10 last:border-b lg:min-h-[44svh] lg:py-14">
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 -top-px hidden h-px origin-left bg-accent transition-transform duration-[1100ms] ease-luxe lg:block',
                  reached ? 'scale-x-100' : 'scale-x-0',
                )}
              />
              <figure className="mb-8 lg:hidden">
                <Macro visual={step.visual} alt={step.alt} position={step.position} ratio="3 / 2" />
                <figcaption className="eyebrow mt-3 text-muted">{step.visual?.label}</figcaption>
              </figure>
              <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[5rem_minmax(0,1fr)] lg:grid-cols-[6rem_minmax(0,1fr)]">
                <span aria-hidden="true" className="font-display text-[clamp(1.75rem,2.6vw,2.5rem)] leading-none text-accent lining-nums">
                  {two(index + 1)}
                </span>
                <div>
                  <h3 className="text-title">{step.title}</h3>
                  <p className="mt-4 max-w-[42ch] text-lead text-muted lg:mt-5">{step.text}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
