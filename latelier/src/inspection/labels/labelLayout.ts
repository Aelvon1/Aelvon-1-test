/**
 * Disposition des étiquettes à traits de rappel (fonctions pures, pixels écran).
 *
 * Étiquettes latérales (vue normale/éclatée) :
 * 1. sélection des meilleures ancres (étiquette épinglée d'abord, puis score décroissant) ;
 * 2. côté gauche/droit selon la position de l'ancre, rééquilibré si une colonne déborde ;
 * 3. dans chaque colonne, tri par hauteur puis résolution des chevauchements (passes avant/arrière) ;
 * 4. traits de rappel en deux segments : horizontal jusqu'à un « rail » vertical commun à la
 *    colonne, puis droit vers l'ancre. Les départs étant alignés sur le rail, tout croisement est
 *    supprimé en échangeant les créneaux des deux étiquettes (chaque échange raccourcit
 *    strictement la longueur totale : la boucle se termine).
 *
 * Étiquettes de vue rangée : centrées sous l'ancre, rejetées si elles en chevauchent une autre
 * mieux classée.
 */

export interface LabelCandidate {
  id: string;
  /** Ancre projetée (px). */
  anchorX: number;
  anchorY: number;
  /** Largeur de l'étiquette (px). */
  width: number;
  /** Score (priorité, taille projetée) : plus grand = plus important. */
  score: number;
  /** Toujours affichée si possible (sélection). */
  pinned?: boolean;
}

/** Zone libre de l'écran (px). */
export interface LabelArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelLayoutOptions {
  /** Hauteur d'une étiquette (px). */
  height: number;
  /** Espace vertical minimal entre étiquettes (px). */
  gap: number;
  /** Marge au bord de la zone (px). */
  margin: number;
  /** Écart entre la colonne d'étiquettes et le rail des traits (px). */
  railGap: number;
  maxCount: number;
}

export interface PlacedLabel {
  id: string;
  side: 'left' | 'right';
  /** Coin haut-gauche de l'étiquette (px). */
  x: number;
  y: number;
  width: number;
  /** Rail vertical du trait de rappel (px). */
  railX: number;
  /** Point de départ du trait sur le bord de l'étiquette (px). */
  startX: number;
  startY: number;
  anchorX: number;
  anchorY: number;
}

export const DEFAULT_LABEL_OPTIONS: LabelLayoutOptions = {
  height: 26,
  gap: 6,
  margin: 18,
  railGap: 14,
  maxCount: 12,
};

/** Les segments [p1, p2] et [p3, p4] se croisent-ils (intersection propre) ? */
export function segmentsCross(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): boolean {
  const d1 = orient(x3, y3, x4, y4, x1, y1);
  const d2 = orient(x3, y3, x4, y4, x2, y2);
  const d3 = orient(x1, y1, x2, y2, x3, y3);
  const d4 = orient(x1, y1, x2, y2, x4, y4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/** Nombre de créneaux d'une colonne. */
export function columnCapacity(area: LabelArea, o: LabelLayoutOptions): number {
  const usable = area.bottom - area.top - 2 * o.margin + o.gap;
  return Math.max(0, Math.floor(usable / (o.height + o.gap)));
}

/**
 * Créneaux verticaux (y du haut) d'une colonne, à partir des hauteurs désirées triées :
 * aucun chevauchement, tous dans la zone.
 */
export function resolveColumn(desired: readonly number[], area: LabelArea, o: LabelLayoutOptions): number[] {
  const step = o.height + o.gap;
  const top = area.top + o.margin;
  const bottom = area.bottom - o.margin - o.height;
  const ys = desired.map((y) => Math.min(Math.max(y, top), bottom));
  for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i]!, ys[i - 1]! + step);
  for (let i = ys.length - 1; i >= 0; i--) {
    const limit = i === ys.length - 1 ? bottom : ys[i + 1]! - step;
    ys[i] = Math.min(ys[i]!, limit);
  }
  for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i]!, i === 0 ? top : ys[i - 1]! + step);
  return ys;
}

