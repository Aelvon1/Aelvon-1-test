/**
 * Données fictives du banc d'essai de l'interface (`bench.html`) : catalogue de plusieurs
 * dizaines d'objets, miniatures générées (planche de sprites dessinée au canvas 2D) et un objet
 * d'inspection complet (arborescence, fiches, dépendances, étapes). Aucune donnée réelle : ces
 * valeurs servent uniquement à mettre au point la mise en page sans le moteur 3D.
 */
import type {
  CatalogEntry,
  InspectionState,
  PartDependencies,
  PartDynamic,
  PartStatic,
  PartTreeNode,
  StepSummary,
  Thumbnail,
} from '../../core/store';
import { TOOL_ICONS } from '../../inspection/tools/icons';
import type { ToolId } from '../../inspection/tools/ids';

const CATEGORIES = ['Moteurs', 'Électronique', 'Électroménager', 'Horlogerie', 'Outillage', 'Audio'];
const NAMES = [
  'Moteur brushless inrunner',
  'Carte de développement ATELIER-328',
  'Ventilateur de bureau',
  'Réveil mécanique',
  'Perceuse sans fil',
  'Enceinte bibliothèque',
  'Grille-pain deux fentes',
  'Servomoteur de modélisme',
  'Alimentation de laboratoire',
  'Montre à quartz',
  'Moulin à café électrique',
  'Casque audio fermé',
  'Pompe de fontaine',
  'Clavier mécanique',
  'Radio à transistors',
  'Tournevis électrique',
  'Disque dur 3,5 pouces',
  'Horloge murale',
  'Sèche-cheveux compact',
  'Ponceuse orbitale',
  'Amplificateur à lampes',
  'Souris optique',
  'Minuteur de cuisine',
  'Moteur pas à pas NEMA 17',
  'Lampe de bureau articulée',
  'Chargeur USB mural',
  'Compteur de vélo',
  'Mixeur plongeant',
];

/** Catalogue fictif (28 objets) : noms, catégories et métriques variées. */
export function benchCatalog(): CatalogEntry[] {
  return NAMES.map((name, i) => ({
    id: `obj-${i}`,
    name,
    category: CATEGORIES[(i * 7 + 3) % CATEGORIES.length]!,
    difficulty: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    estimatedMinutes: 10 + ((i * 37) % 170),
    description: `${name} : démontage complet, de la coque jusqu’aux composants internes. Objet fictif du banc d’essai de l’interface.`,
    keywords: ['banc', i % 2 ? 'vis' : 'soudure', i % 3 ? 'roulements' : 'circuit imprimé'],
    partCount: 12 + ((i * 53) % 240),
    stepCount: 4 + ((i * 11) % 30),
  }));
}

/**
 * Miniature fictive : un cube coloré qui tourne, dessiné en 24 vues (6 × 4) dans un canvas,
 * converti en URL blob. Reproduit le format de la planche du moteur.
 */
export async function benchThumbnail(hue: number): Promise<Thumbnail> {
  const frames = 24;
  const columns = 6;
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = columns * size;
  canvas.height = Math.ceil(frames / columns) * size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible.');
  const corners: [number, number, number][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y * 0.7, z]);
  const faces = [
    [0, 1, 3, 2],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 3, 7, 5],
  ];
  for (let f = 0; f < frames; f++) {
    const ox = (f % columns) * size;
    const oy = Math.floor(f / columns) * size;
    const a = (f / frames) * Math.PI * 2;
    const proj = corners.map(([x, y, z]) => {
      const rx = x * Math.cos(a) - z * Math.sin(a);
      const rz = x * Math.sin(a) + z * Math.cos(a);
      const ty = y * 0.94 - rz * 0.34;
      const depth = rz * 0.94 + y * 0.34;
      return { x: ox + size / 2 + rx * 48, y: oy + size / 2 - ty * 48, depth };
    });
    const sorted = faces
      .map((face) => ({ face, depth: face.reduce((s, k) => s + proj[k]!.depth, 0) / 4 }))
      .sort((p, q) => p.depth - q.depth);
    sorted.forEach(({ face }, k) => {
      ctx.beginPath();
      face.forEach((c, j) => (j === 0 ? ctx.moveTo(proj[c]!.x, proj[c]!.y) : ctx.lineTo(proj[c]!.x, proj[c]!.y)));
      ctx.closePath();
      ctx.fillStyle = `hsl(${hue} 45% ${28 + k * 7}%)`;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();
      ctx.stroke();
    });
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  if (!blob) throw new Error('Conversion de la planche impossible.');
  return { url: URL.createObjectURL(blob), frames, columns, frameWidth: size, frameHeight: size };
}

