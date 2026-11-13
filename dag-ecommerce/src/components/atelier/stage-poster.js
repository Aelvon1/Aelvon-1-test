// Image d'attente de la scène 3D : uniquement un rendu qui montre exactement la ceinture en cours.
import { beltConfigKey } from '../../data/atelier';
import { allVariants, findProduct, productImage } from '../../data/products';
import { asset } from '../../lib/assets';
import { cleanConfig, isDefaultLook } from './atelier-state';

/** Pixel transparent : BeltCanvas garde une image d'attente sans montrer une autre ceinture. */
export const BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Rendu existant de `config` pour la surface `tone`, ou null.
 * Sur noir, seul le rendu de la ceinture par défaut est éclairé pour un fond sombre ; sur ivoire,
 * les visuels studio du catalogue (éclairés pour le papier) conviennent quand la composition est
 * exactement celle d'un coloris du catalogue. Un monogramme n'apparaît sur aucun rendu.
 */
export function stagePoster(config, tone) {
  const c = cleanConfig(config);
  if (c.monogram) return null;
  if (tone === 'noir') return isDefaultLook(c) ? asset('renders/poster-atelier.webp') : null;
  const key = beltConfigKey(c);
  const variant = allVariants().find((entry) => beltConfigKey(entry.belt) === key);
  const product = variant ? findProduct(variant.slug) : null;
  return product ? productImage(product, variant.color, 'studio') : null;
}
