import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { beltConfigKey, describeBelt, resolveBeltConfig } from '../data/atelier';

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
 * Précisions d'implémentation :
 *  - La scène (three + React Three Fiber) est chargée à la demande, dans son propre fragment, quand
 *    le conteneur approche de l'écran ; le poster est affiché d'ici là puis fondu vers le canvas.
 *  - WebGL indisponible, contexte refusé ou perdu : le poster reste affiché, sans erreur.
 *  - prefers-reduced-motion : ni rotation automatique, ni parallaxe, ni transition de cadrage. Une
 *    scène purement décorative (non interactive, config inchangée) se contente alors du poster ;
 *    une scène interactive reste explorable.
 *  - Le rendu s'arrête hors écran ou onglet masqué, et ne tourne que lorsque quelque chose bouge.
 *  - Avec un poster, la scène apparaît exactement au cadrage du poster (rendu carré de la même vue,
 *    affiché en « contain ») puis glisse vers le cadrage propre au conteneur : aucun saut au fondu.
 *  - L'éclairage s'accorde au support : backdrop 'ivoire', ou canvas transparent posé sur une surface
 *    claire (.theme-ivoire, variable --bg), reçoit les reflets d'un fond papier ; sinon ambiance sombre.
 *  - api.capture({ size, view = 'full' }) renvoie la ceinture courante sur fond transparent, cadrée
 *    en packshot ; view: 'current' capture exactement ce qui est à l'écran. Renvoie null si la
 *    scène n'est pas disponible.
 */

const BeltScene = lazy(() => import('./scene/BeltScene.jsx'));

const BACKDROPS = {
  none: null,
  noir: 'radial-gradient(120% 95% at 50% 36%, #1d1712 0%, #130f0c 42%, #0b0a09 100%)',
  ivoire: 'radial-gradient(125% 100% at 50% 38%, #f7f2e9 0%, #f1ebe1 48%, #e7dfd1 100%)',
};

const FADE = 'opacity 700ms cubic-bezier(0.22, 1, 0.36, 1)';
const LAYER = { position: 'absolute', inset: 0, width: '100%', height: '100%' };

let webglSupport;
/** WebGL 2 disponible ? (test unique, le contexte d'essai est aussitôt libéré) */
function hasWebGL() {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webglSupport = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

const subscribeMedia = (query) => (notify) => {
  const mq = window.matchMedia?.(query);
  mq?.addEventListener?.('change', notify);
  return () => mq?.removeEventListener?.('change', notify);
};
const subscribeMotion = subscribeMedia('(prefers-reduced-motion: reduce)');
const readMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const subscribeVisibility = (notify) => {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
};
const readVisibility = () => document.visibilityState !== 'hidden';

class SceneBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function BeltCanvas({
  config,
  pose = 'coil',
  view = 'hero',
  interactive = false,
  autoRotate = false,
  parallax = false,
  backdrop = 'none',
  poster,
  className = '',
  style,
  onReady,
}) {
  const [container, setContainer] = useState(null);
  const noObserver = typeof IntersectionObserver === 'undefined';
  const [near, setNear] = useState(noObserver); // le conteneur approche de l'écran : on charge la scène
  const [inView, setInView] = useState(noObserver);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const [failed, setFailed] = useState(false);
  const [supported] = useState(hasWebGL);

  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion, () => false);
  const pageVisible = useSyncExternalStore(subscribeVisibility, readVisibility, () => true);

  const key = beltConfigKey(config);
  const resolved = resolveBeltConfig(config); // peu coûteux ; la scène ne réagit qu'aux changements de `key`
  const [initialKey] = useState(key);

  useEffect(() => {
    if (!container || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const visible = entry.isIntersecting;
          setInView(visible && entry.intersectionRatio > 0);
          if (visible) setNear(true);
        }
      },
      { rootMargin: '300px 0px', threshold: [0, 0.01] },
    );
    io.observe(container);
    return () => io.disconnect();
  }, [container]);

  // Contexte perdu : on repasse au poster ; sans restauration rapide, on y reste.
  useEffect(() => {
    if (!lost) return undefined;
    const timer = setTimeout(() => setFailed(true), 6000);
    return () => clearTimeout(timer);
  }, [lost]);

  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });
  const handleReady = useCallback((api) => readyRef.current?.(api), []);
  const handleFrame = useCallback(() => setReady(true), []);
  const handleLost = useCallback(() => {
    setLost(true);
    setReady(false); // le canvas ne réapparaîtra qu'à la première image après restauration
  }, []);
  const handleRestored = useCallback(() => setLost(false), []);
  const handleError = useCallback(() => setFailed(true), []);

  // Décor seul + moins d'animations : le poster suffit (tant que la config ne change pas).
  const posterOnly = reducedMotion && !interactive && !!poster && key === initialKey;
  const mount = supported && !failed && near && !posterOnly;
  const showCanvas = mount && ready && !lost;
  const state = showCanvas ? 'ready' : mount ? 'loading' : 'poster';

  const positioned = /(^|\s)(absolute|fixed|sticky|relative)(\s|$)/.test(className);
  const background = BACKDROPS[backdrop] ?? null;

  return (
    <div
      ref={setContainer}
      className={`${positioned ? '' : 'relative '}overflow-hidden ${className}`}
      style={{
        ...(background ? { background } : null),
        ...(interactive ? { touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' } : null),
        ...style,
      }}
      data-belt-canvas={state}
      role="img"
      aria-label={`Ceinture DAG — ${describeBelt(config)}`}
    >
      {poster ? (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{ ...LAYER, objectFit: 'contain', opacity: showCanvas ? 0 : 1, transition: FADE, pointerEvents: 'none' }}
        />
      ) : null}
      {mount ? (
        <div style={{ ...LAYER, opacity: showCanvas ? 1 : 0, transition: FADE }}>
          <SceneBoundary onError={handleError}>
            <Suspense fallback={null}>
              <BeltScene
                resolved={resolved}
                configKey={key}
                pose={pose}
                view={view}
                backdrop={backdrop}
                interactive={interactive}
                autoRotate={autoRotate}
                parallax={parallax}
                reducedMotion={reducedMotion}
                intro={!!poster}
                active={(inView || !ready) && pageVisible && !lost}
                target={container}
                onFrame={handleFrame}
                onReady={handleReady}
                onLost={handleLost}
                onRestored={handleRestored}
              />
            </Suspense>
          </SceneBoundary>
        </div>
      ) : null}
    </div>
  );
}
