import { FREE_SHIPPING_THRESHOLD, remainingForFreeShipping } from '../../lib/pricing';
import { formatPrice } from '../../lib/format';
import Icon from './Icon';
import { cn } from './cn';

/**
 * Progression vers la livraison offerte, d'après le sous-total du panier.
 * @param {{ subtotal: number, className?: string }} props
 */
export default function FreeShippingBar({ subtotal = 0, className }) {
  const amount = Math.max(0, Number(subtotal) || 0);
  const remaining = remainingForFreeShipping(amount);
  const reached = amount > 0 && remaining === 0;
  const percent = Math.min(100, Math.round((amount / FREE_SHIPPING_THRESHOLD) * 100));

  let message;
  if (reached) message = 'La livraison vous est offerte.';
  else if (amount === 0) message = `Livraison offerte dès ${formatPrice(FREE_SHIPPING_THRESHOLD)} d’achat.`;
  else message = `Plus que ${formatPrice(remaining)} pour la livraison offerte.`;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="flex items-center gap-2.5 text-[0.8125rem] leading-snug">
        <Icon name={reached ? 'check' : 'truck'} size={18} className="text-accent" />
        <span aria-live="polite">{message}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Progression vers la livraison offerte"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={message}
        className="relative h-px w-full bg-fg/20"
      >
        <span
          className="absolute inset-y-[-0.5px] left-0 origin-left bg-accent transition-[width] duration-1000 ease-luxe"
          style={{ width: `${percent}%`, height: '2px' }}
        />
      </div>
    </div>
  );
}
