/**
 * <BeltCanvas /> — scène 3D temps réel de la ceinture DAG.
 *
 * CONTRAT PUBLIC (les pages n'importent que ce fichier, jamais three.js) :
 *
 *   config        Partial<BeltConfig>  ids du nuancier (voir src/data/atelier.js). Tout changement
 *                                      est appliqué en direct (matériaux, largeur, monogramme…).
 *   pose          'coil' | 'flow'      'coil' : ceinture roulée (packshot) — défaut.
 *                                      'flow' : lanière déroulée en courbe ample (plans cinéma).
 *   view          'hero' | 'full' | 'cuir' | 'couture' | 'boucle' | 'monogramme'
 *                                      cadrage caméra ; passer d'un cadrage à l'autre est animé.
 *   interactive   boolean              glisser pour faire tourner la ceinture (défaut false).
 *   autoRotate    boolean | number     rotation lente continue (nombre = vitesse relative).
 *   parallax      boolean              léger suivi du pointeur (défaut false).
 *   backdrop      'none' | 'noir' | 'ivoire'   fond du canvas ; 'none' = transparent (défaut).
 *   poster        string               image de repli : affichée pendant le chargement, si WebGL
 *                                      est indisponible ou si l'utilisateur préfère moins d'animations.
 *   className, style                   appliqués au conteneur (qui doit avoir une taille).
 *   onReady       (api) => void        api.capture({ size = 512 }) → data URL (webp) du rendu courant.
 *
 * Ce fichier est un gabarit : il n'affiche que le poster. L'implémentation réelle le remplace
 * en conservant exactement cette signature.
 */
export default function BeltCanvas({ poster, className = '', style }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={style} data-belt-canvas="stub">
      {poster ? <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain" /> : null}
    </div>
  );
}
