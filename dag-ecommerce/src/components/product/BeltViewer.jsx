import { useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { usePrefersReducedMotion } from '../../hooks';
import BeltCanvas from '../../three/BeltCanvas';
import { Icon, Packshot, cn } from '../ui';
import { useImageStatus } from './useImageStatus';
import { useSceneLive } from './useSceneLive';

const VIEWS = [
  { id: 'full', label: 'Ensemble' },
  { id: 'boucle', label: 'Boucle' },
  { id: 'cuir', label: 'Cuir' },
  { id: 'couture', label: 'Couture' },
];
const MONOGRAM_VIEW = { id: 'monogramme', label: 'Monogramme' };

const CHIP =
  'flex min-h-11 items-center px-3.5 text-[0.625rem] font-semibold uppercase tracking-[0.2em] transition-colors duration-500 ease-luxe';

/**
 * « Voir en 3D » : la ceinture du coloris choisi (et son monogramme) en temps réel, à faire
 * tourner du doigt ou de la souris, sur une tuile de studio claire.
 *
 * La scène n'est montée que lorsque le bloc entre dans la fenêtre, ou sur demande (`requested`) ;
 * d'ici là — et si WebGL manque — le visuel studio tient lieu d'image. La consigne et les commandes
 * (rotation automatique, cadrages) n'existent que pendant que la scène tourne : sans elle, le bloc
 * est une simple image, qui ne promet rien.
 *
 * @param {{
 *   belt: object, monogram?: string, monogramStyle?: string, poster: string, alt: string,
 *   requested?: boolean, className?: string
 * }} props
 *   belt : BeltConfig du coloris · poster : visuel studio du coloris · requested : monte la scène sans attendre
 */
export default function BeltViewer({ belt, monogram = '', monogramStyle, poster, alt, requested = false, className }) {
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, amount: 0.2 });
  const reducedMotion = usePrefersReducedMotion();
  const [view, setView] = useState('full');
  const [spinning, setSpinning] = useState(false);
  // le visuel studio existe-t-il ? Sinon BeltCanvas n'aurait rien à montrer pendant le chargement.
  const posterOk = useImageStatus(poster) === 'loaded';
  // la scène dessine : faux tant qu'elle se prépare, sans WebGL, ou après un contexte perdu
  const live = useSceneLive(ref);

  const active = seen || requested;
  const views = monogram ? [...VIEWS, MONOGRAM_VIEW] : VIEWS;
  const currentView = views.some((entry) => entry.id === view) ? view : 'full';
  const config = { ...belt, monogram, monogramStyle };

  return (
    <div ref={ref} className={cn('tone-papier relative isolate overflow-hidden bg-papier', className)}>
      <span aria-hidden="true" className="studio-light pointer-events-none absolute inset-0" />

      {/*
        Visuel studio : tient la place avant la scène, et sert de repli si son image manque.
        Il s'efface sans transition : dès que BeltCanvas affiche le même visuel (poster) ou que la
        scène dessine, il ne doit plus être peint — un fondu pourrait rester en attente pendant que
        la scène 3D occupe le navigateur, et laisser le dessin visible derrière la ceinture.
      */}
      <div aria-hidden={active ? true : undefined} className={cn('absolute inset-0', active && (posterOk || live) ? 'invisible' : 'visible')}>
        <Packshot src={poster} alt={active ? '' : alt} belt={belt} ratio="auto" surface="none" className="size-full" />
      </div>

      {active ? (
        <BeltCanvas
          config={config}
          pose="coil"
          view={currentView}
          interactive
          autoRotate={spinning && !reducedMotion ? 0.6 : false}
          poster={posterOk ? poster : undefined}
          // pas de curseur ici : la scène pose elle-même la main (saisir, glisser) tant qu'elle peut tourner
          className="absolute inset-0 size-full"
        />
      ) : null}

      {live ? (
        <div className="page-enter pointer-events-none absolute inset-0">
          <p className="eyebrow absolute left-2 top-2 flex min-h-11 items-center gap-2.5 bg-papier/85 px-3.5 text-[0.625rem] sm:left-5 sm:top-5">
            <Icon name="rotate-3d" size={16} className="text-accent" />
            Glissez pour faire tourner
          </p>

          {!reducedMotion ? (
            <button
              type="button"
              onClick={() => setSpinning((value) => !value)}
              aria-pressed={spinning}
              aria-label="Rotation automatique"
              className="pointer-events-auto absolute right-2 top-2 grid size-11 place-items-center bg-papier/85 text-fg transition-colors duration-300 hover:text-accent sm:right-5 sm:top-5"
            >
              <Icon name={spinning ? 'pause' : 'play'} size={18} />
            </button>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 flex px-2 pb-2 sm:pb-5">
            <div
              role="radiogroup"
              aria-label="Cadrage"
              className="pointer-events-auto mx-auto flex max-w-full overflow-x-auto bg-papier/85 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {views.map((entry) => {
                const checked = entry.id === currentView;
                return (
                  <label
                    key={entry.id}
                    className={cn(
                      CHIP,
                      'shrink-0 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent',
                      checked ? 'bg-fg text-bg' : 'text-fg hover:text-accent',
                    )}
                  >
                    <input
                      type="radio"
                      name="cadrage-3d"
                      value={entry.id}
                      checked={checked}
                      onChange={() => setView(entry.id)}
                      className="sr-only"
                    />
                    {entry.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
