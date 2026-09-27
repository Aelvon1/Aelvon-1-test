/**
 * Graphe de démontage : dépendances entre pièces, règles de retrait/remontage et ordre A → Z.
 *
 * Sémantique :
 * - `requires(P)` = pièces qui BLOQUENT P : elles doivent être retirées avant P. On y ajoute la
 *   règle implicite « une pièce d'un sous-ensemble retirable exige que ce sous-ensemble soit
 *   retiré » (sauf `removal.inPlace`), en remontant au plus proche ancêtre retirable.
 * - Retrait de P autorisé ⇔ P est retirable, en place, et tous ses bloqueurs sont retirés.
 * - Remontage de P autorisé ⇔ P est retirée, tous ses bloqueurs sont encore retirés, et toutes
 *   les pièces qu'elle bloque sont en place (ordre exactement inverse du démontage).
 * - Ordre A → Z : tri topologique des ÉTAPES (une étape S précède T si une pièce de T exige une
 *   pièce de S), départagé par la priorité (plus petite d'abord) puis l'ordre de déclaration.
 *   Dans une étape, les pièces sont animées par couches topologiques.
 *
 * Module pur (sans three.js), couvert par les tests Vitest.
 */
import type { ObjectParams, PartDef, StepDef } from '../objects/types';

/** Étape résolue (A → Z). */
export interface ResolvedStep {
  id: string;
  index: number;
  title: string;
  description: string;
  /** Pièces de l'étape, par couches successives (chaque couche s'anime en parallèle). */
  layers: string[][];
  /** Toutes les pièces de l'étape (ordre des couches). */
  parts: string[];
  toolId: string | null;
  destructive: boolean;
  focus: string[];
  /** Étape générée automatiquement pour une pièce non couverte. */
  auto: boolean;
}

export interface Blockage {
  ok: boolean;
  /** Pièces empêchant l'opération. */
  blockers: string[];
  /** Raison lisible (FR) si refusé. */
  reason?: string;
}

type AnyPart = PartDef<ObjectParams>;

export class DisassemblyGraph {
  private readonly parts = new Map<string, AnyPart>();
  private readonly order = new Map<string, number>();
  private readonly req = new Map<string, string[]>();
  private readonly deps = new Map<string, string[]>();
  private readonly childrenOf = new Map<string, string[]>();
  readonly steps: ResolvedStep[];
  private readonly stepOfPart = new Map<string, number>();

  /**
   * @param parts pièces ACTIVES (variantes déjà filtrées)
   * @param steps étapes actives déclarées
   * @param allIds identifiants de toutes les pièces déclarées (les références vers des pièces
   *               désactivées sont ignorées silencieusement ; les autres inconnues lèvent une erreur)
   */
  constructor(
    parts: readonly AnyPart[],
    steps: readonly StepDef[],
    allIds: ReadonlySet<string> = new Set(parts.map((p) => p.id)),
  ) {
    parts.forEach((p, i) => {
      this.parts.set(p.id, p);
      this.order.set(p.id, i);
    });
    for (const p of parts) {
      if (p.parent) {
        const list = this.childrenOf.get(p.parent) ?? [];
        list.push(p.id);
        this.childrenOf.set(p.parent, list);
      }
    }
    for (const p of parts) this.req.set(p.id, this.computeRequires(p, allIds));
    for (const p of parts) this.deps.set(p.id, []);
    for (const [id, list] of this.req) for (const r of list) this.deps.get(r)?.push(id);
    this.steps = this.buildSteps(steps, allIds);
    this.steps.forEach((s) => s.parts.forEach((p) => this.stepOfPart.set(p, s.index)));
  }

  /** Pièce retirable ? */
  isRemovable(id: string): boolean {
    return this.parts.get(id)?.removal !== undefined;
  }

  has(id: string): boolean {
    return this.parts.has(id);
  }

  part(id: string): AnyPart | undefined {
    return this.parts.get(id);
  }

