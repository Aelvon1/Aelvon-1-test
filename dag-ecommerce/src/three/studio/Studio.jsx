import { useCallback, useEffect, useRef, useState } from 'react';
import BeltCanvas from '../BeltCanvas.jsx';
import { DEFAULT_BELT, describeBelt, HERO_BELT, normalizeBeltConfig } from '../../data/atelier';
import { allVariants } from '../../data/products';
import { composeOgImage, composeOnBackdrop } from './compose';

// ---------------------------------------------------------------------------
// Studio : banc d'essai de la scène 3D.
//
// Paramètres d'URL
//   pose=coil|flow          view=hero|full|cuir|couture|boucle|monogramme
//   backdrop=none|noir|ivoire
//   leather, finish, buckle, stitch, width, monogram, monogramStyle, lining   (ids de data/atelier.js)
//   preset=hero|default     point de départ (HERO_BELT ou DEFAULT_BELT)
//   size=800 | 1200x630     taille fixe de la scène en px CSS (défaut : toute la fenêtre)
//   bg=e7dfd1               couleur de page derrière le canvas (hex sans #) ; une page claire fait
//                           basculer l'éclairage en « fond papier », comme sur les surfaces ivoire du site
//   interactive=1  autoRotate=1|0.5  parallax=1  ui=0
//
// window.__studio
//   ready                   promesse tenue quand la première image est rendue
//   set(config, options)    applique un BeltConfig partiel et/ou { pose, view, backdrop, size, bg,
//                           interactive, autoRotate, parallax } ; promesse tenue une fois l'image stable
//                           (transitions terminées d'office ; { animate: true } les laisse jouer)
//   capture(options)        { size | width,height, view, pose, type, quality, supersample, backdrop }
//                           → data URL (fond transparent, ou composé sur backdrop 'noir' | 'ivoire' | '#hex')
//   og()                    → data URL JPEG 1200×630 de l'image de partage
//   features()              → positions (mm) et normales des détails : boucle, passant, monogramme, crans, pointe…
//                             utile avec capture({ camera: { position, target, fov } }) pour inspecter un détail
//   variants()              → allVariants() du catalogue
//   state()                 → configuration et options courantes
// ---------------------------------------------------------------------------

const CONFIG_KEYS = ['leather', 'finish', 'buckle', 'stitch', 'width', 'monogram', 'monogramStyle', 'lining'];

function readUrl() {
  const q = new URLSearchParams(window.location.search);
  const base = q.get('preset') === 'default' ? DEFAULT_BELT : HERO_BELT;
  const config = { ...base };
  for (const k of CONFIG_KEYS) {
    if (!q.has(k)) continue;
    const v = q.get(k);
    config[k] = k === 'width' ? Number(v) : k === 'lining' && (v === '' || v === 'null') ? null : v;
  }
  const num = (k) => (q.has(k) ? Number(q.get(k)) || (q.get(k) === 'true' ? 1 : 0) : 0);
  return {
    config: normalizeBeltConfig(config),
    options: {
      pose: q.get('pose') || 'coil',
      view: q.get('view') || 'hero',
      backdrop: q.get('backdrop') || 'none',
      size: q.get('size') || '',
      bg: q.get('bg') || '',
      interactive: !!num('interactive'),
      autoRotate: num('autoRotate'),
      parallax: !!num('parallax'),
      ui: q.get('ui') !== '0',
    },
  };
}

function parseSize(size) {
  if (!size) return null;
  const m = String(size).match(/^(\d+)(?:x(\d+))?$/i);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2] || m[1]) };
}

const frames = (n) =>
  new Promise((resolve) => {
    const tick = (left) => (left <= 0 ? resolve() : requestAnimationFrame(() => tick(left - 1)));
    tick(n);
  });

const initial = typeof window !== 'undefined' ? readUrl() : { config: HERO_BELT, options: {} };

export default function Studio() {
  const [state, setState] = useState(initial);
  const stateRef = useRef(state);
  const apiRef = useRef(null);
  const commits = useRef([]);
  const [ready] = useState(() => {
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    return { promise, resolve };
  });

  useEffect(() => {
    stateRef.current = state;
    const waiting = commits.current;
    commits.current = [];
    waiting.forEach((resolve) => resolve());
  });

  const handleReady = useCallback((api) => {
    apiRef.current = api;
    api.settle().then(() => ready.resolve(true));
  }, [ready]);

  useEffect(() => {
    const whenReady = ready.promise;
    const studio = {
      ready: whenReady,
      async set(config = {}, { animate = false, ...options } = {}) {
        await new Promise((resolve) => {
          commits.current.push(resolve);
          setState((prev) => ({
            config: normalizeBeltConfig({ ...prev.config, ...config }),
            options: { ...prev.options, ...options },
          }));
        });
        await whenReady;
        if (animate) return studio.state(); // laisse jouer les transitions (cadrage, déroulé)
        await frames(3); // laisse le temps au redimensionnement éventuel d'atteindre la scène
        await apiRef.current.settle();
        return studio.state();
      },
      async capture(options = {}) {
        await whenReady;
        const { backdrop, ...rest } = options;
        const url = apiRef.current.capture({ view: stateRef.current.options.view, pose: stateRef.current.options.pose, ...rest });
        if (!url || !backdrop || backdrop === 'none') return url;
        return composeOnBackdrop(url, backdrop, rest.type, rest.quality);
      },
      async og() {
        await whenReady;
        const belt = apiRef.current.capture({ width: 1500, height: 1260, view: 'hero', pose: 'coil', supersample: 1, type: 'image/png' });
        return composeOgImage(belt);
      },
      features: () => apiRef.current?.features() ?? null,
      variants: () => allVariants(),
      state: () => ({ config: stateRef.current.config, options: stateRef.current.options, description: describeBelt(stateRef.current.config) }),
      presets: { hero: HERO_BELT, default: DEFAULT_BELT },
    };
    window.__studio = studio;
    return () => {
      if (window.__studio === studio) delete window.__studio;
    };
  }, [ready]);

  const { config, options } = state;
  const size = parseSize(options.size);
  const page = options.bg ? `#${options.bg.replace(/^#/, '')}` : options.backdrop === 'ivoire' ? '#e7dfd1' : '#0b0a09';

  return (
    <div style={{ minHeight: '100vh', background: page, '--bg': page, display: 'grid', placeItems: 'center', position: 'relative' }}>
      <BeltCanvas
        config={config}
        pose={options.pose}
        view={options.view}
        backdrop={options.backdrop}
        interactive={options.interactive}
        autoRotate={options.autoRotate}
        parallax={options.parallax}
        onReady={handleReady}
        style={size ? { width: size.width, height: size.height } : { width: '100vw', height: '100vh' }}
      />
      {options.ui ? (
        <div
          style={{
            position: 'fixed',
            left: 12,
            bottom: 10,
            font: '500 11px/1.5 "Manrope Variable", system-ui, sans-serif',
            letterSpacing: '0.04em',
            color: page === '#0b0a09' ? 'rgba(241,235,225,0.55)' : 'rgba(23,20,18,0.6)',
            pointerEvents: 'none',
          }}
        >
          {options.pose} · {options.view} · {describeBelt(config)}
          {config.monogram ? ` · « ${config.monogram} » ${config.monogramStyle}` : ''}
        </div>
      ) : null}
    </div>
  );
}
