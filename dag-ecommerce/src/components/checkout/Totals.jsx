import { Price, cn } from '../ui';

/**
 * Sous-total, livraison et total d'une commande.
 * @param {{ subtotal: number, shipping: number, total: number, className?: string }} props
 */
export default function Totals({ subtotal, shipping, total, className }) {
  return (
    <dl className={cn('flex flex-col gap-2.5 text-[0.9375rem]', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted">Sous-total</dt>
        <dd>
          <Price amount={subtotal} />
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-muted">Livraison</dt>
        <dd>{shipping === 0 ? 'Offerte' : <Price amount={shipping} />}</dd>
      </div>
      <div className="mt-2.5 flex items-baseline justify-between gap-4 border-t border-line pt-5">
        <dt className="eyebrow">Total</dt>
        <dd className="font-display text-[2rem] leading-none">
          <Price amount={total} />
        </dd>
      </div>
    </dl>
  );
}