  /** Bloqueurs résolus (tags développés, règle implicite du parent incluse). */
  requires(id: string): readonly string[] {
    return this.req.get(id) ?? [];
  }

  /** Pièces bloquées par `id` (qui l'exigent). */
  dependents(id: string): readonly string[] {
    return this.deps.get(id) ?? [];
  }

  children(id: string): readonly string[] {
    return this.childrenOf.get(id) ?? [];
  }

  /** Index de l'étape A → Z qui retire cette pièce. */
  stepIndexOf(id: string): number | undefined {
    return this.stepOfPart.get(id);
  }

  canRemove(id: string, removed: ReadonlySet<string>): Blockage {
    const part = this.parts.get(id);
    if (!part) return { ok: false, blockers: [], reason: `Pièce inconnue : ${id}` };
    if (!part.removal)
      return {
        ok: false,
        blockers: [],
        reason: 'Cette pièce est la base de l’objet : elle ne se retire pas.',
      };
    if (removed.has(id)) return { ok: false, blockers: [], reason: 'Pièce déjà retirée.' };
    const blockers = this.requires(id).filter((r) => !removed.has(r));
    return blockers.length ? { ok: false, blockers, reason: 'Bloqué' } : { ok: true, blockers: [] };
  }

  canReinsert(id: string, removed: ReadonlySet<string>): Blockage {
    const part = this.parts.get(id);
    if (!part) return { ok: false, blockers: [], reason: `Pièce inconnue : ${id}` };
    if (!removed.has(id)) return { ok: false, blockers: [], reason: 'Pièce déjà en place.' };
    // Ce qui devait être retiré avant elle doit encore l'être (sinon plus de passage).
    const inPlaceBlockers = this.requires(id).filter((r) => !removed.has(r));
    // Ce qu'elle bloque doit être déjà remonté (on remonte dans l'ordre inverse).
    const missingDependents = this.dependents(id).filter((d) => removed.has(d));
    const blockers = [...inPlaceBlockers, ...missingDependents];
    return blockers.length
      ? { ok: false, blockers, reason: missingDependents.length ? 'Remonter d’abord' : 'Bloqué' }
      : { ok: true, blockers: [] };
  }

  /** Statut d'une étape selon l'ensemble des pièces retirées. */
  stepStatus(index: number, removed: ReadonlySet<string>): 'todo' | 'partial' | 'done' {
    const step = this.steps[index];
    if (!step || step.parts.length === 0) return 'done';
    const n = step.parts.filter((p) => removed.has(p)).length;
    return n === 0 ? 'todo' : n === step.parts.length ? 'done' : 'partial';
  }

  /** Index de la première étape non terminée (= nombre d'étapes si tout est démonté). */
  cursor(removed: ReadonlySet<string>): number {
    const i = this.steps.findIndex((_, k) => this.stepStatus(k, removed) !== 'done');
    return i < 0 ? this.steps.length : i;
  }

  /**
   * Plan de l'étape suivante : couches de pièces à retirer (celles encore en place).
   * Retourne null si tout est démonté.
   */
  planNext(removed: ReadonlySet<string>): { stepIndex: number; layers: string[][] } | null {
    const index = this.cursor(removed);
    const step = this.steps[index];
    if (!step) return null;
    const layers = step.layers
      .map((layer) => layer.filter((p) => !removed.has(p)))
      .filter((l) => l.length > 0);
    return { stepIndex: index, layers };
  }

  /**
   * Plan de l'étape précédente (remontage) : dernière étape ayant des pièces retirées ; couches
   * dans l'ordre inverse. Retourne null si rien n'est démonté.
   */
  planPrev(removed: ReadonlySet<string>): { stepIndex: number; layers: string[][] } | null {
    for (let index = this.steps.length - 1; index >= 0; index--) {
      const step = this.steps[index]!;
      if (!step.parts.some((p) => removed.has(p))) continue;
      const layers = [...step.layers]
        .reverse()
        .map((layer) => layer.filter((p) => removed.has(p)))
        .filter((l) => l.length > 0);
      return { stepIndex: index, layers };
    }
    return null;
  }

