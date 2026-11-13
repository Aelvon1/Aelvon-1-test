import { useEffect, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion as Motion, useReducedMotion } from 'motion/react';
import { Button, EASE_LUXE, Eyebrow, Icon, Packshot, Price, Reveal, RevealGroup, Section, SplitText, TextLink, cn } from '../components/ui';
import OrderLine from '../components/checkout/OrderLine';
import Totals from '../components/checkout/Totals';
import { NBSP, addressLines, countLabel, delayLabel, deliveryWindow, formatDateRange, fullName, tidySubtitle } from '../components/checkout/format';
import { CONTACT_EMAIL } from '../components/layout/navigation';
import { usePageMeta } from '../hooks';
import { formatDate, formatPrice } from '../lib/format';
import { getOrder, listOrders, normalizeOrderId, sanitizeOrder } from '../lib/orders';

const THANKS_ID = 'merci';

/** Commande à afficher : celle du stockage, sinon celle transmise par le tunnel (stockage indisponible). */
function resolveOrder(orderId, state) {
  const stored = getOrder(orderId);
  if (stored) return stored;
  const carried = sanitizeOrder(state?.order);
  return carried && carried.id === normalizeOrderId(orderId) ? carried : null;
}

function Hero({ order }) {
  const reduced = useReducedMotion();
  const [first] = order.items;
  // articles au-delà de la pièce montrée (les quantités comptent, comme dans le récapitulatif)
  const remaining = order.totals.count - 1;
  // le prénom entre dans un titre balisé (*italique*, retours à la ligne) : on écarte ces signes
  const firstName = order.customer.firstName.replace(/[*\r\n]/g, '').trim();
  const range = formatDateRange(deliveryWindow(order.createdAt, order.customer.country));

  return (
    <Section tone="noir" first innerClassName="grid gap-y-14 lg:grid-cols-12 lg:items-end lg:gap-x-8">
      <div className="min-w-0 lg:col-span-7">
        <Reveal y={12}>
          <Eyebrow tone="accent" rule>
            Commande confirmée
          </Eyebrow>
        </Reveal>
        <SplitText
          as="h1"
          id={THANKS_ID}
          tabIndex={-1}
          className={cn(firstName.length > 16 ? 'text-title' : 'text-display', 'mt-7 wrap-anywhere outline-none md:mt-9')}
          text={firstName ? `Merci, *${firstName}*.` : 'Merci.'}
          delay={0.15}
        />
        <Reveal delay={0.5}>
          <p className="text-lead mt-7 max-w-[38ch] text-muted md:mt-9">
            Votre commande est enregistrée. En voici le détail, et ce qui l’attend.
          </p>
        </Reveal>
        <Reveal delay={0.65}>
          <dl className="mt-12 grid gap-x-8 gap-y-7 border-t border-line pt-8 sm:grid-cols-[auto_auto_1fr] md:mt-16">
            <div>
              <dt className="eyebrow text-muted">Commande</dt>
              <dd className="mt-3 font-display text-[1.75rem] lining-nums leading-none tracking-[0.04em]">{order.id}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted">Passée le</dt>
              <dd className="mt-3 font-display text-[1.75rem] lining-nums leading-none">{formatDate(order.createdAt)}</dd>
            </div>
            {range ? (
              <div>
                <dt className="eyebrow text-muted">Livraison estimée</dt>
                <dd className="mt-3 font-display text-[1.75rem] lining-nums leading-none">{range}</dd>
              </div>
            ) : null}
          </dl>
        </Reveal>
      </div>

      <figure className="lg:col-span-4 lg:col-start-9">
        <Motion.div
          initial={reduced ? false : { clipPath: 'inset(100% 0% 0% 0%)' }}
          animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
          transition={{ duration: 1.4, ease: EASE_LUXE, delay: 0.25 }}
        >
          <Packshot src={first.image} belt={first.belt} alt={`${first.name}, ${tidySubtitle(first.subtitle)}`} ratio="4 / 5" loading="eager" />
        </Motion.div>
        <Reveal as="figcaption" delay={1.1} y={10} className="mt-4 flex items-baseline justify-between gap-6 text-[0.8125rem] leading-snug text-muted">
          <span>
            <span className="text-fg">{first.name}</span>
            {first.custom ? '' : ` — ${first.selectedColor.name}`}
          </span>
          {remaining > 0 ? (
            <span className="shrink-0">
              et {remaining} autre{remaining > 1 ? 's' : ''} article{remaining > 1 ? 's' : ''}
            </span>
          ) : null}
        </Reveal>
      </figure>
    </Section>
  );
}

