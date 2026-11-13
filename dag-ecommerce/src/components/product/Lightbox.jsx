import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion as Motion, useReducedMotion } from 'motion/react';
import { useFocusTrap, useScrollLock } from '../../hooks';
import { EASE_LUXE, Icon, Packshot, cn } from '../ui';

const pad = (n) => String(n).padStart(2, '0');

// aria-disabled, jamais disabled : une commande désactivée alors qu'elle porte le focus le laisserait
// retomber hors de la fenêtre, où les flèches du clavier ne sont plus entendues.
const CONTROL =
  'grid size-12 place-items-center text-fg transition-colors duration-300 hover:text-accent aria-disabled:cursor-not-allowed aria-disabled:text-fg/25';

/** Fenêtre de la visionneuse : montée à chaque ouverture, elle repart du visuel demandé. */
function Viewer({ layerRef, title, shots, belt, startIndex, reduced, onClose }) {
  const trackRef = useRef(null);
  const [current, setCurrent] = useState(startIndex);
  // Visuel visé par la dernière commande (flèche, repère). Le défilement adouci n'y est pas encore :
  // `current`, lu dans la position de la bande, le rejoint avec retard. null : le visiteur fait défiler lui-même.
  const aim = useRef(null);
  const last = shots.length - 1;

  // se place sur le visuel demandé avant la première image
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = startIndex * track.clientWidth;
  }, [startIndex]);

  const goTo = (index) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.min(last, Math.max(0, index));
    aim.current = next;
    track.scrollTo({ left: next * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    if (reduced) setCurrent(next);
  };

  /** Avance ou recule depuis le visuel visé : deux commandes rapprochées comptent pour deux. */
  const step = (delta) => goTo((aim.current ?? current) + delta);

  const release = () => {
    aim.current = null;
  };

  const onScroll = (event) => {
    const track = event.currentTarget;
    if (!track.clientWidth) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    setCurrent((previous) => (previous === index ? previous : index));
  };

  const onKeyDown = (event) => {
    const moves = { ArrowRight: () => step(1), ArrowLeft: () => step(-1), Home: () => goTo(0), End: () => goTo(last) };
    if (!(event.key in moves)) return;
    event.preventDefault();
    moves[event.key]();
  };

  return (
    <Motion.div
      ref={layerRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      data-focus-layer
      data-tone-ignore
      onKeyDown={onKeyDown}
      className="tone-craie fixed inset-0 z-[70] flex flex-col bg-craie outline-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.5, ease: EASE_LUXE }}
    >
      <header className="relative flex h-[4.75rem] shrink-0 items-center justify-between gap-6 pl-5 pr-3 sm:pl-8 sm:pr-6">
        <p className="eyebrow flex min-w-0 items-center gap-4" aria-live="polite" aria-atomic="true">
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            <span className="text-accent">{pad(current + 1)}</span> / {pad(shots.length)}
          </span>
          <span aria-hidden="true" className="hidden h-px w-8 shrink-0 bg-current opacity-40 sm:block" />
          <span className="min-w-0 truncate text-muted">{shots[current]?.label}</span>
        </p>
        <button type="button" onClick={onClose} aria-label="Fermer la visionneuse" className={cn(CONTROL, 'shrink-0')}>
          <Icon name="close" size={24} />
        </button>
      </header>

      <ul
        ref={trackRef}
        data-lenis-prevent
        onScroll={onScroll}
        onPointerDown={release}
        onWheel={release}
        className="relative flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shots.map((shot, index) => (
          <li
            key={shot.id}
            aria-hidden={index === current ? undefined : true}
            className="grid h-full w-full shrink-0 snap-center place-items-center [container-type:size] sm:px-20"
          >
            {/* un tirage carré posé sur son passe-partout : le plus grand carré que l'écran permet */}
            <Packshot
              src={shot.src}
              alt={shot.alt}
              belt={belt}
              ratio="1 / 1"
              loading="eager"
              className="w-[min(100cqw,100cqh,72rem)]"
            />
          </li>
        ))}
      </ul>

      <footer className="relative flex h-[5.5rem] shrink-0 items-center justify-center gap-2 pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={() => step(-1)} aria-disabled={current === 0} aria-label="Visuel précédent" className={CONTROL}>
          <Icon name="arrow-left" size={22} />
        </button>
        <div className="flex items-center" role="group" aria-label="Choisir un visuel">
          {shots.map((shot, index) => (
            <button
              key={shot.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${shot.label} (${index + 1} sur ${shots.length})`}
              aria-current={index === current ? 'true' : undefined}
              className="group/dot grid h-12 w-11 place-items-center"
            >
              <span
                className={cn(
                  'h-px w-7 transition-[background-color,transform] duration-500 ease-luxe',
                  index === current ? 'scale-y-[2] bg-fg' : 'bg-fg/30 group-hover/dot:bg-fg/60',
                )}
              />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => step(1)} aria-disabled={current === last} aria-label="Visuel suivant" className={CONTROL}>
          <Icon name="arrow-right" size={22} />
        </button>
      </footer>
    </Motion.div>
  );
}

/**
 * Visionneuse plein écran des visuels d'un produit : chaque tirage sur sa tuile de studio, posé sur un fond clair.
 * Flèches gauche / droite, Début et Fin pour passer d'un visuel à l'autre ; Échap pour fermer ;
 * glissement au doigt sur écran tactile. Le focus est enfermé puis rendu au déclencheur.
 * @param {{
 *   open: boolean, onClose: () => void, shots: Array<{ id: string, label: string, src: string, alt: string }>,
 *   index?: number, belt?: object, title: string
 * }} props
 *   index : visuel affiché à l'ouverture · belt : configuration pour le dessin de repli
 *   title : nom accessible de la fenêtre
 */
export default function Lightbox({ open, onClose, shots, index = 0, belt, title }) {
  const layerRef = useRef(null);
  const reduced = useReducedMotion();

  useScrollLock(open);
  useFocusTrap(layerRef, open, { onEscape: onClose });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <Viewer
          key="visionneuse"
          layerRef={layerRef}
          title={title}
          shots={shots}
          belt={belt}
          startIndex={index}
          reduced={Boolean(reduced)}
          onClose={onClose}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
