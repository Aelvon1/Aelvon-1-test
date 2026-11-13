import { Link } from 'react-router-dom';
import GestureSequence from '../components/editorial/GestureSequence';
import Macro from '../components/editorial/Macro';
import MaskReveal from '../components/editorial/MaskReveal';
import ScrollText from '../components/editorial/ScrollText';
import { useHashAnchor } from '../components/editorial/useHashAnchor';
import { beltVisual } from '../components/editorial/visuals';
import { capitalize, countWords, productUrl } from '../components/product/catalogue';
import { Eyebrow, Icon, Marquee, Packshot, Reveal, RevealGroup, Section, SectionHeading, SplitText } from '../components/ui';
import { BUCKLES, FINISHES, LEATHERS, WIDTHS } from '../data/atelier';
import { products } from '../data/products';
import { usePageMeta } from '../hooks';

// --- Contenu ---------------------------------------------------------------

const CHAPTERS = [
  { href: '#manifeste', label: 'Manifeste' },
  { href: '#valeurs', label: 'Valeurs' },
  { href: '#gestes', label: 'Les gestes' },
  { href: '#mission', label: 'Mission' },
];

const MANIFESTO = [
  'DAG est née d’une idée simple\xa0: une ceinture doit être belle, solide, et facile à porter tous les jours.',
  'Nous concevons des pièces minimalistes, avec des matières sélectionnées et des finitions propres, pour accompagner toutes les tenues\xa0— du jean au costume.',
  'Notre objectif\xa0: proposer l’essentiel, parfaitement maîtrisé.',
];

const VALUES = [
  {
    title: 'Style *minimal*',
    text: 'Des lignes épurées, intemporelles, qui traversent les modes. Une ceinture DAG reste élégante, année après année.',
  },
  {
    title: 'Matières *solides*',
    text: 'Cuir pleine fleur, boucles en acier de qualité. Nos ceintures sont conçues pour durer, et pour gagner en caractère avec le temps.',
  },
  {
    title: 'Détails *soignés*',
    text: 'Coutures précises, finitions impeccables, boucles parfaitement ajustées. Chaque détail compte.',
  },
];

const WIDTH_LIST = `${WIDTHS.slice(0, -1)
  .map((width) => width.id)
  .join(', ')} ou ${WIDTHS[WIDTHS.length - 1].id}\xa0mm`;

const GESTURES = [
  {
    id: 'geste-cuir',
    title: 'Choisir le cuir',
    text: 'Tout commence par la peau. Elle se regarde en lumière rasante, se plie, se lit du plat de la main. Grain régulier, fleur intacte\xa0: rien d’autre ne passe.',
    visual: beltVisual('texture', 'tan', 'detail'),
    alt: 'Gros plan sur le grain d’un cuir tan et sa couture écrue',
    position: 'bottom',
  },
  {
    id: 'geste-coupe',
    title: 'Couper',
    text: `Une règle, une lame, un seul passage. La bande est tirée bien droite, à la largeur exacte\xa0: ${WIDTH_LIST}.`,
    visual: beltVisual('dress', 'ebene', 'studio'),
    alt: 'Ceinture fine en cuir brun foncé, roulée sur elle-même',
  },
  {
    id: 'geste-parage',
    title: 'Parer',
    text: 'Là où le cuir se replie autour de la boucle, il est aminci. Quelques dixièmes de millimètre en moins, et le pli se ferme sans épaisseur.',
    visual: beltVisual('essential', 'cognac', 'boucle'),
    alt: 'Le cuir cognac replié autour d’une boucle en acier brossé',
  },
  {
    id: 'geste-couture',
    title: 'Coudre',
    text: 'Le fil suit le bord à distance constante. Un point serré, régulier, ton sur ton ou contrasté. C’est lui qui tient l’ensemble, longtemps.',
    visual: beltVisual('everyday', 'navy', 'detail'),
    alt: 'Couture écrue sur un cuir grainé bleu nuit',
    position: 'bottom',
  },
  {
    id: 'geste-tranches',
    title: 'Teindre les tranches',
    text: 'Les bords sont poncés, teintés, lissés. Puis repris. Sous le doigt, la tranche devient ronde, nette, fermée.',
    visual: beltVisual('essential', 'cognac', 'detail'),
    alt: 'Tranches teintées d’une ceinture en cuir cognac, vues de près',
    position: 'top',
  },
  {
    id: 'geste-boucle',
    title: 'Monter la boucle',
    text: 'L’acier vient en dernier. La boucle est fixée, l’ardillon essayé cran après cran. La ceinture est prête à être portée.',
    visual: beltVisual('texture', 'marron-texture', 'boucle'),
    alt: 'Boucle en acier antique montée sur un cuir grainé marron',
  },
];

