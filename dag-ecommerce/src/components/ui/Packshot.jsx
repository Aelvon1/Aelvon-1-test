import { useState } from 'react';
import BeltThumb from './BeltThumb';
import { cn } from './cn';

const SURFACES = {
  papier: 'tone-papier bg-papier',
  craie: 'tone-craie bg-craie',
  none: '',
};

/**
 * Visuel produit détouré posé sur une tuile de studio claire.
 * Réserve sa place (aucun saut de mise en page), apparaît en fondu une fois chargé et
 * affiche un dessin de ceinture (BeltThumb) si l'image manque ou échoue.
 * @param {{
 *   src?: string|null, alt?: string, belt?: Partial<import('../../data/atelier').BeltConfig>,
 *   hoverSrc?: string, hoverFit?: 'cover'|'contain', ratio?: string, surface?: 'papier'|'craie'|'none',
 *   loading?: 'lazy'|'eager', className?: string, children?: import('react').ReactNode
 * }} props
 *   ratio : rapport largeur/hauteur CSS (défaut « 4 / 5 ») · hoverSrc : second visuel en fondu croisé
 *   au survol (de la tuile ou d'un ancêtre `.group`) · hoverFit : « cover » (défaut) fait remplir la
 *   tuile au second visuel — les gros plans sont cadrés bord à bord et seraient coupés net au milieu
 *   d'une tuile non carrée ; « contain » le montre en entier, pour un visuel détouré avec ses marges
 *   children : calques posés sur la tuile (étiquette, bouton favori) — ils héritent d'une palette
 *   sombre sur clair.
 */
export default function Packshot({
  src,
  alt = '',
  belt,
  hoverSrc,
  hoverFit = 'cover',
  ratio = '4 / 5',
  surface = 'papier',
  loading = 'lazy',
  className,
  children,
  ...rest
}) {
  // état lié à l'URL : changer de visuel repart de « loading » sans effet ni clé
  const [status, setStatus] = useState({ src, state: 'loading' });
  const [hoverReady, setHoverReady] = useState(null);
  const state = !src ? 'error' : status.src === src ? status.state : 'loading';
  const failed = state === 'error';
  const showHover = Boolean(hoverSrc) && !failed;

  return (
    <div
      className={cn('packshot relative isolate overflow-hidden', SURFACES[surface] ?? SURFACES.papier, className)}
      style={{ aspectRatio: ratio }}
      data-hover-ready={showHover && hoverReady === hoverSrc}
      {...rest}
    >
      {surface !== 'none' ? <span aria-hidden="true" className="studio-light pointer-events-none absolute inset-0" /> : null}

      {failed ? (
        <BeltThumb belt={belt} title={alt || undefined} className="absolute inset-0 m-auto h-[78%] w-[78%]" />
      ) : (
        <img
          key={src}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable="false"
          onLoad={() => setStatus({ src, state: 'loaded' })}
          onError={() => setStatus({ src, state: 'error' })}
          className={cn(
            'packshot-img packshot-base absolute inset-0 size-full object-contain',
            state === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}

      {showHover ? (
        <img
          key={hoverSrc}
          src={hoverSrc}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable="false"
          onLoad={() => setHoverReady(hoverSrc)}
          onError={() => setHoverReady(null)}
          className={cn(
            'packshot-img packshot-hover absolute inset-0 size-full opacity-0',
            hoverFit === 'contain' ? 'object-contain' : 'object-cover',
          )}
        />
      ) : null}

      {children}
    </div>
  );
}
