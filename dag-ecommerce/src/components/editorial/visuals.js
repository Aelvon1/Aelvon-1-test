// Visuels éditoriaux : uniquement nos rendus 3D (public/renders), décrits à partir du catalogue.
import { findColor, findProduct, productImage } from '../../data/products';

/**
 * Décrit un rendu du catalogue pour une page éditoriale.
 * @param {string} slug        modèle (slug de data/products.js)
 * @param {string} colorValue  coloris du modèle
 * @param {'studio'|'boucle'|'detail'} [shot]
 * @returns {{ product: object, color: object, shot: string, src: string, belt: object, label: string } | null}
 *   label : « DAG Essential, cognac » — sert de légende
 */
export function beltVisual(slug, colorValue, shot = 'studio') {
  const product = findProduct(slug);
  if (!product) return null;
  const color = findColor(product, colorValue);
  return {
    product,
    color,
    shot,
    src: productImage(product, color.value, shot),
    belt: color.belt,
    label: `${product.name}, ${color.name.toLowerCase()}`,
  };
}
