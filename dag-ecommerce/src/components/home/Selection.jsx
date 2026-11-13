import { products } from '../../data/products';
import { useMediaQuery } from '../../hooks';
import ProductCard from '../product/ProductCard';
import { Eyebrow, Reveal, Section, SplitText, TextLink, cn } from '../ui';
import { capitale, enLettres } from './texte';

const FEATURED = products.filter((product) => product.featured);

// Grand écran : deux rangées en quinconce — une grande tuile puis une petite, et l'inverse.
const PLACEMENT = [
  { cell: 'lg:col-span-7', wide: true },
  { cell: 'lg:col-span-4 lg:col-start-9 lg:mt-28' },
  { cell: 'lg:col-span-4 lg:col-start-2' },
  { cell: 'lg:col-span-6 lg:col-start-7 lg:mt-24', wide: true },
];

/**
 * La collection en quatre modèles phares. Petit écran : un rail horizontal à faire glisser ;
 * tablette : deux colonnes décalées ; grand écran : une planche en quinconce.
 */
export default function Selection() {
  const desktop = useMediaQuery('(min-width: 64rem)');

  return (
    <Section tone="ivoire" contained={false} aria-labelledby="selection-titre" className="overflow-hidden">
      <div className="container-luxe grid gap-y-8 lg:grid-cols-12 lg:items-end lg:gap-x-6">
        <div className="lg:col-span-7">
          <Reveal y={12}>
            <Eyebrow rule className="mb-6 md:mb-8">
              La collection
            </Eyebrow>
          </Reveal>
          <SplitText as="h2" id="selection-titre" className="text-display" text={'Par où\n*commencer*.'} />
        </div>
        <Reveal delay={0.2} className="lg:col-span-4 lg:col-start-9 lg:pb-3">
          <p className="max-w-[40ch] text-lead text-muted">
            {capitale(enLettres(FEATURED.length))} des {enLettres(products.length)} modèles de la maison, pour faire connaissance.
          </p>
          <TextLink to="/shop" variant="label" arrow className="mt-4">
            Voir toute la collection
          </TextLink>
        </Reveal>
      </div>

      <ul className="container-luxe mt-12 flex snap-x snap-mandatory scroll-px-[clamp(1.25rem,4vw,4rem)] gap-4 overflow-x-auto pb-2 [scrollbar-width:none] sm:grid sm:grid-cols-2 sm:gap-x-5 sm:gap-y-14 sm:overflow-visible sm:pb-0 lg:mt-24 lg:grid-cols-12 lg:gap-x-6 lg:gap-y-20">
        {FEATURED.map((product, index) => {
          const place = PLACEMENT[index % PLACEMENT.length];
          return (
            <Reveal
              as="li"
              key={product.id}
              className={cn('w-[76vw] shrink-0 snap-start sm:w-auto sm:max-lg:even:mt-16', place.cell)}
            >
              <ProductCard product={product} ratio={desktop && place.wide ? '4 / 3' : '4 / 5'} />
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
}