const MARQUEE = ['Belle', 'Solide', 'Facile à porter', 'Tous les jours'];

const COLOR_COUNT = products.reduce((total, product) => total + product.colors.length, 0);

const HERO_BUCKLE = beltVisual('essential', 'cognac', 'boucle');
const HERO_LEATHER = beltVisual('essential', 'cognac', 'detail');
const DUO = [
  { visual: beltVisual('texture', 'tan', 'studio'), hover: beltVisual('texture', 'tan', 'boucle'), line: 'Du jean…' },
  { visual: beltVisual('dress', 'noir', 'studio'), hover: beltVisual('dress', 'noir', 'boucle'), line: '…au costume.' },
];

const DOORS = [
  {
    to: '/shop',
    eyebrow: 'La collection',
    title: 'Voir la collection',
    text: `${capitalize(countWords(products.length, 'modèle'))}, ${countWords(COLOR_COUNT, 'coloris', 'coloris')}. Prêts à porter.`,
    visual: beltVisual('essential', 'noir', 'studio'),
    hover: beltVisual('essential', 'noir', 'boucle'),
  },
  {
    to: '/atelier',
    eyebrow: 'L’Atelier',
    title: 'Composer la vôtre',
    text: `${capitalize(countWords(LEATHERS.length, 'cuir'))}, ${countWords(FINISHES.length, 'finition', 'finitions', { feminine: true })}, ${countWords(BUCKLES.length, 'boucle', 'boucles', { feminine: true })}. Et votre monogramme, si vous le souhaitez.`,
    visual: beltVisual('everyday', 'marron', 'studio'),
    hover: beltVisual('everyday', 'marron', 'boucle'),
  },
];

// --- Fragments -------------------------------------------------------------

// Le plan « boucle » est cadré bord à bord : au survol, il remplit la tuile au lieu d'y flotter.
const HOVER_COVER = '[&_.packshot-hover]:object-cover';

/** Tuile produit éditoriale : le rendu, une ligne en italique, le nom du modèle. */
function DuoTile({ entry, className }) {
  const { visual, hover, line } = entry;
  if (!visual) return null;
  return (
    <Reveal className={className}>
      <Link to={productUrl(visual.product, visual.color.value)} className="group block">
        <Packshot src={visual.src} hoverSrc={hover?.src} belt={visual.belt} alt={visual.label} className={HOVER_COVER} />
        <span className="mt-5 flex items-baseline justify-between gap-6">
          <span className="font-display text-[clamp(1.5rem,2.2vw,2.125rem)] italic leading-tight">{line}</span>
          <span className="eyebrow shrink-0 text-muted transition-colors duration-500 group-hover:text-fg">
            {visual.product.name} · {visual.product.width.replace(' ', '\xa0')}
          </span>
        </span>
      </Link>
    </Reveal>
  );
}

/** Porte de sortie : une grande tuile qui mène à la collection ou à l'Atelier. */
function Door({ door }) {
  const { visual, hover } = door;
  return (
    <Reveal>
      <Link to={door.to} className="group block">
        <Packshot src={visual?.src} hoverSrc={hover?.src} belt={visual?.belt} alt="" ratio="5 / 4" surface="craie" className={HOVER_COVER} />
        <span className="mt-6 block border-t border-line pt-6">
          <span className="eyebrow block text-muted">{door.eyebrow}</span>
          <span className="mt-4 flex items-center justify-between gap-6">
            <span className="text-title">{door.title}</span>
            <span
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center border border-fg/30 transition-[background-color,color,border-color] duration-500 ease-luxe group-hover:border-fg group-hover:bg-fg group-hover:text-bg"
            >
              <Icon name="arrow-right" size={18} className="transition-transform duration-500 ease-luxe group-hover:translate-x-0.5" />
            </span>
          </span>
          <span className="mt-3 block max-w-[44ch] text-[0.9375rem] leading-relaxed text-muted">{door.text}</span>
        </span>
      </Link>
    </Reveal>
  );
}

