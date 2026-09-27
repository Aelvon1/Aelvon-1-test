/** Inventaire (version socle : liste des objets du registre). */
import { useAppState, useUi } from '../UiContext';

export function InventoryScreen() {
  const { bus } = useUi();
  const catalog = useAppState((s) => s.catalog);
  return (
    <div className="screen inventory-screen">
      <div className="menu-card">
        <h2>Inventaire</h2>
        {catalog.length === 0 && <p className="hint">Aucun objet enregistré.</p>}
        {catalog.map((entry) => (
          <button
            key={entry.id}
            className="btn"
            onClick={() => bus.emit('inventory:select', { objectId: entry.id })}
          >
            {entry.name} — {entry.partCount} pièces
          </button>
        ))}
        <button className="btn" onClick={() => bus.emit('inventory:close')}>
          Fermer
        </button>
      </div>
    </div>
  );
}
