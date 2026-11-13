import { useId } from 'react';
import Icon from './Icon';
import { cn } from './cn';

/**
 * Case à cocher avec libellé cliquable.
 * @param {{
 *   label?: import('react').ReactNode, description?: import('react').ReactNode,
 *   error?: import('react').ReactNode, className?: string, children?: import('react').ReactNode
 * } & import('react').InputHTMLAttributes<HTMLInputElement>} props
 *   label (ou children) : texte de la case · error : message d'erreur associé
 */
export default function Checkbox({ label, description, error, className, children, id, ...rest }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-erreur`;
  const hasError = Boolean(error);
  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={cn('flex min-h-11 cursor-pointer items-start gap-3.5 py-2.5', rest.disabled && 'cursor-not-allowed opacity-45')}
      >
        <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
          <input
            type="checkbox"
            {...rest}
            id={inputId}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : rest['aria-describedby']}
            className={cn(
              'peer absolute inset-0 size-full cursor-pointer appearance-none border bg-transparent transition-colors duration-300',
              'checked:border-accent checked:bg-accent disabled:cursor-not-allowed',
              hasError ? 'border-danger' : 'border-fg/45 hover:border-fg',
            )}
          />
          <Icon
            name="check"
            size={14}
            strokeWidth={2}
            className="pointer-events-none relative text-on-accent opacity-0 transition-opacity duration-300 peer-checked:opacity-100"
          />
        </span>
        <span className="text-[0.9375rem] leading-normal">
          {label ?? children}
          {description ? <span className="mt-0.5 block text-[0.8125rem] text-muted">{description}</span> : null}
        </span>
      </label>
      {hasError ? (
        <p id={errorId} className="flex items-start gap-1.5 pl-[2.125rem] text-[0.8125rem] leading-snug text-danger">
          <Icon name="alert" size={15} className="mt-px" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