// --- Page ------------------------------------------------------------------

export default function About() {
  usePageMeta({
    title: 'La Maison',
    description:
      'DAG est née d’une idée simple\xa0: une ceinture doit être belle, solide et facile à porter tous les jours. Le manifeste, les valeurs et les gestes de la maison.',
  });
  useHashAnchor();

  return (
    <>
      {/* 00 — Ouverture */}
      <section className="theme-noir relative overflow-hidden">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_80%_at_88%_8%,rgb(201_169_110/0.13),transparent_64%)]"
        />
        <div className="container-luxe page-top relative pb-10 lg:pb-12">
          <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-6">
            <div className="flex flex-col justify-between gap-y-8 lg:col-span-7">
              <Reveal y={12}>
                <Eyebrow rule>La Maison</Eyebrow>
              </Reveal>
              <SplitText as="h1" className="text-hero lg:pb-[0.06em]" text={'Une idée\n*simple*.'} delay={0.1} />
            </div>

            <figure className="relative sm:max-lg:ml-auto sm:max-lg:w-[68%] lg:col-span-5">
              <MaskReveal delay={0.25}>
                <Macro
                  visual={HERO_BUCKLE}
                  ratio="4 / 5"
                  loading="eager"
                  className="w-full lg:max-h-[calc(100svh-var(--header-h)-15.5rem)] lg:min-h-[24rem]"
                  alt="Boucle en acier brossé d’une ceinture DAG Essential en cuir cognac"
                />
              </MaskReveal>
              {/* second plan, posé dans la marge : visible quand la grille s'ouvre */}
              <MaskReveal from="left" delay={0.7} duration={1.3} className="absolute right-full top-0 mr-6 hidden w-[37.2%] lg:block">
                <Macro visual={HERO_LEATHER} loading="eager" position="bottom" alt="Le cuir cognac et sa couture, vus de près" />
              </MaskReveal>
              <figcaption className="eyebrow mt-4 flex justify-between gap-6 text-muted">
                <span>{HERO_BUCKLE?.label}</span>
                <span>La boucle</span>
              </figcaption>
            </figure>
          </div>

          <Reveal delay={0.5} y={16}>
            <nav aria-label="Chapitres de la page" className="mt-10 border-t border-line lg:mt-12">
              <ol className="grid grid-cols-2 lg:grid-cols-4">
                {CHAPTERS.map((chapter, index) => (
                  <li key={chapter.href}>
                    <a
                      href={chapter.href}
                      className="group/link flex min-h-14 items-center gap-4 text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-muted transition-colors duration-500 ease-luxe hover:text-fg"
                    >
                      <span className="tabular-nums text-accent">{String(index + 1).padStart(2, '0')}</span>
                      <span className="link-underline [--underline-trim:0.22em]">{chapter.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </Reveal>
        </div>
      </section>

      {/* 01 — Manifeste */}
      <Section tone="ivoire" id="manifeste" aria-labelledby="manifeste-titre">
        <div className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-6">
          <div className="lg:col-span-3">
            <Eyebrow as="h2" id="manifeste-titre" index={1} rule className="lg:sticky lg:top-header">
              Manifeste
            </Eyebrow>
          </div>
          <ScrollText
            paragraphs={MANIFESTO}
            className="flex max-w-[19em] flex-col gap-[1.1em] font-display text-[clamp(1.75rem,3.5vw,3.25rem)] leading-[1.16] tracking-[-0.012em] lg:col-span-9 xl:col-span-8"
          />
        </div>

        <div className="mt-20 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-5 lg:mt-32 lg:grid-cols-12 lg:gap-x-6">
          <DuoTile entry={DUO[0]} className="col-span-2 sm:col-span-1 lg:col-span-4 lg:col-start-4" />
          <DuoTile entry={DUO[1]} className="col-span-2 sm:col-span-1 sm:mt-24 lg:col-span-4 lg:col-start-9 lg:mt-40" />
        </div>
      </Section>

      {/* 02 — Valeurs */}
      <Section tone="noir" id="valeurs">
        <SectionHeading eyebrow="Valeurs" index={2} title={'Trois valeurs,\naucun *compromis*.'} />
        <RevealGroup as="ol" stagger={0.14} className="mt-16 border-b border-line lg:mt-24">
          {VALUES.map((value, index) => (
            <Reveal
              as="li"
              key={value.title}
              className="group grid gap-y-5 border-t border-line py-9 lg:grid-cols-12 lg:items-baseline lg:gap-x-6 lg:py-14"
            >
              <span aria-hidden="true" className="eyebrow tabular-nums text-accent lg:col-span-1">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="text-display transition-transform duration-700 ease-luxe lg:col-span-7 lg:group-hover:translate-x-3">
                {value.title.split('*').map((part, partIndex) =>
                  partIndex % 2 ? (
                    <em key={partIndex} className="italic">
                      {part}
                    </em>
                  ) : (
                    part
                  ),
                )}
              </h3>
              <p className="max-w-[40ch] text-lead text-muted lg:col-span-4">{value.text}</p>
            </Reveal>
          ))}
        </RevealGroup>
      </Section>

      {/* 03 — Les gestes */}
      <Section tone="ivoire" id="gestes">
        <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <SectionHeading eyebrow="Les gestes" index={3} title={'Six gestes,\nune *ceinture*.'} className="lg:col-span-7" />
          <Reveal delay={0.2} className="lg:col-span-5 lg:pb-3">
            <p className="max-w-[46ch] text-lead text-muted">
              Chaque ceinture DAG est le résultat d’un savoir-faire précis et d’une attention portée à chaque étape. De la sélection du
              cuir aux finitions, nous ne faisons aucun compromis sur la qualité.
            </p>
          </Reveal>
        </div>
        <GestureSequence steps={GESTURES} className="mt-14 lg:mt-24" />
      </Section>

      {/* 04 — Mission */}
      <Section tone="noir" id="mission" pad={false} contained={false} aria-labelledby="mission-titre" className="overflow-hidden">
        <div className="container-luxe section-pad flex flex-col items-center text-center">
          <Reveal y={12}>
            <Eyebrow as="h2" id="mission-titre" index={4} rule className="mb-8 md:mb-12">
              Notre mission
            </Eyebrow>
          </Reveal>
          <SplitText
            as="p"
            className="text-display max-w-[19ch]"
            text="Créer des accessoires *essentiels*, qui allient style, durabilité et fonctionnalité."
          />
          <Reveal delay={0.3} className="mt-8 max-w-[44ch] md:mt-12">
            <p className="text-lead text-muted">
              Des pièces que vous porterez avec fierté, jour après jour, sans jamais vous en lasser.
            </p>
          </Reveal>
        </div>
        <Marquee speed={32} gap="3.5rem" className="border-t border-line py-6 md:py-8" aria-hidden="true">
          {MARQUEE.map((word, index) => (
            <span key={word} className="flex items-center gap-14 whitespace-nowrap font-display text-[clamp(1.75rem,3.2vw,3rem)] leading-none">
              <span className={index % 2 ? 'italic text-muted' : ''}>{word}</span>
              <span className="size-1.5 rotate-45 bg-accent" />
            </span>
          ))}
        </Marquee>
      </Section>

      {/* 05 — Invitation */}
      <Section tone="ivoire">
        <SectionHeading eyebrow="La suite" title={'Le reste\nse *porte*.'} />
        <RevealGroup stagger={0.16} className="mt-14 grid gap-x-6 gap-y-16 md:grid-cols-2 lg:mt-20">
          {DOORS.map((door) => (
            <Door key={door.to} door={door} />
          ))}
        </RevealGroup>
      </Section>
    </>
  );
}
