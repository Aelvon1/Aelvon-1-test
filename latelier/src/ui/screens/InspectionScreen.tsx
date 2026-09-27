/** Interface d'inspection (version socle : bouton de retour). */
import { useUi } from '../UiContext';

export function InspectionScreen() {
  const { bus } = useUi();
  return (
    <div className="inspection-ui">
      <button className="btn" onClick={() => bus.emit('inspection:exit')}>
        Retour (Échap)
      </button>
    </div>
  );
}