export function layoutLabels(
  candidates: readonly LabelCandidate[],
  area: LabelArea,
  options: Partial<LabelLayoutOptions> = {},
): PlacedLabel[] {
  const o: LabelLayoutOptions = { ...DEFAULT_LABEL_OPTIONS, ...options };
  const capacity = columnCapacity(area, o);
  if (capacity === 0 || area.right <= area.left) return [];
  const sorted = [...candidates]
    .filter((c) => Number.isFinite(c.anchorX) && Number.isFinite(c.anchorY))
    .sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || b.score - a.score);
  const chosen = sorted.slice(0, Math.min(o.maxCount, capacity * 2));
  const centerX = (area.left + area.right) / 2;
  let left = chosen.filter((c) => c.anchorX < centerX);
  let right = chosen.filter((c) => c.anchorX >= centerX);
  // Rééquilibrage : les ancres les plus proches du centre changent de colonne.
  const rebalance = (from: LabelCandidate[], to: LabelCandidate[], towardRight: boolean): void => {
    while (from.length > capacity && to.length < capacity) {
      from.sort((a, b) => (towardRight ? a.anchorX - b.anchorX : b.anchorX - a.anchorX));
      to.push(from.pop()!);
    }
  };
  rebalance(left, right, true);
  rebalance(right, left, false);
  // Colonnes encore pleines : les moins bien classées sont abandonnées.
  const trim = (list: LabelCandidate[]) =>
    list
      .sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || b.score - a.score)
      .slice(0, capacity);
  left = trim(left);
  right = trim(right);
  return [...placeColumn(left, 'left', area, o), ...placeColumn(right, 'right', area, o)];
}

function placeColumn(
  items: readonly LabelCandidate[],
  side: 'left' | 'right',
  area: LabelArea,
  o: LabelLayoutOptions,
): PlacedLabel[] {
  if (items.length === 0) return [];
  const byY = [...items].sort((a, b) => a.anchorY - b.anchorY);
  const slots = resolveColumn(
    byY.map((c) => c.anchorY - o.height / 2),
    area,
    o,
  );
  const maxWidth = Math.max(...items.map((c) => c.width));
  const railX =
    side === 'left'
      ? area.left + o.margin + maxWidth + o.railGap
      : area.right - o.margin - maxWidth - o.railGap;
  // Affectation créneau ↔ étiquette, puis suppression des croisements par échanges.
  const assign = byY.map((_, i) => i);
  const segment = (item: LabelCandidate, slot: number) =>
    [railX, slot + o.height / 2, item.anchorX, item.anchorY] as const;
  const limit = byY.length * byY.length + 4;
  for (let pass = 0; pass < limit; pass++) {
    let swapped = false;
    for (let i = 0; i < byY.length && !swapped; i++) {
      for (let j = i + 1; j < byY.length && !swapped; j++) {
        const a = segment(byY[i]!, slots[assign[i]!]!);
        const b = segment(byY[j]!, slots[assign[j]!]!);
        if (segmentsCross(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3])) {
          const t = assign[i]!;
          assign[i] = assign[j]!;
          assign[j] = t;
          swapped = true;
        }
      }
    }
    if (!swapped) break;
  }
  return byY.map((c, i) => {
    const y = slots[assign[i]!]!;
    const x = side === 'left' ? area.left + o.margin : area.right - o.margin - c.width;
    return {
      id: c.id,
      side,
      x,
      y,
      width: c.width,
      railX,
      startX: side === 'left' ? x + c.width : x,
      startY: y + o.height / 2,
      anchorX: c.anchorX,
      anchorY: c.anchorY,
    };
  });
}

export interface TagCandidate {
  id: string;
  /** Point d'accroche (px) : l'étiquette est centrée dessous. */
  x: number;
  y: number;
  width: number;
  score: number;
}

export interface PlacedTag {
  id: string;
  x: number;
  y: number;
  width: number;
}

/** Étiquettes de vue rangée : centrées sous leur point, sans chevauchement (glouton par score). */
export function layoutTags(
  candidates: readonly TagCandidate[],
  area: LabelArea,
  height: number,
  padding = 4,
): PlacedTag[] {
  const placed: PlacedTag[] = [];
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  for (const c of sorted) {
    const x = c.x - c.width / 2;
    const y = c.y;
    if (x < area.left || x + c.width > area.right || y < area.top || y + height > area.bottom) continue;
    const overlaps = placed.some(
      (p) =>
        x < p.x + p.width + padding &&
        x + c.width + padding > p.x &&
        y < p.y + height + padding &&
        y + height + padding > p.y,
    );
    if (!overlaps) placed.push({ id: c.id, x, y, width: c.width });
  }
  return placed;
}
