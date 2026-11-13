import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, Color, setConsoleFunction, SRGBColorSpace } from 'three';
import { BeltRig } from './rig';

// ---------------------------------------------------------------------------
// Scène temps réel (chargée à la demande par BeltCanvas, dans son propre fragment).
// React Three Fiber fournit le canvas, le redimensionnement et la boucle « à la demande » ;
// la ceinture elle-même est pilotée par BeltRig.
// ---------------------------------------------------------------------------

const PIXEL_BUDGET = 2.4e6; // pixels rendus au maximum (GPU intégrés)

// Fluidité : au-delà de ces durées moyennes par image, la scène s'allège, puis cède la place au poster.
const SLOW_FRAME = 40; // ms : densité de pixels ramenée à 1, puis plus de mouvement continu
const STALLED_FRAME = 120; // ms : scène décorative → poster
const WATCH_WINDOW = 20; // images consécutives

// Deux avis de three sont écartés, tout le reste passe normalement :
//  - React Three Fiber 9 instancie encore THREE.Clock, déprécié depuis three r183 (hors de notre portée) ;
//  - au démontage, R3F force la perte du contexte : s'il est déjà perdu, l'extension n'existe plus.
setConsoleFunction((type, message, ...rest) => {
  if (type === 'warn' && typeof message === 'string') {
    if (message.startsWith('THREE.Clock:') || message.includes('WEBGL_lose_context extension not supported')) return;
  }
  const trace = rest[0];
  if (trace && trace.isStackTrace) console[type](trace.getError(message));
  else console[type](message, ...rest);
});

/** La surface derrière le canvas est-elle claire ? (couleur sémantique --bg du thème englobant) */
function isLightSurface(element) {
  try {
    const value = getComputedStyle(element).getPropertyValue('--bg').trim();
    if (!value) return false;
    const c = new Color(value);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.3;
  } catch {
    return false;
  }
}