const COMMITMENTS = [
  { icon: 'return', text: 'Retours gratuits sous 30 jours' },
  { icon: 'shield', text: 'Garantie 2 ans' },
];

function Commitments({ className }) {
  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {COMMITMENTS.map((entry) => (
        <li key={entry.icon} className="flex items-center gap-3 text-[0.8125rem] leading-snug text-muted">
          <Icon name={entry.icon} size={17} className="text-accent" />
          {entry.text}
        </li>
      ))}
    </ul>
  );
}

function Timeline({ order }) {
  const country = order.customer.country;
  const range = formatDateRange(deliveryWindow(order.createdAt, country));
  const steps = [
    {
      title: 'Préparation',
      text: 'Votre commande est enregistrée. Nous la préparons avec soin.',
      meta: formatDate(order.createdAt),
    },
    {
      title: 'Expédition',
      text: 'Votre colis est confié au transporteur, à destination de votre adresse.',
      meta: order.totals.shipping === 0 ? 'Livraison offerte' : `Livraison ${formatPrice(order.totals.shipping)}`,
    },
    {
      title: 'Livraison',
      text: `À domicile, ${delayLabel(country)} après la commande.`,
      meta: range ? `Estimée ${range}` : '',
    },
  ];

  return (
    <Section tone="ivoire" innerClassName="grid gap-y-12 lg:grid-cols-12 lg:gap-x-8">
      <div className="lg:col-span-4">
        <Reveal y={12}>
          <Eyebrow index={1} rule>
            La suite
          </Eyebrow>
        </Reveal>
        <SplitText as="h2" className="text-title mt-6 md:mt-8" text={`Et *maintenant*${NBSP}?`} />
        <Reveal delay={0.3} className="mt-10 max-lg:hidden">
          <Commitments />
        </Reveal>
      </div>

      <div className="lg:col-span-7 lg:col-start-6">
        <RevealGroup as="ol" className="border-t border-line" stagger={0.14}>
          {steps.map((step, index) => (
            <Reveal
              as="li"
              key={step.title}
              className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-y-2 border-b border-line py-7 md:grid-cols-[3.5rem_minmax(0,1fr)_auto] md:gap-x-8 md:py-9"
            >
              <span aria-hidden="true" className="eyebrow pt-2.5 tabular-nums text-accent">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-subtitle">{step.title}</h3>
                <p className="mt-2 max-w-[38ch] text-[0.9375rem] leading-relaxed text-muted">{step.text}</p>
              </div>
              {step.meta ? (
                <p className="eyebrow col-start-2 pt-1 text-fg md:col-start-3 md:pt-2.5 md:text-right">{step.meta}</p>
              ) : null}
            </Reveal>
          ))}
        </RevealGroup>
        <Reveal delay={0.2}>
          <p className="mt-7 flex items-start gap-3 text-[0.8125rem] leading-relaxed text-muted">
            <Icon name="info" size={17} className="mt-0.5 text-accent" />
            <span className="max-w-[62ch]">
              Commande de démonstration&nbsp;: aucun paiement n’a été prélevé et aucun colis ne sera expédié. Ces étapes décrivent le
              parcours d’une commande réelle.
            </span>
          </p>
        </Reveal>
        <Commitments className="mt-8 border-t border-line pt-7 lg:hidden" />
      </div>
    </Section>
  );
}

function DetailBlock({ title, className, children }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="eyebrow text-muted">{title}</dt>
      <dd className="mt-3 text-[0.9375rem] leading-relaxed">{children}</dd>
    </div>
  );
}

