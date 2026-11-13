import { useState } from 'react';
import { AnimatePresence, motion as Motion } from 'motion/react';
import { describeBelt } from '../../data/atelier';
import { usePrefersReducedMotion, useScrollState } from '../../hooks';
import BeltCanvas from '../../three/BeltCanvas';
import { BeltThumb, Icon, cn } from '../ui';
import { nbspUnits } from './atelier-state';
import FramingChips from './FramingChips';
import { BLANK_POSTER, stagePoster } from './stage-poster';
import SurfaceToggle from './SurfaceToggle';
import { supportsWebGL2, useSceneStatus } from './useSceneStatus';

// Fond de scène : le dégradé de studio, peint sous un canvas transparent.
const BACKDROPS = {
  noir: 'radial-gradient(120% 90% at 50% 46%, #1d1712 0%, #130f0c 42%, #0b0a09 100%)',
  ivoire: 'radial-gradient(125% 95% at 50% 46%, #f7f2e9 0%, #f1ebe1 48%, #e7dfd1 100%)',
};

const OVERLAY_TOP = 'top-2 lg:top-[calc(var(--header-h)+0.75rem)]';

/**
 * Scène de l'Atelier : la ceinture en 3D, à faire tourner, avec ses réglages de vue (cadrage,
 * rotation automatique, fond noir ou ivoire).
 *
 * Collante : sous l'en-tête sur mobile (elle le suit quand il se replie ; hauteur --stage-h, posée
 * par la page), pleine hauteur à partir de lg. Sans WebGL, ou si la scène tombe, elle devient un
 * dessin de la composition sur fond ivoire : la page reste un configurateur complet.
 *
 * @param {{
 *   config: object, view: string, onView: (view: string) => void,
 *   surface: 'noir'|'ivoire', onSurface: (surface: 'noir'|'ivoire') => void,
 *   onReady: (api: { capture: Function }) => void, hint: boolean, onHintDone: () => void
 * }} props
 *   hint : montrer « Glissez pour tourner » · onHintDone : le visiteur a saisi la ceinture
 */
