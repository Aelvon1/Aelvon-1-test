/**
 * Présentateur d'outils du mode inspection : branché sur la scène, la caméra, l'audio et l'objet
 * inspecté (sonde de pièces, outils déclarés par l'objet). Dès qu'un objet est construit, les outils de ses étapes sont
 * préconstruits pendant les temps morts (et leurs shaders compilés par anticipation) pour éviter
 * une saccade au premier geste.
 */
import type { AppContext } from '../../core/context';
import type { Assembly } from '../Assembly';
import { AssemblyProbe } from './partProbe';
import { getTool } from './registry';
import { ToolPresenterImpl } from './ToolPresenterImpl';

export function createInspectionToolPresenter(
  ctx: AppContext,
  getAssembly: () => Assembly | null,
): ToolPresenterImpl {
  const { engine } = ctx;
  let unsubscribe: (() => void) | null = null;
  const presenter = new ToolPresenterImpl({
    parent: engine.scene,
    camera: engine.camera,
    build: { materials: ctx.materials, textures: ctx.textures, quality: engine.quality.level },
    audio: ctx.audio,
    probe: new AssemblyProbe(getAssembly),
    // Outils propres à l'objet (`ObjectDef.tools`) d'abord, puis catalogue du moteur.
    resolve: (id) => getAssembly()?.def.tools?.find((t) => t.id === id) ?? getTool(id),
    idle: ctx.idle,
    compiler: engine.renderer,
    scene: engine.scene,
    onDispose: () => unsubscribe?.(),
  });
  unsubscribe = ctx.store.subscribe((state, previous) => {
    const insp = state.inspection;
    if (!insp || insp.buildProgress !== null || insp.steps.length === 0) return;
    const prev = previous.inspection;
    if (prev && prev.objectId === insp.objectId && prev.buildProgress === null && prev.steps.length > 0)
      return;
    const ids = new Set<string>();
    for (const step of insp.steps) if (step.toolId) ids.add(step.toolId);
    for (const part of Object.values(insp.partStatic)) if (part.toolId) ids.add(part.toolId);
    presenter.warmup(ids);
  });
  return presenter;
}
