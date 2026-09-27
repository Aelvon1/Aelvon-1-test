/**
 * Panneau de debug (touche ², `store.debugOpen`) : lil-gui monté dans un conteneur de
 * l'interface, détruit proprement à la fermeture. Les mesures sont rafraîchies à chaque
 * publication des statistiques du moteur (2 fois/s), sans `listen()` (qui interroge à chaque image).
 */
import { useEffect, useRef } from 'react';
import GUI from 'lil-gui';
import { useUi } from '../UiContext';
import { QUALITY_LABELS, type QualityPreset } from '../../core/settings';
import type { AppState } from '../../core/store';
import { formatCompact, formatDecimal, formatMs } from '../logic/format';

/** Valeurs affichées (texte, lecture seule). */
interface DebugReadout {
  fps: string;
  frameMs: string;
  drawCalls: string;
  triangles: string;
  pixelRatio: string;
  backend: string;
  quality: string;
  phase: string;
}

function readout(state: AppState): DebugReadout {
  const { stats, renderer, settings } = state;
  return {
    fps: formatDecimal(stats.fps, 1),
    frameMs: formatMs(stats.frameMs),
    drawCalls: formatCompact(stats.drawCalls),
    triangles: formatCompact(stats.triangles),
    pixelRatio: formatDecimal(stats.pixelRatio, 2),
    backend:
      renderer.backend === 'webgpu' ? 'WebGPU' : renderer.backend === 'webgl2' ? 'WebGL 2 (repli)' : 'aucun',
    quality: QUALITY_LABELS[settings.quality],
    phase: state.phase,
  };
}

export function DebugPanel() {
  const { store, bus } = useUi();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const gui = new GUI({ container, title: 'Debug — ²', width: 290 });
    const values = readout(store.getState());

    const perf = gui.addFolder('Performances');
    const controllers = [
      perf.add(values, 'fps').name('Images/s'),
      perf.add(values, 'frameMs').name('Temps/image'),
      perf.add(values, 'drawCalls').name('Appels de dessin'),
      perf.add(values, 'triangles').name('Triangles'),
      perf.add(values, 'pixelRatio').name('Ratio de pixels'),
    ];
    const render = gui.addFolder('Rendu');
    controllers.push(render.add(values, 'backend').name('Backend'), render.add(values, 'phase').name('Phase'));
    for (const c of controllers) c.disable();

    // Qualité et options modifiables (réglages du moteur via le bus).
    const editable = {
      quality: store.getState().settings.quality,
      dynamicResolution: store.getState().settings.dynamicResolution,
      showFps: store.getState().settings.showFps,
    };
    const qualityOptions: Record<string, QualityPreset> = {};
    for (const [key, label] of Object.entries(QUALITY_LABELS)) qualityOptions[label] = key as QualityPreset;
    const quality = render
      .add(editable, 'quality', qualityOptions)
      .name('Qualité')
      .onChange((v: QualityPreset) => bus.emit('settings:update', { quality: v }));
    const dynamic = render
      .add(editable, 'dynamicResolution')
      .name('Résolution dyn.')
      .onChange((v: boolean) => bus.emit('settings:update', { dynamicResolution: v }));
    const fps = render
      .add(editable, 'showFps')
      .name('Compteur i/s')
      .onChange((v: boolean) => bus.emit('settings:update', { showFps: v }));

    const refresh = (state: AppState, previous: AppState) => {
      if (state.stats !== previous.stats || state.renderer !== previous.renderer || state.phase !== previous.phase) {
        Object.assign(values, readout(state));
        for (const c of controllers) c.updateDisplay();
      }
      if (state.settings !== previous.settings) {
        editable.quality = state.settings.quality;
        editable.dynamicResolution = state.settings.dynamicResolution;
        editable.showFps = state.settings.showFps;
        quality.updateDisplay();
        dynamic.updateDisplay();
        fps.updateDisplay();
      }
    };
    const unsubscribe = store.subscribe(refresh);
    return () => {
      unsubscribe();
      gui.destroy();
    };
  }, [store, bus]);

  return <div ref={containerRef} className="debug-panel" aria-label="Panneau de debug" />;
}
