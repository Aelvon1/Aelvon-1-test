/**
 * Écran d'accueil : la salle tourne en fond (caméra d'accueil du moteur), fiche de titre
 * punaisée à gauche, « Entrer » (capture de la souris + démarrage de l'audio, geste utilisateur),
 * réglages, commandes, et mention du rendu (WebGPU ou repli WebGL 2).
 */
import { useAppState, useUi, useUiSound } from '../UiContext';
import { Icon } from '../components/Icon';
import { Key } from '../components/Key';

export function HomeScreen() {
  const { bus, store } = useUi();
  const backend = useAppState((s) => s.renderer.backend);
  const { play, hover } = useUiSound();
  const open = (overlay: 'settings' | 'controls') => {
    play('ui.open');
    store.setState({ overlay });
  };
  return (
    <div className="screen home-screen">
      <div className="home-column">
        <div className="home-card paper">
          <span className="tape top-center is-yellow" aria-hidden="true" />
          <p className="home-kicker dymo is-black">Démonter · comprendre · remonter</p>
          <h1 className="brand-title display">L’Atelier</h1>
          <p className="home-lede">
            Un petit garage, un établi, une lampe loupe. Choisissez un objet dans l’inventaire et démontez-le
            pièce par pièce, jusqu’à la dernière vis.
          </p>
          <nav className="home-actions" aria-label="Menu principal">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              autoFocus
              onMouseEnter={hover}
              onClick={() => bus.emit('app:enter')}
            >
              <Icon name="play" /> Entrer
            </button>
            <div className="home-secondary">
              <button
                type="button"
                className="btn btn-ink"
                onMouseEnter={hover}
                onClick={() => open('settings')}
              >
                <Icon name="gear" /> Réglages
              </button>
              <button
                type="button"
                className="btn btn-ink"
                onMouseEnter={hover}
                onClick={() => open('controls')}
              >
                <Icon name="keyboard" /> Commandes
              </button>
            </div>
          </nav>
          <p className="home-keys">
            <span>
              <Key code="KeyW" />
              <Key code="KeyA" />
              <Key code="KeyS" />
              <Key code="KeyD" /> se déplacer
            </span>
            <span>
              <Key code="KeyE" /> interagir
            </span>
            <span>
              <Key code="Tab" /> inventaire
            </span>
          </p>
          <p className="home-note">La souris sera capturée : appuyez sur Échap pour la libérer.</p>
        </div>
        <p className={`backend-tag ${backend === 'webgpu' ? 'is-webgpu' : 'is-webgl'}`}>
          <span className="backend-led" aria-hidden="true" />
          Rendu&nbsp;: {backend === 'webgpu' ? 'WebGPU' : 'WebGL 2 (repli — WebGPU indisponible)'}
        </p>
      </div>
    </div>
  );
}
