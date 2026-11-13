import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

/**
 * Bandeau défilant en boucle continue. Se met en pause au survol et au focus ;
 * immobile si l'utilisateur préfère moins d'animations.
 * @param {{
 *   speed?: number, direction?: 'left'|'right', pauseOnHover?: boolean, gap?: string, fade?: boolean,
 *   className?: string, children?: import('react').ReactNode
 * }} props
 *   speed : px par seconde (défaut 40) · gap : espace entre éléments (défaut « 3rem »)
 *   fade : estompe les bords · children : les éléments à faire défiler (une seule série)
 */
export default function Marquee({
  speed = 40,
  direction = 'left',
  pauseOnHover = true,
  gap = '3rem',
  fade = false,
  className,
  children,
  ...rest
}) {
  const groupRef = useRef(null);
  const [duration, setDuration] = useState(40);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const next = Math.max(4, Math.round(group.offsetWidth / Math.max(1, speed)));
      setDuration((previous) => (previous === next ? previous : next));
    });
    observer.observe(group);
    return () => observer.disconnect();
  }, [speed]);

  return (
    <div
      className={cn('marquee', className)}
      data-pause={pauseOnHover}
      data-fade={fade}
      style={{
        '--marquee-gap': gap,
        '--marquee-duration': `${duration}s`,
        '--marquee-direction': direction === 'right' ? 'reverse' : 'normal',
      }}
      {...rest}
    >
      <div ref={groupRef} className="marquee-group">
        {children}
      </div>
      <div className="marquee-group" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
