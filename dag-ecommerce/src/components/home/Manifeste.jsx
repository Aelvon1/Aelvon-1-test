import { findColor, findProduct, productImage } from '../../data/products';
import ScrollText from '../editorial/ScrollText';
import { Eyebrow, Packshot, Reveal, Section, TextLink } from '../ui';

const STATEMENT = [
  'Une ceinture se boucle chaque matin, sans y penser.',
  'Alors elle doit être juste\xa0: un cuir pleine fleur, une boucle en acier, des finitions nettes.',
  'Nous ne faisons que cela.',
];

const MODEL = findProduct('essential');
const COLOR = findColor(MODEL, 'noir');

/** Manifeste : une conviction en grand corps, éclairée mot à mot, et une seule ceinture pour l'illustrer. */
export default function Manifeste() {
  return (
    <Section tone="ivoire" id="manifeste" aria-labelledby="manifeste-titre">
      <div className="grid gap-y-14 lg:grid-cols-12 lg:items-end lg:gap-x-6">
        <div className="lg:col-span-9">
          <Reveal y={12}>
            <Eyebrow as="h2" id="manifeste-titre" rule className="mb-8 lg:mb-12">
              Manifeste
            </Eyebrow>
          </Reveal>
          <ScrollText
            paragraphs={STATEMENT}
            className="flex max-w-[15.5em] flex-col gap-[0.55em] font-display text-[clamp(2.1rem,4.7vw,4.75rem)] leading-[1.06] tracking-[-0.018em]"
          />
          <Reveal delay={0.1} className="mt-10 lg:mt-14">
            <TextLink to="/about#manifeste" variant="label" arrow>
              Lire le manifeste
            </TextLink>
          </Reveal>
        </div>

        <Reveal as="figure" delay={0.2} className="w-[56%] max-w-[17rem] justify-self-end lg:col-span-3 lg:w-full lg:max-w-none">
          <Packshot
            src={productImage(MODEL, COLOR.value, 'studio')}
            alt={`${MODEL.name}, ${COLOR.name.toLowerCase()}, roulée sur elle-même`}
            belt={COLOR.belt}
          />
          <figcaption className="eyebrow mt-4 flex justify-between gap-4 text-muted">
            <span>{MODEL.name}</span>
            <span>{COLOR.name}</span>
          </figcaption>
        </Reveal>
      </div>
    </Section>
  );
}