function Driver({ resolved, configKey, pose, view, backdrop, interactive, autoRotate, parallax, reducedMotion, intro, lowPower, watchdog, active, target, onDpr, onFrame, onReady, onLost, onRestored, onSluggish }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);

  const rigRef = useRef(null);
  const framed = useRef(false);
  const [capped, setCapped] = useState(false); // le chien de garde a ramené la densité de pixels à 1
  const watch = useRef({ last: 0, live: false, sum: 0, peak: 0, count: 0, stalls: 0, skip: 10, stage: 0 });
  const [generation, setGeneration] = useState(0); // +1 à chaque restauration du contexte WebGL
  const latest = useRef({});
  useEffect(() => {
    latest.current = { resolved, pose, view, interactive, autoRotate, parallax, reducedMotion, intro, lowPower, watchdog, onFrame, onReady, onLost, onRestored, onSluggish, size };
  });

  // Création / destruction de la ceinture (supporte le double montage du StrictMode).
  useEffect(() => {
    const rig = new BeltRig({ renderer: gl, scene, camera, invalidate });
    rigRef.current = rig;
    framed.current = false;
    const now = latest.current;
    rig.setOptions({
      interactive: now.interactive,
      autoRotate: now.autoRotate,
      parallax: now.parallax,
      reducedMotion: now.reducedMotion,
      intro: now.intro,
    });
    rig.setStill(!!now.lowPower || watch.current.stage >= 2);
    rig.setAspect(now.size.width / Math.max(1, now.size.height));
    rig.setPose(now.pose, true);
    rig.setView(now.view, true);
    let cancelled = false;
    // La police du monogramme n'est attendue que s'il y a un monogramme, et jamais plus de 1,5 s.
    Promise.all([rig.setConfig(now.resolved), rig.prepareFonts(now.resolved.monogram ? 1500 : 0)])
      .then(() => {
        if (cancelled) return;
        rig.ready = true;
        invalidate();
      })
      .catch((error) => {
        if (!cancelled) console.error('[BeltCanvas]', error);
      });

    const canvas = gl.domElement;
    const lost = (event) => {
      event.preventDefault(); // autorise la restauration du contexte
      rig.abandon(); // les ressources GPU ont disparu avec le contexte
      latest.current.onLost?.();
    };
    // Contexte restauré : on reconstruit une ceinture neuve (textures, éclairage, ombre).
    const restored = () => {
      setGeneration((g) => g + 1);
      latest.current.onRestored?.();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      cancelled = true;
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      rig.dispose();
      if (rigRef.current === rig) rigRef.current = null;
    };
  }, [gl, scene, camera, invalidate, generation]);

  // Synchronisation des props
  useEffect(() => {
    rigRef.current?.setConfig(resolved).catch(() => undefined);
    // configKey résume `resolved`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);
  useEffect(() => {
    rigRef.current?.setPose(pose);
  }, [pose]);
  useEffect(() => {
    rigRef.current?.setView(view);
  }, [view]);
  useEffect(() => {
    if (!active) return;
    watch.current.live = false; // reprise après une pause (hors écran, onglet masqué) : l'intervalle ne compte pas
    invalidate();
  }, [active, invalidate]);
  useEffect(() => {
    rigRef.current?.setOptions({ interactive, autoRotate, parallax, reducedMotion });
  }, [interactive, autoRotate, parallax, reducedMotion]);
  useEffect(() => {
    if (lowPower) rigRef.current?.setStill(true);
  }, [lowPower]);

  // Support clair ou sombre : l'éclairage d'ambiance s'y accorde (reflets du papier sur les faces).
  useEffect(() => {
    const light = backdrop === 'ivoire' || (backdrop !== 'noir' && !!target && isLightSurface(target));
    rigRef.current?.setFloor(light ? 1 : 0);
  });

  // Format du conteneur et densité de pixels plafonnée
  useEffect(() => {
    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    rigRef.current?.setAspect(w / h);
    const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    // Le budget de pixels vaut aussi pour un grand canvas à densité 1 (écran 4K) : le plancher est 0,5.
    const limit = lowPower || capped ? 1 : 2;
    onDpr(Math.round(Math.max(0.5, Math.min(device, limit, Math.sqrt(PIXEL_BUDGET / (w * h)))) * 100) / 100);
    invalidate();
  }, [size, onDpr, invalidate, lowPower, capped]);

  // Glisser pour faire tourner ; le défilement vertical de la page reste libre (touch-action: pan-y).
  useEffect(() => {
    if (!target || !interactive) return undefined;
    let id = null;
    let lx = 0;
    let ly = 0;
    let lt = 0;
    const down = (e) => {
      if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      lt = performance.now();
      try {
        target.setPointerCapture(id);
      } catch {
        /* pointeur déjà relâché */
      }
      target.style.cursor = 'grabbing';
      rigRef.current?.dragStart();
    };
    const move = (e) => {
      if (e.pointerId !== id) return;
      const now = performance.now();
      const w = Math.max(1, target.clientWidth);
      rigRef.current?.dragMove((e.clientX - lx) / w, e.pointerType === 'mouse' ? (e.clientY - ly) / w : 0, (now - lt) / 1000);
      lx = e.clientX;
      ly = e.clientY;
      lt = now;
    };
    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      target.style.cursor = 'grab';
      rigRef.current?.dragEnd();
    };
    // Clavier : flèches gauche / droite, une fois le conteneur ciblé.
    const key = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      rigRef.current?.nudge(e.key === 'ArrowLeft' ? -1 : 1);
    };
    target.style.cursor = 'grab';
    target.addEventListener('keydown', key);
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);
    return () => {
      target.removeEventListener('keydown', key);
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      target.removeEventListener('lostpointercapture', up);
      target.style.cursor = '';
      rigRef.current?.dragEnd();
    };
  }, [target, interactive]);

  // Parallaxe : suit le pointeur dans la fenêtre (le canvas est souvent sous d'autres calques).
  useEffect(() => {
    if (!parallax || reducedMotion || typeof window === 'undefined') return undefined;
    const move = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      rigRef.current?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    const leave = () => rigRef.current?.setPointer(0, 0);
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      rigRef.current?.setPointer(0, 0);
    };
  }, [parallax, reducedMotion]);

  // Rendu à la demande : on ne redemande une image que tant que quelque chose bouge.
  useFrame((state, delta) => {
    const rig = rigRef.current;
    if (!rig || !rig.ready) return;
    const moving = rig.update(delta);
    rig.render();
    if (!framed.current) {
      framed.current = true;
      latest.current.onFrame?.();
      latest.current.onReady?.({
        capture: (options) => rigRef.current?.capture(options) ?? null,
        // Réservé au studio : termine immédiatement les transitions et rend l'image.
        settle: () => rigRef.current?.settle() ?? Promise.resolve(),
        features: () => rigRef.current?.features() ?? null,
        flowExcursion: (options) => rigRef.current?.flowExcursion(options) ?? null,
      });
    }

    // Chien de garde : durée moyenne des images qui s'enchaînent (les premières, qui compilent les
    // shaders, sont ignorées, ainsi que la plus longue de chaque série : un à-coup isolé ne compte pas).
    const w = watch.current;
    const now = performance.now();
    const gap = now - w.last;
    const chained = w.live; // l'image précédente en avait demandé une autre
    w.last = now;
    w.live = moving;
    if (latest.current.watchdog && !latest.current.lowPower && w.stage < 3 && chained && gap < 5000) {
      if (w.skip > 0) w.skip--;
      else {
        w.sum += gap;
        w.peak = Math.max(w.peak, gap);
        w.count++;
        if (gap > 5 * STALLED_FRAME) w.stalls++;
        // quatre images de plus d'une demi-seconde : inutile d'attendre la fin de la série
        const stalled = w.stalls >= 4;
        if (w.count >= WATCH_WINDOW || stalled) {
          const mean = stalled ? Infinity : (w.sum - w.peak) / (w.count - 1);
          w.sum = 0;
          w.peak = 0;
          w.count = 0;
          w.stalls = 0;
          if (mean > STALLED_FRAME && latest.current.onSluggish) {
            w.stage = 3;
            latest.current.onSluggish(); // scène décorative : le poster prend le relais
          } else if (mean > SLOW_FRAME) {
            w.stage++;
            w.skip = 6;
            if (w.stage === 1 && !stalled) setCapped(true);
            else {
              w.stage = 3;
              rig.setStill(true); // plus de mouvement continu : la scène ne rend que sur demande
            }
          }
        }
      }
    } else if (!chained) {
      w.sum = 0;
      w.peak = 0;
      w.count = 0;
    }
    if (moving) state.invalidate();
  }, 1);

  return null;
}

export default function BeltScene({ active = true, lowPower = false, onGone, ...props }) {
  const [dpr, setDpr] = useState(1);
  // Démontage (moins d'animations, rendu trop lent, perte de contexte) : le conteneur repasse au poster.
  useEffect(() => () => onGone?.(), [onGone]);
  return (
    <Canvas
      frameloop={active ? 'demand' : 'never'}
      events={null}
      dpr={dpr}
      gl={{ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' }}
      camera={{ manual: true, fov: 30, near: 5, far: 4000, position: [0, 80, 420] }}
      resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping;
        gl.toneMappingExposure = 1;
        gl.outputColorSpace = SRGBColorSpace;
        gl.setClearColor(0x000000, 0);
      }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <Driver {...props} lowPower={lowPower} active={active} onDpr={setDpr} />
    </Canvas>
  );
}
