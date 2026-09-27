/**
 * Banc d'essai de l'interface (développement) : `/src/ui/dev/bench.html?screen=…`.
 *
 * Monte l'interface React réelle SANS le moteur 3D, sur un store et un bus réels, avec un petit
 * simulateur qui répond aux commandes (phases, inventaire, sélection, pas à pas, démontage libre,
 * réglages). Sert à mettre au point la mise en page rapidement (aucun rendu WebGPU).
 *
 * Paramètres : `screen` = loading | home | exploration | pause | settings | controls | inventory |
 * transition | inspection ; `select=<id>` ; `steps=<n>` ; `layout=qwerty` ; `section=1` ; `debug=1`.
 */
import { createAppStore, patchInspection, pushToast, type AppState, type AppStore } from '../../core/store';
import { EventBus } from '../../core/EventBus';
import type { AppEvents } from '../../core/events';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../core/settings';
import { mountUi } from '../mount';
import { benchCatalog, benchInspection, benchThumbnail } from './benchData';
import { removalAvailability } from '../logic/blockers';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'home';

const store: AppStore = createAppStore({ ...DEFAULT_SETTINGS });
const bus = new EventBus<AppEvents>();

const AZERTY: Record<string, string> = {
  KeyW: 'Z',
  KeyA: 'Q',
  KeyS: 'S',
  KeyD: 'D',
  KeyE: 'E',
  KeyC: 'C',
  KeyQ: 'A',
  KeyZ: 'W',
  Backquote: '²',
};
const QWERTY: Record<string, string> = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyE: 'E', KeyC: 'C', Backquote: '`' };

store.setState({
  renderer: { backend: params.get('backend') === 'webgl' ? 'webgl2' : 'webgpu', reversedDepth: true, maxAnisotropy: 16 },
  keyLabels: params.get('layout') === 'qwerty' ? QWERTY : AZERTY,
  catalog: benchCatalog(),
  stats: { fps: 58.7, frameMs: 17, drawCalls: 412, triangles: 1_234_000, pixelRatio: 1 },
  debugOpen: params.get('debug') === '1',
});

const go = (phase: AppState['phase']) => store.setState({ phase });

// --- Simulateur du moteur -------------------------------------------------------------------------

/** Recalcule statuts d'étapes, curseur et blocages après un changement des pièces retirées. */
function syncSteps(): void {
  const insp = store.getState().inspection;
  if (!insp) return;
  const steps = insp.steps.map((s) => {
    const n = s.partIds.filter((id) => insp.parts[id]?.removed).length;
    const status: 'todo' | 'partial' | 'done' = n === 0 ? 'todo' : n === s.partIds.length ? 'done' : 'partial';
    return { ...s, status };
  });
  const cursor = steps.findIndex((s) => s.status !== 'done');
  patchInspection(store, { steps, stepCursor: cursor < 0 ? steps.length : cursor });
}

function setRemoved(ids: readonly string[], removed: boolean): void {
  const insp = store.getState().inspection;
  if (!insp) return;
  const parts = { ...insp.parts };
  for (const id of ids) parts[id] = { ...parts[id]!, removed };
  patchInspection(store, { parts });
  syncSteps();
}

/** Anime une étape (≈ 0,6 s) : `playingStep` et `busy` comme le moteur. */
function playStep(index: number, removed: boolean): void {
  const insp = store.getState().inspection;
  const step = insp?.steps[index];
  if (!insp || !step || insp.busy) return;
  patchInspection(store, { playingStep: index, busy: true, activeToolId: step.toolId });
  setTimeout(() => {
    setRemoved(step.partIds, removed);
    patchInspection(store, { playingStep: null, busy: false, activeToolId: null });
  }, 600);
}

function openInspection(withBuild: boolean): void {
  const fresh = benchInspection().state;
  store.setState({ inspection: { ...fresh, buildProgress: withBuild ? 0 : null } });
  if (!withBuild) return;
  go('transition');
  let p = 0;
  const id = setInterval(() => {
    p += 0.08;
    patchInspection(store, { buildProgress: Math.min(1, p) });
    if (p >= 1) {
      clearInterval(id);
      patchInspection(store, { buildProgress: null });
      go('inspection');
    }
  }, 120);
}

