/**
 * Disposition des étiquettes à traits de rappel (fonctions pures, pixels écran).
 *
 * Étiquettes latérales (vue normale/éclatée) :
 * 1. sélection des meilleures ancres (étiquette épinglée d'abord, puis score décroissant) ;
 * 2. côté gauche/droit selon la position de l'ancre, rééquilibré si une colonne déborde. Le
 *    partage respecte l'ordre des abscisses (toutes les ancres de gauche sont à gauche de celles
 *    de droite) : les traits des deux colonnes occupent des bandes verticales disjointes ;
 * 3. dans chaque colonne, tri par hauteur puis résolution des chevauchements (passes avant/arrière) ;
 * 4. traits de rappel en deux segments : horizontal jusqu'à un « rail » vertical commun à la
 *    colonne, puis droit vers l'ancre. Les départs étant alignés sur le rail, tout croisement est
 *    supprimé en échangeant les créneaux des deux étiquettes (chaque échange raccourcit
 *    strictement la longueur totale : la boucle se termine) ;
 * 5. contrôle final GLOBAL : aucun trait ne croise un autre trait ni ne traverse une étiquette
 *    (la sienne comprise : ancre cachée sous la colonne), aucune étiquette n'en chevauche une
 *    autre (zone étroite). Tant qu'un conflit subsiste, l'étiquette la moins bien classée qui y
 *    participe est écartée (jamais l'étiquette épinglée) et la disposition est recalculée, en
 *    puisant dans les candidates suivantes.
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
    .sort(byImportance);
  const quota = Math.min(o.maxCount, capacity * 2);
  const dropped = new Set<string>();
  const byId = new Map(sorted.map((c) => [c.id, c] as const));
  // Chaque tour écarte au plus une candidate : au pire autant de tours que de candidates.
  for (let round = 0; round <= sorted.length; round++) {
    const chosen: LabelCandidate[] = [];
    for (const c of sorted) {
      if (chosen.length >= quota) break;
      if (!dropped.has(c.id)) chosen.push(c);
    }
    const placed = placeColumns(chosen, area, o, capacity);
    const loser = worstConflict(placed, byId, o.height);
    if (loser === null) return placed;
    dropped.add(loser);
  }
  return [];
}

const byImportance = (a: LabelCandidate, b: LabelCandidate): number =>
  Number(b.pinned === true) - Number(a.pinned === true) || b.score - a.score;

/** Répartition gauche/droite (ordre des abscisses conservé), capacité, puis placement. */
function placeColumns(
  chosen: readonly LabelCandidate[],
  area: LabelArea,
  o: LabelLayoutOptions,
  capacity: number,
): PlacedLabel[] {
  const centerX = (area.left + area.right) / 2;
  let left = chosen.filter((c) => c.anchorX < centerX);
  let right = chosen.filter((c) => c.anchorX >= centerX);
  // Rééquilibrage : les ancres les plus proches du centre changent de colonne (l'ordre des
  // abscisses entre colonnes est conservé).
  const rebalance = (from: LabelCandidate[], to: LabelCandidate[], towardRight: boolean): void => {
    while (from.length > capacity && to.length < capacity) {
      from.sort((a, b) => (towardRight ? a.anchorX - b.anchorX : b.anchorX - a.anchorX));
      to.push(from.pop()!);
    }
  };
  rebalance(left, right, true);
  rebalance(right, left, false);
  // Colonnes encore pleines : les moins bien classées sont abandonnées.
  const trim = (list: LabelCandidate[]) => list.sort(byImportance).slice(0, capacity);
  left = trim(left);
  right = trim(right);
  // Étiquette épinglée dont l'ancre est cachée sous sa propre colonne : elle passe de l'autre
  // côté (les étiquettes qu'elle gênerait y seront écartées par le contrôle global). Les autres
  // ancres dans ce cas sont simplement écartées par ce contrôle.
  const railLeft = area.left + o.margin + widest(left) + o.railGap;
  const railRight = area.right - o.margin - widest(right) - o.railGap;
  const moveLeft = right.filter((c) => c.pinned === true && c.anchorX > railRight);
  const moveRight = left.filter((c) => c.pinned === true && c.anchorX < railLeft);
  if (moveLeft.length || moveRight.length) {
    left = trim([...left.filter((c) => !moveRight.includes(c)), ...moveLeft]);
    right = trim([...right.filter((c) => !moveLeft.includes(c)), ...moveRight]);
  }
  return [...placeColumn(left, 'left', area, o), ...placeColumn(right, 'right', area, o)];
}

