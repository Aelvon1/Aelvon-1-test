/**
 * Interface de l'inspection : arborescence, « Bloqué par », frise des étapes, paramètres,
 * touches et planche de sprites (logique pure).
 */
import { describe, expect, it } from 'vitest';
import type { PartDependencies, PartDynamic, PartStatic, PartTreeNode, StepSummary } from '../src/core/store';
import type { ParamSchema } from '../src/objects/types';
import { ancestorsOf, defaultExpanded, filterTree, flattenTree, nodeState } from '../src/ui/logic/tree';
import { removalAvailability } from '../src/ui/logic/blockers';
import { changedParams, matchingPreset, snapParam, stepProgress, stepStatusLabel } from '../src/ui/logic/steps';
import { comboText, EXPLORATION_CONTROLS, INSPECTION_CONTROLS, keyLabelFor } from '../src/ui/logic/keys';
import { detectLayout } from '../src/ui/logic/layout';
import { spriteAnimation, spriteFrameAt } from '../src/ui/logic/sprite';

const node = (id: string, name: string, children: PartTreeNode[] = [], quantity = 1): PartTreeNode => ({
  id,
  name,
  kind: children.length ? 'assembly' : 'part',
  quantity,
  children,
});

// moteur ─┬─ cloche (assemblage) ─┬─ vis ×4
//         │                       └─ roulement avant
//         └─ stator ─── tôles ×142
const TREE: PartTreeNode[] = [
  node('moteur', 'Moteur', [
    node('cloche', 'Cloche', [node('vis', 'Vis de flasque', [], 4), node('roul', 'Roulement avant')]),
    node('stator', 'Stator', [node('toles', 'Tôles', [], 142)]),
  ]),
];

const statics = (entries: [string, string | null, boolean][]): Record<string, PartStatic> =>
  Object.fromEntries(
    entries.map(([id, parent, removable]) => [
      id,
      {
        id,
        name: id,
        parent,
        kind: 'part',
        quantity: 1,
        info: { role: '', material: '', dimensions: '' },
        removable,
        destructive: false,
        toolId: null,
      } satisfies PartStatic,
    ]),
  );

const dyn = (removed: string[] = [], hidden: string[] = []): Record<string, PartDynamic> => {
  const ids = ['moteur', 'cloche', 'vis', 'roul', 'stator', 'toles'];
  return Object.fromEntries(
    ids.map((id) => [id, { removed: removed.includes(id), hidden: hidden.includes(id), animating: false }]),
  );
};

describe('arborescence', () => {
  it('aplatit selon les nœuds dépliés (niveaux, positions ARIA)', () => {
    const rows = flattenTree(TREE, new Set(['moteur']));
    expect(rows.map((r) => [r.node.id, r.depth, r.expanded])).toEqual([
      ['moteur', 0, true],
      ['cloche', 1, false],
      ['stator', 1, false],
    ]);
    expect(rows[1]).toMatchObject({ posInSet: 1, setSize: 2, parentId: 'moteur', hasChildren: true });
    const all = flattenTree(TREE, new Set(['moteur', 'cloche', 'stator']));
    expect(all.map((r) => r.node.id)).toEqual(['moteur', 'cloche', 'vis', 'roul', 'stator', 'toles']);
  });

  it('déplie par défaut la racine et ses sous-ensembles', () => {
    expect([...defaultExpanded(TREE)].sort()).toEqual(['cloche', 'moteur', 'stator']);
  });

  it('filtre par nom sans accents en gardant et dépliant les ancêtres', () => {
    const f = filterTree(TREE, 'toles')!;
    expect(f.matches).toBe(1);
    const rows = flattenTree(TREE, new Set(), f.visible, f.open);
    expect(rows.map((r) => r.node.id)).toEqual(['moteur', 'stator', 'toles']);
    expect(filterTree(TREE, '  ')).toBeNull();
    // Un sous-ensemble trouvé montre tout son contenu.
    const g = filterTree(TREE, 'cloche')!;
    expect([...g.visible].sort()).toEqual(['cloche', 'moteur', 'roul', 'vis']);
  });

  it('remonte les ancêtres d’une pièce', () => {
    const s = statics([
      ['moteur', null, false],
      ['cloche', 'moteur', true],
      ['vis', 'cloche', true],
    ]);
    expect(ancestorsOf(s, 'vis')).toEqual(['cloche', 'moteur']);
    expect(ancestorsOf(s, 'moteur')).toEqual([]);
  });

  it('agrège l’état d’un sous-ensemble (partiellement démonté, masqué)', () => {
    const cloche = TREE[0]!.children[0]!;
    expect(nodeState(cloche, dyn(['vis']))).toMatchObject({ removed: false, partial: true });
    expect(nodeState(cloche, dyn(['cloche']))).toMatchObject({ removed: true, partial: false });
    expect(nodeState(cloche, dyn([], ['cloche']))).toMatchObject({ hidden: true, partial: false });
  });
});

