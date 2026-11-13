import { useState } from 'react';
import { BeltDiagram, WaistDiagram } from '../components/editorial/MeasureDiagrams';
import PageHero from '../components/editorial/PageHero';
import SizeFinder from '../components/editorial/SizeFinder';
import { ALL_SIZES, COLLECTION_SIZES, FINDER_DEFAULTS, finderResult, sizeAvailability } from '../components/editorial/size-finder';
import { useHashAnchor } from '../components/editorial/useHashAnchor';
import { sizeRange } from '../components/product/catalogue';
import { Button, Eyebrow, Reveal, RevealGroup, Section, SectionHeading, TextLink, cn } from '../components/ui';
import { products } from '../data/products';
import { usePageMeta } from '../hooks';
import { SIZE_ALLOWANCE_CM, recommendSize, sizeChart } from '../lib/sizing';

const CHART = sizeChart(ALL_SIZES);
const EXAMPLE_WAIST = 85;
const EXAMPLE_SIZE = recommendSize(EXAMPLE_WAIST)?.size ?? String(EXAMPLE_WAIST + SIZE_ALLOWANCE_CM);

// Modèles dont la gamme s'arrête avant la plus grande taille de la collection.
const COLLECTION_MAX = COLLECTION_SIZES[COLLECTION_SIZES.length - 1];
const SHORTER_MODELS = products.filter((product) => !product.sizes.includes(COLLECTION_MAX));

const STEPS = [
  {
    title: 'Mesurez',
    text: 'Passez un mètre ruban dans les passants de votre pantalon, là où vous le portez. Ni serré, ni lâche. Notez la mesure en centimètres.',
  },
  {
    title: `Ajoutez ${SIZE_ALLOWANCE_CM}\xa0cm`,
    text: `C’est la règle de la maison\xa0: votre tour de taille, plus ${SIZE_ALLOWANCE_CM}\xa0cm. Pour ${EXAMPLE_WAIST}\xa0cm de tour de taille, une ceinture de ${EXAMPLE_SIZE}.`,
  },
  {
    title: 'Lisez la taille',
    text: 'Une ceinture DAG se mesure de la base de la boucle au trou du milieu. Les crans voisins vous laissent de la marge, dans les deux sens.',
  },
];

const ADVICE = [
  {
    title: 'Entre deux tailles\xa0?',
    text: 'Prenez la plus grande. Une ceinture un peu longue se ferme un cran plus loin\xa0; une ceinture trop courte ne se rattrape pas.',
  },
  {
    title: 'Une ceinture vous va déjà\xa0?',
    text: 'Posez-la à plat et mesurez-la de la base de la boucle au cran que vous utilisez. Ce chiffre est votre taille DAG.',
  },
  {
    title: 'Taille haute ou taille basse\xa0?',
    text: 'Un jean et un pantalon de costume ne se portent pas au même endroit. Mesurez-vous là où passera la ceinture.',
  },
];

const HERO_LINKS = [
  { href: '#trouver', label: 'Trouver ma taille' },
  { href: '#mesurer', label: 'Comment mesurer' },
  { href: '#correspondances', label: 'Toutes les tailles' },
];

