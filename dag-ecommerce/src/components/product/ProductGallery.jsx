import { useRef, useState } from 'react';
import { productGallery } from '../../data/products';
import { useMediaQuery, usePrefersReducedMotion } from '../../hooks';
import { Button, Icon, Packshot, cn } from '../ui';
import Lightbox from './Lightbox';

const pad = (n) => String(n).padStart(2, '0');

// Étiquette posée sur une tuile : lisible quel que soit le visuel dessous (clair ou gros plan sombre).
const LABEL = 'tone-papier pointer-events-none absolute bg-papier/90 text-fg';

/** Bureau : la vue studio en grand, les deux gros plans dessous. */
function GalleryGrid({ shots, belt, onOpen, action }) {
  return (
    <ul className="grid grid-cols-2 gap-4 xl:gap-6">
      {shots.map((shot, index) => {
        const hero = index === 0;
        return (
          <li key={shot.id} className={cn('group relative', hero && 'col-span-2')}>
            <Packshot
              src={shot.src}
              alt={shot.alt}
              belt={belt}
              ratio="1 / 1"
              loading={hero ? 'eager' : 'lazy'}
            />
            <button
              type="button"
              onClick={() => onOpen(index)}
              aria-label={`Agrandir le visuel : ${shot.label}`}
              className="absolute inset-0 cursor-zoom-in focus-visible:-outline-offset-4"
            />
            <span className={cn(LABEL, 'eyebrow bottom-4 left-4 px-2.5 py-2 text-[0.625rem] leading-none')}>
              <span className="tabular-nums text-accent">{pad(index + 1)}</span>
              <span className="ml-2.5">{shot.label}</span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                LABEL,
                'right-4 top-4 grid size-9 place-items-center opacity-0 transition-opacity duration-500 ease-luxe group-focus-within:opacity-100 group-hover:opacity-100',
              )}
            >
              <Icon name="expand" size={16} />
            </span>
            {hero && action ? <div className="tone-papier absolute bottom-4 right-4">{action}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Mobile : carrousel à glisser, aimanté sur chaque visuel, avec repères de position. */
function GalleryCarousel({ shots, belt, onOpen, action }) {
  const trackRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const [current, setCurrent] = useState(0);

  const onScroll = (event) => {
    const track = event.currentTarget;
    if (!track.clientWidth) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    setCurrent((previous) => (previous === index ? previous : index));
  };

  const goTo = (index) => {
    const track = trackRef.current;
    track?.scrollTo({ left: index * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div>
      <div className="relative -mx-[clamp(1.25rem,4vw,4rem)]">
        <ul
          ref={trackRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {shots.map((shot, index) => (
            <li key={shot.id} className="relative w-full shrink-0 snap-center">
              <Packshot src={shot.src} alt={shot.alt} belt={belt} ratio="1 / 1" loading={index === 0 ? 'eager' : 'lazy'} />
              <button
                type="button"
                onClick={() => onOpen(index)}
                aria-label={`Agrandir le visuel : ${shot.label}`}
                className="absolute inset-0 focus-visible:-outline-offset-4"
              />
            </li>
          ))}
        </ul>
        {action ? <div className="tone-papier absolute bottom-4 right-[clamp(1.25rem,4vw,4rem)]">{action}</div> : null}
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <p className="eyebrow flex min-w-0 items-center gap-3 text-[0.625rem]" aria-live="polite" aria-atomic="true">
          <span className="shrink-0 whitespace-nowrap tabular-nums">
            <span className="text-accent">{pad(current + 1)}</span> / {pad(shots.length)}
          </span>
          <span className="min-w-0 truncate text-muted">{shots[current]?.label}</span>
        </p>
        <div className="-mr-2 flex shrink-0" role="group" aria-label="Choisir un visuel">
          {shots.map((shot, index) => (
            <button
              key={shot.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${shot.label} (${index + 1} sur ${shots.length})`}
              aria-current={index === current ? 'true' : undefined}
              className="grid size-11 place-items-center"
            >
              <span
                className={cn(
                  'h-px w-7 transition-[background-color,transform] duration-500 ease-luxe',
                  index === current ? 'scale-y-[2] bg-fg' : 'bg-fg/30',
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Galerie d'un produit : les trois plans du coloris choisi, sur tuiles de studio.
 * Un clic (ou Entrée) ouvre la visionneuse plein écran. Les visuels suivent le coloris.
 * @param {{ product: object, color: object, onView3d?: () => void }} props
 *   color : entrée de product.colors · onView3d : affiche le bouton « Voir en 3D » sur la vue studio
 */
export default function ProductGallery({ product, color, onView3d }) {
  const desktop = useMediaQuery('(min-width: 64rem)');
  // l'index reste en place pendant la fermeture : la visionneuse s'efface sans changer de visuel
  const [viewer, setViewer] = useState({ open: false, index: 0 });
  const shots = productGallery(product, color.value);
  const open = (index) => setViewer({ open: true, index });

  const action = onView3d ? (
    <Button variant="outline" size="sm" icon="rotate-3d" iconPosition="left" onClick={onView3d} className="bg-papier/80">
      Voir en 3D
    </Button>
  ) : null;

  return (
    <>
      {desktop ? (
        <GalleryGrid shots={shots} belt={color.belt} onOpen={open} action={action} />
      ) : (
        <GalleryCarousel shots={shots} belt={color.belt} onOpen={open} action={action} />
      )}
      <Lightbox
        open={viewer.open}
        index={viewer.index}
        shots={shots}
        belt={color.belt}
        title={`${product.name}, ${color.name} — visuels agrandis`}
        onClose={() => setViewer((state) => ({ ...state, open: false }))}
      />
    </>
  );
}
