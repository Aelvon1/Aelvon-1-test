import { useId, useRef, useState } from 'react';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import { EASE_LUXE, FreeShippingBar, Icon, Price, cn } from '../ui';
import { formatPrice } from '../../lib/format';
import { FREE_SHIPPING_THRESHOLD } from '../../lib/pricing';
import { CONTACT_EMAIL } from '../layout/navigation';
import OrderLine from './OrderLine';
import Totals from './Totals';
import { countLabel } from './format';

const ASSURANCES = [
  { icon: 'truck', text: `Livraison offerte dès ${formatPrice(FREE_SHIPPING_THRESHOLD)}` },
  { icon: 'return', text: 'Retours gratuits sous 30 jours' },
  { icon: 'shield', text: 'Garantie 2 ans' },
];

function Lines({ items, editable, onQuantity, onRemove, className }) {
  const reduced = useReducedMotion();
  return (
    <ul aria-label="Articles de la commande" className={className}>
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <Motion.li
            key={item.cartItemId}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.6, ease: EASE_LUXE }}
            className="overflow-hidden border-b border-line last:border-b-0"
          >
            <OrderLine item={item} editable={editable} onQuantity={onQuantity} onRemove={onRemove} className="py-5" />
          </Motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function Assurances({ className }) {
  return (
    <div className={className}>
      <ul className="flex flex-col gap-3">
        {ASSURANCES.map((entry) => (
          <li key={entry.icon} className="flex items-center gap-3 text-[0.8125rem] leading-snug text-muted">
            <Icon name={entry.icon} size={17} className="text-accent" />
            {entry.text}
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-line pt-5 text-[0.8125rem] leading-snug text-muted">
        Une question&nbsp;?{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="group/link text-fg">
          <span className="link-underline-always">{CONTACT_EMAIL}</span>
        </a>
      </p>
    </div>
  );
}

/**
 * Récapitulatif de la commande en cours : articles (quantité modifiable, retrait), progression
 * vers la livraison offerte, totaux, engagements de la maison.
 * @param {{
 *   items: import('../../lib/cart').CartItem[],
 *   totals: { subtotal: number, shipping: number, total: number, count: number },
 *   editable?: boolean, collapsible?: boolean,
 *   onQuantity?: (cartItemId: string, quantity: number) => void, onRemove?: (cartItemId: string) => void,
 *   className?: string
 * }} props
 *   collapsible : présentation repliable (téléphone) — un bandeau « Votre commande · total » qui se déplie.
 *   Sans elle : panneau toujours ouvert (colonne de droite sur grand écran).
 */
export default function OrderSummary({ items, totals, editable = true, collapsible = false, onQuantity, onRemove, className }) {
  const titleId = useId();
  const panelId = useId();
  const focusRef = useRef(null);
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  // l'article retiré emporte son bouton : le focus revient au titre du récapitulatif
  const remove = (cartItemId) => {
    focusRef.current?.focus({ preventScroll: true });
    onRemove?.(cartItemId);
  };

  const body = (
    <>
      <Lines items={items} editable={editable} onQuantity={onQuantity} onRemove={remove} className={collapsible ? '' : 'scroll-area max-h-[max(19rem,calc(100svh-31rem))] px-6 xl:px-8'} />
      <div className={cn('border-t border-line', collapsible ? 'py-6' : 'px-6 py-7 xl:px-8')}>
        <FreeShippingBar subtotal={totals.subtotal} />
        <Totals subtotal={totals.subtotal} shipping={totals.shipping} total={totals.total} className="mt-7" />
      </div>
    </>
  );

  if (collapsible) {
    return (
      <aside aria-labelledby={titleId} className={cn('border-y border-line', className)}>
        <h2 id={titleId}>
          <button
            ref={focusRef}
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => setOpen((value) => !value)}
            className="flex min-h-16 w-full items-center justify-between gap-4 text-left"
          >
            <span className="flex min-w-0 items-center gap-3">
              <Icon name="bag" size={19} className="text-accent" />
              <span className="font-sans text-[0.9375rem] font-medium">Votre commande</span>
              <span className="font-sans text-[0.8125rem] text-muted">{countLabel(totals.count)}</span>
              <Icon name="chevron-down" size={16} className={cn('text-muted transition-transform duration-500 ease-luxe motion-reduce:transition-none', open && 'rotate-180')} />
            </span>
            <Price amount={totals.total} className="font-display text-[1.5rem] leading-none" />
          </button>
        </h2>
        <AnimatePresence initial={false}>
          {open ? (
            <Motion.div
              id={panelId}
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.7, ease: EASE_LUXE }}
              className="overflow-hidden"
            >
              <div className="border-t border-line">{body}</div>
            </Motion.div>
          ) : null}
        </AnimatePresence>
      </aside>
    );
  }

  return (
    <aside aria-labelledby={titleId} className={className}>
      <div className="border border-line bg-surface">
        <h2
          id={titleId}
          ref={focusRef}
          tabIndex={-1}
          className="flex items-baseline justify-between gap-4 border-b border-line px-6 py-5 outline-none xl:px-8"
        >
          <span className="text-subtitle">Votre commande</span>
          <span className="font-sans text-[0.8125rem] tabular-nums text-muted">{countLabel(totals.count)}</span>
        </h2>
        {body}
      </div>
      <Assurances className="mt-7 px-6 xl:px-8" />
    </aside>
  );
}

export { Assurances };