bus.on('app:enter', () => go('exploration'));
bus.on('app:resume', () => {
  store.setState({ overlay: 'none' });
  go('exploration');
});
bus.on('app:home', () => {
  store.setState({ overlay: 'none', inspection: null });
  go('home');
});
bus.on('settings:update', (patch) => store.setState((s) => ({ settings: sanitizeSettings({ ...s.settings, ...patch }) })));
bus.on('settings:reset', () => store.setState({ settings: { ...DEFAULT_SETTINGS } }));
bus.on('ui:sound', (id) => console.info('[banc] son', id));
bus.on('inventory:open', () => go('inventory'));
bus.on('inventory:close', () => go(store.getState().inspection ? 'inspection' : 'exploration'));
bus.on('inventory:select', ({ objectId }) => {
  console.info('[banc] objet choisi', objectId);
  openInspection(true);
});
bus.on('inventory:thumbnails', ({ objectIds }) => {
  // Miniatures produites une à une (comme le moteur, étalées dans le temps).
  objectIds.forEach((id, i) =>
    setTimeout(async () => {
      const thumb = await benchThumbnail((i * 47) % 360);
      store.setState((s) => ({ inventory: { ...s.inventory, thumbnails: { ...s.inventory.thumbnails, [id]: thumb } } }));
    }, 150 * (i + 1)),
  );
});
bus.on('inspection:exit', () => {
  store.setState({ inspection: null });
  go('exploration');
});
bus.on('inspection:mode', ({ mode }) => patchInspection(store, { mode }));
bus.on('inspection:step', (cmd) => {
  const insp = store.getState().inspection;
  if (!insp) return;
  if (cmd.kind === 'next') playStep(insp.stepCursor, true);
  else if (cmd.kind === 'prev') {
    const last = [...insp.steps].reverse().find((s) => s.status !== 'todo');
    if (last) playStep(last.index, false);
  } else {
    insp.steps.forEach((s) => setRemoved(s.partIds, s.index < cmd.index));
  }
});
bus.on('inspection:toggleRemove', ({ partId }) => {
  const insp = store.getState().inspection;
  if (!insp) return;
  const a = removalAvailability(partId, insp.partStatic, insp.parts, insp.dependencies);
  if (a.kind === 'blocked') {
    patchInspection(store, { blocked: { partId, blockers: a.blockers } });
    const names = a.blockers.map((b) => insp.partStatic[b]?.name ?? b).join(', ');
    pushToast(store, `${a.reinsertFirst ? 'Remonter d’abord' : 'Bloqué par'} : ${names}`, 'warning');
    setTimeout(() => patchInspection(store, { blocked: null }), 2500);
    return;
  }
  if (a.kind === 'base') return;
  setRemoved([partId], a.action === 'remove');
});
bus.on('inspection:select', ({ partId, instance }) => {
  const insp = store.getState().inspection;
  if (!insp) return;
  if (!partId) return patchInspection(store, { selected: null });
  const quantity = insp.partStatic[partId]?.quantity ?? 1;
  const inst = instance ?? (quantity > 1 ? Math.min(36, quantity - 1) : null);
  patchInspection(store, {
    selected: {
      partId,
      instance: inst,
      instanceLabel: inst !== null ? `${insp.partStatic[partId]!.name} n° ${inst + 1}` : null,
    },
  });
});
bus.on('inspection:hover', ({ partId }) => patchInspection(store, { hoveredId: partId }));
bus.on('inspection:explode', ({ value }) => patchInspection(store, { explode: value }));
bus.on('inspection:toggleExplode', () =>
  patchInspection(store, { explode: (store.getState().inspection?.explode ?? 0) > 0.5 ? 0 : 1 }),
);
bus.on('inspection:labels', ({ enabled }) => patchInspection(store, { labels: enabled }));
bus.on('inspection:knolling', ({ enabled }) => patchInspection(store, { knolling: enabled }));
bus.on('inspection:xray', ({ enabled }) => patchInspection(store, { xray: enabled }));
bus.on('inspection:neutralBackground', ({ enabled }) => patchInspection(store, { neutralBackground: enabled }));
bus.on('inspection:section', (patch) => {
  const insp = store.getState().inspection;
  if (insp) patchInspection(store, { section: { ...insp.section, ...patch } });
});
bus.on('inspection:panels', ({ left, right }) => {
  const insp = store.getState().inspection;
  if (!insp) return;
  patchInspection(store, { leftPanelOpen: left ?? insp.leftPanelOpen, rightPanelOpen: right ?? insp.rightPanelOpen });
});
bus.on('inspection:isolate', ({ partId }) => patchInspection(store, { isolatedId: partId }));
bus.on('inspection:setHidden', ({ partId, hidden }) => {
  const insp = store.getState().inspection;
  if (insp) patchInspection(store, { parts: { ...insp.parts, [partId]: { ...insp.parts[partId]!, hidden } } });
});
bus.on('inspection:showAll', () => {
  const insp = store.getState().inspection;
  if (!insp) return;
  const parts = Object.fromEntries(Object.entries(insp.parts).map(([k, v]) => [k, { ...v, hidden: false }]));
  patchInspection(store, { parts, isolatedId: null });
});
bus.on('inspection:resetObject', () => {
  const insp = store.getState().inspection;
  if (insp) setRemoved(Object.keys(insp.parts), false);
});
bus.on('inspection:params', ({ params: p }) => {
  const insp = store.getState().inspection;
  if (!insp) return;
  patchInspection(store, { params: p, buildProgress: 0 });
  let v = 0;
  const id = setInterval(() => {
    v += 0.1;
    patchInspection(store, { buildProgress: v >= 1 ? null : v });
    if (v >= 1) clearInterval(id);
  }, 120);
});
bus.on('inspection:frame', (p) => console.info('[banc] cadrage', p));
bus.on('inspection:resetView', () => console.info('[banc] recentrage'));

