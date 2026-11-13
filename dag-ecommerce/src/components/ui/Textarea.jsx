import { useContext } from 'react';
import { FieldContext } from './field-context';
import { controlClass } from './control-styles';
import { cn } from './cn';

/**
 * Zone de texte multiligne. Dans un <Field>, l'association au libellé est automatique.
 * @param {{ invalid?: boolean, className?: string } & import('react').TextareaHTMLAttributes<HTMLTextAreaElement>} props
 */
export default function Textarea({ id, invalid, required, className, rows = 5, ...rest }) {
  const field = useContext(FieldContext);
  const isInvalid = invalid ?? field?.invalid ?? false;
  return (
    <textarea
      rows={rows}
      {...rest}
      id={id ?? field?.id}
      required={required ?? field?.required}
      aria-invalid={isInvalid || undefined}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      className={cn(controlClass(isInvalid), 'resize-y py-3.5 leading-relaxed', className)}
    />
  );
}
