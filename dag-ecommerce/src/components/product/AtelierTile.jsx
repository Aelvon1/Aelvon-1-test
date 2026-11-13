import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BUCKLES, DEFAULT_BELT, FINISHES, LEATHERS } from '../../data/atelier';
import { asset } from '../../lib/assets';
import { atelierPrice } from '../../lib/pricing';
import { Icon, Price, cn } from '../ui';
import { capitalize, countWords } from './catalogue';

// Ceinture par défaut de l'Atelier, éclairée pour un fond sombre (générée par `npm run renders`).
const POSTER = asset('renders/poster-atelier.webp');

/**
 * Tuile éditoriale sombre glissée dans la grille de la boutique : invitation à composer sa
 * ceinture à l'Atelier. S'adapte seule à la place qu'on lui donne (une cellule, deux, ou toute
 * une rangée) grâce aux requêtes de conteneur. Toute la tuile est un seul lien. Si le visuel
 * manque, la tuile reste complète : titre, nuancier et prix suffisent.
 * @param {{ headingLevel?: 2|3|4, className?: string }} props
 */
export default function AtelierTile({ headingLevel = 3, className }) {
  const Heading = `h${headingLevel}`;
  const [poster, setPoster] = useState('loading'); // loading | loaded | error
  const lead = `${capitalize(countWords(LEATHERS.length, 'cuir'))}, ${countWords(FINISHES.length, 'finition', 'finitions', { feminine: true })}, ${countWords(BUCKLES.length, 'boucle', 'boucles', { feminine: true })}. Et votre monogramme, si vous le souhaitez.`;

  return (
    <article className={cn('theme-noir group/link @container relative isolate flex h-full min-h-[17rem] overflow-hidden', className)}>
      {/* lumière d'atelier, à peine perceptible */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 transition-opacity duration-1000 ease-luxe [background:radial-gradient(95%_75%_at_100%_0%,rgb(201_169_110/0.16),transparent_60%)] group-hover/link:opacity-100"
      />

      {/*
        Trois dispositions selon la largeur de la tuile :
        en colonne (une cellule) · deux colonnes, texte puis ceinture · rangée entière, la ceinture au centre.
      */}
      <div className="flex w-full flex-col justify-between gap-6 p-4 @[17rem]:gap-8 @[17rem]:p-7 @[40rem]:grid @[40rem]:grid-cols-2 @[40rem]:grid-rows-[1fr_auto] @[40rem]:gap-x-8 @[40rem]:p-10 @[76rem]:grid-cols-[auto_minmax(0,1fr)_21rem] @[76rem]:min-h-[26rem] @[76rem]:grid-rows-1 @[76rem]:gap-x-12 @[76rem]:p-16">
        <div className="flex flex-col gap-4 @[17rem]:gap-6 @[76rem]:justify-between">
          <p className="eyebrow text-accent">L’Atelier</p>
          <Heading className="font-display text-[1.75rem] leading-[1.02] tracking-[-0.015em] @[17rem]:text-[clamp(2.5rem,8cqw,5.25rem)]">
            <Link
              to="/atelier"
              className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-4 focus-visible:after:outline-accent"
            >
              Composez
              <br />
              la <em className="italic">vôtre</em>.
            </Link>
          </Heading>
        </div>

        {poster !== 'error' ? (
          <div
            aria-hidden="true"
            className="pointer-events-none relative -mx-2 aspect-[5/4] overflow-hidden @[17rem]:-mx-4 @[17rem]:-my-3 @[40rem]:col-start-2 @[40rem]:row-span-2 @[40rem]:row-start-1 @[40rem]:mx-0 @[40rem]:my-0 @[40rem]:aspect-auto @[40rem]:min-h-[15rem] @[40rem]:overflow-visible @[76rem]:row-span-1 @[76rem]:min-h-0"
          >
            <img
              src={POSTER}
              alt=""
              loading="lazy"
              decoding="async"
              draggable="false"
              onLoad={() => setPoster('loaded')}
              onError={() => setPoster('error')}
              className={cn(
                'size-full object-cover transition-opacity duration-[1200ms] ease-luxe',
                '@[40rem]:absolute @[40rem]:inset-0 @[40rem]:scale-[1.12] @[40rem]:object-contain',
                '@[76rem]:inset-auto @[76rem]:left-1/2 @[76rem]:top-1/2 @[76rem]:h-[150%] @[76rem]:w-[135%] @[76rem]:max-w-none @[76rem]:-translate-x-1/2 @[76rem]:-translate-y-1/2 @[76rem]:scale-100',
                poster === 'loaded' ? 'opacity-100' : 'opacity-0',
              )}
            />
          </div>
        ) : null}

        <div className="@[40rem]:col-start-1 @[40rem]:row-start-2 @[76rem]:col-start-3 @[76rem]:row-start-1 @[76rem]:self-end">
          <p className="hidden text-[0.9375rem] leading-relaxed text-muted @[17rem]:block">{lead}</p>

          <ul aria-hidden="true" className="mt-6 hidden flex-wrap gap-2 @[17rem]:flex">
            {LEATHERS.map((leather) => (
              <li
                key={leather.id}
                className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(241_235_225/0.28)]"
                style={{ backgroundColor: leather.hex }}
              />
            ))}
          </ul>

          <div className="border-t border-line pt-4 @[17rem]:mt-7 @[17rem]:pt-5">
            <p className="eyebrow text-[0.625rem] text-muted">
              <span className="hidden @[17rem]:inline">Sur-mesure · </span>à partir de
            </p>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <Price amount={atelierPrice(DEFAULT_BELT)} className="font-display text-[1.375rem] leading-none @[17rem]:text-[1.875rem]" />
              <span aria-hidden="true" className="eyebrow hidden items-center gap-3 @[17rem]:flex">
                Commencer
                <Icon name="arrow-right" size={18} className="transition-transform duration-700 ease-luxe group-hover/link:translate-x-1.5" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
