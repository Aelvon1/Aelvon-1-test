import { useId } from 'react';
import { describeBelt, getMonogramStyle } from '../../data/atelier';
import { Icon, Price, TextLink } from '../ui';
import { nbspUnits, priceLines } from './atelier-state';

/**
 * Récapitulatif de la composition : description, monogramme, taille, détail du prix. Le total
 * est porté par le pied collant (BuyBar), placé juste dessous.
 * @param {{ config: object, size: string|null, onChooseSize: () => void, onShare: () => void }} props
 *   onChooseSize : ramène aux tailles quand aucune n'est choisie
 */
export default function Summary({ config, size, onChooseSize, onShare }) {
  const titleId = useId();
  const parts = nbspUnits(describeBelt(config)).split(' · ');
  const lines = priceLines(config);

  return (
    <section aria-labelledby={titleId} className="border-t border-line pb-8 pt-7 @[34rem]:pb-10 @[34rem]:pt-9">
      <div className="flex items-center justify-between gap-4">
        <h2 id={titleId} className="font-display text-[1.625rem] leading-none @[34rem]:text-[1.875rem]">
          Votre ceinture
        </h2>
        <TextLink variant="label" onClick={onShare}>
          <span className="flex items-center gap-2.5">
            <Icon name="arrow-up-right" size={16} />
            Partager
          </span>
        </TextLink>
      </div>

      {/* chaque élément reste entier, et son point médian ne passe jamais en début de ligne */}
      <p className="mt-4 font-display text-[1.3125rem] leading-[1.35] lining-nums">
        {parts.map((part, index) => (
          <span key={part} className="inline-block">
            {part}
            {index < parts.length - 1 ? '\xa0·\xa0' : null}
          </span>
        ))}
      </p>

      <ul className="mt-4 flex flex-col gap-1 text-[0.9375rem] leading-relaxed text-muted">
        <li>
          {config.monogram ? (
            <>
              Monogramme <span className="text-fg">{config.monogram}</span>, {getMonogramStyle(config.monogramStyle).name.toLowerCase()}.
            </>
          ) : (
            'Sans monogramme.'
          )}
        </li>
        <li>
          {size ? (
            <>
              Taille <span className="text-fg">{size}&nbsp;cm</span>.
            </>
          ) : (
            <TextLink underline="always" tone="fg" onClick={onChooseSize} className="-my-2.5 min-h-11">
              Taille à choisir
            </TextLink>
          )}
        </li>
      </ul>

      <dl className="mt-7 border-t border-line pt-5 text-[0.9375rem]">
        {lines.map((line) => (
          <div key={line.id} className="flex items-baseline justify-between gap-6 py-1">
            <dt className="text-muted">{line.label}</dt>
            <dd>
              {line.id === 'base' ? null : '+\xa0'}
              <Price amount={line.amount} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
