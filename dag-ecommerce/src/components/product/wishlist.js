// Aides de la page des favoris. Les favoris sont une suite d'identifiants enregistrée sur l'appareil :
// elle peut porter un doublon, ou un modèle sorti du catalogue depuis (stockage modifié, ancienne version).
import { findProduct } from '../../data/products';

/** Produits mis de côté, dans l'ordre d'ajout : chaque modèle une seule fois, les identifiants inconnus écartés. */
export function savedProducts(ids) {
  const seen = new Set();
  const list = [];
  for (const id of ids) {
    const product = findProduct(id);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    list.push(product);
  }
  return list;
}

/**
 * Identifiants de `wanted` absents de `current`, chacun une seule fois : ceux qu'il reste à ajouter
 * pour rétablir des favoris sans toucher à ceux qui ont été remis entre-temps.
 */
export function missingIds(wanted, current) {
  return [...new Set(wanted)].filter((id) => !current.includes(id));
}
