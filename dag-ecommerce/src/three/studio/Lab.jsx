import { StrictMode, useEffect, useState } from 'react';
import BeltCanvas from '../BeltCanvas.jsx';
import { DEFAULT_BELT, HERO_BELT } from '../../data/atelier';

// ---------------------------------------------------------------------------
// Banc de robustesse (studio.html?lab) : reproduit l'usage réel de <BeltCanvas /> dans une page.
//   - StrictMode (double montage), plusieurs instances simultanées, thèmes noir et ivoire ;
//   - un canvas décoratif (rotation automatique, parallaxe, poster), un canvas interactif,
//     un canvas hors écran en pose déroulée ;
//   - window.__lab : { apis, ready: { hero, atelier, flow }, setShown(bool), setConfig(partial) }.
// ---------------------------------------------------------------------------

const POSTER = `${import.meta.env.BASE_URL}renders/poster-hero.webp`;
const POSTER_ATELIER = `${import.meta.env.BASE_URL}renders/poster-atelier.webp`;

export default function Lab() {
  const [shown, setShown] = useState(true);
  const [config, setConfig] = useState(DEFAULT_BELT);

  useEffect(() => {
    const lab = {
      apis: {},
      ready: {},
      setShown,
      setConfig: (partial) => setConfig((prev) => ({ ...prev, ...partial })),
    };
    window.__lab = lab;
    return () => {
      if (window.__lab === lab) delete window.__lab;
    };
  }, []);

  const onReady = (name) => (api) => {
    if (!window.__lab) return;
    window.__lab.apis[name] = api;
    window.__lab.ready[name] = true;
  };

  return (
    <StrictMode>
      <main className="theme-noir" style={{ minHeight: '100vh' }}>
        <section style={{ position: 'relative', height: '70vh' }}>
          {shown ? (
            <BeltCanvas
              config={HERO_BELT}
              view="hero"
              autoRotate={0.6}
              parallax
              poster={POSTER}
              onReady={onReady('hero')}
              className="absolute inset-0"
              style={{ position: 'absolute', inset: 0 }}
            />
          ) : null}
          <h1 className="text-display" style={{ position: 'absolute', left: 32, bottom: 24, margin: 0, pointerEvents: 'none' }}>
            Banc de robustesse
          </h1>
        </section>

        <section className="theme-ivoire" style={{ padding: 48, display: 'flex', gap: 32, alignItems: 'center' }}>
          <BeltCanvas
            config={config}
            view="full"
            interactive
            poster={POSTER_ATELIER}
            onReady={onReady('atelier')}
            style={{ width: 440, height: 440, flex: 'none' }}
          />
          <p className="text-lead" style={{ maxWidth: '28rem' }}>
            Canvas interactif sur surface ivoire : glisser pour tourner, la molette et les gestes verticaux font
            défiler la page.
          </p>
        </section>

        <section style={{ height: '160vh', display: 'grid', placeItems: 'center' }}>
          <p className="eyebrow">Défiler</p>
        </section>

        <section style={{ position: 'relative', height: '80vh' }}>
          <BeltCanvas
            config={{ ...HERO_BELT, leather: 'noir', buckle: 'poli', monogram: '' }}
            pose="flow"
            view="hero"
            backdrop="noir"
            onReady={onReady('flow')}
            style={{ position: 'absolute', inset: 0 }}
          />
        </section>
      </main>
    </StrictMode>
  );
}
