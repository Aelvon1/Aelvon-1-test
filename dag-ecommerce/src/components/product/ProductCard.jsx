import { useState } from 'react';
import { Link } from 'react-router-dom';
import { findColor, productImage } from '../../data/products';
import { Badge, FavoriteButton, Packshot, Price, Swatches, cn } from '../ui';
import { productUrl } from './catalogue';

/**
 * Tuile produit de la boutique, de l'accueil et des favoris.
 *
 * Le visuel repose sur une tuile de studio claire ; au survol il fond vers le gros plan de la
 * boucle. Le nuancier change le visuel de la tuile, et le lien emporte ce choix
 * (« ?couleur=<valeur> »). Toute la tuile est une seule cible de lien — le titre porte le lien,
 * étendu à la tuile — tandis que le cœur et le nuancier restent des contrôles distincts.
 *
 * @param {{
 *   product: object, color?: string, priority?: boolean, className?: string,
 *   headingLevel?: 2|3|4, ratio?: string, onColorChange?: (value: string) => void
 * }} props
 *   product : entrée de data/products.js · color : coloris affiché au départ (défaut : le premier)
 *   priority : charge le visuel sans attendre (tuiles visibles dès l'arrivée sur la page)
 *   headingLevel : niveau du titre (défaut 3) · ratio : rapport de la tuile (défaut « 4 / 5 »)
 *   onColorChange : prévenu quand le visiteur change de coloris
 */
export default function ProductCard({
  product,
  color: initialColor,
  priority = false,
  className,
  headingLevel = 3,
  ratio = '4 / 5',
  onColorChange,
}) {
  const [picked, setPicked] = useState(initialColor);
  const color = findColor(product, picked);
  const Heading = `h${headingLevel}`;
  const hasChoice = product.colors.length > 1;

  const choose = (value) => {
    setPicked(value);
    onColorChange?.(value);
  };

  return (
    <article className={cn('group group/link @container relative flex flex-col', className)}>
      <div className="relative">
        <Packshot
          src={productImage(product, color.value, 'studio')}
          hoverSrc={productImage(product, color.value, 'boucle')}
          alt={`${product.name}, ${color.name}`}
          belt={color.belt}
          ratio={ratio}
          loading={priority ? 'eager' : 'lazy'}
          // le gros plan de la boucle est cadré bord à bord : il remplit la tuile
          className="[&_.packshot-hover]:object-cover"
        >
          {/* étiquette et cœur gardent un fond papier : lisibles aussi sur le gros plan, au survol */}
          {product.badge ? (
            <Badge className="absolute left-2.5 top-2.5 bg-papier @[17rem]:left-4 @[17rem]:top-4">{product.badge}</Badge>
          ) : null}
        </Packshot>
        <FavoriteButton
          product={product}
          className="tone-papier absolute right-0 top-0 isolate z-10 before:absolute before:inset-1 before:-z-10 before:bg-papier/0 before:transition-colors before:duration-700 before:ease-luxe group-hover:before:bg-papier/85 @[17rem]:right-1.5 @[17rem]:top-1.5"
        />
      </div>

      <div className="pt-4 @[17rem]:pt-5">
        <p className="eyebrow text-[0.625rem] text-muted">{product.collection}</p>

        <div className="mt-2 flex flex-col gap-x-6 gap-y-1 @[17rem]:flex-row @[17rem]:items-baseline @[17rem]:justify-between">
          <Heading className="font-display text-[1.375rem] leading-[1.12] @[17rem]:text-[1.625rem]">
            <Link
              to={productUrl(product, color.value)}
              className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-accent"
            >
              <span className="link-underline">{product.name}</span>
            </Link>
          </Heading>
          <Price amount={product.price} className="text-[0.9375rem]" />
        </div>

        {product.tagline ? <p className="mt-1 text-[0.875rem] leading-snug text-muted">{product.tagline}</p> : null}

        <div className="mt-1.5 flex min-h-11 items-center justify-between gap-4">
          {hasChoice ? (
            <Swatches
              className="relative z-10 w-fit"
              size="sm"
              options={product.colors}
              value={color.value}
              onChange={choose}
              label={`Coloris — ${product.name}`}
            />
          ) : null}
          <p
            className={cn(
              'text-[0.8125rem] text-muted',
              hasChoice && 'hidden text-right @[17rem]:block',
            )}
          >
            {color.name}
          </p>
        </div>
      </div>
    </article>
  );
}
