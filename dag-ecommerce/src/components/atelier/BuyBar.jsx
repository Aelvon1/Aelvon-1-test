import { atelierPrice } from '../../lib/pricing';
import { Button, Price } from '../ui';

/**
 * Pied collant du panneau : le total et l'ajout au panier restent à portée pendant toute la
 * composition. En bas de panneau, il reprend sa place sous le détail du prix, dont il est le total.
 * @param {{ config: object, size: string|null, onAdd: () => void }} props
 */
export default function BuyBar({ config, size, onAdd }) {
  return (
    <div data-atelier-bar className="sticky bottom-0 z-30 border-t border-line bg-bg">
      <div className="mx-auto flex max-w-[36rem] items-center justify-between gap-4 px-[var(--panel-px)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:max-w-none @[34rem]:pb-[max(1rem,env(safe-area-inset-bottom))] @[34rem]:pt-4">
        <p className="min-w-0" aria-live="polite" aria-atomic="true">
          <span className="sr-only">Total&nbsp;: </span>
          <Price amount={atelierPrice(config)} className="block font-display text-[1.75rem] leading-none @[34rem]:text-[2rem]" />
          {/* « Total » n'est écrit que si la place le permet ; la ligne commence alors par la taille, en capitale */}
          <span className="mt-1.5 block truncate text-[0.75rem] leading-tight text-muted first-letter:uppercase">
            <span aria-hidden="true" className="hidden @[34rem]:inline">
              Total ·{' '}
            </span>
            {size ? `taille ${size}\xa0cm` : 'taille à choisir'}
          </span>
        </p>
        {/* « ! » : ces marges remplacent celles du bouton, quel que soit leur ordre dans la feuille de styles */}
        <Button variant="solid" size="md" onClick={onAdd} className="shrink-0 px-4! min-[24rem]:px-6! @[34rem]:px-9!">
          Ajouter au panier
        </Button>
      </div>
    </div>
  );
}
