import { BUCKLES, FINISHES, LEATHERS, STITCHES, WIDTHS } from '../../data/atelier';
import { asset } from '../../lib/assets';
import { ATELIER_BASE_PRICE } from '../../lib/pricing';
import { Button, Eyebrow, Price, Reveal, Section, SplitText } from '../ui';
import { enumerer } from './texte';

const POSTER = asset('renders/poster-atelier.webp');

const names = (list) => enumerer(list.map((entry) => entry.name));

// Les cinq choix de l'Atelier, lus dans le nuancier. Leur produit donne le nombre de combinaisons possibles.
const OPTIONS = [
  { label: 'Cuirs', count: LEATHERS.length, detail: names(LEATHERS), dots: LEATHERS },
  { label: 'Finitions', count: FINISHES.length, detail: names(FINISHES) },
  { label: 'Boucles', count: BUCKLES.length, detail: names(BUCKLES), dots: BUCKLES },
  { label: 'Coutures', count: STITCHES.length, detail: names(STITCHES) },
  { label: 'Largeurs', count: WIDTHS.length, detail: `${WIDTHS.map((width) => width.id).join(' · ')}\xa0mm` },
];
const COMBINATIONS = OPTIONS.reduce((total, option) => total * option.count, 1);
const NUMBER = new Intl.NumberFormat('fr-FR');

/** L'Atelier : la promesse du sur-mesure, chiffrée à partir du nuancier, et son prix de départ. */
export default function AtelierInvitation() {
  return (
    <Section tone="noir" aria-labelledby="atelier-titre" className="overflow-hidden">
      {/* grid-cols-1 : sans colonne explicite, la marge négative du visuel élargit la piste et rogne le texte */}
      <div className="grid grid-cols-1 gap-y-10 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-5 lg:col-start-8">
          <Reveal y={12}>
            <Eyebrow rule className="mb-6 md:mb-8">
              L’Atelier
            </Eyebrow>
          </Reveal>
          <SplitText as="h2" id="atelier-titre" className="text-display" text={'À l’Atelier,\nvous décidez\nde *tout*.'} />
          <Reveal delay={0.25} className="mt-6 md:mt-8">
            <p className="max-w-[42ch] text-lead text-muted">
              Le cuir, la finition, la boucle, la couture, la largeur&nbsp;: chaque choix vous revient. Vos initiales aussi, si vous
              le souhaitez.
            </p>
          </Reveal>
        </div>

        <Reveal
          as="figure"
          className="relative -mx-[6%] aspect-square sm:mx-auto sm:w-[78%] lg:col-span-7 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:-ml-[8%] lg:mr-0 lg:w-auto lg:self-center"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background:radial-gradient(48%_48%_at_50%_50%,rgb(201_169_110/0.13),transparent_72%)]"
          />
          <img
            src={POSTER}
            alt="Ceinture en cuir cognac roulée sur elle-même, boucle en acier brossé"
            width="1600"
            height="1600"
            loading="lazy"
            decoding="async"
            draggable="false"
            className="relative size-full object-contain"
          />
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-5 lg:col-start-8">
          <ul className="border-t border-line">
            {OPTIONS.map((option) => (
              <li key={option.label} className="grid grid-cols-[5.75rem_1.75rem_1fr] items-center gap-x-4 border-b border-line py-3.5">
                <span className="eyebrow text-[0.625rem] text-muted">{option.label}</span>
                <span className="font-display text-[1.5rem] leading-none lining-nums tabular-nums">{option.count}</span>
                {option.dots ? (
                  <span className="flex flex-wrap gap-2">
                    <span className="sr-only">{option.detail}</span>
                    {option.dots.map((dot) => (
                      <span
                        key={dot.id}
                        aria-hidden="true"
                        className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(241_235_225/0.28)]"
                        style={{ backgroundColor: dot.hex }}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="text-[0.8125rem] leading-snug text-muted lining-nums">{option.detail}</span>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <span className="font-display text-[clamp(3.75rem,7.4vw,7rem)] leading-[0.85] tracking-[-0.02em] lining-nums">
              {NUMBER.format(COMBINATIONS)}
            </span>
            <span className="eyebrow text-muted">combinaisons possibles</span>
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-x-8 gap-y-5 border-t border-line pt-6">
            <Price amount={ATELIER_BASE_PRICE} from className="font-display text-[1.75rem] leading-none" />
            <Button to="/atelier" icon="arrow-right">
              Ouvrir l’Atelier
            </Button>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
