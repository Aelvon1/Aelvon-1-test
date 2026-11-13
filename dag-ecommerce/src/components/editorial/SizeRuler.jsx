import { cn } from '../ui';

/**
 * Règle graduée des longueurs DAG : une graduation par centimètre, un repère par taille, et un
 * curseur de laiton posé sur la longueur idéale. Décorative (le résultat est dit en toutes lettres).
 * @param {{ sizes: Array<string|number>, ideal?: number|null, size?: string|null, className?: string }} props
 *   ideal : longueur idéale en cm (curseur) · size : taille conseillée (repère mis en avant)
 */
export default function SizeRuler({ sizes, ideal = null, size = null, className }) {
  const values = sizes.map(Number);
  const min = values[0] - 5;
  const max = values[values.length - 1] + 5;
  const span = max - min;
  const position = (value) => `${((Math.min(max, Math.max(min, value)) - min) / span) * 100}%`;
  const centimetres = Array.from({ length: span + 1 }, (_, index) => min + index);

  return (
    <div aria-hidden="true" className={cn('relative select-none pt-5', className)}>
      {/* le curseur */}
      <div
        className={cn(
          'absolute top-0 z-10 flex -translate-x-1/2 flex-col items-center text-accent transition-[left,opacity] duration-[900ms] ease-luxe motion-reduce:transition-none',
          ideal == null ? 'opacity-0' : 'opacity-100',
        )}
        style={{ left: position(ideal ?? (min + max) / 2) }}
      >
        <span className="size-1.5 rotate-45 bg-current" />
        <span className="mt-0.5 h-9 w-px bg-current" />
      </div>

      {/* les graduations */}
      <div className="relative h-7 border-b border-fg/40">
        {centimetres.map((value) => {
          const major = value % 5 === 0;
          return (
            <span
              key={value}
              className={cn('absolute bottom-0 w-px -translate-x-1/2', major ? 'h-4 bg-fg/60' : 'h-2 bg-fg/25 max-sm:hidden')}
              style={{ left: position(value) }}
            />
          );
        })}
      </div>

      {/* les tailles */}
      <div className="relative mt-2 h-5">
        {values.map((value) => {
          const current = size != null && Number(size) === value;
          return (
            <span
              key={value}
              className={cn(
                'absolute -translate-x-1/2 text-[0.6875rem] tabular-nums transition-colors duration-500',
                current ? 'font-semibold text-fg' : 'text-muted',
              )}
              style={{ left: position(value) }}
            >
              {value}
            </span>
          );
        })}
      </div>
    </div>
  );
}
