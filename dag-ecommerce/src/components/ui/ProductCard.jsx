import { useState } from 'react';
import { Link } from 'react-router-dom';
import { findColor, productImage, productPath } from '../../data/products';
import Badge from './Badge';
import FavoriteButton from './FavoriteButton';
import Packshot from './Packshot';
import Price from './Price';
import Swatches from './Swatches';
import { cn } from './cn';

/**
 * Tuile produit : visuel sur tuile de studio (plan « studio », fondu vers « boucle » au survol),
 * étiquette, favori, nom, accroche, prix et nuancier. Toute la tuile mène à la fiche produit ;
 * si un autre coloris que le premier est choisi, le lien porte « ?coloris=<valeur> ».
 * @param {{
 *   product: object, colorValue?: string, onColorChange?: (value: string) => void,
 *   swatches?: boolean, favorite?: boolean, eager?: boolean, headingLevel?: 2|3|4,
 *   ratio?: string, className?: string
 * }} props
 *   product : entrée de data/products.js · colorValue : coloris affiché (défaut : le premier ;
 *   fourni avec onColorChange, il rend la tuile contrôlée) · eager : charge l'image sans attendre
 *   (tuiles visibles dès l'arrivée) · ratio : rapport de la tuile (défaut « 4 / 5 »)
 */
export default function ProductCard({
  product,
  colorValue,
  onColorChange,
  swatches = true,
  favorite = true,
  eager = false,
  headingLevel = 3,
  ratio = '4 / 5',
  className,
}) {
  const [picked, setPicked] = useState(null);
  const color = findColor(product, picked ?? colorValue);
  const isDefault = color.value === product.colors[0].value;
  const to = isDefault ? productPath(product) : `${productPath(product)}?coloris=${encodeURIComponent(color.value)}`;
  const Heading = `h${headingLevel}`;

  const choose = (value) => {
    setPicked(value);
    onColorChange?.(value);
  };

  return (
    <article className={cn('group relative flex flex-col', className)}>
      <div className="relative">
        <Packshot
          src={productImage(product, color.value, 'studio')}
          hoverSrc={productImage(product, color.value, 'boucle')}
          alt={`${product.name}, ${color.name}`}
          belt={color.belt}
          ratio={ratio}
          loading={eager ? 'eager' : 'lazy'}
        >
          {product.badge ? <Badge className="absolute left-3 top-3">{product.badge}</Badge> : null}
        </Packshot>
        {favorite ? <FavoriteButton product={product} className="tone-papier absolute right-1 top-1 z-10" /> : null}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <Heading className="font-display text-[1.5rem] leading-[1.15]">
          <Link to={to} className="after:absolute after:inset-0 after:content-['']">
            <span className="link-underline">{product.name}</span>
          </Link>
        </Heading>
        <Price amount={product.price} className="text-[0.9375rem]" />
      </div>
      {product.tagline ? <p className="mt-0.5 text-sm text-muted">{product.tagline}</p> : null}

      {swatches && product.colors.length > 1 ? (
        <Swatches
          className="relative z-10 mt-1.5 w-fit"
          size="sm"
          options={product.colors}
          value={color.value}
          onChange={choose}
          label={`Coloris — ${product.name}`}
        />
      ) : (
        <p className="mt-1.5 flex min-h-11 items-center text-[0.8125rem] text-muted">{color.name}</p>
      )}
    </article>
  );
}
