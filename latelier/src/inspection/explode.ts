/**
 * Vue éclatée hiérarchique par étages (module PUR, sans three.js, couvert par les tests).
 *
 * - Étage par défaut d'une pièce = sa profondeur hiérarchique (0 = pièce de premier niveau) ;
 *   `ExplodeSpec.stage` le remplace.
 * - Avec S = étage max + 1, l'étage s se déplace pendant l'intervalle [s/S, (s+1)/S] du taux
 *   global, avec un easing easeInOutCubic : les sous-ensembles s'écartent d'abord, puis leurs
 *   pièces.
 * - Les décalages se composent hiérarchiquement : une pièce suit le décalage de son parent
 *   (c'est le graphe de scène qui réalise cette composition à l'exécution ; `composeOffsets`
 *   la reproduit ici pour les tests et les calculs hors scène).
 */
import type { ExplodeSpec, Vec3 } from '../objects/types';
import { clamp01, easeInOutCubic } from './easing';

/** Données minimales d'une pièce pour le calcul des étages. */
export interface StagedPart {
  id: string;
  parent?: string;
  explode: Pick<ExplodeSpec, 'stage'>;
}

export interface ExplodeStages {
  /** Étage de chaque pièce. */
  stageOf: Map<string, number>;
  /** Nombre d'étages S (= étage max + 1, au moins 1). */
  stageCount: number;
  /** Profondeur hiérarchique de chaque pièce (0 = premier niveau). */
  depthOf: Map<string, number>;
}

/** Calcule la profondeur et l'étage de chaque pièce active. */
export function computeExplodeStages(parts: readonly StagedPart[]): ExplodeStages {
  const byId = new Map(parts.map((p) => [p.id, p] as const));
  const depthOf = new Map<string, number>();
  const depth = (id: string): number => {
    const known = depthOf.get(id);
    if (known !== undefined) return known;
    let d = 0;
    const guard = new Set<string>([id]);
    for (
      let cur = byId.get(id)?.parent;
      cur && byId.has(cur) && !guard.has(cur);
      cur = byId.get(cur)?.parent
    ) {
      guard.add(cur);
      d++;
    }
    depthOf.set(id, d);
    return d;
  };
  const stageOf = new Map<string, number>();
  let max = 0;
  for (const p of parts) {
    const s = p.explode.stage ?? depth(p.id);
    depth(p.id);
    stageOf.set(p.id, s);
    max = Math.max(max, s);
  }
  return { stageOf, stageCount: max + 1, depthOf };
}

/** Taux d'écartement (0..1, easé) d'un étage pour un taux global `rate`. */
export function explodeStageAmount(rate: number, stage: number, stageCount: number): number {
  const S = Math.max(1, stageCount);
  return easeInOutCubic(clamp01(clamp01(rate) * S - stage));
}

/**
 * Direction radiale : perpendiculaire à `axis` (passant par l'origine du parent), orientée de
 * l'axe vers `center` (position de repos de la pièce dans le repère du parent). Repli : +X.
 */
export function radialDirection(center: Vec3, axis: Vec3 = [0, 0, 1]): [number, number, number] {
  const al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const ax = axis[0] / al;
  const ay = axis[1] / al;
  const az = axis[2] / al;
  const dot = center[0] * ax + center[1] * ay + center[2] * az;
  const x = center[0] - ax * dot;
  const y = center[1] - ay * dot;
  const z = center[2] - az * dot;
  const l = Math.hypot(x, y, z);
  if (l < 1e-9) {
    // Pièce centrée sur l'axe : direction perpendiculaire arbitraire mais stable.
    // Produit vectoriel axe × (X ou Y selon l'axe).
    const px = Math.abs(ax) < 0.9 ? 1 : 0;
    const py = 1 - px;
    const cx = -az * py;
    const cy = az * px;
    const cz = ax * py - ay * px;
    const cl = Math.hypot(cx, cy, cz) || 1;
    return [cx / cl, cy / cl, cz / cl];
  }
  return [x / l, y / l, z / l];
}

/** Direction d'éclatement normalisée (repère du parent) d'une pièce. */
export function explodeDirection(spec: ExplodeSpec, restCenter: Vec3): [number, number, number] {
  if (spec.direction === 'radial') return radialDirection(restCenter, spec.radialAxis ?? [0, 0, 1]);
  const [x, y, z] = spec.direction;
  const l = Math.hypot(x, y, z);
  return l < 1e-12 ? [0, 0, 0] : [x / l, y / l, z / l];
}

/**
 * Décalages cumulés (repère de l'objet, sous-ensembles non tournés) de chaque pièce pour un taux
 * global `rate` : décalage propre + décalages de tous ses ancêtres.
 */
export function composeOffsets(
  parts: readonly (StagedPart & { explode: ExplodeSpec; restCenter?: Vec3 })[],
  rate: number,
): Map<string, [number, number, number]> {
  const { stageOf, stageCount } = computeExplodeStages(parts);
  const byId = new Map(parts.map((p) => [p.id, p] as const));
  const own = new Map<string, [number, number, number]>();
  for (const p of parts) {
    const amount = explodeStageAmount(rate, stageOf.get(p.id) ?? 0, stageCount) * p.explode.distance;
    const dir = explodeDirection(p.explode, p.restCenter ?? [0, 0, 0]);
    own.set(p.id, [dir[0] * amount, dir[1] * amount, dir[2] * amount]);
  }
  const total = new Map<string, [number, number, number]>();
  for (const p of parts) {
    const sum: [number, number, number] = [0, 0, 0];
    const guard = new Set<string>();
    for (
      let cur: string | undefined = p.id;
      cur && byId.has(cur) && !guard.has(cur);
      cur = byId.get(cur)?.parent
    ) {
      guard.add(cur);
      const o = own.get(cur)!;
      sum[0] += o[0];
      sum[1] += o[1];
      sum[2] += o[2];
    }
    total.set(p.id, sum);
  }
  return total;
}
