import { useEffect, useState } from 'react';
import { Button, Price, cn } from '../ui';

/**
 * Barre d'achat fixe en bas d'écran, sur mobile uniquement. Elle apparaît quand le bouton
 * principal (`anchorRef`) a quitté l'écran par le haut, et s'efface à l'approche du pied de page.
 * @param {{
 *   anchorRef: { current: HTMLElement|null }, name: string, detail?: string, price: number,
 *   label: string, onAction: () => void, disabled?: boolean
 * }} props
 *   detail : ligne sous le nom (coloris, taille) · label : libellé du bouton
 */
export default function StickyBuyBar({ anchorRef, name, detail, price, label, onAction, disabled = false }) {
  const [reached, setReached] = useState(false); // le bouton principal est à l'écran ou au-dessus
  const [inView, setInView] = useState(false); // le bouton principal est à l'écran
  const [atFooter, setAtFooter] = useState(false);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof IntersectionObserver === 'undefined') return undefined;
    // Racine étendue vers le haut : « atteint » reste vrai une fois le bouton dépassé, même après
    // un saut de défilement (ancre, retour arrière) qui ne l'aurait jamais fait passer à l'écran.
    const reachObserver = new IntersectionObserver(([entry]) => setReached(entry.isIntersecting), {
      rootMargin: '100000px 0px 0px 0px',
    });
    const viewObserver = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    reachObserver.observe(anchor);
    viewObserver.observe(anchor);

    const footer = document.querySelector('main ~ footer');
    const footerObserver = footer ? new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting)) : null;
    footerObserver?.observe(footer);

    return () => {
      reachObserver.disconnect();
      viewObserver.disconnect();
      footerObserver?.disconnect();
    };
  }, [anchorRef]);

  const visible = reached && !inView && !atFooter;

  return (
    <div
      data-tone-ignore
      data-buy-bar={visible ? 'visible' : 'hidden'}
      inert={!visible}
      className={cn(
        'theme-ivoire fixed inset-x-0 bottom-0 z-40 border-t border-line transition-transform duration-700 ease-luxe motion-reduce:transition-none lg:hidden',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <div className="container-luxe flex items-center justify-between gap-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[1.1875rem] leading-tight">{name}</p>
          <p className="truncate text-[0.75rem] text-muted">
            <Price amount={price} className="font-medium text-fg" />
            {detail ? <span> · {detail}</span> : null}
          </p>
        </div>
        <Button size="sm" variant="solid" onClick={onAction} disabled={disabled} className="shrink-0">
          {label}
        </Button>
      </div>
    </div>
  );
}