export default function Stage({ config, view, onView, surface, onSurface, onReady, hint, onHintDone }) {
  const reducedMotion = usePrefersReducedMotion();
  const { scrolled } = useScrollState();
  const [webgl] = useState(supportsWebGL2);
  const [root, setRoot] = useState(null);
  const status = useSceneStatus(root);
  const [spinning, setSpinning] = useState(false);

  // Sans WebGL, ou scène tombée (contexte perdu, erreur) : un dessin de la composition tient lieu
  // de 3D. BeltCanvas reste monté dans le second cas : il sait repartir quand le visiteur revient.
  const down = !webgl || status === 'failed';
  const ready = status === 'ready';
  // le dessin de repli est fait pour le papier : sans 3D, la scène est toujours claire
  const tone = down ? 'ivoire' : surface;
  const poster = down ? null : stagePoster(config, tone);
  const label = `Ceinture DAG — ${nbspUnits(describeBelt(config))}`;

  return (
    <div
      ref={setRoot}
      data-atelier-stage
      data-header-tone={tone}
      className={cn(
        tone === 'ivoire' ? 'theme-ivoire' : 'theme-noir',
        'sticky top-[var(--header-offset)] z-20 flex h-[var(--stage-h)] flex-col',
        'transition-[top] duration-700 ease-luxe motion-reduce:transition-none',
        'lg:top-0 lg:h-svh lg:border-r lg:border-line',
      )}
    >
      {/*
        Fond : prolongé sous l'en-tête sur mobile, pour que le bandeau survole toujours la scène.
        Il reste « touchable » : c'est lui que l'en-tête rencontre pour choisir son ton.
      */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 top-[calc(var(--header-h)*-1)] lg:top-0">
        <span className="absolute inset-0" style={{ background: BACKDROPS.ivoire }} />
        <span
          className={cn(
            'absolute inset-0 transition-opacity duration-700 ease-luxe motion-reduce:transition-none',
            tone === 'noir' ? 'opacity-100' : 'opacity-0',
          )}
          style={{ background: BACKDROPS.noir }}
        />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden" onPointerDownCapture={hint ? onHintDone : undefined}>
        {down ? (
          <div className="absolute inset-0 grid place-items-center px-6 pt-4 lg:pb-10 lg:pt-[var(--header-h)]">
            <BeltThumb belt={config} title={label} className="h-full max-h-[36rem] w-auto max-w-full" />
          </div>
        ) : null}

        {/* Esquisse d'attente : seulement sur ivoire, et seulement s'il n'existe aucun rendu exact. */}
        {!down && tone === 'ivoire' && !poster ? (
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 grid place-items-center p-[9%] transition-opacity duration-700 ease-luxe',
              ready ? 'opacity-0' : 'opacity-100',
            )}
          >
            <BeltThumb belt={config} className="h-full w-auto max-w-full" />
          </div>
        ) : null}

        {webgl ? (
          <BeltCanvas
            config={config}
            pose="coil"
            view={view}
            interactive
            autoRotate={spinning && !reducedMotion ? 0.5 : false}
            poster={poster ?? BLANK_POSTER}
            onReady={onReady}
            // contour de focus rentré : le conteneur est bord à bord, un contour extérieur serait rogné
            className={cn('absolute inset-0 size-full focus-visible:-outline-offset-4', down && 'invisible')}
          />
        ) : null}

        {down ? null : (
          <>
            {/*
              Voile sous l'en-tête, en haut de page seulement : là, le bandeau est transparent et
              doit rester lisible quand un gros plan remplit la scène. Ensuite il porte son propre fond.
            */}
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 hidden h-44 bg-linear-to-b from-bg/85 to-transparent transition-opacity duration-700 ease-luxe lg:block',
                scrolled ? 'opacity-0' : 'opacity-100',
              )}
            />

            {!ready ? (
              <p
                role="status"
                className={cn(
                  'eyebrow pointer-events-none absolute inset-x-0 flex items-center justify-center gap-3 text-[0.625rem] text-fg/75',
                  // rien d'autre à montrer (fond noir, composition sans rendu) : l'attente occupe le centre de la scène
                  poster || tone === 'ivoire' ? 'bottom-3 lg:bottom-24' : 'inset-y-0',
                )}
              >
                <span aria-hidden="true" className="size-3.5 animate-spin-slow rounded-full border border-current border-t-transparent" />
                La vue 3D se prépare
              </p>
            ) : null}

            <AnimatePresence>
              {ready && hint ? (
                <Motion.p
                  key="geste"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.6 }}
                  className={cn('eyebrow pointer-events-none absolute left-2 flex min-h-11 items-center gap-2.5 bg-bg/70 px-3.5 text-[0.625rem] lg:left-6', OVERLAY_TOP)}
                >
                  <Icon name="rotate-3d" size={16} className="text-accent" />
                  Glissez pour tourner
                </Motion.p>
              ) : null}
            </AnimatePresence>

            <div className={cn('absolute right-2 flex items-center bg-bg/70 lg:right-6', OVERLAY_TOP)}>
              <SurfaceToggle value={surface} onChange={onSurface} />
              {!reducedMotion ? (
                <button
                  type="button"
                  onClick={() => setSpinning((value) => !value)}
                  aria-pressed={spinning}
                  aria-label="Rotation automatique"
                  className="grid size-11 place-items-center text-fg transition-colors duration-300 hover:text-accent"
                >
                  <Icon name={spinning ? 'pause' : 'play'} size={18} />
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {down ? (
        <p className="relative flex min-h-11 items-center justify-center px-4 pb-1 text-center text-[0.75rem] leading-snug text-fg/75 lg:absolute lg:inset-x-0 lg:bottom-6">
          Aperçu dessiné. La vue 3D n’est pas disponible {webgl ? 'pour le moment' : 'sur cet appareil'}.
        </p>
      ) : (
        <div className="relative flex justify-center border-t border-line lg:pointer-events-none lg:absolute lg:inset-x-0 lg:bottom-6 lg:border-t-0 lg:px-6">
          <FramingChips
            view={view}
            onChange={onView}
            hasMonogram={Boolean(config.monogram)}
            className="lg:pointer-events-auto lg:bg-bg/70"
          />
        </div>
      )}
    </div>
  );
}
