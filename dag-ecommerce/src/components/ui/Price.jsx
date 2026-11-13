import { formatPrice } from '../../lib/format';
import { cn } from './cn';

/**
 * Prix formaté (« 89 € », « 7,90 € ») — toujours via formatPrice.
 * @param {{ amount: number, from?: boolean|string, as?: keyof JSX.IntrinsicElements, className?: string }} props
 *   from : true → préfixe « À partir de » ; une chaîne remplace le préfixe (ex. « Dès »)
 */
export default function Price({ amount, from = false, as = 'span', className, ...rest }) {
  const Tag = as;
  const prefix = from === true ? 'À partir de' : from || null;
  return (
    <Tag className={cn('whitespace-nowrap lining-nums tabular-nums', className)} {...rest}>
      {prefix ? <span className="mr-[0.4em] text-[0.85em] text-muted">{prefix}</span> : null}
      {formatPrice(amount)}
    </Tag>
  );
}
