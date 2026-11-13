import { useRef } from 'react';
import { motion as Motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { HERO_BELT } from '../../data/atelier';
import { products } from '../../data/products';
import { asset } from '../../lib/assets';
import BeltCanvas from '../../three/BeltCanvas';
import { Button, EASE_LUXE, Eyebrow, Icon, Reveal, SplitText } from '../ui';
import { capitale, enLettres } from './texte';

const POSTER = asset('renders/poster-hero.webp');

const FACTS = ['Cuir pleine fleur', 'Boucles en acier', 'Garantie 2\xa0ans'];

/**
 * Ouverture : la ceinture en 3D devant le mot-symbole, le titre de la page et ses deux portes
 * (la collection, l'Atelier). Sur petit écran, la ceinture occupe le haut de l'écran, le texte suit.
 */
export default function Ouverture() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  // Profondeur au départ de la page : le mot-symbole descend, la ceinture monte à peine.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const wordmarkY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const beltY = useTransform(scrollYProgress, [0, 1], [0, -48]);

  return (
    <section ref={ref} className="theme-noir relative isolate flex min-h-svh flex-col overflow-hidden">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(58%_52%_at_50%_30%,rgb(201_169_110/0.11),transparent_72%)] lg:[background:radial-gradient(46%_56%_at_56%_42%,rgb(201_169_110/0.12),transparent_72%)]"
      />

      <div
        data-header-tone="noir"
        // petit écran : la scène prend toute la place que le texte lui laisse, sans descendre sous un quasi-carré
        className="relative mt-[calc(var(--header-h)-0.75rem)] min-h-[min(108vw,calc(64svh-8.5rem))] flex-1 lg:absolute lg:inset-x-0 lg:top-0 lg:mt-0 lg:h-[76%] lg:min-h-0"
      >
        <Motion.p
          aria-hidden="true"
          initial={reduced ? false : { opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2.4, ease: EASE_LUXE, delay: 0.1 }}
          style={reduced ? undefined : { y: wordmarkY }}
          // le remplissage, à peine plus clair que le fond, recouvre la moitié intérieure du contour
          className="pointer-events-none absolute inset-x-0 top-[40%] -translate-y-1/2 select-none text-center font-display text-[41vw] font-normal leading-[0.8] tracking-[0.02em] text-[#100e0c] [-webkit-text-stroke:2px_rgb(241_235_225/0.26)] [paint-order:stroke_fill] lg:top-[44%] lg:text-[min(37vw,64svh)]"
        >
          DAG
        </Motion.p>

        <Motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 2, ease: EASE_LUXE, delay: 0.3 }}
          style={reduced ? undefined : { y: beltY }}
          // la boîte de la scène déborde de son cadre : la ceinture y gagne en taille sans être rognée
          className="absolute -inset-x-[3%] -bottom-[20%] -top-[2%] sm:-inset-x-[7%] lg:-bottom-[16%] lg:-top-[5%] lg:left-[7%] lg:right-[-3%]"
        >
          <BeltCanvas
            config={HERO_BELT}
            pose="coil"
            view="hero"
            autoRotate={0.4}
            parallax
            poster={POSTER}
            className="absolute inset-0"
          />
        </Motion.div>
      </div>

      <div className="container-luxe relative pt-2 lg:mt-auto">
        <div className="flex flex-col gap-y-4 lg:flex-row lg:items-end lg:justify-between lg:gap-x-12">
          <div className="min-w-0">
            <Reveal y={12} delay={0.5} className="max-lg:hidden">
              <Eyebrow rule className="mb-6">
                Maison de ceintures
              </Eyebrow>
            </Reveal>
            <SplitText
              as="h1"
              className="font-display text-[clamp(3.25rem,7vw,8.25rem)] leading-[0.9] tracking-[-0.03em]"
              text={'La ceinture,\n*en mieux.*'}
              delay={0.55}
            />
          </div>

          <div className="lg:shrink-0 lg:pb-3">
            <Reveal delay={1} y={16}>
              <p className="max-w-[36ch] text-[0.9375rem] leading-relaxed text-muted lg:text-lead">
                {capitale(enLettres(products.length))} modèles prêts à porter, et un atelier pour composer la vôtre.
              </p>
            </Reveal>
            <Reveal delay={1.15} y={16} className="mt-5 flex flex-col gap-3 sm:flex-row lg:mt-7">
              <Button to="/shop" icon="arrow-right" className="whitespace-nowrap max-sm:w-full">
                Découvrir la collection
              </Button>
              <Button to="/atelier" variant="outline" className="whitespace-nowrap max-sm:w-full">
                Composer la vôtre
              </Button>
            </Reveal>
          </div>
        </div>

        <Reveal delay={1.35} y={0} className="mt-6 flex items-center justify-between gap-8 border-t border-line lg:mt-10">
          <ul className="grid flex-1 grid-cols-3 divide-x divide-line lg:flex lg:flex-none">
            {FACTS.map((fact) => (
              <li
                key={fact}
                className="flex min-h-12 items-center px-3 text-[0.625rem] font-semibold uppercase leading-snug tracking-[0.18em] text-muted first:pl-0 lg:min-h-16 lg:px-8 lg:text-[0.6875rem] lg:tracking-[0.26em]"
              >
                {fact}
              </li>
            ))}
          </ul>
          <a
            href="#manifeste"
            className="group/link eyebrow hidden min-h-11 items-center gap-3 text-fg lg:flex"
          >
            <span className="link-underline [--underline-trim:0.28em]">Défiler</span>
            <Icon name="arrow-down" size={16} className="text-accent transition-transform duration-500 ease-luxe group-hover/link:translate-y-0.5" />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
