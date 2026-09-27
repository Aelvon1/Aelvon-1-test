/**
 * Racine de l'interface React, superposée au canvas : écran de la phase courante, panneaux
 * superposés (réglages, commandes), compteur d'images, messages et panneau de debug.
 * Quand un panneau superposé est ouvert, l'écran dessous est inerte (ni focus ni clic).
 */
import { useEffect } from 'react';
import { useAppState } from './UiContext';
import { LoadingScreen } from './screens/LoadingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PauseMenu } from './screens/PauseMenu';
import { InventoryScreen } from './inventory/InventoryScreen';
import { InspectionScreen, TransitionScreen } from './inspection/InspectionScreen';
import { Hud } from './hud/Hud';
import { FpsCounter, Toasts } from './hud/Toasts';
import { SettingsPanel } from './overlays/SettingsPanel';
import { ControlsPanel } from './overlays/ControlsPanel';
import { DebugPanel } from './debug/DebugPanel';

export function UiRoot() {
  const phase = useAppState((s) => s.phase);
  const overlay = useAppState((s) => s.overlay);
  const debugOpen = useAppState((s) => s.debugOpen);
  const textScale = useAppState((s) => s.settings.textScale);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(textScale));
  }, [textScale]);

  return (
    <div className={`ui phase-${phase}${overlay !== 'none' ? ' has-overlay' : ''}`}>
      <div className="ui-layer" inert={overlay !== 'none'}>
        {phase === 'loading' && <LoadingScreen />}
        {phase === 'home' && <HomeScreen />}
        {phase === 'exploration' && <Hud />}
        {phase === 'paused' && <PauseMenu />}
        {phase === 'inventory' && <InventoryScreen />}
        {phase === 'transition' && <TransitionScreen />}
        {phase === 'inspection' && <InspectionScreen />}
      </div>
      {overlay === 'settings' && <SettingsPanel />}
      {overlay === 'controls' && <ControlsPanel />}
      {phase !== 'loading' && <FpsCounter />}
      <Toasts />
      {debugOpen && <DebugPanel />}
    </div>
  );
}
