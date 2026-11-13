import { useContext } from 'react';
import Icon from './Icon';
import { FieldContext } from './field-context';
import { controlClass } from './control-styles';
import { cn } from './cn';

/**
 * Liste déroulante native, habillée. Dans un <Field>, l'association au libellé est automatique.
 * @param {{
 *   options?: Array<{ value: string|number, label: string, disabled?: boolean }>,
 *   placeholder?: string, invalid?: boolean, className?: string
 * } & import('react').SelectHTMLAttributes<HTMLSelectElement>} props
 *   options : alternative aux <option> passés en enfants · placeholder : première entrée, non sélectionnable
 */
export default function Select({ id, invalid, required, options, placeholder, className, children, ...rest }) {
  const field = useContext(FieldContext);
  const isInvalid = invalid ?? field?.invalid ?? false;
  return (
    <div className={cn('relative', className)}>
      <select
        {...rest}
        id={id ?? field?.id}
        required={required ?? field?.required}
        aria-invalid={isInvalid || undefined}
        aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
        className={cn(controlClass(isInvalid), 'cursor-pointer appearance-none pr-12 has-[option[value=""]:checked]:text-muted')}
      >
        {placeholder ? (
          <option value="" disabled hidden>
            {placeholder}
          </option>
        ) : null}
        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          : children}
      </select>
      <Icon name="chevron-down" size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
