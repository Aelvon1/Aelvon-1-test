import { formatPrice } from '../../lib/format';
import { deliveryDelay } from '../../lib/orders';
import { FREE_SHIPPING_THRESHOLD } from '../../lib/pricing';
import { SIZE_ALLOWANCE_CM } from '../../lib/sizing';
import { Eyebrow, Icon, Reveal, RevealGroup, Section, TextLink } from '../ui';

const FRANCE = deliveryDelay('FR');

// Les engagements de la maison, avec les chiffres des règles partagées (lib/*).
const COMMITMENTS = [
  {
    icon: 'truck',
    title: `Livraison offerte dès ${formatPrice(FREE_SHIPPING_THRESHOLD)}`,
    text: `Chez vous en ${FRANCE.minDays} à ${FRANCE.maxDays}\xa0jours ouvrés, en France métropolitaine.`,
  },
  {
    icon: 'return',
    title: 'Retours gratuits',
    text: 'Vous avez 30\xa0jours pour changer d’avis.',
  },
  {
    icon: 'shield',
    title: 'Garantie 2\xa0ans',
    text: 'Contre tout défaut de fabrication.',
  },
  {
    icon: 'ruler',
    title: 'La bonne taille',
    text: `Votre tour de taille, plus ${SIZE_ALLOWANCE_CM}\xa0cm.`,
    link: { to: '/guide-des-tailles', label: 'Guide des tailles' },
  },
];

/** Engagements : les quatre faits de service, en une rangée séparée par des filets. */
export default function Engagements() {
  return (
    <Section tone="ivoire" pad={false} aria-labelledby="engagements-titre" className="py-[clamp(4rem,7vw,7rem)]">
      <Reveal y={12}>
        <Eyebrow as="h2" id="engagements-titre" rule className="mb-8 lg:mb-10">
          Nos engagements
        </Eyebrow>
      </Reveal>
      <RevealGroup as="ul" stagger={0.08} className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {COMMITMENTS.map((item) => (
          <Reveal
            as="li"
            key={item.icon}
            className="flex gap-5 border-b border-line py-6 sm:odd:pr-6 sm:even:border-l sm:even:pl-6 lg:flex-col lg:gap-7 lg:border-l lg:px-7 lg:py-9 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0"
          >
            <Icon name={item.icon} size={22} className="mt-1 text-accent lg:mt-0" />
            <div>
              <p className="font-display text-[1.375rem] leading-tight lining-nums xl:text-[1.625rem]">{item.title}</p>
              <p className="mt-2 max-w-[30ch] text-[0.875rem] leading-relaxed text-muted">{item.text}</p>
              {item.link ? (
                <TextLink to={item.link.to} variant="label" arrow className="mt-1">
                  {item.link.label}
                </TextLink>
              ) : null}
            </div>
          </Reveal>
        ))}
      </RevealGroup>
    </Section>
  );
}
