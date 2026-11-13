import { Eyebrow, Reveal, Section, SplitText, cn } from '../ui';

// Lumière d'atelier : un halo de laiton à peine perceptible, en haut à droite du chapitre.
const LIGHT =
  "before:pointer-events-none before:absolute before:inset-0 before:content-[''] before:[background:radial-gradient(70%_110%_at_100%_0%,rgb(201_169_110/0.11),transparent_62%)]";

/**
 * Tête des pages de service (aide, contact, tailles, mentions légales) : chapitre noir compact,
 * titre révélé mot à mot, chapeau aligné sur la dernière ligne du titre.
 * @param {{
 *   eyebrow: import('react').ReactNode, title: string, lead?: import('react').ReactNode,
 *   aside?: import('react').ReactNode, className?: string, children?: import('react').ReactNode
 * }} props
 *   title : *mot* → italique, « \n » → retour à la ligne (voir SplitText) · aside : contenu libre sous le chapeau
 *   children : bande pleine largeur sous le titre (recherche, coordonnées…)
 */
export default function PageHero({ eyebrow, title, lead, aside, className, children }) {
  return (
    <Section tone="noir" first pad={false} className={cn('pb-14 lg:pb-20', LIGHT, className)} innerClassName="relative">
      <div className="grid gap-y-8 lg:grid-cols-12 lg:items-end lg:gap-x-6">
        <div className="lg:col-span-8">
          <Reveal y={12}>
            <Eyebrow rule className="mb-6 md:mb-8">
              {eyebrow}
            </Eyebrow>
          </Reveal>
          <SplitText as="h1" className="text-display" text={title} />
        </div>
        {lead || aside ? (
          <Reveal delay={0.25} className="lg:col-span-4 lg:pb-3">
            {lead ? <p className="max-w-[40ch] text-lead text-muted">{lead}</p> : null}
            {aside}
          </Reveal>
        ) : null}
      </div>
      {children}
    </Section>
  );
}