  /** Simule le démontage complet A → Z ; retourne l'ordre de retrait (utilisé par les tests). */
  simulateFullDisassembly(): string[] {
    const removed = new Set<string>();
    const sequence: string[] = [];
    for (;;) {
      const plan = this.planNext(removed);
      if (!plan) break;
      for (const layer of plan.layers) {
        for (const id of layer) {
          const check = this.canRemove(id, removed);
          if (!check.ok)
            throw new Error(`Ordre A→Z invalide : « ${id} » bloqué par ${check.blockers.join(', ')}`);
        }
        for (const id of layer) {
          removed.add(id);
          sequence.push(id);
        }
      }
    }
    return sequence;
  }

  // ---------------------------------------------------------------------------------------

  /** Développe une référence (id ou #tag) en identifiants de pièces retirables. */
  expandRef(ref: string, allIds: ReadonlySet<string>, self?: string): string[] {
    if (ref.startsWith('#')) {
      const tag = ref.slice(1);
      return [...this.parts.values()]
        .filter((p) => p.id !== self && p.removal && p.tags?.includes(tag))
        .map((p) => p.id);
    }
    const part = this.parts.get(ref);
    if (!part) {
      if (allIds.has(ref)) return []; // pièce désactivée par les paramètres : ignorée
      throw new Error(`Référence inconnue « ${ref} »${self ? ` (dans ${self})` : ''}.`);
    }
    if (part.removal) return [ref];
    // Sous-ensemble non retirable : on exige ses descendants retirables.
    const out: string[] = [];
    const visit = (id: string) => {
      for (const child of this.childrenOf.get(id) ?? []) {
        if (child === self) continue;
        if (this.parts.get(child)?.removal) out.push(child);
        else visit(child);
      }
    };
    visit(ref);
    return out;
  }

  private computeRequires(p: AnyPart, allIds: ReadonlySet<string>): string[] {
    if (!p.removal) return [];
    const set = new Set<string>();
    for (const ref of p.removal.requires ?? [])
      for (const id of this.expandRef(ref, allIds, p.id)) set.add(id);
    if (!p.removal.inPlace) {
      // Plus proche ancêtre retirable.
      let parentId = p.parent;
      const guard = new Set<string>();
      while (parentId && !guard.has(parentId)) {
        guard.add(parentId);
        const parent = this.parts.get(parentId);
        if (!parent) break;
        if (parent.removal) {
          set.add(parent.id);
          break;
        }
        parentId = parent.parent;
      }
    }
    set.delete(p.id);
    return [...set].sort((a, b) => (this.order.get(a) ?? 0) - (this.order.get(b) ?? 0));
  }

