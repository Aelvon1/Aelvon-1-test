/**
 * Commandes : tableau des touches avec les VRAIS libellés de la disposition détectée
 * (`store.keyLabels` : ZQSD en AZERTY, WASD en QWERTY), exploration et inspection.
 */
import { useAppState, useUi } from '../UiContext';
import { Modal } from '../components/Modal';
import { KeyCombo } from '../components/Key';
import { EXPLORATION_CONTROLS, INSPECTION_CONTROLS, type ControlSection } from '../logic/keys';
import { detectLayout } from '../logic/layout';

function Section({ section }: { section: ControlSection }) {
  return (
    <section className="controls-section">
      <h3 className="dymo">{section.title}</h3>
      <dl className="controls-list">
        {section.bindings.map((b) => (
          <div className="controls-row" key={b.label}>
            <dt>{b.label}</dt>
            <dd>
              {b.combos.map((combo, i) => (
                <span key={i} className="controls-alt">
                  {i > 0 && <span className="controls-or">ou</span>}
                  <KeyCombo combo={combo} />
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ControlsPanel() {
  const { store } = useUi();
  const labels = useAppState((s) => s.keyLabels);
  const layout = detectLayout(labels);
  return (
    <Modal
      title="Commandes"
      onClose={() => store.setState({ overlay: 'none' })}
      className="controls-modal"
      badge={<span className="dymo is-black controls-layout">Clavier {layout}</span>}
    >
      <p className="controls-intro">
        Les déplacements suivent la position des touches&nbsp;: la disposition détectée est affichée. Les
        raccourcis de l’établi sont des lettres (X pour éclater, L pour les étiquettes…), identiques sur tous les
        claviers.
      </p>
      <div className="controls-grid">
        <Section section={EXPLORATION_CONTROLS} />
        <Section section={INSPECTION_CONTROLS} />
      </div>
    </Modal>
  );
}
