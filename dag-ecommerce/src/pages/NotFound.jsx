import { useEffect } from 'react';
import { Button, Eyebrow, Reveal, SplitText } from '../components/ui';
import { usePageMeta } from '../hooks';

const HOLES = [846, 912, 978, 1044, 1110];

/** Le bout d'une ceinture, ses cinq crans — et un sixième, un cran trop loin. */
function BeltEnd() {
  return (
    <div aria-hidden="true" className="relative mt-auto w-full pt-10">
      <svg viewBox="0 0 1440 220" preserveAspectRatio="xMaxYMid slice" className="h-28 w-full text-fg">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-20 78H1160Q1200 78 1218 110Q1200 142 1160 142H-20" strokeWidth="1.5" opacity="0.55" />
          <path d="M-20 88H1157Q1190 89 1203 110Q1190 131 1157 132H-20" strokeWidth="1" strokeDasharray="7 7" opacity="0.28" />
          {HOLES.map((x) => (
            <circle key={x} cx={x} cy="110" r="6.5" strokeWidth="1.5" opacity="0.55" />
          ))}
        </g>
        <g className="text-accent" fill="none" stroke="currentColor">
          <circle cx="1316" cy="110" r="6.5" strokeWidth="1.5" />
          <circle cx="1316" cy="110" r="17" strokeWidth="1" strokeDasharray="2 6" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

export default function NotFound() {
  usePageMeta({
    title: 'Page introuvable',
    description: 'Cette page n’existe pas, ou n’existe plus. Retrouvez la collection DAG ou revenez à l’accueil.',
  });

  // Une page d'erreur n'a pas à être indexée.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <section className="theme-noir relative flex min-h-svh flex-col overflow-hidden">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:radial-gradient(65%_85%_at_100%_100%,rgb(201_169_110/0.12),transparent_62%)]"
      />
      <div className="container-luxe relative flex flex-1 flex-col pt-[calc(var(--header-h)+clamp(2.75rem,5vw,5rem))]">
        <Reveal y={12}>
          <Eyebrow rule className="mb-7 md:mb-9">
            Erreur 404
          </Eyebrow>
        </Reveal>
        <SplitText as="h1" className="text-hero" text={'Un cran\ntrop *loin*.'} />
        <Reveal delay={0.35} className="mt-9 md:mt-12">
          <p className="max-w-[38ch] text-lead text-muted">
            Cette page n’existe pas, ou n’existe plus. La collection, elle, est toujours à sa place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button to="/shop" size="lg" icon="arrow-right">
              Voir la collection
            </Button>
            <Button to="/" variant="outline" size="lg">
              Retour à l’accueil
            </Button>
          </div>
        </Reveal>
      </div>
      <BeltEnd />
      <div className="h-8 lg:h-10" />
    </section>
  );
}
