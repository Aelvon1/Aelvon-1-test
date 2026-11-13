import { useWishlist } from '../../context/WishlistContext';
import Icon from './Icon';
import { useToast } from './toast-context';
import { cn } from './cn';

/**
 * Bouton cœur : ajoute ou retire un produit des favoris (useWishlist) et le confirme par une notification.
 * @param {{ product: { id: number, name: string }, size?: number, announce?: boolean, className?: string }} props
 *   size : taille de l'icône en px (défaut 20 ; la zone tactile reste de 44 px)
 *   announce : affiche une notification (défaut true)
 */
export default function FavoriteButton({ product, size = 20, announce = true, className, ...rest }) {
  const { has, toggle } = useWishlist();
  const toast = useToast();
  const active = has(product.id);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`Ajouter ${product.name} aux favoris`}
      onClick={() => {
        toggle(product.id);
        if (announce) toast(active ? { title: 'Retiré de vos favoris', icon: 'heart' } : { title: 'Ajouté à vos favoris', icon: 'heart-filled' });
      }}
      className={cn(
        'grid size-11 place-items-center transition-colors duration-300',
        active ? 'text-accent' : 'text-fg hover:text-accent',
        className,
      )}
      {...rest}
    >
      <Icon name={active ? 'heart-filled' : 'heart'} size={size} />
    </button>
  );
}