interface FakePart {
  id: string;
  name: string;
  parent: string | null;
  kind?: 'part' | 'assembly';
  quantity?: number;
  requires?: string[];
  tool?: ToolId;
  destructive?: boolean;
  base?: boolean;
  tip?: string;
  reference?: string;
}

const PARTS: FakePart[] = [
  { id: 'moteur', name: 'Moteur complet', parent: null, kind: 'assembly', base: true },
  { id: 'cloche', name: 'Flasque avant', parent: 'moteur', kind: 'assembly', requires: ['vis-flasque'] },
  { id: 'vis-flasque', name: 'Vis de flasque M3', parent: 'moteur', quantity: 4, tool: 'hex-key-2.5', reference: 'ISO 4762 M3×6' },
  { id: 'roul-av', name: 'Roulement avant', parent: 'cloche', tool: 'bearing-puller', requires: ['cloche'], reference: '693ZZ' },
  { id: 'circlip', name: 'Circlip d’arbre', parent: 'moteur', tool: 'pliers-circlip', requires: ['cloche'] },
  { id: 'rotor', name: 'Rotor', parent: 'moteur', kind: 'assembly', requires: ['circlip'] },
  { id: 'arbre', name: 'Arbre', parent: 'rotor', base: true, reference: 'Ø 3,175 mm' },
  {
    id: 'aimants',
    name: 'Aimants',
    parent: 'rotor',
    quantity: 4,
    tool: 'hands',
    requires: ['rotor'],
    destructive: true,
    tip: 'Les aimants sont collés : les décoller les fragilise souvent. Un choc les fend net.',
  },
  { id: 'pignon', name: 'Pignon', parent: 'rotor', tool: 'hex-key-1.5', requires: ['rotor'] },
  { id: 'stator', name: 'Stator', parent: 'moteur', kind: 'assembly', requires: ['rotor'] },
  {
    id: 'toles',
    name: 'Tôle',
    parent: 'stator',
    quantity: 142,
    tool: 'arbor-press',
    requires: ['bobinage'],
    reference: 'M270-35A',
    tip: 'Les tôles sont isolées entre elles par un vernis : cela limite les courants de Foucault.',
  },
  { id: 'bobinage', name: 'Bobinage triphasé', parent: 'stator', tool: 'cutter-flush', requires: ['stator'], destructive: true },
  { id: 'hall', name: 'Capteur à effet Hall', parent: 'stator', quantity: 3, tool: 'soldering-iron', requires: ['stator'] },
  { id: 'carter', name: 'Carter', parent: 'moteur', base: true },
  { id: 'fils', name: 'Fil de phase', parent: 'moteur', quantity: 3, tool: 'soldering-iron' },
];

const STEPS: { title: string; description: string; parts: string[] }[] = [
  { title: 'Dessouder les fils de phase', description: 'Chauffer chaque languette et tirer doucement le fil.', parts: ['fils'] },
  { title: 'Dévisser le flasque avant', description: 'Quatre vis BTR M3 en croix, un quart de tour chacune.', parts: ['vis-flasque'] },
  { title: 'Déposer le flasque', description: 'Le flasque se soulève d’un bloc avec son roulement.', parts: ['cloche'] },
  { title: 'Extraire le roulement avant', description: 'Extracteur à griffes : effort progressif.', parts: ['roul-av'] },
  { title: 'Retirer le circlip', description: 'Pince à circlips, bec dans les œillets.', parts: ['circlip'] },
  { title: 'Sortir le rotor', description: 'Les aimants retiennent le rotor : tirer franchement dans l’axe.', parts: ['rotor'] },
  { title: 'Desserrer le pignon', description: 'Vis sans tête de 1,5 mm.', parts: ['pignon'] },
  { title: 'Décoller les aimants', description: 'Opération destructive : colle époxy.', parts: ['aimants'] },
  { title: 'Déposer le stator', description: 'Le paquet de tôles glisse hors du carter.', parts: ['stator'] },
  { title: 'Dessouder les capteurs Hall', description: 'Fer à pointe fine, tresse.', parts: ['hall'] },
  { title: 'Couper le bobinage', description: 'Opération destructive : fil émaillé de 0,3 mm.', parts: ['bobinage'] },
  { title: 'Presser le paquet de tôles', description: 'Presse à main, cale sous le paquet.', parts: ['toles'] },
];

