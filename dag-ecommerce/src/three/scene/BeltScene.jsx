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

// React Three Fiber 9 instancie encore THREE.Clock, déprécié depuis three r183 : on écarte ce seul
// avis (hors de notre portée), tout le reste des messages de three passe normalement.
setConsoleFunction((type, message, ...rest) => {
  if (type === 'warn' && typeof message === 'string' && message.startsWith('THREE.Clock:')) return;
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

function Driver({ resolved, configKey, pose, view, backdrop, interactive, autoRotate, parallax, reducedMotion, intro, active, target, onDpr, onFrame, onReady, onLost, onRestored }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);

  const rigRef = useRef(null);
  const framed = useRef(false);
  const [generation, setGeneration] = useState(0); // +1 à chaque restauration du contexte WebGL
  const latest = useRef({});
  useEffect(() => {
    latest.current = { resolved, pose, view, interactive, autoRotate, parallax, reducedMotion, intro, onFrame, onReady, onLost, onRestored, size };
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
    rig.setAspect(now.size.width / Math.max(1, now.size.height));
    rig.setPose(now.pose, true);
    rig.setView(now.view, true);
    let cancelled = false;
    Promise.all([rig.setConfig(now.resolved), rig.prepareFonts()])
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
    if (active) invalidate();
  }, [active, invalidate]);
  useEffect(() => {
    rigRef.current?.setOptions({ interactive, autoRotate, parallax, reducedMotion });
  }, [interactive, autoRotate, parallax, reducedMotion]);

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
    onDpr(Math.round(Math.max(1, Math.min(device, 2, Math.sqrt(PIXEL_BUDGET / (w * h)))) * 100) / 100);
    invalidate();
  }, [size, onDpr, invalidate]);

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
    target.style.cursor = 'grab';
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', up);
    return () => {
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
    const active = rig.update(delta);
    rig.render();
    if (!framed.current) {
      framed.current = true;
      latest.current.onFrame?.();
      latest.current.onReady?.({
        capture: (options) => rigRef.current?.capture(options) ?? null,
        // Réservé au studio : termine immédiatement les transitions et rend l'image.
        settle: () => rigRef.current?.settle() ?? Promise.resolve(),
        features: () => rigRef.current?.features() ?? null,
      });
    }
    if (active) state.invalidate();
  }, 1);

  return null;
}

export default function BeltScene({ active = true, ...props }) {
  const [dpr, setDpr] = useState(1);
  return (
    <Canvas
      frameloop={active ? 'demand' : 'never'}
      events={null}
      dpr={dpr}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
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
      <Driver {...props} active={active} onDpr={setDpr} />
    </Canvas>
  );
}
