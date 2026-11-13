import { formatPrice } from '../../lib/format';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST } from '../../lib/pricing';
import { Icon, cn } from '../ui';

// Les engagements de la maison, tels qu'ils figurent dans les conditions de vente.
const COMMITMENTS = [
  {
    icon: 'truck',
    title: `Livraison offerte dès ${formatPrice(FREE_SHIPPING_THRESHOLD)}`,
    text: `Chez vous en 3 à 5\xa0jours ouvrés, en France métropolitaine. ${formatPrice(SHIPPING_COST)} en deçà.`,
  },
  {
    icon: 'return',
    title: 'Retours gratuits',
    text: 'Vous disposez de 30\xa0jours pour changer d’avis.',
  },
  {
    icon: 'shield',
    title: 'Garantie 2\xa0ans',
    text: 'Chaque ceinture est garantie deux ans.',
  },
];

/**
 * Engagements de la maison : livraison, retours, garantie.
 * @param {{ variant?: 'strip'|'list', className?: string }} props
 *   strip : trois colonnes séparées par des filets (bas de page) · list : lignes compactes (fiche produit)
 */
export default function Reassurance({ variant = 'strip', className }) {
  if (variant === 'list') {
    return (
      <ul className={cn('divide-y divide-line border-y border-line', className)}>
        {COMMITMENTS.map((item) => (
          <li key={item.icon} className="flex items-start gap-4 py-3.5">
            <Icon name={item.icon} size={18} className="mt-0.5 text-accent" />
            <p className="text-[0.8125rem] leading-relaxed text-muted">
              <span className="font-medium text-fg">{item.title}.</span> {item.text}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  // La bande se règle sur sa propre largeur (pleine page à la boutique, colonne de galerie sur la fiche).
  return (
    <div className={cn('@container', className)}>
      <ul className="grid border-y border-line @[40rem]:grid-cols-3">
        {COMMITMENTS.map((item, index) => (
          <li
            key={item.icon}
            className={cn(
              'flex gap-5 py-7 @[40rem]:flex-col @[40rem]:gap-5 @[40rem]:py-8 @[64rem]:gap-6 @[64rem]:py-10',
              index > 0 && 'border-t border-line @[40rem]:border-l @[40rem]:border-t-0 @[40rem]:pl-6 @[64rem]:pl-12',
              index < COMMITMENTS.length - 1 && '@[40rem]:pr-6 @[64rem]:pr-12',
            )}
          >
            <Icon name={item.icon} size={22} className="mt-1 text-accent @[40rem]:mt-0" />
            <div>
              <p className="font-display text-[1.375rem] leading-tight lining-nums @[64rem]:text-[1.625rem]">{item.title}</p>
              <p className="mt-2 max-w-[34ch] text-[0.875rem] leading-relaxed text-muted">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
