import { useContext } from 'react';
import { FieldContext } from './field-context';
import { controlClass } from './control-styles';
import { cn } from './cn';

/**
 * Champ de saisie. Dans un <Field>, l'association au libellé est automatique.
 * @param {{ invalid?: boolean, className?: string } & import('react').InputHTMLAttributes<HTMLInputElement>} props
 */
export default function Input({ id, invalid, required, className, type = 'text', ...rest }) {
  const field = useContext(FieldContext);
  const isInvalid = invalid ?? field?.invalid ?? false;
  return (
    <input
      type={type}
      {...rest}
      id={id ?? field?.id}
      required={required ?? field?.required}
      aria-invalid={isInvalid || undefined}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      className={cn(controlClass(isInvalid), className)}
    />
  );
}