export default function SizeGuide() {
  usePageMeta({
    title: 'Guide des tailles',
    description: `Trouvez votre taille de ceinture DAG en trente secondes\xa0: votre tour de taille, plus ${SIZE_ALLOWANCE_CM}\xa0cm. Calculateur, schémas de mesure et table de correspondance.`,
  });

  useHashAnchor();

  const [finder, setFinder] = useState(FINDER_DEFAULTS);
  const result = finderResult(finder);
  const activeSize = result.status === 'exact' || result.status === 'near' ? result.size : null;

  return (
    <>
      <PageHero
        eyebrow="Guide des tailles"
        title={'La bonne taille,\ndu *premier* coup.'}
        lead={`Une ceinture DAG se choisit en centimètres\xa0: votre tour de taille, plus ${SIZE_ALLOWANCE_CM}\xa0cm. Trente secondes suffisent.`}
        aside={
          <nav aria-label="Sections du guide" className="mt-5 flex flex-col items-start">
            {HERO_LINKS.map((link) => (
              <TextLink key={link.href} href={link.href} variant="label" arrow="down">
                {link.label}
              </TextLink>
            ))}
          </nav>
        }
      />

      {/* 01 — Le trouveur */}
      <Section tone="ivoire" id="trouver" aria-labelledby="trouver-titre" className="!pt-[clamp(3.5rem,7vw,7rem)]">
        <Eyebrow index={1} rule className="mb-6">
          Votre taille
        </Eyebrow>
        <h2 id="trouver-titre" className="text-title max-w-[20ch]">
          Une mesure, et c’est <em className="italic">réglé</em>.
        </h2>
        <SizeFinder state={finder} result={result} onChange={(patch) => setFinder((current) => ({ ...current, ...patch }))} className="mt-10 lg:mt-14" />
      </Section>

      {/* 02 — La méthode */}
      <Section tone="noir" id="mesurer">
        <SectionHeading
          eyebrow="La méthode"
          index={2}
          title={'Mesurer,\nen trois *temps*.'}
          lead="Un mètre ruban, le pantalon que vous portez le plus souvent, et une minute devant vous."
        />
        <RevealGroup as="ol" stagger={0.14} className="mt-14 grid gap-x-6 gap-y-14 lg:mt-20 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <Reveal as="li" key={step.title} className="grid gap-x-6 gap-y-6 sm:max-lg:grid-cols-2 sm:max-lg:items-end">
              {index === 0 ? <WaistDiagram /> : null}
              {index === 1 ? (
                <div className="relative flex flex-col justify-between border border-line p-5" style={{ aspectRatio: '4 / 5' }}>
                  <p className="eyebrow text-muted">La règle maison</p>
                  <p className="font-display leading-[0.85] tracking-[-0.03em] lining-nums" aria-hidden="true">
                    <span className="text-[clamp(6rem,11vw,10.5rem)]">
                      <span className="text-accent">+</span>
                      {SIZE_ALLOWANCE_CM}
                    </span>
                    <span className="ml-2 text-[clamp(1.5rem,2.4vw,2.25rem)] tracking-normal text-muted">cm</span>
                  </p>
                  <p className="border-t border-line pt-4 font-display text-[clamp(1.25rem,1.7vw,1.5rem)] leading-snug lining-nums">
                    {EXAMPLE_WAIST} <span className="text-accent">+ {SIZE_ALLOWANCE_CM}</span> = {EXAMPLE_SIZE}
                    <span className="mt-1 block font-sans text-[0.75rem] text-muted">tour de taille + aisance = taille DAG</span>
                  </p>
                </div>
              ) : null}
              {index === 2 ? <BeltDiagram size={EXAMPLE_SIZE} /> : null}
              <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline sm:max-lg:pb-2">
                <span aria-hidden="true" className="eyebrow tabular-nums text-accent">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="text-subtitle lining-nums">{step.title}</h3>
                <p className="col-start-2 mt-3 max-w-[38ch] text-[0.9375rem] leading-relaxed text-muted">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </RevealGroup>
      </Section>

      {/* 03 — Les correspondances */}
      <Section tone="ivoire" id="correspondances">
        <SectionHeading eyebrow="Correspondances" index={3} title={'Toutes les tailles,\nen un coup d’*œil*.'} />

        <div className="mt-14 grid gap-y-16 lg:mt-20 lg:grid-cols-12 lg:gap-x-6">
          <Reveal className="lg:col-span-7">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Correspondance entre le tour de taille, la taille de pantalon française et la taille de ceinture DAG
              </caption>
              <thead>
                <tr className="border-y border-line text-[0.75rem] text-muted">
                  <th scope="col" className="py-4 pr-4 font-medium">
                    Taille DAG
                  </th>
                  <th scope="col" className="py-4 pr-4 font-medium">
                    Tour de taille
                  </th>
                  <th scope="col" className="py-4 text-right font-medium">
                    Pantalon (FR)
                  </th>
                </tr>
              </thead>
              <tbody>
                {CHART.map((row) => {
                  const match = activeSize === row.size;
                  const atelierOnly = !sizeAvailability(row.size).inCollection;
                  return (
                    <tr
                      key={row.size}
                      aria-current={match ? 'true' : undefined}
                      className={cn('border-b border-line transition-colors duration-700 ease-luxe', match && 'bg-fg/[0.055]')}
                    >
                      <th scope="row" className="py-3.5 pl-3 pr-4 font-normal sm:pl-4">
                        <span className="flex flex-wrap items-baseline gap-x-3">
                          <span className={cn('font-display text-[1.75rem] leading-none lining-nums sm:text-[2rem]', match && 'text-accent')}>
                            {row.size}
                          </span>
                          {match ? <span className="eyebrow text-accent">Votre taille</span> : null}
                          {atelierOnly && !match ? <span className="eyebrow text-muted">Atelier</span> : null}
                        </span>
                      </th>
                      <td className="whitespace-nowrap py-3.5 pr-4 tabular-nums text-fg/85">
                        {row.waistMin}&nbsp;–&nbsp;{row.waistMax}&nbsp;cm
                      </td>
                      <td className="py-3.5 pr-3 text-right tabular-nums text-fg/85 sm:pr-4">
                        {row.trouserFr.length ? row.trouserFr.join(' · ') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-5 max-w-[62ch] text-[0.8125rem] leading-relaxed text-muted">
              La taille indique la longueur de la base de la boucle au trou du milieu. La collection couvre les tailles{' '}
              {sizeRange(COLLECTION_SIZES)}
              {SHORTER_MODELS.map((product) => ` (jusqu’à ${product.sizes[product.sizes.length - 1]} pour la ${product.name})`).join('')}
              &nbsp;; l’Atelier réalise les longueurs de {sizeRange(ALL_SIZES)}. Les tailles de pantalon sont indicatives.
            </p>
          </Reveal>

          <RevealGroup as="ul" stagger={0.12} className="border-t border-line lg:col-span-4 lg:col-start-9">
            {ADVICE.map((item) => (
              <Reveal as="li" key={item.title} className="border-b border-line py-7">
                <h3 className="text-subtitle">{item.title}</h3>
                <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-muted">{item.text}</p>
              </Reveal>
            ))}
            <Reveal as="li" className="py-7">
              <h3 className="text-subtitle">Un doute&nbsp;?</h3>
              <p className="mt-3 max-w-[40ch] text-[0.9375rem] leading-relaxed text-muted">
                Écrivez-nous, nous vous conseillerons. Et si la taille ne convient pas, le retour est gratuit pendant 30&nbsp;jours.
              </p>
              <TextLink to="/contact?sujet=produit" variant="label" arrow className="mt-2">
                Nous écrire
              </TextLink>
            </Reveal>
          </RevealGroup>
        </div>

        <Reveal className="mt-16 flex flex-col gap-8 border-t border-line pt-10 lg:mt-24 lg:flex-row lg:items-end lg:justify-between lg:pt-14">
          <p className="text-title max-w-[16ch]">
            Votre taille en poche, il reste à <em className="italic">choisir</em>.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button to="/shop" variant="solid" size="lg" icon="arrow-right">
              Voir la collection
            </Button>
            <Button to="/atelier" variant="outline" size="lg">
              Composer la vôtre
            </Button>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
