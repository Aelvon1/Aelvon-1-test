import { useEffect, useRef } from 'react';
import { cn } from '../ui';

/**
 * Colonne collante de la fiche produit (à partir de lg). Elle se cale sous l'en-tête ; si son
 * contenu dépasse la hauteur de l'écran, elle défile jusqu'à montrer son pied, puis se fige là —
 * le bouton d'achat n'est jamais hors de portée.
 * @param {{ className?: string, children?: import('react').ReactNode }} props
 */
export default function StickyPanel({ className, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      element.style.setProperty('--panel-h', `${Math.ceil(element.offsetHeight)}px`);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'lg:sticky lg:top-[min(calc(var(--header-offset)+1.5rem),calc(100svh-var(--panel-h,0px)-1.5rem))]',
        'lg:transition-[top] lg:duration-700 lg:ease-luxe motion-reduce:transition-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