const widest = (items: readonly LabelCandidate[]): number => items.reduce((m, c) => Math.max(m, c.width), 0);

/**
 * Conflit le plus « coûteux » à résoudre : identifiant de l'étiquette la moins bien classée (non
 * épinglée) participant à un conflit, ou null si la disposition est propre (les conflits entre
 * étiquettes épinglées seules sont tolérés : rien ne peut être écarté).
 */
function worstConflict(
  placed: readonly PlacedLabel[],
  byId: ReadonlyMap<string, LabelCandidate>,
  height: number,
): string | null {
  let loser: LabelCandidate | null = null;
  const consider = (c: LabelCandidate | undefined): void => {
    if (!c || c.pinned === true) return;
    if (!loser || c.score < loser.score) loser = c;
  };
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    if (leaderHitsLabel(p, p, height, true)) consider(byId.get(p.id));
    for (let j = i + 1; j < placed.length; j++) {
      const q = placed[j]!;
      if (!labelsConflict(p, q, height)) continue;
      const a = byId.get(p.id);
      const b = byId.get(q.id);
      if (a?.pinned === true) consider(b);
      else if (b?.pinned === true) consider(a);
      else consider(a && b ? (a.score <= b.score ? a : b) : (a ?? b));
    }
  }
  return (loser as LabelCandidate | null)?.id ?? null;
}

/** Deux étiquettes placées sont-elles en conflit (traits croisés, trait sur étiquette, chevauchement) ? */
export function labelsConflict(p: PlacedLabel, q: PlacedLabel, height: number): boolean {
  // Chevauchement des étiquettes (colonnes qui se rejoignent dans une zone étroite).
  if (p.x < q.x + q.width && p.x + p.width > q.x && p.y < q.y + height && p.y + height > q.y) return true;
  // Traits : segment horizontal (bord → rail) et segment oblique (rail → ancre).
  if (
    segmentsCross(p.startX, p.startY, p.railX, p.startY, q.startX, q.startY, q.railX, q.startY) ||
    segmentsCross(p.startX, p.startY, p.railX, p.startY, q.railX, q.startY, q.anchorX, q.anchorY) ||
    segmentsCross(p.railX, p.startY, p.anchorX, p.anchorY, q.startX, q.startY, q.railX, q.startY) ||
    segmentsCross(p.railX, p.startY, p.anchorX, p.anchorY, q.railX, q.startY, q.anchorX, q.anchorY)
  )
    return true;
  return leaderHitsLabel(p, q, height, false) || leaderHitsLabel(q, p, height, false);
}

/**
 * Le trait de `p` traverse-t-il l'étiquette `q` ? (`self` : `q` est l'étiquette de `p`, seul le
 * segment oblique compte ; le segment horizontal part de son bord.)
 */
function leaderHitsLabel(p: PlacedLabel, q: PlacedLabel, height: number, self: boolean): boolean {
  // Rectangle légèrement réduit : un trait qui effleure le bord n'est pas un conflit.
  const l = q.x + 1;
  const t = q.y + 1;
  const r = q.x + q.width - 1;
  const b = q.y + height - 1;
  if (segmentHitsRect(p.railX, p.startY, p.anchorX, p.anchorY, l, t, r, b)) return true;
  return !self && segmentHitsRect(p.startX, p.startY, p.railX, p.startY, l, t, r, b);
}

/** Le segment [p1, p2] a-t-il un point dans le rectangle (bords compris) ? (Liang–Barsky) */
export function segmentHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  if (right < left || bottom < top) return false;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  // Quatre demi-plans : x ≥ left, x ≤ right, y ≥ top, y ≤ bottom (p·t ≤ q).
  for (let k = 0; k < 4; k++) {
    const p = k === 0 ? -dx : k === 1 ? dx : k === 2 ? -dy : dy;
    const q = k === 0 ? x1 - left : k === 1 ? right - x1 : k === 2 ? y1 - top : bottom - y1;
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1;
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