  private buildSteps(declared: readonly StepDef[], allIds: ReadonlySet<string>): ResolvedStep[] {
    interface Draft {
      def: StepDef | null;
      parts: string[];
      priority: number;
      declIndex: number;
    }
    const drafts: Draft[] = [];
    const covered = new Map<string, number>();

    declared.forEach((def, declIndex) => {
      const parts: string[] = [];
      for (const ref of def.parts) {
        for (const id of this.expandRef(ref, allIds)) {
          if (!this.parts.get(id)?.removal) continue;
          if (covered.has(id)) {
            throw new Error(
              `La pièce « ${id} » apparaît dans deux étapes (« ${drafts[covered.get(id)!]?.def?.id} » et « ${def.id} »).`,
            );
          }
          covered.set(id, drafts.length);
          if (!parts.includes(id)) parts.push(id);
        }
      }
      // Étape vide pour ces paramètres (pièces désactivées) : ignorée.
      if (parts.length > 0) drafts.push({ def, parts, priority: def.priority ?? declIndex, declIndex });
    });

    // Étapes automatiques pour les pièces retirables non couvertes.
    let autoIndex = 0;
    for (const part of this.parts.values()) {
      if (!part.removal || covered.has(part.id)) continue;
      covered.set(part.id, drafts.length);
      drafts.push({
        def: null,
        parts: [part.id],
        priority: 10_000 + (this.order.get(part.id) ?? 0),
        declIndex: declared.length + autoIndex++,
      });
    }

    // Graphe des étapes.
    const n = drafts.length;
    const stepOf = new Map<string, number>();
    drafts.forEach((d, i) => d.parts.forEach((p) => stepOf.set(p, i)));
    const succ: Set<number>[] = drafts.map(() => new Set());
    const indeg = new Array<number>(n).fill(0);
    drafts.forEach((d, t) => {
      for (const p of d.parts) {
        for (const r of this.requires(p)) {
          const s = stepOf.get(r);
          if (s === undefined || s === t || succ[s]!.has(t)) continue;
          succ[s]!.add(t);
          indeg[t]!++;
        }
      }
    });

    // Kahn avec file de priorité (priorité, puis ordre de déclaration).
    const ready: number[] = [];
    for (let i = 0; i < n; i++) if (indeg[i] === 0) ready.push(i);
    const cmp = (a: number, b: number) =>
      drafts[a]!.priority - drafts[b]!.priority || drafts[a]!.declIndex - drafts[b]!.declIndex;
    const ordered: number[] = [];
    while (ready.length) {
      ready.sort(cmp);
      const i = ready.shift()!;
      ordered.push(i);
      for (const t of succ[i]!) if (--indeg[t]! === 0) ready.push(t);
    }
    if (ordered.length !== n) {
      const stuck = drafts.filter((_, i) => !ordered.includes(i)).map((d) => d.def?.id ?? d.parts[0]);
      throw new Error(`Cycle entre étapes de démontage : ${stuck.join(', ')}.`);
    }

    return ordered.map((draftIndex, index) => {
      const d = drafts[draftIndex]!;
      const layers = d.def?.parallel ? [d.parts] : this.layerize(d.parts);
      const parts = layers.flat();
      const first = this.parts.get(parts[0]!)!;
      const destructive = d.def?.destructive ?? parts.some((p) => this.parts.get(p)?.removal?.destructive);
      const toolId = d.def?.tool ?? parts.map((p) => this.parts.get(p)?.removal?.tool).find(Boolean) ?? null;
      const focus = d.def?.focus ? d.def.focus.flatMap((ref) => this.safeExpandFocus(ref, allIds)) : parts;
      return {
        id: d.def?.id ?? `auto.${first.id}`,
        index,
        title: d.def?.title ?? `Retirer : ${first.name}`,
        description: d.def?.description ?? first.removal?.gesture ?? `Retirer ${first.name.toLowerCase()}.`,
        layers,
        parts,
        toolId,
        destructive,
        focus,
        auto: d.def === null,
      };
    });
  }

  private safeExpandFocus(ref: string, allIds: ReadonlySet<string>): string[] {
    if (!ref.startsWith('#') && this.parts.has(ref)) return [ref];
    try {
      return this.expandRef(ref, allIds);
    } catch {
      return [];
    }
  }

  /** Couches topologiques des pièces d'une étape selon leurs dépendances internes. */
  private layerize(ids: string[]): string[][] {
    const inStep = new Set(ids);
    const remaining = new Set(ids);
    const layers: string[][] = [];
    while (remaining.size) {
      const layer = [...remaining].filter((id) =>
        this.requires(id).every((r) => !inStep.has(r) || !remaining.has(r)),
      );
      if (layer.length === 0)
        throw new Error(`Cycle de dépendances dans l'étape : ${[...remaining].join(', ')}.`);
      layer.sort((a, b) => (this.order.get(a) ?? 0) - (this.order.get(b) ?? 0));
      for (const id of layer) remaining.delete(id);
      layers.push(layer);
    }
    return layers;
  }
}
