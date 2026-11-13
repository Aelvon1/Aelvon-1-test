import { Icon, cn } from '../ui';
import { CHECKOUT_STEPS } from './steps';

/**
 * Fil des étapes de la commande. L'étape en cours porte aria-current="step" ;
 * une étape terminée devient un bouton pour y revenir.
 * @param {{ current: 1|2, onBack?: (step: number) => void, id?: string, className?: string }} props
 */
export default function StepIndicator({ current, onBack, id, className }) {
  return (
    <nav id={id} aria-label="Étapes de la commande" className={className}>
      <ol className="flex items-center gap-4 sm:gap-6">
        {CHECKOUT_STEPS.map((step, index) => {
          const done = step.id < current;
          const active = step.id === current;
          const label = (
            <>
              <span
                className={cn(
                  'grid h-5 min-w-5 place-items-center tabular-nums transition-colors duration-500 ease-luxe',
                  done || active ? 'text-accent' : 'text-muted',
                )}
              >
                {done ? <Icon name="check" size={15} strokeWidth={1.75} /> : String(step.id).padStart(2, '0')}
              </span>
              <span className="sm:hidden">{step.short}</span>
              <span className="hidden sm:inline">{step.label}</span>
            </>
          );
          const tone = active ? 'text-fg' : 'text-muted';
          return (
            <li key={step.id} className={cn('flex items-center gap-4 sm:gap-6', index > 0 && 'min-w-0 flex-1')}>
              {index > 0 ? (
                <span aria-hidden="true" className="relative h-px min-w-6 flex-1 bg-fg/20">
                  <span
                    className="absolute inset-0 origin-left bg-accent transition-transform duration-1000 ease-luxe motion-reduce:transition-none"
                    style={{ transform: `scaleX(${current > index ? 1 : 0})` }}
                  />
                </span>
              ) : null}
              {done && onBack ? (
                <button
                  type="button"
                  onClick={() => onBack(step.id)}
                  className={cn('eyebrow group/link flex min-h-11 items-center gap-3 transition-colors duration-500 ease-luxe hover:text-fg', tone)}
                >
                  <span className="sr-only">Revenir à l’étape&nbsp;: </span>
                  {label}
                </button>
              ) : (
                <span aria-current={active ? 'step' : undefined} className={cn('eyebrow flex min-h-11 items-center gap-3', tone)}>
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
