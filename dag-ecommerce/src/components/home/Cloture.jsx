import { Button, Reveal, SplitText } from '../ui';

/** Clôture : une dernière ligne, une seule action. Le pied de page prend la suite. */
export default function Cloture() {
  return (
    <section aria-labelledby="cloture-titre" className="theme-noir relative overflow-hidden">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:radial-gradient(52%_70%_at_50%_100%,rgb(201_169_110/0.1),transparent_70%)]"
      />
      <div className="container-luxe section-pad relative flex flex-col items-center text-center">
        <SplitText
          as="h2"
          id="cloture-titre"
          className="font-display text-[clamp(3.75rem,11.5vw,11.5rem)] leading-[0.88] tracking-[-0.035em]"
          text={'Il ne reste\nqu’à la *boucler*.'}
        />
        <Reveal delay={0.35} className="mt-10 md:mt-14">
          <Button to="/shop" size="lg" icon="arrow-right">
            Découvrir la collection
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
