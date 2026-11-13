import { Icon, Price, cn } from '../ui';
import { formatPrice } from '../../lib/format';
import { FREE_SHIPPING_THRESHOLD } from '../../lib/pricing';
import { countryName } from '../../lib/validation';
import { delayLabel, deliveryWindow, formatDateRange } from './format';

/**
 * Mode de livraison de la maison : un seul, à domicile. Affiche le délai annoncé pour le pays,
 * la fenêtre estimée et le coût (calculé par le panier : shippingFor).
 * @param {{ country: string, shipping: number, from: Date|string, framed?: boolean, className?: string }} props
 *   from : date de départ de l'estimation (aujourd'hui, ou la date de la commande) · framed : encadré (formulaire)
 */
export default function DeliveryMethod({ country, shipping, from, framed = true, className }) {
  const range = formatDateRange(deliveryWindow(from, country));
  const where = country === 'FR' ? 'en France métropolitaine' : `· ${countryName(country)}`;
  const line = 'mt-1 text-[0.8125rem] leading-snug text-muted';
  return (
    <div className={cn('flex items-start gap-4', framed && 'border border-fg/25 p-5', className)}>
      {framed ? <Icon name="truck" size={20} className="mt-0.5 text-accent" /> : null}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-4 text-[0.9375rem] leading-snug">
          <span className="font-medium">Livraison à domicile</span>
          <span className="shrink-0 tabular-nums">{shipping === 0 ? 'Offerte' : <Price amount={shipping} />}</span>
        </p>
        <p className={line}>
          {delayLabel(country)} {where}
        </p>
        {range ? <p className={line}>Estimée {range}</p> : null}
        {framed && shipping > 0 ? <p className={line}>Offerte dès {formatPrice(FREE_SHIPPING_THRESHOLD)} d’achat</p> : null}
      </div>
    </div>
  );
}