// Échap / Tab / ² comme le moteur (le garde clavier de l'interface passe avant).
window.addEventListener('keydown', (e) => {
  const s = store.getState();
  if (e.code === 'Backquote') store.setState({ debugOpen: !s.debugOpen });
  if (e.code === 'Escape') {
    if (s.overlay !== 'none') store.setState({ overlay: 'none' });
    else if (s.phase === 'inventory') bus.emit('inventory:close');
    else if (s.phase === 'inspection') bus.emit('inspection:exit');
  }
  if (e.code === 'Tab') {
    e.preventDefault();
    if (s.phase === 'exploration' || s.phase === 'inspection') bus.emit('inventory:open');
    else if (s.phase === 'inventory') bus.emit('inventory:close');
  }
  if (s.phase === 'inspection' && s.overlay === 'none') {
    if (e.code === 'Space' || e.code === 'ArrowRight') bus.emit('inspection:step', { kind: 'next' });
    if (e.code === 'ArrowLeft') bus.emit('inspection:step', { kind: 'prev' });
  }
});

// --- Scénario initial ---------------------------------------------------------------------------

const root = document.getElementById('ui-root');
if (!root) throw new Error('#ui-root manquant.');
mountUi(root, { store, bus });

switch (screen) {
  case 'loading':
    store.setState({ loading: { progress: 0.46, label: 'Génération des textures…', error: null } });
    break;
  case 'error':
    store.setState({
      loading: { progress: 0, label: '', error: 'Impossible de démarrer l’atelier : votre navigateur ne prend en charge ni WebGPU ni WebGL 2.' },
    });
    break;
  case 'home':
  case 'settings':
  case 'controls':
    go('home');
    if (screen !== 'home') store.setState({ overlay: screen });
    break;
  case 'exploration':
    go('exploration');
    store.setState((s) => ({
      hud: { ...s.hud, prompt: 'Allumer la lampe loupe', targetActive: true, clickToResume: params.get('resume') === '1' },
      radio: { on: true, stationLabel: 'Radio Atelier 98.4' },
      settings: { ...s.settings, showFps: true },
    }));
    pushToast(store, 'Définition invalide : exemple de message (voir la console)', 'error', 60000);
    pushToast(store, 'La lampe loupe est allumée.', 'success', 60000);
    break;
  case 'pause':
    go('paused');
    break;
  case 'inventory':
    go('inventory');
    break;
  case 'transition':
    openInspection(true);
    break;
  case 'inspection': {
    openInspection(false);
    go('inspection');
    const steps = Number(params.get('steps') ?? '0');
    const insp = store.getState().inspection!;
    insp.steps.slice(0, steps).forEach((s) => setRemoved(s.partIds, true));
    const sel = params.get('select');
    if (sel) bus.emit('inspection:select', { partId: sel });
    if (params.get('section') === '1') bus.emit('inspection:section', { enabled: true });
    if (params.get('free') === '1') patchInspection(store, { mode: 'free' });
    break;
  }
}

(window as unknown as { __bench: unknown }).__bench = { store, bus };
