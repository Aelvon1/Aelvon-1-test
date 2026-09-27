/**
 * Racine de l'interface React, superposée au canvas. Affiche l'écran correspondant à la phase.
 */
import { useEffect } from 'react';
import { useAppState } from './UiContext';
import { LoadingScreen } from './screens/LoadingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PauseMenu } from './screens/PauseMenu';
import { InventoryScreen } from './screens/InventoryScreen';
import { InspectionScreen } from './screens/InspectionScreen';
import { Hud, Toasts } from './hud/Hud';

export function UiRoot() {
  const phase = useAppState((s) => s.phase);
  const textScale = useAppState((s) => s.settings.textScale);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(textScale));
  }, [textScale]);

  return (
    <div className={`ui phase-${phase}`}>
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'home' && <HomeScreen />}
      {phase === 'exploration' && <Hud />}
      {phase === 'paused' && <PauseMenu />}
      {phase === 'inventory' && <InventoryScreen />}
      {phase === 'inspection' && <InspectionScreen />}
      <Toasts />
    </div>
  );
}
