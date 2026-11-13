import { useEffect } from 'react';
import { scrollToTarget } from '../../hooks';
import { atelierPath } from '../../lib/atelier-url';
import { Button, Eyebrow, Packshot, Reveal, SplitText, cn } from '../ui';
import AnatomieChapitre from './AnatomieChapitre';
import { CHAPTERS, INTRO } from './anatomie-content';

const POSITIONS = { bottom: '[&_img]:object-bottom', top: '[&_img]:object-top' };

/** Visuel fixe d'un chapitre : gros plan sur tuile claire, ou rendu sur fond noir pour le monogramme. */
function Still({ still }) {
  if (still.dark) {
    return (
      <div className="relative aspect-[5/4] overflow-hidden bg-surface">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:radial-gradient(70%_70%_at_50%_45%,rgb(201_169_110/0.1),transparent_70%)]"
        />
        <img
          src={still.src}
          alt={still.alt}
          width="1600"
          height="1600"
          loading="lazy"
          decoding="async"
          draggable="false"
          // le rendu montre la ceinture entière : on s'approche du monogramme
          className="absolute inset-0 size-full origin-[42%_61%] scale-[2.1] object-contain"
        />
      </div>
    );
  }
  return (
    <Packshot
      src={still.src}
      alt={still.alt}
      belt={still.belt}
      ratio="5 / 4"
      className={cn('[&_img]:object-cover', POSITIONS[still.position])}
    />
  );
}

/**
 * Anatomie, version posée : les quatre chapitres se lisent l'un sous l'autre, chacun avec un visuel
 * fixe. Affichée quand la scène 3D ne peut pas tourner ou que l'utilisateur préfère moins d'animations.
 * @param {{ resumeAt?: string }} props
 *   resumeAt : identifiant du chapitre à rejoindre à l'arrivée (relais de la scène épinglée)
 */
export default function AnatomieSequence({ resumeAt }) {
  useEffect(() => {
    if (resumeAt) scrollToTarget(`#anatomie-${resumeAt}`, { immediate: true });
  }, [resumeAt]);

  return (
    <div className="container-luxe section-pad">
      <Reveal y={12}>
        <Eyebrow rule className="mb-6 md:mb-8">
          {INTRO.eyebrow}
        </Eyebrow>
      </Reveal>
      <SplitText as="h2" id="anatomie-titre" className="text-display" text={INTRO.title} />
      <Reveal delay={0.25} className="mt-6 md:mt-8">
        <p className="text-lead text-muted">{INTRO.lead}</p>
      </Reveal>

      <ol className="mt-16 flex flex-col gap-y-20 lg:mt-28 lg:gap-y-36">
        {CHAPTERS.map((chapter, index) => {
          const flip = index % 2 === 1;
          const last = index === CHAPTERS.length - 1;
          return (
            <li key={chapter.id} id={`anatomie-${chapter.id}`} className="grid gap-y-8 lg:grid-cols-12 lg:items-center lg:gap-x-6">
              <Reveal as="figure" className={cn('lg:col-span-7', flip && 'lg:col-start-6')}>
                <Still still={chapter.still} />
                <figcaption className="eyebrow mt-4 text-muted">{chapter.still.caption}</figcaption>
              </Reveal>
              <Reveal delay={0.15} className={cn('lg:col-span-4', flip ? 'lg:col-start-1 lg:row-start-1' : 'lg:col-start-9')}>
                <AnatomieChapitre chapter={chapter} index={index} belt={chapter.still.belt}>
                  {last ? (
                    <Button to={atelierPath(chapter.still.belt)} icon="arrow-right" className="mt-8">
                      Poursuivre à l’Atelier
                    </Button>
                  ) : null}
                </AnatomieChapitre>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
