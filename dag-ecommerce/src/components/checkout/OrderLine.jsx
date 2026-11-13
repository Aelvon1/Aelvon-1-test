import { Link } from 'react-router-dom';
import { Packshot, Price, QuantityStepper, cn } from '../ui';
import { formatPrice } from '../../lib/format';
import { roundMoney } from '../../lib/pricing';
import { NBSP, lineLabel, tidySubtitle } from './format';

/**
 * Ligne d'article d'une commande : vignette, nom, description, quantité, montant.
 * @param {{
 *   item: import('../../lib/cart').CartItem, editable?: boolean, linked?: boolean, size?: 'sm'|'md',
 *   onQuantity?: (cartItemId: string, quantity: number) => void, onRemove?: (cartItemId: string) => void,
 *   className?: string
 * }} props
 *   editable : sélecteur de quantité et retrait (récapitulatif du tunnel) · linked : le nom mène à la
 *   fiche produit (confirmation) · size « md » : vignette et nom plus grands
 */
export default function OrderLine({ item, editable = false, linked = false, size = 'sm', onQuantity, onRemove, className }) {
  const large = size === 'md';
  const amount = roundMoney(item.price * item.quantity);
  const to = item.slug ? `/product/${item.slug}` : '/atelier';
  // nom complet de la ligne : deux tailles d'une même ceinture ne doivent pas porter le même nom
  const label = lineLabel(item);
  return (
    <div className={cn('flex', large ? 'gap-5 sm:gap-7' : 'gap-4', className)}>
      <Packshot
        src={item.image}
        belt={item.belt}
        alt=""
        ratio="4 / 5"
        className={cn('shrink-0 self-start', large ? 'w-24 sm:w-28' : 'w-[4.5rem]')}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <h3 className={cn('font-display leading-[1.15]', large ? 'text-[1.5rem] sm:text-[1.75rem]' : 'text-[1.3125rem]')}>
            {linked ? (
              <Link to={to} className="group/link -my-1.5 inline-flex min-h-11 items-center">
                <span className="link-underline">{item.name}</span>
              </Link>
            ) : (
              item.name
            )}
          </h3>
          <Price amount={amount} className={cn('font-medium', large ? 'pt-1.5 text-base' : 'pt-0.5 text-[0.9375rem]')} />
        </div>
        <p className={cn('leading-snug text-muted', large ? 'mt-2 max-w-[44ch] text-[0.9375rem]' : 'mt-1 text-[0.8125rem]')}>{tidySubtitle(item.subtitle)}</p>
        {editable ? (
          <div className="mt-3 flex items-center justify-between gap-4">
            <QuantityStepper
              value={item.quantity}
              onChange={(next) => onQuantity?.(item.cartItemId, next)}
              label={`Quantité — ${label}`}
            />
            <button
              type="button"
              onClick={() => onRemove?.(item.cartItemId)}
              aria-label={`Retirer ${label} de la commande`}
              className="group/link flex min-h-11 min-w-11 items-center justify-end text-[0.8125rem] text-muted transition-colors duration-300 hover:text-fg"
            >
              <span className="link-underline-always">Retirer</span>
            </button>
          </div>
        ) : (
          <p className={cn('text-muted', large ? 'mt-auto pt-4 text-[0.875rem]' : 'mt-2 text-[0.8125rem]')}>
            Quantité&nbsp;: {item.quantity}
            {item.quantity > 1 ? ` · ${formatPrice(item.price)}${NBSP}l’unité` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
