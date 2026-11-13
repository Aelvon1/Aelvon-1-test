import { useId, useMemo } from 'react';
import Icon from './Icon';
import { FieldContext } from './field-context';
import { cn } from './cn';

/**
 * Enveloppe d'un champ : libellé, aide, message d'erreur. Le contrôle enfant
 * (Input, Textarea, Select) reçoit automatiquement id, aria-describedby,
 * aria-invalid et required.
 * @param {{
 *   label: import('react').ReactNode, hint?: import('react').ReactNode, error?: import('react').ReactNode,
 *   required?: boolean, optional?: boolean, id?: string, className?: string,
 *   children?: import('react').ReactNode
 * }} props
 *   error : message affiché à la place de l'aide ; sa présence marque le champ invalide
 *   optional : affiche « facultatif » à droite du libellé
 */
export default function Field({ label, hint, error, required = false, optional = false, id, className, children }) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = `${controlId}-aide`;
  const errorId = `${controlId}-erreur`;
  const hasError = Boolean(error);
  const hasHint = Boolean(hint) && !hasError;

  const context = useMemo(
    () => ({
      id: controlId,
      describedBy: hasError ? errorId : hasHint ? hintId : undefined,
      invalid: hasError,
      required,
    }),
    [controlId, errorId, hintId, hasError, hasHint, required],
  );

  return (
    <FieldContext.Provider value={context}>
      <div className={cn('flex flex-col gap-2', className)}>
        <label htmlFor={controlId} className="flex items-baseline justify-between gap-4 text-[0.8125rem] font-medium tracking-[0.02em] text-fg">
          <span>
            {label}
            {required ? (
              <span aria-hidden="true" className="ml-1 text-accent">
                *
              </span>
            ) : null}
          </span>
          {optional ? <span className="text-xs font-normal text-muted">facultatif</span> : null}
        </label>
        {children}
        {hasHint ? (
          <p id={hintId} className="text-[0.8125rem] leading-snug text-muted">
            {hint}
          </p>
        ) : null}
        {hasError ? (
          <p id={errorId} className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
            <Icon name="alert" size={15} className="mt-px" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