describe('Bloqué par', () => {
  const s = statics([
    ['moteur', null, false],
    ['cloche', 'moteur', true],
    ['vis', 'cloche', true],
    ['roul', 'cloche', true],
    ['stator', 'moteur', true],
    ['toles', 'stator', true],
  ]);
  const deps: Record<string, PartDependencies> = {
    moteur: { requires: [], dependents: [] },
    vis: { requires: [], dependents: ['cloche'] },
    cloche: { requires: ['vis'], dependents: ['roul'] },
    roul: { requires: ['cloche'], dependents: [] },
    stator: { requires: [], dependents: [] },
    toles: { requires: [], dependents: [] },
  };

  it('pièce de base', () => {
    expect(removalAvailability('moteur', s, dyn(), deps)).toEqual({ kind: 'base' });
  });

  it('retrait bloqué puis possible', () => {
    expect(removalAvailability('cloche', s, dyn(), deps)).toEqual({
      kind: 'blocked',
      action: 'remove',
      blockers: ['vis'],
      reinsertFirst: false,
    });
    expect(removalAvailability('cloche', s, dyn(['vis']), deps)).toEqual({ kind: 'ready', action: 'remove' });
  });

  it('remontage : les pièces qui en dépendent doivent être remontées avant', () => {
    expect(removalAvailability('cloche', s, dyn(['vis', 'cloche', 'roul']), deps)).toEqual({
      kind: 'blocked',
      action: 'reinsert',
      blockers: ['roul'],
      reinsertFirst: true,
    });
    expect(removalAvailability('cloche', s, dyn(['vis', 'cloche']), deps)).toEqual({
      kind: 'ready',
      action: 'reinsert',
    });
    // Remonter la vis alors que la cloche est encore retirée : la cloche doit revenir d'abord.
    expect(removalAvailability('vis', s, dyn(['vis', 'cloche']), deps)).toMatchObject({
      kind: 'blocked',
      blockers: ['cloche'],
      reinsertFirst: true,
    });
  });

  it('dépendances non fournies : état inconnu', () => {
    expect(removalAvailability('cloche', s, dyn(), undefined)).toEqual({ kind: 'unknown', action: 'remove' });
  });
});