function Recap({ order }) {
  const { customer, items, totals, gift, giftNote } = order;
  return (
    <Section tone="noir" innerClassName="grid gap-y-12 lg:grid-cols-12 lg:gap-x-8">
      <div className="min-w-0 lg:col-span-7">
        <Reveal y={12}>
          <Eyebrow index={2} rule>
            Récapitulatif
          </Eyebrow>
        </Reveal>
        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 md:mt-8">
          <SplitText as="h2" className="text-title" text="Votre *commande*." />
          <p className="text-[0.8125rem] tabular-nums text-muted">{countLabel(totals.count)}</p>
        </div>
        <RevealGroup as="ul" className="mt-10 border-t border-line md:mt-12" stagger={0.12}>
          {items.map((item) => (
            <Reveal as="li" key={item.cartItemId} className="border-b border-line py-7">
              <OrderLine item={item} size="md" linked />
            </Reveal>
          ))}
        </RevealGroup>

        <Reveal delay={0.1}>
          <dl className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 md:mt-12">
            <DetailBlock title="Livraison">
              <address className="not-italic">
                <span className="block font-medium wrap-anywhere">{fullName(customer)}</span>
                {addressLines(customer).map((line) => (
                  <span key={line} className="block wrap-anywhere text-muted">
                    {line}
                  </span>
                ))}
              </address>
            </DetailBlock>
            <DetailBlock title="Contact">
              <span className="block wrap-anywhere">{customer.email}</span>
              {customer.phone ? <span className="block text-muted">{customer.phone}</span> : null}
            </DetailBlock>
            {gift ? (
              <DetailBlock title="Cadeau" className="sm:col-span-2">
                <span className="block">Cette commande est un cadeau.</span>
                {giftNote ? (
                  <>
                    <span className="block text-muted">Ce mot accompagne le colis&nbsp;:</span>
                    <span className="mt-3 block max-w-[44ch] whitespace-pre-line wrap-anywhere font-display text-[1.375rem] italic leading-snug">
                      {giftNote}
                    </span>
                  </>
                ) : (
                  <span className="block text-muted">Aucun mot ne l’accompagne.</span>
                )}
              </DetailBlock>
            ) : null}
          </dl>
        </Reveal>
      </div>

      <Reveal className="lg:sticky lg:top-header lg:col-span-4 lg:col-start-9 lg:self-start" delay={0.15}>
        <div className="border border-line bg-surface p-7 xl:p-9">
          <Totals subtotal={totals.subtotal} shipping={totals.shipping} total={totals.total} />
          <dl className="mt-8 flex flex-col gap-7 border-t border-line pt-8">
            <DetailBlock title="Mode de livraison">
              <span className="block">Livraison à domicile</span>
              <span className="block text-muted">{delayLabel(customer.country)}</span>
            </DetailBlock>
            <DetailBlock title="Paiement">
              <span className="block">Aucun paiement prélevé.</span>
              <span className="block text-muted">Commande de démonstration&nbsp;: aucune donnée bancaire ne vous a été demandée.</span>
            </DetailBlock>
          </dl>
        </div>
      </Reveal>
    </Section>
  );
}

const ONWARD = [
  { to: '/shop', title: 'La collection', text: 'Retrouvez toutes les ceintures de la maison.' },
  { to: '/atelier', title: 'L’Atelier', text: `Cuir, boucle, couture, monogramme${NBSP}: composez la vôtre.` },
];

function Onward({ order }) {
  const subject = encodeURIComponent(`Commande ${order.id}`);
  return (
    <Section tone="ivoire">
      <Reveal y={12}>
        <Eyebrow as="h2" index={3} rule>
          Poursuivre
        </Eyebrow>
      </Reveal>
      <RevealGroup as="ul" className="mt-8 grid border-t border-line md:mt-10 md:grid-cols-2">
        {ONWARD.map((entry, index) => (
          <Reveal as="li" key={entry.to} className={index === 0 ? 'border-b border-line md:border-r' : 'border-b border-line'}>
            <Link
              to={entry.to}
              className={`group/link flex items-start justify-between gap-6 py-9 md:py-14 ${index === 0 ? 'md:pr-10' : 'md:pl-10'}`}
            >
              <span>
                <span className="text-display block">
                  <span className="link-underline">{entry.title}</span>
                </span>
                <span className="mt-4 block max-w-[30ch] text-[0.9375rem] leading-relaxed text-muted">{entry.text}</span>
              </span>
              <Icon
                name="arrow-up-right"
                size={28}
                strokeWidth={1}
                className="mt-2 text-accent transition-transform duration-700 ease-luxe group-hover/link:-translate-y-1 group-hover/link:translate-x-1 motion-reduce:transition-none md:mt-4"
              />
            </Link>
          </Reveal>
        ))}
      </RevealGroup>
      <Reveal delay={0.2}>
        <p className="mt-8 text-[0.9375rem] leading-relaxed text-muted md:mt-10">
          Une question sur votre commande&nbsp;?{' '}
          <TextLink href={`mailto:${CONTACT_EMAIL}?subject=${subject}`} underline="always" tone="fg">
            {CONTACT_EMAIL}
          </TextLink>
        </p>
      </Reveal>
    </Section>
  );
}

