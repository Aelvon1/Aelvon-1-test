import { Link } from 'react-router-dom';
import { Button, Eyebrow, Packshot, Price, Reveal, Section, SplitText } from '../ui';
import { findColor, findProduct, productImage, productPath, products } from '../../data/products';
import { EMPTY_TITLE_ID } from './steps';

// La pièce qui ouvre la collection, proposée comme point de départ.
const STARTER = findProduct('essential') ?? products[0];
const STARTER_COLOR = findColor(STARTER, 'cognac');

/** Tunnel de commande sans article : on raccompagne vers la collection ou l'Atelier. */
export default function EmptyCheckout() {
  return (
    <Section
      tone="ivoire"
      first
      className="flex min-h-svh flex-col"
      innerClassName="grid flex-1 content-center items-end gap-y-16 lg:grid-cols-12 lg:gap-x-8"
    >
      <div className="lg:col-span-7">
        <Reveal y={12}>
          <Eyebrow rule>Commande</Eyebrow>
        </Reveal>
        <SplitText
          as="h1"
          id={EMPTY_TITLE_ID}
          tabIndex={-1}
          className="text-display mt-7 max-w-[13ch] outline-none"
          text="Votre panier est encore *vide*."
        />
        <Reveal delay={0.25}>
          <p className="text-lead mt-7 max-w-[42ch] text-muted">
            Choisissez une ceinture de la collection, ou composez la vôtre à l’Atelier. Votre commande vous attendra ici.
          </p>
        </Reveal>
        <Reveal delay={0.35} className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button to="/shop" variant="solid" size="lg" icon="arrow-right" className="max-sm:w-full">
            Découvrir la collection
          </Button>
          <Button to="/atelier" variant="outline" size="lg" className="max-sm:w-full">
            Composer la vôtre
          </Button>
        </Reveal>
      </div>

      <Reveal delay={0.3} className="lg:col-span-4 lg:col-start-9">
        <Link to={productPath(STARTER)} className="group group/link block">
          <Packshot
            src={productImage(STARTER, STARTER_COLOR.value, 'studio')}
            hoverSrc={productImage(STARTER, STARTER_COLOR.value, 'boucle')}
            alt={`${STARTER.name}, ${STARTER_COLOR.name}`}
            belt={STARTER_COLOR.belt}
            loading="eager"
          />
          <span className="mt-4 flex items-end justify-between gap-6">
            <span className="min-w-0">
              <span className="eyebrow block text-muted">Pour commencer</span>
              <span className="mt-2 block font-display text-[1.5rem] leading-tight">
                <span className="link-underline">{STARTER.name}</span>
              </span>
            </span>
            <Price amount={STARTER.price} className="pb-1 text-[0.9375rem]" />
          </span>
        </Link>
      </Reveal>
    </Section>
  );
}
