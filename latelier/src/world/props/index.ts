/**
 * POINT D'INTÉGRATION des accessoires du décor (agent « accessoires », travaux ultérieurs).
 *
 * `World.build()` appelle `buildProps(ctx, world, progress)` APRÈS la coque, l'établi et les
 * luminaires, et AVANT la capture de la carte d'environnement et le calcul des ombres
 * statiques : tout ce qui est ajouté ici apparaît donc dans les reflets et projette ses ombres.
 *
 * Ce qu'il faut savoir pour implémenter les accessoires (étagères, servante, ventilateur, radio,
 * outils du panneau perforé, calendrier, extincteur, poubelle, tabouret, tapis, table RC…) :
 * - Emplacements : `layout.ts` (SHELVES, TOOL_CART, ELECTRONICS_DESK, RC_TABLE, RUG, SPOTS…).
 *   Panneau perforé : `PEGBOARD` (face avant `z`, trous au pas `holeSpacing`).
 * - Géométrie statique : utiliser `world.createBatch()` puis `world.addStaticMeshes(batch)`
 *   (fusion par matériau → un appel de dessin par matériau), et les formes biseautées de
 *   `world/geometry/shapes.ts` (`addBox`, `roundedBox`, `beveledPlate`, `lathe`, `tubeAlong`…).
 *   Ce qui se répète (vis, maillons, boîtes) : `THREE.InstancedMesh`.
 * - Matériaux : `world.materials.get(id)` accepte les identifiants de la bibliothèque
 *   (`BASE_MATERIAL_IDS`) et ceux du décor (`world.paint.olive`, `world.paint.teal`,
 *   `world.paint.orange`, `world.paint.cream`, `world.paint.creamMetal`, `world.bakelite`…).
 *   Ces derniers écaillent les arêtes grâce à l'attribut `edge` calculé par le lot statique.
 * - Textures : clés préfixées `world/` (ex. `world/props/calendar`), générées dans le worker.
 * - Collisions : `ctx.physics.addStatic(...)` pour tout objet posé au sol ; conserver la
 *   fonction de retrait et l'appeler dans `dispose()`.
 * - Ombres : si un accessoire bouge (pales du ventilateur…), appeler
 *   `world.lighting.invalidateShadows()` quand c'est nécessaire (les cartes de l'ampoule et de la
 *   fenêtre ne sont pas recalculées à chaque image).
 * - Sons : `ctx.audio.loop('fan.motor' | 'radio.music', { position })`, `ctx.audio.play(...)`.
 * - Interactions (touche E) : retourner des `Interactable` (voir `world/types.ts`) dans
 *   `interactables` ; `World` les ajoute à `world.interactables`.
 * - Animation : `update(frame)` est appelé à chaque image par `World.update` (aucune allocation).
 * - Mode inspection neutre : les accessoires ajoutés à `world.propsRoot` sont masqués
 *   automatiquement en fond studio.
 */
import type { AppContext } from '../../core/context';
import type { FrameInfo } from '../../core/Engine';
import type { Interactable } from '../types';
import type { World } from '../World';

export interface PropsHandle {
  /** Animation des accessoires (appelée à chaque image). */
  update(frame: FrameInfo): void;
  /** Éléments interactifs ajoutés par les accessoires. */
  interactables: Interactable[];
  /** Libère géométries, matériaux propres, collisions et sons. */
  dispose(): void;
}

/**
 * Construit les accessoires du décor. Implémentation actuelle : AUCUN accessoire (la salle,
 * l'établi, le tapis, le panneau perforé nu et les luminaires sont fournis par `World`).
 */
export async function buildProps(
  _ctx: AppContext,
  _world: World,
  progress: (value: number, label: string) => void,
): Promise<PropsHandle> {
  progress(1, 'Accessoires');
  return {
    update: () => undefined,
    interactables: [],
    dispose: () => undefined,
  };
}