function OrderNotFound({ orderId }) {
  const id = normalizeOrderId(orderId);
  const recent = useMemo(() => listOrders().slice(0, 3), []);
  return (
    <Section tone="ivoire" first className="flex min-h-svh flex-col" innerClassName="flex flex-1 flex-col justify-center">
      <Reveal y={12}>
        <Eyebrow rule>Commande introuvable</Eyebrow>
      </Reveal>
      <SplitText as="h1" className="text-display mt-7 max-w-[16ch]" text="Cette commande nous *échappe*." />
      <Reveal delay={0.25}>
        <p className="text-lead mt-7 max-w-[46ch] text-muted">
          {id ? (
            <>
              Aucune commande <span className="whitespace-nowrap text-fg">{id}</span> n’est enregistrée sur cet appareil.
            </>
          ) : (
            'Ce numéro de commande n’est pas valide.'
          )}{' '}
          Les commandes de démonstration ne sont conservées que dans le navigateur où elles ont été passées.
        </p>
      </Reveal>
      <Reveal delay={0.35} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button to="/shop" variant="solid" size="lg" icon="arrow-right" className="max-sm:w-full">
          Découvrir la collection
        </Button>
        <Button to="/contact" variant="outline" size="lg" className="max-sm:w-full">
          Nous écrire
        </Button>
      </Reveal>

      {recent.length > 0 ? (
        <Reveal delay={0.45} className="mt-16 max-w-xl md:mt-20">
          <h2 className="eyebrow text-muted">Vos dernières commandes sur cet appareil</h2>
          <ul className="mt-5 border-t border-line">
            {recent.map((order) => (
              <li key={order.id} className="border-b border-line">
                <Link to={`/confirmation/${order.id}`} className="group/link flex min-h-14 items-center justify-between gap-6 py-3">
                  <span className="font-display text-[1.375rem] lining-nums leading-none tracking-[0.04em]">
                    <span className="link-underline">{order.id}</span>
                  </span>
                  <span className="flex items-center gap-5 text-[0.8125rem] text-muted">
                    <span className="max-sm:hidden">{formatDate(order.createdAt)}</span>
                    <Price amount={order.totals.total} className="text-fg" />
                    <Icon name="arrow-right" size={16} className="transition-transform duration-500 ease-luxe group-hover/link:translate-x-1 motion-reduce:transition-none" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      ) : null}
    </Section>
  );
}

/**
 * Confirmation de commande (/confirmation/:orderId) : remerciement, numéro, suite des événements,
 * récapitulatif. La commande est relue dans le navigateur (lib/orders) ; un numéro inconnu
 * affiche un état d'attente soigné plutôt qu'une erreur.
 */
export default function OrderConfirmation() {
  const { orderId } = useParams();
  const { state } = useLocation();
  const order = useMemo(() => resolveOrder(orderId, state), [orderId, state]);

  usePageMeta({
    title: order ? `Commande ${order.id}` : 'Commande introuvable',
    description: order
      ? 'Votre commande DAG est enregistrée : numéro, livraison estimée et récapitulatif.'
      : 'Cette commande n’est pas enregistrée sur cet appareil.',
  });

  // arrivée depuis le tunnel : le bouton « Confirmer » a disparu avec lui, le focus passe au remerciement
  const fromCheckout = Boolean(order && state?.placed);
  useEffect(() => {
    if (fromCheckout) document.getElementById(THANKS_ID)?.focus({ preventScroll: true });
  }, [fromCheckout]);

  if (!order) return <OrderNotFound orderId={orderId} />;

  return (
    <>
      <Hero order={order} />
      <Timeline order={order} />
      <Recap order={order} />
      <Onward order={order} />
    </>
  );
}
