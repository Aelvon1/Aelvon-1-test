import { formatPrice } from '../../lib/format';
import { FREE_SHIPPING_THRESHOLD, SHIPPING_COST, shippingFor } from '../../lib/pricing';
import { Icon } from '../ui';

/**
 * Ce que la maison s'engage à faire pour une ceinture de l'Atelier : rien de plus que les
 * conditions de vente (livraison, retours, garantie) et la fabrication à la commande.
 * @param {{ total: number, className?: string }} props  total : prix de la composition
 */
export default function Facts({ total, className }) {
  const facts = [
    {
      icon: 'pen',
      title: 'Fabriquée à la commande',
      text: 'Votre ceinture est réalisée d’après votre composition.',
    },
    {
      icon: 'truck',
      title: shippingFor(total) === 0 ? 'Livraison offerte' : `Livraison offerte dès ${formatPrice(FREE_SHIPPING_THRESHOLD)}`,
      text:
        shippingFor(total) === 0
          ? 'Comptez 3 à 5\xa0jours ouvrés en France métropolitaine, une fois la ceinture expédiée.'
          : `${formatPrice(SHIPPING_COST)} en deçà. Comptez 3 à 5\xa0jours ouvrés en France métropolitaine, une fois la ceinture expédiée.`,
    },
    { icon: 'return', title: 'Retours gratuits', text: 'Vous disposez de 30\xa0jours pour changer d’avis.' },
    { icon: 'shield', title: 'Garantie 2\xa0ans', text: 'Contre les défauts de fabrication.' },
  ];

  return (
    <ul className={className}>
      {facts.map((fact) => (
        <li key={fact.icon} className="flex items-start gap-4 border-b border-line py-3.5 last:border-b-0">
          <Icon name={fact.icon} size={18} className="mt-0.5 text-accent" />
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            <span className="font-medium text-fg">{fact.title}.</span> {fact.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