export interface BenchInspection {
  state: InspectionState;
  dependencies: Record<string, PartDependencies>;
}

/** État d'inspection fictif complet (paramètres, arborescence, fiches, étapes). */
export function benchInspection(): BenchInspection {
  const partStatic: Record<string, PartStatic> = {};
  const parts: Record<string, PartDynamic> = {};
  const dependencies: Record<string, PartDependencies> = {};
  for (const p of PARTS) {
    partStatic[p.id] = {
      id: p.id,
      name: p.name,
      parent: p.parent,
      kind: p.kind ?? 'part',
      quantity: p.quantity ?? 1,
      info: {
        role: `Rôle fictif de « ${p.name} » dans l’ensemble (banc d’essai).`,
        material: p.kind === 'assembly' ? 'Assemblage' : 'Acier C45 rectifié',
        dimensions: 'Ø 36 × 50 mm (typique)',
        reference: p.reference,
        tip: p.tip,
        extra: p.id === 'toles' ? [{ label: 'Épaisseur', value: '0,35 mm' }] : undefined,
      },
      removable: !p.base,
      destructive: p.destructive === true,
      toolId: p.tool ?? null,
    };
    parts[p.id] = { removed: false, hidden: false, animating: false };
    dependencies[p.id] = { requires: p.requires ?? [], dependents: [] };
  }
  for (const p of PARTS) for (const r of p.requires ?? []) (dependencies[r]!.dependents as string[]).push(p.id);
  const node = (id: string): PartTreeNode => {
    const p = PARTS.find((x) => x.id === id)!;
    const children = PARTS.filter((x) => x.parent === id).map((x) => node(x.id));
    const quantity =
      p.kind === 'assembly' ? children.reduce((s, c) => s + c.quantity, 0) : (p.quantity ?? 1);
    return { id, name: p.name, kind: p.kind ?? 'part', quantity, children };
  };
  const steps: StepSummary[] = STEPS.map((s, index) => {
    const tool = PARTS.find((p) => p.id === s.parts[0])?.tool ?? 'hands';
    return {
      id: `step-${index}`,
      index,
      title: s.title,
      description: s.description,
      partIds: s.parts,
      toolId: tool,
      toolName: tool === 'hands' ? 'À la main' : `Outil ${tool}`,
      toolIcon: TOOL_ICONS[tool],
      destructive: s.parts.some((id) => PARTS.find((p) => p.id === id)?.destructive),
      status: 'todo',
    };
  });
  const state: InspectionState = {
    objectId: 'obj-0',
    objectName: 'Moteur brushless inrunner',
    params: { format: '3650', kv: 4300, sensors: true },
    paramSchema: [
      {
        key: 'format',
        label: 'Format',
        kind: 'select',
        options: [
          { value: '2848', label: '2848 (Ø 28 × 48 mm)' },
          { value: '3650', label: '3650 (Ø 36 × 50 mm)' },
        ],
      },
      { key: 'kv', label: 'KV', kind: 'number', min: 3000, max: 6000, step: 100, unit: 'tr/min/V' },
      { key: 'sensors', label: 'Capteurs à effet Hall', kind: 'boolean', help: 'Trois capteurs de commutation.' },
    ],
    presets: [
      { id: '3650', label: '3650 capteurs 4300 KV (défaut)', params: { format: '3650', kv: 4300, sensors: true } },
      { id: '2848', label: '2848 sans capteurs 4800 KV', params: { format: '2848', kv: 4800, sensors: false } },
    ],
    tree: [node('moteur')],
    partStatic,
    parts,
    selected: null,
    hoveredId: null,
    mode: 'step',
    steps,
    stepCursor: 0,
    playingStep: null,
    explode: 0,
    labels: false,
    knolling: false,
    xray: false,
    section: { enabled: false, axis: 'x', position: 0.5, flip: false },
    isolatedId: null,
    neutralBackground: false,
    busy: false,
    blocked: null,
    activeToolId: null,
    leftPanelOpen: true,
    rightPanelOpen: true,
    buildProgress: null,
    dependencies,
  };
  return { state, dependencies };
}