describe('frise et paramètres', () => {
  const step = (index: number, status: StepSummary['status']): StepSummary => ({
    id: `s${index}`,
    index,
    title: `Étape ${index}`,
    description: '',
    partIds: [],
    toolId: null,
    toolName: null,
    toolIcon: null,
    destructive: false,
    status,
  });

  it('avancement (les étapes commencées comptent pour moitié)', () => {
    const p = stepProgress([step(0, 'done'), step(1, 'partial'), step(2, 'todo'), step(3, 'todo')]);
    expect(p).toEqual({ total: 4, done: 1, partial: 1, ratio: 0.375 });
    expect(stepProgress([]).ratio).toBe(0);
  });

  it('libellés d’état', () => {
    expect(stepStatusLabel(step(2, 'todo'), 2, null)).toBe('prochaine étape');
    expect(stepStatusLabel(step(2, 'todo'), 2, 2)).toBe('en cours');
    expect(stepStatusLabel(step(1, 'done'), 2, null)).toBe('terminée');
    expect(stepStatusLabel(step(3, 'todo'), 2, null)).toBe('à faire');
  });

  const schema: ParamSchema[] = [
    { key: 'kv', label: 'KV', kind: 'number', min: 3000, max: 6000, step: 100 },
    { key: 'sensors', label: 'Capteurs', kind: 'boolean' },
  ];

  it('préréglage correspondant et paramètres modifiés', () => {
    const presets = [
      { id: 'a', label: 'A', params: { kv: 4300, sensors: true } },
      { id: 'b', label: 'B', params: { kv: 4800 } },
    ];
    expect(matchingPreset(presets, { kv: 4800, sensors: true })?.id).toBe('b');
    expect(matchingPreset(presets, { kv: 4300, sensors: true })?.id).toBe('a');
    expect(matchingPreset(presets, { kv: 3000, sensors: false })).toBeNull();
    expect(changedParams(schema, { kv: 4300, sensors: true }, { kv: 4300, sensors: false })).toEqual(['sensors']);
  });

  it('arrondit un paramètre numérique au pas et le borne', () => {
    const kv = schema[0] as Extract<ParamSchema, { kind: 'number' }>;
    expect(snapParam(kv, 4349)).toBe(4300);
    expect(snapParam(kv, 9000)).toBe(6000);
    expect(snapParam({ key: 'e', label: 'e', kind: 'number', min: 0, max: 1, step: 0.1 }, 0.30000000000000004)).toBe(
      0.3,
    );
  });
});

describe('touches et disposition', () => {
  const AZERTY = { KeyW: 'Z', KeyA: 'Q', KeyS: 'S', KeyD: 'D', KeyE: 'E', Backquote: '²' };
  const QWERTY = { KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyE: 'E', Backquote: '`' };

  it('affiche ZQSD en AZERTY et WASD en QWERTY', () => {
    const move = EXPLORATION_CONTROLS.bindings[0]!.combos[0]!;
    expect(comboText(AZERTY, move)).toBe('Z Q S D');
    expect(comboText(QWERTY, move)).toBe('W A S D');
    expect(detectLayout(AZERTY)).toBe('AZERTY');
    expect(detectLayout(QWERTY)).toBe('QWERTY');
    expect(detectLayout({})).toBe('personnalisé');
  });

  it('libellés spéciaux et combinaisons avec modificateur', () => {
    expect(keyLabelFor({}, 'Escape')).toBe('Échap');
    expect(keyLabelFor({}, 'Space')).toBe('Espace');
    expect(keyLabelFor({}, 'KeyK')).toBe('K');
    const showAll = INSPECTION_CONTROLS.bindings.find((b) => b.label === 'Tout afficher')!;
    expect(comboText({}, showAll.combos[0]!)).toBe('Maj + H');
  });
});

describe('planche de sprites', () => {
  it('grille complète 6 × 4 : 24 vues, colonnes puis lignes', () => {
    const a = spriteAnimation({ frames: 24, columns: 6 }, 0.1);
    expect(a).toMatchObject({ columns: 6, rows: 4, sheetRows: 4, frames: 24, rowTravel: 1 });
    expect(a.period).toBeCloseTo(2.4);
    expect(a.rowPeriod).toBeCloseTo(0.6);
    // Vue n (temps n × 0,1 s + ε) = (n mod 6, ⌊n / 6⌋) : même calcul que les deux steps() CSS.
    for (let n = 0; n < 24; n++) {
      expect(spriteFrameAt(a, n * 0.1 + 0.01)).toEqual({ column: n % 6, row: Math.floor(n / 6) });
    }
  });

  it('dernière ligne incomplète ignorée (approximation signalée)', () => {
    const a = spriteAnimation({ frames: 22, columns: 6 }, 0.1);
    expect(a).toMatchObject({ rows: 3, sheetRows: 4, frames: 18 });
    expect(a.rowTravel).toBeCloseTo(0.75);
  });
});
