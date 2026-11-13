import { useEffect, useRef, useState } from 'react';
import { motion as Motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import { HERO_BELT, LEATHERS, getLeather } from '../../data/atelier';
import { scrollToTarget } from '../../hooks';
import { atelierPath } from '../../lib/atelier-url';
import BeltCanvas from '../../three/BeltCanvas';
import { Button, Eyebrow, Icon, SplitText, Swatches, cn } from '../ui';
import AnatomieChapitre from './AnatomieChapitre';
import { CHAPTERS, INTRO, POSTER_HERO } from './anatomie-content';
import { deuxChiffres } from './texte';

// Part du défilement accordée à chaque temps : l'ouverture, puis les quatre chapitres
// (le dernier dure un peu plus longtemps : on y manipule la ceinture).
const WEIGHTS = [0.7, 1, 1, 1, 1.2];
const TOTAL = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
// Début de chaque temps, en part (0 à 1) de la course ; la dernière valeur ferme la suite.
const STARTS = WEIGHTS.reduce((starts, weight) => [...starts, starts[starts.length - 1] + weight / TOTAL], [0]);
const LAST = WEIGHTS.length - 1;
// Temps laissé à l'enroulement (2,2 s dans la scène) avant de partir vers un gros plan, en ms.
const ROLL_HOLD = 1400;

function stepAt(progress) {
  let step = 0;
  for (let index = 1; index <= LAST; index += 1) {
    if (progress >= STARTS[index]) step = index;
  }
  return step;
}

const PANEL =
  'group/panel absolute inset-0 flex flex-col pt-4 transition-opacity duration-500 ease-luxe lg:justify-center lg:pb-10 lg:pt-0 data-[active=false]:pointer-events-none data-[active=false]:opacity-0 data-[active=true]:pointer-events-auto data-[active=true]:delay-150';

/** Repère d'un chapitre sur le rail : son filet se remplit au fil du défilement, un clic y conduit. */
function RailItem({ step, title, active, reached, progress, onSelect }) {
  const fill = useTransform(progress, [STARTS[step], STARTS[step + 1]], [0, 1]);
  return (
    <li className="min-w-0 flex-1">
      <button
        type="button"
        onClick={() => onSelect(step)}
        aria-current={active ? 'step' : undefined}
        className={cn(
          'relative flex min-h-11 w-full items-center gap-3 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.22em] transition-colors duration-500 ease-luxe lg:min-h-14',
          active ? 'text-fg' : 'text-muted hover:text-fg',
        )}
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-line" />
        <Motion.span aria-hidden="true" style={{ scaleX: fill }} className="absolute inset-x-0 top-0 h-px origin-left bg-accent" />
        <span className={cn('tabular-nums transition-colors duration-500 ease-luxe', reached && 'text-accent')}>{deuxChiffres(step)}</span>
        <span className="truncate max-sm:sr-only">{title}</span>
      </button>
    </li>
  );
}

/**
 * Anatomie, version épinglée : une scène 3D unique reste à l'écran pendant que le défilement
 * fait voyager la caméra de chapitre en chapitre. Le dernier chapitre rend la main : la ceinture
 * se fait tourner et change de cuir.
 * @param {{ onUnavailable: (step: number) => void }} props
 *   onUnavailable : appelé si la scène 3D ne démarre pas ou s'arrête pour de bon, avec le temps en
 *   cours (0 : ouverture, 1 à 4 : chapitres)
 */
export default function AnatomieStage({ onUnavailable }) {
  const trackRef = useRef(null);
  const stageRef = useRef(null);
  const lastStep = useRef(0);
  const rollTimer = useRef(0);
  const [step, setStep] = useState(0);
  const [rolled, setRolled] = useState(false);
  const [leather, setLeather] = useState(HERO_BELT.leather);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });

  // L'état React ne change qu'au passage d'un chapitre ; le rail, lui, suit la valeur de défilement.
  // En quittant l'ouverture, la ceinture s'enroule d'abord sous nos yeux (cadrage d'ensemble) ; la
  // caméra ne plonge vers le premier gros plan qu'une fois le rouleau formé.
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const next = stepAt(progress);
    const previous = lastStep.current;
    if (next === previous) return;
    lastStep.current = next;
    setStep(next);
    if (next === 0) {
      clearTimeout(rollTimer.current);
      setRolled(false);
    } else if (previous === 0) {
      rollTimer.current = setTimeout(() => setRolled(true), ROLL_HOLD);
    }
  });

  useEffect(() => () => clearTimeout(rollTimer.current), []);

  // La scène 3D ne tourne pas partout (rendu logiciel, appareil trop lent, contexte perdu) : BeltCanvas
  // reste alors à l'état « poster », ou y revient. Dans les deux cas, on rend la main à la version posée.
  useEffect(() => {
    const stage = stageRef.current;
    const host = stage?.querySelector('[data-belt-canvas]');
    if (!host) return undefined;
    let started = host.dataset.beltCanvas !== 'poster';
    let timer = 0;
    const states = new MutationObserver(() => {
      if (host.dataset.beltCanvas !== 'poster') started = true;
      else if (started) onUnavailable(lastStep.current);
    });
    states.observe(host, { attributes: true, attributeFilter: ['data-belt-canvas'] });
    // BeltCanvas se prépare 300 px avant l'écran : à 150 px, il aurait dû démarrer.
    const close = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!started && host.dataset.beltCanvas === 'poster') onUnavailable(lastStep.current);
        }, 400);
      },
      { rootMargin: '150px 0px' },
    );
    close.observe(stage);
    return () => {
      states.disconnect();
      close.disconnect();
      clearTimeout(timer);
    };
  }, [onUnavailable]);

  const goTo = (target, immediate = false) => {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const travel = track.offsetHeight - window.innerHeight;
    // on vise le premier tiers du chapitre : assez loin du seuil pour que la caméra se pose
    const position = STARTS[target] + (STARTS[target + 1] - STARTS[target]) * 0.35;
    scrollToTarget(Math.round(top + travel * position), { immediate });
  };

  const belt = { ...HERO_BELT, leather };
  const chapter = step > 0 ? CHAPTERS[step - 1] : null;
  const handsOn = step === LAST;

  return (
    <div ref={trackRef} className="relative" style={{ height: `${(TOTAL + 1) * 100}svh` }}>
      {/* --scene : hauteur de la scène 3D sur petit écran (le texte occupe le reste) */}
      <div ref={stageRef} data-header-tone="noir" className="sticky top-0 flex h-svh flex-col overflow-hidden [--scene:44svh] [@media(max-height:44rem)]:[--scene:40svh]">
        {/* La scène fond dans le noir du côté du texte et vers le rail : aucun bord visible. */}
        <BeltCanvas
          config={belt}
          pose={chapter ? 'coil' : 'flow'}
          view={chapter && rolled ? chapter.view : 'hero'}
          interactive={handsOn}
          poster={POSTER_HERO}
          className="peer absolute inset-x-0 top-0 h-(--scene) outline-none [mask-image:linear-gradient(to_bottom,#000_72%,transparent)] lg:inset-y-0 lg:left-auto lg:h-auto lg:w-[66%] lg:[mask-composite:intersect] lg:[mask-image:linear-gradient(to_right,transparent_6%,#000_30%),linear-gradient(to_bottom,#000_70%,transparent_92%)]"
        />

        {/* Le masque efface aussi le contour de focus de la scène : ce cadre, hors masque, le remplace. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-3 top-3 h-[calc(var(--scene)-1.5rem)] border-2 border-accent opacity-0 transition-opacity duration-300 peer-focus-visible:opacity-100 lg:inset-y-3 lg:left-auto lg:right-3 lg:h-auto lg:w-[calc(66%-1.5rem)]"
        />

        <p
          aria-hidden="true"
          className={cn(
            'eyebrow pointer-events-none absolute right-[clamp(1.25rem,4vw,4rem)] top-[calc(var(--scene)-3.5rem)] flex items-center gap-2.5 text-fg transition-opacity duration-700 ease-luxe lg:bottom-24 lg:top-auto',
            handsOn ? 'opacity-100 delay-700' : 'opacity-0',
          )}
        >
          <Icon name="rotate-3d" size={18} className="text-accent" />
          Faites-la tourner
        </p>

        <div className="pointer-events-none relative flex min-h-0 flex-1 flex-col pt-(--scene) lg:pt-0">
          <nav aria-label="Chapitres de l’anatomie" className="container-luxe pointer-events-auto lg:order-last lg:pb-4">
            <ol className="flex gap-2 sm:gap-4 lg:gap-6">
              {CHAPTERS.map((entry, index) => (
                <RailItem
                  key={entry.id}
                  step={index + 1}
                  title={entry.title}
                  active={step === index + 1}
                  reached={step >= index + 1}
                  progress={scrollYProgress}
                  onSelect={goTo}
                />
              ))}
            </ol>
          </nav>

          <div className="container-luxe relative min-h-0 flex-1 lg:pt-header">
            <div className="relative h-full lg:w-[36%]">
              <div data-active={step === 0} className={PANEL}>
                <Eyebrow rule className="mb-5 lg:mb-8">
                  {INTRO.eyebrow}
                </Eyebrow>
                <SplitText
                  as="h2"
                  id="anatomie-titre"
                  className="font-display text-[clamp(2.75rem,5vw,5.5rem)] leading-[0.98] tracking-[-0.02em]"
                  text={INTRO.title}
                />
                <p className="mt-5 text-lead text-muted lg:mt-8">{INTRO.lead}</p>
                <p className="eyebrow mt-8 flex items-center gap-3 text-muted lg:mt-12">
                  <Icon name="arrow-down" size={16} className="text-accent" />
                  Faites défiler
                </p>
              </div>

              {CHAPTERS.map((entry, index) => {
                const active = step === index + 1;
                const last = index === CHAPTERS.length - 1;
                return (
                  <div
                    key={entry.id}
                    data-active={active}
                    className={PANEL}
                    // un contrôle atteint au clavier dans un chapitre masqué : la page s'y rend
                    onFocusCapture={active ? undefined : () => goTo(index + 1, true)}
                  >
                    <AnatomieChapitre chapter={entry} index={index} belt={belt} facts={!last} compact>
                      {last ? (
                        <div className="mt-4 max-w-[26rem] border-t border-line pt-3 lg:mt-8 lg:pt-5">
                          <div className="flex items-baseline justify-between gap-4">
                            <p id="anatomie-nuancier" className="eyebrow text-[0.625rem] text-muted">
                              À vous. Changez de cuir
                            </p>
                            <p className="text-[0.8125rem] text-fg">{getLeather(leather).name}</p>
                          </div>
                          <Swatches
                            // cinq pastilles par rangée tant que la colonne ne peut pas en aligner neuf ;
                            // grand écran : la place de l'infobulle, sous la ligne de libellé
                            className="mt-1 w-[13.75rem] lg:mt-5 xl:w-auto"
                            options={LEATHERS}
                            value={leather}
                            onChange={setLeather}
                            labelledBy="anatomie-nuancier"
                          />
                          <Button to={atelierPath(belt)} icon="arrow-right" size="sm" className="mt-3 lg:mt-5 lg:min-h-13 lg:px-7">
                            Poursuivre à l’Atelier
                          </Button>
                        </div>
                      ) : null}
                    </AnatomieChapitre>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
