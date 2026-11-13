import { cn } from './cn';

const TONES = { muted: 'text-muted', accent: 'text-accent', fg: 'text-fg' };

/**
 * Petit libellé en capitales espacées, avec numéro d'ordre et filet optionnels.
 * @param {{
 *   as?: keyof JSX.IntrinsicElements, index?: number|string, rule?: boolean,
 *   tone?: 'muted'|'accent'|'fg', className?: string, children?: import('react').ReactNode
 * }} props
 *   index : 1 → « 01 » · rule : filet entre le numéro et le libellé (ou devant le libellé)
 */
export default function Eyebrow({ as = 'p', index, rule = false, tone = 'muted', className, children, ...rest }) {
  const Tag = as;
  const number = typeof index === 'number' ? String(index).padStart(2, '0') : index;
  return (
    <Tag className={cn('eyebrow flex items-center gap-4', TONES[tone] ?? TONES.muted, className)} {...rest}>
      {number != null ? <span className="tabular-nums text-accent">{number}</span> : null}
      {rule ? <span aria-hidden="true" className="h-px w-10 shrink-0 bg-current opacity-40" /> : null}
      <span>{children}</span>
    </Tag>
  );
}
